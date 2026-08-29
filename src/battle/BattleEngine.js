import { createMasterIndex } from '../data/master-loader.js';
import { SeededRng } from '../core/rng.js';
import { assertLegalDeck, determineFirstPlayer, normalizeDeckCards, totalPlayTp } from './deck.js';
import {
  actionKey,
  clone,
  createPlayerState,
  createUnit,
  effectiveAtk,
  effectiveDef,
  findUnit,
  findUnitSlot,
  lifeRatio,
  livingUnits,
  normalizeGrowth,
  projectFusionStats,
} from './state.js';
import {
  applyAtkBuff,
  applyAtkDebuff,
  applyDefBuff,
  applyDefDebuff,
  applyIncomingModifiers,
  combatStats,
  consumeMoveSurcharge,
  defenseIgnore,
  hasNormalTrait,
  outgoingDamageMultiplier,
  resolvedMovePower,
  resolvedMoveTp,
  updateConsecutiveTarget,
} from './effects.js';
import { RULES } from './rules.js';
import { chooseShugyoMove, learnableShugyoMoves } from './shugyo.js';

function opposingId(state, playerId) {
  return state.playerOrder.find((id) => id !== playerId);
}

function cardDefinition(index, card) {
  return index.cards.get(card.masterId);
}

function removeFrom(items, predicate) {
  const index = items.findIndex(predicate);
  return index >= 0 ? items.splice(index, 1)[0] : null;
}

function roundedPercent(value, ratio) {
  return Math.max(1, Math.floor(value * ratio));
}

function oneOrTwoCombinations(items) {
  const output = items.map((item) => [item]);
  for (let first = 0; first < items.length; first += 1) {
    for (let second = first + 1; second < items.length; second += 1) {
      output.push([items[first], items[second]]);
    }
  }
  return output;
}

export class BattleEngine {
  static fromCheckpoint({ masterData, checkpoint }) {
    if (!masterData || !checkpoint?.state?.players || checkpoint.schemaVersion !== 1) {
      throw new Error('Battle checkpoint is invalid');
    }
    const engine = Object.create(BattleEngine.prototype);
    engine.masterData = masterData;
    engine.masterIndex = createMasterIndex(masterData);
    engine.rng = new SeededRng(checkpoint.rng?.seed ?? checkpoint.state.seed, checkpoint.rng?.state ?? null);
    engine.unitSequence = Math.max(0, Number(checkpoint.unitSequence) || 0);
    engine.eventSequence = Math.max(0, Number(checkpoint.eventSequence) || 0);
    engine.state = clone(checkpoint.state);
    for (const player of Object.values(engine.state.players)) {
      player.effects.nextTurnFusionLocks ??= [];
      player.effects.nextTurnMoveSurcharges ??= [];
    }
    return engine;
  }

  constructor({ masterData, players, seed = 'battle', firstPlayerId = null }) {
    if (!masterData) throw new Error('masterData is required');
    if (!Array.isArray(players) || players.length !== 2) throw new Error('BattleEngine requires exactly two players');
    if (new Set(players.map((player) => player.id)).size !== 2) throw new Error('Player IDs must be unique');

    this.masterData = masterData;
    this.masterIndex = createMasterIndex(masterData);
    this.rng = new SeededRng(seed);
    this.unitSequence = 0;
    this.eventSequence = 0;

    const normalizedPlayers = players.map((player) => ({
      ...player,
      cards: assertLegalDeck(normalizeDeckCards(player.cards, player.deckId ?? player.id), this.masterIndex, {
        deckId: player.deckId ?? player.id,
      }),
    }));
    const firstResult = firstPlayerId
      ? {
          firstPlayerId,
          costs: Object.fromEntries(normalizedPlayers.map((player) => [player.id, totalPlayTp(player.cards, this.masterIndex)])),
          tied: false,
        }
      : determineFirstPlayer(normalizedPlayers[0], normalizedPlayers[1], this.masterIndex, this.rng.fork('first-player'));
    if (!normalizedPlayers.some((player) => player.id === firstResult.firstPlayerId)) throw new Error('Unknown firstPlayerId');

    const secondPlayerId = normalizedPlayers.find((player) => player.id !== firstResult.firstPlayerId).id;
    this.state = {
      version: 1,
      seed: String(seed),
      status: 'active',
      winnerId: null,
      result: null,
      firstPlayerId: firstResult.firstPlayerId,
      currentPlayerId: firstResult.firstPlayerId,
      playerOrder: [firstResult.firstPlayerId, secondPlayerId],
      deckCosts: firstResult.costs,
      firstPlayerCostTie: firstResult.tied,
      halfTurn: 0,
      round: 1,
      pendingMoveChoice: null,
      players: {},
      log: [],
    };

    for (const definition of normalizedPlayers) {
      const player = createPlayerState(
        definition,
        definition.cards,
        this.rng.fork(`shuffle:${definition.id}`),
        definition.tournamentGrowth,
      );
      player.isFirst = definition.id === firstResult.firstPlayerId;
      this.state.players[player.id] = player;
    }

    for (const playerId of this.state.playerOrder) this._drawCards(this.player(playerId), RULES.initialHand, 'initial');
    this._log('battle-start', `${this.player(firstResult.firstPlayerId).displayName}が先攻`, {
      firstPlayerId: firstResult.firstPlayerId,
      deckCosts: firstResult.costs,
      tied: firstResult.tied,
    });
    this._startTurn(firstResult.firstPlayerId);
  }

  player(playerId) {
    const player = this.state.players[playerId];
    if (!player) throw new Error(`Unknown player: ${playerId}`);
    return player;
  }

  opponent(playerId) {
    return this.player(opposingId(this.state, playerId));
  }

  getState() {
    return clone(this.state);
  }

  getObservation(playerId) {
    const own = clone(this.player(playerId));
    const opponent = clone(this.opponent(playerId));
    return {
      seed: this.state.seed,
      status: this.state.status,
      winnerId: this.state.winnerId,
      result: clone(this.state.result),
      currentPlayerId: this.state.currentPlayerId,
      firstPlayerId: this.state.firstPlayerId,
      halfTurn: this.state.halfTurn,
      round: this.state.round,
      pendingMoveChoice: this.state.pendingMoveChoice?.playerId === playerId
        ? clone(this.state.pendingMoveChoice)
        : null,
      own,
      opponent: {
        id: opponent.id,
        displayName: opponent.displayName,
        isFirst: opponent.isFirst,
        life: opponent.life,
        maxTp: opponent.maxTp,
        tp: opponent.tp,
        turnNumber: opponent.turnNumber,
        handCount: opponent.hand.length,
        deckCount: opponent.deck.length,
        graveyard: opponent.graveyard,
        board: opponent.board,
        effects: opponent.effects,
        metrics: opponent.metrics,
      },
      log: clone(this.state.log),
    };
  }

  clone() {
    const engine = Object.create(BattleEngine.prototype);
    engine.masterData = this.masterData;
    engine.masterIndex = this.masterIndex;
    engine.rng = this.rng.clone();
    engine.unitSequence = this.unitSequence;
    engine.eventSequence = this.eventSequence;
    engine.state = clone(this.state);
    return engine;
  }

  toCheckpoint() {
    return {
      schemaVersion: 1,
      state: clone(this.state),
      rng: this.rng.toJSON(),
      unitSequence: this.unitSequence,
      eventSequence: this.eventSequence,
    };
  }

  getGrowthSnapshot(playerId) {
    return clone(this.player(playerId).tournamentGrowth);
  }

  getLegalActions(playerId = this.state.currentPlayerId) {
    if (this.state.status !== 'active' || playerId !== this.state.currentPlayerId) return [];
    const player = this.player(playerId);
    const pendingChoice = this.state.pendingMoveChoice;
    if (pendingChoice) {
      if (pendingChoice.playerId !== playerId) return [];
      const unit = findUnit(player, pendingChoice.unitId);
      if (!unit || !unit.learnedMoveIds.includes(pendingChoice.learnedMoveId)) {
        throw new Error('修行後の技選択対象が見つかりません');
      }
      const learnedMove = this.masterIndex.moves.get(pendingChoice.learnedMoveId);
      return [
        ...unit.equippedMoveIds.map((replaceMoveId) => ({
          type: 'resolve-shugyo-move',
          unitId: unit.id,
          learnedMoveId: pendingChoice.learnedMoveId,
          replaceMoveId,
          cost: 0,
          label: `${this.masterIndex.moves.get(replaceMoveId)?.name ?? '実戦技'}と${learnedMove?.name ?? '新技'}を入れ替える`,
        })),
        {
          type: 'resolve-shugyo-move',
          unitId: unit.id,
          learnedMoveId: pendingChoice.learnedMoveId,
          replaceMoveId: null,
          cost: 0,
          label: `${learnedMove?.name ?? '新技'}は習得のみ（実戦4技を維持）`,
        },
      ];
    }
    const opponent = this.opponent(playerId);
    const actions = [];
    const emptySlots = player.board.flatMap((unit, slot) => (unit ? [] : [slot]));

    for (const card of player.hand) {
      const definition = cardDefinition(this.masterIndex, card);
      if (definition.kind === 'monster' && player.tp >= definition.summonTp) {
        for (const slot of emptySlots) {
          actions.push({
            type: 'summon',
            cardInstanceId: card.instanceId,
            slot,
            cost: definition.summonTp,
            label: `${definition.name}を召喚（枠${slot + 1}）`,
          });
        }
      }
      if (definition.kind === 'training' && player.tp >= definition.tp) {
        for (const unit of livingUnits(player)) {
          actions.push({
            type: 'training',
            cardInstanceId: card.instanceId,
            unitId: unit.id,
            cost: definition.tp,
            label: `${unit.name}を${definition.name}`,
          });
        }
      }
      if (definition.kind === 'shugyo' && player.tp >= definition.tp) {
        for (const unit of livingUnits(player)) {
          const possibleMoveIds = learnableShugyoMoves(this.masterData, this.masterIndex, unit, definition)
            .map((move) => move.id);
          actions.push({
            type: 'shugyo',
            cardInstanceId: card.instanceId,
            unitId: unit.id,
            cost: definition.tp,
            label: `${unit.name}が${definition.name}`,
            preview: { possibleMoveIds },
          });
        }
      }
      if (definition.kind === 'breeder' && player.tp >= definition.tp) {
        actions.push(...this._legalBreederActions(card, definition, player, opponent));
      }
    }

    const opponentUnits = livingUnits(opponent);
    for (const unit of livingUnits(player)) {
      if (unit.actionPoints <= 0 || unit.summonedThisTurn || unit.stunnedThisTurn) continue;
      for (const moveId of unit.equippedMoveIds) {
        const move = this.masterIndex.moves.get(moveId);
        if (!move) continue;
        if (move.power == null) {
          const cost = resolvedMoveTp(player, unit, null, move);
          if (player.tp >= cost && !(move.name === 'フォームアルファ' && unit.statuses.formAlphaUsed)) {
            actions.push({ type: 'move', unitId: unit.id, moveId, targetUnitId: null, cost, label: move.name });
          }
          continue;
        }
        if (opponentUnits.length) {
          for (const target of opponentUnits) {
            const cost = resolvedMoveTp(player, unit, target, move);
            if (player.tp >= cost) {
              actions.push({
                type: 'move',
                unitId: unit.id,
                moveId,
                targetUnitId: target.id,
                cost,
                label: `${move.name} → ${target.name}`,
              });
            }
          }
        } else {
          const cost = resolvedMoveTp(player, unit, null, move);
          if (player.tp >= cost) {
            actions.push({
              type: 'move',
              unitId: unit.id,
              moveId,
              targetUnitId: null,
              targetPlayerId: opponent.id,
              cost,
              label: `${move.name} → プレイヤー`,
            });
          }
        }
      }
    }

    const unlockTurn = player.isFirst ? RULES.firstFusionTurn : RULES.secondFusionTurn;
    const fusionLocked = (player.effects.nextTurnFusionLocks ?? [])
      .some((effect) => effect.activeFromTurn <= player.turnNumber && effect.remaining > 0);
    if (player.turnNumber >= unlockTurn && !fusionLocked) {
      const materials = player.hand
        .map((card) => ({ card, definition: cardDefinition(this.masterIndex, card) }))
        .filter(({ definition }) => definition.kind === 'monster');
      for (const main of livingUnits(player).filter((unit) => unit.fusionStage < RULES.maxFusionStage)) {
        for (const { card, definition } of materials) {
          const materialGrowth = normalizeGrowth(player.tournamentGrowth[card.instanceId], definition, this.masterIndex);
          const materialSp = definition.base.life + materialGrowth.life
            + definition.base.atk + materialGrowth.atk
            + definition.base.def + materialGrowth.def;
          const projected = projectFusionStats(main, materialSp);
          const preview = player.effects.nextFusionBuff ? {
            ...projected,
            newSp: projected.newSp + 20,
            deltaSp: projected.deltaSp + 20,
            stats: {
              life: projected.stats.life + 10,
              atk: projected.stats.atk + 5,
              def: projected.stats.def + 5,
            },
            breederBonus: { life: 10, atk: 5, def: 5 },
          } : projected;
          if (player.tp >= RULES.normalFusionTp) {
            actions.push({
              type: 'fusion-normal',
              unitId: main.id,
              materialCardInstanceId: card.instanceId,
              cost: RULES.normalFusionTp,
              preview,
              label: `${main.name} + ${definition.name}（通常合体・SP+${preview.deltaSp}）`,
            });
          }
          const special = this.masterIndex.fusions.get(`${main.baseMonsterName}:${definition.name}`);
          if (special && player.tp >= RULES.specialFusionTp) {
            actions.push({
              type: 'fusion-special',
              unitId: main.id,
              materialCardInstanceId: card.instanceId,
              fusionId: special.id,
              cost: RULES.specialFusionTp,
              preview,
              label: `${special.name}へ特殊合体（SP+${preview.deltaSp}）`,
            });
          }
        }
      }
    }

    actions.push({ type: 'end-turn', label: 'ターン終了' });
    return actions;
  }

  applyAction(action) {
    if (this.state.status !== 'active') throw new Error('Battle is already finished');
    const legal = this.getLegalActions();
    const selected = legal.find((candidate) => actionKey(candidate) === actionKey(action));
    if (!selected) throw new Error(`Illegal action: ${JSON.stringify(action)}`);

    switch (selected.type) {
      case 'summon': this._summon(selected); break;
      case 'training': this._training(selected); break;
      case 'shugyo': this._shugyo(selected); break;
      case 'resolve-shugyo-move': this._resolveShugyoMove(selected); break;
      case 'breeder': this._breeder(selected); break;
      case 'move': this._move(selected); break;
      case 'fusion-normal': this._fusion(selected, false); break;
      case 'fusion-special': this._fusion(selected, true); break;
      case 'end-turn': this._endTurn(); break;
      default: throw new Error(`Unknown action: ${selected.type}`);
    }
    return this.getState();
  }

  _startTurn(playerId) {
    if (this.state.status !== 'active') return;
    const player = this.player(playerId);
    this.state.currentPlayerId = playerId;
    this.state.halfTurn += 1;
    player.turnNumber += 1;
    this.state.round = Math.max(...this.state.playerOrder.map((id) => this.player(id).turnNumber));

    for (const id of this.state.playerOrder) {
      for (const unit of livingUnits(this.player(id))) unit.statuses.firstIncomingUsed = false;
    }

    const activeBonuses = player.effects.nextOwnMaxTpBonuses.filter((effect) => effect.activeFromTurn <= player.turnNumber && effect.remaining > 0);
    const activePenalties = player.effects.nextTurnMaxTpPenalties.filter((effect) => effect.activeFromTurn <= player.turnNumber && effect.remaining > 0);
    player.maxTp = Math.max(1,
      player.baseMaxTp
      + activeBonuses.reduce((sum, effect) => sum + effect.amount, 0)
      - activePenalties.reduce((sum, effect) => sum + effect.amount, 0));
    player.tp = player.maxTp;
    if ((player.effects.tpDebt ?? 0) > 0) {
      player.tp = Math.max(0, player.tp - player.effects.tpDebt);
      player.effects.tpDebt = 0;
    }

    for (const unit of livingUnits(player)) {
      unit.actionPoints = 1;
      unit.summonedThisTurn = false;
      unit.stunnedThisTurn = false;
      unit.movesUsedThisTurn = 0;
      unit.temporaryAtk = 0;
      unit.temporaryDef = 0;
      unit.statuses.temporaryTurnDamageBonus = 0;
      unit.statuses.gallionGuard = false;
      unit.statuses.swapAtkDef = false;
      if (unit.statuses.stunOnNextTurn > 0) {
        unit.statuses.stunOnNextTurn -= 1;
        unit.actionPoints = 0;
        unit.stunnedThisTurn = true;
      }
    }

    const skipDraw = player.isFirst && player.turnNumber === 1;
    if (!skipDraw) this._normalDraw(player);
    this._applyTurnStartEffects(player);
    this._log('turn-start', `${player.displayName} ターン${player.turnNumber}`, {
      playerId,
      tp: player.tp,
      drawSkipped: skipDraw,
    });
    if (!player.isFirst && player.turnNumber === RULES.secondFusionTurn) {
      this._log('fusion-unlocked', `${player.displayName}の合体が解禁された`, {
        playerId,
        turnNumber: player.turnNumber,
      });
    }
  }

  _endTurn() {
    const player = this.player(this.state.currentPlayerId);
    this._applyTurnEndEffects(player);
    player.effects.nextFusionBuff = false;
    this._decrementTurnModifiers(player);
    this._log('turn-end', `${player.displayName}がターン終了`, { playerId: player.id });

    if (this.state.playerOrder.every((id) => this.player(id).turnNumber >= RULES.maxRounds)) {
      this._resolveTurnLimit();
      return;
    }
    this._startTurn(opposingId(this.state, player.id));
  }

  _summon(action) {
    const player = this.player(this.state.currentPlayerId);
    const card = removeFrom(player.hand, (candidate) => candidate.instanceId === action.cardInstanceId);
    const monster = cardDefinition(this.masterIndex, card);
    player.tp -= monster.summonTp;
    const growth = player.tournamentGrowth[card.instanceId] ?? {};
    const unit = createUnit({
      unitId: `unit-${++this.unitSequence}`,
      card,
      monster,
      growth,
      masterIndex: this.masterIndex,
      slot: action.slot,
    });
    player.tournamentGrowth[card.instanceId] = normalizeGrowth(growth, monster, this.masterIndex);
    player.board[action.slot] = unit;
    player.metrics.summons += 1;
    this._log('summon', `${player.displayName}は${monster.name}を召喚`, {
      playerId: player.id,
      unitId: unit.id,
      cardInstanceId: card.instanceId,
      cardMasterId: monster.id,
      slot: action.slot,
      tp: player.tp,
    });
  }

  _training(action) {
    const player = this.player(this.state.currentPlayerId);
    const card = removeFrom(player.hand, (candidate) => candidate.instanceId === action.cardInstanceId);
    const definition = cardDefinition(this.masterIndex, card);
    const unit = findUnit(player, action.unitId);
    const bonus = unit.specialForm === 'モチモチエイト' ? 2 : 0;
    const amount = definition.amount + bonus;
    const growth = player.tournamentGrowth[unit.sourceCardInstanceId];
    let applied = amount;
    if (definition.stat === 'life') {
      unit.maxLife += amount;
      unit.life += amount;
      growth.life += amount;
    } else if (definition.stat === 'atk') {
      applied = applyAtkBuff(unit, amount);
      unit.atkBase += applied;
      unit.atkMod -= applied;
      growth.atk += applied;
    } else {
      unit.defBase += amount;
      growth.def += amount;
    }
    player.tp -= definition.tp;
    player.graveyard.push(card);
    player.metrics.trainingUses += 1;
    this._log('training', `${unit.name}の${definition.stat.toUpperCase()}が${applied}上昇`, {
      playerId: player.id,
      unitId: unit.id,
      cardMasterId: definition.id,
      stat: definition.stat,
      amount: applied,
    });
  }

  _shugyo(action) {
    const player = this.player(this.state.currentPlayerId);
    const card = removeFrom(player.hand, (candidate) => candidate.instanceId === action.cardInstanceId);
    const definition = cardDefinition(this.masterIndex, card);
    const unit = findUnit(player, action.unitId);
    const extra = unit.specialForm === 'モチモチエイト' ? 2 : 0;
    const lifeGain = this.rng.int(RULES.shugyoGainMin, RULES.shugyoGainMax) + extra;
    const statGainBase = this.rng.int(RULES.shugyoGainMin, RULES.shugyoGainMax) + extra;
    const growth = player.tournamentGrowth[unit.sourceCardInstanceId];
    unit.maxLife += lifeGain;
    unit.life += lifeGain;
    growth.life += lifeGain;
    let statGain = statGainBase;
    if (definition.stat === 'atk') {
      statGain = applyAtkBuff(unit, statGainBase);
      unit.atkBase += statGain;
      unit.atkMod -= statGain;
      growth.atk += statGain;
    } else {
      unit.defBase += statGain;
      growth.def += statGain;
    }

    let learnedMove = null;
    if (unit.learnedMoveIds.length < RULES.maxLearnedMoves) {
      const candidates = learnableShugyoMoves(this.masterData, this.masterIndex, unit, definition);
      learnedMove = chooseShugyoMove(this.rng, candidates);
    }
    if (learnedMove) {
      unit.learnedMoveIds.push(learnedMove.id);
      growth.learnedMoveIds.push(learnedMove.id);
      if (unit.equippedMoveIds.length < RULES.equippedMoveSlots) {
        unit.equippedMoveIds.push(learnedMove.id);
        growth.equippedMoveIds.push(learnedMove.id);
      } else {
        this.state.pendingMoveChoice = {
          playerId: player.id,
          unitId: unit.id,
          learnedMoveId: learnedMove.id,
        };
      }
    }

    player.tp -= definition.tp;
    player.graveyard.push(card);
    player.metrics.shugyoUses += 1;
    this._log('shugyo', `${unit.name}が修行（LIFE+${lifeGain} / ${definition.stat.toUpperCase()}+${statGain}${learnedMove ? ` / ${learnedMove.name}習得` : ''}）`, {
      playerId: player.id,
      unitId: unit.id,
      cardMasterId: definition.id,
      lifeGain,
      stat: definition.stat,
      statGain,
      learnedMoveId: learnedMove?.id ?? null,
    });
  }

  _resolveShugyoMove(action) {
    const player = this.player(this.state.currentPlayerId);
    const pending = this.state.pendingMoveChoice;
    const unit = findUnit(player, action.unitId);
    const learnedMove = this.masterIndex.moves.get(action.learnedMoveId);
    if (!pending || pending.playerId !== player.id || pending.unitId !== unit?.id
      || pending.learnedMoveId !== action.learnedMoveId) {
      throw new Error('解決待ちの修行技が一致しません');
    }

    const growth = player.tournamentGrowth[unit.sourceCardInstanceId];
    let replacedMove = null;
    if (action.replaceMoveId) {
      const index = unit.equippedMoveIds.indexOf(action.replaceMoveId);
      if (index < 0) throw new Error('入れ替える実戦技が見つかりません');
      replacedMove = this.masterIndex.moves.get(action.replaceMoveId);
      unit.equippedMoveIds.splice(index, 1, action.learnedMoveId);
      growth.equippedMoveIds = [...unit.equippedMoveIds];
    }
    this.state.pendingMoveChoice = null;
    this._log(action.replaceMoveId ? 'shugyo-move-equipped' : 'shugyo-move-stored', action.replaceMoveId
      ? `${unit.name}は${replacedMove?.name ?? '実戦技'}を外し、${learnedMove?.name ?? '新技'}を実戦技に採用`
      : `${unit.name}は${learnedMove?.name ?? '新技'}を習得技として保存（実戦4技は変更なし）`, {
      playerId: player.id,
      unitId: unit.id,
      learnedMoveId: action.learnedMoveId,
      replacedMoveId: action.replaceMoveId,
      equippedMoveIds: [...unit.equippedMoveIds],
    });
  }

  _fusion(action, special) {
    const player = this.player(this.state.currentPlayerId);
    const main = findUnit(player, action.unitId);
    const materialCard = removeFrom(player.hand, (card) => card.instanceId === action.materialCardInstanceId);
    const materialDef = cardDefinition(this.masterIndex, materialCard);
    const materialGrowth = normalizeGrowth(player.tournamentGrowth[materialCard.instanceId], materialDef, this.masterIndex);
    const materialSp = materialDef.base.life + materialGrowth.life
      + materialDef.base.atk + materialGrowth.atk
      + materialDef.base.def + materialGrowth.def;
    const projection = projectFusionStats(main, materialSp);
    const { mainSp } = projection;
    let newSp = projection.newSp;
    const currentLifeRatio = lifeRatio(main);
    const newMaxLife = projection.stats.life;
    const newAtk = projection.stats.atk;
    const newDef = projection.stats.def;
    main.maxLife = newMaxLife;
    main.life = Math.max(1, Math.round(newMaxLife * currentLifeRatio));
    main.atkBase = newAtk;
    main.defBase = newDef;
    main.fusionStage += 1;
    main.absorbedCardInstanceIds.push(materialCard.instanceId);
    player.setAside.push(materialCard);

    let fusion = null;
    if (special) {
      fusion = this.masterData.fusions.find((candidate) => candidate.id === action.fusionId);
      main.specialFusionId = fusion.id;
      main.specialForm = fusion.name;
      main.name = fusion.name;
      main.specialTrait = fusion.trait;
      main.traitName = '特殊特性';
      main.traitEffect = fusion.trait;
      main.traitEngine = {};
      // A special form replaces the base monster trait. Remove only statuses
      // which were granted by that base trait; ordinary buffs/debuffs and
      // learned-move state still belong to the tournament unit.
      main.statuses.evadeNext = false;
      main.statuses.knightWill = false;
      main.statuses.hamKillBonus = 0;
      main.statuses.specialReviveUsed = false;
      main.statuses.firstIncomingUsed = false;
      main.statuses.glaciaCharged = false;
      main.statuses.temporaryTurnDamageBonus = 0;
      main.statuses.gallionGuard = false;
      main.statuses.benihimeCharged = false;
      main.statuses.ochimushaTriggered = false;
      main.statuses.lastAttackTargetId = null;
      main.statuses.consecutiveAttackCount = 0;
      main.statuses.specialCounters = {};
      if (fusion.name === 'ダークハム') {
        main.defMod += 8;
        main.statuses.specialCounters.darkHamDef = 8;
      }
    }

    if (player.effects.nextFusionBuff) {
      main.maxLife += 10;
      main.life = Math.min(main.maxLife, main.life + 10);
      main.atkBase += 5;
      main.defBase += 5;
      newSp += 20;
      player.effects.nextFusionBuff = false;
    }

    const cost = special ? RULES.specialFusionTp : RULES.normalFusionTp;
    player.tp -= cost;
    player.metrics.fusions += 1;
    if (special) player.metrics.specialFusions += 1;
    this._log(special ? 'fusion-special' : 'fusion-normal', special
      ? `${main.baseMonsterName}と${materialDef.name}が${fusion.name}へ特殊合体`
      : `${main.name}は${materialDef.name}と通常合体`, {
      playerId: player.id,
      unitId: main.id,
      materialCardInstanceId: materialCard.instanceId,
      materialMasterId: materialDef.id,
      fusionId: fusion?.id ?? null,
      previousSp: mainSp,
      newSp,
      deltaSp: projection.deltaSp,
      stats: { life: main.maxLife, atk: main.atkBase, def: main.defBase },
      actionPoints: main.actionPoints,
    });
  }

  _move(action) {
    const player = this.player(this.state.currentPlayerId);
    const opponent = this.opponent(player.id);
    const unit = findUnit(player, action.unitId);
    const move = this.masterIndex.moves.get(action.moveId);
    let target = action.targetUnitId ? findUnit(opponent, action.targetUnitId) : null;
    if (target) target = this._redirectMonolith(opponent, target);
    const cost = resolvedMoveTp(player, unit, target, move);
    player.tp -= cost;
    consumeMoveSurcharge(player);
    unit.actionPoints -= 1;
    player.metrics.attacks += 1;
    const echoRatio = unit.statuses.echoNext ?? 0;
    const recoilDamage = unit.statuses.recoilOnNextAttack ?? 0;

    if (move.power == null) {
      unit.statuses.formAlphaUsed = true;
      unit.defMod += 10;
      unit.movesUsedThisTurn += 1;
      this._afterMoveUse(unit, move, false);
      this._log('move', `${unit.name}の${move.name}。DEF+10`, { playerId: player.id, unitId: unit.id, moveId: move.id, cost });
      return;
    }

    const power = resolvedMovePower(unit, target, move);
    if (!target) {
      const attack = effectiveAtk(unit);
      const multiplier = outgoingDamageMultiplier(unit, null, move, opponent);
      const damage = Math.max(0, Math.floor(attack * (power / 100) * multiplier));
      const echoDamage = echoRatio > 0 ? Math.max(0, Math.floor(damage * echoRatio)) : 0;
      const totalDamage = damage + echoDamage;
      opponent.life -= totalDamage;
      player.metrics.damageDealt += totalDamage;
      player.metrics.directDamage += totalDamage;
      this._applyPostMoveEffects(player, opponent, unit, null, move, { damage: totalDamage, defeated: false, actual: totalDamage });
      this._consumeDamageStatuses(unit);
      unit.movesUsedThisTurn += 1;
      this._afterMoveUse(unit, move, opponent.life <= 0);
      if (recoilDamage > 0) this._selfDamage(player, unit, recoilDamage);
      this._log('direct-attack', `${unit.name}の${move.name}。${opponent.displayName}へ${totalDamage}ダメージ${echoDamage ? `（残響${echoDamage}）` : ''}`, {
        playerId: player.id,
        unitId: unit.id,
        moveId: move.id,
        damage: totalDamage,
        echoDamage,
        cost,
      });
      this._checkPlayerLife(opponent, player.id, 'direct-attack');
      return;
    }

    const { attack, defense } = combatStats(unit, target);
    const ignored = defenseIgnore(player, unit, target, move);
    const effectiveDefense = Math.max(1, defense - ignored);
    const baseDamage = Math.max(0, Math.floor(attack * (power / 100) - effectiveDefense));
    const multiplier = outgoingDamageMultiplier(unit, target, move, opponent);
    const rawDamage = Math.max(0, Math.floor(baseDamage * multiplier));
    const damageResult = this._damageUnit(opponent, target, rawDamage, unit);
    let echoDamage = 0;
    if (echoRatio > 0 && !damageResult.defeated && damageResult.actual > 0) {
      const echoResult = this._damageUnit(opponent, target, Math.floor(damageResult.actual * echoRatio), unit);
      echoDamage = echoResult.actual + echoResult.overflow;
      damageResult.actual += echoResult.actual;
      damageResult.overflow += echoResult.overflow;
      damageResult.defeated = echoResult.defeated;
      damageResult.incomingTriggers.push(...echoResult.incomingTriggers.map((trigger) => `残響:${trigger}`));
    }
    player.metrics.damageDealt += damageResult.actual + damageResult.overflow;
    this._applyPostMoveEffects(player, opponent, unit, target, move, damageResult);
    this._consumeDamageStatuses(unit);
    updateConsecutiveTarget(unit, target.id);
    unit.movesUsedThisTurn += 1;
    this._afterMoveUse(unit, move, damageResult.defeated);
    if (recoilDamage > 0) this._selfDamage(player, unit, recoilDamage);
    this._log('attack', `${unit.name}の${move.name}。${target.name}へ${damageResult.actual}ダメージ${echoDamage ? `（残響${echoDamage}）` : ''}${damageResult.overflow ? `、超過${damageResult.overflow}` : ''}`, {
      playerId: player.id,
      unitId: unit.id,
      targetUnitId: target.id,
      moveId: move.id,
      cost,
      power,
      attack,
      defense: effectiveDefense,
      damage: damageResult.actual,
      echoDamage,
      overflow: damageResult.overflow,
      defeated: damageResult.defeated,
      redirected: target.id !== action.targetUnitId,
      incomingTriggers: damageResult.incomingTriggers,
    });
    if (damageResult.overflow) opponent.life -= damageResult.overflow;
    this._checkPlayerLife(opponent, player.id, 'overflow');
  }

  _damageUnit(owner, unit, rawDamage, attacker, { triggerAttacked = true } = {}) {
    if (unit.statuses.evadeNext) {
      unit.statuses.evadeNext = false;
      if (triggerAttacked) this._onAttacked(unit, attacker, 0, false);
      return { actual: 0, overflow: 0, defeated: false, evaded: true, incomingTriggers: ['完全回避'] };
    }
    let adjustedRawDamage = rawDamage;
    const flatMark = unit.statuses.incomingFlatDamage;
    const markTriggered = triggerAttacked && adjustedRawDamage > 0 && flatMark?.remaining > 0;
    if (markTriggered) {
      adjustedRawDamage += flatMark.amount;
      flatMark.remaining -= 1;
      if (flatMark.remaining <= 0) unit.statuses.incomingFlatDamage = null;
    }
    const { damage, triggers } = applyIncomingModifiers(unit, adjustedRawDamage);
    if (markTriggered) triggers.push(`呪印+${flatMark.amount}`);
    const before = unit.life;
    unit.life -= damage;
    let defeated = unit.life <= 0;
    let overflow = defeated ? Math.max(0, damage - before) : 0;

    if (defeated && unit.statuses.spareParts) {
      unit.statuses.spareParts = false;
      unit.life = 1;
      defeated = false;
      overflow = 0;
      triggers.push('予備パーツ');
    } else if (defeated && hasNormalTrait(unit, 'ヒノトリ') && !unit.statuses.phoenixUsed) {
      unit.statuses.phoenixUsed = true;
      unit.life = Math.min(unit.maxLife, 10);
      defeated = false;
      overflow = 0;
      triggers.push('不死鳥');
    } else if (defeated && hasNormalTrait(unit, 'ワーム') && before === unit.maxLife && !unit.statuses.moltUsed) {
      unit.statuses.moltUsed = true;
      unit.life = 1;
      defeated = false;
      overflow = 0;
      triggers.push('脱皮');
    } else if (defeated && unit.specialForm === 'ガルーダ' && !unit.statuses.specialReviveUsed) {
      unit.statuses.specialReviveUsed = true;
      unit.life = roundedPercent(unit.maxLife, 0.3);
      defeated = false;
      overflow = 0;
      triggers.push('ガルーダ');
    }

    const actual = Math.min(before, damage);
    if (triggerAttacked) this._onAttacked(unit, attacker, actual, defeated);
    if (defeated) this._removeUnit(owner, unit);
    return { actual, overflow, defeated, evaded: false, incomingTriggers: triggers };
  }

  _onAttacked(unit, attacker, actualDamage, defeated) {
    if (hasNormalTrait(unit, 'デュラハン') && actualDamage > 0 && !defeated) unit.statuses.knightWill = true;
    if (unit.specialForm === 'オキクサン' && attacker && actualDamage > 0) {
      const applied = unit.statuses.specialCounters.okikuAtkLoss ?? 0;
      const amount = Math.min(3, 15 - applied);
      if (amount > 0) {
        applyAtkDebuff(attacker, amount);
        unit.statuses.specialCounters.okikuAtkLoss = applied + amount;
      }
    }
    if (unit.specialForm === 'トカゲムシ' && !defeated) {
      const applied = unit.statuses.specialCounters.tokageDef ?? 0;
      const amount = Math.min(3, 12 - applied);
      if (amount > 0) {
        unit.defMod += amount;
        unit.statuses.specialCounters.tokageDef = applied + amount;
      }
    }
    if (unit.specialForm === 'ワイルドブロック' && !defeated) {
      const applied = unit.statuses.specialCounters.wildAtk ?? 0;
      const amount = Math.min(4, 16 - applied);
      if (amount > 0) {
        unit.atkMod += amount;
        unit.statuses.specialCounters.wildAtk = applied + amount;
      }
    }
    if (unit.specialForm === 'ユーマ' && actualDamage > 0 && !defeated) {
      const stacks = unit.statuses.specialCounters.yumaStacks ?? 0;
      if (stacks > 0) {
        unit.statuses.specialCounters.yumaStacks = stacks - 1;
        unit.defMod -= 3;
      }
    }
    if (unit.specialForm === 'ウスバカゲソウ' && !defeated) {
      const applied = unit.statuses.specialCounters.usubaDef ?? 0;
      const amount = Math.min(2, 10 - applied);
      if (amount > 0) {
        unit.defMod += amount;
        unit.statuses.specialCounters.usubaDef = applied + amount;
      }
    }
    if (unit.specialForm === 'オチムシャ' && !defeated && lifeRatio(unit) <= 0.5 && !unit.statuses.ochimushaTriggered) {
      unit.statuses.ochimushaTriggered = true;
      unit.atkMod += 10;
      unit.defMod += 10;
    }
  }

  _applyPostMoveEffects(player, opponent, unit, target, move, result) {
    if (target && !result.defeated) {
      if (hasNormalTrait(unit, 'プラント')) {
        target.statuses.parasite = { sourceUnitId: unit.id, sourcePlayerId: player.id };
      }
      if (move.effect.includes('対象ATK-5・DEF-5')) {
        applyAtkDebuff(target, 5);
        applyDefDebuff(target, 5);
      } else {
        if (move.effect === '対象ATK-5') applyAtkDebuff(target, 5);
        if (move.effect === '対象DEF-5') applyDefDebuff(target, 5);
        if (move.name === 'エナジードレイン' && target.statuses.parasite) applyDefDebuff(target, 5);
      }
      if (unit.specialForm === 'セイレーン' && lifeRatio(target) <= 0.5) {
        applyAtkDebuff(target, 5);
        applyDefDebuff(target, 5);
      }
    } else if (target && hasNormalTrait(unit, 'プラント')) {
      target.statuses.parasite = { sourceUnitId: unit.id, sourcePlayerId: player.id };
    }

    if (move.effect.includes('自身LIFE5回復') && (!move.effect.includes('寄生中') || target?.statuses.parasite)) this._heal(unit, 5);
    if (move.effect.includes('使用後、自身DEF-5')) applyDefDebuff(unit, 5);
    if (move.effect.includes('使用後、自身ATK-5')) applyAtkDebuff(unit, 5);
    if (move.effect.includes('使用後、自身DEF+5')) applyDefBuff(unit, 5);
    if (move.effect.includes('使用後、自身ATK+5')) applyAtkBuff(unit, 5);
    if (move.effect.includes('使用後、自身LIFE-5')) this._selfDamage(player, unit, 5);
    if (result.defeated && move.effect.includes('撃破時TP1回復')) player.tp = Math.min(player.maxTp, player.tp + 1);
    if (result.defeated && move.effect.includes('LIFE5追加回復')) this._heal(unit, 5);

    if (result.defeated) {
      player.metrics.knockouts += 1;
      if ((unit.statuses.tpOnNextKill ?? 0) > 0) {
        player.tp = Math.min(player.maxTp, player.tp + unit.statuses.tpOnNextKill);
      }
      if (unit.statuses.predationEvolution) {
        unit.statuses.predationEvolution = false;
        this._heal(unit, 10);
        applyAtkBuff(unit, 5);
      }
      if (hasNormalTrait(unit, 'ハム')) {
        const gain = Math.min(5, 15 - unit.statuses.hamKillBonus);
        unit.statuses.hamKillBonus += Math.max(0, gain);
      }
      if (hasNormalTrait(unit, 'ディノ')) this._heal(unit, 10);
      if (!unit.specialForm && (Number(unit.traitEngine?.tpOnKill) || 0) > 0) {
        player.tp = Math.min(player.maxTp, player.tp + Math.max(0, Number(unit.traitEngine.tpOnKill) || 0));
      }
      if (!unit.specialForm && (Number(unit.traitEngine?.healOnKill) || 0) > 0) {
        this._heal(unit, Math.max(0, Number(unit.traitEngine.healOnKill) || 0));
      }
      if (unit.specialForm === 'サクラチル') this._heal(unit, roundedPercent(unit.maxLife, 0.25));
      if (unit.specialForm === 'エンドブリンガー') unit.atkMod += 8;
    }
  }

  _afterMoveUse(unit, move, defeatedTarget) {
    if (hasNormalTrait(unit, 'デュラハン')) unit.statuses.knightWill = false;
    if (unit.statuses.benihimeCharged) unit.statuses.benihimeCharged = false;
    if (unit.statuses.glaciaCharged) unit.statuses.glaciaCharged = false;

    if (unit.specialForm === 'ダークハム') {
      const current = unit.statuses.specialCounters.darkHamMoveDef ?? 0;
      const amount = Math.min(2, 16 - current);
      if (amount > 0) {
        unit.defMod += amount;
        unit.statuses.specialCounters.darkHamMoveDef = current + amount;
      }
    }
    if (unit.specialForm === 'オメガレックス' && move.tp >= 3) {
      const current = unit.statuses.specialCounters.omegaDef ?? 0;
      const amount = Math.min(4, 16 - current);
      if (amount > 0) {
        unit.defMod += amount;
        unit.statuses.specialCounters.omegaDef = current + amount;
      }
    }
    if (unit.specialForm === 'ユーマ') {
      const stacks = unit.statuses.specialCounters.yumaStacks ?? 0;
      if (stacks < 5) {
        unit.statuses.specialCounters.yumaStacks = stacks + 1;
        unit.defMod += 3;
      }
    }
    if (unit.specialForm === 'ガリオン' && unit.movesUsedThisTurn + 1 >= 2) unit.statuses.gallionGuard = true;
    void defeatedTarget;
  }

  _consumeDamageStatuses(unit) {
    unit.statuses.nextDamageBonus = 0;
    unit.statuses.nextDamagePenalty = 0;
    unit.statuses.echoNext = 0;
    unit.statuses.recoilOnNextAttack = 0;
    unit.statuses.tpOnNextKill = 0;
  }

  _selfDamage(owner, unit, amount) {
    // Recoil is damage, but it is not an opponent attack and must not trigger
    // "when attacked" special traits such as トカゲムシ or オキクサン.
    const result = this._damageUnit(owner, unit, amount, null, { triggerAttacked: false });
    if (result.defeated) this._log('self-defeat', `${unit.name}は反動で撃破された`, { unitId: unit.id });
  }

  _redirectMonolith(owner, target) {
    const units = livingUnits(owner);
    const minimumLife = Math.min(...units.map((unit) => unit.life));
    if (target.life !== minimumLife) return target;
    return units.find((unit) => unit.id !== target.id && hasNormalTrait(unit, 'モノリス')) ?? target;
  }

  _removeUnit(owner, unit) {
    const slot = findUnitSlot(owner, unit.id);
    if (slot >= 0) owner.board[slot] = null;
    const sourceCard = {
      instanceId: unit.sourceCardInstanceId,
      masterId: unit.sourceMasterId,
      artVariantId: unit.artVariantId ?? 'base',
      finish: unit.finish ?? 'normal',
      origin: unit.origin ?? 'core',
    };
    if (unit.statuses.returnToHandOnDefeat && owner.hand.length < RULES.handLimit) {
      owner.hand.push(sourceCard);
      unit.statuses.returnToHandOnDefeat = false;
      this._log('breeder-return', `${unit.name}は霊界から手札へ帰還`, { playerId: owner.id, unitId: unit.id });
    } else owner.graveyard.push(sourceCard);
    for (const playerId of this.state.playerOrder) {
      for (const other of livingUnits(this.player(playerId))) {
        if (other.statuses.parasite?.sourceUnitId === unit.id) other.statuses.parasite = null;
      }
    }
  }

  _heal(unit, amount) {
    const before = unit.life;
    unit.life = Math.min(unit.maxLife, unit.life + Math.max(0, amount));
    return unit.life - before;
  }

  _applyTurnStartEffects(player) {
    for (const unit of livingUnits(player)) unit.statuses.normalFirstIncomingUsedThisTurn = false;
    for (const unit of [...livingUnits(player)]) {
      const parasite = unit.statuses.parasite;
      if (parasite) {
        const sourcePlayer = this.state.players[parasite.sourcePlayerId];
        const source = sourcePlayer ? findUnit(sourcePlayer, parasite.sourceUnitId) : null;
        if (!source) unit.statuses.parasite = null;
        else {
          unit.life -= 5;
          this._heal(source, 5);
          this._log('trait', `寄生根が${unit.name}へ5ダメージ`, {
            playerId: sourcePlayer.id,
            unitId: unit.id,
            sourceUnitId: source.id,
            traitName: '寄生根',
          });
          if (unit.life <= 0) this._removeUnit(player, unit);
        }
      }
    }

    for (const unit of livingUnits(player)) {
      if (hasNormalTrait(unit, 'ガリ') && unit.life >= unit.maxLife) {
        const current = unit.statuses.specialCounters.gariBlessing ?? 0;
        const amount = Math.min(5, 10 - current);
        if (amount > 0) {
          unit.atkMod += amount;
          unit.statuses.specialCounters.gariBlessing = current + amount;
        }
      }
      if (unit.specialForm === 'エコノキックス') {
        if (unit.life >= unit.maxLife) unit.temporaryAtk += 2;
        else this._heal(unit, roundedPercent(unit.maxLife, 0.08));
      }
      if (unit.specialForm === 'アオサギビ') {
        this._heal(unit, roundedPercent(unit.maxLife, 0.08));
        if (lifeRatio(unit) <= 0.5) unit.statuses.temporaryTurnDamageBonus = 0.2;
      }
      if (unit.specialForm === 'ヤオビクニ') this._heal(unit, roundedPercent(unit.maxLife, 0.08));
      if (unit.specialForm === 'ベニヒメソウ') {
        const healed = this._heal(unit, roundedPercent(unit.maxLife, 0.08));
        if (healed > 0) unit.statuses.benihimeCharged = true;
      }
    }
  }

  _applyTurnEndEffects(player) {
    for (const unit of livingUnits(player)) {
      if (unit.specialForm === 'カラフルマスク') {
        const candidates = [
          { key: 'life', ratio: lifeRatio(unit) },
          { key: 'atk', ratio: effectiveAtk(unit) / 50 },
          { key: 'def', ratio: effectiveDef(unit) / 40 },
        ].sort((a, b) => a.ratio - b.ratio || a.key.localeCompare(b.key));
        if (candidates[0].key === 'life') this._heal(unit, roundedPercent(unit.maxLife, 0.1));
        else if (candidates[0].key === 'atk') unit.atkMod += 4;
        else unit.defMod += 4;
      }
      if (unit.specialForm === 'ウスバカゲソウ') this._heal(unit, roundedPercent(unit.maxLife, 0.05));
      if ((unit.statuses.autoRepairRemaining ?? 0) > 0) {
        this._heal(unit, 5);
        unit.statuses.autoRepairRemaining -= 1;
      }
      const overclockPenalty = unit.statuses.overclockPendingDefPenalty ?? 0;
      unit.temporaryAtk = 0;
      unit.temporaryDef = 0;
      if (overclockPenalty > 0) {
        unit.temporaryDef -= overclockPenalty;
        unit.statuses.overclockPendingDefPenalty = 0;
      }
      unit.statuses.temporaryTurnDamageBonus = 0;
      unit.timedAtkBuffs = (unit.timedAtkBuffs ?? [])
        .map((buff) => ({ ...buff, remaining: buff.remaining - 1 }))
        .filter((buff) => buff.remaining > 0);
      unit.timedDefBuffs = unit.timedDefBuffs
        .map((buff) => ({ ...buff, remaining: buff.remaining - 1 }))
        .filter((buff) => buff.remaining > 0);
    }
  }

  _decrementTurnModifiers(player) {
    for (const effect of player.effects.nextOwnMaxTpBonuses) {
      if (effect.activeFromTurn <= player.turnNumber && effect.remaining > 0) effect.remaining -= 1;
    }
    for (const effect of player.effects.nextTurnMaxTpPenalties) {
      if (effect.activeFromTurn <= player.turnNumber && effect.remaining > 0) effect.remaining -= 1;
    }
    for (const effect of player.effects.nextTurnFusionLocks ?? []) {
      if (effect.activeFromTurn <= player.turnNumber && effect.remaining > 0) effect.remaining -= 1;
    }
    for (const effect of player.effects.nextTurnMoveSurcharges ?? []) {
      if (effect.activeFromTurn <= player.turnNumber && effect.remaining > 0) effect.remaining -= 1;
    }
    player.effects.nextOwnMaxTpBonuses = player.effects.nextOwnMaxTpBonuses.filter((effect) => effect.remaining > 0);
    player.effects.nextTurnMaxTpPenalties = player.effects.nextTurnMaxTpPenalties.filter((effect) => effect.remaining > 0);
    player.effects.nextTurnFusionLocks = (player.effects.nextTurnFusionLocks ?? []).filter((effect) => effect.remaining > 0);
    player.effects.nextTurnMoveSurcharges = (player.effects.nextTurnMoveSurcharges ?? []).filter((effect) => effect.remaining > 0);
  }

  _normalDraw(player) {
    const requested = player.hand.length <= 3 ? 5 - player.hand.length : 2;
    this._drawCards(player, Math.max(0, Math.min(requested, RULES.handLimit - player.hand.length)), 'turn');
  }

  _drawCards(player, count, reason) {
    let drawn = 0;
    while (drawn < count && player.hand.length < RULES.handLimit) {
      if (!player.deck.length) {
        if (!player.graveyard.length) break;
        player.deck = this.rng.shuffle(player.graveyard);
        player.graveyard = [];
        player.metrics.reshuffles += 1;
        this._log('reshuffle', `${player.displayName}は墓地を山札へ戻した`, { playerId: player.id });
      }
      const card = player.deck.pop();
      if (!card) break;
      player.hand.push(card);
      drawn += 1;
    }
    player.metrics.cardsDrawn += drawn;
    if (reason !== 'initial' && drawn) this._log('draw', `${player.displayName}は${drawn}枚ドロー`, { playerId: player.id, drawn });
    return drawn;
  }

  _legalBreederActions(card, definition, player, opponent) {
    const base = { type: 'breeder', cardInstanceId: card.instanceId, breederId: definition.id, cost: definition.tp };
    const own = livingUnits(player);
    const enemy = livingUnits(opponent);
    const targetActions = (units) => units.map((unit) => ({ ...base, targetUnitId: unit.id, label: `${definition.name} → ${unit.name}` }));
    const factionTargets = (faction) => targetActions(own.filter((unit) => unit.faction === faction));
    const breederKey = /^breeder-0(?:09|1\d|20)$/.test(definition.id) ? definition.id : definition.name;
    switch (breederKey) {
      case 'ベテランブリーダー':
      case 'プレッシャー指示':
      case '緊急補給':
      case '総攻撃命令':
      case 'breeder-011':
        return [{ ...base, targetUnitId: null, label: definition.name }];
      case '集中指示':
      case '守備指示':
        return targetActions(own);
      case '再行動指示':
        return targetActions(own.filter((unit) => unit.actionPoints <= 0 && !unit.summonedThisTurn && !unit.stunnedThisTurn));
      case '妨害指示':
        return targetActions(enemy);
      case 'breeder-009':
      case 'breeder-010':
        return targetActions(own.filter((unit) => unit.faction === '無機'));
      case 'breeder-012':
        return targetActions(enemy);
      case 'breeder-013':
        return targetActions(own.filter((unit) => unit.faction === '幻霊' && !unit.summonedThisTurn && !unit.stunnedThisTurn));
      case 'breeder-014':
        return targetActions(own);
      case 'breeder-015':
      case 'breeder-016':
        return targetActions(own.filter((unit) => unit.faction === '魔族'));
      case 'breeder-017':
        return own.some((unit) => unit.faction === '獣族') ? [{ ...base, targetUnitId: null, label: definition.name }] : [];
      case 'breeder-018':
        return targetActions(own.filter((unit) => unit.faction === '獣族'));
      case 'breeder-019':
        return targetActions(enemy);
      case 'breeder-020':
        return own.filter((unit) => unit.faction === '怪物').length >= 2
          ? [{ ...base, targetUnitId: null, label: definition.name }]
          : [];
      case '戦線整理': {
        const candidates = player.hand.filter((candidate) => candidate.instanceId !== card.instanceId);
        return oneOrTwoCombinations(candidates).map((cards) => ({
          ...base,
          targetUnitId: null,
          returnCardInstanceIds: cards.map((candidate) => candidate.instanceId),
          label: `戦線整理：${cards.map((candidate) => cardDefinition(this.masterIndex, candidate)?.name).join('・')}`,
        }));
      }
      case '素材探索': {
        const candidates = player.deck.slice(-5).filter((candidate) => cardDefinition(this.masterIndex, candidate)?.kind === 'monster');
        return candidates.map((candidate) => ({
          ...base,
          targetUnitId: null,
          chosenCardInstanceId: candidate.instanceId,
          label: `素材探索：${cardDefinition(this.masterIndex, candidate).name}を手札へ`,
        }));
      }
      case '融合強化指示': {
        const unlockTurn = player.isFirst ? RULES.firstFusionTurn : RULES.secondFusionTurn;
        const hasMain = own.some((unit) => unit.fusionStage < RULES.maxFusionStage);
        const hasMaterial = player.hand.some((candidate) => candidate.instanceId !== card.instanceId
          && cardDefinition(this.masterIndex, candidate)?.kind === 'monster');
        return player.turnNumber >= unlockTurn && hasMain && hasMaterial
          ? [{ ...base, targetUnitId: null, label: definition.name }]
          : [];
      }
      case '全体防御命令':
        return own.length ? [{ ...base, targetUnitId: null, label: definition.name }] : [];
      case 'TP前借り':
        return player.tp < player.maxTp ? [{ ...base, targetUnitId: null, label: definition.name }] : [];
      case '逆境の号令':
        return player.life < opponent.life && own.length ? [{ ...base, targetUnitId: null, label: definition.name }] : [];
      case '強化解除指示':
        return targetActions(enemy.filter((unit) => this._hasRemovableBuff(unit)));
      case '合体妨害工作':
      case '技術封鎖':
        return [{ ...base, targetUnitId: null, label: definition.name }];
      case '状態浄化':
        return targetActions(own.filter((unit) => this._hasRemovableDebuff(unit)));
      case '反転防壁': {
        const ownAtk = own.reduce((sum, unit) => sum + effectiveAtk(unit), 0);
        const enemyAtk = enemy.reduce((sum, unit) => sum + effectiveAtk(unit), 0);
        return own.length && enemyAtk > ownAtk ? [{ ...base, targetUnitId: null, label: definition.name }] : [];
      }
      case '緊急撤退指示':
        return targetActions(own.filter((unit) => unit.fusionStage === 0 && !(unit.absorbedCardInstanceIds ?? []).length));
      case '応急処置':
      case '捨て身命令':
        return targetActions(own);
      case '無機・オーバークロック':
      case '無機・自動修復':
        return factionTargets('無機');
      case '創造・再設計':
      case '創造・予備パーツ':
        return factionTargets('創造');
      case '幻霊・残響詠唱':
      case '幻霊・霊界帰還':
        return factionTargets('幻霊');
      case '魔族・血の契約':
        return player.life > 10 ? [{ ...base, targetUnitId: null, label: definition.name }] : [];
      case '魔族・呪印':
        return targetActions(enemy);
      case '獣族・狩猟本能':
        return factionTargets('獣族');
      case '獣族・群れの守り':
        return own.filter((unit) => unit.faction === '獣族').length >= 2
          ? [{ ...base, targetUnitId: null, label: definition.name }]
          : [];
      case '怪物・暴食': {
        const materials = player.hand.filter((candidate) => candidate.instanceId !== card.instanceId
          && cardDefinition(this.masterIndex, candidate)?.kind === 'monster');
        return own.filter((unit) => unit.faction === '怪物').flatMap((unit) => materials.map((material) => ({
          ...base,
          targetUnitId: unit.id,
          materialCardInstanceId: material.instanceId,
          label: `怪物・暴食：${unit.name}が${cardDefinition(this.masterIndex, material).name}を捕食`,
        })));
      }
      case '怪物・捕食進化':
        return factionTargets('怪物');
      case '無機・機神起動':
        return factionTargets('無機');
      case '創造・神造再演':
        return targetActions(own.filter((unit) => unit.faction === '創造' && !unit.summonedThisTurn && !unit.stunnedThisTurn));
      case '幻霊・黄泉の残唱':
        return factionTargets('幻霊');
      case '魔族・終末契約':
        return player.life > 15 ? factionTargets('魔族') : [];
      case '獣族・王者の咆哮':
        return own.filter((unit) => unit.faction === '獣族').length >= 2
          ? [{ ...base, targetUnitId: null, label: definition.name }]
          : [];
      case '怪物・完全捕食': {
        const materials = player.hand.filter((candidate) => candidate.instanceId !== card.instanceId
          && cardDefinition(this.masterIndex, candidate)?.kind === 'monster');
        return own.filter((unit) => unit.faction === '怪物').flatMap((unit) => materials.map((material) => ({
          ...base,
          targetUnitId: unit.id,
          materialCardInstanceId: material.instanceId,
          label: `怪物・完全捕食：${unit.name}が${cardDefinition(this.masterIndex, material).name}を捕食`,
        })));
      }
      default:
        return [];
    }
  }

  _breeder(action) {
    const player = this.player(this.state.currentPlayerId);
    const opponent = this.opponent(player.id);
    const card = removeFrom(player.hand, (candidate) => candidate.instanceId === action.cardInstanceId);
    const definition = cardDefinition(this.masterIndex, card);
    const ownTarget = action.targetUnitId ? findUnit(player, action.targetUnitId) : null;
    const enemyTarget = action.targetUnitId ? findUnit(opponent, action.targetUnitId) : null;
    player.tp -= definition.tp;
    player.graveyard.push(card);
    player.metrics.breederUses += 1;

    const breederKey = /^breeder-0(?:09|1\d|20)$/.test(definition.id) ? definition.id : definition.name;
    switch (breederKey) {
      case 'ベテランブリーダー':
        player.effects.nextOwnMaxTpBonuses.push({ amount: 1, remaining: 3, activeFromTurn: player.turnNumber + 1 });
        break;
      case 'プレッシャー指示':
        opponent.effects.nextTurnMaxTpPenalties.push({ amount: 1, remaining: 1, activeFromTurn: opponent.turnNumber + 1 });
        break;
      case '集中指示': ownTarget.statuses.nextDamageBonus += 0.2; break;
      case '守備指示': ownTarget.statuses.nextDamageReduction = Math.min(0.9, ownTarget.statuses.nextDamageReduction + 0.5); break;
      case '緊急補給': this._drawCards(player, 3, 'breeder'); break;
      case '総攻撃命令': for (const unit of livingUnits(player)) unit.temporaryAtk += 5; break;
      case '再行動指示': ownTarget.actionPoints += 1; break;
      case '妨害指示': enemyTarget.statuses.nextDamagePenalty += 0.2; break;
      case 'breeder-009': ownTarget.timedDefBuffs.push({ amount: 5, remaining: 3 }); break;
      case 'breeder-010': ownTarget.statuses.vsCreationDefIgnore = { base: 3, creation: 5 }; break;
      case 'breeder-011': player.effects.factionMoveDiscount['創造'] = (player.effects.factionMoveDiscount['創造'] ?? 0) + 1; break;
      case 'breeder-012': enemyTarget.statuses.stunOnNextTurn += 1; break;
      case 'breeder-013': ownTarget.actionPoints += 1; break;
      case 'breeder-014': ownTarget.statuses.evadeNext = true; break;
      case 'breeder-015': applyAtkBuff(ownTarget, 5); break;
      case 'breeder-016': applyAtkBuff(ownTarget, livingUnits(player).filter((unit) => unit.faction === '魔族').length * 5); break;
      case 'breeder-017': player.tp = Math.min(player.maxTp, player.tp + livingUnits(player).filter((unit) => unit.faction === '獣族').length * 2); break;
      case 'breeder-018': this._heal(ownTarget, 15); break;
      case 'breeder-019':
        if (enemyTarget.faction === '無機') enemyTarget.statuses.stunOnNextTurn += 1;
        else enemyTarget.statuses.nextDamagePenalty += 0.2;
        break;
      case 'breeder-020':
        for (const unit of livingUnits(player).filter((candidate) => candidate.faction === '怪物')) {
          applyAtkBuff(unit, 5);
          applyDefBuff(unit, 5);
        }
        break;
      case '戦線整理': {
        const returned = (action.returnCardInstanceIds ?? [])
          .map((instanceId) => removeFrom(player.hand, (candidate) => candidate.instanceId === instanceId))
          .filter(Boolean);
        player.deck.unshift(...this.rng.shuffle(returned));
        this._drawCards(player, returned.length, 'breeder');
        break;
      }
      case '素材探索': {
        const inspected = player.deck.splice(Math.max(0, player.deck.length - 5));
        const chosen = removeFrom(inspected, (candidate) => candidate.instanceId === action.chosenCardInstanceId);
        player.deck.unshift(...this.rng.shuffle(inspected));
        if (chosen && player.hand.length < RULES.handLimit) player.hand.push(chosen);
        break;
      }
      case '融合強化指示':
        player.effects.nextFusionBuff = true;
        break;
      case '応急処置':
        this._heal(ownTarget, 10);
        if (ownTarget.stunnedThisTurn) {
          ownTarget.stunnedThisTurn = false;
          if (!ownTarget.summonedThisTurn) ownTarget.actionPoints = Math.max(1, ownTarget.actionPoints);
        } else if (ownTarget.statuses.stunOnNextTurn > 0) ownTarget.statuses.stunOnNextTurn -= 1;
        else ownTarget.statuses.nextDamagePenalty = 0;
        break;
      case '捨て身命令':
        ownTarget.statuses.nextDamageBonus += 0.3;
        ownTarget.statuses.recoilOnNextAttack = 10;
        break;
      case '全体防御命令':
        for (const unit of livingUnits(player)) {
          unit.statuses.nextDamageReduction = Math.min(0.9, unit.statuses.nextDamageReduction + 0.25);
        }
        break;
      case 'TP前借り':
        player.tp = Math.min(player.maxTp, player.tp + 2);
        player.effects.tpDebt = (player.effects.tpDebt ?? 0) + 1;
        break;
      case '逆境の号令':
        for (const unit of livingUnits(player)) {
          unit.timedAtkBuffs ??= [];
          unit.timedAtkBuffs.push({ amount: 5, remaining: 2 });
          unit.timedDefBuffs.push({ amount: 5, remaining: 2 });
        }
        break;
      case '強化解除指示':
        this._clearPositiveBattleEffects(enemyTarget);
        break;
      case '合体妨害工作':
        opponent.effects.nextTurnFusionLocks ??= [];
        opponent.effects.nextTurnFusionLocks.push({ remaining: 1, activeFromTurn: opponent.turnNumber + 1 });
        break;
      case '技術封鎖':
        opponent.effects.nextTurnMoveSurcharges ??= [];
        opponent.effects.nextTurnMoveSurcharges.push({ amount: 2, remaining: 1, activeFromTurn: opponent.turnNumber + 1 });
        break;
      case '状態浄化':
        this._clearNegativeBattleEffects(ownTarget);
        break;
      case '反転防壁':
        for (const unit of livingUnits(player)) unit.timedDefBuffs.push({ amount: 5, remaining: 2 });
        break;
      case '緊急撤退指示': {
        const slot = findUnitSlot(player, ownTarget.id);
        player.board[slot] = null;
        player.hand.push({
          instanceId: ownTarget.sourceCardInstanceId,
          masterId: ownTarget.sourceMasterId,
          artVariantId: ownTarget.artVariantId ?? 'base',
          finish: ownTarget.finish ?? 'normal',
          origin: ownTarget.origin ?? 'core',
        });
        break;
      }
      case '無機・オーバークロック':
        ownTarget.temporaryAtk += 10;
        ownTarget.statuses.overclockPendingDefPenalty = 5;
        break;
      case '無機・自動修復':
        ownTarget.statuses.autoRepairRemaining = (ownTarget.statuses.autoRepairRemaining ?? 0) + 3;
        break;
      case '創造・再設計':
        ownTarget.statuses.swapAtkDef = true;
        break;
      case '創造・予備パーツ':
        ownTarget.statuses.spareParts = true;
        break;
      case '幻霊・残響詠唱':
        ownTarget.statuses.echoNext = 0.4;
        break;
      case '幻霊・霊界帰還':
        ownTarget.statuses.returnToHandOnDefeat = true;
        break;
      case '魔族・血の契約':
        player.life -= 10;
        player.tp = Math.min(player.maxTp, player.tp + 3);
        break;
      case '魔族・呪印':
        enemyTarget.statuses.incomingFlatDamage = { amount: 5, remaining: 2 };
        break;
      case '獣族・狩猟本能':
        ownTarget.statuses.nextDamageBonus += 0.25;
        ownTarget.statuses.tpOnNextKill = 1;
        break;
      case '獣族・群れの守り':
        for (const unit of livingUnits(player).filter((candidate) => candidate.faction === '獣族')) {
          unit.statuses.nextDamageReduction = Math.min(0.9, unit.statuses.nextDamageReduction + 0.25);
        }
        break;
      case '怪物・暴食': {
        const material = removeFrom(player.hand, (candidate) => candidate.instanceId === action.materialCardInstanceId);
        const materialDef = material ? cardDefinition(this.masterIndex, material) : null;
        if (material) player.graveyard.push(material);
        this._heal(ownTarget, Math.min(20, (materialDef?.summonTp ?? 0) * 5));
        break;
      }
      case '怪物・捕食進化':
        ownTarget.statuses.predationEvolution = true;
        break;
      case '無機・機神起動':
        ownTarget.timedAtkBuffs.push({ amount: 10, remaining: 2 });
        ownTarget.timedDefBuffs.push({ amount: 10, remaining: 2 });
        break;
      case '創造・神造再演':
        ownTarget.actionPoints += 1;
        ownTarget.statuses.nextDamageBonus += 0.3;
        break;
      case '幻霊・黄泉の残唱':
        ownTarget.statuses.echoNext = Math.max(ownTarget.statuses.echoNext, 0.6);
        ownTarget.statuses.returnToHandOnDefeat = true;
        break;
      case '魔族・終末契約':
        player.life -= 15;
        ownTarget.statuses.nextDamageBonus += 0.5;
        break;
      case '獣族・王者の咆哮':
        for (const unit of livingUnits(player).filter((candidate) => candidate.faction === '獣族')) {
          unit.timedAtkBuffs.push({ amount: 5, remaining: 2 });
          unit.statuses.nextDamageReduction = Math.min(0.9, unit.statuses.nextDamageReduction + 0.25);
        }
        break;
      case '怪物・完全捕食': {
        const material = removeFrom(player.hand, (candidate) => candidate.instanceId === action.materialCardInstanceId);
        if (material) player.graveyard.push(material);
        this._heal(ownTarget, 20);
        applyAtkBuff(ownTarget, 10);
        break;
      }
      default: throw new Error(`Unsupported breeder: ${definition.name}`);
    }
    this._log('breeder', `${player.displayName}は${definition.name}を使用`, {
      playerId: player.id,
      breederId: definition.id,
      cardMasterId: definition.id,
      targetUnitId: action.targetUnitId,
    });
  }

  _hasRemovableBuff(unit) {
    return unit.atkMod > 0 || unit.defMod > 0 || unit.temporaryAtk > 0 || unit.temporaryDef > 0
      || (unit.timedAtkBuffs ?? []).some((buff) => buff.amount > 0)
      || (unit.timedDefBuffs ?? []).some((buff) => buff.amount > 0)
      || unit.statuses.nextDamageBonus > 0 || unit.statuses.nextDamageReduction > 0
      || unit.statuses.spareParts || unit.statuses.echoNext > 0
      || unit.statuses.autoRepairRemaining > 0 || unit.statuses.tpOnNextKill > 0
      || unit.statuses.predationEvolution;
  }

  _clearPositiveBattleEffects(unit) {
    unit.atkMod = Math.min(0, unit.atkMod);
    unit.defMod = Math.min(0, unit.defMod);
    unit.temporaryAtk = Math.min(0, unit.temporaryAtk);
    unit.temporaryDef = Math.min(0, unit.temporaryDef);
    unit.timedAtkBuffs = (unit.timedAtkBuffs ?? []).filter((buff) => buff.amount <= 0);
    unit.timedDefBuffs = (unit.timedDefBuffs ?? []).filter((buff) => buff.amount <= 0);
    unit.statuses.nextDamageBonus = 0;
    unit.statuses.nextDamageReduction = 0;
    unit.statuses.spareParts = false;
    unit.statuses.echoNext = 0;
    unit.statuses.autoRepairRemaining = 0;
    unit.statuses.tpOnNextKill = 0;
    unit.statuses.predationEvolution = false;
  }

  _hasRemovableDebuff(unit) {
    return unit.atkMod < 0 || unit.defMod < 0 || unit.temporaryAtk < 0 || unit.temporaryDef < 0
      || unit.statuses.nextDamagePenalty > 0 || unit.statuses.stunOnNextTurn > 0 || unit.stunnedThisTurn
      || Boolean(unit.statuses.parasite) || Boolean(unit.statuses.incomingFlatDamage)
      || unit.statuses.overclockPendingDefPenalty > 0 || unit.statuses.recoilOnNextAttack > 0;
  }

  _clearNegativeBattleEffects(unit) {
    unit.atkMod = Math.max(0, unit.atkMod);
    unit.defMod = Math.max(0, unit.defMod);
    unit.temporaryAtk = Math.max(0, unit.temporaryAtk);
    unit.temporaryDef = Math.max(0, unit.temporaryDef);
    unit.statuses.nextDamagePenalty = 0;
    unit.statuses.stunOnNextTurn = 0;
    unit.statuses.parasite = null;
    unit.statuses.incomingFlatDamage = null;
    unit.statuses.overclockPendingDefPenalty = 0;
    unit.statuses.recoilOnNextAttack = 0;
    if (unit.stunnedThisTurn && !unit.summonedThisTurn) {
      unit.stunnedThisTurn = false;
      unit.actionPoints = Math.max(1, unit.actionPoints);
    }
  }

  _checkPlayerLife(player, winnerId, reason) {
    if (player.life <= 0 && this.state.status === 'active') this._finish(winnerId, reason);
  }

  _resolveTurnLimit() {
    const [firstId, secondId] = this.state.playerOrder;
    const first = this.player(firstId);
    const second = this.player(secondId);
    if (first.life > second.life) this._finish(first.id, 'turn-limit-life');
    else if (second.life > first.life) this._finish(second.id, 'turn-limit-life');
    else this._finish(null, 'turn-limit-draw');
  }

  _finish(winnerId, reason) {
    this.state.status = 'finished';
    this.state.winnerId = winnerId;
    this.state.result = {
      winnerId,
      loserId: winnerId ? opposingId(this.state, winnerId) : null,
      draw: winnerId == null,
      reason,
      round: this.state.round,
      halfTurn: this.state.halfTurn,
      life: Object.fromEntries(this.state.playerOrder.map((id) => [id, this.player(id).life])),
    };
    this._log('battle-end', winnerId ? `${this.player(winnerId).displayName}の勝利` : '引き分け', this.state.result);
  }

  _log(type, message, data = {}) {
    this.state.log.push({
      id: `event-${++this.eventSequence}`,
      type,
      message,
      round: this.state.round,
      halfTurn: this.state.halfTurn,
      ...clone(data),
    });
  }
}

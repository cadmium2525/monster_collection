import { createMasterIndex } from '../data/master-loader.js';
import { SeededRng } from '../core/rng.js';
import { assertLegalDeck, determineFirstPlayer, normalizeDeckCards, totalPlayTp } from './deck.js';
import {
  actionKey,
  clone,
  createPlayerState,
  createUnit,
  currentSp,
  effectiveAtk,
  effectiveDef,
  findUnit,
  findUnitSlot,
  lifeRatio,
  livingUnits,
  normalizeGrowth,
} from './state.js';
import {
  applyAtkBuff,
  applyAtkDebuff,
  applyDefBuff,
  applyDefDebuff,
  applyIncomingModifiers,
  combatStats,
  defenseIgnore,
  hasNormalTrait,
  outgoingDamageMultiplier,
  resolvedMovePower,
  resolvedMoveTp,
  updateConsecutiveTarget,
} from './effects.js';
import { RULES } from './rules.js';

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

export class BattleEngine {
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

  getGrowthSnapshot(playerId) {
    return clone(this.player(playerId).tournamentGrowth);
  }

  getLegalActions(playerId = this.state.currentPlayerId) {
    if (this.state.status !== 'active' || playerId !== this.state.currentPlayerId) return [];
    const player = this.player(playerId);
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
            label: `${definition.name}を召喚`,
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
          const poolType = definition.id === 'shugyo-attack' ? 'attack' : 'defense';
          const poolNames = this.masterData.shugyoPools[unit.baseMonsterName]?.[poolType] ?? [];
          const learnable = poolNames
            .map((name) => this.masterIndex.movesByName.get(`${unit.baseMonsterName}:${name}`))
            .filter((move) => move && !unit.learnedMoveIds.includes(move.id));
          const candidates = learnable.length ? learnable : [null];
          for (const move of candidates) {
            const replacements = move && unit.equippedMoveIds.length >= RULES.equippedMoveSlots
              ? [null, ...unit.equippedMoveIds]
              : [null];
            for (const replaceMoveId of replacements) {
              actions.push({
                type: 'shugyo',
                cardInstanceId: card.instanceId,
                unitId: unit.id,
                learnMoveId: move?.id ?? null,
                replaceMoveId,
                cost: definition.tp,
                label: `${unit.name}が${definition.name}${move ? `・${move.name}習得` : ''}`,
              });
            }
          }
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
    if (player.turnNumber >= unlockTurn) {
      const materials = player.hand
        .map((card) => ({ card, definition: cardDefinition(this.masterIndex, card) }))
        .filter(({ definition }) => definition.kind === 'monster');
      for (const main of livingUnits(player).filter((unit) => unit.fusionStage < RULES.maxFusionStage)) {
        for (const { card, definition } of materials) {
          if (player.tp >= RULES.normalFusionTp) {
            actions.push({
              type: 'fusion-normal',
              unitId: main.id,
              materialCardInstanceId: card.instanceId,
              cost: RULES.normalFusionTp,
              label: `${main.name} + ${definition.name}（通常合体）`,
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
              label: `${special.name}へ特殊合体`,
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

    for (const unit of livingUnits(player)) {
      unit.actionPoints = 1;
      unit.summonedThisTurn = false;
      unit.stunnedThisTurn = false;
      unit.movesUsedThisTurn = 0;
      unit.temporaryAtk = 0;
      unit.temporaryDef = 0;
      unit.statuses.temporaryTurnDamageBonus = 0;
      unit.statuses.gallionGuard = false;
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
  }

  _endTurn() {
    const player = this.player(this.state.currentPlayerId);
    this._applyTurnEndEffects(player);
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
    if (action.learnMoveId && !unit.learnedMoveIds.includes(action.learnMoveId) && unit.learnedMoveIds.length < RULES.maxLearnedMoves) {
      learnedMove = this.masterIndex.moves.get(action.learnMoveId);
      unit.learnedMoveIds.push(action.learnMoveId);
      growth.learnedMoveIds.push(action.learnMoveId);
      if (unit.equippedMoveIds.length < RULES.equippedMoveSlots) {
        unit.equippedMoveIds.push(action.learnMoveId);
        growth.equippedMoveIds.push(action.learnMoveId);
      } else if (action.replaceMoveId && unit.equippedMoveIds.includes(action.replaceMoveId)) {
        const replaceIndex = unit.equippedMoveIds.indexOf(action.replaceMoveId);
        unit.equippedMoveIds[replaceIndex] = action.learnMoveId;
        growth.equippedMoveIds = [...unit.equippedMoveIds];
      }
    }

    player.tp -= definition.tp;
    player.graveyard.push(card);
    player.metrics.shugyoUses += 1;
    this._log('shugyo', `${unit.name}が修行（LIFE+${lifeGain} / ${definition.stat.toUpperCase()}+${statGain}${learnedMove ? ` / ${learnedMove.name}習得` : ''}）`, {
      playerId: player.id,
      unitId: unit.id,
      lifeGain,
      stat: definition.stat,
      statGain,
      learnedMoveId: learnedMove?.id ?? null,
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
    const mainSp = currentSp(main);
    const newSp = Math.max(3, Math.round(((mainSp + materialSp) / 2) * RULES.fusionMultiplier));
    const currentLifeRatio = lifeRatio(main);
    const lifeWeight = main.maxLife / mainSp;
    const atkWeight = main.atkBase / mainSp;
    const newMaxLife = Math.max(1, Math.round(newSp * lifeWeight));
    const newAtk = Math.max(1, Math.round(newSp * atkWeight));
    const newDef = Math.max(1, newSp - newMaxLife - newAtk);
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
      main.specialForm = fusion.name;
      main.name = fusion.name;
      main.specialTrait = fusion.trait;
      main.traitName = '特殊特性';
      main.traitEffect = fusion.trait;
      main.statuses.specialCounters = {};
      if (fusion.name === 'ダークハム') {
        main.defMod += 8;
        main.statuses.specialCounters.darkHamDef = 8;
      }
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
      fusionId: fusion?.id ?? null,
      newSp,
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
    unit.actionPoints -= 1;
    player.metrics.attacks += 1;

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
      opponent.life -= damage;
      player.metrics.damageDealt += damage;
      player.metrics.directDamage += damage;
      this._consumeDamageStatuses(unit);
      this._applyPostMoveEffects(player, opponent, unit, null, move, { damage, defeated: false, actual: damage });
      unit.movesUsedThisTurn += 1;
      this._afterMoveUse(unit, move, opponent.life <= 0);
      this._log('direct-attack', `${unit.name}の${move.name}。${opponent.displayName}へ${damage}ダメージ`, {
        playerId: player.id,
        unitId: unit.id,
        moveId: move.id,
        damage,
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
    player.metrics.damageDealt += damageResult.actual + damageResult.overflow;
    this._consumeDamageStatuses(unit);
    this._applyPostMoveEffects(player, opponent, unit, target, move, damageResult);
    updateConsecutiveTarget(unit, target.id);
    unit.movesUsedThisTurn += 1;
    this._afterMoveUse(unit, move, damageResult.defeated);
    this._log('attack', `${unit.name}の${move.name}。${target.name}へ${damageResult.actual}ダメージ${damageResult.overflow ? `、超過${damageResult.overflow}` : ''}`, {
      playerId: player.id,
      unitId: unit.id,
      targetUnitId: target.id,
      moveId: move.id,
      cost,
      power,
      attack,
      defense: effectiveDefense,
      damage: damageResult.actual,
      overflow: damageResult.overflow,
      defeated: damageResult.defeated,
      redirected: target.id !== action.targetUnitId,
      incomingTriggers: damageResult.incomingTriggers,
    });
    if (damageResult.overflow) opponent.life -= damageResult.overflow;
    this._checkPlayerLife(opponent, player.id, 'overflow');
  }

  _damageUnit(owner, unit, rawDamage, attacker) {
    if (unit.statuses.evadeNext) {
      unit.statuses.evadeNext = false;
      this._onAttacked(unit, attacker, 0, false);
      return { actual: 0, overflow: 0, defeated: false, evaded: true, incomingTriggers: ['完全回避'] };
    }
    const { damage, triggers } = applyIncomingModifiers(unit, rawDamage);
    const before = unit.life;
    unit.life -= damage;
    let defeated = unit.life <= 0;
    let overflow = defeated ? Math.max(0, damage - before) : 0;

    if (defeated && hasNormalTrait(unit, 'ヒノトリ') && !unit.statuses.phoenixUsed) {
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
    this._onAttacked(unit, attacker, actual, defeated);
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
      if (hasNormalTrait(unit, 'ハム')) {
        const gain = Math.min(5, 15 - unit.statuses.hamKillBonus);
        unit.statuses.hamKillBonus += Math.max(0, gain);
      }
      if (hasNormalTrait(unit, 'ディノ')) this._heal(unit, 10);
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
  }

  _selfDamage(owner, unit, amount) {
    const result = this._damageUnit(owner, unit, amount, null);
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
    owner.graveyard.push({ instanceId: unit.sourceCardInstanceId, masterId: unit.sourceMasterId });
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
    for (const unit of [...livingUnits(player)]) {
      const parasite = unit.statuses.parasite;
      if (parasite) {
        const sourcePlayer = this.state.players[parasite.sourcePlayerId];
        const source = sourcePlayer ? findUnit(sourcePlayer, parasite.sourceUnitId) : null;
        if (!source) unit.statuses.parasite = null;
        else {
          unit.life -= 5;
          this._heal(source, 5);
          this._log('trait', `寄生根が${unit.name}へ5ダメージ`, { unitId: unit.id, sourceUnitId: source.id });
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
      unit.temporaryAtk = 0;
      unit.temporaryDef = 0;
      unit.statuses.temporaryTurnDamageBonus = 0;
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
    player.effects.nextOwnMaxTpBonuses = player.effects.nextOwnMaxTpBonuses.filter((effect) => effect.remaining > 0);
    player.effects.nextTurnMaxTpPenalties = player.effects.nextTurnMaxTpPenalties.filter((effect) => effect.remaining > 0);
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
    switch (definition.name) {
      case 'ベテランブリーダー':
      case 'プレッシャー指示':
      case '緊急補給':
      case '総攻撃命令':
      case '創造①':
        return [{ ...base, targetUnitId: null, label: definition.name }];
      case '集中指示':
      case '守備指示':
        return targetActions(own);
      case '再行動指示':
        return targetActions(own.filter((unit) => unit.actionPoints <= 0 && !unit.summonedThisTurn && !unit.stunnedThisTurn));
      case '妨害指示':
        return targetActions(enemy);
      case '無機①':
      case '無機②':
        return targetActions(own.filter((unit) => unit.faction === '無機'));
      case '創造②':
        return targetActions(enemy);
      case '幻霊①':
        return targetActions(own.filter((unit) => unit.faction === '幻霊' && !unit.summonedThisTurn && !unit.stunnedThisTurn));
      case '幻霊②':
        return targetActions(own);
      case '魔族①':
      case '魔族②':
        return targetActions(own.filter((unit) => unit.faction === '魔族'));
      case '獣族①':
        return own.some((unit) => unit.faction === '獣族') ? [{ ...base, targetUnitId: null, label: definition.name }] : [];
      case '獣族②':
        return targetActions(own.filter((unit) => unit.faction === '獣族'));
      case '怪物①':
        return targetActions(enemy);
      case '怪物②':
        return own.filter((unit) => unit.faction === '怪物').length >= 2
          ? [{ ...base, targetUnitId: null, label: definition.name }]
          : [];
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

    switch (definition.name) {
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
      case '無機①': ownTarget.timedDefBuffs.push({ amount: 5, remaining: 3 }); break;
      case '無機②': ownTarget.statuses.vsCreationDefIgnore = { base: 3, creation: 5 }; break;
      case '創造①': player.effects.factionMoveDiscount['創造'] = (player.effects.factionMoveDiscount['創造'] ?? 0) + 1; break;
      case '創造②': enemyTarget.statuses.stunOnNextTurn += 1; break;
      case '幻霊①': ownTarget.actionPoints += 1; break;
      case '幻霊②': ownTarget.statuses.evadeNext = true; break;
      case '魔族①': applyAtkBuff(ownTarget, 5); break;
      case '魔族②': applyAtkBuff(ownTarget, livingUnits(player).filter((unit) => unit.faction === '魔族').length * 5); break;
      case '獣族①': player.tp = Math.min(player.maxTp, player.tp + livingUnits(player).filter((unit) => unit.faction === '獣族').length * 2); break;
      case '獣族②': this._heal(ownTarget, 15); break;
      case '怪物①':
        if (enemyTarget.faction === '無機') enemyTarget.statuses.stunOnNextTurn += 1;
        else enemyTarget.statuses.nextDamagePenalty += 0.2;
        break;
      case '怪物②':
        for (const unit of livingUnits(player).filter((candidate) => candidate.faction === '怪物')) {
          applyAtkBuff(unit, 5);
          applyDefBuff(unit, 5);
        }
        break;
      default: throw new Error(`Unsupported breeder: ${definition.name}`);
    }
    this._log('breeder', `${player.displayName}は${definition.name}を使用`, {
      playerId: player.id,
      breederId: definition.id,
      targetUnitId: action.targetUnitId,
    });
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

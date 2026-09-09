import { RULES } from '../battle/rules.js';
import { resolvedMoveTp } from '../battle/effects.js';
import { effectiveAtk, effectiveDef } from '../battle/state.js';

export const AI_FACTIONS = Object.freeze(['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物']);

export const COMBO_PACKAGES = Object.freeze({
  '機鋼': Object.freeze({ setupId: 'breeder-056', payoffId: 'breeder-057', id: 'pressure-release' }),
  '神造': Object.freeze({ setupId: 'breeder-058', payoffId: 'breeder-059', id: 'sanctuary-manifestation' }),
  '幻霊': Object.freeze({ setupId: 'breeder-060', payoffId: 'breeder-061', id: 'ghost-afterimage' }),
  '魔族': Object.freeze({ setupId: 'breeder-062', payoffId: 'breeder-063', id: 'blood-debt' }),
  '獣族': Object.freeze({ setupId: 'breeder-064', payoffId: 'breeder-065', id: 'hunting-spoils' }),
  '怪物': Object.freeze({ setupId: 'breeder-066', payoffId: 'breeder-067', id: 'remnant-inheritance' }),
});

function add(counter, key, amount = 1) {
  if (key == null) return;
  counter[key] = (counter[key] ?? 0) + amount;
}

function cardMasterIds(cards = []) {
  return cards.map((card) => card?.masterId).filter(Boolean);
}

function playerDeckMasterIds(player) {
  const byInstance = new Map();
  for (const zone of [player.deck, player.hand, player.graveyard, player.setAside]) {
    for (const card of zone ?? []) if (card?.instanceId) byInstance.set(card.instanceId, card.masterId);
  }
  for (const unit of player.board ?? []) {
    if (unit?.sourceCardInstanceId && !byInstance.has(unit.sourceCardInstanceId)) {
      byInstance.set(unit.sourceCardInstanceId, unit.sourceMasterId);
    }
  }
  return [...byInstance.values()].filter(Boolean);
}

function fusionRoutes(masterIndex, monsterCounts) {
  return masterIndex.data.fusions.map((fusion) => {
    const main = masterIndex.monstersByName.get(fusion.main);
    const material = masterIndex.monstersByName.get(fusion.material);
    const mainCopies = monsterCounts[main?.id] ?? 0;
    const materialCopies = monsterCounts[material?.id] ?? 0;
    const copies = Math.min(mainCopies, materialCopies);
    const powerIndex = Number(fusion.powerIndex) || 100;
    return {
      id: fusion.id,
      name: fusion.name,
      faction: main?.faction ?? null,
      mainId: main?.id ?? null,
      materialId: material?.id ?? null,
      mainCopies,
      materialCopies,
      copies,
      powerIndex,
      score: copies * 24 + Math.min(3, mainCopies + materialCopies) * 2
        + Math.max(0, powerIndex - 90) * 1.5,
    };
  }).filter((route) => route.copies > 0)
    .sort((a, b) => b.copies - a.copies
      || b.powerIndex - a.powerIndex
      || b.score - a.score
      || a.id.localeCompare(b.id));
}

export function analyzeDeckStrategy(cards, masterIndex) {
  const ids = cardMasterIds(cards);
  const cardCounts = {};
  const monsterCounts = {};
  const factionMonsterCounts = Object.fromEntries(AI_FACTIONS.map((faction) => [faction, 0]));
  const factionScores = Object.fromEntries(AI_FACTIONS.map((faction) => [faction, 0]));
  let monsterTotal = 0;
  let attackGrowth = 0;
  let defenseGrowth = 0;

  for (const id of ids) {
    add(cardCounts, id);
    const definition = masterIndex.cards.get(id);
    if (!definition) continue;
    if (definition.kind === 'monster') {
      add(monsterCounts, id);
      add(factionMonsterCounts, definition.faction);
      add(factionScores, definition.faction, 4);
      monsterTotal += 1;
    }
    if (definition.kind === 'breeder' && definition.faction) add(factionScores, definition.faction, 3);
    if (definition.stat === 'atk' || definition.kind === 'shugyo' && definition.focus === 'attack') attackGrowth += 1;
    if (definition.stat === 'def' || definition.stat === 'life' || definition.kind === 'shugyo' && definition.focus === 'defense') defenseGrowth += 1;
  }

  const routes = fusionRoutes(masterIndex, monsterCounts);
  for (const route of routes) add(factionScores, route.faction, route.copies * 7);

  const combos = AI_FACTIONS.map((faction) => {
    const definition = COMBO_PACKAGES[faction];
    const setupCopies = cardCounts[definition.setupId] ?? 0;
    const payoffCopies = cardCounts[definition.payoffId] ?? 0;
    const completeCopies = Math.min(setupCopies, payoffCopies);
    if (completeCopies) add(factionScores, faction, completeCopies * 10);
    return {
      ...definition,
      faction,
      setupCopies,
      payoffCopies,
      completeCopies,
      score: completeCopies * 20 + Math.min(setupCopies + payoffCopies, 3) * 2 + factionMonsterCounts[faction],
    };
  }).filter((combo) => combo.setupCopies || combo.payoffCopies)
    .sort((a, b) => b.score - a.score || a.faction.localeCompare(b.faction, 'ja'));

  const factions = AI_FACTIONS.map((faction) => ({
    faction,
    monsters: factionMonsterCounts[faction],
    monsterShare: monsterTotal ? factionMonsterCounts[faction] / monsterTotal : 0,
    score: factionScores[faction],
  })).sort((a, b) => b.score - a.score || b.monsters - a.monsters || a.faction.localeCompare(b.faction, 'ja'));
  const primary = factions[0];
  const secondary = factions[1];
  const focused = primary.monsterShare >= 0.6 || primary.score >= secondary.score + 14;
  const preferredRoutes = routes.filter((route) => route.faction === primary.faction || !focused).slice(0, 3);
  const ace = preferredRoutes[0] ?? routes[0] ?? null;
  const activeCombo = combos.find((combo) => combo.faction === primary.faction && combo.completeCopies > 0)
    ?? combos.find((combo) => combo.completeCopies > 0)
    ?? null;

  return {
    archetype: focused ? primary.faction : 'バランス',
    primaryFaction: primary.score > 0 ? primary.faction : null,
    secondaryFaction: secondary.score > 0 ? secondary.faction : null,
    confidence: primary.score > 0 ? Math.min(1, (primary.score - secondary.score + 20) / 60) : 0,
    pace: attackGrowth >= defenseGrowth + 3 ? 'attack' : defenseGrowth >= attackGrowth + 3 ? 'defense' : 'balanced',
    monsterTotal,
    cardCounts,
    monsterCounts,
    factionScores,
    factions,
    fusionRoutes: routes,
    preferredFusionIds: preferredRoutes.map((route) => route.id),
    ace,
    combos,
    activeCombo,
  };
}

export function analyzePlayerStrategy(engine, playerId) {
  const strategy = analyzeDeckStrategy(
    playerDeckMasterIds(engine.player(playerId)).map((masterId, index) => ({ instanceId: `analysis-${index}`, masterId })),
    engine.masterIndex,
  );
  return { ...strategy, playerId };
}

function unitById(player, unitId) {
  return player.board.find((unit) => unit?.id === unitId) ?? null;
}

function handCard(player, instanceId) {
  return player.hand.find((card) => card.instanceId === instanceId) ?? null;
}

function accessibleFusionCopies(player, masterId, role) {
  const hiddenCopies = (player.deck ?? []).filter((card) => card.masterId === masterId).length
    + (player.hand ?? []).filter((card) => card.masterId === masterId).length;
  if (role !== 'main') return hiddenCopies;
  return hiddenCopies + (player.board ?? []).filter((unit) => (
    unit?.sourceMasterId === masterId && !unit.awakened && unit.fusionStage < RULES.maxFusionStage
  )).length;
}

function committedMasterId(player, action) {
  if (action.type === 'summon') return handCard(player, action.cardInstanceId)?.masterId ?? null;
  if (['fusion-normal', 'fusion-special'].includes(action.type)) {
    return handCard(player, action.materialCardInstanceId)?.masterId ?? null;
  }
  if (action.type === 'breeder' && action.materialCardInstanceId) {
    return handCard(player, action.materialCardInstanceId)?.masterId ?? null;
  }
  if (action.type === 'awaken') return unitById(player, action.materialUnitId)?.sourceMasterId ?? null;
  return null;
}

function protectedUsePenalty(player, strategy, action) {
  const ace = strategy.ace;
  if (!ace) return 0;
  if (action.type === 'fusion-special' && action.fusionId === ace.id) return 0;
  const consumedId = committedMasterId(player, action);
  if (action.type === 'summon' && consumedId === ace.mainId) return 0;
  if (['fusion-normal', 'fusion-special'].includes(action.type)) {
    const main = unitById(player, action.unitId);
    if (main?.sourceMasterId === ace.mainId && main.fusionStage >= 1) return -100;
  }
  if (![ace.mainId, ace.materialId].includes(consumedId)) return 0;
  const role = consumedId === ace.mainId ? 'main' : 'material';
  const remaining = accessibleFusionCopies(player, consumedId, role) - 1;
  return remaining <= 0 ? -170 : remaining === 1 ? -70 : -22;
}

function canUnitAttack(engine, playerId, unit) {
  if (!unit || unit.actionPoints <= 0 || unit.summonedThisTurn || unit.stunnedThisTurn) return false;
  const player = engine.player(playerId);
  const sealed = unit.statuses.attackSeal?.playerId === player.id
    && unit.statuses.attackSeal?.activeTurn === player.turnNumber;
  return !sealed && unit.equippedMoveIds.some((moveId) => engine.masterIndex.moves.get(moveId)?.power != null);
}

function minimumDamagingMoveCost(engine, playerId, unit) {
  if (!unit) return Number.POSITIVE_INFINITY;
  const player = engine.player(playerId);
  const opponent = engine.opponent(playerId);
  const targets = opponent.board.filter(Boolean);
  const costs = unit.equippedMoveIds.map((moveId) => engine.masterIndex.moves.get(moveId))
    .filter((move) => move?.power != null)
    .flatMap((move) => (targets.length ? targets : [null])
      .map((target) => resolvedMoveTp(player, unit, target, move, opponent)));
  return costs.length ? Math.min(...costs) : Number.POSITIVE_INFINITY;
}

function minimumAttackCost(engine, playerId, unit) {
  return canUnitAttack(engine, playerId, unit)
    ? minimumDamagingMoveCost(engine, playerId, unit)
    : Number.POSITIVE_INFINITY;
}

function canAttackAfterExtraAction(engine, playerId, unit) {
  if (!unit || unit.summonedThisTurn || unit.stunnedThisTurn) return false;
  const player = engine.player(playerId);
  const sealed = unit.statuses.attackSeal?.playerId === player.id
    && unit.statuses.attackSeal?.activeTurn === player.turnNumber;
  return !sealed && Number.isFinite(minimumDamagingMoveCost(engine, playerId, unit));
}

function projectedAttackDamage(engine, playerId, unit, additionalBonus = 0) {
  if (!unit) return 0;
  const opponent = engine.opponent(playerId);
  const targets = opponent.board.filter(Boolean);
  const multiplier = 1 + Math.max(0, Number(unit.statuses.nextDamageBonus) || 0) + additionalBonus;
  return unit.equippedMoveIds.reduce((best, moveId) => {
    const move = engine.masterIndex.moves.get(moveId);
    if (move?.power == null) return best;
    const attack = effectiveAtk(unit);
    if (!targets.length) return Math.max(best, Math.floor(attack * (move.power / 100) * multiplier));
    return Math.max(best, ...targets.map((target) => {
      const base = Math.max(0, Math.floor(attack * (move.power / 100) - Math.max(1, effectiveDef(target))));
      return Math.floor(base * multiplier);
    }));
  }, 0);
}

function payoffInHand(player, combo) {
  return player.hand.some((card) => card.masterId === combo.payoffId);
}

function enemyCanThreaten(engine, playerId) {
  return engine.opponent(playerId).board.some((unit) => unit?.equippedMoveIds.some(
    (moveId) => engine.masterIndex.moves.get(moveId)?.power != null,
  ));
}

function visibleDurability(unit) {
  const timedDef = (unit?.timedDefBuffs ?? []).reduce((sum, buff) => sum + (Number(buff.amount) || 0), 0);
  return Math.max(0, Number(unit?.life) || 0)
    + Math.max(0, (Number(unit?.defBase) || 0) + (Number(unit?.defMod) || 0)
      + (Number(unit?.temporaryDef) || 0) + timedDef) * 0.35;
}

function isLikelyAttackTarget(player, target) {
  if (!target) return false;
  const candidates = player.board.filter(Boolean);
  const weakest = Math.min(...candidates.map(visibleDurability));
  return visibleDurability(target) <= weakest + 5;
}

function canBuildPressure(engine, playerId, target) {
  if (!target) return false;
  const defense = effectiveDef(target);
  return engine.opponent(playerId).board.some((attacker) => attacker?.equippedMoveIds.some((moveId) => {
    const move = engine.masterIndex.moves.get(moveId);
    if (move?.power == null) return false;
    const unarmoredDamage = Math.max(0, Math.floor(effectiveAtk(attacker) * (move.power / 100) - defense));
    return unarmoredDamage >= 5;
  }));
}

function comboSetupIsTimely(engine, playerId, action, combo, strategy) {
  const player = engine.player(playerId);
  const target = unitById(player, action.targetUnitId);
  const setupCost = action.cost ?? 0;
  const payoffCost = engine.masterIndex.cards.get(combo.payoffId)?.tp ?? 0;
  const attackCost = minimumAttackCost(engine, playerId, target);
  const canFinishWithAttack = payoffInHand(player, combo)
    && Number.isFinite(attackCost)
    && player.tp >= setupCost + payoffCost + attackCost;

  switch (combo.faction) {
    case '機鋼':
      return payoffInHand(player, combo) && enemyCanThreaten(engine, playerId)
        && isLikelyAttackTarget(player, target) && !target?.statuses.pressureArmor
        && canBuildPressure(engine, playerId, target)
        && (target?.life ?? 0) + (target?.defBase ?? 0) >= 15;
    case '神造': {
      const missing = target ? target.maxLife - target.life : 0;
      const empoweredAttackCost = minimumDamagingMoveCost(engine, playerId, target);
      return missing >= 5 && missing <= 10 && payoffInHand(player, combo)
        && canAttackAfterExtraAction(engine, playerId, target)
        && player.tp >= setupCost + payoffCost + empoweredAttackCost;
    }
    case '幻霊':
      return payoffInHand(player, combo) && enemyCanThreaten(engine, playerId)
        && isLikelyAttackTarget(player, target) && !target?.statuses.ghostLink && !target?.statuses.evadeNext;
    case '魔族':
      return player.life > 2 && payoffInHand(player, combo) && Number.isFinite(attackCost)
        && player.tp >= setupCost + payoffCost + Math.max(1, attackCost - 1)
        // 自傷2を血債回収の40%吸収で取り戻せない小ダメージでは
        // コンボを始動しない。ゼロダメージで自滅する判断も防ぐ。
        && projectedAttackDamage(engine, playerId, target, 0.5) >= 8;
    case '獣族': {
      const ready = player.board.filter((unit) => unit?.faction === '獣族' && canUnitAttack(engine, playerId, unit));
      const twoAttackCost = ready.map((unit) => minimumAttackCost(engine, playerId, unit))
        .sort((a, b) => a - b).slice(0, 2).reduce((sum, cost) => sum + cost, 0);
      return ready.length >= 2 && player.tp >= setupCost + twoAttackCost + payoffCost;
    }
    case '怪物':
      return canFinishWithAttack && protectedUsePenalty(player, strategy, action) > -50;
    default:
      return false;
  }
}

function comboPayoffIsTimely(engine, playerId, action, combo) {
  const player = engine.player(playerId);
  const target = unitById(player, action.targetUnitId);
  const regularAttackCost = minimumAttackCost(engine, playerId, target);
  const bonusAttackCost = minimumDamagingMoveCost(engine, playerId, target);
  const canAttackAfter = Number.isFinite(regularAttackCost) && player.tp >= (action.cost ?? 0) + regularAttackCost;
  const canAttackAfterGrantedAction = canAttackAfterExtraAction(engine, playerId, target)
    && player.tp >= (action.cost ?? 0) + bonusAttackCost;
  switch (combo.faction) {
    // Even a partial charge should be converted before the target is removed;
    // the TP discount remains reserved for 5+ charge in the battle rules.
    case '機鋼': return (target?.statuses.pressureCharge ?? 0) > 0 && canAttackAfter;
    case '神造': return Boolean(target?.statuses.tuningReady) && canAttackAfterGrantedAction;
    case '幻霊': return Boolean(target?.statuses.afterimageReady) && canAttackAfterGrantedAction;
    case '魔族': return (player.effects.comboTurn?.selfLifeLost ?? 0) > 0
      && (target?.statuses.nextDamageBonus ?? 0) > 0
      && canAttackAfter;
    case '獣族': return Boolean(player.effects.comboTurn?.beastKill);
    case '怪物': return Boolean(player.effects.comboTurn?.monsterDiscarded);
    default: return false;
  }
}

function acePlan(engine, playerId, strategy, actions = null) {
  const ace = strategy.ace;
  if (!ace) return null;
  const player = engine.player(playerId);
  const unlockTurn = player.isFirst ? RULES.firstFusionTurn : RULES.secondFusionTurn;
  const fusionLocked = (player.effects.nextTurnFusionLocks ?? [])
    .some((effect) => effect.activeFromTurn <= player.turnNumber && effect.remaining > 0);
  if (player.turnNumber < unlockTurn || fusionLocked) return null;
  const legalActions = actions ?? [];
  const material = player.hand.find((card) => card.masterId === ace.materialId);
  const mainUnit = player.board.find((unit) => (
    unit?.sourceMasterId === ace.mainId && !unit.awakened && unit.fusionStage < RULES.maxFusionStage
  ));
  const fusion = actions
    ? legalActions.find((action) => action.type === 'fusion-special' && action.fusionId === ace.id)
    : material && mainUnit && player.tp >= RULES.specialFusionTp ? {
        type: 'fusion-special',
        unitId: mainUnit.id,
        materialCardInstanceId: material.instanceId,
        fusionId: ace.id,
        cost: RULES.specialFusionTp,
      } : null;
  if (fusion) {
    const boostCard = player.hand.find((card) => card.masterId === 'breeder-023');
    const boostDefinition = engine.masterIndex.cards.get('breeder-023');
    const boost = !player.effects.nextFusionBuff && boostCard
      ? actions
        ? legalActions.find((action) => action.type === 'breeder' && action.breederId === 'breeder-023')
        : {
            type: 'breeder',
            cardInstanceId: boostCard.instanceId,
            breederId: 'breeder-023',
            cost: boostDefinition?.tp ?? 0,
          }
      : null;
    const boostedCost = (boost?.cost ?? 0) + (fusion.cost ?? RULES.specialFusionTp);
    if (boost && player.tp >= boostedCost) {
      return { type: 'fusion-boost', action: boost, requiredTp: boostedCost };
    }
    return { type: 'fusion', action: fusion, requiredTp: fusion.cost ?? RULES.specialFusionTp };
  }

  const main = player.hand.find((card) => card.masterId === ace.mainId);
  if (!material || !main) return null;
  const emptySlot = player.board.findIndex((unit) => !unit);
  const summon = actions
    ? legalActions.find((action) => action.type === 'summon' && action.cardInstanceId === main.instanceId)
    : emptySlot >= 0 && player.tp >= (engine.masterIndex.cards.get(ace.mainId)?.summonTp ?? Number.POSITIVE_INFINITY) ? {
        type: 'summon',
        cardInstanceId: main.instanceId,
        slot: emptySlot,
        cost: engine.masterIndex.cards.get(ace.mainId)?.summonTp ?? 0,
      } : null;
  if (!summon) return null;
  const boostCard = player.hand.find((card) => card.masterId === 'breeder-023');
  const boostCost = boostCard && !player.effects.nextFusionBuff
    ? engine.masterIndex.cards.get('breeder-023')?.tp ?? 0
    : 0;
  const baseRequiredTp = (summon.cost ?? 0) + RULES.specialFusionTp;
  const boostedRequiredTp = baseRequiredTp + boostCost;
  const requiredTp = boostCost > 0 && player.tp >= boostedRequiredTp ? boostedRequiredTp : baseRequiredTp;
  return player.tp >= requiredTp ? { type: 'summon-main', action: summon, requiredTp } : null;
}

function comboAdjustment(engine, playerId, action, strategy) {
  if (action.type !== 'breeder') return 0;
  const combo = strategy.combos.find((entry) => [entry.setupId, entry.payoffId].includes(action.breederId));
  if (!combo || combo.completeCopies <= 0) return 0;
  const player = engine.player(playerId);
  const target = unitById(player, action.targetUnitId);
  const isSetup = action.breederId === combo.setupId;
  if (isSetup) {
    if (!comboSetupIsTimely(engine, playerId, action, combo, strategy)) return -115;
    const targetValue = combo.faction === '魔族'
      ? Math.min(40, projectedAttackDamage(engine, playerId, target, 0.5))
      : 0;
    return 86 + targetValue;
  }
  if (comboPayoffIsTimely(engine, playerId, action, combo)) {
    const targetValue = combo.faction === '魔族'
      ? Math.min(40, projectedAttackDamage(engine, playerId, target, 0.25))
      : 0;
    return 120 + targetValue;
  }
  switch (combo.faction) {
    case '機鋼':
      return (target?.statuses.pressureCharge ?? 0) > 0 ? -22 : -75;
    case '神造': return -65;
    case '幻霊': return -75;
    case '魔族': return -95;
    case '獣族': return -55;
    case '怪物': return -60;
    default:
      return 0;
  }
}

export function strategyActionAdjustment(engine, playerId, action, strategy) {
  if (!strategy || strategy.playerId !== playerId) return 0;
  const player = engine.player(playerId);
  let score = protectedUsePenalty(player, strategy, action);
  const plan = acePlan(engine, playerId, strategy);
  if (plan && actionKeyForPlan(action) !== actionKeyForPlan(plan.action)) {
    const remainingTp = player.tp - (action.cost ?? 0);
    if (remainingTp < plan.requiredTp || ['end-turn', 'fusion-normal'].includes(action.type)) score -= 180;
  }
  if (action.type === 'fusion-special') {
    const index = strategy.preferredFusionIds.indexOf(action.fusionId);
    if (index >= 0) score += index === 0 ? 125 : 55 - index * 10;
  }
  if (action.type === 'breeder' && action.breederId === 'breeder-022' && strategy.ace) {
    const chosen = player.deck.find((card) => card.instanceId === action.chosenCardInstanceId)?.masterId;
    const mainReady = player.hand.some((card) => card.masterId === strategy.ace.mainId)
      || player.board.some((unit) => unit?.sourceMasterId === strategy.ace.mainId && unit.fusionStage < RULES.maxFusionStage);
    const materialReady = player.hand.some((card) => card.masterId === strategy.ace.materialId);
    if (chosen === strategy.ace.mainId && !mainReady) score += 115;
    if (chosen === strategy.ace.materialId && !materialReady) score += 125;
  }
  if (action.type === 'breeder' && action.breederId === 'breeder-023' && plan?.type === 'fusion-boost') score += 145;
  if (action.type === 'summon' && strategy.ace) {
    const masterId = handCard(player, action.cardInstanceId)?.masterId;
    const hasMain = player.board.some((unit) => unit?.sourceMasterId === strategy.ace.mainId && unit.fusionStage < 2);
    if (masterId === strategy.ace.mainId && !hasMain) score += plan?.type === 'summon-main' ? 150 : 38;
    if (masterId === strategy.ace.materialId) score -= hasMain ? 120 : 75;
  }
  score += comboAdjustment(engine, playerId, action, strategy);
  return score;
}

function actionKeyForPlan(action) {
  if (!action) return '';
  return [action.type, action.cardInstanceId, action.unitId, action.materialCardInstanceId, action.fusionId]
    .filter((value) => value != null).join(':');
}

function missingAceSearchAction(player, strategy, actions) {
  if (!strategy.ace) return null;
  const mainReady = player.hand.some((card) => card.masterId === strategy.ace.mainId)
    || player.board.some((unit) => unit?.sourceMasterId === strategy.ace.mainId
      && !unit.awakened && unit.fusionStage < RULES.maxFusionStage);
  const materialReady = player.hand.some((card) => card.masterId === strategy.ace.materialId);
  const wantedId = mainReady && !materialReady ? strategy.ace.materialId
    : materialReady && !mainReady ? strategy.ace.mainId
      : null;
  if (!wantedId) return null;
  return actions.find((action) => action.type === 'breeder' && action.breederId === 'breeder-022'
    && player.deck.some((card) => card.instanceId === action.chosenCardInstanceId && card.masterId === wantedId)) ?? null;
}

function enhancedComboAction(engine, playerId, strategy, actions) {
  return actions.find((action) => {
    const combo = strategy.combos.find((entry) => entry.payoffId === action.breederId);
    if (!combo || combo.completeCopies <= 0) return false;
    return comboPayoffIsTimely(engine, playerId, action, combo);
  }) ?? null;
}

function preparatoryComboAction(engine, playerId, strategy, actions) {
  const candidates = actions.filter((action) => {
    const combo = strategy.combos.find((entry) => entry.setupId === action.breederId);
    if (!combo || combo.completeCopies <= 0) return false;
    return comboSetupIsTimely(engine, playerId, action, combo, strategy);
  });
  return candidates.sort((a, b) => strategyActionAdjustment(engine, playerId, b, strategy)
    - strategyActionAdjustment(engine, playerId, a, strategy))[0] ?? null;
}

function untimelyComboAction(engine, playerId, action, strategy) {
  if (action.type !== 'breeder') return false;
  const combo = strategy.combos.find((entry) => [entry.setupId, entry.payoffId].includes(action.breederId));
  if (!combo || combo.completeCopies <= 0) return false;
  return action.breederId === combo.setupId
    ? !comboSetupIsTimely(engine, playerId, action, combo, strategy)
    : !comboPayoffIsTimely(engine, playerId, action, combo);
}

export function applyStrategyGuardrails(engine, playerId, selected, strategy, scoreAction) {
  if (!strategy || strategy.playerId !== playerId) return selected;
  const actions = engine.getLegalActions(playerId).filter((action) => !action.meta?.aiAvoid);
  const plan = acePlan(engine, playerId, strategy, actions);
  if (plan) return plan.action;
  const payoff = enhancedComboAction(engine, playerId, strategy, actions);
  if (payoff) return payoff;
  const search = missingAceSearchAction(engine.player(playerId), strategy, actions);
  if (search) return search;
  const setup = preparatoryComboAction(engine, playerId, strategy, actions);
  if (setup) return setup;
  if (protectedUsePenalty(engine.player(playerId), strategy, selected) > -50
    && !untimelyComboAction(engine, playerId, selected, strategy)) return selected;
  const safe = actions.filter((action) => protectedUsePenalty(engine.player(playerId), strategy, action) > -50
    && !untimelyComboAction(engine, playerId, action, strategy));
  if (!safe.length) return selected;
  return safe.map((action) => ({ action, score: scoreAction(action) }))
    .sort((a, b) => b.score - a.score)[0].action;
}

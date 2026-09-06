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
    return {
      id: fusion.id,
      name: fusion.name,
      faction: main?.faction ?? null,
      mainId: main?.id ?? null,
      materialId: material?.id ?? null,
      mainCopies,
      materialCopies,
      copies,
      score: copies * 24 + Math.min(3, mainCopies + materialCopies) * 2,
    };
  }).filter((route) => route.copies > 0)
    .sort((a, b) => b.score - a.score || b.copies - a.copies || a.id.localeCompare(b.id));
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

function availableCopies(player, masterId) {
  return (player.deck ?? []).filter((card) => card.masterId === masterId).length
    + (player.hand ?? []).filter((card) => card.masterId === masterId).length
    + (player.board ?? []).filter((unit) => unit?.sourceMasterId === masterId).length;
}

function protectedUsePenalty(player, strategy, action) {
  const ace = strategy.ace;
  if (!ace) return 0;
  if (action.type === 'fusion-special' && action.fusionId === ace.id) return 0;
  let consumedId = null;
  if (['fusion-normal', 'fusion-special'].includes(action.type)) {
    consumedId = handCard(player, action.materialCardInstanceId)?.masterId ?? null;
    const main = unitById(player, action.unitId);
    if (main?.sourceMasterId === ace.mainId && main.fusionStage >= 1) return -100;
  }
  if (action.type === 'breeder' && action.materialCardInstanceId) {
    consumedId = handCard(player, action.materialCardInstanceId)?.masterId ?? null;
  }
  if (action.type === 'awaken') consumedId = unitById(player, action.materialUnitId)?.sourceMasterId ?? null;
  if (![ace.mainId, ace.materialId].includes(consumedId)) return 0;
  const remaining = availableCopies(player, consumedId);
  return remaining <= 1 ? -140 : remaining === 2 ? -55 : -18;
}

function comboAdjustment(engine, playerId, action, strategy) {
  if (action.type !== 'breeder') return 0;
  const combo = strategy.combos.find((entry) => [entry.setupId, entry.payoffId].includes(action.breederId));
  if (!combo || combo.completeCopies <= 0) return 0;
  const player = engine.player(playerId);
  const target = unitById(player, action.targetUnitId);
  const isSetup = action.breederId === combo.setupId;
  const payoffInHand = player.hand.some((card) => card.masterId === combo.payoffId);
  switch (combo.faction) {
    case '機鋼':
      if (isSetup) return target?.statuses.pressureArmor ? -25 : 26;
      return (target?.statuses.pressureCharge ?? 0) >= 5
        ? 55 + target.statuses.pressureCharge * 2
        : (target?.statuses.pressureCharge ?? 0) > 0 ? 24 : -48;
    case '神造': {
      if (!isSetup) return target?.statuses.tuningReady ? 68 : -38;
      const missing = target ? target.maxLife - target.life : 0;
      return missing >= 5 && missing <= 10 ? 42 : -30;
    }
    case '幻霊':
      if (isSetup) return target?.statuses.ghostLink ? -20 : 32;
      return target?.statuses.afterimageReady ? 72 : -48;
    case '魔族':
      if (isSetup) return payoffInHand && player.tp >= 3 ? 46 : 12;
      return (player.effects.comboTurn?.selfLifeLost ?? 0) > 0 ? 78 : -55;
    case '獣族': {
      if (!isSetup) return (player.effects.comboTurn?.beastKill ?? false) ? 65 : -30;
      const ready = player.board.filter((unit) => unit?.faction === '獣族' && unit.actionPoints > 0 && !unit.stunnedThisTurn).length;
      return ready >= 2 ? 36 : ready === 1 ? 10 : -20;
    }
    case '怪物':
      if (!isSetup) return (player.effects.comboTurn?.monsterDiscarded ?? false) ? 70 : -45;
      return payoffInHand && player.tp >= 3 ? 62 : 12;
    default:
      return 0;
  }
}

export function strategyActionAdjustment(engine, playerId, action, strategy) {
  if (!strategy || strategy.playerId !== playerId) return 0;
  const player = engine.player(playerId);
  let score = protectedUsePenalty(player, strategy, action);
  if (action.type === 'fusion-special') {
    const index = strategy.preferredFusionIds.indexOf(action.fusionId);
    if (index >= 0) score += index === 0 ? 125 : 55 - index * 10;
  }
  if (action.type === 'summon' && strategy.ace) {
    const masterId = handCard(player, action.cardInstanceId)?.masterId;
    const hasMain = player.board.some((unit) => unit?.sourceMasterId === strategy.ace.mainId && unit.fusionStage < 2);
    if (masterId === strategy.ace.mainId && !hasMain) score += 38;
    if (masterId === strategy.ace.materialId && hasMain) score -= 75;
  }
  score += comboAdjustment(engine, playerId, action, strategy);
  return score;
}

function enhancedComboAction(engine, playerId, strategy, actions) {
  const player = engine.player(playerId);
  return actions.find((action) => {
    const combo = strategy.combos.find((entry) => entry.payoffId === action.breederId);
    if (!combo || combo.completeCopies <= 0) return false;
    const target = unitById(player, action.targetUnitId);
    if (combo.faction === '機鋼') return (target?.statuses.pressureCharge ?? 0) >= 5;
    if (combo.faction === '神造') return Boolean(target?.statuses.tuningReady);
    if (combo.faction === '幻霊') return Boolean(target?.statuses.afterimageReady);
    if (combo.faction === '魔族') return (player.effects.comboTurn?.selfLifeLost ?? 0) > 0;
    if (combo.faction === '獣族') return Boolean(player.effects.comboTurn?.beastKill);
    if (combo.faction === '怪物') return Boolean(player.effects.comboTurn?.monsterDiscarded);
    return false;
  }) ?? null;
}

function preparatoryComboAction(engine, playerId, strategy, actions) {
  const player = engine.player(playerId);
  const candidates = actions.filter((action) => {
    const combo = strategy.combos.find((entry) => entry.setupId === action.breederId);
    if (!combo || combo.completeCopies <= 0) return false;
    const payoff = player.hand.find((card) => card.masterId === combo.payoffId);
    if (!payoff) return false;
    const payoffCost = engine.masterIndex.cards.get(combo.payoffId)?.tp ?? 0;
    if (player.tp < (action.cost ?? 0) + payoffCost) return false;
    const target = unitById(player, action.targetUnitId);
    if (combo.faction === '魔族') return true;
    if (combo.faction === '怪物') return protectedUsePenalty(player, strategy, action) > -50;
    if (combo.faction === '神造') {
      const missing = target ? target.maxLife - target.life : 0;
      return missing >= 5 && missing <= 10 && target.actionPoints > 0;
    }
    return false;
  });
  return candidates.sort((a, b) => strategyActionAdjustment(engine, playerId, b, strategy)
    - strategyActionAdjustment(engine, playerId, a, strategy))[0] ?? null;
}

export function applyStrategyGuardrails(engine, playerId, selected, strategy, scoreAction) {
  if (!strategy || strategy.playerId !== playerId) return selected;
  const actions = engine.getLegalActions(playerId).filter((action) => !action.meta?.aiAvoid);
  const payoff = enhancedComboAction(engine, playerId, strategy, actions);
  if (payoff) return payoff;
  const fusion = actions.find((action) => action.type === 'fusion-special' && action.fusionId === strategy.ace?.id);
  if (fusion) return fusion;
  const setup = preparatoryComboAction(engine, playerId, strategy, actions);
  if (setup) return setup;
  if (protectedUsePenalty(engine.player(playerId), strategy, selected) > -50) return selected;
  const safe = actions.filter((action) => protectedUsePenalty(engine.player(playerId), strategy, action) > -50);
  if (!safe.length) return selected;
  return safe.map((action) => ({ action, score: scoreAction(action) }))
    .sort((a, b) => b.score - a.score)[0].action;
}

import { RULES } from './rules.js';

export function clone(value) {
  return structuredClone(value);
}

export function actionKey(action) {
  const ordered = Object.keys(action)
    .filter((key) => !['label', 'preview', 'meta'].includes(key))
    .sort()
    .map((key) => [key, action[key]]);
  return JSON.stringify(ordered);
}

export function createPlayerState(definition, cards, rng, growth = {}) {
  return {
    id: definition.id,
    displayName: definition.displayName ?? definition.id,
    isFirst: false,
    life: RULES.playerLife,
    baseMaxTp: RULES.baseMaxTp,
    maxTp: RULES.baseMaxTp,
    tp: RULES.initialTp,
    turnNumber: 0,
    awakeningUsed: false,
    deck: rng.shuffle(cards),
    hand: [],
    graveyard: [],
    setAside: [],
    board: Array.from({ length: RULES.boardSlots }, () => null),
    tournamentGrowth: clone(growth),
    effects: {
      nextOwnMaxTpBonuses: [],
      nextTurnMaxTpPenalties: [],
      nextTurnFusionLocks: [],
      nextTurnMoveSurcharges: [],
      factionMoveDiscount: {},
      tpDebt: 0,
      nextFusionBuff: false,
    },
    metrics: {
      cardsDrawn: 0,
      reshuffles: 0,
      summons: 0,
      attacks: 0,
      damageDealt: 0,
      directDamage: 0,
      knockouts: 0,
      trainingUses: 0,
      shugyoUses: 0,
      breederUses: 0,
      fusions: 0,
      specialFusions: 0,
      awakenings: 0,
    },
  };
}

export function initialGrowthForMonster(monster, masterIndex) {
  const initialMoveIds = monster.moveIds.filter((moveId) => masterIndex.moves.get(moveId)?.initial);
  return {
    life: 0,
    atk: 0,
    def: 0,
    learnedMoveIds: initialMoveIds,
    equippedMoveIds: initialMoveIds.slice(0, RULES.equippedMoveSlots),
  };
}

export function normalizeGrowth(growth, monster, masterIndex) {
  const base = initialGrowthForMonster(monster, masterIndex);
  const learned = [...new Set([...(base.learnedMoveIds ?? []), ...(growth?.learnedMoveIds ?? [])])]
    .filter((moveId) => monster.moveIds.includes(moveId))
    .slice(0, RULES.maxLearnedMoves);
  const equipped = [...new Set(growth?.equippedMoveIds ?? base.equippedMoveIds)]
    .filter((moveId) => learned.includes(moveId))
    .slice(0, RULES.equippedMoveSlots);
  for (const moveId of learned) {
    if (equipped.length >= RULES.equippedMoveSlots) break;
    if (!equipped.includes(moveId)) equipped.push(moveId);
  }
  return {
    life: Math.max(0, Number(growth?.life) || 0),
    atk: Math.max(0, Number(growth?.atk) || 0),
    def: Math.max(0, Number(growth?.def) || 0),
    learnedMoveIds: learned,
    equippedMoveIds: equipped,
  };
}

export function createUnit({ unitId, card, monster, growth, masterIndex, slot }) {
  const normalizedGrowth = normalizeGrowth(growth, monster, masterIndex);
  return {
    id: unitId,
    sourceCardInstanceId: card.instanceId,
    sourceMasterId: monster.id,
    artVariantId: card.artVariantId ?? 'base',
    finish: card.finish ?? 'normal',
    origin: card.origin ?? 'core',
    slot,
    name: monster.name,
    baseMonsterName: monster.name,
    faction: monster.faction,
    role: monster.role,
    traitName: monster.trait.name,
    traitEffect: monster.trait.effect,
    traitEngine: clone(monster.trait.engine ?? {}),
    specialForm: null,
    specialFusionId: null,
    specialTrait: null,
    fusionStage: 0,
    awakened: false,
    awakeningAbilityId: null,
    awakeningAbilityName: null,
    awakeningAbilityEffect: null,
    awakeningAbilityLimit: null,
    absorbedCardInstanceIds: [],
    maxLife: monster.base.life + normalizedGrowth.life,
    life: monster.base.life + normalizedGrowth.life,
    atkBase: monster.base.atk + normalizedGrowth.atk,
    defBase: monster.base.def + normalizedGrowth.def,
    atkMod: 0,
    defMod: 0,
    temporaryAtk: 0,
    temporaryDef: 0,
    timedAtkBuffs: [],
    timedDefBuffs: [],
    actionPoints: 0,
    summonedThisTurn: true,
    stunnedThisTurn: false,
    movesUsedThisTurn: 0,
    learnedMoveIds: normalizedGrowth.learnedMoveIds,
    equippedMoveIds: normalizedGrowth.equippedMoveIds,
    statuses: {
      nextDamageBonus: 0,
      nextDamagePenalty: 0,
      nextDamageReduction: 0,
      evadeNext: monster.name === 'ゴースト' || Boolean(monster.trait.engine?.evadeOnSummon),
      stunOnNextTurn: 0,
      parasite: null,
      knightWill: false,
      formAlphaUsed: false,
      phoenixUsed: false,
      moltUsed: false,
      specialReviveUsed: false,
      firstIncomingUsed: false,
      phantomReducedThisHit: false,
      phantomExtraActionPending: false,
      normalFirstIncomingUsedThisTurn: false,
      glaciaCharged: false,
      temporaryTurnDamageBonus: 0,
      hamKillBonus: 0,
      specialCounters: {},
      lastAttackTargetId: null,
      consecutiveAttackCount: 0,
      gallionGuard: false,
      benihimeCharged: false,
      ochimushaTriggered: false,
      recoilOnNextAttack: 0,
      overclockPendingDefPenalty: 0,
      autoRepairRemaining: 0,
      swapAtkDef: false,
      spareParts: false,
      echoNext: 0,
      returnToHandOnDefeat: false,
      incomingFlatDamage: null,
      tpOnNextKill: 0,
      predationEvolution: false,
      attackSeal: null,
      deathPact: null,
      awakening: {
        battleUsed: false,
        turnUsed: false,
        charge: 0,
        stacks: 0,
        pending: false,
        deferred: false,
        maxLifeGain: 0,
        atkGain: 0,
        defGain: 0,
        targetStacks: {},
        turnFlags: {},
      },
    },
  };
}

export function effectiveAtk(unit) {
  let value = unit.statuses.swapAtkDef
    ? unit.defBase + unit.defMod + unit.temporaryDef + unit.timedDefBuffs.reduce((sum, buff) => sum + buff.amount, 0)
    : unit.atkBase + unit.atkMod + unit.temporaryAtk
      + (unit.timedAtkBuffs ?? []).reduce((sum, buff) => sum + buff.amount, 0)
      + (unit.statuses.hamKillBonus ?? 0);
  if (!unit.specialForm && unit.baseMonsterName === 'ルミラビ' && unit.life * 2 <= unit.maxLife) value += 20;
  if (!unit.specialForm && unit.baseMonsterName === 'デュラハン' && unit.statuses.knightWill) value += 5;
  if (!unit.specialForm && unit.life * 2 <= unit.maxLife) value += Math.max(0, Number(unit.traitEngine?.lowLifeAtkBonus) || 0);
  return Math.max(1, value);
}

export function effectiveDef(unit) {
  if (unit.statuses.swapAtkDef) {
    return Math.max(1, unit.atkBase + unit.atkMod + unit.temporaryAtk
      + (unit.timedAtkBuffs ?? []).reduce((sum, buff) => sum + buff.amount, 0)
      + (unit.statuses.hamKillBonus ?? 0));
  }
  const timed = unit.timedDefBuffs.reduce((sum, buff) => sum + buff.amount, 0);
  return Math.max(1, unit.defBase + unit.defMod + unit.temporaryDef + timed);
}

export function currentSp(unit) {
  return unit.maxLife + unit.atkBase + unit.defBase;
}

export function projectFusionStats(main, materialSp) {
  const mainSp = currentSp(main);
  const normalizedMaterialSp = Math.max(1, Math.round(Number(materialSp) || 0));
  const formulaSp = Math.max(3, Math.round(((mainSp + normalizedMaterialSp) / 2) * RULES.fusionMultiplier));
  const minimumGain = Math.max(1, Math.ceil(normalizedMaterialSp * RULES.fusionMinimumMaterialRate));
  const newSp = Math.max(formulaSp, mainSp + minimumGain);
  const lifeWeight = main.maxLife / mainSp;
  const atkWeight = main.atkBase / mainSp;
  const maxLife = Math.min(newSp - 2, Math.max(1, Math.round(newSp * lifeWeight)));
  const atk = Math.min(newSp - maxLife - 1, Math.max(1, Math.round(newSp * atkWeight)));
  const def = newSp - maxLife - atk;
  return {
    mainSp,
    materialSp: normalizedMaterialSp,
    formulaSp,
    minimumGain,
    newSp,
    deltaSp: newSp - mainSp,
    stats: { life: maxLife, atk, def },
  };
}

export function lifeRatio(unit) {
  return unit.maxLife > 0 ? unit.life / unit.maxLife : 0;
}

export function livingUnits(player) {
  return player.board.filter(Boolean);
}

export function findUnit(player, unitId) {
  return player.board.find((unit) => unit?.id === unitId) ?? null;
}

export function findUnitSlot(player, unitId) {
  return player.board.findIndex((unit) => unit?.id === unitId);
}

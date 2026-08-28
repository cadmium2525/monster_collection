import { currentSp, effectiveAtk, effectiveDef, livingUnits } from '../battle/state.js';

function statusValue(unit) {
  let value = 0;
  value += (unit.statuses.nextDamageBonus ?? 0) * 24;
  value += (unit.statuses.nextDamageReduction ?? 0) * 30;
  value += unit.statuses.evadeNext ? 16 : 0;
  value += unit.statuses.spareParts ? 13 : 0;
  value += (unit.statuses.echoNext ?? 0) * 22;
  value += (unit.statuses.autoRepairRemaining ?? 0) * 3;
  value -= (unit.statuses.nextDamagePenalty ?? 0) * 24;
  value -= (unit.statuses.stunOnNextTurn ?? 0) * 18;
  value -= unit.statuses.parasite ? 10 : 0;
  value -= unit.statuses.incomingFlatDamage ? (unit.statuses.incomingFlatDamage.remaining ?? 1) * 4 : 0;
  return value;
}

function unitValue(unit) {
  const durability = Math.max(0, unit.life) + effectiveDef(unit) * 0.55;
  const offense = effectiveAtk(unit) * 0.9;
  const growth = Math.max(0, currentSp(unit) - (unit.maxLife + effectiveAtk(unit) + effectiveDef(unit))) * 0.15;
  const readiness = unit.actionPoints > 0 && !unit.summonedThisTurn && !unit.stunnedThisTurn ? 7 : 0;
  const fusion = unit.fusionStage * 18 + (unit.specialForm ? 20 : 0);
  return durability + offense + growth + readiness + fusion + statusValue(unit);
}

export function visibleThreat(engine, player) {
  const attacks = livingUnits(player).flatMap((unit) => unit.equippedMoveIds.map((moveId) => {
    const move = engine.masterIndex.moves.get(moveId);
    if (!move || move.power == null) return null;
    const damage = effectiveAtk(unit) * move.power / 100;
    return { damage, cost: Math.max(1, move.tp ?? 1), unitId: unit.id };
  }).filter(Boolean));
  const bestByUnitMap = new Map();
  for (const attack of attacks.sort((a, b) => b.damage - a.damage || a.cost - b.cost)) {
    if (!bestByUnitMap.has(attack.unitId)) bestByUnitMap.set(attack.unitId, attack);
  }
  const bestByUnit = [...bestByUnitMap.values()];
  let tp = Math.max(1, player.maxTp ?? player.tp ?? 10);
  return bestByUnit
    .sort((a, b) => b.damage / b.cost - a.damage / a.cost)
    .reduce((sum, attack) => {
      if (attack.cost > tp) return sum;
      tp -= attack.cost;
      return sum + attack.damage;
    }, 0);
}

function scheduledEffectValue(player) {
  const sum = (effects, mapper) => (effects ?? []).reduce((total, effect) => total + mapper(effect), 0);
  return sum(player.effects?.nextOwnMaxTpBonuses, (effect) => effect.amount * effect.remaining * 4)
    - sum(player.effects?.nextTurnMaxTpPenalties, (effect) => effect.amount * effect.remaining * 6)
    - sum(player.effects?.nextTurnFusionLocks, (effect) => effect.remaining * 24)
    - sum(player.effects?.nextTurnMoveSurcharges, (effect) => effect.amount * effect.remaining * 9)
    + (player.effects?.nextFusionBuff ? 18 : 0)
    - (player.effects?.tpDebt ?? 0) * 5;
}

export function publicStateFor(engine, perspectiveId) {
  const observation = engine.getObservation(perspectiveId);
  return { own: observation.own, opponent: observation.opponent, observation };
}

export function evaluatePublicPosition(engine, perspectiveId, options = {}) {
  const { own, opponent, observation } = publicStateFor(engine, perspectiveId);
  if (observation.status === 'finished') {
    if (observation.winnerId === perspectiveId) return 1_000_000 - observation.halfTurn;
    if (observation.winnerId == null) return (own.life - opponent.life) * 250;
    return -1_000_000 + observation.halfTurn;
  }

  const ownBoard = livingUnits(own).reduce((sum, unit) => sum + unitValue(unit), 0);
  const opponentBoard = livingUnits(opponent).reduce((sum, unit) => sum + unitValue(unit), 0);
  const life = (own.life - opponent.life) * (options.lifeWeight ?? 7.5);
  const board = (ownBoard - opponentBoard) * (options.boardWeight ?? 1.1);
  const tempo = (own.tp - opponent.tp) * 1.7;
  const cards = (own.hand.length - opponent.handCount) * 2.2;
  const slots = (livingUnits(own).length - livingUnits(opponent).length) * 8;
  const scheduled = scheduledEffectValue(own) - scheduledEffectValue(opponent);
  const turnLimitUrgency = Math.max(0, observation.round - 32) / 8;
  const leadProtection = turnLimitUrgency * (own.life - opponent.life) * 8;
  return life + board + tempo + cards + slots + scheduled + leadProtection;
}

export function estimateHiddenOpportunity(engine, perspectiveId) {
  const { opponent } = publicStateFor(engine, perspectiveId);
  const emptySlots = opponent.board.filter((unit) => !unit).length;
  const handFactor = Math.min(5, opponent.handCount) / 5;
  const fusionTurn = opponent.turnNumber >= (opponent.isFirst ? 6 : 5);
  const fusionRisk = fusionTurn && livingUnits(opponent).length > 0 && opponent.handCount > 0 ? 18 * handFactor : 0;
  const summonRisk = emptySlots > 0 ? 10 * handFactor : 0;
  return fusionRisk + summonRisk;
}

export function estimateCounterThreat(engine, perspectiveId) {
  const { own, opponent, observation } = publicStateFor(engine, perspectiveId);
  const raw = visibleThreat(engine, opponent);
  const blockers = livingUnits(own).reduce((sum, unit) => sum + Math.max(1, unit.life + effectiveDef(unit) * 0.4), 0);
  const lethalPenalty = raw >= own.life && livingUnits(own).length === 0 ? 400 : 0;
  const late = observation.round >= 35 && own.life > opponent.life ? raw * 0.65 : raw;
  return Math.max(0, late - blockers * 0.15) + lethalPenalty + estimateHiddenOpportunity(engine, perspectiveId);
}

export function actionEventDelta(beforeLogLength, engine, perspectiveId) {
  const events = engine.state.log.slice(beforeLogLength);
  let score = 0;
  for (const event of events) {
    const mine = event.playerId === perspectiveId || event.attackerPlayerId === perspectiveId;
    if (event.type === 'attack') {
      score += mine ? ((event.damage ?? 0) + (event.overflow ?? 0)) * 3.2 : 0;
      if (event.defeated) score += mine ? 85 : -85;
    }
    if (event.type === 'direct-attack') score += mine ? (event.damage ?? 0) * 4.2 : -(event.damage ?? 0) * 4.2;
    if (event.type === 'fusion-special') score += mine ? 55 : 0;
    if (event.type === 'fusion-normal') score += mine ? 28 : 0;
    if (event.type === 'summon') score += mine ? 18 : 0;
    if (event.type === 'training' || event.type === 'shugyo') score += mine ? 15 : 0;
    if (event.type === 'breeder') score += mine ? 12 : 0;
  }
  return score;
}

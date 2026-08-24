import { currentSp, effectiveAtk, effectiveDef, livingUnits } from '../battle/state.js';

function unitValue(unit) {
  const durability = Math.max(0, unit.life) + effectiveDef(unit) * 0.55;
  const offense = effectiveAtk(unit) * 0.9;
  const growth = Math.max(0, currentSp(unit) - (unit.maxLife + effectiveAtk(unit) + effectiveDef(unit))) * 0.15;
  const readiness = unit.actionPoints > 0 && !unit.summonedThisTurn && !unit.stunnedThisTurn ? 7 : 0;
  const fusion = unit.fusionStage * 18 + (unit.specialForm ? 20 : 0);
  return durability + offense + growth + readiness + fusion;
}

export function visibleThreat(player) {
  return livingUnits(player).reduce((sum, unit) => {
    const bestMove = unit.equippedMoveIds.length ? Math.max(...unit.equippedMoveIds.map(() => effectiveAtk(unit))) : 0;
    const canAct = unit.actionPoints > 0 && !unit.summonedThisTurn && !unit.stunnedThisTurn;
    return sum + (canAct ? bestMove : bestMove * 0.35);
  }, 0);
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
  const turnLimitUrgency = Math.max(0, observation.round - 32) / 8;
  const leadProtection = turnLimitUrgency * (own.life - opponent.life) * 8;
  return life + board + tempo + cards + slots + leadProtection;
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
  const raw = visibleThreat(opponent);
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
    if (event.type === 'fusion') score += mine ? (event.special ? 55 : 28) : 0;
    if (event.type === 'summon') score += mine ? 18 : 0;
    if (event.type === 'training' || event.type === 'shugyo') score += mine ? 15 : 0;
    if (event.type === 'breeder') score += mine ? 12 : 0;
  }
  return score;
}

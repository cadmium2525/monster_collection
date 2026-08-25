import { RULES } from '../battle/rules.js';
import { normalizeGrowth } from '../battle/state.js';
import { chooseShugyoMove, learnableShugyoMoves } from '../battle/shugyo.js';

const MATCH_TP_BUDGET = Object.freeze({ bronze: 5, silver: 6, gold: 7, legend: 8 });
const TARGET_PRECISION = Object.freeze({ bronze: 0.35, silver: 0.58, gold: 0.82, legend: 1 });

function clone(value) { return structuredClone(value); }

function moveValue(move) {
  if (!move) return 0;
  return (move.power ?? 8) * 0.22
    + (6 - (move.rank ?? 3)) * 1.2
    - (move.tp ?? 0) * 0.45
    + (move.effect ? 2 : 0);
}

function targetWeight(definition, growth, stat, precision) {
  const roleBonus = stat === 'atk'
    ? (definition.role === 'アタッカー' ? 3 : definition.role === 'バランス' ? 1 : 0)
    : (definition.role === 'タンク' ? 3 : definition.role === 'バランス' ? 1 : 0);
  const baseStat = stat === 'life' ? definition.base.life : definition.base[stat];
  const developed = stat === 'life' ? growth.life : growth[stat];
  return 1 + precision * (roleBonus + baseStat / 12 + developed / 15);
}

function chooseTarget({ entrant, definition, growth, masterIndex, rng, rank }) {
  const monsterCards = entrant.cards
    .map((card) => ({ card, definition: masterIndex.cards.get(card.masterId) }))
    .filter((entry) => entry.definition?.kind === 'monster');
  const precision = TARGET_PRECISION[rank] ?? TARGET_PRECISION.bronze;
  return rng.weightedChoice(monsterCards, (entry) => {
    const current = normalizeGrowth(growth[entry.card.instanceId], entry.definition, masterIndex);
    return targetWeight(entry.definition, current, definition.stat, precision);
  });
}

function equipBestFour(growth, learnedMove, masterIndex) {
  if (growth.equippedMoveIds.length < RULES.equippedMoveSlots) {
    growth.equippedMoveIds.push(learnedMove.id);
    return;
  }
  const candidates = [...new Set([...growth.equippedMoveIds, learnedMove.id])];
  candidates.sort((a, b) => moveValue(masterIndex.moves.get(b)) - moveValue(masterIndex.moves.get(a)) || a.localeCompare(b));
  growth.equippedMoveIds = candidates.slice(0, RULES.equippedMoveSlots);
}

function applyGrowthCard({ entrant, support, target, growth, masterData, masterIndex, rng, roundIndex }) {
  const targetGrowth = normalizeGrowth(growth[target.card.instanceId], target.definition, masterIndex);
  let lifeGain = 0;
  let statGain = 0;
  let learnedMove = null;

  if (support.definition.kind === 'training') {
    statGain = support.definition.amount;
    targetGrowth[support.definition.stat] += statGain;
  } else {
    lifeGain = rng.int(RULES.shugyoGainMin, RULES.shugyoGainMax);
    statGain = rng.int(RULES.shugyoGainMin, RULES.shugyoGainMax);
    targetGrowth.life += lifeGain;
    targetGrowth[support.definition.stat] += statGain;
    if (targetGrowth.learnedMoveIds.length < RULES.maxLearnedMoves) {
      learnedMove = chooseShugyoMove(rng, learnableShugyoMoves(masterData, masterIndex, {
        baseMonsterName: target.definition.name,
        learnedMoveIds: targetGrowth.learnedMoveIds,
      }, support.definition));
    }
    if (learnedMove) {
      targetGrowth.learnedMoveIds.push(learnedMove.id);
      equipBestFour(targetGrowth, learnedMove, masterIndex);
    }
  }

  growth[target.card.instanceId] = targetGrowth;
  return {
    roundIndex,
    cardInstanceId: support.card.instanceId,
    cardMasterId: support.definition.id,
    targetCardInstanceId: target.card.instanceId,
    targetMasterId: target.definition.id,
    lifeGain,
    stat: support.definition.stat,
    statGain,
    learnedMoveId: learnedMove?.id ?? null,
  };
}

export function advanceCpuTournamentGrowth({ entrant, masterData, masterIndex, rng, rank, roundIndex }) {
  const growth = clone(entrant.tournamentGrowth ?? {});
  const available = entrant.cards
    .map((card) => ({ card, definition: masterIndex.cards.get(card.masterId) }))
    .filter((entry) => ['training', 'shugyo'].includes(entry.definition?.kind));
  const events = [];
  let remainingTp = MATCH_TP_BUDGET[rank] ?? MATCH_TP_BUDGET.bronze;
  let usedShugyo = false;

  while (available.length) {
    const legal = available.filter((entry) => entry.definition.tp <= remainingTp && !(usedShugyo && entry.definition.kind === 'shugyo'));
    if (!legal.length) break;
    const support = rng.weightedChoice(legal, (entry) => entry.definition.kind === 'shugyo'
      ? ({ bronze: 0.72, silver: 0.88, gold: 1, legend: 1.12 }[rank] ?? 0.72)
      : 1);
    const target = chooseTarget({ entrant, definition: support.definition, growth, masterIndex, rng, rank });
    if (!target) break;
    events.push(applyGrowthCard({ entrant, support, target, growth, masterData, masterIndex, rng, roundIndex }));
    remainingTp -= support.definition.tp;
    if (support.definition.kind === 'shugyo') usedShugyo = true;
    available.splice(available.indexOf(support), 1);
  }

  return {
    tournamentGrowth: growth,
    growthHistory: [...(entrant.growthHistory ?? []), ...events],
    virtualMatchWins: (entrant.virtualMatchWins ?? 0) + 1,
  };
}

export function summarizeCpuTournamentGrowth(entrant) {
  const events = entrant?.growthHistory ?? [];
  return {
    wins: Math.max(0, Number(entrant?.virtualMatchWins) || 0),
    uses: events.length,
    statGain: events.reduce((sum, event) => sum + (event.lifeGain ?? 0) + (event.statGain ?? 0), 0),
    learnedMoves: new Set(events.map((event) => event.learnedMoveId).filter(Boolean)).size,
  };
}

export function cpuTournamentGrowthValue(entrant) {
  const summary = summarizeCpuTournamentGrowth(entrant);
  return summary.statGain * 0.35 + summary.learnedMoves * 3;
}

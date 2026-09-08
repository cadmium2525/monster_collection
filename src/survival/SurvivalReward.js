export const SURVIVAL_PROGRESS_SCHEMA_VERSION = 1;

function clone(value) { return value == null ? value : structuredClone(value); }
function integer(value) { return Math.max(0, Math.trunc(Number(value) || 0)); }

export function survivalBaseDiamonds(streakValue) {
  const streak = integer(streakValue);
  if (streak === 0) return 0;
  if (streak === 1) return 60;
  if (streak === 2) return 140;
  if (streak === 3) return 250;
  if (streak === 4) return 380;
  if (streak === 5) return 550;
  if (streak === 6) return 700;
  if (streak === 7) return 880;
  if (streak === 8) return 1080;
  if (streak === 9) return 1300;
  if (streak <= 15) return 1600 + (streak - 10) * 240;
  if (streak <= 20) return 2800 + (streak - 15) * 280;
  if (streak < 25) return 4200 + (streak - 20) * 360;
  return 6000;
}

export function survivalPackCredits(streakValue) {
  return Math.min(5, Math.floor(integer(streakValue) / 5));
}

export function survivalRewardForStreak(streakValue, previousBestValue = 0) {
  const streak = integer(streakValue);
  const previousBest = integer(previousBestValue);
  const newBest = streak > previousBest;
  const crossedMilestones = newBest
    ? Math.max(0, Math.floor(streak / 5) - Math.floor(previousBest / 5))
    : 0;
  const baseDiamonds = survivalBaseDiamonds(streak);
  const bestBonusDiamonds = crossedMilestones * 100;
  return Object.freeze({
    streak,
    baseDiamonds,
    bestBonusDiamonds,
    diamonds: baseDiamonds + bestBonusDiamonds,
    packCredits: survivalPackCredits(streak),
    newBest,
    crossedMilestones,
  });
}

export function normalizeSurvivalProgress(value = {}) {
  return {
    schemaVersion: SURVIVAL_PROGRESS_SCHEMA_VERSION,
    bestStreak: integer(value.bestStreak),
    totalRuns: integer(value.totalRuns),
    totalWins: integer(value.totalWins),
    lastStreak: integer(value.lastStreak),
    bestReachedAt: value.bestReachedAt == null ? null : String(value.bestReachedAt),
    lastPlayedAt: value.lastPlayedAt == null ? null : String(value.lastPlayedAt),
    processedOperationIds: [...new Set((value.processedOperationIds ?? []).map(String))].slice(-320),
  };
}

export function recordSurvivalCompletion(current, result, now = new Date().toISOString()) {
  const progress = normalizeSurvivalProgress(current);
  const operationId = String(result?.operationId ?? '').trim();
  if (!operationId) throw new Error('サバイバル結果IDがありません');
  if (progress.processedOperationIds.includes(operationId)) {
    return { progress, reward: null, newBest: false };
  }
  const streak = integer(result?.streak);
  const reward = survivalRewardForStreak(streak, progress.bestStreak);
  progress.totalRuns += 1;
  progress.totalWins += streak;
  progress.lastStreak = streak;
  progress.lastPlayedAt = now;
  if (reward.newBest) {
    progress.bestStreak = streak;
    progress.bestReachedAt = now;
  }
  progress.processedOperationIds.push(operationId);
  progress.processedOperationIds = progress.processedOperationIds.slice(-320);
  return { progress, reward: clone(reward), newBest: reward.newBest };
}

export const MISSION_SCHEMA_VERSION = 2;

const MONTHLY_OBJECTIVE_IDS = Object.freeze([
  'monthly-login',
  'monthly-play',
  'monthly-win',
  'monthly-arena-wins',
  'monthly-arena-plays',
  'monthly-tournament-entry',
]);

export const MISSION_DEFINITIONS = Object.freeze([
  Object.freeze({ id: 'daily-login', period: 'daily', counter: 'login', target: 1, label: 'ログインする', reward: Object.freeze({ type: 'diamonds', amount: 300 }) }),
  Object.freeze({ id: 'daily-play', period: 'daily', counter: 'battles', target: 1, label: '1試合する', reward: Object.freeze({ type: 'diamonds', amount: 100 }) }),
  Object.freeze({ id: 'daily-win', period: 'daily', counter: 'wins', target: 1, label: '1勝する', reward: Object.freeze({ type: 'diamonds', amount: 200 }) }),
  Object.freeze({ id: 'weekly-arena-wins', period: 'weekly', counter: 'arenaWins', target: 3, label: 'アリーナで3勝', reward: Object.freeze({ type: 'arena-card', amount: 1 }) }),
  Object.freeze({ id: 'weekly-arena-plays', period: 'weekly', counter: 'arenaBattles', target: 5, label: 'アリーナを5回プレイ', reward: Object.freeze({ type: 'diamonds', amount: 1500 }) }),
  Object.freeze({ id: 'weekly-tournament-entry', period: 'weekly', counter: 'tournamentEntries', target: 2, label: 'トーナメントに2回参加', reward: Object.freeze({ type: 'diamonds', amount: 1500 }) }),
  Object.freeze({ id: 'monthly-login', period: 'monthly', counter: 'loginDays', target: 20, label: '20日ログイン', progressOnly: true }),
  Object.freeze({ id: 'monthly-play', period: 'monthly', counter: 'battles', target: 30, label: '30試合する', progressOnly: true }),
  Object.freeze({ id: 'monthly-win', period: 'monthly', counter: 'wins', target: 15, label: '15勝する', progressOnly: true }),
  Object.freeze({ id: 'monthly-arena-wins', period: 'monthly', counter: 'arenaWins', target: 10, label: 'アリーナで10勝', progressOnly: true }),
  Object.freeze({ id: 'monthly-arena-plays', period: 'monthly', counter: 'arenaBattles', target: 20, label: 'アリーナを20回プレイ', progressOnly: true }),
  Object.freeze({ id: 'monthly-tournament-entry', period: 'monthly', counter: 'tournamentEntries', target: 8, label: 'トーナメントに8回参加', progressOnly: true }),
  Object.freeze({
    id: 'monthly-complete', period: 'monthly', target: MONTHLY_OBJECTIVE_IDS.length,
    label: 'マンスリーミッションを全達成', aggregateFrom: MONTHLY_OBJECTIVE_IDS,
    reward: Object.freeze({ type: 'monster-exchange-ticket', amount: 1 }),
  }),
]);

const DEFINITION_BY_ID = new Map(MISSION_DEFINITIONS.map((mission) => [mission.id, mission]));

function integer(value) { return Math.max(0, Math.trunc(Number(value) || 0)); }
function clone(value) { return value == null ? value : structuredClone(value); }

export function japanDateKey(value = new Date()) {
  const parts = new Intl.DateTimeFormat('en', {
    timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(value instanceof Date ? value : new Date(value));
  const part = (type) => parts.find((entry) => entry.type === type)?.value;
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function japanWeekKey(value = new Date()) {
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : japanDateKey(value);
  const date = new Date(`${dateKey}T00:00:00Z`);
  const mondayOffset = (date.getUTCDay() + 6) % 7;
  date.setUTCDate(date.getUTCDate() - mondayOffset);
  return date.toISOString().slice(0, 10);
}

export function japanMonthKey(value = new Date()) {
  const dateKey = /^\d{4}-\d{2}-\d{2}$/.test(String(value)) ? String(value) : japanDateKey(value);
  return dateKey.slice(0, 7);
}

function emptyPeriod(key) {
  return { key, counters: {}, claimedIds: [] };
}

function normalizePeriod(value, key) {
  if (!value || value.key !== key) return emptyPeriod(key);
  return {
    key,
    counters: Object.fromEntries(Object.entries(value.counters ?? {}).map(([name, count]) => [name, integer(count)])),
    claimedIds: [...new Set((value.claimedIds ?? []).map(String))],
  };
}

export function normalizeMissionProgress(value = {}, { dateKey = japanDateKey() } = {}) {
  const weekKey = japanWeekKey(dateKey);
  const monthKey = japanMonthKey(dateKey);
  return {
    schemaVersion: MISSION_SCHEMA_VERSION,
    daily: normalizePeriod(value.daily, dateKey),
    weekly: normalizePeriod(value.weekly, weekKey),
    monthly: normalizePeriod(value.monthly, monthKey),
    processedOperationIds: [...new Set((value.processedOperationIds ?? []).map(String))].slice(-320),
  };
}

function periodFor(progress, period) {
  if (period === 'monthly') return progress.monthly;
  return period === 'weekly' ? progress.weekly : progress.daily;
}

function remember(progress, operationId) {
  progress.processedOperationIds = [...progress.processedOperationIds, operationId].slice(-320);
}

export function recordMissionEvent(current, event, { dateKey = japanDateKey() } = {}) {
  const progress = normalizeMissionProgress(current, { dateKey });
  const operationId = String(event?.operationId ?? '').trim();
  if (!operationId) throw new Error('ミッション進行IDがありません');
  if (progress.processedOperationIds.includes(operationId)) return progress;
  const daily = progress.daily.counters;
  const weekly = progress.weekly.counters;
  const monthly = progress.monthly.counters;
  if (event.type === 'login') {
    daily.login = Math.max(1, integer(daily.login));
    monthly.loginDays = integer(monthly.loginDays) + 1;
  }
  else if (event.type === 'battle-result') {
    daily.battles = integer(daily.battles) + 1;
    monthly.battles = integer(monthly.battles) + 1;
    if (event.won) {
      daily.wins = integer(daily.wins) + 1;
      monthly.wins = integer(monthly.wins) + 1;
    }
    if (event.mode === 'arena') {
      weekly.arenaBattles = integer(weekly.arenaBattles) + 1;
      monthly.arenaBattles = integer(monthly.arenaBattles) + 1;
      if (event.won) {
        weekly.arenaWins = integer(weekly.arenaWins) + 1;
        monthly.arenaWins = integer(monthly.arenaWins) + 1;
      }
    }
  } else if (event.type === 'tournament-entry') {
    weekly.tournamentEntries = integer(weekly.tournamentEntries) + 1;
    monthly.tournamentEntries = integer(monthly.tournamentEntries) + 1;
  } else throw new Error(`不明なミッションイベントです: ${event.type}`);
  remember(progress, operationId);
  return progress;
}

export function markMissionClaimed(current, missionId, { dateKey = japanDateKey() } = {}) {
  const progress = normalizeMissionProgress(current, { dateKey });
  const definition = DEFINITION_BY_ID.get(missionId);
  if (!definition) throw new Error('ミッションが見つかりません');
  const period = periodFor(progress, definition.period);
  if (!period.claimedIds.includes(missionId)) period.claimedIds.push(missionId);
  return progress;
}

export function missionEntries(current, { dateKey = japanDateKey() } = {}) {
  const progress = normalizeMissionProgress(current, { dateKey });
  return MISSION_DEFINITIONS.map((definition) => {
    const period = periodFor(progress, definition.period);
    const count = definition.aggregateFrom
      ? definition.aggregateFrom.filter((missionId) => {
        const objective = DEFINITION_BY_ID.get(missionId);
        return objective && integer(period.counters[objective.counter]) >= objective.target;
      }).length
      : integer(period.counters[definition.counter]);
    const claimed = period.claimedIds.includes(definition.id);
    const completed = count >= definition.target;
    return {
      ...clone(definition),
      progress: Math.min(count, definition.target),
      actualProgress: count,
      completed,
      claimed,
      claimable: completed && !claimed && !definition.progressOnly,
      periodKey: period.key,
    };
  });
}

export function claimableMissionCount(current, options = {}) {
  return missionEntries(current, options).filter((mission) => mission.claimable).length;
}

export function claimMission(current, missionId, { dateKey = japanDateKey() } = {}) {
  const progress = normalizeMissionProgress(current, { dateKey });
  const mission = missionEntries(progress, { dateKey }).find((entry) => entry.id === missionId);
  if (!mission) throw new Error('ミッションが見つかりません');
  if (mission.progressOnly) throw new Error('この目標には個別の受取報酬はありません');
  if (mission.claimed) return { progress, reward: null, mission };
  if (!mission.completed) throw new Error('ミッションはまだ達成されていません');
  const next = markMissionClaimed(progress, missionId, { dateKey });
  return { progress: next, reward: clone(mission.reward), mission };
}

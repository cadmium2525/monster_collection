import { APP_VERSION } from '../config/app-version.js';
import { japanDateKey, missionEntries } from './mission-state.js';

const KEY = 'mc-mission-diagnostics-v1';
let memory = [];
export function missionSnapshot(economy) {
  const progress = economy?.missionProgress;
  return progress ? {
    schemaVersion: progress.schemaVersion,
    daily: structuredClone(progress.daily),
    processedCount: progress.processedOperationIds?.length ?? 0,
  } : null;
}
export function diagnosticOperation(operation = {}) {
  let fingerprint = 2166136261;
  for (const char of String(operation.operationId ?? '')) fingerprint = Math.imul(fingerprint ^ char.charCodeAt(0), 16777619);
  return {
    operationFingerprint: (fingerprint >>> 0).toString(16),
    type: operation.type, dateKey: operation.dateKey ?? null,
    missionId: operation.missionId,
    won: operation.result?.won ?? operation.event?.won,
    eventType: operation.event?.type,
    counterSnapshot: operation.counterSnapshot ? {
      period: operation.counterSnapshot.period, key: operation.counterSnapshot.key,
      counters: operation.counterSnapshot.counters,
    } : null,
  };
}
export function missionTrace(source, economy, detail = {}) {
  try {
    const stored = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null');
    const entries = Array.isArray(stored) ? stored : memory;
    memory = [...entries, { at: new Date().toISOString(), version: APP_VERSION,
      todayJst: japanDateKey(), source, snapshot: missionSnapshot(economy), ...detail }].slice(-80);
    globalThis.localStorage?.setItem(KEY, JSON.stringify(memory));
  } catch { /* Diagnostics must never interrupt rewards or startup. */ }
}
export function missionDiagnosticReport(economy, repository) {
  let history = memory;
  try { history = JSON.parse(globalThis.localStorage?.getItem(KEY) ?? 'null') ?? memory; } catch { /* Use memory. */ }
  const today = japanDateKey();
  return JSON.stringify({
    version: APP_VERSION, capturedAt: new Date().toISOString(), todayJst: today,
    accountMode: repository?.user?.mode ?? 'unknown', cloudActive: Boolean(repository?.activeCloud),
    lastErrorCode: repository?.lastError?.code ?? null,
    explanation: '表示は画面内 economy.missionProgress.daily.counters を日付・schemaで正規化して判定。通算戦績を直接参照しません。履歴はこの更新以降の端末内記録です。',
    displayedRaw: missionSnapshot(economy),
    decisions: missionEntries(economy.missionProgress, { dateKey: today }).filter(m => m.period === 'daily').map(m => ({
      mission: m.label, reference: `missionProgress.daily.counters.${m.counter}`,
      date: m.periodKey, value: m.actualProgress, required: m.target,
      completed: m.completed, claimed: m.claimed, claimable: m.claimable,
    })), history,
  }, null, 2);
}

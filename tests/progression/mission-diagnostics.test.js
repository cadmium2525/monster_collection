import test from 'node:test';
import assert from 'node:assert/strict';
import { missionTrace, missionDiagnosticReport, diagnosticOperation } from '../../src/progression/mission-diagnostics.js';
import { japanDateKey } from '../../src/progression/mission-state.js';

test('diagnostics retain bounded storage history and report the exact daily decision without identities', () => {
  const values = new Map();
  const original = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => values.get(key) ?? null, setItem: (key, value) => values.set(key, value),
  } });
  try {
    const economy = { missionProgress: { schemaVersion: 6, daily: {
      key: japanDateKey(), counters: { login: 1, battles: 2, wins: 1 }, claimedIds: ['daily-login'],
    } }, email: 'private@example.com' };
    const before = structuredClone(economy);
    for (let i = 0; i < 85; i++) missionTrace('local.read', economy);
    const text = missionDiagnosticReport(economy, { user: { id: 'secret-id', mode: 'firebase' } });
    const report = JSON.parse(text);
    assert.equal(report.history.length, 80);
    assert.equal(report.decisions[1].value, 2);
    assert.equal(report.decisions[1].claimable, true);
    assert.equal(report.decisions[0].claimable, false);
    assert.ok(!text.includes('private@example.com') && !text.includes('secret-id'));
    assert.deepEqual(economy, before);
    const operation = diagnosticOperation({ operationId: 'private-id', type: 'claim-mission' });
    assert.ok(!JSON.stringify(operation).includes('private-id'));
    assert.equal(operation.operationFingerprint, diagnosticOperation({ operationId: 'private-id' }).operationFingerprint);
    globalThis.localStorage.setItem = () => { throw new Error('quota'); };
    assert.doesNotThrow(() => missionTrace('quota-test', economy));
  } finally {
    if (original) Object.defineProperty(globalThis, 'localStorage', original);
    else delete globalThis.localStorage;
  }
});

import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_LOGIN_DIAMONDS,
  STARTER_DIAMONDS,
  SUMMER_BONUS_DIAMONDS,
  SUMMER_BONUS_ID,
  applyLoginRewards,
  applyTournamentUnlock,
  defaultEconomyState,
  japanDateKey,
} from '../../src/gacha/economy-state.js';

test('first login from 2026-08-29 grants daily 300 and one-time summer 3000', () => {
  const first = applyLoginRewards(defaultEconomyState(), { loginDate: '2026-08-29' }, '2026-08-29T00:00:00.000Z');
  assert.equal(first.state.diamonds, STARTER_DIAMONDS + DAILY_LOGIN_DIAMONDS + SUMMER_BONUS_DIAMONDS);
  assert.deepEqual(first.rewards.map(({ type, amount }) => ({ type, amount })), [
    { type: 'daily', amount: 300 },
    { type: 'campaign', amount: 3000 },
  ]);
  assert.equal(first.state.lastDailyLoginDate, '2026-08-29');
  assert.deepEqual(first.state.claimedCampaignIds, [SUMMER_BONUS_ID]);

  const repeated = applyLoginRewards(first.state, { loginDate: '2026-08-29' }, '2026-08-29T01:00:00.000Z');
  assert.equal(repeated.state.diamonds, first.state.diamonds);
  assert.deepEqual(repeated.rewards, []);

  const nextDay = applyLoginRewards(repeated.state, { loginDate: '2026-08-30' }, '2026-08-30T00:00:00.000Z');
  assert.equal(nextDay.state.diamonds, first.state.diamonds + DAILY_LOGIN_DIAMONDS);
  assert.deepEqual(nextDay.rewards.map((reward) => reward.type), ['daily']);
  assert.deepEqual(nextDay.state.claimedCampaignIds, [SUMMER_BONUS_ID]);
});

test('summer bonus is not granted before its start date', () => {
  const result = applyLoginRewards(defaultEconomyState(), { loginDate: '2026-08-28' });
  assert.equal(result.state.diamonds, STARTER_DIAMONDS + DAILY_LOGIN_DIAMONDS);
  assert.deepEqual(result.rewards.map((reward) => reward.type), ['daily']);
});

test('Japan login date changes at midnight JST', () => {
  assert.equal(japanDateKey('2026-08-28T14:59:59.000Z'), '2026-08-28');
  assert.equal(japanDateKey('2026-08-28T15:00:00.000Z'), '2026-08-29');
});

test('player tournament unlock only advances and never downgrades', () => {
  const silver = applyTournamentUnlock(defaultEconomyState(), 'silver');
  assert.equal(silver.tournamentQualification, 'silver');
  const attemptedDowngrade = applyTournamentUnlock(silver, 'bronze');
  assert.equal(attemptedDowngrade.tournamentQualification, 'silver');
  assert.equal(applyTournamentUnlock(attemptedDowngrade, 'legend').tournamentQualification, 'legend');
});

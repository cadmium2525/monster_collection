import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DAILY_LOGIN_DIAMONDS,
  STARTER_DIAMONDS,
  SUMMER_BONUS_DIAMONDS,
  SUMMER_BONUS_END,
  SUMMER_BONUS_ID,
  HOME_RENEWAL_GIFT_DIAMONDS,
  HOME_RENEWAL_GIFT_END,
  HOME_RENEWAL_GIFT_ID,
  applyCampaignGiftClaim,
  applyLoginRewards,
  applyTournamentUnlock,
  availableCampaignGifts,
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

test('summer bonus ends before the September home renewal campaign', () => {
  const result = applyLoginRewards(defaultEconomyState(), { loginDate: '2026-09-01' });
  assert.equal(SUMMER_BONUS_END, '2026-08-31');
  assert.equal(result.state.diamonds, STARTER_DIAMONDS + DAILY_LOGIN_DIAMONDS);
  assert.deepEqual(result.rewards.map((reward) => reward.type), ['daily']);
  assert.deepEqual(result.state.claimedCampaignIds, []);
});

test('home renewal gift stays in the gift box through September 4 and can be claimed once', () => {
  const initial = defaultEconomyState();
  assert.deepEqual(availableCampaignGifts(initial, { loginDate: '2026-08-31' }), []);
  const available = availableCampaignGifts(initial, { loginDate: '2026-09-01' });
  assert.equal(available.length, 1);
  assert.equal(available[0].id, HOME_RENEWAL_GIFT_ID);
  assert.equal(available[0].amount, HOME_RENEWAL_GIFT_DIAMONDS);
  assert.equal(HOME_RENEWAL_GIFT_END, '2026-09-04');
  assert.equal(availableCampaignGifts(initial, { loginDate: '2026-09-04' }).length, 1);
  assert.deepEqual(availableCampaignGifts(initial, { loginDate: '2026-09-05' }), []);

  const claimed = applyCampaignGiftClaim(initial, { giftId: HOME_RENEWAL_GIFT_ID, claimDate: '2026-09-04' });
  assert.equal(claimed.state.diamonds, STARTER_DIAMONDS + HOME_RENEWAL_GIFT_DIAMONDS);
  assert.equal(claimed.reward.label, 'ホーム画面刷新記念');
  assert.deepEqual(availableCampaignGifts(claimed.state, { loginDate: '2026-09-04' }), []);
  const repeated = applyCampaignGiftClaim(claimed.state, { giftId: HOME_RENEWAL_GIFT_ID, claimDate: '2026-09-04' });
  assert.equal(repeated.state.diamonds, claimed.state.diamonds);
  assert.equal(repeated.reward, null);
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

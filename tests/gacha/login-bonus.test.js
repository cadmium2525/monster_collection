import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STARTER_DIAMONDS,
  SUMMER_BONUS_DIAMONDS,
  SUMMER_BONUS_END,
  SUMMER_BONUS_ID,
  HOME_RENEWAL_GIFT_DIAMONDS,
  HOME_RENEWAL_GIFT_END,
  HOME_RENEWAL_GIFT_ID,
  applyCampaignGiftClaim,
  applyLoginRewards,
  applyProgressionOperation,
  applyTournamentUnlock,
  availableCampaignGifts,
  defaultEconomyState,
  japanDateKey,
} from '../../src/gacha/economy-state.js';
import { missionEntries } from '../../src/progression/mission-state.js';

test('first login completes the daily mission without auto-granting it, while campaigns remain automatic', () => {
  const first = applyLoginRewards(defaultEconomyState(), { loginDate: '2026-08-29' }, '2026-08-29T00:00:00.000Z');
  assert.equal(first.state.diamonds, STARTER_DIAMONDS + SUMMER_BONUS_DIAMONDS);
  assert.deepEqual(first.rewards.map(({ type, amount }) => ({ type, amount })), [
    { type: 'campaign', amount: 3000 },
  ]);
  assert.equal(first.state.missionProgress.daily.counters.login, 1);
  assert.deepEqual(first.state.missionProgress.daily.claimedIds, []);
  assert.equal(first.state.lastDailyLoginDate, '2026-08-29');
  assert.deepEqual(first.state.claimedCampaignIds, [SUMMER_BONUS_ID]);

  const claimed = applyProgressionOperation(first.state, {
    type: 'claim-mission', operationId: 'claim:daily-login:2026-08-29', missionId: 'daily-login', dateKey: '2026-08-29',
  }, '2026-08-29T01:00:00.000Z');
  assert.equal(claimed.diamonds, first.state.diamonds + 300);
  assert.deepEqual(claimed.missionProgress.daily.claimedIds, ['daily-login']);
  assert.deepEqual(claimed.missionProgress.daily.counters, { login: 1 });
  const dailyAfterClaim = missionEntries(claimed.missionProgress, { dateKey: '2026-08-29' })
    .filter((mission) => mission.period === 'daily');
  assert.deepEqual(dailyAfterClaim.map((mission) => ({
    id: mission.id,
    progress: mission.actualProgress,
    claimable: mission.claimable,
  })), [
    { id: 'daily-login', progress: 1, claimable: false },
    { id: 'daily-play', progress: 0, claimable: false },
    { id: 'daily-win', progress: 0, claimable: false },
  ]);
  assert.throws(() => applyProgressionOperation(claimed, {
    type: 'claim-mission', operationId: 'claim:daily-play:2026-08-29', missionId: 'daily-play', dateKey: '2026-08-29',
  }, '2026-08-29T01:01:00.000Z'), /まだ達成されていません/);

  const repeated = applyLoginRewards(first.state, { loginDate: '2026-08-29' }, '2026-08-29T01:00:00.000Z');
  assert.equal(repeated.state.diamonds, first.state.diamonds);
  assert.deepEqual(repeated.rewards, []);

  const nextDay = applyLoginRewards(repeated.state, { loginDate: '2026-08-30' }, '2026-08-30T00:00:00.000Z');
  assert.equal(nextDay.state.diamonds, first.state.diamonds);
  assert.deepEqual(nextDay.rewards, []);
  assert.deepEqual(nextDay.state.claimedCampaignIds, [SUMMER_BONUS_ID]);
});

test('summer bonus is not granted before its start date', () => {
  const result = applyLoginRewards(defaultEconomyState(), { loginDate: '2026-08-28' });
  assert.equal(result.state.diamonds, STARTER_DIAMONDS);
  assert.deepEqual(result.rewards, []);
});

test('summer bonus ends before the September home renewal campaign', () => {
  const result = applyLoginRewards(defaultEconomyState(), { loginDate: '2026-09-01' });
  assert.equal(SUMMER_BONUS_END, '2026-08-31');
  assert.equal(result.state.diamonds, STARTER_DIAMONDS);
  assert.deepEqual(result.rewards, []);
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

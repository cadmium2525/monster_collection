import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleEngine } from '../../src/battle/BattleEngine.js';
import { automaticMulliganIds } from '../../src/battle/mulligan.js';
import { legalDeck, masterData } from '../helpers.js';

function pendingBattle(seed = 'mulligan') {
  return new BattleEngine({
    masterData,
    seed,
    firstPlayerId: 'p1',
    players: [
      { id: 'p1', displayName: '先攻', cards: legalDeck('mulligan-p1') },
      { id: 'p2', displayName: '後攻', cards: legalDeck('mulligan-p2') },
    ],
  });
}

test('mulligan deals 3 cards to first and 5 to second before turn 1', () => {
  const battle = pendingBattle();
  assert.equal(battle.state.mulligan.status, 'selecting');
  assert.equal(battle.player('p1').hand.length, 3);
  assert.equal(battle.player('p2').hand.length, 5);
  assert.equal(battle.player('p1').turnNumber, 0);
  assert.equal(battle.player('p2').turnNumber, 0);
  assert.deepEqual(battle.getLegalActions('p1'), []);
});

test('selected opening cards cannot be redrawn in the same mulligan and all 40 cards remain', () => {
  const battle = pendingBattle('mulligan-replace');
  const player = battle.player('p1');
  const selected = player.hand.map((card) => card.instanceId);
  const before = new Set([...player.hand, ...player.deck].map((card) => card.instanceId));
  battle.submitMulligan('p1', selected);
  assert.equal(player.hand.some((card) => selected.includes(card.instanceId)), false);
  assert.deepEqual(new Set([...player.hand, ...player.deck].map((card) => card.instanceId)), before);
  assert.equal(player.hand.length, 3);
  assert.equal(player.turnNumber, 0);
});

test('first may exchange 3, second may exchange 5, and battle starts after both confirm', () => {
  const battle = pendingBattle('mulligan-limits');
  assert.throws(() => battle.submitMulligan('p1', [
    ...battle.player('p1').hand.map((card) => card.instanceId),
    battle.player('p1').deck.at(-1).instanceId,
  ]), /最大3枚/);
  battle.submitMulligan('p1', []);
  assert.equal(battle.player('p1').turnNumber, 0);
  battle.submitMulligan('p2', battle.player('p2').hand.map((card) => card.instanceId));
  assert.equal(battle.state.mulligan.status, 'complete');
  assert.equal(battle.state.currentPlayerId, 'p1');
  assert.equal(battle.player('p1').turnNumber, 1);
  assert.equal(battle.player('p2').turnNumber, 0);
});

test('automatic mulligan exchanges every card when the opening hand has no monster', () => {
  const battle = pendingBattle('mulligan-automatic');
  const player = battle.player('p2');
  const support = player.deck.filter((card) => battle.masterIndex.cards.get(card.masterId).kind !== 'monster').slice(0, 5);
  player.hand = support;
  assert.deepEqual(automaticMulliganIds(player, battle.masterIndex), support.map((card) => card.instanceId));
});

test('pending mulligan survives a battle checkpoint exactly', () => {
  const battle = pendingBattle('mulligan-resume');
  battle.submitMulligan('p2', battle.player('p2').hand.slice(0, 2).map((card) => card.instanceId));
  const restored = BattleEngine.fromCheckpoint({ masterData, checkpoint: battle.toCheckpoint() });
  assert.deepEqual(restored.toCheckpoint(), battle.toCheckpoint());
  restored.submitMulligan('p1', []);
  assert.equal(restored.player('p1').turnNumber, 1);
});

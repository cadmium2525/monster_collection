import test from 'node:test';
import assert from 'node:assert/strict';
import { engine } from '../helpers.js';

test('both players start with 3 cards and first player skips turn-1 normal draw', () => {
  const battle = engine();
  assert.equal(battle.player('p1').hand.length, 3);
  assert.equal(battle.player('p2').hand.length, 3);
  battle.applyAction({ type: 'end-turn' });
  assert.equal(battle.player('p2').hand.length, 5);
});

test('each battle shuffles both 40-card decks reproducibly from its seed', () => {
  const order = (battle, playerId) => {
    const player = battle.player(playerId);
    return [...player.hand, ...player.deck].map((card) => card.instanceId);
  };
  const first = engine({ seed: 'shuffle-proof-a' });
  const replay = engine({ seed: 'shuffle-proof-a' });
  const other = engine({ seed: 'shuffle-proof-b' });

  assert.deepEqual(order(first, 'p1'), order(replay, 'p1'));
  assert.deepEqual(order(first, 'p2'), order(replay, 'p2'));
  assert.notDeepEqual(order(first, 'p1'), order(other, 'p1'));
  assert.notDeepEqual(order(first, 'p2'), order(other, 'p2'));
  assert.equal(first.player('p1').hand.length + first.player('p1').deck.length, 40);
  assert.equal(first.player('p2').hand.length + first.player('p2').deck.length, 40);
});

test('normal draw fills 0-3 cards to 5, otherwise draws 2 up to 8', () => {
  const battle = engine();
  const player = battle.player('p1');
  player.hand = [];
  battle._normalDraw(player);
  assert.equal(player.hand.length, 5);
  player.hand = player.hand.slice(0, 4);
  battle._normalDraw(player);
  assert.equal(player.hand.length, 6);
  player.hand = [...player.hand, ...player.deck.splice(-2)];
  assert.equal(player.hand.length, 8);
  battle._normalDraw(player);
  assert.equal(player.hand.length, 8);
});

test('empty deck reshuffles graveyard and continues drawing', () => {
  const battle = engine();
  const player = battle.player('p1');
  player.hand = [];
  player.deck = [];
  player.graveyard = [
    { instanceId: 'g1', masterId: 'training-life' },
    { instanceId: 'g2', masterId: 'training-atk' },
  ];
  const drawn = battle._drawCards(player, 2, 'test');
  assert.equal(drawn, 2);
  assert.equal(player.hand.length, 2);
  assert.equal(player.graveyard.length, 0);
  assert.equal(player.metrics.reshuffles, 1);
});

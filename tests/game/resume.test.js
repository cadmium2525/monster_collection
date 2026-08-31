import test from 'node:test';
import assert from 'node:assert/strict';
import { BattleEngine } from '../../src/battle/BattleEngine.js';
import { createBaselineDeck } from '../../src/data/default-decks.js';
import { DeckCollection } from '../../src/decks/DeckCollection.js';
import { GameSession } from '../../src/game/GameSession.js';
import { CardStealSession } from '../../src/reward/CardStealSession.js';
import { engine, legalDeck, masterData, masterIndex, placeUnit } from '../helpers.js';

test('battle checkpoint restores exact state, RNG, and deterministic continuation', () => {
  const original = new BattleEngine({
    masterData,
    seed: 'battle-resume',
    firstPlayerId: 'p1',
    players: [
      { id: 'p1', displayName: 'Player 1', cards: legalDeck('resume-p1') },
      { id: 'p2', displayName: 'Player 2', cards: legalDeck('resume-p2') },
    ],
  });
  original.submitMulligan('p1', []);
  original.submitMulligan('p2', []);
  original.applyAction({ type: 'end-turn' });

  const restored = BattleEngine.fromCheckpoint({ masterData, checkpoint: original.toCheckpoint() });
  assert.deepEqual(restored.toCheckpoint(), original.toCheckpoint());

  original.applyAction({ type: 'end-turn' });
  restored.applyAction({ type: 'end-turn' });
  assert.deepEqual(restored.toCheckpoint(), original.toCheckpoint());
});

test('legacy battle checkpoints refresh renamed monsters from their stable master ids', () => {
  const original = engine({ seed: 'legacy-monster-name' });
  const unit = placeUnit(original, 'p1', 'ギアセンチネル', 0);
  unit.name = 'ヘンガー';
  unit.baseMonsterName = 'ヘンガー';
  const special = placeUnit(original, 'p1', 'ピクシー', 1);
  special.name = 'ナハトファルター';
  special.specialForm = 'ナハトファルター';
  special.specialFusionId = 'fusion-002';
  special.traitName = '窮地の夜蝶';
  const restored = BattleEngine.fromCheckpoint({ masterData, checkpoint: original.toCheckpoint() });
  assert.equal(restored.player('p1').board[0].name, 'ギアセンチネル');
  assert.equal(restored.player('p1').board[0].baseMonsterName, 'ギアセンチネル');
  assert.equal(restored.player('p1').board[1].name, 'ルナモルフォ');
  assert.equal(restored.player('p1').board[1].specialForm, 'ルナモルフォ');
  assert.equal(restored.player('p1').board[1].baseMonsterName, 'ピクシー');
  assert.equal(restored.player('p1').board[1].traitName, '窮地の夜蝶');
});

test('card-steal checkpoint preserves offers and unfinished selections', () => {
  const original = new CardStealSession({
    playerCards: legalDeck('reward-player'),
    defeatedCards: legalDeck('reward-enemy'),
    masterIndex,
    deckId: 'deck-resume',
    seed: 'reward-resume',
  });
  const offerId = original.getState().offered[0].offerId;
  original.toggleOffer(offerId);
  original.toggleRelease(original.originalCards[0].instanceId);

  const restored = CardStealSession.fromCheckpoint({ masterIndex, checkpoint: original.toCheckpoint() });
  assert.deepEqual(restored.toCheckpoint(), original.toCheckpoint());
  assert.deepEqual(restored.preview(), original.preview());
});

function resumableSession() {
  let activeRun = null;
  const repository = {
    async saveDeck(deck) { return deck; },
    async saveActiveRun(checkpoint) { activeRun = structuredClone(checkpoint); return structuredClone(activeRun); },
    async clearActiveRun(tombstone) { activeRun = { ...structuredClone(tombstone), phase: 'cleared' }; return structuredClone(activeRun); },
    async getActiveRun() { return structuredClone(activeRun); },
  };
  const decks = new DeckCollection({ masterIndex, idFactory: () => 'resume-deck' });
  const deck = decks.create({ deckName: '再開テスト40', cards: createBaselineDeck(masterData, 'resume-source') });
  const create = () => new GameSession({
    masterData,
    masterIndex,
    deckCollection: decks,
    repository,
    user: { id: 'resume-user', displayName: '再開テスター' },
    seed: 'session-resume',
  });
  return { repository, decks, deck, create };
}

test('game session restores an in-progress battle and clears a lost run', async () => {
  const fixture = resumableSession();
  const original = fixture.create();
  await original.startTournament(fixture.deck.deckId, 'bronze');
  const battle = original.createCurrentBattle();
  await Promise.resolve();
  const checkpoint = await fixture.repository.getActiveRun();
  const restored = GameSession.restore({
    masterData,
    masterIndex,
    deckCollection: fixture.decks,
    repository: fixture.repository,
    user: { id: 'resume-user', displayName: '再開テスター' },
    checkpoint,
  });
  assert.deepEqual(restored.activeBattle.toCheckpoint(), battle.toCheckpoint());

  restored.activeBattle.state.status = 'finished';
  restored.activeBattle.state.winnerId = restored.tournament.getCurrentOpponent().id;
  await restored.completeBattle(restored.activeBattle);
  assert.equal((await fixture.repository.getActiveRun()).phase, 'cleared');
});

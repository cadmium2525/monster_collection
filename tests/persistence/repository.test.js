import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { FirebaseGameRepository, LocalGameRepository, MemoryStorage, ResilientGameRepository } from '../../src/persistence/index.js';
import { legalDeck } from '../helpers.js';

function savedDeck(deckId = 'deck-1') {
  return {
    deckId,
    deckName: '保存40',
    cards: legalDeck(deckId),
    totalPlayTp: 120,
    qualification: 'bronze',
    highestReached: 'bronze',
    representativeMonsterId: 'monster-003',
    createdAt: '2026-08-24T00:00:00.000Z',
    updatedAt: '2026-08-24T00:00:00.000Z',
  };
}

function championPayload(expectedVersion = 0) {
  const championDeckSnapshot = legalDeck('champion');
  return {
    expectedVersion,
    championDisplayName: 'テスト王者',
    championDeckId: 'deck-1',
    championDeckName: '王者40',
    championDeckSnapshot,
    championGrowthSnapshot: {
      [championDeckSnapshot[0].instanceId]: { life: 15, atk: 10, def: 5, learnedMoveIds: [], equippedMoveIds: [] },
    },
    championSnapshotVersion: 2,
    representativeMonsterId: 'monster-003',
  };
}

test('local repository stores user decks and emits champion updates with version checks', async () => {
  const repository = new LocalGameRepository({
    storage: new MemoryStorage(),
    idFactory: () => 'test-user',
    now: () => '2026-08-24T01:02:03.000Z',
  });
  const user = await repository.initialize();
  assert.equal(user.id, 'local-test-user');
  await repository.saveDeck(savedDeck());
  assert.equal((await repository.listDecks()).length, 1);
  const updates = [];
  const unsubscribe = repository.subscribeChampion((champion) => updates.push(champion));
  const champion = await repository.claimChampionship(championPayload(0));
  assert.equal(champion.championVersion, 1);
  assert.equal(champion.championSnapshotVersion, 2);
  assert.equal(champion.championGrowthSnapshot['champion-1'].life, 15);
  await assert.rejects(() => repository.claimChampionship(championPayload(0)), { code: 'champion/version-conflict' });
  await Promise.resolve();
  assert.ok(updates.some((entry) => entry?.championVersion === 1));
  unsubscribe();
});

test('local repository keeps the newest tournament checkpoint and writes a completion tombstone', async () => {
  const repository = new LocalGameRepository({ storage: new MemoryStorage(), idFactory: () => 'resume-local' });
  await repository.initialize();
  const current = { schemaVersion: 1, runId: 'run-1', revision: 2, updatedAtMs: 200, phase: 'battle' };
  await repository.saveActiveRun(current);
  await repository.saveActiveRun({ ...current, revision: 1, updatedAtMs: 100, phase: 'tournament' });
  assert.deepEqual(await repository.getActiveRun(), current);

  await repository.clearActiveRun({ ...current, revision: 3, updatedAtMs: 300 });
  assert.equal((await repository.getActiveRun()).phase, 'cleared');
});

test('local and Firebase repositories persist pack results before reveal without double spending', async () => {
  const cards = Array.from({ length: 5 }, (_, index) => ({
    masterId: `monster-${String(index + 19).padStart(3, '0')}`,
    artVariantId: 'base', finish: 'normal', rarity: 'rare', origin: 'booster',
  }));
  const purchase = { operationId: 'repo-pack-1', faction: '無機', packId: 'pack-inorganic', cards, cost: 300, useFreeCredit: false };

  const local = new LocalGameRepository({ storage: new MemoryStorage(), idFactory: () => 'pack-local' });
  await local.initialize();
  const localOnce = await local.commitPackPurchase(purchase);
  const localTwice = await local.commitPackPurchase(purchase);
  assert.equal(localTwice.diamonds, localOnce.diamonds);
  assert.equal(localTwice.pendingPack.operationId, purchase.operationId);
  assert.equal(localTwice.unassignedAssets.reduce((sum, stack) => sum + stack.quantity, 0), 5);

  const fake = fakeFirebaseSdk();
  const firebase = new FirebaseGameRepository({ config: { projectId: 'test' }, sdkLoader: async () => fake.sdk });
  await firebase.initialize();
  const cloudOnce = await firebase.commitPackPurchase(purchase);
  const cloudTwice = await firebase.commitPackPurchase(purchase);
  assert.equal(cloudTwice.diamonds, cloudOnce.diamonds);
  assert.equal(cloudTwice.pendingPack.operationId, purchase.operationId);
  assert.ok(fake.transactionCount >= 2);
});

test('local and Firebase login rewards are atomic and idempotent for the same Japan date', async () => {
  const local = new LocalGameRepository({ storage: new MemoryStorage(), idFactory: () => 'login-local' });
  await local.initialize();
  const localFirst = await local.claimLoginRewards({ loginDate: '2026-08-29' });
  const localAgain = await local.claimLoginRewards({ loginDate: '2026-08-29' });
  assert.equal(localFirst.state.diamonds, 3900);
  assert.deepEqual(localFirst.rewards.map((reward) => reward.amount), [300, 3000]);
  assert.deepEqual(localAgain.rewards, []);
  assert.equal(localAgain.state.diamonds, 3900);

  const fake = fakeFirebaseSdk();
  const firebase = new FirebaseGameRepository({ config: { projectId: 'test' }, sdkLoader: async () => fake.sdk });
  await firebase.initialize();
  const cloudFirst = await firebase.claimLoginRewards({ loginDate: '2026-08-29' });
  const cloudAgain = await firebase.claimLoginRewards({ loginDate: '2026-08-29' });
  assert.equal(cloudFirst.state.diamonds, 3900);
  assert.deepEqual(cloudAgain.rewards, []);
  assert.equal(cloudAgain.state.diamonds, 3900);
  assert.ok(fake.transactionCount >= 2);
});

test('repository stores player-wide tournament unlock without downgrading it', async () => {
  const local = new LocalGameRepository({ storage: new MemoryStorage(), idFactory: () => 'unlock-local' });
  await local.initialize();
  assert.equal((await local.unlockTournamentRank('gold')).tournamentQualification, 'gold');
  assert.equal((await local.unlockTournamentRank('silver')).tournamentQualification, 'gold');

  const fake = fakeFirebaseSdk();
  const firebase = new FirebaseGameRepository({ config: { projectId: 'test' }, sdkLoader: async () => fake.sdk });
  await firebase.initialize();
  assert.equal((await firebase.unlockTournamentRank('legend')).tournamentQualification, 'legend');
  assert.equal((await firebase.unlockTournamentRank('bronze')).tournamentQualification, 'legend');
});

test('resilient repository preserves local deck when cloud write fails', async () => {
  const local = new LocalGameRepository({ storage: new MemoryStorage(), idFactory: () => 'fallback' });
  const cloud = {
    async initialize() { return { id: 'cloud-user', mode: 'firebase' }; },
    async saveDeck() { throw new Error('network down'); },
    async listDecks() { return []; },
    getStatus() { return { mode: 'firebase' }; },
  };
  const repository = new ResilientGameRepository({ local, cloud });
  await repository.initialize();
  await repository.saveDeck(savedDeck('safe-copy'));
  assert.equal((await local.listDecks())[0].deckId, 'safe-copy');
  assert.match(repository.getStatus().error, /network down/);
});

test('cloud delete failure leaves the recoverable local deck intact', async () => {
  const local = new LocalGameRepository({ storage: new MemoryStorage(), idFactory: () => 'delete-safe' });
  const cloud = {
    async initialize() { return { id: 'cloud-user', mode: 'firebase' }; },
    async deleteDeck() { throw new Error('offline'); },
  };
  const repository = new ResilientGameRepository({ local, cloud });
  await repository.initialize();
  await local.saveDeck(savedDeck('keep-me'));
  await assert.rejects(() => repository.deleteDeck('keep-me'), { code: 'repository/unavailable' });
  assert.equal((await local.listDecks())[0].deckId, 'keep-me');
});

function fakeFirebaseSdk() {
  const docs = new Map();
  const listeners = new Map();
  let transactionCount = 0;
  const pathOf = (...parts) => parts.filter((part) => typeof part === 'string').join('/');
  const snapshot = (path) => ({
    id: path.split('/').at(-1),
    exists: () => docs.has(path),
    data: () => structuredClone(docs.get(path)),
  });
  const resolveTimestamps = (value) => {
    if (Array.isArray(value)) return value.map(resolveTimestamps);
    if (value && typeof value === 'object') {
      if (value.__serverTimestamp) return '2026-08-24T02:03:04.000Z';
      return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, resolveTimestamps(child)]));
    }
    return value;
  };
  const notify = (path) => { for (const callback of listeners.get(path) ?? []) callback(snapshot(path)); };
  const sdk = {
    initializeApp: () => ({}),
    getAuth: () => ({ currentUser: { uid: 'firebase-user', isAnonymous: true } }),
    signInAnonymously: async () => ({ user: { uid: 'firebase-user', isAnonymous: true } }),
    getFirestore: () => ({}),
    doc: (...parts) => ({ path: pathOf(...parts) }),
    collection: (...parts) => ({ path: pathOf(...parts) }),
    orderBy: (field, direction) => ({ kind: 'orderBy', field, direction }),
    limit: (count) => ({ kind: 'limit', count }),
    query: (reference, ...constraints) => ({ ...reference, constraints }),
    serverTimestamp: () => ({ __serverTimestamp: true }),
    getDoc: async (reference) => snapshot(reference.path),
    setDoc: async (reference, data, options = {}) => {
      const next = resolveTimestamps(data);
      docs.set(reference.path, options.merge ? { ...(docs.get(reference.path) ?? {}), ...next } : next);
      notify(reference.path);
    },
    deleteDoc: async (reference) => { docs.delete(reference.path); notify(reference.path); },
    getDocs: async (reference) => {
      let entries = [...docs.entries()].filter(([path]) => path.startsWith(`${reference.path}/`) && path.split('/').length === reference.path.split('/').length + 1);
      const order = reference.constraints?.find((constraint) => constraint.kind === 'orderBy');
      if (order) entries.sort(([, a], [, b]) => String(b[order.field] ?? '').localeCompare(String(a[order.field] ?? '')) * (order.direction === 'desc' ? 1 : -1));
      const cap = reference.constraints?.find((constraint) => constraint.kind === 'limit');
      if (cap) entries = entries.slice(0, cap.count);
      return { docs: entries.map(([path]) => snapshot(path)) };
    },
    onSnapshot: (reference, callback) => {
      if (!listeners.has(reference.path)) listeners.set(reference.path, new Set());
      listeners.get(reference.path).add(callback);
      callback(snapshot(reference.path));
      return () => listeners.get(reference.path).delete(callback);
    },
    runTransaction: async (_db, updateFunction) => {
      transactionCount += 1;
      const writes = [];
      const transaction = {
        get: async (reference) => snapshot(reference.path),
        set: (reference, data, options = {}) => writes.push({ kind: 'set', reference, data, options }),
        update: (reference, data) => writes.push({ kind: 'update', reference, data }),
      };
      const result = await updateFunction(transaction);
      for (const write of writes) {
        const data = resolveTimestamps(write.data);
        docs.set(write.reference.path, write.kind === 'update' || write.options?.merge
          ? { ...docs.get(write.reference.path), ...data }
          : data);
        notify(write.reference.path);
      }
      return result;
    },
  };
  return { sdk, docs, get transactionCount() { return transactionCount; } };
}

test('Firebase repository uses a transaction and rejects stale championVersion', async () => {
  const fake = fakeFirebaseSdk();
  const repository = new FirebaseGameRepository({ config: { projectId: 'test' }, sdkLoader: async () => fake.sdk });
  await repository.initialize();
  await repository.saveDeck(savedDeck());
  assert.equal((await repository.listDecks()).length, 1);
  const transactionsBeforeCrown = fake.transactionCount;
  const crowned = await repository.claimChampionship(championPayload(0));
  assert.equal(crowned.championVersion, 1);
  assert.equal(crowned.championSnapshotVersion, 2);
  assert.equal(crowned.championGrowthSnapshot['champion-1'].atk, 10);
  assert.equal(fake.transactionCount, transactionsBeforeCrown + 1);
  await assert.rejects(() => repository.claimChampionship(championPayload(0)), { code: 'champion/version-conflict' });
  assert.equal((await repository.getChampion()).championVersion, 1, 'stale write must not overwrite champion');
});

test('Firebase checkpoint transaction prevents a delayed older save from replacing resume state', async () => {
  const fake = fakeFirebaseSdk();
  const repository = new FirebaseGameRepository({ config: { projectId: 'test' }, sdkLoader: async () => fake.sdk });
  await repository.initialize();
  const current = { schemaVersion: 1, runId: 'run-cloud', revision: 4, updatedAtMs: 400, phase: 'reward' };
  await repository.saveActiveRun(current);
  await repository.saveActiveRun({ ...current, revision: 3, updatedAtMs: 300, phase: 'battle' });
  assert.deepEqual(await repository.getActiveRun(), current);

  await repository.clearActiveRun({ ...current, revision: 5, updatedAtMs: 500 });
  assert.equal((await repository.getActiveRun()).phase, 'cleared');
});

test('card ownership and special-fusion discoveries are permanent union sets locally and in Firebase', async () => {
  const storage = new MemoryStorage();
  const local = new LocalGameRepository({ storage, idFactory: () => 'catalog-user', now: () => '2026-08-25T01:00:00.000Z' });
  await local.initialize();
  await local.saveDeck(savedDeck('catalog-deck'));
  await local.recordCardCatalog({ ownedCardMasterIds: ['monster-001'], discoveredFusionIds: ['fusion-014', 'fusion-014'] });
  await local.deleteDeck('catalog-deck');
  const localCatalog = await local.getCardCatalog();
  assert.ok(localCatalog.ownedCardMasterIds.includes('monster-001'));
  assert.ok(localCatalog.ownedCardMasterIds.includes('monster-018'));
  assert.deepEqual(localCatalog.discoveredFusionIds, ['fusion-014']);

  const fake = fakeFirebaseSdk();
  const firebase = new FirebaseGameRepository({ config: { projectId: 'test' }, sdkLoader: async () => fake.sdk });
  await firebase.initialize();
  await firebase.recordCardCatalog({ ownedCardMasterIds: ['monster-002', 'monster-001'], discoveredFusionIds: ['fusion-036'] });
  await firebase.recordCardCatalog({ ownedCardMasterIds: ['monster-001'], discoveredFusionIds: ['fusion-014'] });
  assert.deepEqual(await firebase.getCardCatalog(), {
    schemaVersion: 1,
    ownedCardMasterIds: ['monster-001', 'monster-002'],
    discoveredFusionIds: ['fusion-014', 'fusion-036'],
    updatedAt: '2026-08-24T02:03:04.000Z',
  });
});

test('Firebase publishes Legend-qualified decks for other players and removes the snapshot with its source deck', async () => {
  const fake = fakeFirebaseSdk();
  const repository = new FirebaseGameRepository({ config: { projectId: 'test' }, sdkLoader: async () => fake.sdk });
  await repository.initialize();
  const legendDeck = { ...savedDeck('legend-ready'), qualification: 'legend', highestReached: 'gold' };
  await repository.saveDeck(legendDeck);

  const ownPath = 'legendDecks/firebase-user--legend-ready';
  assert.equal(fake.docs.get(ownPath).cards.length, 40);
  assert.equal(fake.docs.get(ownPath).ownerDisplayName, '名無しブリーダー');
  assert.equal(fake.docs.get(ownPath).qualification, 'legend');

  fake.docs.set('legendDecks/other-user--rival-deck', {
    publicDeckId: 'other-user--rival-deck', ownerUserId: 'other-user', ownerDisplayName: '遠征ブリーダー',
    sourceDeckId: 'rival-deck', deckName: '遠征40', cards: legalDeck('rival'), totalPlayTp: 120,
    qualification: 'legend', highestReached: 'legend', representativeMonsterId: 'monster-003', schemaVersion: 1,
    publishedAt: '2026-08-24T02:00:00.000Z', updatedAt: '2026-08-24T03:00:00.000Z',
  });
  const publicDecks = await repository.listLegendDecks();
  assert.deepEqual(publicDecks.map((deck) => deck.ownerDisplayName), ['遠征ブリーダー']);
  assert.equal(publicDecks[0].cards.length, 40);

  await repository.deleteDeck(legendDeck.deckId);
  assert.equal(fake.docs.has(ownPath), false);
});

test('Firestore rules expose Legend snapshots read-only to authenticated opponents and cross-check the private source deck', () => {
  const rules = fs.readFileSync(new URL('../../firestore.rules', import.meta.url), 'utf8');
  assert.match(rules, /match \/legendDecks\/\{publicDeckId\}/);
  assert.match(rules, /allow read: if signedIn\(\)/);
  assert.match(rules, /validLegendSource\(request\.resource\.data\)/);
  assert.match(rules, /profile\.economy\.tournamentQualification == 'legend'/);
  assert.match(rules, /source\.cards == d\.cards/);
  assert.match(rules, /allow delete: if signedIn\(\) && resource\.data\.ownerUserId == request\.auth\.uid/);
  assert.match(rules, /championGrowthSnapshot is map/);
  assert.match(rules, /championSnapshotVersion == 2/);
});

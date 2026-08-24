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
  return {
    expectedVersion,
    championDisplayName: 'テスト王者',
    championDeckId: 'deck-1',
    championDeckName: '王者40',
    championDeckSnapshot: legalDeck('champion'),
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
  await assert.rejects(() => repository.claimChampionship(championPayload(0)), { code: 'champion/version-conflict' });
  await Promise.resolve();
  assert.ok(updates.some((entry) => entry?.championVersion === 1));
  unsubscribe();
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
        set: (reference, data) => writes.push({ kind: 'set', reference, data }),
        update: (reference, data) => writes.push({ kind: 'update', reference, data }),
      };
      const result = await updateFunction(transaction);
      for (const write of writes) {
        const data = resolveTimestamps(write.data);
        docs.set(write.reference.path, write.kind === 'update' ? { ...docs.get(write.reference.path), ...data } : data);
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
  const crowned = await repository.claimChampionship(championPayload(0));
  assert.equal(crowned.championVersion, 1);
  assert.equal(fake.transactionCount, 1);
  await assert.rejects(() => repository.claimChampionship(championPayload(0)), { code: 'champion/version-conflict' });
  assert.equal((await repository.getChampion()).championVersion, 1, 'stale write must not overwrite champion');
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
  assert.match(rules, /source\.qualification == 'legend'/);
  assert.match(rules, /source\.cards == d\.cards/);
  assert.match(rules, /allow delete: if signedIn\(\) && resource\.data\.ownerUserId == request\.auth\.uid/);
});

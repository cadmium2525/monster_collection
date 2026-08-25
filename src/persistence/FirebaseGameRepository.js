import { ChampionConflictError } from './errors.js';
import { loadFirebaseSdk } from './firebase-sdk.js';
import { mergeCardCatalogs, normalizeCardCatalog } from './card-catalog.js';

function clone(value) { return value == null ? value : structuredClone(value); }

function normalizedTimestamp(value) {
  if (!value) return null;
  if (typeof value.toDate === 'function') return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  return value;
}

function normalizeRecord(data) {
  if (!data) return data;
  return {
    ...clone(data),
    createdAt: normalizedTimestamp(data.createdAt),
    updatedAt: normalizedTimestamp(data.updatedAt),
    publishedAt: normalizedTimestamp(data.publishedAt),
    crownedAt: normalizedTimestamp(data.crownedAt),
    catalogUpdatedAt: normalizedTimestamp(data.catalogUpdatedAt),
  };
}

function publicDeckId(userId, deckId) {
  return `${userId}--${encodeURIComponent(String(deckId))}`;
}

export class FirebaseGameRepository {
  constructor({ config, sdkLoader = loadFirebaseSdk }) {
    if (!config?.projectId) throw new Error('Firebase projectId is required');
    this.config = config;
    this.sdkLoader = sdkLoader;
    this.sdk = null;
    this.user = null;
  }

  async initialize() {
    this.sdk = await this.sdkLoader();
    this.app = this.sdk.initializeApp(this.config);
    this.auth = this.sdk.getAuth(this.app);
    this.db = this.sdk.getFirestore(this.app);
    const credential = this.auth.currentUser ? { user: this.auth.currentUser } : await this.sdk.signInAnonymously(this.auth);
    this.user = credential.user;
    const profileRef = this.sdk.doc(this.db, 'users', this.user.uid);
    const existing = await this.sdk.getDoc(profileRef);
    if (!existing.exists()) {
      await this.sdk.setDoc(profileRef, {
        displayName: '名無しブリーダー', isAnonymous: this.user.isAnonymous,
        ownedCardMasterIds: [], discoveredFusionIds: [], catalogSchemaVersion: 1,
        createdAt: this.sdk.serverTimestamp(), updatedAt: this.sdk.serverTimestamp(),
      });
    }
    this.profile = await this.getProfile();
    return { id: this.user.uid, ...this.profile, mode: 'firebase' };
  }

  _requireUser() { if (!this.user) throw new Error('Firebase repository is not initialized'); }
  _profileRef() { this._requireUser(); return this.sdk.doc(this.db, 'users', this.user.uid); }
  _decksRef() { this._requireUser(); return this.sdk.collection(this.db, 'users', this.user.uid, 'savedDecks'); }
  _deckRef(deckId) { this._requireUser(); return this.sdk.doc(this.db, 'users', this.user.uid, 'savedDecks', deckId); }
  _legendDecksRef() { this._requireUser(); return this.sdk.collection(this.db, 'legendDecks'); }
  _legendDeckRef(deckId) { this._requireUser(); return this.sdk.doc(this.db, 'legendDecks', publicDeckId(this.user.uid, deckId)); }
  _championRef() { return this.sdk.doc(this.db, 'gameState', 'champion'); }

  async getProfile() {
    const snapshot = await this.sdk.getDoc(this._profileRef());
    return snapshot.exists() ? normalizeRecord(snapshot.data()) : null;
  }

  async setDisplayName(displayName) {
    const value = String(displayName ?? '').trim();
    if (!value || [...value].length > 24) throw new Error('表示名は1〜24文字です');
    await this.sdk.setDoc(this._profileRef(), { displayName: value, updatedAt: this.sdk.serverTimestamp() }, { merge: true });
    this.profile = await this.getProfile();
    return { ...this.profile, id: this.user.uid };
  }

  async listDecks() {
    const snapshots = await this.sdk.getDocs(this._decksRef());
    return snapshots.docs.map((snapshot) => normalizeRecord({ ...snapshot.data(), deckId: snapshot.id }));
  }

  async getActiveRun() {
    const profile = await this.getProfile();
    return clone(profile?.activeRun ?? null);
  }

  async saveActiveRun(checkpoint) {
    if (!checkpoint?.runId || !Number.isFinite(Number(checkpoint.updatedAtMs))) throw new Error('大会の再開データが不正です');
    const reference = this._profileRef();
    await this.sdk.runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists() ? snapshot.data().activeRun : null;
      if (current && Number(current.updatedAtMs) > Number(checkpoint.updatedAtMs)) return;
      transaction.set(reference, {
        activeRun: clone(checkpoint),
        activeRunUpdatedAt: this.sdk.serverTimestamp(),
        updatedAt: this.sdk.serverTimestamp(),
      }, { merge: true });
    });
    return this.getActiveRun();
  }

  async clearActiveRun(tombstone) {
    return this.saveActiveRun({ ...clone(tombstone), phase: 'cleared' });
  }

  async getCardCatalog() {
    const profile = await this.getProfile();
    return normalizeCardCatalog({
      ownedCardMasterIds: profile?.ownedCardMasterIds,
      discoveredFusionIds: profile?.discoveredFusionIds,
      updatedAt: profile?.catalogUpdatedAt,
    });
  }

  async recordCardCatalog(update = {}) {
    const reference = this._profileRef();
    await this.sdk.runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists() ? snapshot.data() : {};
      const next = mergeCardCatalogs(current, update);
      transaction.set(reference, {
        ownedCardMasterIds: next.ownedCardMasterIds,
        discoveredFusionIds: next.discoveredFusionIds,
        catalogSchemaVersion: 1,
        catalogUpdatedAt: this.sdk.serverTimestamp(),
      }, { merge: true });
    });
    const catalog = await this.getCardCatalog();
    this.profile = {
      ...this.profile,
      ownedCardMasterIds: catalog.ownedCardMasterIds,
      discoveredFusionIds: catalog.discoveredFusionIds,
      catalogUpdatedAt: catalog.updatedAt,
    };
    return catalog;
  }

  async saveDeck(deck) {
    await this.sdk.setDoc(this._deckRef(deck.deckId), {
      ...clone(deck),
      ownerUserId: this.user.uid,
      updatedAt: this.sdk.serverTimestamp(),
    }, { merge: true });
    await this.recordCardCatalog({ ownedCardMasterIds: deck.cards.map((card) => card.masterId) });
    if (deck.qualification === 'legend') await this._publishLegendDeck(deck);
    return clone(deck);
  }

  async _publishLegendDeck(deck) {
    const reference = this._legendDeckRef(deck.deckId);
    const existing = await this.sdk.getDoc(reference);
    await this.sdk.setDoc(reference, {
      publicDeckId: publicDeckId(this.user.uid, deck.deckId),
      ownerUserId: this.user.uid,
      ownerDisplayName: this.profile?.displayName ?? '名無しブリーダー',
      sourceDeckId: deck.deckId,
      deckName: deck.deckName,
      cards: clone(deck.cards),
      totalPlayTp: deck.totalPlayTp,
      qualification: 'legend',
      highestReached: deck.highestReached,
      representativeMonsterId: deck.representativeMonsterId ?? null,
      schemaVersion: 1,
      publishedAt: existing.exists() ? existing.data().publishedAt : this.sdk.serverTimestamp(),
      updatedAt: this.sdk.serverTimestamp(),
    });
  }

  async listLegendDecks(maxResults = 60) {
    const requested = Math.max(1, Math.min(100, Math.trunc(Number(maxResults) || 60)));
    const source = this.sdk.query(
      this._legendDecksRef(),
      this.sdk.orderBy('updatedAt', 'desc'),
      this.sdk.limit(requested + 5),
    );
    const snapshots = await this.sdk.getDocs(source);
    return snapshots.docs
      .map((snapshot) => normalizeRecord({ ...snapshot.data(), publicDeckId: snapshot.id }))
      .filter((record) => record.ownerUserId !== this.user.uid && record.qualification === 'legend')
      .sort((a, b) => String(b.updatedAt ?? '').localeCompare(String(a.updatedAt ?? '')))
      .slice(0, requested);
  }

  async deleteDeck(deckId) {
    const publicReference = this._legendDeckRef(deckId);
    const publicSnapshot = await this.sdk.getDoc(publicReference);
    await this.sdk.deleteDoc(this._deckRef(deckId));
    if (publicSnapshot.exists()) await this.sdk.deleteDoc(publicReference);
  }

  async getChampion() {
    const snapshot = await this.sdk.getDoc(this._championRef());
    return snapshot.exists() ? normalizeRecord(snapshot.data()) : null;
  }

  subscribeChampion(callback, onError = null) {
    return this.sdk.onSnapshot(this._championRef(), (snapshot) => {
      callback(snapshot.exists() ? normalizeRecord(snapshot.data()) : null);
    }, onError ?? (() => {}));
  }

  async claimChampionship(payload) {
    this._requireUser();
    const reference = this._championRef();
    await this.sdk.runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists() ? snapshot.data() : null;
      const actualVersion = current?.championVersion ?? 0;
      if (actualVersion !== payload.expectedVersion) {
        throw new ChampionConflictError({ expectedVersion: payload.expectedVersion, actualVersion });
      }
      transaction.set(reference, {
        championUserId: this.user.uid,
        championDisplayName: payload.championDisplayName,
        championDeckId: payload.championDeckId,
        championDeckName: payload.championDeckName,
        championDeckSnapshot: clone(payload.championDeckSnapshot),
        representativeMonsterId: payload.representativeMonsterId ?? null,
        crownedAt: this.sdk.serverTimestamp(),
        defenseCount: 0,
        championVersion: actualVersion + 1,
      });
    });
    return this.getChampion();
  }

  async recordDefense(expectedVersion) {
    const reference = this._championRef();
    await this.sdk.runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists() ? snapshot.data() : null;
      const actualVersion = current?.championVersion ?? 0;
      if (!current || current.championUserId !== this.user.uid || actualVersion !== expectedVersion) {
        throw new ChampionConflictError({ expectedVersion, actualVersion });
      }
      transaction.update(reference, { defenseCount: (current.defenseCount ?? 0) + 1, championVersion: actualVersion + 1 });
    });
    return this.getChampion();
  }

  getStatus() { return { mode: 'firebase', connected: true, userId: this.user?.uid ?? null, error: null }; }
}

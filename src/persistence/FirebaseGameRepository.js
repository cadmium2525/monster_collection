import { ChampionConflictError } from './errors.js';
import { loadFirebaseSdk } from './firebase-sdk.js';
import { mergeCardCatalogs, normalizeCardCatalog } from './card-catalog.js';
import {
  acknowledgePendingPack,
  applyCampaignGiftClaim,
  applyDiamondReward,
  applyLoginRewards,
  applyPackPurchase,
  applyProgressionOperation,
  applyTournamentUnlock,
  normalizeEconomyState,
} from '../gacha/economy-state.js';
import { applyPlayerStatsEvent, normalizePlayerStats } from '../profile/player-stats.js';
import { normalizePlayerIconMasterId } from '../profile/player-icon.js';
import { normalizeHomeArtworkSelection } from '../profile/home-artwork.js';
import {
  playerIdToRecoveryEmail,
  recoveryEmailToPlayerId,
  validatePlayerId,
} from './player-id.js';

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
    registeredAt: normalizedTimestamp(data.registeredAt),
    ratingReachedAt: normalizedTimestamp(data.ratingReachedAt),
    archivedAt: normalizedTimestamp(data.archivedAt),
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
    // Firebase restores the persisted user asynchronously. Reading currentUser
    // before that first restore settles can make an existing player look like a
    // brand-new anonymous user on slower mobile/PWA launches.
    await this.auth.authStateReady?.();
    const credential = this.auth.currentUser ? { user: this.auth.currentUser } : await this.sdk.signInAnonymously(this.auth);
    this.user = credential.user;
    await this._ensureProfile();
    this.profile = await this.getProfile();
    return { id: this.user.uid, ...this.profile, mode: 'firebase' };
  }

  async _ensureProfile() {
    const profileRef = this.sdk.doc(this.db, 'users', this.user.uid);
    const existing = await this.sdk.getDoc(profileRef);
    if (!existing.exists()) {
      await this.sdk.setDoc(profileRef, {
        displayName: '名無しブリーダー', playerIconMasterId: null, homeArtwork: null, isAnonymous: this.user.isAnonymous,
        ownedCardMasterIds: [], discoveredFusionIds: [], catalogSchemaVersion: 1,
        economy: normalizeEconomyState(null),
        stats: normalizePlayerStats(null),
        createdAt: this.sdk.serverTimestamp(), updatedAt: this.sdk.serverTimestamp(),
      });
    }
  }

  _requireUser() { if (!this.user) throw new Error('Firebase repository is not initialized'); }
  _profileRef() { this._requireUser(); return this.sdk.doc(this.db, 'users', this.user.uid); }
  _decksRef() { this._requireUser(); return this.sdk.collection(this.db, 'users', this.user.uid, 'savedDecks'); }
  _deckRef(deckId) { this._requireUser(); return this.sdk.doc(this.db, 'users', this.user.uid, 'savedDecks', deckId); }
  _legendDecksRef() { this._requireUser(); return this.sdk.collection(this.db, 'legendDecks'); }
  _legendDeckRef(deckId) { this._requireUser(); return this.sdk.doc(this.db, 'legendDecks', publicDeckId(this.user.uid, deckId)); }
  _arenaDecksRef() { this._requireUser(); return this.sdk.collection(this.db, 'arenaDecks'); }
  _arenaDeckRef(deckId) { this._requireUser(); return this.sdk.doc(this.db, 'arenaDecks', publicDeckId(this.user.uid, deckId)); }
  _arenaRankingsRef() { this._requireUser(); return this.sdk.collection(this.db, 'arenaRankings'); }
  _arenaRankingRef() { this._requireUser(); return this.sdk.doc(this.db, 'arenaRankings', this.user.uid); }
  _legendArchivesRef() { return this.sdk.collection(this.db, 'legendArchives'); }
  _legendArchiveRef(version) { return this.sdk.doc(this.db, 'legendArchives', `champion-${String(version).padStart(8, '0')}`); }
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

  async setPlayerIcon(playerIconMasterId) {
    const value = normalizePlayerIconMasterId(playerIconMasterId);
    if (playerIconMasterId != null && !value) throw new Error('プレイヤーアイコンが不正です');
    await this.sdk.setDoc(this._profileRef(), { playerIconMasterId: value, updatedAt: this.sdk.serverTimestamp() }, { merge: true });
    this.profile = await this.getProfile();
    return { ...this.profile, id: this.user.uid };
  }

  async setHomeArtwork(homeArtwork) {
    const value = normalizeHomeArtworkSelection(homeArtwork);
    if (homeArtwork != null && !value) throw new Error('ホーム画面イラストの設定が不正です');
    await this.sdk.setDoc(this._profileRef(), { homeArtwork: value, updatedAt: this.sdk.serverTimestamp() }, { merge: true });
    this.profile = await this.getProfile();
    return { ...this.profile, id: this.user.uid };
  }

  async getAccountStatus() {
    this._requireUser();
    const recoveryEnabled = !this.user.isAnonymous
      && (this.user.providerData ?? []).some((provider) => provider?.providerId === 'password');
    const playerId = this.profile?.recoveryPlayerId
      ?? recoveryEmailToPlayerId(this.user.email);
    return {
      mode: 'firebase', available: true, recoveryEnabled,
      isAnonymous: Boolean(this.user.isAnonymous), playerId,
      userId: this.user.uid,
    };
  }

  async linkRecoveryAccount({ playerId, password }) {
    this._requireUser();
    const normalizedPlayerId = validatePlayerId(playerId);
    if (String(password ?? '').length < 6) throw new Error('パスワードは6文字以上で設定してください');
    const credential = this.sdk.EmailAuthProvider.credential(playerIdToRecoveryEmail(normalizedPlayerId), String(password));
    const result = await this.sdk.linkWithCredential(this.user, credential);
    this.user = result.user;
    await this.sdk.setDoc(this._profileRef(), {
      isAnonymous: false,
      recoveryEnabled: true,
      recoveryPlayerId: normalizedPlayerId,
      recoverySchemeVersion: 1,
      updatedAt: this.sdk.serverTimestamp(),
    }, { merge: true });
    this.profile = await this.getProfile();
    return this.getAccountStatus();
  }

  async signInRecoveryAccount({ playerId, password }) {
    const normalizedPlayerId = validatePlayerId(playerId);
    const result = await this.sdk.signInWithEmailAndPassword(
      this.auth,
      playerIdToRecoveryEmail(normalizedPlayerId),
      String(password ?? ''),
    );
    this.user = result.user;
    await this._ensureProfile();
    this.profile = await this.getProfile();
    return { id: this.user.uid, ...this.profile, mode: 'firebase', account: await this.getAccountStatus() };
  }

  async getPlayerStats() {
    const profile = await this.getProfile();
    return normalizePlayerStats(profile?.stats);
  }

  async recordPlayerStats(event) {
    const reference = this._profileRef();
    let result = null;
    await this.sdk.runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      result = applyPlayerStatsEvent(snapshot.exists() ? snapshot.data().stats : null, event);
      transaction.set(reference, {
        stats: clone(result),
        updatedAt: this.sdk.serverTimestamp(),
      }, { merge: true });
    });
    return clone(result);
  }

  async getEconomy() {
    const profile = await this.getProfile();
    const normalized = normalizeEconomyState(profile?.economy);
    if (!profile?.economy) {
      await this.sdk.setDoc(this._profileRef(), {
        economy: normalized,
        updatedAt: this.sdk.serverTimestamp(),
      }, { merge: true });
    }
    return normalized;
  }

  async replaceEconomy(economy) {
    const normalized = normalizeEconomyState(economy);
    await this.sdk.setDoc(this._profileRef(), {
      economy: normalized,
      updatedAt: this.sdk.serverTimestamp(),
    }, { merge: true });
    return normalized;
  }

  async _updateEconomy(mutator) {
    const reference = this._profileRef();
    let result = null;
    await this.sdk.runTransaction(this.db, async (transaction) => {
      const snapshot = await transaction.get(reference);
      const current = snapshot.exists() ? snapshot.data().economy : null;
      result = mutator(current);
      transaction.set(reference, {
        economy: clone(result),
        updatedAt: this.sdk.serverTimestamp(),
      }, { merge: true });
    });
    return clone(result);
  }

  async commitPackPurchase(purchase) {
    return this._updateEconomy((current) => applyPackPurchase(current, purchase));
  }

  async acknowledgePack(operationId) {
    return this._updateEconomy((current) => acknowledgePendingPack(current, operationId));
  }

  async creditDiamonds(reward) {
    return this._updateEconomy((current) => applyDiamondReward(current, reward));
  }

  async unlockTournamentRank(rank) {
    return this._updateEconomy((current) => applyTournamentUnlock(current, rank));
  }

  async claimLoginRewards(config = {}) {
    let rewards = [];
    const state = await this._updateEconomy((current) => {
      const result = applyLoginRewards(current, config);
      rewards = result.rewards;
      return result.state;
    });
    this.profile = { ...this.profile, economy: state };
    return { state, rewards: clone(rewards) };
  }

  async claimCampaignGift(config = {}) {
    let reward = null;
    const state = await this._updateEconomy((current) => {
      const result = applyCampaignGiftClaim(current, config);
      reward = result.reward;
      return result.state;
    });
    this.profile = { ...this.profile, economy: state };
    return { state, reward: clone(reward) };
  }

  async commitProgression(operation) {
    return this._updateEconomy((current) => applyProgressionOperation(current, operation));
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

  async saveDeckAndEconomy(deck, economy) {
    const deckReference = this._deckRef(deck.deckId);
    const profileReference = this._profileRef();
    const normalized = normalizeEconomyState(economy);
    await this.sdk.runTransaction(this.db, async (transaction) => {
      transaction.set(deckReference, {
        ...clone(deck),
        ownerUserId: this.user.uid,
        updatedAt: this.sdk.serverTimestamp(),
      }, { merge: true });
      transaction.set(profileReference, {
        economy: normalized,
        updatedAt: this.sdk.serverTimestamp(),
      }, { merge: true });
    });
    await this.recordCardCatalog({ ownedCardMasterIds: deck.cards.map((card) => card.masterId) });
    if (deck.qualification === 'legend') await this._publishLegendDeck(deck);
    return { deck: clone(deck), economy: normalized };
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

  async publishArenaDeck(deck, arena = {}) {
    const reference = this._arenaDeckRef(deck.deckId);
    const existing = await this.sdk.getDoc(reference);
    await this.sdk.setDoc(reference, {
      publicDeckId: publicDeckId(this.user.uid, deck.deckId),
      ownerUserId: this.user.uid,
      ownerDisplayName: this.profile?.displayName ?? '名無しブリーダー',
      sourceDeckId: deck.deckId,
      deckName: deck.deckName,
      cards: clone(deck.cards),
      totalPlayTp: deck.totalPlayTp,
      representativeMonsterId: deck.representativeMonsterId ?? null,
      arenaRating: Math.max(900, Math.round(Number(arena.rating) || 1000)),
      arenaRank: String(arena.rank ?? 'D'),
      schemaVersion: 1,
      registeredAt: existing.exists() ? existing.data().registeredAt : this.sdk.serverTimestamp(),
      updatedAt: this.sdk.serverTimestamp(),
    });
    return normalizeRecord((await this.sdk.getDoc(reference)).data());
  }

  async listArenaDecks(maxResults = 60) {
    const requested = Math.max(1, Math.min(100, Math.trunc(Number(maxResults) || 60)));
    const source = this.sdk.query(this._arenaDecksRef(), this.sdk.orderBy('updatedAt', 'desc'), this.sdk.limit(requested + 10));
    const snapshots = await this.sdk.getDocs(source);
    return snapshots.docs
      .map((snapshot) => normalizeRecord({ ...snapshot.data(), publicDeckId: snapshot.id }))
      .filter((record) => record.ownerUserId !== this.user.uid)
      .slice(0, requested);
  }

  async publishArenaRanking(arena = {}, deck) {
    if (!deck?.deckId) throw new Error('ランキングに使用するデッキがありません');
    const reference = this._arenaRankingRef();
    const [existing, profile] = await Promise.all([this.sdk.getDoc(reference), this.getProfile()]);
    const previous = existing.exists() ? existing.data() : null;
    const rating = Math.max(900, Math.round(Number(arena.rating) || 1000));
    const ratingReachedAt = previous && Number(previous.arenaRating) === rating
      ? previous.ratingReachedAt
      : this.sdk.serverTimestamp();
    await this.sdk.setDoc(reference, {
      ownerUserId: this.user.uid,
      ownerDisplayName: profile?.displayName ?? '名無しブリーダー',
      playerIconMasterId: profile?.playerIconMasterId ?? null,
      sourceDeckId: deck.deckId,
      representativeMonsterId: deck.representativeMonsterId ?? null,
      arenaRating: rating,
      arenaRank: String(arena.rank ?? 'D'),
      wins: Math.max(0, Math.trunc(Number(arena.wins) || 0)),
      losses: Math.max(0, Math.trunc(Number(arena.losses) || 0)),
      schemaVersion: 1,
      registeredAt: previous?.registeredAt ?? this.sdk.serverTimestamp(),
      ratingReachedAt,
      updatedAt: this.sdk.serverTimestamp(),
    });
    return normalizeRecord((await this.sdk.getDoc(reference)).data());
  }

  async getArenaLeaderboard({ topLimit = 50, nearbyRadius = 5 } = {}) {
    const topCount = Math.max(1, Math.min(50, Math.trunc(Number(topLimit) || 50)));
    const radius = Math.max(1, Math.min(10, Math.trunc(Number(nearbyRadius) || 5)));
    const base = this.sdk.query(
      this._arenaRankingsRef(),
      this.sdk.orderBy('arenaRating', 'desc'),
      this.sdk.orderBy('ratingReachedAt', 'asc'),
      this.sdk.orderBy('ownerUserId', 'asc'),
    );
    const [topSnapshots, selfSnapshot, totalSnapshot] = await Promise.all([
      this.sdk.getDocs(this.sdk.query(base, this.sdk.limit(topCount))),
      this.sdk.getDoc(this._arenaRankingRef()),
      this.sdk.getCountFromServer(base).catch(() => null),
    ]);
    const top = topSnapshots.docs.map((snapshot, index) => ({
      ...normalizeRecord({ ...snapshot.data(), ownerUserId: snapshot.id }),
      position: index + 1,
      isSelf: snapshot.id === this.user.uid,
    }));
    const total = Number(totalSnapshot?.data?.().count) || top.length;
    if (!selfSnapshot.exists()) return { available: true, top, nearby: [], selfRank: null, total };

    const selfData = { ...selfSnapshot.data(), ownerUserId: selfSnapshot.id };
    const self = normalizeRecord(selfData);
    const topSelfIndex = top.findIndex((entry) => entry.ownerUserId === this.user.uid);
    if (topSelfIndex >= 0) {
      return {
        available: true,
        top,
        nearby: top.slice(Math.max(0, topSelfIndex - radius), topSelfIndex + radius + 1),
        selfRank: topSelfIndex + 1,
        total,
      };
    }

    const cursor = [selfData.arenaRating, selfData.ratingReachedAt, selfData.ownerUserId];
    try {
      const before = this.sdk.query(base, this.sdk.endBefore(...cursor));
      const [beforeCountSnapshot, aboveSnapshots, fromSelfSnapshots] = await Promise.all([
        this.sdk.getCountFromServer(before),
        this.sdk.getDocs(this.sdk.query(before, this.sdk.limitToLast(radius))),
        this.sdk.getDocs(this.sdk.query(base, this.sdk.startAt(...cursor), this.sdk.limit(radius + 1))),
      ]);
      const selfRank = (Number(beforeCountSnapshot.data().count) || 0) + 1;
      const above = aboveSnapshots.docs.map((snapshot, index) => ({
        ...normalizeRecord({ ...snapshot.data(), ownerUserId: snapshot.id }),
        position: selfRank - aboveSnapshots.docs.length + index,
        isSelf: false,
      }));
      const fromSelf = fromSelfSnapshots.docs.map((snapshot, index) => ({
        ...normalizeRecord({ ...snapshot.data(), ownerUserId: snapshot.id }),
        position: selfRank + index,
        isSelf: snapshot.id === this.user.uid,
      }));
      return { available: true, top, nearby: [...above, ...fromSelf], selfRank, total };
    } catch (error) {
      console.warn('Arena nearby ranking could not be loaded', error);
      return { available: true, top, nearby: [], selfRank: null, total };
    }
  }

  async listLegendArchives(maxResults = 20) {
    const requested = Math.max(1, Math.min(50, Math.trunc(Number(maxResults) || 20)));
    const source = this.sdk.query(this._legendArchivesRef(), this.sdk.orderBy('championVersion', 'desc'), this.sdk.limit(requested));
    const snapshots = await this.sdk.getDocs(source);
    return snapshots.docs.map((snapshot) => normalizeRecord({ ...snapshot.data(), archiveId: snapshot.id }));
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
      const nextChampion = {
        championUserId: this.user.uid,
        championDisplayName: payload.championDisplayName,
        championDeckId: payload.championDeckId,
        championDeckName: payload.championDeckName,
        championDeckSnapshot: clone(payload.championDeckSnapshot),
        championGrowthSnapshot: clone(payload.championGrowthSnapshot ?? {}),
        championSnapshotVersion: payload.championSnapshotVersion ?? 2,
        representativeMonsterId: payload.representativeMonsterId ?? null,
        crownedAt: this.sdk.serverTimestamp(),
        defenseCount: 0,
        championVersion: actualVersion + 1,
      };
      transaction.set(reference, nextChampion);
      transaction.set(this._legendArchiveRef(actualVersion + 1), {
        ...nextChampion,
        archiveId: `champion-${String(actualVersion + 1).padStart(8, '0')}`,
        schemaVersion: 1,
        archivedAt: this.sdk.serverTimestamp(),
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

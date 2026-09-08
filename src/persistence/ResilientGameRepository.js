import { RepositoryUnavailableError } from './errors.js';
import { mergeCardCatalogs } from './card-catalog.js';

export const DEFAULT_CLOUD_TIMEOUT_MS = 10_000;

function cloudTimeout(label, timeoutMs) {
  const error = new RepositoryUnavailableError(`${label}が${Math.ceil(timeoutMs / 1000)}秒以内に完了しませんでした。端末内データで起動します`);
  error.code = 'repository/cloud-timeout';
  return error;
}

async function withTimeout(promise, timeoutMs, label) {
  let timer = null;
  try {
    return await Promise.race([
      Promise.resolve(promise),
      new Promise((_, reject) => {
        timer = setTimeout(() => reject(cloudTimeout(label, timeoutMs)), timeoutMs);
      }),
    ]);
  } finally {
    if (timer != null) clearTimeout(timer);
  }
}

function newerCheckpoint(left, right) {
  if (!left) return right;
  if (!right) return left;
  return Number(right.updatedAtMs) > Number(left.updatedAtMs) ? right : left;
}

function updatedAtValue(record) {
  const parsed = Date.parse(String(record?.updatedAt ?? ''));
  return Number.isFinite(parsed) ? parsed : 0;
}

export class ResilientGameRepository {
  constructor({ local, cloud = null, cloudTimeoutMs = DEFAULT_CLOUD_TIMEOUT_MS, activeRunDebounceMs = 750 }) {
    this.local = local;
    this.cloud = cloud;
    this.activeCloud = null;
    this.user = null;
    this.lastError = null;
    this.cloudTimeoutMs = Math.max(1, Number(cloudTimeoutMs) || DEFAULT_CLOUD_TIMEOUT_MS);
    this.syncSequence = 0;
    this.pendingSyncFlush = null;
    this.activeRunDebounceMs = Math.max(0, Number(activeRunDebounceMs) || 0);
    this.pendingActiveRun = null;
    this.activeRunSyncTimer = null;
    this.activeRunSyncInFlight = null;
  }

  async _cloud(promise, label) {
    try {
      return await withTimeout(promise, this.cloudTimeoutMs, label);
    } catch (error) {
      if (error?.code === 'repository/cloud-timeout') this.activeCloud = null;
      throw error;
    }
  }

  _syncOperationId(kind, payload = {}) {
    const stableId = payload?.operationId
      ?? payload?.event?.operationId
      ?? payload?.purchase?.operationId
      ?? payload?.reward?.operationId
      ?? payload?.checkpoint?.updatedAtMs
      ?? payload?.deck?.updatedAt
      ?? payload?.deck?.deckId
      ?? payload?.loginDate
      ?? payload?.giftId;
    if (stableId != null && String(stableId).trim()) return `${kind}:${String(stableId)}`;
    this.syncSequence += 1;
    return `${kind}:${Date.now().toString(36)}:${this.syncSequence.toString(36)}`;
  }

  async _enqueueSync(kind, payload, { coalesceKey = null, id = null } = {}) {
    if (!this.cloud || !this.local.enqueueSyncOperation) return null;
    const operation = {
      id: id ?? this._syncOperationId(kind, payload),
      kind,
      payload,
      coalesceKey,
    };
    await this.local.enqueueSyncOperation(operation);
    return operation;
  }

  async _completeSync(operation) {
    if (operation?.id) await this.local.removePendingSyncOperation?.(operation.id);
  }

  _dispatchPendingSync(operation) {
    const payload = operation?.payload ?? {};
    switch (operation?.kind) {
      case 'player-stats': return this.activeCloud.recordPlayerStats(payload.event);
      case 'display-name': return this.activeCloud.setDisplayName(payload.name);
      case 'player-icon': return this.activeCloud.setPlayerIcon(payload.playerIconMasterId);
      case 'home-artwork': return this.activeCloud.setHomeArtwork(payload.homeArtwork);
      case 'pack-purchase': return this.activeCloud.commitPackPurchase(payload.purchase);
      case 'pack-acknowledge': return this.activeCloud.acknowledgePack(payload.operationId);
      case 'diamond-credit': return this.activeCloud.creditDiamonds(payload.reward);
      case 'tournament-unlock': return this.activeCloud.unlockTournamentRank(payload.rank);
      case 'login-rewards': return this.activeCloud.claimLoginRewards(payload.config);
      case 'campaign-gift': return this.activeCloud.claimCampaignGift(payload.config);
      case 'progression': return this.activeCloud.commitProgression(payload.operation);
      case 'catalog': return this.activeCloud.recordCardCatalog(payload.update);
      case 'deck-save': return this.activeCloud.saveDeck(payload.deck);
      case 'deck-economy': return this.activeCloud.saveDeckAndEconomy(payload.deck, payload.economy);
      default: throw new Error(`不明な同期保留データです: ${operation?.kind ?? 'unknown'}`);
    }
  }

  async _flushPendingSyncNow() {
    if (!this.activeCloud || !this.local.listPendingSyncOperations) return { complete: false, results: [] };
    const results = [];
    const completedIds = new Set();
    while (this.activeCloud) {
      const operations = (await this.local.listPendingSyncOperations())
        .filter((operation) => !completedIds.has(operation.id));
      if (!operations.length) return { complete: true, results };
      for (const operation of operations) {
        if (!this.activeCloud) return { complete: false, results };
        try {
          const result = await this._cloud(
            Promise.resolve().then(() => this._dispatchPendingSync(operation)),
            '保留中データの同期',
          );
          await this._completeSync(operation);
          completedIds.add(operation.id);
          results.push({ operation, result });
        } catch (error) {
          this.lastError = error;
          return { complete: false, results };
        }
      }
    }
    return { complete: false, results };
  }

  async _flushPendingSync() {
    if (this.pendingSyncFlush) return this.pendingSyncFlush;
    this.pendingSyncFlush = this._flushPendingSyncNow();
    try { return await this.pendingSyncFlush; }
    finally { this.pendingSyncFlush = null; }
  }

  async _syncMutation({ kind, payload, label, fallback, call, coalesceKey = null, id = null }) {
    const operation = await this._enqueueSync(kind, payload, { coalesceKey, id });
    if (!this.activeCloud) return { synced: false, result: fallback };
    if (operation) {
      const flushed = await this._flushPendingSync();
      const completed = flushed.results.find((entry) => entry.operation.id === operation.id);
      return completed
        ? { synced: true, result: completed.result }
        : { synced: false, result: fallback };
    }
    try {
      const result = await this._cloud(Promise.resolve().then(call), label);
      return { synced: true, result };
    } catch (error) {
      this.lastError = error;
      return { synced: false, result: fallback };
    }
  }

  _scheduleActiveRunSync(checkpoint, { immediate = false } = {}) {
    if (!this.activeCloud?.saveActiveRun) return null;
    this.pendingActiveRun = newerCheckpoint(this.pendingActiveRun, checkpoint);
    if (this.activeRunSyncTimer != null) clearTimeout(this.activeRunSyncTimer);
    this.activeRunSyncTimer = null;
    if (immediate || this.activeRunDebounceMs === 0) return this._drainActiveRunSync();
    if (!this.activeRunSyncInFlight) {
      this.activeRunSyncTimer = setTimeout(() => {
        this.activeRunSyncTimer = null;
        void this._drainActiveRunSync();
      }, this.activeRunDebounceMs);
    }
    return null;
  }

  async _drainActiveRunSync() {
    if (this.activeRunSyncTimer != null) clearTimeout(this.activeRunSyncTimer);
    this.activeRunSyncTimer = null;
    if (this.activeRunSyncInFlight) return this.activeRunSyncInFlight;
    this.activeRunSyncInFlight = (async () => {
      while (this.activeCloud?.saveActiveRun && this.pendingActiveRun) {
        const checkpoint = this.pendingActiveRun;
        this.pendingActiveRun = null;
        try {
          await this._cloud(this.activeCloud.saveActiveRun(checkpoint), '試合データの同期');
        } catch (error) {
          this.lastError = error;
          this.pendingActiveRun = newerCheckpoint(checkpoint, this.pendingActiveRun);
          break;
        }
      }
    })();
    try { await this.activeRunSyncInFlight; }
    finally {
      this.activeRunSyncInFlight = null;
      if (this.activeCloud?.saveActiveRun && this.pendingActiveRun && this.activeRunSyncTimer == null) {
        this._scheduleActiveRunSync(this.pendingActiveRun);
      }
    }
  }

  async flushActiveRunSync() {
    await this._drainActiveRunSync();
    if (this.activeCloud?.saveActiveRun && this.pendingActiveRun) await this._drainActiveRunSync();
  }

  async initialize() {
    const localUser = await this.local.initialize();
    if (!this.cloud) {
      this.user = localUser;
      return this.user;
    }
    try {
      const cloudUser = await this._cloud(this.cloud.initialize(), 'クラウドアカウントの確認');
      await this.local.useAccountScope?.(cloudUser.id, { copyCurrent: !localUser.activeScopeId });
      this.activeCloud = this.cloud;
      this.user = cloudUser;
      const pending = await this.local.listPendingSyncOperations?.() ?? [];
      const hasPendingProfile = pending.some(({ kind }) => ['display-name', 'player-icon', 'home-artwork'].includes(kind));
      if (!hasPendingProfile) await this.local.replaceProfile?.(cloudUser);
      const flushed = await this._flushPendingSync();
      if (hasPendingProfile && flushed.complete && this.activeCloud?.getProfile) {
        const refreshed = await this._cloud(this.activeCloud.getProfile(), 'プロフィールの同期');
        await this.local.replaceProfile?.(refreshed);
        this.user = { id: cloudUser.id, ...refreshed, mode: 'firebase' };
      } else if (hasPendingProfile && !flushed.complete) {
        const localProfile = await this.local.getProfile();
        this.user = { ...cloudUser, ...localProfile, id: cloudUser.id };
      }
      return this.user;
    } catch (error) {
      this.lastError = error;
      this.user = localUser;
      return localUser;
    }
  }

  async getProfile() {
    const localProfile = await this.local.getProfile();
    if (!this.activeCloud?.getProfile) return localProfile;
    const flushed = await this._flushPendingSync();
    if (!flushed.complete || !this.activeCloud) return localProfile;
    try {
      const cloudProfile = await this._cloud(this.activeCloud.getProfile(), 'プロフィールの同期');
      await this.local.replaceProfile?.(cloudProfile);
      return cloudProfile;
    } catch (error) {
      this.lastError = error;
      return localProfile;
    }
  }

  async getAccountStatus() {
    if (!this.activeCloud?.getAccountStatus) return this.local.getAccountStatus();
    try { return await this._cloud(this.activeCloud.getAccountStatus(), 'アカウント情報の同期'); }
    catch (error) { this.lastError = error; return this.local.getAccountStatus(); }
  }

  async linkRecoveryAccount(credentials) {
    if (!this.activeCloud?.linkRecoveryAccount) throw new RepositoryUnavailableError('Firebaseへ接続してから復旧設定を登録してください');
    const account = await this.activeCloud.linkRecoveryAccount(credentials);
    this.user = { ...this.user, id: account.userId ?? this.user.id, isAnonymous: false };
    await this.local.replaceProfile?.(this.user);
    return account;
  }

  async signInRecoveryAccount(credentials) {
    if (!this.activeCloud?.signInRecoveryAccount) throw new RepositoryUnavailableError('Firebaseへ接続してからアカウントを復旧してください');
    const profile = await this.activeCloud.signInRecoveryAccount(credentials);
    await this.local.useAccountScope?.(profile.id, { copyCurrent: false });
    await this.local.replaceProfile?.(profile);
    this.user = profile;
    this.lastError = null;
    return profile;
  }

  async getPlayerStats() {
    const localStats = await this.local.getPlayerStats();
    if (!this.activeCloud?.getPlayerStats) return localStats;
    try {
      const flushed = await this._flushPendingSync();
      if (!flushed.complete || !this.activeCloud) return localStats;
      const cloudStats = await this._cloud(this.activeCloud.getPlayerStats(), '戦績の同期');
      await this.local.replacePlayerStats?.(cloudStats);
      return cloudStats;
    }
    catch (error) { this.lastError = error; return localStats; }
  }

  async recordPlayerStats(event) {
    const localStats = await this.local.recordPlayerStats(event);
    const synced = await this._syncMutation({
      kind: 'player-stats', payload: { event }, label: '戦績の同期', fallback: localStats,
      id: event?.operationId ? `player-stats:${event.operationId}` : null,
      call: () => this.activeCloud.recordPlayerStats(event),
    });
    if (synced.synced) {
      const cloudStats = synced.result;
      await this.local.replacePlayerStats?.(cloudStats);
      return cloudStats;
    }
    return localStats;
  }

  async setDisplayName(name) {
    const local = await this.local.setDisplayName(name);
    const synced = await this._syncMutation({
      kind: 'display-name', payload: { name }, label: '表示名の同期', fallback: local,
      coalesceKey: 'profile:display-name', call: () => this.activeCloud.setDisplayName(name),
    });
    return synced.result;
  }

  async setPlayerIcon(playerIconMasterId) {
    const local = await this.local.setPlayerIcon(playerIconMasterId);
    const synced = await this._syncMutation({
      kind: 'player-icon', payload: { playerIconMasterId }, label: 'プレイヤーアイコンの同期', fallback: local,
      coalesceKey: 'profile:player-icon', call: () => this.activeCloud.setPlayerIcon(playerIconMasterId),
    });
    if (synced.synced) {
      const cloud = synced.result;
      await this.local.replaceProfile?.(cloud);
      this.user = { ...this.user, ...cloud };
      return cloud;
    }
    return local;
  }

  async setHomeArtwork(homeArtwork) {
    const local = await this.local.setHomeArtwork(homeArtwork);
    const synced = await this._syncMutation({
      kind: 'home-artwork', payload: { homeArtwork }, label: 'ホーム画面設定の同期', fallback: local,
      coalesceKey: 'profile:home-artwork', call: () => this.activeCloud.setHomeArtwork(homeArtwork),
    });
    if (synced.synced) {
      const cloud = synced.result;
      await this.local.replaceProfile?.(cloud);
      this.user = { ...this.user, ...cloud };
      return cloud;
    }
    return local;
  }

  async getEconomy() {
    const localEconomy = await this.local.getEconomy();
    if (!this.activeCloud?.getEconomy) return localEconomy;
    try {
      const flushed = await this._flushPendingSync();
      if (!flushed.complete || !this.activeCloud) return localEconomy;
      const cloudEconomy = await this._cloud(this.activeCloud.getEconomy(), '所持データの同期');
      await this.local.replaceEconomy(cloudEconomy);
      return cloudEconomy;
    } catch (error) {
      this.lastError = error;
      return localEconomy;
    }
  }

  async commitPackPurchase(purchase) {
    const localResult = await this.local.commitPackPurchase(purchase);
    const synced = await this._syncMutation({
      kind: 'pack-purchase', payload: { purchase }, label: 'パック購入の同期', fallback: localResult,
      id: purchase?.operationId ? `pack-purchase:${purchase.operationId}` : null,
      call: () => this.activeCloud.commitPackPurchase(purchase),
    });
    if (synced.synced) {
      const cloudResult = synced.result;
      await this.local.replaceEconomy(cloudResult);
      return cloudResult;
    }
    return localResult;
  }

  async acknowledgePack(operationId) {
    const localResult = await this.local.acknowledgePack(operationId);
    const synced = await this._syncMutation({
      kind: 'pack-acknowledge', payload: { operationId }, label: 'パック確認の同期', fallback: localResult,
      id: `pack-acknowledge:${operationId}`, call: () => this.activeCloud.acknowledgePack(operationId),
    });
    if (synced.synced) {
      const cloudResult = synced.result;
      await this.local.replaceEconomy(cloudResult);
      return cloudResult;
    }
    return localResult;
  }

  async creditDiamonds(reward) {
    const localResult = await this.local.creditDiamonds(reward);
    const synced = await this._syncMutation({
      kind: 'diamond-credit', payload: { reward }, label: 'ダイヤ報酬の同期', fallback: localResult,
      id: reward?.operationId ? `diamond-credit:${reward.operationId}` : null,
      call: () => this.activeCloud.creditDiamonds(reward),
    });
    if (synced.synced) {
      const cloudResult = synced.result;
      await this.local.replaceEconomy(cloudResult);
      return cloudResult;
    }
    return localResult;
  }

  async unlockTournamentRank(rank) {
    const localResult = await this.local.unlockTournamentRank(rank);
    const synced = await this._syncMutation({
      kind: 'tournament-unlock', payload: { rank }, label: '大会解禁情報の同期', fallback: localResult,
      coalesceKey: 'economy:tournament-unlock', call: () => this.activeCloud.unlockTournamentRank(rank),
    });
    if (synced.synced) {
      const cloudResult = synced.result;
      await this.local.replaceEconomy(cloudResult);
      return cloudResult;
    }
    return localResult;
  }

  async claimLoginRewards(config = {}) {
    const localResult = await this.local.claimLoginRewards(config);
    const loginDate = String(config.loginDate ?? 'current');
    const synced = await this._syncMutation({
      kind: 'login-rewards', payload: { config }, label: 'ログイン報酬の同期', fallback: localResult,
      id: `login-rewards:${loginDate}`, call: () => this.activeCloud.claimLoginRewards(config),
    });
    if (synced.synced) {
      const cloudResult = synced.result;
      await this.local.replaceEconomy(cloudResult.state);
      return cloudResult;
    }
    return localResult;
  }

  async claimCampaignGift(config = {}) {
    const localResult = await this.local.claimCampaignGift(config);
    const synced = await this._syncMutation({
      kind: 'campaign-gift', payload: { config }, label: 'ギフト受取の同期', fallback: localResult,
      id: config?.giftId ? `campaign-gift:${config.giftId}` : null,
      call: () => this.activeCloud.claimCampaignGift(config),
    });
    if (synced.synced) {
      const cloudResult = synced.result;
      await this.local.replaceEconomy(cloudResult.state);
      return cloudResult;
    }
    return localResult;
  }

  async commitProgression(operation) {
    const localResult = await this.local.commitProgression(operation);
    const synced = await this._syncMutation({
      kind: 'progression', payload: { operation }, label: '進行状況の同期', fallback: localResult,
      id: operation?.operationId ? `progression:${operation.operationId}` : null,
      call: () => this.activeCloud.commitProgression(operation),
    });
    if (synced.synced) {
      const cloudResult = synced.result;
      await this.local.replaceEconomy(cloudResult);
      return cloudResult;
    }
    return localResult;
  }

  async listDecks() {
    const localDecks = await this.local.listDecks();
    if (!this.activeCloud) return localDecks;
    try {
      const flushed = await this._flushPendingSync();
      if (!flushed.complete || !this.activeCloud) return localDecks;
      const cloudDecks = await this._cloud(this.activeCloud.listDecks(), '保存デッキの同期');
      if (!cloudDecks.length && localDecks.length) return localDecks;
      const localById = new Map(localDecks.map((deck) => [deck.deckId, deck]));
      const cloudById = new Map(cloudDecks.map((deck) => [deck.deckId, deck]));
      const merged = [];
      for (const deckId of new Set([...localById.keys(), ...cloudById.keys()])) {
        const localDeck = localById.get(deckId);
        const cloudDeck = cloudById.get(deckId);
        const useLocal = localDeck && (!cloudDeck || updatedAtValue(localDeck) >= updatedAtValue(cloudDeck));
        const selected = useLocal ? localDeck : cloudDeck;
        if (!selected) continue;
        merged.push(selected);
        if (useLocal && JSON.stringify(localDeck) !== JSON.stringify(cloudDeck)) {
          await this._syncMutation({
            kind: 'deck-save', payload: { deck: localDeck }, label: '保存デッキの同期', fallback: localDeck,
            coalesceKey: `deck:${deckId}`, call: () => this.activeCloud.saveDeck(localDeck),
          });
        } else if (cloudDeck) await this.local.saveDeck(cloudDeck);
      }
      return merged;
    } catch (error) {
      this.lastError = error;
      return localDecks;
    }
  }

  async getActiveRun() {
    const localRun = await this.local.getActiveRun();
    if (!this.activeCloud?.getActiveRun) return localRun;
    try {
      await this.flushActiveRunSync();
      if (!this.activeCloud?.getActiveRun) return localRun;
      const cloudRun = await this._cloud(this.activeCloud.getActiveRun(), '試合データの同期');
      const latest = newerCheckpoint(localRun, cloudRun);
      if (latest === cloudRun && cloudRun) await this.local.saveActiveRun(cloudRun);
      if (latest === localRun && localRun && Number(localRun.updatedAtMs) > Number(cloudRun?.updatedAtMs ?? 0)) {
        await this._cloud(this.activeCloud.saveActiveRun(localRun), '試合データの同期');
      }
      return latest;
    } catch (error) {
      this.lastError = error;
      return localRun;
    }
  }

  async saveActiveRun(checkpoint) {
    const localResult = await this.local.saveActiveRun(checkpoint);
    if (!this.activeCloud?.saveActiveRun) return localResult;
    this._scheduleActiveRunSync(localResult);
    return localResult;
  }

  async clearActiveRun(tombstone) {
    const localResult = await this.local.clearActiveRun(tombstone);
    if (!this.activeCloud?.clearActiveRun) return localResult;
    if (!this.activeCloud?.saveActiveRun) {
      try { return await this._cloud(this.activeCloud.clearActiveRun(localResult), '試合データの同期'); }
      catch (error) { this.lastError = error; return localResult; }
    }
    try {
      this.pendingActiveRun = newerCheckpoint(this.pendingActiveRun, localResult);
      await this.flushActiveRunSync();
      return localResult;
    }
    catch (error) { this.lastError = error; return localResult; }
  }

  async getCardCatalog() {
    const localCatalog = await this.local.getCardCatalog();
    if (!this.activeCloud) return localCatalog;
    try {
      const flushed = await this._flushPendingSync();
      if (!flushed.complete || !this.activeCloud) return localCatalog;
      const cloudCatalog = await this._cloud(this.activeCloud.getCardCatalog(), 'カード図鑑の同期');
      const merged = mergeCardCatalogs(localCatalog, cloudCatalog);
      await this.local.recordCardCatalog(merged);
      if (JSON.stringify(merged.ownedCardMasterIds) !== JSON.stringify(cloudCatalog.ownedCardMasterIds)
        || JSON.stringify(merged.discoveredFusionIds) !== JSON.stringify(cloudCatalog.discoveredFusionIds)) {
        return await this._cloud(this.activeCloud.recordCardCatalog(merged), 'カード図鑑の同期');
      }
      return merged;
    } catch (error) {
      this.lastError = error;
      return localCatalog;
    }
  }

  async recordCardCatalog(update = {}) {
    const localCatalog = await this.local.recordCardCatalog(update);
    const synced = await this._syncMutation({
      kind: 'catalog', payload: { update }, label: 'カード図鑑の同期', fallback: localCatalog,
      call: () => this.activeCloud.recordCardCatalog(update),
    });
    if (synced.synced) {
      const cloudCatalog = synced.result;
      const merged = mergeCardCatalogs(localCatalog, cloudCatalog);
      await this.local.recordCardCatalog(merged);
      return merged;
    }
    return localCatalog;
  }

  async saveDeck(deck) {
    const localResult = await this.local.saveDeck(deck);
    const synced = await this._syncMutation({
      kind: 'deck-save', payload: { deck: localResult }, label: '保存デッキの同期', fallback: localResult,
      coalesceKey: `deck:${deck.deckId}`, call: () => this.activeCloud.saveDeck(localResult),
    });
    return synced.result;
  }

  async saveDeckAndEconomy(deck, economy) {
    const localResult = await this.local.saveDeckAndEconomy(deck, economy);
    const synced = await this._syncMutation({
      kind: 'deck-economy', payload: { deck: localResult.deck, economy: localResult.economy },
      label: 'デッキと所持データの同期', fallback: localResult,
      coalesceKey: `deck:${deck.deckId}`, call: () => this.activeCloud.saveDeckAndEconomy(localResult.deck, localResult.economy),
    });
    if (synced.synced) {
      const cloudResult = synced.result;
      await this.local.replaceEconomy(cloudResult.economy);
      return cloudResult;
    }
    return localResult;
  }

  async deleteDeck(deckId) {
    if (!this.activeCloud) return this.local.deleteDeck(deckId);
    try {
      await this._cloud(this.activeCloud.deleteDeck(deckId), '保存デッキ削除の同期');
      await this.local.deleteDeck(deckId);
    }
    catch (error) { this.lastError = error; throw new RepositoryUnavailableError('クラウド側でデッキを削除できませんでした', error); }
  }

  async listLegendDecks(maxResults = 60) {
    if (!this.activeCloud?.listLegendDecks) return [];
    try { return await this._cloud(this.activeCloud.listLegendDecks(maxResults), '対戦デッキの同期'); }
    catch (error) { this.lastError = error; return []; }
  }

  async publishArenaDeck(deck, arena) {
    if (!this.activeCloud?.publishArenaDeck) return this.local.publishArenaDeck(deck, arena);
    try { return await this._cloud(this.activeCloud.publishArenaDeck(deck, arena), 'アリーナデッキの同期'); }
    catch (error) { this.lastError = error; return this.local.publishArenaDeck(deck, arena); }
  }

  async listArenaDecks(maxResults = 60) {
    if (!this.activeCloud?.listArenaDecks) return [];
    try { return await this._cloud(this.activeCloud.listArenaDecks(maxResults), 'アリーナ候補の同期'); }
    catch (error) { this.lastError = error; return []; }
  }

  async publishArenaRanking(arena, deck) {
    if (!this.activeCloud?.publishArenaRanking) return this.local.publishArenaRanking(arena, deck);
    try { return await this._cloud(this.activeCloud.publishArenaRanking(arena, deck), 'アリーナランキングの同期'); }
    catch (error) { this.lastError = error; return this.local.publishArenaRanking(arena, deck); }
  }

  async getArenaLeaderboard(options = {}) {
    if (!this.activeCloud?.getArenaLeaderboard) return this.local.getArenaLeaderboard(options);
    try { return await this._cloud(this.activeCloud.getArenaLeaderboard(options), 'アリーナランキングの取得'); }
    catch (error) { this.lastError = error; return this.local.getArenaLeaderboard(options); }
  }

  async listLegendArchives(maxResults = 20) {
    if (!this.activeCloud?.listLegendArchives) return this.local.listLegendArchives(maxResults);
    try {
      const records = await this._cloud(this.activeCloud.listLegendArchives(maxResults), '歴代王者の同期');
      return records.length ? records : this.local.listLegendArchives(maxResults);
    } catch (error) { this.lastError = error; return this.local.listLegendArchives(maxResults); }
  }

  async getChampion() {
    if (!this.activeCloud) return this.local.getChampion();
    try { return await this._cloud(this.activeCloud.getChampion(), '王座データの同期'); }
    catch (error) { this.lastError = error; return this.local.getChampion(); }
  }

  subscribeChampion(callback) {
    if (!this.activeCloud) return this.local.subscribeChampion(callback);
    return this.activeCloud.subscribeChampion(callback, async (error) => {
      this.lastError = error;
      callback(await this.local.getChampion());
    });
  }

  async claimChampionship(payload) {
    if (!this.activeCloud) return this.local.claimChampionship(payload);
    try {
      const result = await this._cloud(this.activeCloud.claimChampionship(payload), '王座データの更新');
      await this.local.cacheChampion(result);
      return result;
    } catch (error) {
      this.lastError = error;
      if (error?.code === 'champion/version-conflict') throw error;
      throw new RepositoryUnavailableError('王座を安全に更新できません。通信回復後に再挑戦してください。', error);
    }
  }

  async recordDefense(expectedVersion) {
    if (!this.activeCloud) return this.local.recordDefense(expectedVersion);
    return this._cloud(this.activeCloud.recordDefense(expectedVersion), '防衛記録の同期');
  }

  getStatus() {
    return {
      mode: this.activeCloud ? 'firebase' : 'local',
      connected: Boolean(this.activeCloud),
      userId: this.user?.id ?? null,
      error: this.lastError?.message ?? null,
    };
  }
}

import { ChampionConflictError } from './errors.js';
import { MemoryStorage } from './memory-storage.js';
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

const USER_KEY = 'mc:v1:user';
const CHAMPION_KEY = 'mc:v1:champion';

function clone(value) { return value == null ? value : structuredClone(value); }
function parse(value, fallback) {
  if (!value) return fallback;
  try { return JSON.parse(value); } catch { return fallback; }
}

export class LocalGameRepository {
  constructor({ storage = globalThis.localStorage ?? new MemoryStorage(), now = () => new Date().toISOString(), idFactory = null } = {}) {
    this.storage = storage;
    this.now = now;
    this.idFactory = idFactory ?? (() => globalThis.crypto?.randomUUID?.() ?? `local-${Date.now().toString(36)}`);
    this.user = null;
    this.listeners = new Set();
    this.storageHandler = (event) => { if (event.key === CHAMPION_KEY) this._notifyChampion(); };
  }

  async initialize() {
    this.user = parse(this.storage.getItem(USER_KEY), null);
    if (!this.user?.id) {
      this.user = { id: `local-${this.idFactory()}`, displayName: '名無しブリーダー', isAnonymous: true, mode: 'local' };
      this.storage.setItem(USER_KEY, JSON.stringify(this.user));
    }
    this._scopeId = this.user.activeScopeId ?? this.user.id;
    if (!this.storage.getItem(this._profileKey())) {
      this.storage.setItem(this._profileKey(), JSON.stringify({
        id: this._scopeId,
        displayName: this.user.displayName ?? '名無しブリーダー',
        playerIconMasterId: normalizePlayerIconMasterId(this.user.playerIconMasterId),
        homeArtwork: normalizeHomeArtworkSelection(this.user.homeArtwork),
        isAnonymous: this.user.isAnonymous ?? true,
        mode: 'local',
      }));
    }
    globalThis.addEventListener?.('storage', this.storageHandler);
    return this.getProfile();
  }

  _requireUser() { if (!this.user) throw new Error('Repository is not initialized'); }
  _scope() { this._requireUser(); return this._scopeId ?? this.user.id; }
  _decksKey(scope = this._scope()) { return `mc:v1:decks:${scope}`; }
  _profileKey(scope = this._scope()) { return `mc:v1:profile:${scope}`; }
  _catalogKey(scope = this._scope()) { return `mc:v1:catalog:${scope}`; }
  _activeRunKey(scope = this._scope()) { return `mc:v1:active-run:${scope}`; }
  _economyKey(scope = this._scope()) { return `mc:v1:economy:${scope}`; }
  _statsKey(scope = this._scope()) { return `mc:v1:stats:${scope}`; }

  async useAccountScope(userId, { copyCurrent = false } = {}) {
    this._requireUser();
    const next = String(userId ?? '').trim();
    if (!next) throw new Error('ローカル保存のアカウントIDが不正です');
    const current = this._scope();
    if (copyCurrent && current !== next) {
      const keyPairs = [
        [this._profileKey(current), this._profileKey(next)],
        [this._decksKey(current), this._decksKey(next)],
        [this._catalogKey(current), this._catalogKey(next)],
        [this._activeRunKey(current), this._activeRunKey(next)],
        [this._economyKey(current), this._economyKey(next)],
        [this._statsKey(current), this._statsKey(next)],
      ];
      for (const [source, destination] of keyPairs) {
        const value = this.storage.getItem(source);
        if (value != null && this.storage.getItem(destination) == null) this.storage.setItem(destination, value);
      }
    }
    this._scopeId = next;
    this.user.activeScopeId = next;
    this.storage.setItem(USER_KEY, JSON.stringify(this.user));
    return next;
  }

  async getProfile() {
    this._requireUser();
    const profile = parse(this.storage.getItem(this._profileKey()), {
      id: this._scope(), displayName: '名無しブリーダー', isAnonymous: true, mode: 'local',
    });
    return clone({ ...profile, activeScopeId: this.user.activeScopeId ?? null });
  }

  async replaceProfile(profile = {}) {
    const normalized = {
      id: this._scope(),
      displayName: String(profile.displayName ?? '名無しブリーダー').trim().slice(0, 24) || '名無しブリーダー',
      playerIconMasterId: normalizePlayerIconMasterId(profile.playerIconMasterId),
      homeArtwork: normalizeHomeArtworkSelection(profile.homeArtwork),
      isAnonymous: Boolean(profile.isAnonymous),
      mode: 'local',
    };
    this.user.displayName = normalized.displayName;
    this.user.playerIconMasterId = normalized.playerIconMasterId;
    this.user.homeArtwork = normalized.homeArtwork;
    this.storage.setItem(USER_KEY, JSON.stringify(this.user));
    this.storage.setItem(this._profileKey(), JSON.stringify(normalized));
    return clone(normalized);
  }

  async setDisplayName(displayName) {
    this._requireUser();
    const value = String(displayName ?? '').trim();
    if (!value || [...value].length > 24) throw new Error('表示名は1〜24文字です');
    this.user.displayName = value;
    this.storage.setItem(USER_KEY, JSON.stringify(this.user));
    return this.replaceProfile({ ...(await this.getProfile()), displayName: value });
  }

  async setPlayerIcon(playerIconMasterId) {
    this._requireUser();
    const value = normalizePlayerIconMasterId(playerIconMasterId);
    if (playerIconMasterId != null && !value) throw new Error('プレイヤーアイコンが不正です');
    return this.replaceProfile({ ...(await this.getProfile()), playerIconMasterId: value });
  }

  async setHomeArtwork(homeArtwork) {
    this._requireUser();
    const value = normalizeHomeArtworkSelection(homeArtwork);
    if (homeArtwork != null && !value) throw new Error('ホーム画面イラストの設定が不正です');
    return this.replaceProfile({ ...(await this.getProfile()), homeArtwork: value });
  }

  async getAccountStatus() {
    return { mode: 'local', available: false, recoveryEnabled: false, isAnonymous: true, playerId: null };
  }

  async getPlayerStats() {
    return clone(normalizePlayerStats(parse(this.storage.getItem(this._statsKey()), {})));
  }

  async replacePlayerStats(stats) {
    const normalized = normalizePlayerStats(stats);
    this.storage.setItem(this._statsKey(), JSON.stringify(normalized));
    return clone(normalized);
  }

  async recordPlayerStats(event) {
    const next = applyPlayerStatsEvent(await this.getPlayerStats(), event, this.now());
    return this.replacePlayerStats(next);
  }

  async listDecks() { return clone(parse(this.storage.getItem(this._decksKey()), [])); }

  async getEconomy() {
    const stored = parse(this.storage.getItem(this._economyKey()), null);
    const economy = normalizeEconomyState(stored, this.now());
    if (!stored) this.storage.setItem(this._economyKey(), JSON.stringify(economy));
    return clone(economy);
  }

  async replaceEconomy(economy) {
    const normalized = normalizeEconomyState(economy, this.now());
    this.storage.setItem(this._economyKey(), JSON.stringify(normalized));
    return clone(normalized);
  }

  async commitPackPurchase(purchase) {
    const next = applyPackPurchase(await this.getEconomy(), purchase, this.now());
    return this.replaceEconomy(next);
  }

  async acknowledgePack(operationId) {
    const next = acknowledgePendingPack(await this.getEconomy(), operationId, this.now());
    return this.replaceEconomy(next);
  }

  async creditDiamonds(reward) {
    const next = applyDiamondReward(await this.getEconomy(), reward, this.now());
    return this.replaceEconomy(next);
  }

  async unlockTournamentRank(rank) {
    const next = applyTournamentUnlock(await this.getEconomy(), rank, this.now());
    return this.replaceEconomy(next);
  }

  async claimLoginRewards(config = {}) {
    const result = applyLoginRewards(await this.getEconomy(), config, this.now());
    await this.replaceEconomy(result.state);
    return clone(result);
  }

  async claimCampaignGift(config = {}) {
    const result = applyCampaignGiftClaim(await this.getEconomy(), config, this.now());
    await this.replaceEconomy(result.state);
    return clone(result);
  }

  async commitProgression(operation) {
    const next = applyProgressionOperation(await this.getEconomy(), operation, this.now());
    return this.replaceEconomy(next);
  }

  async getActiveRun() {
    return clone(parse(this.storage.getItem(this._activeRunKey()), null));
  }

  async saveActiveRun(checkpoint) {
    if (!checkpoint?.runId || !Number.isFinite(Number(checkpoint.updatedAtMs))) throw new Error('大会の再開データが不正です');
    const current = await this.getActiveRun();
    if (current && Number(current.updatedAtMs) > Number(checkpoint.updatedAtMs)) return current;
    this.storage.setItem(this._activeRunKey(), JSON.stringify(clone(checkpoint)));
    return clone(checkpoint);
  }

  async clearActiveRun(tombstone) {
    return this.saveActiveRun({ ...clone(tombstone), phase: 'cleared' });
  }

  async getCardCatalog() {
    return clone(normalizeCardCatalog(parse(this.storage.getItem(this._catalogKey()), {})));
  }

  async recordCardCatalog(update = {}) {
    const current = await this.getCardCatalog();
    const next = mergeCardCatalogs(current, update);
    const changed = next.ownedCardMasterIds.length !== current.ownedCardMasterIds.length
      || next.discoveredFusionIds.length !== current.discoveredFusionIds.length;
    if (changed) next.updatedAt = this.now();
    this.storage.setItem(this._catalogKey(), JSON.stringify(next));
    return clone(next);
  }

  async saveDeck(deck) {
    const decks = await this.listDecks();
    const index = decks.findIndex((entry) => entry.deckId === deck.deckId);
    if (index < 0 && decks.length >= 5) throw new Error('保存デッキは最大5個です');
    if (index >= 0) decks[index] = clone(deck);
    else decks.push(clone(deck));
    this.storage.setItem(this._decksKey(), JSON.stringify(decks));
    await this.recordCardCatalog({ ownedCardMasterIds: deck.cards.map((card) => card.masterId) });
    return clone(deck);
  }

  async saveDeckAndEconomy(deck, economy) {
    await this.saveDeck(deck);
    await this.replaceEconomy(economy);
    return { deck: clone(deck), economy: await this.getEconomy() };
  }

  async deleteDeck(deckId) {
    const decks = await this.listDecks();
    const next = decks.filter((deck) => deck.deckId !== deckId);
    this.storage.setItem(this._decksKey(), JSON.stringify(next));
  }

  async publishArenaDeck() { return null; }

  async listArenaDecks() { return []; }

  async listLegendArchives(maxResults = 20) {
    const champion = await this.getChampion();
    return champion ? [champion].slice(0, Math.max(1, Number(maxResults) || 20)) : [];
  }

  async listLegendDecks() { return []; }

  async getChampion() { return clone(parse(this.storage.getItem(CHAMPION_KEY), null)); }

  async cacheChampion(champion) {
    if (champion == null) this.storage.removeItem(CHAMPION_KEY);
    else this.storage.setItem(CHAMPION_KEY, JSON.stringify({ ...clone(champion), repositoryMode: 'firebase-cache' }));
    await this._notifyChampion();
    return clone(champion);
  }

  subscribeChampion(callback) {
    this.listeners.add(callback);
    Promise.resolve(this.getChampion()).then(callback);
    return () => this.listeners.delete(callback);
  }

  async _notifyChampion() {
    const champion = await this.getChampion();
    for (const callback of this.listeners) callback(clone(champion));
  }

  async claimChampionship(payload) {
    this._requireUser();
    const current = await this.getChampion();
    const actualVersion = current?.championVersion ?? 0;
    if (actualVersion !== payload.expectedVersion) {
      throw new ChampionConflictError({ expectedVersion: payload.expectedVersion, actualVersion });
    }
    const champion = {
      championUserId: this.user.id,
      championDisplayName: payload.championDisplayName,
      championDeckId: payload.championDeckId,
      championDeckName: payload.championDeckName,
      championDeckSnapshot: clone(payload.championDeckSnapshot),
      championGrowthSnapshot: clone(payload.championGrowthSnapshot ?? {}),
      championSnapshotVersion: payload.championSnapshotVersion ?? 2,
      representativeMonsterId: payload.representativeMonsterId ?? null,
      crownedAt: this.now(),
      defenseCount: 0,
      championVersion: actualVersion + 1,
      repositoryMode: 'local',
    };
    this.storage.setItem(CHAMPION_KEY, JSON.stringify(champion));
    await this._notifyChampion();
    return clone(champion);
  }

  async recordDefense(expectedVersion) {
    const current = await this.getChampion();
    const actualVersion = current?.championVersion ?? 0;
    if (!current || current.championUserId !== this.user.id || actualVersion !== expectedVersion) {
      throw new ChampionConflictError({ expectedVersion, actualVersion });
    }
    current.defenseCount = (current.defenseCount ?? 0) + 1;
    current.championVersion += 1;
    this.storage.setItem(CHAMPION_KEY, JSON.stringify(current));
    await this._notifyChampion();
    return clone(current);
  }

  getStatus() { return { mode: 'local', connected: false, userId: this.user?.id ?? null, error: null }; }
}

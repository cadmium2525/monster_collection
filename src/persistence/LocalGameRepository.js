import { ChampionConflictError } from './errors.js';
import { MemoryStorage } from './memory-storage.js';
import { mergeCardCatalogs, normalizeCardCatalog } from './card-catalog.js';

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
    globalThis.addEventListener?.('storage', this.storageHandler);
    return clone(this.user);
  }

  _requireUser() { if (!this.user) throw new Error('Repository is not initialized'); }
  _decksKey() { this._requireUser(); return `mc:v1:decks:${this.user.id}`; }
  _catalogKey() { this._requireUser(); return `mc:v1:catalog:${this.user.id}`; }

  async getProfile() { this._requireUser(); return clone(this.user); }

  async setDisplayName(displayName) {
    this._requireUser();
    const value = String(displayName ?? '').trim();
    if (!value || [...value].length > 24) throw new Error('表示名は1〜24文字です');
    this.user.displayName = value;
    this.storage.setItem(USER_KEY, JSON.stringify(this.user));
    return clone(this.user);
  }

  async listDecks() { return clone(parse(this.storage.getItem(this._decksKey()), [])); }

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

  async deleteDeck(deckId) {
    const decks = await this.listDecks();
    const next = decks.filter((deck) => deck.deckId !== deckId);
    this.storage.setItem(this._decksKey(), JSON.stringify(next));
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

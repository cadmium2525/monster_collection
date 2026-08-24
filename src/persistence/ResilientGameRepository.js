import { RepositoryUnavailableError } from './errors.js';

export class ResilientGameRepository {
  constructor({ local, cloud = null }) {
    this.local = local;
    this.cloud = cloud;
    this.activeCloud = null;
    this.user = null;
    this.lastError = null;
  }

  async initialize() {
    const localUser = await this.local.initialize();
    if (!this.cloud) {
      this.user = localUser;
      return this.user;
    }
    try {
      const cloudUser = await this.cloud.initialize();
      this.activeCloud = this.cloud;
      this.user = cloudUser;
      return cloudUser;
    } catch (error) {
      this.lastError = error;
      this.user = localUser;
      return localUser;
    }
  }

  async getProfile() { return this.activeCloud ? this.activeCloud.getProfile() : this.local.getProfile(); }

  async setDisplayName(name) {
    const local = await this.local.setDisplayName(name);
    if (!this.activeCloud) return local;
    try { return await this.activeCloud.setDisplayName(name); }
    catch (error) { this.lastError = error; return local; }
  }

  async listDecks() {
    const localDecks = await this.local.listDecks();
    if (!this.activeCloud) return localDecks;
    try {
      const cloudDecks = await this.activeCloud.listDecks();
      if (!cloudDecks.length && localDecks.length) return localDecks;
      for (const deck of cloudDecks) await this.local.saveDeck(deck);
      return cloudDecks;
    } catch (error) {
      this.lastError = error;
      return localDecks;
    }
  }

  async saveDeck(deck) {
    const localResult = await this.local.saveDeck(deck);
    if (!this.activeCloud) return localResult;
    try { return await this.activeCloud.saveDeck(deck); }
    catch (error) { this.lastError = error; return localResult; }
  }

  async deleteDeck(deckId) {
    if (!this.activeCloud) return this.local.deleteDeck(deckId);
    try {
      await this.activeCloud.deleteDeck(deckId);
      await this.local.deleteDeck(deckId);
    }
    catch (error) { this.lastError = error; throw new RepositoryUnavailableError('クラウド側でデッキを削除できませんでした', error); }
  }

  async getChampion() {
    if (!this.activeCloud) return this.local.getChampion();
    try { return await this.activeCloud.getChampion(); }
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
      const result = await this.activeCloud.claimChampionship(payload);
      await this.local.cacheChampion(result);
      return result;
    } catch (error) {
      this.lastError = error;
      if (error?.code === 'champion/version-conflict') throw error;
      throw new RepositoryUnavailableError('王座を安全に更新できません。通信回復後に再挑戦してください。', error);
    }
  }

  async recordDefense(expectedVersion) {
    return this.activeCloud ? this.activeCloud.recordDefense(expectedVersion) : this.local.recordDefense(expectedVersion);
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

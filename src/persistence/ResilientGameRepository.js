import { RepositoryUnavailableError } from './errors.js';
import { mergeCardCatalogs } from './card-catalog.js';

function newerCheckpoint(left, right) {
  if (!left) return right;
  if (!right) return left;
  return Number(right.updatedAtMs) > Number(left.updatedAtMs) ? right : left;
}

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
      await this.local.useAccountScope?.(cloudUser.id, { copyCurrent: !localUser.activeScopeId });
      await this.local.replaceProfile?.(cloudUser);
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

  async getAccountStatus() {
    return this.activeCloud?.getAccountStatus ? this.activeCloud.getAccountStatus() : this.local.getAccountStatus();
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
      const cloudStats = await this.activeCloud.getPlayerStats();
      await this.local.replacePlayerStats?.(cloudStats);
      return cloudStats;
    }
    catch (error) { this.lastError = error; return localStats; }
  }

  async recordPlayerStats(event) {
    const localStats = await this.local.recordPlayerStats(event);
    if (!this.activeCloud?.recordPlayerStats) return localStats;
    try {
      const cloudStats = await this.activeCloud.recordPlayerStats(event);
      await this.local.replacePlayerStats?.(cloudStats);
      return cloudStats;
    }
    catch (error) { this.lastError = error; return localStats; }
  }

  async setDisplayName(name) {
    const local = await this.local.setDisplayName(name);
    if (!this.activeCloud) return local;
    try { return await this.activeCloud.setDisplayName(name); }
    catch (error) { this.lastError = error; return local; }
  }

  async getEconomy() {
    const localEconomy = await this.local.getEconomy();
    if (!this.activeCloud?.getEconomy) return localEconomy;
    try {
      const cloudEconomy = await this.activeCloud.getEconomy();
      await this.local.replaceEconomy(cloudEconomy);
      return cloudEconomy;
    } catch (error) {
      this.lastError = error;
      return localEconomy;
    }
  }

  async commitPackPurchase(purchase) {
    const localResult = await this.local.commitPackPurchase(purchase);
    if (!this.activeCloud?.commitPackPurchase) return localResult;
    try {
      const cloudResult = await this.activeCloud.commitPackPurchase(purchase);
      await this.local.replaceEconomy(cloudResult);
      return cloudResult;
    } catch (error) {
      this.lastError = error;
      return localResult;
    }
  }

  async acknowledgePack(operationId) {
    const localResult = await this.local.acknowledgePack(operationId);
    if (!this.activeCloud?.acknowledgePack) return localResult;
    try {
      const cloudResult = await this.activeCloud.acknowledgePack(operationId);
      await this.local.replaceEconomy(cloudResult);
      return cloudResult;
    } catch (error) {
      this.lastError = error;
      return localResult;
    }
  }

  async creditDiamonds(reward) {
    const localResult = await this.local.creditDiamonds(reward);
    if (!this.activeCloud?.creditDiamonds) return localResult;
    try {
      const cloudResult = await this.activeCloud.creditDiamonds(reward);
      await this.local.replaceEconomy(cloudResult);
      return cloudResult;
    } catch (error) {
      this.lastError = error;
      return localResult;
    }
  }

  async unlockTournamentRank(rank) {
    const localResult = await this.local.unlockTournamentRank(rank);
    if (!this.activeCloud?.unlockTournamentRank) return localResult;
    try {
      const cloudResult = await this.activeCloud.unlockTournamentRank(rank);
      await this.local.replaceEconomy(cloudResult);
      return cloudResult;
    } catch (error) {
      this.lastError = error;
      return localResult;
    }
  }

  async claimLoginRewards(config = {}) {
    const localResult = await this.local.claimLoginRewards(config);
    if (!this.activeCloud?.claimLoginRewards) return localResult;
    try {
      const cloudResult = await this.activeCloud.claimLoginRewards(config);
      await this.local.replaceEconomy(cloudResult.state);
      return cloudResult;
    } catch (error) {
      this.lastError = error;
      return localResult;
    }
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

  async getActiveRun() {
    const localRun = await this.local.getActiveRun();
    if (!this.activeCloud?.getActiveRun) return localRun;
    try {
      const cloudRun = await this.activeCloud.getActiveRun();
      const latest = newerCheckpoint(localRun, cloudRun);
      if (latest === cloudRun && cloudRun) await this.local.saveActiveRun(cloudRun);
      if (latest === localRun && localRun && Number(localRun.updatedAtMs) > Number(cloudRun?.updatedAtMs ?? 0)) {
        await this.activeCloud.saveActiveRun(localRun);
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
    try { return await this.activeCloud.saveActiveRun(localResult); }
    catch (error) { this.lastError = error; return localResult; }
  }

  async clearActiveRun(tombstone) {
    const localResult = await this.local.clearActiveRun(tombstone);
    if (!this.activeCloud?.clearActiveRun) return localResult;
    try { return await this.activeCloud.clearActiveRun(localResult); }
    catch (error) { this.lastError = error; return localResult; }
  }

  async getCardCatalog() {
    const localCatalog = await this.local.getCardCatalog();
    if (!this.activeCloud) return localCatalog;
    try {
      const cloudCatalog = await this.activeCloud.getCardCatalog();
      const merged = mergeCardCatalogs(localCatalog, cloudCatalog);
      await this.local.recordCardCatalog(merged);
      if (JSON.stringify(merged.ownedCardMasterIds) !== JSON.stringify(cloudCatalog.ownedCardMasterIds)
        || JSON.stringify(merged.discoveredFusionIds) !== JSON.stringify(cloudCatalog.discoveredFusionIds)) {
        return await this.activeCloud.recordCardCatalog(merged);
      }
      return merged;
    } catch (error) {
      this.lastError = error;
      return localCatalog;
    }
  }

  async recordCardCatalog(update = {}) {
    const localCatalog = await this.local.recordCardCatalog(update);
    if (!this.activeCloud) return localCatalog;
    try {
      const cloudCatalog = await this.activeCloud.recordCardCatalog(update);
      const merged = mergeCardCatalogs(localCatalog, cloudCatalog);
      await this.local.recordCardCatalog(merged);
      return merged;
    } catch (error) {
      this.lastError = error;
      return localCatalog;
    }
  }

  async saveDeck(deck) {
    const localResult = await this.local.saveDeck(deck);
    if (!this.activeCloud) return localResult;
    try { return await this.activeCloud.saveDeck(deck); }
    catch (error) { this.lastError = error; return localResult; }
  }

  async saveDeckAndEconomy(deck, economy) {
    const localResult = await this.local.saveDeckAndEconomy(deck, economy);
    if (!this.activeCloud?.saveDeckAndEconomy) return localResult;
    try {
      const cloudResult = await this.activeCloud.saveDeckAndEconomy(deck, economy);
      await this.local.replaceEconomy(cloudResult.economy);
      return cloudResult;
    } catch (error) {
      this.lastError = error;
      return localResult;
    }
  }

  async deleteDeck(deckId) {
    if (!this.activeCloud) return this.local.deleteDeck(deckId);
    try {
      await this.activeCloud.deleteDeck(deckId);
      await this.local.deleteDeck(deckId);
    }
    catch (error) { this.lastError = error; throw new RepositoryUnavailableError('クラウド側でデッキを削除できませんでした', error); }
  }

  async listLegendDecks(maxResults = 60) {
    if (!this.activeCloud?.listLegendDecks) return [];
    try { return await this.activeCloud.listLegendDecks(maxResults); }
    catch (error) { this.lastError = error; return []; }
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

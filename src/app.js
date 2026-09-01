import { createAiPolicy } from './ai/index.js';
import { createBaselineDeck, createFactionStarterDeck, STARTER_DECK_OPTIONS } from './data/default-decks.js';
import { createMasterIndex, loadMasterData } from './data/master-loader.js';
import { DeckCollection } from './decks/DeckCollection.js';
import { GameSession } from './game/GameSession.js';
import { createGameRepository } from './persistence/index.js';
import { registerServiceWorker } from './pwa/register-service-worker.js';
import { TournamentSeedSource } from './core/tournament-seed.js';
import { BattleScreen } from './ui/battle-screen.js';
import { CardCatalogScreen } from './ui/catalog-screen.js';
import { DeckBuildScreen, DeckDetailScreen, DeckListScreen, openStarterDeckPicker } from './ui/deck-screens.js';
import { activeRunDeckId, isDeckLockedByActiveRun } from './tournament/active-run.js';
import { el, replace } from './ui/dom.js';
import { HomeScreen } from './ui/home-screen.js';
import { openModal } from './ui/modal.js';
import { RewardScreen } from './ui/reward-screen.js';
import { TournamentScreen } from './ui/tournament-screen.js';
import { TournamentSetupScreen } from './ui/tournament-setup-screen.js';
import { AssetCollectionScreen, BoosterShopScreen, PackOpeningScreen } from './ui/booster-screen.js';
import { AdminToolScreen } from './ui/admin-screen.js';
import { generateBoosterPack } from './gacha/pack-generator.js';
import { japanDateKey } from './gacha/economy-state.js';
import { diamondIcon } from './ui/currency-icon.js';
import { ProfileScreen, catalogProgress } from './ui/profile-screen.js';
import { accountErrorMessage } from './persistence/auth-errors.js';
import { PLAYER_ID_RULE_COPY, normalizePlayerId } from './persistence/player-id.js';

const AI_BUDGET = Object.freeze({ bronze: 4, silver: 8, gold: 22, legend: 85, champion: 240 });

class MonsterConstructionApp {
  constructor(root) {
    this.root = root;
    const params = new URLSearchParams(location.search);
    this.seedSource = new TournamentSeedSource({ fixedSeed: params.has('seed') ? params.get('seed') : null });
    this.seed = this.seedSource.sessionSeed;
    this.currentScreen = 'boot';
    this.session = null;
    this.activeRun = null;
    this.installPromptEvent = null;
    globalThis.__MC_DEBUG_MODE__ = params.get('debug') === '1' && ['localhost', '127.0.0.1', '::1'].includes(location.hostname);
    globalThis.__MC_ADMIN_MODE__ = params.get('admin') === '1';
    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      this.installPromptEvent = event;
      if (this.currentScreen === 'home') this.showHome();
    });
    window.addEventListener('appinstalled', () => {
      this.installPromptEvent = null;
      if (this.currentScreen === 'home') this.showHome();
    });
  }

  async initialize() {
    this.masterData = await loadMasterData();
    this.masterIndex = createMasterIndex(this.masterData);
    this.repository = createGameRepository();
    this.user = await this.repository.initialize();
    this.economy = await this.repository.getEconomy();
    const loginResult = this.repository.claimLoginRewards
      ? await this.repository.claimLoginRewards({ loginDate: japanDateKey() })
      : { state: this.economy, rewards: [] };
    this.economy = loginResult.state;
    this.loginRewards = loginResult.rewards;
    const records = await this.repository.listDecks();
    this.decks = new DeckCollection({
      masterIndex: this.masterIndex,
      records,
      playerQualification: this.economy.tournamentQualification,
      idFactory: () => `deck-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}`,
    });
    if (this.decks.getPlayerQualification() !== this.economy.tournamentQualification && this.repository.unlockTournamentRank) {
      this.economy = await this.repository.unlockTournamentRank(this.decks.getPlayerQualification());
    }
    const assetRepairs = this.decks.assetRepairReport();
    if (assetRepairs.length) {
      const results = await Promise.allSettled(assetRepairs.map(({ deckId }) => this.repository.saveDeck(this.decks.get(deckId))));
      results.forEach((result, index) => {
        if (result.status === 'rejected') console.warn(`Duplicate deck asset repair could not be persisted: ${assetRepairs[index].deckId}`, result.reason);
      });
    }
    if (!this.decks.list().length) {
      const starter = this.decks.create({ deckName: 'はじまりの40枚', cards: createBaselineDeck(this.masterData, `starter-${this.seed}`) });
      await this.repository.saveDeck(starter);
    }
    this.catalog = await this.repository.recordCardCatalog({
      ownedCardMasterIds: this.decks.list().flatMap((deck) => deck.cards.map((card) => card.masterId)),
    });
    const flushCheckpoint = () => { void this.session?.flushCheckpoint?.(); };
    window.addEventListener('pagehide', flushCheckpoint);
    document.addEventListener('visibilitychange', () => {
      if (document.visibilityState === 'hidden') flushCheckpoint();
    });
    this.champion = await this.repository.getChampion();
    const activeRun = await this.repository.getActiveRun?.();
    this.activeRun = ['tournament', 'battle', 'reward'].includes(activeRun?.phase) ? activeRun : null;
    this.unsubscribeChampion = this.repository.subscribeChampion((champion) => {
      this.champion = champion;
      if (this.currentScreen === 'home') this.showHome();
    });
    this.showHome();
    if (this.loginRewards.length) this.showLoginBonus(this.loginRewards);
    globalThis.__MC_DEBUG__ = { app: this, masterData: this.masterData, masterIndex: this.masterIndex, repository: this.repository };
  }

  showLoginBonus(rewards) {
    const total = rewards.reduce((sum, reward) => sum + reward.amount, 0);
    let modal = null;
    const content = el('div', { className: 'login-bonus-panel' }, [
      el('div', { className: 'login-bonus-diamond', attrs: { 'aria-hidden': 'true' } }, diamondIcon('login-bonus-diamond-art')),
      el('p', { text: rewards.some((reward) => reward.type === 'campaign')
        ? 'いつものログインボーナスに加えて、期間プレゼントをお届けします。'
        : '今日のログインプレゼントをお届けします。' }),
      el('div', { className: 'login-bonus-rewards' }, rewards.map((reward) => el('article', { className: `login-reward login-reward-${reward.type}` }, [
        el('span', {}, diamondIcon('login-reward-diamond')),
        el('div', {}, [el('strong', { text: reward.label }), el('small', { text: reward.type === 'daily' ? '毎日1回' : '初回ログイン限定' })]),
        el('b', { text: `+${reward.amount.toLocaleString('ja-JP')}` }),
      ]))),
      el('div', { className: 'login-bonus-total' }, [
        el('span', { text: '今回のプレゼント' }),
        el('strong', { text: `ダイヤ ${total.toLocaleString('ja-JP')}` }),
        el('small', { text: `所持ダイヤ ${this.economy.diamonds.toLocaleString('ja-JP')}` }),
      ]),
      el('button', { className: 'primary-button', text: '受け取りました', onclick: () => modal.close() }),
    ]);
    modal = openModal({ title: 'ログインプレゼント', content, className: 'login-bonus-modal' });
  }

  showLoading(message) {
    this.currentScreen = 'loading';
    replace(this.root, el('main', { className: 'boot-screen' }, [el('div', { className: 'brand-mark', text: 'MC' }), el('p', { text: message })]));
  }

  showHome() {
    this.currentScreen = 'home';
    this.session = null;
    new HomeScreen({
      root: this.root,
      masterIndex: this.masterIndex,
      user: this.user,
      champion: this.champion,
      repositoryStatus: this.repository.getStatus(),
      decks: this.decks.list(),
      catalog: this.catalog,
      economy: this.economy,
      seed: this.seed,
      debugMode: globalThis.__MC_DEBUG_MODE__,
      adminMode: globalThis.__MC_ADMIN_MODE__,
      activeRun: this.activeRun,
      onResume: () => this.resumeTournament(),
      onTournament: () => this.showTournamentSetup(),
      onDecks: () => this.showDeckList(),
      onBoosters: () => this.showBoosterShop(),
      onAdmin: () => this.showAdminTools(),
      onProfile: () => this.showProfile(),
      installAvailable: Boolean(this.installPromptEvent),
      onInstall: () => this.installApp(),
    });
  }

  async installApp() {
    const event = this.installPromptEvent;
    if (!event) return;
    this.installPromptEvent = null;
    try {
      await event.prompt();
      await event.userChoice;
    } catch (error) {
      console.warn('PWA install prompt could not be shown.', error);
    } finally {
      if (this.currentScreen === 'home') this.showHome();
    }
  }

  renameProfile(returnTo = 'home') {
    const input = el('input', { value: this.user.displayName, attrs: { maxlength: '24', 'aria-label': 'プレイヤー名' } });
    const content = el('div', { className: 'name-editor' }, [
      el('label', {}, [el('span', { text: 'プレイヤー名（1〜24文字）' }), input]),
      el('button', { className: 'primary-button', text: '保存', onclick: async () => {
        try {
          const profile = await this.repository.setDisplayName(input.value);
          this.user = { ...this.user, ...profile, displayName: input.value.trim() };
          modal.close();
          if (returnTo === 'profile') await this.showProfile();
          else this.showHome();
        } catch (error) { this.showError(error, '名前を保存できません'); }
      } }),
    ]);
    const modal = openModal({ title: 'プレイヤー名', content });
  }

  async showProfile() {
    this.showLoading('マイページを読み込んでいます…');
    try {
      const [account, stats, catalog] = await Promise.all([
        this.repository.getAccountStatus(),
        this.repository.getPlayerStats(),
        this.repository.getCardCatalog(),
      ]);
      this.catalog = catalog;
      this.currentScreen = 'profile';
      new ProfileScreen({
        root: this.root,
        user: this.user,
        account,
        stats,
        catalogProgress: catalogProgress(catalog, this.masterIndex),
        qualification: this.economy.tournamentQualification,
        champion: this.champion,
        hasActiveRun: Boolean(this.activeRun),
        onBack: () => this.showHome(),
        onRename: () => this.renameProfile('profile'),
        onRegisterRecovery: () => this.openRecoveryRegistration(),
        onSignIn: () => this.openRecoverySignIn(),
      });
    } catch (error) {
      this.showError(error, 'マイページを読み込めません');
      this.showHome();
    }
  }

  openRecoveryRegistration() {
    const playerId = el('input', { attrs: { type: 'text', inputmode: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', minlength: '4', maxlength: '20', placeholder: '例: kado2525', 'aria-label': '復旧ID' } });
    const password = el('input', { attrs: { type: 'password', autocomplete: 'new-password', minlength: '6', placeholder: '6文字以上', 'aria-label': '復旧用パスワード' } });
    const confirmation = el('input', { attrs: { type: 'password', autocomplete: 'new-password', minlength: '6', placeholder: 'もう一度入力', 'aria-label': '復旧用パスワード確認' } });
    let modal = null;
    const submit = el('button', { className: 'primary-button', text: '復旧設定を登録', onclick: async () => {
      if (password.value !== confirmation.value) return this.showError(new Error('確認用パスワードが一致しません'), '登録できません');
      submit.disabled = true;
      try {
        const normalizedId = normalizePlayerId(playerId.value);
        await this.repository.linkRecoveryAccount({ playerId: normalizedId, password: password.value });
        this.user = { ...this.user, isAnonymous: false };
        modal.close();
        openModal({ title: 'アカウントを保護しました', content: el('div', { className: 'account-complete-copy' }, [
          el('p', { text: `復旧ID「${normalizedId}」とパスワードで、機種変更後や再インストール後にデータを復旧できます。` }),
          el('p', { className: 'account-switch-warning', text: '復旧IDとパスワードを忘れた場合は再発行できません。必ず端末外にも控えてください。' }),
        ]) });
        await this.showProfile();
      } catch (error) {
        this.showError(new Error(accountErrorMessage(error)), '復旧設定を登録できません');
      } finally { submit.disabled = false; }
    } });
    modal = openModal({ title: 'アカウント復旧を設定', className: 'account-modal', content: el('div', { className: 'account-form' }, [
      el('p', { text: '現在のデッキ・ダイヤ・図鑑を同じアカウントのまま保護します。メールアドレスは必要ありません。' }),
      el('label', {}, [el('span', { text: '復旧ID' }), playerId, el('small', { text: PLAYER_ID_RULE_COPY })]),
      el('label', {}, [el('span', { text: 'パスワード' }), password]),
      el('label', {}, [el('span', { text: 'パスワード確認' }), confirmation]),
      el('p', { className: 'account-switch-warning', text: 'IDとパスワードを忘れた場合は復旧できません。必ず安全な場所へ控えてください。' }),
      submit,
    ]) });
  }

  openRecoverySignIn() {
    if (this.activeRun) return this.showError(new Error('大会を終了してから別のアカウントを復旧してください'), '復旧できません');
    const playerId = el('input', { attrs: { type: 'text', inputmode: 'text', autocomplete: 'username', autocapitalize: 'none', spellcheck: 'false', maxlength: '20', placeholder: '復旧ID', 'aria-label': '登録済み復旧ID' } });
    const password = el('input', { attrs: { type: 'password', autocomplete: 'current-password', placeholder: 'パスワード', 'aria-label': '登録パスワード' } });
    let modal = null;
    const submit = el('button', { className: 'primary-button', text: 'このアカウントを復旧', onclick: async () => {
      submit.disabled = true;
      try {
        await this.repository.signInRecoveryAccount({ playerId: playerId.value, password: password.value });
        modal.close();
        location.reload();
      } catch (error) {
        this.showError(new Error(accountErrorMessage(error)), 'アカウントを復旧できません');
        submit.disabled = false;
      }
    } });
    modal = openModal({ title: '既存アカウントで復旧', className: 'account-modal', content: el('div', { className: 'account-form' }, [
      el('p', { className: 'account-switch-warning', text: '登録済みアカウントのクラウドデータへ切り替えます。現在の未保護データは自動統合されず、この操作後は戻せません。機種変更先など、新しく開始した端末で使用してください。' }),
      el('label', {}, [el('span', { text: '復旧ID' }), playerId]),
      el('label', {}, [el('span', { text: 'パスワード' }), password]),
      submit,
      el('small', { className: 'profile-recovery-warning', text: '復旧IDまたはパスワードを忘れた場合、現在は再発行できません。' }),
    ]) });
  }

  showDeckList() {
    this.currentScreen = 'decks';
    const screen = new DeckListScreen({
      root: this.root,
      collection: this.decks,
      masterIndex: this.masterIndex,
      lockedDeckId: activeRunDeckId(this.activeRun),
      onBack: () => this.showHome(),
      onSelect: (deck) => this.showDeckDetail(deck.deckId),
      onCatalog: () => this.showCardCatalog(),
      onInventory: () => this.showAssetCollection({ returnTo: 'decks' }),
      onRename: async (deck, nextName) => {
        if (this.isDeckEditingLocked(deck.deckId)) throw new Error('大会参加中はデッキ名を変更できません');
        const previousName = deck.deckName;
        const updated = this.decks.rename(deck.deckId, nextName);
        try {
          await this.repository.saveDeck(updated);
          return updated;
        } catch (error) {
          this.decks.rename(deck.deckId, previousName);
          throw error;
        }
      },
      onCreate: () => openStarterDeckPicker({
        masterIndex: this.masterIndex,
        options: STARTER_DECK_OPTIONS,
        onChoose: async (starter) => {
          try {
            const deckId = `new-${starter.faction}-${this.seed}-${Date.now().toString(36)}`;
            const deck = this.decks.create({
              deckName: starter.deckName,
              cards: createFactionStarterDeck(this.masterData, starter.faction, deckId),
            });
            await this.repository.saveDeck(deck);
            this.catalog = await this.repository.recordCardCatalog({
              ownedCardMasterIds: deck.cards.map((card) => card.masterId),
            });
            screen.render();
          } catch (error) { this.showError(error, 'デッキを作成できません'); }
        },
      }),
    });
  }

  showAdminTools(config = this.adminToolConfig) {
    this.currentScreen = 'admin';
    new AdminToolScreen({
      root: this.root,
      masterIndex: this.masterIndex,
      initialConfig: config,
      onBack: () => this.showHome(),
      onPreview: (pendingPack, nextConfig) => {
        this.adminToolConfig = { ...nextConfig, tab: 'gacha' };
        this.showAdminPackPreview(pendingPack);
      },
    });
  }

  showAdminPackPreview(pendingPack) {
    this.currentScreen = 'admin-pack-preview';
    new PackOpeningScreen({
      root: this.root,
      pendingPack,
      masterIndex: this.masterIndex,
      reducedMotion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
      previewMode: true,
      completionLabel: '管理者ツールへ戻る',
      onComplete: () => this.showAdminTools(),
    });
  }

  showBoosterShop() {
    this.currentScreen = 'boosters';
    new BoosterShopScreen({
      root: this.root,
      economy: this.economy,
      masterIndex: this.masterIndex,
      onBack: () => this.showHome(),
      onInventory: () => this.showAssetCollection(),
      onOpen: (pack, resume = false) => this.openBooster(pack, resume),
    });
  }

  showAssetCollection({ returnTo = 'boosters' } = {}) {
    this.currentScreen = 'assets';
    const returnToDecks = returnTo === 'decks';
    new AssetCollectionScreen({
      root: this.root,
      economy: this.economy,
      masterIndex: this.masterIndex,
      onBack: () => returnToDecks ? this.showDeckList() : this.showBoosterShop(),
      backLabel: returnToDecks ? '保存デッキへ' : 'パックへ',
    });
  }

  async openBooster(pack, resume = false) {
    try {
      let pending = this.economy.pendingPack;
      if (!resume) {
        if (!pack) throw new Error('開封するパックが選ばれていません');
        const operationId = `pack-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`}`;
        const generated = generateBoosterPack({
          masterIndex: this.masterIndex,
          faction: pack.faction,
          seed: `${this.seedSource.next()}:${operationId}`,
          openedCount: this.economy.packCounters?.[pack.faction] ?? 0,
        });
        this.showLoading('パック結果を安全に保存しています…');
        this.economy = await this.repository.commitPackPurchase({
          operationId,
          faction: pack.faction,
          packId: pack.id,
          cards: generated.cards,
          cost: pack.cost,
          useFreeCredit: this.economy.freePackCredits > 0,
        });
        pending = this.economy.pendingPack;
      }
      if (!pending) throw new Error('未確認のパックはありません');
      this.currentScreen = 'pack-opening';
      new PackOpeningScreen({
        root: this.root,
        pendingPack: pending,
        masterIndex: this.masterIndex,
        reducedMotion: globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false,
        onComplete: () => this.finishBoosterOpening(pending.operationId),
      });
    } catch (error) {
      this.showError(error, 'パックを開封できません');
      this.showBoosterShop();
    }
  }

  async finishBoosterOpening(operationId) {
    this.showLoading('獲得カードを確認しています…');
    try {
      const acquired = this.economy.pendingPack?.cards ?? [];
      this.catalog = await this.repository.recordCardCatalog({ ownedCardMasterIds: acquired.map((card) => card.masterId) });
      this.economy = await this.repository.acknowledgePack(operationId);
      this.showAssetCollection();
    } catch (error) {
      this.showError(error, '開封結果を確定できません');
      this.showBoosterShop();
    }
  }

  async showCardCatalog() {
    this.showLoading('カードの所有・発見履歴を読み込んでいます…');
    try {
      this.catalog = await this.repository.getCardCatalog();
      this.currentScreen = 'card-catalog';
      new CardCatalogScreen({
        root: this.root,
        catalog: this.catalog,
        masterIndex: this.masterIndex,
        onBack: () => this.showDeckList(),
      });
    } catch (error) {
      this.showError(error, 'カード図鑑を読み込めません');
      this.showDeckList();
    }
  }

  showDeckDetail(deckId) {
    this.currentScreen = 'deck-detail';
    const locked = this.isDeckEditingLocked(deckId);
    new DeckDetailScreen({
      root: this.root,
      collection: this.decks,
      masterIndex: this.masterIndex,
      deckId,
      locked,
      catalog: this.catalog,
      onBack: () => this.showDeckList(),
      onChanged: (deck) => this.repository.saveDeck(deck).catch((error) => this.showError(error, 'デッキを同期できません')),
      onDelete: (deck) => this.confirmDeleteDeck(deck),
      onBuild: (deck) => this.showDeckBuilder(deck),
      onRecover: async (masterId) => {
        if (this.isDeckEditingLocked(deckId)) throw new Error('大会参加中は消失カードを復元できません');
        const serial = globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 9)}`;
        const recovered = this.decks.recoverLegacyAsset(deckId, masterId, `${deckId}-legacy-recovery-${serial}`);
        await this.repository.saveDeck(recovered);
        this.showDeckDetail(deckId);
        return recovered;
      },
    });
  }

  showDeckBuilder(deck) {
    if (this.isDeckEditingLocked(deck.deckId)) {
      this.showDeckDetail(deck.deckId);
      this.showError(new Error('このデッキは進行中の大会で使用されています。大会終了後に編集できます。'), '大会参加中のデッキ');
      return;
    }
    this.currentScreen = 'deck-builder';
    new DeckBuildScreen({
      root: this.root,
      deck,
      economy: this.economy,
      masterIndex: this.masterIndex,
      onBack: () => this.showDeckDetail(deck.deckId),
      onSave: async (draft, economy) => {
        if (this.isDeckEditingLocked(deck.deckId)) {
          this.showDeckDetail(deck.deckId);
          this.showError(new Error('大会データを保護するため、進行中デッキの変更は保存できません。'), '大会参加中のデッキ');
          return;
        }
        this.showLoading('40枚とデッキ専用プールを安全に保存しています…');
        try {
          const saved = this.decks.replaceCardsAndPool(deck.deckId, { cards: draft.cards, pool: draft.pool });
          const result = await this.repository.saveDeckAndEconomy(saved, economy);
          this.economy = result.economy;
          this.showDeckDetail(deck.deckId);
        } catch (error) {
          this.showError(error, 'デッキを保存できません');
          this.showDeckBuilder(this.decks.get(deck.deckId));
        }
      },
    });
  }

  confirmDeleteDeck(deck) {
    if (this.isDeckEditingLocked(deck.deckId)) {
      this.showError(new Error('このデッキは進行中の大会で使用されているため削除できません。'), '大会参加中のデッキ');
      return;
    }
    const content = el('div', {}, [
      el('p', { text: `「${deck.deckName}」の40枚と専用プールを削除します。プレイヤーの大会解禁状況は残ります。` }),
      el('div', { className: 'modal-actions' }, [
        el('button', { className: 'text-button', text: 'キャンセル', onclick: () => modal.close() }),
        el('button', { className: 'text-button danger-button', text: '削除する', onclick: async () => {
          if (this.isDeckEditingLocked(deck.deckId)) {
            modal.close();
            this.showError(new Error('大会データを保護するため、進行中デッキは削除できません。'), '大会参加中のデッキ');
            return;
          }
          try {
            await this.repository.deleteDeck(deck.deckId);
            this.decks.remove(deck.deckId);
            modal.close();
            this.showDeckList();
          } catch (error) { this.showError(error, 'デッキを削除できません'); }
        } }),
      ]),
    ]);
    const modal = openModal({ title: '保存デッキを削除しますか？', content });
  }

  isDeckEditingLocked(deckId) {
    return isDeckLockedByActiveRun(this.activeRun, deckId);
  }

  showTournamentSetup() {
    this.currentScreen = 'setup';
    new TournamentSetupScreen({
      root: this.root,
      collection: this.decks,
      masterIndex: this.masterIndex,
      onBack: () => this.showHome(),
      onStart: (deck, rank) => this.startTournament(deck, rank),
    });
  }

  async startTournament(deck, rank) {
    this.showLoading('16人のエントリーを組み合わせています…');
    try {
      this.session = new GameSession({
        masterData: this.masterData,
        masterIndex: this.masterIndex,
        deckCollection: this.decks,
        repository: this.repository,
        user: this.user,
        champion: this.champion,
        seed: this.seedSource.next(),
      });
      await this.session.startTournament(deck.deckId, rank);
      this.activeRun = await this.repository.getActiveRun?.();
      this.showTournament();
    } catch (error) {
      this.showError(error, '大会を開始できません');
      this.showTournamentSetup();
    }
  }

  showTournament() {
    this.currentScreen = 'tournament';
    new TournamentScreen({
      root: this.root,
      tournament: this.session.tournament,
      onStartMatch: () => this.startBattle(),
      onLeave: () => this.showHome(),
    });
  }

  startBattle() {
    try {
      const engine = this.session.createCurrentBattle();
      this.showBattle(engine);
    } catch (error) { this.showError(error, '試合を開始できません'); }
  }

  showBattle(engine = this.session.activeBattle, runtime = {}) {
    const level = this.session.tournament.getCurrentAiLevel();
    this.currentScreen = 'battle';
    new BattleScreen({
      root: this.root,
      engine,
      humanPlayerId: 'player',
      chooseCpuAction: createAiPolicy(level, { timeBudgetMs: AI_BUDGET[level] }),
      onComplete: (_result, completedEngine) => this.handleBattleComplete(completedEngine),
      onCheckpoint: (battleRuntime) => this.persistBattleCheckpoint(battleRuntime),
      cpuRngState: runtime.cpuRng ?? null,
      speed: runtime.speed ?? 'standard',
    });
  }

  persistBattleCheckpoint(runtime) {
    void this.session?.saveCheckpoint('battle', runtime)
      .then((checkpoint) => { if (checkpoint?.phase === 'battle') this.activeRun = checkpoint; })
      .catch((error) => console.error('Battle checkpoint failed', error));
  }

  async resumeTournament() {
    this.showLoading('中断した大会を復元しています…');
    let checkpoint = null;
    try {
      checkpoint = await this.repository.getActiveRun?.();
      if (!['tournament', 'battle', 'reward'].includes(checkpoint?.phase)) throw new Error('再開できる大会データがありません');
      const deckId = checkpoint.tournament?.state?.playerDeck?.deckId;
      if (!deckId || !this.decks.get(deckId)) throw new Error('大会で使用していた保存デッキが見つかりません');
      this.session = GameSession.restore({
        masterData: this.masterData,
        masterIndex: this.masterIndex,
        deckCollection: this.decks,
        repository: this.repository,
        user: this.user,
        champion: this.champion,
        checkpoint,
      });
      this.activeRun = checkpoint;
      if (checkpoint.phase === 'battle' && this.session.activeBattle.state.status === 'active') {
        this.showBattle(this.session.activeBattle, checkpoint.runtime);
      } else if (checkpoint.phase === 'battle') {
        await this.handleBattleComplete(this.session.activeBattle);
      }
      else if (checkpoint.phase === 'reward' && this.session.pendingReward.state.status !== 'selecting') {
        await this.finishReward(this.session.pendingReward.state.resultCards);
      } else if (checkpoint.phase === 'reward') {
        this.showReward({
          reward: this.session.pendingReward,
          opponent: this.session.pendingRewardOpponent,
        });
      }
      else this.showTournament();
    } catch (error) {
      this.showError(error, '大会を再開できません');
      if (checkpoint?.runId) {
        const updatedAtMs = Math.max(Date.now(), Number(checkpoint.updatedAtMs || 0) + 1);
        void this.repository.clearActiveRun?.({
          schemaVersion: 1,
          runId: checkpoint.runId,
          revision: Number(checkpoint.revision || 0) + 1,
          updatedAtMs,
          phase: 'cleared',
        }).catch((clearError) => console.error('Invalid checkpoint cleanup failed', clearError));
      }
      this.activeRun = null;
      this.showHome();
    }
  }

  async handleBattleComplete(engine) {
    this.showLoading('試合結果を大会表へ反映しています…');
    try {
      const outcome = await this.session.completeBattle(engine);
      this.economy = await this.repository.getEconomy();
      if (outcome.type === 'reward') {
        this.activeRun = await this.repository.getActiveRun?.();
        this.showReward(outcome);
      }
      else { this.activeRun = null; this.showTournament(); }
    } catch (error) {
      this.showError(error, '試合結果を保存できません');
      this.showTournament();
    }
  }

  showReward(outcome) {
    this.currentScreen = 'reward';
    const finish = (cards) => this.finishReward(cards);
    new RewardScreen({
      root: this.root,
      session: outcome.reward,
      masterIndex: this.masterIndex,
      opponentName: outcome.opponent.displayName,
      onCommit: finish,
      onSkip: finish,
      onCancel: finish,
      onStateChange: () => { void this.session.saveCheckpoint('reward').catch((error) => console.error('Reward checkpoint failed', error)); },
    });
  }

  async finishReward(cards) {
    this.showLoading('40枚デッキを安全に保存しています…');
    try {
      const outcome = await this.session.completeReward(cards);
      this.economy = await this.repository.getEconomy();
      if (outcome.type === 'tournament-end') this.activeRun = null;
      else this.activeRun = await this.repository.getActiveRun?.();
      this.showTournament();
    } catch (error) {
      if (error?.code === 'champion/version-conflict') {
        this.showError(error, '王座戦中にチャンピオンが交代しました。獲得カードは保存済みですが、現王者への再挑戦が必要です。');
      } else this.showError(error, '報酬を保存できません');
      this.showTournament();
    }
  }

  showError(error, title = 'エラー') {
    console.error(error);
    openModal({ title, content: el('p', { text: error?.message ?? String(error) }) });
  }
}

async function boot() {
  const root = document.querySelector('#app');
  const app = new MonsterConstructionApp(root);
  try { await app.initialize(); }
  catch (error) {
    console.error(error);
    replace(root, el('main', { className: 'error-screen' }, [
      el('div', { className: 'brand-mark', text: '!' }),
      el('h1', { text: '起動できませんでした' }),
      el('pre', { text: error.stack ?? error.message }),
      el('button', { className: 'primary-button', text: '再読み込み', onclick: () => location.reload() }),
    ]));
  }
}

boot();

const startServiceWorker = () => { void registerServiceWorker(); };
if (document.readyState === 'complete') startServiceWorker();
else window.addEventListener('load', startServiceWorker, { once: true });

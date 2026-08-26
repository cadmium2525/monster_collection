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
import { el, replace } from './ui/dom.js';
import { HomeScreen } from './ui/home-screen.js';
import { openModal } from './ui/modal.js';
import { RewardScreen } from './ui/reward-screen.js';
import { TournamentScreen } from './ui/tournament-screen.js';
import { TournamentSetupScreen } from './ui/tournament-setup-screen.js';
import { AssetCollectionScreen, BoosterShopScreen, PackOpeningScreen } from './ui/booster-screen.js';
import { generateBoosterPack } from './gacha/pack-generator.js';

const AI_BUDGET = Object.freeze({ bronze: 4, silver: 8, gold: 22, legend: 55, champion: 85 });

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
    const records = await this.repository.listDecks();
    this.decks = new DeckCollection({
      masterIndex: this.masterIndex,
      records,
      idFactory: () => `deck-${globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`}`,
    });
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
    globalThis.__MC_DEBUG__ = { app: this, masterData: this.masterData, masterIndex: this.masterIndex, repository: this.repository };
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
      economy: this.economy,
      seed: this.seed,
      debugMode: globalThis.__MC_DEBUG_MODE__,
      activeRun: this.activeRun,
      onResume: () => this.resumeTournament(),
      onTournament: () => this.showTournamentSetup(),
      onDecks: () => this.showDeckList(),
      onBoosters: () => this.showBoosterShop(),
      onRename: () => this.renameProfile(),
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

  renameProfile() {
    const input = el('input', { value: this.user.displayName, attrs: { maxlength: '24', 'aria-label': 'プレイヤー名' } });
    const content = el('div', { className: 'name-editor' }, [
      el('label', {}, [el('span', { text: 'プレイヤー名（1〜24文字）' }), input]),
      el('button', { className: 'primary-button', text: '保存', onclick: async () => {
        try {
          const profile = await this.repository.setDisplayName(input.value);
          this.user = { ...this.user, ...profile, displayName: input.value.trim() };
          modal.close();
          this.showHome();
        } catch (error) { this.showError(error, '名前を保存できません'); }
      } }),
    ]);
    const modal = openModal({ title: 'プレイヤー名', content });
  }

  showDeckList() {
    this.currentScreen = 'decks';
    const screen = new DeckListScreen({
      root: this.root,
      collection: this.decks,
      masterIndex: this.masterIndex,
      onBack: () => this.showHome(),
      onSelect: (deck) => this.showDeckDetail(deck.deckId),
      onCatalog: () => this.showCardCatalog(),
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

  showBoosterShop() {
    this.currentScreen = 'boosters';
    new BoosterShopScreen({
      root: this.root,
      economy: this.economy,
      onBack: () => this.showHome(),
      onInventory: () => this.showAssetCollection(),
      onOpen: (pack, resume = false) => this.openBooster(pack, resume),
    });
  }

  showAssetCollection() {
    this.currentScreen = 'assets';
    new AssetCollectionScreen({
      root: this.root,
      economy: this.economy,
      masterIndex: this.masterIndex,
      onBack: () => this.showBoosterShop(),
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
      this.showError(error, 'カード一覧を読み込めません');
      this.showDeckList();
    }
  }

  showDeckDetail(deckId) {
    this.currentScreen = 'deck-detail';
    new DeckDetailScreen({
      root: this.root,
      collection: this.decks,
      masterIndex: this.masterIndex,
      deckId,
      onBack: () => this.showDeckList(),
      onChanged: (deck) => this.repository.saveDeck(deck).catch((error) => this.showError(error, 'デッキを同期できません')),
      onDelete: (deck) => this.confirmDeleteDeck(deck),
      onBuild: (deck) => this.showDeckBuilder(deck),
    });
  }

  showDeckBuilder(deck) {
    this.currentScreen = 'deck-builder';
    new DeckBuildScreen({
      root: this.root,
      deck,
      economy: this.economy,
      masterIndex: this.masterIndex,
      onBack: () => this.showDeckDetail(deck.deckId),
      onSave: async (draft, economy) => {
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
    const content = el('div', {}, [
      el('p', { text: `「${deck.deckName}」と、そのデッキ固有の大会資格を削除します。` }),
      el('div', { className: 'modal-actions' }, [
        el('button', { className: 'text-button', text: 'キャンセル', onclick: () => modal.close() }),
        el('button', { className: 'text-button danger-button', text: '削除する', onclick: async () => {
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

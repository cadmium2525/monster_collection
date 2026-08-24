import { createAiPolicy } from './ai/index.js';
import { createBaselineDeck } from './data/default-decks.js';
import { createMasterIndex, loadMasterData } from './data/master-loader.js';
import { DeckCollection } from './decks/DeckCollection.js';
import { GameSession } from './game/GameSession.js';
import { createGameRepository } from './persistence/index.js';
import { registerServiceWorker } from './pwa/register-service-worker.js';
import { BattleScreen } from './ui/battle-screen.js';
import { DeckDetailScreen, DeckListScreen } from './ui/deck-screens.js';
import { el, replace } from './ui/dom.js';
import { HomeScreen } from './ui/home-screen.js';
import { openModal } from './ui/modal.js';
import { RewardScreen } from './ui/reward-screen.js';
import { TournamentScreen } from './ui/tournament-screen.js';
import { TournamentSetupScreen } from './ui/tournament-setup-screen.js';

const AI_BUDGET = Object.freeze({ bronze: 4, silver: 8, gold: 22, legend: 55, champion: 85 });

class MonsterConstructionApp {
  constructor(root) {
    this.root = root;
    this.seed = new URLSearchParams(location.search).get('seed') ?? `web-${Date.now().toString(36)}`;
    this.currentScreen = 'boot';
    this.session = null;
    this.installPromptEvent = null;
    const params = new URLSearchParams(location.search);
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
    this.champion = await this.repository.getChampion();
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
      seed: this.seed,
      onTournament: () => this.showTournamentSetup(),
      onDecks: () => this.showDeckList(),
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
      onCreate: async () => {
        try {
          const number = this.decks.list().length + 1;
          const deck = this.decks.create({
            deckName: `新しい40枚 ${number}`,
            cards: createBaselineDeck(this.masterData, `new-${this.seed}-${Date.now().toString(36)}`),
          });
          await this.repository.saveDeck(deck);
          screen.render();
        } catch (error) { this.showError(error, 'デッキを作成できません'); }
      },
    });
  }

  showDeckDetail(deckId) {
    this.currentScreen = 'deck-detail';
    new DeckDetailScreen({
      root: this.root,
      collection: this.decks,
      masterIndex: this.masterIndex,
      deckId,
      onBack: () => this.showDeckList(),
      onChanged: (deck) => this.repository.saveDeck(deck).catch((error) => this.showError(error, 'デッキ名を同期できません')),
      onDelete: (deck) => this.confirmDeleteDeck(deck),
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
        seed: this.seed,
      });
      await this.session.startTournament(deck.deckId, rank);
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
      const level = this.session.tournament.getCurrentAiLevel();
      this.currentScreen = 'battle';
      new BattleScreen({
        root: this.root,
        engine,
        humanPlayerId: 'player',
        chooseCpuAction: createAiPolicy(level, { timeBudgetMs: AI_BUDGET[level] }),
        onComplete: (_result, completedEngine) => this.handleBattleComplete(completedEngine),
      });
    } catch (error) { this.showError(error, '試合を開始できません'); }
  }

  async handleBattleComplete(engine) {
    this.showLoading('試合結果を大会表へ反映しています…');
    try {
      const outcome = await this.session.completeBattle(engine);
      if (outcome.type === 'reward') this.showReward(outcome);
      else this.showTournament();
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
    });
  }

  async finishReward(cards) {
    this.showLoading('40枚デッキを安全に保存しています…');
    try {
      await this.session.completeReward(cards);
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

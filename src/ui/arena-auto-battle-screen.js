import { HIT_SE_PATH } from '../audio/game-audio.js';
import { runArenaAutoBattle } from '../arena/auto-battle.js';
import { el, replace } from './dom.js';
import { renderCard } from './card-renderer.js';
import { representativeCardAsset } from './representative-card.js';

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function leaderCard(masterIndex, cards, representativeMonsterId) {
  const definition = masterIndex.monsters.get(representativeMonsterId)
    ?? masterIndex.monsters.get(cards.find((card) => masterIndex.monsters.has(card.masterId))?.masterId);
  if (!definition) return el('div', { className: 'arena-auto-leader-missing', text: '?' });
  const asset = representativeCardAsset(cards, definition.id);
  return renderCard({ definition, cardAsset: asset, interactive: false, label: definition.name });
}

function lifePanel(side, name, life, changed) {
  const width = Math.max(0, Math.min(100, life));
  return el('div', { className: `arena-auto-life ${side}${changed ? ` changed-${changed}` : ''}` }, [
    el('span', {}, [el('strong', { text: name }), el('b', { text: `LIFE ${life}` })]),
    el('div', { className: 'arena-auto-life-track' }, el('i', { style: `width:${width}%` })),
  ]);
}

export class ArenaAutoBattleScreen {
  constructor({ root, engine, playerDeck, opponent, masterIndex, chooseAction, onResolved, onComplete, onSuspend, onError, onPlaySe }) {
    this.root = root;
    this.engine = engine;
    this.playerDeck = playerDeck;
    this.opponent = opponent;
    this.masterIndex = masterIndex;
    this.chooseAction = chooseAction;
    this.onResolved = onResolved;
    this.onComplete = onComplete;
    this.onSuspend = onSuspend;
    this.onError = onError;
    this.onPlaySe = onPlaySe;
    this.phase = 'calculating';
    this.playerLife = Math.max(0, Number(engine.player('player').life) || 0);
    this.opponentId = engine.state.playerOrder.find((id) => id !== 'player');
    this.opponentLife = Math.max(0, Number(engine.player(this.opponentId).life) || 0);
    this.status = '両デッキの戦術を解析しています…';
    this.changed = null;
    this.skipRequested = false;
    this.suspendRequested = false;
    this.resolved = false;
    this.render();
    setTimeout(() => { void this.run(); }, 0);
  }

  playSe(source, options = {}) {
    try { void this.onPlaySe?.(source, options); } catch { /* Audio must not stop the match. */ }
  }

  requestSuspend() {
    if (!this.resolved) return;
    this.suspendRequested = true;
    this.skipRequested = true;
    this.status = '中断状態を保存しています…';
    this.render();
  }

  async run() {
    try {
      const outcome = await runArenaAutoBattle({
        engine: this.engine,
        chooseAction: this.chooseAction,
        onProgress: async ({ actions, round }) => {
          this.status = `ROUND ${round} / ${actions}手を計算中`;
          this.render();
          await delay(0);
        },
      });
      this.outcome = outcome;
      this.resolved = true;
      await this.onResolved?.(outcome.replay);
      this.phase = 'presentation';
      this.status = 'AUTO BATTLE';
      this.render();

      for (const frame of outcome.timeline.slice(1)) {
        if (this.suspendRequested) break;
        if (!this.skipRequested) await delay(520);
        const playerDown = frame.playerLife < this.playerLife;
        const opponentDown = frame.opponentLife < this.opponentLife;
        this.changed = playerDown ? 'player-down' : opponentDown ? 'opponent-down' : null;
        if (playerDown || opponentDown) this.playSe(HIT_SE_PATH);
        this.playerLife = frame.playerLife;
        this.opponentLife = frame.opponentLife;
        this.status = frame.label || `ROUND ${frame.round}`;
        this.render();
      }
      if (this.suspendRequested) {
        await this.onSuspend?.();
        return;
      }
      this.phase = 'complete';
      this.changed = null;
      this.status = outcome.engine.state.winnerId == null
        ? 'DRAW'
        : outcome.engine.state.winnerId === 'player' ? 'VICTORY' : 'DEFEAT';
      this.render();
      if (!this.skipRequested) await delay(700);
      await this.onComplete?.(outcome.engine, outcome.replay);
    } catch (error) {
      this.onError?.(error);
    }
  }

  render() {
    const playerChanged = this.changed === 'player-down' ? 'down' : null;
    const opponentChanged = this.changed === 'opponent-down' ? 'down' : null;
    replace(this.root, el('main', { className: `arena-auto-battle-screen phase-${this.phase}` }, [
      el('header', { className: 'arena-auto-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'RATING ARENA' }), el('h1', { text: 'オートバトル' })]),
        el('div', {}, [
          el('button', { className: 'text-button', text: '演出をスキップ', disabled: this.phase === 'calculating', onclick: () => { this.skipRequested = true; } }),
          el('button', { className: 'text-button', text: '中断してホーム', disabled: !this.resolved, onclick: () => this.requestSuspend() }),
        ]),
      ]),
      el('section', { className: 'arena-auto-stage' }, [
        el('article', { className: 'arena-auto-side is-player' }, [
          lifePanel('player', this.engine.player('player').displayName, this.playerLife, playerChanged),
          el('div', { className: 'arena-auto-leader' }, leaderCard(this.masterIndex, this.playerDeck.cards, this.playerDeck.representativeMonsterId)),
          el('strong', { text: this.playerDeck.deckName }),
        ]),
        el('div', { className: 'arena-auto-versus' }, [
          el('b', { text: 'VS' }),
          el('span', { attrs: { 'aria-live': 'polite' }, text: this.status }),
        ]),
        el('article', { className: 'arena-auto-side is-opponent' }, [
          lifePanel('opponent', this.opponent.displayName, this.opponentLife, opponentChanged),
          el('div', { className: 'arena-auto-leader' }, leaderCard(this.masterIndex, this.opponent.cards, this.opponent.representativeMonsterId)),
          el('strong', { text: this.opponent.deckName }),
        ]),
      ]),
    ]));
  }
}

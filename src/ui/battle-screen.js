import { SeededRng } from '../core/rng.js';
import { el, replace } from './dom.js';
import { renderCard, openCardDetails } from './card-renderer.js';
import { openModal } from './modal.js';

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function actionInvolvesSelection(action, selection) {
  if (!selection) return false;
  if (selection.kind === 'hand') {
    return action.cardInstanceId === selection.id || action.materialCardInstanceId === selection.id;
  }
  return action.unitId === selection.id || action.targetUnitId === selection.id;
}

function actionTypeLabel(type) {
  return ({
    summon: '召喚', move: '技', training: 'Training', shugyo: '修行', breeder: 'ブリーダー',
    'fusion-normal': '通常合体', 'fusion-special': '特殊合体', 'end-turn': 'ターン',
  })[type] ?? type;
}

export class BattleScreen {
  constructor({ root, engine, humanPlayerId, chooseCpuAction, onComplete, speed = 'standard' }) {
    this.root = root;
    this.engine = engine;
    this.humanPlayerId = humanPlayerId;
    this.chooseCpuAction = chooseCpuAction;
    this.onComplete = onComplete;
    this.speed = speed;
    this.selection = null;
    this.busy = false;
    this.cpuRng = new SeededRng(`${engine.state.seed}:ui-cpu`);
    this.render();
    this.runCpuIfNeeded();
  }

  observation() { return this.engine.getObservation(this.humanPlayerId); }

  definitionForCard(card) { return this.engine.masterIndex.cards.get(card.masterId); }

  render() {
    const observation = this.observation();
    const state = this.engine.getState();
    const own = observation.own;
    const opponent = observation.opponent;
    const humanTurn = state.currentPlayerId === this.humanPlayerId && state.status === 'active';
    if (this.selection && !this.selectionStillExists(own, opponent)) this.selection = null;

    const screen = el('main', { className: 'battle-screen' }, [
      this.renderHud(own, opponent, state),
      el('section', { className: 'battle-stage' }, [
        el('div', { className: 'boards', attrs: { 'aria-label': '距離のない3枠盤面' } }, [
          this.renderBoard(opponent, true),
          this.renderBoard(own, false),
        ]),
        el('aside', { className: 'battle-sidebar' }, [
          this.renderLog(observation.log),
          el('div', { className: 'utility-bar' }, [
            el('button', { className: 'utility-button', text: this.speed === 'fast' ? '演出: 高速' : '演出: 標準', onclick: () => { this.speed = this.speed === 'fast' ? 'standard' : 'fast'; this.render(); } }),
            el('button', { className: 'utility-button', text: `Seed ${state.seed.slice(0, 8)}`, onclick: () => navigator.clipboard?.writeText(state.seed) }),
          ]),
        ]),
      ]),
      el('section', { className: 'hand-zone' }, [
        el('div', { className: 'hand-panel' }, [
          el('div', { className: 'zone-heading' }, [
            el('span', { text: `手札 ${own.hand.length}/${8}` }),
            el('span', { text: `山札 ${own.deck.length} / 墓地 ${own.graveyard.length}` }),
          ]),
          el('div', { className: 'card-strip' }, own.hand.map((card) => this.renderHandCard(card, own, humanTurn))),
        ]),
        this.renderActions(humanTurn),
      ]),
    ]);
    screen.append(el('div', { className: 'portrait-warning' }, [
      el('div', { className: 'brand-mark', text: '↻' }),
      el('h2', { text: '端末を横向きにしてください' }),
      el('p', { text: 'モンスターコンストラクションは横画面向けです。' }),
    ]));
    replace(this.root, screen);

    if (state.status === 'finished' && !this.resultShown) {
      this.resultShown = true;
      this.showResult(state);
    }
  }

  selectionStillExists(own, opponent) {
    if (this.selection.kind === 'hand') return own.hand.some((card) => card.instanceId === this.selection.id);
    return [...own.board, ...opponent.board].some((unit) => unit?.id === this.selection.id);
  }

  renderHud(own, opponent, state) {
    const fighter = (player, isOpponent) => el('section', { className: `fighter-hud ${isOpponent ? 'opponent' : 'player'}` }, [
      el('div', {}, [
        el('div', { className: 'fighter-name', text: player.displayName }),
        el('div', { className: 'fighter-sub', text: isOpponent ? `手札 ${player.handCount} / 山札 ${player.deckCount}` : `手札 ${player.hand.length} / 山札 ${player.deck.length}` }),
      ]),
      el('div', {}, [
        el('div', { className: 'life-meter' }, el('i', { attrs: { style: `width:${Math.max(0, Math.min(100, player.life))}%` } })),
        el('div', { className: 'life-copy', text: `LIFE ${Math.max(0, player.life)} / 100` }),
      ]),
      el('div', { className: 'tp-orb', text: `${player.tp}/${player.maxTp}` }),
    ]);
    const current = state.players[state.currentPlayerId];
    return el('header', { className: 'battle-hud' }, [
      fighter(own, false),
      el('div', { className: 'turn-hud' }, [
        el('strong', { text: `ROUND ${state.round}/40` }),
        el('span', { text: state.status === 'active' ? `${current.displayName}のターン` : '決着' }),
      ]),
      fighter(opponent, true),
    ]);
  }

  renderBoard(player, isOpponent) {
    return el('div', { className: `board-row ${isOpponent ? 'opponent' : 'player'}` }, player.board.map((unit, slot) => {
      if (!unit) return el('div', { className: 'board-slot empty', attrs: { 'aria-label': `空き枠${slot + 1}` } });
      const definition = this.engine.masterIndex.monsters.get(unit.sourceMasterId);
      const selected = this.selection?.kind === 'unit' && this.selection.id === unit.id;
      return el('div', { className: 'board-slot' }, renderCard({
        definition,
        unit,
        selected,
        label: `${isOpponent ? '相手' : '自分'}の${unit.specialForm ?? unit.name}の詳細と行動を表示`,
        onClick: () => this.selectUnit(unit, definition, isOpponent),
      }));
    }));
  }

  renderHandCard(card, player, humanTurn) {
    const definition = this.definitionForCard(card);
    const selected = this.selection?.kind === 'hand' && this.selection.id === card.instanceId;
    const hasAction = this.engine.getLegalActions(this.humanPlayerId).some((action) => action.cardInstanceId === card.instanceId || action.materialCardInstanceId === card.instanceId);
    return renderCard({
      definition,
      selected,
      disabled: humanTurn && !hasAction,
      label: `手札の${definition.name}の詳細と行動を表示`,
      onClick: () => {
        if (this.busy) return;
        if (this.selection?.kind === 'hand' && this.selection.id === card.instanceId) {
          openCardDetails({ definition, masterIndex: this.engine.masterIndex, growth: player.tournamentGrowth[card.instanceId] });
        } else {
          this.selection = { kind: 'hand', id: card.instanceId };
          this.render();
        }
      },
    });
  }

  selectUnit(unit, definition, isOpponent) {
    if (this.busy) return;
    if (this.selection?.kind === 'unit' && this.selection.id === unit.id) {
      openCardDetails({ definition, unit, masterIndex: this.engine.masterIndex });
      return;
    }
    this.selection = { kind: 'unit', id: unit.id, opponent: isOpponent };
    this.render();
  }

  renderActions(humanTurn) {
    const all = humanTurn ? this.engine.getLegalActions(this.humanPlayerId) : [];
    const relevant = this.selection ? all.filter((action) => actionInvolvesSelection(action, this.selection)) : [];
    const actions = relevant.filter((action) => action.type !== 'end-turn');
    const end = all.find((action) => action.type === 'end-turn');
    return el('div', { className: 'action-panel' }, [
      el('div', { className: 'zone-heading' }, [
        el('span', { text: humanTurn ? '行動を選ぶ' : this.engine.state.status === 'active' ? 'CPU思考中…' : '試合終了' }),
        this.selection ? el('button', { className: 'utility-button', text: '選択解除', onclick: () => { this.selection = null; this.render(); } }) : null,
      ]),
      el('div', { className: 'action-list' }, [
        !humanTurn ? el('p', { className: 'action-hint', text: this.engine.state.status === 'active' ? '相手の行動を確認してください' : '結果を確認してください' }) : null,
        humanTurn && !this.selection ? el('p', { className: 'action-hint', text: '手札または盤上モンスターをタップしてください。もう一度タップすると詳細を開きます。' }) : null,
        humanTurn && this.selection && !actions.length ? el('p', { className: 'action-hint', text: '現在、この対象で実行できる行動はありません。' }) : null,
        ...actions.map((action) => el('button', {
          className: 'action-button',
          onclick: () => this.performHumanAction(action),
        }, [el('b', { text: `${actionTypeLabel(action.type)}${action.cost != null ? ` / ${action.cost}TP` : ''}` }), action.label])),
        humanTurn && end ? el('button', { className: 'action-button end-turn', text: 'ターン終了', onclick: () => this.performHumanAction(end) }) : null,
      ]),
    ]);
  }

  renderLog(log) {
    return el('ol', { className: 'battle-log', attrs: { 'aria-label': 'バトルログ' } }, log.slice(-18).map((entry) => el('li', { text: `[${entry.round}] ${entry.message}` })));
  }

  async performHumanAction(action) {
    if (this.busy || this.engine.state.currentPlayerId !== this.humanPlayerId) return;
    this.busy = true;
    try {
      this.engine.applyAction(action);
      this.selection = null;
      await this.showLatestEvent();
      this.render();
      await this.runCpuIfNeeded();
    } catch (error) {
      openModal({ title: '行動できません', content: el('p', { text: error.message }) });
    } finally {
      this.busy = false;
    }
  }

  async runCpuIfNeeded() {
    if (this.cpuRunning || this.engine.state.status !== 'active' || this.engine.state.currentPlayerId === this.humanPlayerId) return;
    this.cpuRunning = true;
    this.busy = true;
    this.render();
    try {
      let guard = 0;
      while (this.engine.state.status === 'active' && this.engine.state.currentPlayerId !== this.humanPlayerId && guard < 80) {
        await delay(this.speed === 'fast' ? 90 : 350);
        const playerId = this.engine.state.currentPlayerId;
        const action = await this.chooseCpuAction(this.engine, playerId, this.cpuRng);
        this.engine.applyAction(action);
        await this.showLatestEvent();
        this.render();
        guard += 1;
      }
      if (guard >= 80) throw new Error('CPUの1ターン行動数が安全上限を超えました');
    } catch (error) {
      openModal({ title: 'CPU処理エラー', content: el('p', { text: error.message }) });
    } finally {
      this.cpuRunning = false;
      this.busy = false;
      this.render();
    }
  }

  async showLatestEvent() {
    const event = this.engine.state.log.at(-1);
    if (!event || this.speed === 'fast' && ['draw', 'turn-start', 'turn-end'].includes(event.type)) return;
    const banner = el('div', { className: 'event-banner', text: event.message });
    document.body.append(banner);
    await delay(this.speed === 'fast' ? 90 : ['fusion', 'battle-end'].includes(event.type) ? 700 : 360);
    banner.remove();
  }

  showResult(state) {
    const won = state.winnerId === this.humanPlayerId;
    const draw = state.winnerId == null;
    const content = el('div', { className: 'result-card' }, [
      el('h2', { text: draw ? 'DRAW' : won ? 'VICTORY' : 'DEFEAT' }),
      el('p', { text: `ROUND ${state.result.round} / 自分 LIFE ${Math.max(0, state.players[this.humanPlayerId].life)} / 相手 LIFE ${Math.max(0, state.players[state.playerOrder.find((id) => id !== this.humanPlayerId)].life)}` }),
      el('button', { className: 'primary-button', text: '結果へ進む', onclick: () => { modal.close(); this.onComplete?.(state.result, this.engine); } }),
    ]);
    const modal = openModal({ title: '試合終了', content, className: 'result-card', dismissible: false });
  }
}

import { SeededRng } from '../core/rng.js';
import { effectiveAtk, effectiveDef } from '../battle/state.js';
import { el, replace } from './dom.js';
import { renderCard, openCardDetails } from './card-renderer.js';
import { createFusionAnimationModel, playFusionAnimation } from './fusion-animation.js';
import { playFusionUnlockAnimation } from './fusion-unlock-animation.js';
import { openModal } from './modal.js';

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function cardAction(action, cardInstanceId) {
  return action.cardInstanceId === cardInstanceId || action.materialCardInstanceId === cardInstanceId;
}

function unique(values) { return [...new Set(values)]; }

export class BattleScreen {
  constructor({ root, engine, humanPlayerId, chooseCpuAction, onComplete, onCheckpoint = null, cpuRngState = null, speed = 'standard' }) {
    this.root = root;
    this.engine = engine;
    this.humanPlayerId = humanPlayerId;
    this.chooseCpuAction = chooseCpuAction;
    this.onComplete = onComplete;
    this.onCheckpoint = onCheckpoint;
    this.speed = speed;
    this.selection = null;
    this.pendingMove = null;
    this.busy = false;
    this.queuedCardSelectionId = null;
    this.suppressCardClickUntil = 0;
    this.cpuRng = cpuRngState?.seed
      ? new SeededRng(cpuRngState.seed, cpuRngState.state)
      : new SeededRng(`${engine.state.seed}:ui-cpu`);
    this.render();
    if (engine.state.pendingMoveChoice?.playerId === humanPlayerId) {
      setTimeout(() => { void this.resumePendingHumanChoice(); }, 0);
    } else this.runCpuIfNeeded();
  }

  checkpointRuntime() { return { cpuRng: this.cpuRng.toJSON(), speed: this.speed }; }

  emitCheckpoint() {
    try {
      const pending = this.onCheckpoint?.(this.checkpointRuntime());
      pending?.catch?.((error) => console.error('Battle checkpoint failed', error));
    } catch (error) { console.error('Battle checkpoint failed', error); }
  }

  observation() { return this.engine.getObservation(this.humanPlayerId); }

  definitionForCard(card) { return this.engine.masterIndex.cards.get(card.masterId); }

  legalActions() {
    if (this._renderLegalActions) return this._renderLegalActions;
    return this.engine.getLegalActions(this.humanPlayerId);
  }

  isHumanTurn() {
    return this.engine.state.status === 'active' && this.engine.state.currentPlayerId === this.humanPlayerId;
  }

  render() {
    const observation = this.observation();
    const state = this.engine.getState();
    const own = observation.own;
    const opponent = observation.opponent;
    const humanTurn = this.isHumanTurn();
    this._renderLegalActions = humanTurn ? this.engine.getLegalActions(this.humanPlayerId) : [];
    if (this.selection && !own.hand.some((card) => card.instanceId === this.selection.id)) this.selection = null;
    if (this.pendingMove && !this.pendingMoveStillLegal()) this.pendingMove = null;

    const screen = el('main', { className: 'battle-screen' }, [
      this.renderStatusRail(own, opponent),
      el('section', { className: 'battle-table' }, [
        this.renderOpponentHand(opponent),
        el('div', {
          className: `boards${this.hasUntargetedFieldAction() ? ' drop-valid-field' : ''}`,
          attrs: { 'aria-label': '3枠盤面' },
          onclick: (event) => this.handleFieldClick(event),
        }, [
          this.renderBoard(opponent, true),
          el('div', { className: 'board-divider', attrs: { 'aria-hidden': 'true' } }),
          this.renderBoard(own, false),
        ]),
        el('section', { className: 'hand-panel', attrs: { 'aria-label': '自分の手札' } }, [
          el('div', { className: 'card-strip' }, own.hand.map((card) => this.renderHandCard(card, own, humanTurn))),
        ]),
      ]),
      el('aside', { className: 'battle-command-rail' }, [
        this.renderTurnHud(state),
        this.renderLog(observation.log),
        el('div', { className: 'utility-bar' }, [
          el('button', {
            className: 'utility-button speed-button',
            text: this.speed === 'fast' ? '▶▶ 高速' : '▶ 標準',
            onclick: () => { this.speed = this.speed === 'fast' ? 'standard' : 'fast'; this.emitCheckpoint(); this.render(); },
          }),
          globalThis.__MC_DEBUG_MODE__ ? el('button', {
            className: 'utility-button seed-button',
            text: `Seed ${state.seed.slice(0, 8)}`,
            onclick: () => navigator.clipboard?.writeText(state.seed),
          }) : null,
          globalThis.__MC_DEBUG_MODE__ ? el('button', {
            className: 'utility-button debug-win',
            text: 'TEST WIN',
            onclick: () => { this.engine._finish(this.humanPlayerId, 'debug-test-win'); this.render(); },
          }) : null,
        ]),
        this.renderTurnControls(humanTurn),
      ]),
    ]);
    replace(this.root, screen);
    this._renderLegalActions = null;
    this.pinLatestLog();

    if (state.status === 'finished' && !this.resultShown) {
      this.resultShown = true;
      this.showResult(state);
    }
  }

  pinLatestLog() {
    const followLatest = () => {
      const log = this.root.querySelector('.battle-log');
      if (log) log.scrollTop = log.scrollHeight;
    };
    if (typeof requestAnimationFrame === 'function') requestAnimationFrame(followLatest);
    else setTimeout(followLatest, 0);
  }

  interactionHint() {
    if (this.engine.state.pendingMoveChoice?.playerId === this.humanPlayerId) {
      return '新しく覚えた技の入替を選択';
    }
    if (this.pendingMove) {
      const move = this.engine.masterIndex.moves.get(this.pendingMove.moveId);
      return `${move?.name ?? '技'}：対象をタップ`;
    }
    if (this.selection) {
      const card = this.engine.player(this.humanPlayerId).hand.find((entry) => entry.instanceId === this.selection.id);
      const definition = card ? this.definitionForCard(card) : null;
      return `${definition?.name ?? 'カード'}を盤面へスワイプ`;
    }
    return this.isHumanTurn() ? 'カードを選択 → 盤面へスワイプ' : '相手の行動中';
  }

  pendingMoveStillLegal() {
    return this.legalActions().some((action) => action.type === 'move'
      && action.unitId === this.pendingMove.unitId
      && action.moveId === this.pendingMove.moveId);
  }

  renderStatusRail(own, opponent) {
    const fighter = (player, isOpponent) => {
      const handCount = isOpponent ? player.handCount : player.hand.length;
      const deckCount = isOpponent ? player.deckCount : player.deck.length;
      const graveyardCount = player.graveyard.length;
      const playerTarget = isOpponent && this.pendingMove && this.legalActions().some((action) => action.type === 'move'
        && action.unitId === this.pendingMove.unitId
        && action.moveId === this.pendingMove.moveId
        && action.targetPlayerId === player.id);
      const activate = playerTarget ? () => this.choosePlayerAttackTarget(player.id) : null;
      return el('section', {
        className: `fighter-hud ${isOpponent ? 'opponent' : 'player'}${playerTarget ? ' attack-target' : ''}`,
        dataset: { playerId: player.id },
        attrs: {
          'aria-label': `${isOpponent ? '相手' : '自分'} ${player.displayName} LIFE ${player.life} TP ${player.tp}${playerTarget ? ' 攻撃対象' : ''}`,
          ...(playerTarget ? { role: 'button', tabindex: '0' } : {}),
        },
        onclick: activate,
        onkeydown: playerTarget ? (event) => {
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            activate();
          }
        } : null,
      }, [
        el('div', { className: 'fighter-banner' }, [
          el('small', { text: isOpponent ? 'OPPONENT' : 'PLAYER' }),
          el('strong', { className: 'fighter-name', text: player.displayName }),
        ]),
        el('div', { className: 'life-copy' }, [
          el('span', { text: 'LIFE' }),
          el('strong', { text: Math.max(0, player.life) }),
          el('small', { text: '/ 100' }),
        ]),
        el('div', { className: 'life-meter' }, el('i', { attrs: { style: `width:${Math.max(0, Math.min(100, player.life))}%` } })),
        el('div', { className: 'tp-copy' }, [
          el('span', { text: 'TP' }),
          el('strong', { text: `${player.tp} / ${player.maxTp}` }),
        ]),
        el('div', { className: 'tp-gems', attrs: { 'aria-hidden': 'true' } }, Array.from({ length: player.maxTp }, (_, index) => el('i', { className: index < player.tp ? 'active' : '' }))),
        el('div', { className: 'pile-strip' }, [
          el('span', {}, [el('small', { text: '手札' }), el('strong', { text: handCount })]),
          el('span', {}, [el('small', { text: '山札' }), el('strong', { text: deckCount })]),
          el('span', {}, [el('small', { text: '墓地' }), el('strong', { text: graveyardCount })]),
        ]),
      ]);
    };
    return el('aside', { className: 'battle-status-rail' }, [
      fighter(opponent, true),
      el('div', { className: 'versus-mark', attrs: { 'aria-hidden': 'true' } }, 'VS'),
      fighter(own, false),
    ]);
  }

  renderTurnHud(state) {
    const current = state.players[state.currentPlayerId];
    const humanTurn = state.currentPlayerId === this.humanPlayerId;
    return el('header', { className: `turn-hud ${humanTurn ? 'player-turn' : 'enemy-turn'}` }, [
      el('span', { text: 'TURN' }),
      el('strong', { text: `${state.round}` }),
      el('small', { text: state.status === 'active' ? (humanTurn ? 'PLAYER TURN' : 'ENEMY TURN') : 'BATTLE END' }),
      el('em', { text: state.status === 'active' ? `${current.displayName}のターン` : '決着' }),
    ]);
  }

  renderOpponentHand(opponent) {
    const count = Math.max(0, Math.min(8, opponent.handCount));
    return el('section', { className: 'opponent-hand-panel', attrs: { 'aria-label': `相手の手札 ${opponent.handCount}枚` } }, [
      el('strong', { text: `相手の手札  ${opponent.handCount}枚` }),
      el('div', { className: 'opponent-hand-cards', attrs: { 'aria-hidden': 'true' } }, Array.from({ length: count }, () => el('i', { className: 'card-back' }, el('b', { text: '◆' })))),
    ]);
  }

  renderBoard(player, isOpponent) {
    return el('div', {
      className: `board-row ${isOpponent ? 'opponent' : 'player'}`,
      dataset: { fieldLabel: isOpponent ? 'ENEMY FIELD' : 'PLAYER FIELD', ownerId: player.id },
    }, player.board.map((unit, slot) => {
      if (!unit) {
        const valid = !isOpponent && this.actionsForEmptySlot(slot).length > 0;
        return el('button', {
          className: `board-slot empty${valid ? ' drop-valid' : ''}`,
          dataset: { slot: String(slot), ownerId: player.id },
          attrs: { type: 'button', 'aria-label': `空き枠${slot + 1}${valid ? ' 召喚可能' : ''}` },
          onclick: (event) => {
            event.stopPropagation();
            this.handleEmptySlotClick(slot);
          },
        });
      }
      const definition = this.engine.masterIndex.monsters.get(unit.sourceMasterId);
      const handActions = this.actionsForUnit(unit.id);
      const fusionActions = handActions.filter((action) => action.type.startsWith('fusion-'));
      const fusionPreview = (fusionActions.find((action) => action.type === 'fusion-special') ?? fusionActions[0])?.preview;
      const attackTarget = this.pendingMove && this.legalActions().some((action) => action.type === 'move'
        && action.unitId === this.pendingMove.unitId
        && action.moveId === this.pendingMove.moveId
        && action.targetUnitId === unit.id);
      const sourceSelected = this.pendingMove?.unitId === unit.id;
      const cardNode = renderCard({
        definition,
        unit,
        selected: sourceSelected,
        label: `${isOpponent ? '相手' : '自分'}の${unit.specialForm ?? unit.name}${attackTarget ? ' 攻撃対象' : ' 詳細'}`,
        onClick: (event) => {
          event.stopPropagation();
          this.handleBoardUnitClick(unit, definition, isOpponent);
        },
      });
      return el('div', {
        className: `board-slot${handActions.length ? ' drop-valid' : ''}${attackTarget ? ' attack-target' : ''}`,
        dataset: { unitId: unit.id, slot: String(slot), ownerId: player.id },
      }, [
        cardNode,
        fusionPreview ? el('span', { className: 'fusion-drop-preview', text: `合体 SP +${fusionPreview.deltaSp}` }) : null,
      ]);
    }));
  }

  renderHandCard(card, player, humanTurn) {
    const definition = this.definitionForCard(card);
    const selected = this.selection?.id === card.instanceId;
    const hasAction = this.legalActions().some((action) => cardAction(action, card.instanceId));
    const node = renderCard({
      definition,
      growth: player.tournamentGrowth[card.instanceId],
      cardAsset: card,
      selected,
      disabled: humanTurn && !hasAction && !this.busy,
      dragReady: selected && humanTurn && hasAction,
      showMonsterEffect: definition.kind !== 'monster',
      label: `手札の${definition.name}${selected ? ' 選択中。もう一度タップで詳細、盤面へスワイプで使用' : ' 選択'}`,
      onPointerDown: selected && humanTurn && hasAction ? (event) => this.beginHandDrag(event, card, definition) : null,
      onClick: (event) => {
        if (performance.now() < this.suppressCardClickUntil) return;
        if (this.busy || !this.isHumanTurn()) {
          this.queueHandCardSelection(card.instanceId, event.currentTarget);
          return;
        }
        if (this.selection?.id === card.instanceId) {
          openCardDetails({ definition, masterIndex: this.engine.masterIndex, growth: player.tournamentGrowth[card.instanceId], cardAsset: card });
        } else {
          this.pendingMove = null;
          this.selection = { kind: 'hand', id: card.instanceId };
          this.render();
        }
      },
    });
    node.dataset.cardInstanceId = card.instanceId;
    if (this.queuedCardSelectionId === card.instanceId) node.classList.add('tap-queued');
    return node;
  }

  queueHandCardSelection(cardInstanceId, sourceNode) {
    if (this.engine.state.status !== 'active') return false;
    const stillInHand = this.engine.player(this.humanPlayerId).hand
      .some((card) => card.instanceId === cardInstanceId);
    if (!stillInHand) return false;
    this.queuedCardSelectionId = cardInstanceId;
    this.root.querySelectorAll('.game-card.tap-queued').forEach((node) => node.classList.remove('tap-queued'));
    sourceNode?.classList.add('tap-queued');
    return true;
  }

  applyQueuedCardSelection() {
    const cardInstanceId = this.queuedCardSelectionId;
    if (!cardInstanceId || !this.isHumanTurn()) return false;
    this.queuedCardSelectionId = null;
    const stillInHand = this.engine.player(this.humanPlayerId).hand
      .some((card) => card.instanceId === cardInstanceId);
    if (!stillInHand) return false;
    this.pendingMove = null;
    this.selection = { kind: 'hand', id: cardInstanceId };
    this.render();
    return true;
  }

  actionsForSelectedCard() {
    if (!this.selection || !this.isHumanTurn()) return [];
    return this.legalActions().filter((action) => cardAction(action, this.selection.id));
  }

  actionsForEmptySlot(slot) {
    return this.actionsForSelectedCard().filter((action) => action.type === 'summon' && action.slot === slot);
  }

  actionsForUnit(unitId) {
    return this.actionsForSelectedCard().filter((action) => {
      if (action.type === 'training' || action.type === 'shugyo' || action.type.startsWith('fusion-')) return action.unitId === unitId;
      return action.type === 'breeder' && action.targetUnitId === unitId;
    });
  }

  untargetedFieldActions() {
    return this.actionsForSelectedCard().filter((action) => action.type === 'breeder' && !action.targetUnitId);
  }

  hasUntargetedFieldAction() { return this.untargetedFieldActions().length > 0; }

  handleEmptySlotClick(slot) {
    if (this.busy) return;
    const actions = this.actionsForEmptySlot(slot);
    if (actions.length) this.dispatchHandActions(actions);
  }

  handleFieldClick(event) {
    if (this.busy || event.target.closest('.board-slot')) return;
    const actions = this.untargetedFieldActions();
    if (actions.length) this.dispatchHandActions(actions);
  }

  handleBoardUnitClick(unit, definition, isOpponent) {
    if (this.busy) return;
    if (this.pendingMove) {
      const action = this.legalActions().find((candidate) => candidate.type === 'move'
        && candidate.unitId === this.pendingMove.unitId
        && candidate.moveId === this.pendingMove.moveId
        && candidate.targetUnitId === unit.id);
      if (action) {
        this.performHumanAction(action);
        return;
      }
    }
    if (this.selection) {
      const actions = this.actionsForUnit(unit.id);
      if (actions.length) {
        this.dispatchHandActions(actions);
        return;
      }
      const fieldActions = this.untargetedFieldActions();
      if (fieldActions.length) {
        this.dispatchHandActions(fieldActions);
        return;
      }
    }
    const moveActions = !isOpponent && this.isHumanTurn()
      ? this.legalActions().filter((action) => action.type === 'move' && action.unitId === unit.id)
      : [];
    const selectableMoveIds = unique(moveActions.map((action) => action.moveId));
    openCardDetails({
      definition,
      unit,
      masterIndex: this.engine.masterIndex,
      selectableMoveIds,
      onMoveSelect: selectableMoveIds.length ? (move) => this.selectMove(unit.id, move.id) : null,
    });
  }

  selectMove(unitId, moveId) {
    if (this.busy || !this.isHumanTurn()) return;
    const actions = this.legalActions().filter((action) => action.type === 'move' && action.unitId === unitId && action.moveId === moveId);
    if (!actions.length) {
      openModal({ title: '技を使えません', content: el('p', { text: 'TPまたは行動権が不足しています。' }) });
      return;
    }
    const noTarget = actions.find((action) => !action.targetUnitId && !action.targetPlayerId);
    if (noTarget) {
      this.performHumanAction(noTarget);
      return;
    }
    this.selection = null;
    this.pendingMove = { unitId, moveId };
    this.render();
  }

  choosePlayerAttackTarget(playerId) {
    if (!this.pendingMove || this.busy) return;
    const action = this.legalActions().find((candidate) => candidate.type === 'move'
      && candidate.unitId === this.pendingMove.unitId
      && candidate.moveId === this.pendingMove.moveId
      && candidate.targetPlayerId === playerId);
    if (action) this.performHumanAction(action);
  }

  renderTurnControls(humanTurn) {
    const end = humanTurn ? this.legalActions().find((action) => action.type === 'end-turn') : null;
    const choosingMove = this.engine.state.pendingMoveChoice?.playerId === this.humanPlayerId;
    return el('div', { className: 'turn-controls' }, [
      el('p', { className: 'gesture-hint', text: this.interactionHint() }),
      this.selection || this.pendingMove ? el('button', {
        className: 'utility-button cancel-selection',
        text: '選択解除',
        onclick: () => { this.selection = null; this.pendingMove = null; this.render(); },
      }) : null,
      end ? el('button', { className: 'end-turn-button', text: 'ターン終了', onclick: () => this.performHumanAction(end) }) : el('div', {
        className: 'cpu-thinking',
        text: this.engine.state.status === 'active' ? (choosingMove ? '実戦4技を選択中' : 'CPU THINKING…') : 'BATTLE END',
      }),
    ]);
  }

  dispatchHandActions(actions) {
    if (!actions.length || this.busy) return;
    const shugyo = actions.find((action) => action.type === 'shugyo');
    if (shugyo) {
      this.openShugyoConfirm(shugyo);
      return;
    }
    const fusionActions = actions.filter((action) => action.type.startsWith('fusion-'));
    if (fusionActions.length > 1) {
      this.openFusionChoice(fusionActions);
      return;
    }
    const breederActions = actions.filter((action) => action.type === 'breeder');
    if (breederActions.length > 1) {
      this.openBreederChoice(breederActions);
      return;
    }
    this.performHumanAction(actions[0]);
  }

  openBreederChoice(actions) {
    const card = this.engine.player(this.humanPlayerId).hand
      .find((candidate) => candidate.instanceId === actions[0].cardInstanceId);
    const definition = card ? this.definitionForCard(card) : null;
    let modal = null;
    const content = el('div', { className: 'breeder-action-choice' }, [
      el('p', { text: '実行する効果を選んでください。' }),
      el('div', { className: 'breeder-action-options' }, actions.map((action) => el('button', {
        className: 'text-button',
        onclick: () => { modal.close(); this.performHumanAction(action); },
      }, [
        el('strong', { text: action.label }),
        el('small', { text: `${action.cost}TP` }),
      ]))),
      el('button', { className: 'text-button', text: 'キャンセル', onclick: () => modal.close() }),
    ]);
    modal = openModal({ title: definition?.name ?? 'ブリーダーカード', content });
  }

  openShugyoConfirm(action) {
    const player = this.engine.player(this.humanPlayerId);
    const unit = player.board.find((candidate) => candidate?.id === action.unitId);
    const card = player.hand.find((candidate) => candidate.instanceId === action.cardInstanceId);
    const definition = this.definitionForCard(card);
    const moves = (action.preview?.possibleMoveIds ?? []).map((id) => this.engine.masterIndex.moves.get(id)).filter(Boolean);
    let modal = null;
    const content = el('div', { className: 'shugyo-confirm' }, [
      el('p', { text: `${unit.name}が${definition.name}を行います。習得技は下記候補からランダムに決まります。` }),
      moves.length ? el('ul', { className: 'shugyo-candidate-list' }, moves.map((move) => el('li', {}, [
        el('strong', { text: move.name }),
        el('span', { text: `Rank ${move.rank} / 威力 ${move.power ?? '—'} / ${move.tp}TP` }),
        el('small', { text: move.effect || '追加効果なし' }),
      ]))) : el('p', { className: 'action-hint', text: '新たに覚えられる技はありません。能力上昇のみ発生します。' }),
      el('p', { className: 'shugyo-random-note', text: '各候補の確率差は小さく、Rankが低い技だけわずかに出やすくなります。' }),
      el('div', { className: 'modal-actions' }, [
        el('button', { className: 'text-button', text: 'キャンセル', onclick: () => modal.close() }),
        el('button', {
          className: 'primary-button',
          text: '修行する',
          onclick: () => { modal.close(); this.performHumanAction(action); },
        }),
      ]),
    ]);
    modal = openModal({ title: `${definition.name}：習得候補`, content });
  }

  openFusionChoice(actions) {
    let modal = null;
    const content = el('div', { className: 'fusion-choice' }, [
      el('p', { text: '実行する合体を選んでください。' }),
      ...actions.sort((a, b) => (a.type === 'fusion-special' ? -1 : 1)).map((action) => el('button', {
        className: action.type === 'fusion-special' ? 'primary-button' : 'text-button',
        onclick: () => { modal.close(); this.performHumanAction(action); },
      }, [
        el('strong', { text: action.type === 'fusion-special' ? '特殊合体' : '通常合体' }),
        el('span', { text: `${action.label} / ${action.cost}TP / SP ${action.preview.mainSp}→${action.preview.newSp}` }),
      ])),
      el('button', { className: 'text-button', text: 'キャンセル', onclick: () => modal.close() }),
    ]);
    modal = openModal({ title: '合体方法', content });
  }

  promptShugyoMoveChoice() {
    const actions = this.engine.getLegalActions(this.humanPlayerId)
      .filter((action) => action.type === 'resolve-shugyo-move');
    if (!actions.length) return Promise.resolve(null);
    const incoming = this.engine.masterIndex.moves.get(actions[0].learnedMoveId);
    const unit = this.engine.player(this.humanPlayerId).board.find((candidate) => candidate?.id === actions[0].unitId);
    const moveLine = (move) => `Rank ${move.rank} / 威力 ${move.power ?? '—'} / ${move.tp}TP${move.effect ? ` / ${move.effect}` : ''}`;

    return new Promise((resolve) => {
      let modal = null;
      const choose = (action) => {
        modal.close();
        resolve(action);
      };
      const replaceActions = actions.filter((action) => action.replaceMoveId);
      const keepAction = actions.find((action) => !action.replaceMoveId);
      const content = el('div', { className: 'move-replace-choice' }, [
        el('p', { text: `${unit?.name ?? 'モンスター'}が5個目以降の技を覚えました。実戦で使う4技を決めてください。` }),
        el('section', { className: 'newly-learned-move' }, [
          el('small', { text: 'NEW TECHNIQUE' }),
          el('strong', { text: incoming?.name ?? '新しい技' }),
          incoming ? el('span', { text: moveLine(incoming) }) : null,
        ]),
        el('p', { className: 'move-replace-label', text: '外す実戦技を選ぶ' }),
        el('div', { className: 'move-replace-options' }, replaceActions.map((action) => {
          const current = this.engine.masterIndex.moves.get(action.replaceMoveId);
          return el('button', {
            className: 'move-replace-button',
            onclick: () => choose(action),
          }, [
            el('small', { text: 'この技を外す' }),
            el('strong', { text: current?.name ?? '実戦技' }),
            current ? el('span', { text: moveLine(current) }) : null,
          ]);
        })),
        el('button', {
          className: 'text-button keep-current-moves',
          text: '新技は習得だけにして、現在の実戦4技を維持',
          onclick: () => choose(keepAction),
        }),
      ]);
      modal = openModal({ title: `${incoming?.name ?? '新技'}：実戦4技の入替`, content, dismissible: false });
    });
  }

  beginHandDrag(event, card, definition) {
    if (this.busy || !this.isHumanTurn() || this.selection?.id !== card.instanceId) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    const source = event.currentTarget;
    const start = { x: event.clientX, y: event.clientY };
    let dragging = false;
    let ghost = null;
    let hover = null;

    const clearHover = () => {
      hover?.classList.remove('drop-hover');
      hover = null;
    };
    const cleanup = () => {
      clearHover();
      ghost?.remove();
      source.classList.remove('dragging-source');
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', end);
      window.removeEventListener('pointercancel', cancel);
    };
    const positionGhost = (x, y) => {
      if (!ghost) return;
      ghost.style.left = `${x - ghost.offsetWidth / 2}px`;
      ghost.style.top = `${y - ghost.offsetHeight * 0.62}px`;
    };
    const updateHover = (x, y) => {
      clearHover();
      const target = document.elementFromPoint(x, y);
      hover = target?.closest('.board-slot.drop-valid') ?? target?.closest('.boards.drop-valid-field') ?? null;
      hover?.classList.add('drop-hover');
    };
    const move = (moveEvent) => {
      const distance = Math.hypot(moveEvent.clientX - start.x, moveEvent.clientY - start.y);
      if (!dragging && distance < 8) return;
      moveEvent.preventDefault();
      if (!dragging) {
        dragging = true;
        const rect = source.getBoundingClientRect();
        ghost = source.cloneNode(true);
        ghost.className = `${source.className} drag-ghost`;
        ghost.style.width = `${rect.width}px`;
        ghost.style.height = `${rect.height}px`;
        document.body.append(ghost);
        source.classList.add('dragging-source');
      }
      positionGhost(moveEvent.clientX, moveEvent.clientY);
      updateHover(moveEvent.clientX, moveEvent.clientY);
    };
    const end = (endEvent) => {
      const wasDragging = dragging;
      const intent = wasDragging ? this.dropIntentAt(endEvent.clientX, endEvent.clientY) : null;
      cleanup();
      if (!wasDragging) return;
      endEvent.preventDefault();
      this.suppressCardClickUntil = performance.now() + 450;
      if (!this.resolveHandDrop(card, definition, intent)) this.showInvalidDrop(source);
    };
    const cancel = () => cleanup();

    window.addEventListener('pointermove', move, { passive: false });
    window.addEventListener('pointerup', end, { once: true });
    window.addEventListener('pointercancel', cancel, { once: true });
  }

  dropIntentAt(x, y) {
    const target = document.elementFromPoint(x, y);
    const slot = target?.closest('.board-slot');
    if (slot) {
      return {
        unitId: slot.dataset.unitId ?? null,
        slot: slot.dataset.slot == null ? null : Number(slot.dataset.slot),
        ownerId: slot.dataset.ownerId,
      };
    }
    const field = target?.closest('.boards');
    return field ? { field: true } : null;
  }

  resolveHandDrop(card, definition, intent) {
    if (!intent || this.selection?.id !== card.instanceId) return false;
    let actions = [];
    if (intent.unitId) actions = this.actionsForUnit(intent.unitId);
    if (!actions.length && definition.kind === 'monster' && intent.ownerId === this.humanPlayerId && intent.slot != null) {
      actions = this.actionsForEmptySlot(intent.slot);
    }
    if (!actions.length && (intent.field || intent.unitId || intent.slot != null)) actions = this.untargetedFieldActions();
    if (!actions.length) return false;
    this.dispatchHandActions(actions);
    return true;
  }

  showInvalidDrop(source) {
    source.animate?.([
      { transform: 'translateX(0)' },
      { transform: 'translateX(-5px)' },
      { transform: 'translateX(5px)' },
      { transform: 'translateX(0)' },
    ], { duration: 220, easing: 'ease-out' });
  }

  renderLog(log) {
    return el('section', { className: 'battle-log-panel' }, [
      el('h2', { text: 'バトルログ' }),
      el('ol', { className: 'battle-log', attrs: { 'aria-label': 'バトルログ', 'aria-live': 'polite' } }, log.slice(-18).map((entry) => el('li', { text: `[${entry.round}] ${entry.message}` }))),
    ]);
  }

  captureStats() {
    const units = new Map();
    const players = new Map();
    for (const playerId of this.engine.state.playerOrder) {
      const player = this.engine.player(playerId);
      players.set(playerId, { life: player.life });
      for (const unit of player.board.filter(Boolean)) {
        units.set(unit.id, {
          life: unit.life,
          maxLife: unit.maxLife,
          atk: effectiveAtk(unit),
          def: effectiveDef(unit),
        });
      }
    }
    return { units, players };
  }

  findUnitSlotNode(unitId) {
    return [...this.root.querySelectorAll('.board-slot[data-unit-id]')]
      .find((node) => node.dataset.unitId === unitId) ?? null;
  }

  findPlayerNode(playerId) {
    return [...this.root.querySelectorAll('.fighter-hud[data-player-id]')]
      .find((node) => node.dataset.playerId === playerId) ?? null;
  }

  async animateActionStart(action) {
    const duration = this.speed === 'fast' ? 110 : 480;
    if (action.type === 'move') {
      const source = this.findUnitSlotNode(action.unitId);
      const target = action.targetUnitId ? this.findUnitSlotNode(action.targetUnitId) : this.findPlayerNode(action.targetPlayerId);
      if (!source?.animate) return;
      const sourceRect = source.getBoundingClientRect();
      const targetRect = target?.getBoundingClientRect();
      const dx = targetRect ? Math.max(-68, Math.min(68, (targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2) * .46)) : 0;
      const dy = targetRect ? Math.max(-54, Math.min(54, (targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2) * .46)) : -20;
      const animation = source.animate([
        { transform: 'translate(0,0)' },
        { transform: `translate(${dx}px,${dy}px) scale(1.1)`, offset: .52 },
        { transform: 'translate(0,0)' },
      ], { duration, easing: 'cubic-bezier(.25,.8,.3,1)' });
      await animation.finished.catch(() => {});
      return;
    }
    if (['training', 'shugyo'].includes(action.type)) {
      const target = this.findUnitSlotNode(action.unitId);
      if (!target) return;
      const burst = el('span', { className: `effect-burst ${action.type}`, text: action.type === 'training' ? '鍛' : '修' });
      target.append(burst);
      const animation = target.animate?.([
        { filter: 'brightness(1)', transform: 'scale(1)' },
        { filter: action.type === 'training' ? 'brightness(1.65) sepia(.45)' : 'brightness(1.55) hue-rotate(28deg)', transform: 'scale(1.045)' },
        { filter: 'brightness(1)', transform: 'scale(1)' },
      ], { duration: duration + (this.speed === 'fast' ? 50 : 170), easing: 'ease-out' });
      if (animation) await animation.finished.catch(() => {});
      else await delay(duration);
      burst.remove();
    }
  }

  statChanges(before) {
    const changes = [];
    for (const [unitId, previous] of before.units) {
      const current = this.engine.state.playerOrder
        .flatMap((playerId) => this.engine.player(playerId).board)
        .find((unit) => unit?.id === unitId);
      const now = current ? {
        life: current.life,
        maxLife: current.maxLife,
        atk: effectiveAtk(current),
        def: effectiveDef(current),
      } : { life: 0, maxLife: previous.maxLife, atk: previous.atk, def: previous.def };
      const labels = [];
      for (const [key, label] of [['life', 'LIFE'], ['atk', 'ATK'], ['def', 'DEF']]) {
        const delta = now[key] - previous[key];
        if (delta > 0) labels.push({ direction: 'up', text: `⬆︎ ${label} +${delta}` });
        if (delta < 0) labels.push({ direction: 'down', text: `⬇︎ ${label} ${delta}` });
      }
      if (labels.length) changes.push({ node: this.findUnitSlotNode(unitId), labels });
    }
    for (const [playerId, previous] of before.players) {
      const now = this.engine.player(playerId).life;
      if (now !== previous.life) changes.push({
        node: this.findPlayerNode(playerId),
        labels: [{
          direction: now > previous.life ? 'up' : 'down',
          text: `${now > previous.life ? '⬆︎' : '⬇︎'} LIFE ${now > previous.life ? '+' : ''}${now - previous.life}`,
        }],
      });
    }
    return changes.filter((entry) => entry.node);
  }

  async showStatDirections(before, commitNumbers) {
    const changes = this.statChanges(before);
    if (!changes.length) {
      commitNumbers();
      return;
    }
    const indicators = changes.map(({ node, labels }) => {
      const rect = node.getBoundingClientRect();
      const indicator = el('div', {
        className: `stat-change ${labels.some((entry) => entry.direction === 'down') ? 'down' : 'up'}`,
        attrs: { style: `left:${rect.left + rect.width / 2}px;top:${rect.top + rect.height / 2}px` },
      }, labels.map((entry) => el('span', { className: entry.direction, text: entry.text })));
      document.body.append(indicator);
      return indicator;
    });
    await delay(this.speed === 'fast' ? 45 : 320);
    commitNumbers();
    await delay(this.speed === 'fast' ? 95 : 900);
    indicators.forEach((indicator) => indicator.remove());
  }

  async executeEngineAction(action) {
    const before = this.captureStats();
    const beforeState = action.type.startsWith('fusion-') ? this.engine.getState() : null;
    const hadInteractionSelection = Boolean(this.selection || this.pendingMove);
    this.selection = null;
    this.pendingMove = null;
    if (hadInteractionSelection) this.render();
    await this.animateActionStart(action);
    this.engine.applyAction(action);
    this.emitCheckpoint();
    const fusionModel = beforeState ? createFusionAnimationModel({
      action,
      beforePlayer: beforeState.players[action.playerId ?? beforeState.currentPlayerId],
      afterPlayer: this.engine.player(action.playerId ?? beforeState.currentPlayerId),
      masterIndex: this.engine.masterIndex,
    }) : null;
    let numbersCommitted = false;
    const commitNumbers = () => {
      if (numbersCommitted) return;
      numbersCommitted = true;
      this.render();
    };
    if (fusionModel) await playFusionAnimation({ model: fusionModel, speed: this.speed, onReveal: commitNumbers });
    await this.showStatDirections(before, commitNumbers);
    commitNumbers();
    await this.showLatestEvent();
  }

  async performHumanAction(action) {
    if (this.busy || this.engine.state.currentPlayerId !== this.humanPlayerId) return;
    this.busy = true;
    try {
      await this.executeEngineAction(action);
      while (this.engine.state.pendingMoveChoice?.playerId === this.humanPlayerId) {
        const choice = await this.promptShugyoMoveChoice();
        if (!choice) throw new Error('修行後の実戦技を確定できませんでした');
        await this.executeEngineAction(choice);
      }
      await this.runCpuIfNeeded();
    } catch (error) {
      openModal({ title: '行動できません', content: el('p', { text: error.message }) });
    } finally {
      this.busy = false;
      this.applyQueuedCardSelection();
    }
  }

  async resumePendingHumanChoice() {
    if (this.busy || this.engine.state.pendingMoveChoice?.playerId !== this.humanPlayerId) return;
    this.busy = true;
    try {
      while (this.engine.state.pendingMoveChoice?.playerId === this.humanPlayerId) {
        const choice = await this.promptShugyoMoveChoice();
        if (!choice) throw new Error('修行後の実戦技を確定できませんでした');
        await this.executeEngineAction(choice);
      }
      await this.runCpuIfNeeded();
    } catch (error) {
      openModal({ title: '行動できません', content: el('p', { text: error.message }) });
    } finally {
      this.busy = false;
      this.applyQueuedCardSelection();
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
        await delay(this.speed === 'fast' ? 100 : 600);
        if (this.engine.state.status !== 'active' || this.engine.state.currentPlayerId === this.humanPlayerId) break;
        const playerId = this.engine.state.currentPlayerId;
        const action = await this.chooseCpuAction(this.engine, playerId, this.cpuRng);
        await this.executeEngineAction(action);
        guard += 1;
      }
      if (guard >= 80) throw new Error('CPUの1ターン行動数が安全上限を超えました');
    } catch (error) {
      openModal({ title: 'CPU処理エラー', content: el('p', { text: error.message }) });
    } finally {
      this.cpuRunning = false;
      this.busy = false;
      if (!this.applyQueuedCardSelection()) this.render();
    }
  }

  async showLatestEvent() {
    const event = this.engine.state.log.at(-1);
    if (!event || this.speed === 'fast' && ['draw', 'turn-start', 'turn-end'].includes(event.type)) return;
    if (event.type === 'fusion-unlocked') {
      await playFusionUnlockAnimation({
        playerName: this.engine.player(event.playerId).displayName,
        speed: this.speed,
      });
      return;
    }
    if (event.type.startsWith('fusion-')) return;
    const banner = el('div', { className: 'event-banner', text: event.message });
    document.body.append(banner);
    const major = event.type.startsWith('fusion') || event.type === 'battle-end' || event.type.startsWith('shugyo-move');
    await delay(this.speed === 'fast' ? 130 : major ? 1250 : 850);
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

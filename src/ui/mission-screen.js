import { el, replace } from './dom.js';
import { diamondIcon } from './currency-icon.js';

export const MISSION_GROUPS = Object.freeze({
  daily: Object.freeze({
    label: 'デイリー',
    reset: '毎日 0:00 更新',
    missions: Object.freeze([
      { id: 'daily-login', title: 'ゲームにログインする', description: '毎日0:00以降、その日の初回ログインを完了すると達成です。', current: 1, goal: 1, reward: { kind: 'diamond', amount: 300 }, claimed: true },
      { id: 'daily-play', title: 'バトルを1試合プレイする', description: 'アリーナまたはトーナメントの試合を、勝敗が決まるまでプレイすると達成です。', current: 0, goal: 1, reward: { kind: 'diamond', amount: 100 } },
      { id: 'daily-win', title: 'バトルで1勝する', description: 'アリーナまたはトーナメントで対戦相手に1回勝利すると達成です。', current: 0, goal: 1, reward: { kind: 'diamond', amount: 200 } },
    ]),
  }),
  weekly: Object.freeze({
    label: 'ウィークリー',
    reset: '毎週 月曜 0:00 更新',
    missions: Object.freeze([
      { id: 'weekly-win-3', title: 'バトルで3勝する', description: 'アリーナまたはトーナメントで、週間合計3回勝利すると達成です。', current: 0, goal: 3, reward: { kind: 'card', label: '戦利品カード候補 +1' } },
      { id: 'weekly-win-5', title: 'バトルで5勝する', description: 'アリーナまたはトーナメントで、週間合計5回勝利すると達成です。', current: 0, goal: 5, reward: { kind: 'diamond', amount: 1500 } },
      { id: 'weekly-tournament-2', title: 'トーナメントに2回出場する', description: '異なるトーナメントに週間合計2回エントリーすると達成です。', current: 0, goal: 2, reward: { kind: 'diamond', amount: 1500 } },
    ]),
  }),
});

function rewardContent(reward) {
  if (reward.kind === 'card') return [el('span', { className: 'mission-card-reward', text: 'CARD' }), el('strong', { text: reward.label })];
  return [diamondIcon('mission-diamond'), el('strong', { text: `ダイヤ ${reward.amount.toLocaleString('ja-JP')}` })];
}

export class MissionScreen {
  constructor({ root, onBack, groups = MISSION_GROUPS, initialTab = 'daily' }) {
    this.root = root;
    this.onBack = onBack;
    this.groups = groups;
    this.activeTab = groups[initialTab] ? initialTab : 'daily';
    this.render();
  }

  render() {
    const group = this.groups[this.activeTab];
    const selectTab = (key) => { this.activeTab = key; this.render(); };
    replace(this.root, el('main', { className: 'mission-screen' }, [
      el('header', { className: 'screen-header mission-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'MISSION' }), el('h1', { text: 'ミッション' })]),
        el('button', { className: 'text-button', text: 'ホームへ', onclick: this.onBack }),
      ]),
      el('nav', { className: 'mission-tabs', attrs: { role: 'tablist', 'aria-label': 'ミッション種別' } }, Object.entries(this.groups).map(([key, item]) => el('button', {
        className: key === this.activeTab ? 'is-active' : '', text: item.label, onclick: () => selectTab(key),
        attrs: { role: 'tab', 'aria-selected': String(key === this.activeTab), 'aria-controls': 'mission-list' },
      }, key === this.activeTab ? el('small', { text: item.reset }) : null))),
      el('section', { id: 'mission-list', className: 'mission-list', attrs: { role: 'tabpanel', 'aria-label': group.label } }, [
        el('div', { className: 'mission-list-heading' }, [
          el('div', {}, [el('p', { className: 'eyebrow', text: `${this.activeTab.toUpperCase()} MISSION` }), el('h2', { text: `${group.label}ミッション` })]),
          el('span', { text: group.reset }),
        ]),
        ...group.missions.map((mission) => {
          const complete = mission.current >= mission.goal;
          const progress = Math.min(100, (mission.current / mission.goal) * 100);
          return el('article', { className: `mission-entry${complete ? ' is-complete' : ''}` }, [
            el('div', { className: 'mission-copy' }, [el('h3', { text: mission.title }), el('p', { text: mission.description })]),
            el('div', { className: 'mission-progress-copy' }, [el('strong', { text: `${mission.current} / ${mission.goal}` }), el('span', { text: complete ? '達成済み' : `あと ${mission.goal - mission.current}` })]),
            el('span', { className: 'mission-progress', attrs: { role: 'progressbar', 'aria-valuemin': '0', 'aria-valuemax': String(mission.goal), 'aria-valuenow': String(mission.current) } }, el('i', { style: `width:${progress}%` })),
            el('div', { className: 'mission-reward' }, [el('small', { text: '達成報酬' }), el('span', {}, rewardContent(mission.reward))]),
            el('button', { className: 'mission-state', disabled: true, text: mission.claimed ? '受取済み' : complete ? '受け取る' : '進行中' }),
          ]);
        }),
      ]),
      el('aside', { className: 'mission-stock-note' }, [el('strong', { text: '戦利品ストック' }), el('p', { text: 'ウィークリーミッションで候補を増やせます。アリーナで勝利すると、戦利品カードの候補として保管されます。' })]),
    ]));
  }
}

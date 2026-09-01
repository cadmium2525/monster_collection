import { missionEntries } from '../progression/mission-state.js';
import { el, replace } from './dom.js';
import { diamondIcon } from './currency-icon.js';
import { renderCard } from './card-renderer.js';

export const MISSION_DETAILS = Object.freeze({
  'daily-login': Object.freeze({ title: 'ゲームにログインする', description: '毎日0:00以降、その日の初回ログインを完了すると達成です。' }),
  'daily-play': Object.freeze({ title: 'バトルを1試合プレイする', description: 'アリーナまたはトーナメントの試合を、勝敗が決まるまでプレイすると達成です。' }),
  'daily-win': Object.freeze({ title: 'バトルで1勝する', description: 'アリーナまたはトーナメントで対戦相手に1回勝利すると達成です。' }),
  'weekly-arena-wins': Object.freeze({ title: 'アリーナで3勝する', description: '今週のアリーナで合計3回勝利すると達成です。戦利品ストックからカード1枚を獲得できます。' }),
  'weekly-arena-plays': Object.freeze({ title: 'アリーナを5試合プレイする', description: '今週のアリーナで、勝敗にかかわらず合計5試合を最後までプレイすると達成です。' }),
  'weekly-tournament-entry': Object.freeze({ title: 'トーナメントに2回出場する', description: '今週、トーナメントへ合計2回エントリーすると達成です。' }),
});

const PERIODS = Object.freeze({
  daily: Object.freeze({ label: 'デイリー', reset: '毎日 0:00 更新' }),
  weekly: Object.freeze({ label: 'ウィークリー', reset: '毎週 月曜 0:00 更新' }),
});

function rewardLabel(reward) {
  if (reward.type === 'diamonds') return `ダイヤ ${reward.amount.toLocaleString('ja-JP')}`;
  if (reward.type === 'arena-card') return '戦利品カード ×1';
  return '報酬';
}

export class MissionScreen {
  constructor({ root, economy, masterIndex, onBack, onClaim, initialTab = 'daily' }) {
    this.root = root;
    this.economy = economy;
    this.masterIndex = masterIndex;
    this.onBack = onBack;
    this.onClaim = onClaim;
    this.activeTab = PERIODS[initialTab] ? initialTab : 'daily';
    this.selectedLootId = economy.arenaProgress?.lootStock?.[0]?.lootId ?? null;
    this.render();
  }

  renderMission(mission) {
    const detail = MISSION_DETAILS[mission.id] ?? { title: mission.label, description: mission.label };
    const needsLoot = mission.reward.type === 'arena-card';
    const lootReady = !needsLoot || Boolean(this.selectedLootId);
    const progress = Math.min(100, mission.progress / mission.target * 100);
    return el('article', { className: `mission-entry${mission.completed ? ' is-complete' : ''}${mission.claimable ? ' is-claimable' : ''}${mission.claimed ? ' is-claimed' : ''}` }, [
      el('div', { className: 'mission-copy' }, [el('h3', { text: detail.title }), el('p', { text: detail.description })]),
      el('div', { className: 'mission-progress-copy' }, [
        el('strong', { text: `${mission.progress} / ${mission.target}` }),
        el('span', { text: mission.completed ? '達成済み' : `あと ${mission.target - mission.progress}` }),
      ]),
      el('span', { className: 'mission-progress', attrs: { role: 'progressbar', 'aria-label': `${detail.title}の進捗`, 'aria-valuemin': '0', 'aria-valuemax': String(mission.target), 'aria-valuenow': String(mission.progress) } }, el('i', { style: `width:${progress}%` })),
      el('div', { className: 'mission-reward' }, [
        el('small', { text: '達成報酬' }),
        el('span', {}, [mission.reward.type === 'diamonds' ? diamondIcon('mission-diamond') : el('span', { className: 'mission-card-reward', text: 'CARD' }), el('strong', { text: rewardLabel(mission.reward) })]),
      ]),
      el('button', {
        className: `mission-state${mission.claimable && lootReady ? ' primary-button' : ''}`,
        text: mission.claimed ? '受取済み' : mission.claimable ? (lootReady ? '受け取る' : 'カードを選択') : '進行中',
        disabled: mission.claimed || !mission.claimable || !lootReady,
        onclick: () => this.onClaim?.(mission, needsLoot ? this.selectedLootId : null),
      }),
    ]);
  }

  renderLootStock() {
    const stock = this.economy.arenaProgress?.lootStock ?? [];
    if (!stock.length) return el('p', { className: 'mission-loot-empty', text: '戦利品ストックはまだありません。アリーナで勝利すると候補を保管できます。' });
    return el('div', { className: 'mission-loot-grid' }, stock.map((loot) => {
      const definition = this.masterIndex.cards.get(loot.masterId);
      return el('button', {
        className: `mission-loot-choice${loot.lootId === this.selectedLootId ? ' selected' : ''}`,
        onclick: () => { this.selectedLootId = loot.lootId; this.render(); },
        attrs: { 'aria-label': `${definition?.name ?? loot.masterId}を戦利品に選ぶ` },
      }, [definition ? renderCard({ definition, cardAsset: loot, interactive: false, label: definition.name }) : null, el('span', { text: definition?.name ?? loot.masterId })]);
    }));
  }

  render() {
    const period = PERIODS[this.activeTab];
    const entries = missionEntries(this.economy.missionProgress).filter((mission) => mission.period === this.activeTab);
    const selectTab = (key) => { this.activeTab = key; this.render(); };
    replace(this.root, el('main', { className: 'mission-screen' }, [
      el('header', { className: 'screen-header mission-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'MISSION' }), el('h1', { text: 'ミッション' })]),
        el('button', { className: 'text-button', text: 'ホームへ', onclick: this.onBack }),
      ]),
      el('nav', { className: 'mission-tabs', attrs: { role: 'tablist', 'aria-label': 'ミッション種別' } }, Object.entries(PERIODS).map(([key, item]) => el('button', {
        className: key === this.activeTab ? 'is-active' : '', onclick: () => selectTab(key),
        attrs: { role: 'tab', 'aria-selected': String(key === this.activeTab), 'aria-controls': 'mission-list' },
      }, [el('span', { text: item.label }), key === this.activeTab ? el('small', { text: item.reset }) : null]))),
      el('section', { id: 'mission-list', className: 'mission-list', attrs: { role: 'tabpanel', 'aria-label': period.label } }, [
        el('div', { className: 'mission-list-heading' }, [el('div', {}, [el('p', { className: 'eyebrow', text: `${this.activeTab.toUpperCase()} MISSION` }), el('h2', { text: `${period.label}ミッション` })]), el('span', { text: period.reset })]),
        ...entries.map((mission) => this.renderMission(mission)),
      ]),
      el('section', { className: 'mission-loot-section' }, [
        el('div', { className: 'mission-section-title' }, [el('h2', { text: '戦利品ストック' }), el('small', { text: '週3勝達成後、ここから1枚獲得' })]),
        this.renderLootStock(),
      ]),
    ]));
  }
}

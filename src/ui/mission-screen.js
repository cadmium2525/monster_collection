import { missionEntries } from '../progression/mission-state.js';
import { el, replace } from './dom.js';
import { diamondIcon } from './currency-icon.js';
import { renderCard } from './card-renderer.js';

function rewardLabel(reward) {
  if (reward.type === 'diamonds') return `ダイヤ ${reward.amount.toLocaleString('ja-JP')}`;
  if (reward.type === 'arena-card') return '戦利品カード ×1';
  return '報酬';
}

export class MissionScreen {
  constructor({ root, economy, masterIndex, onBack, onClaim }) {
    this.root = root;
    this.economy = economy;
    this.masterIndex = masterIndex;
    this.onBack = onBack;
    this.onClaim = onClaim;
    this.selectedLootId = economy.arenaProgress?.lootStock?.[0]?.lootId ?? null;
    this.render();
  }

  renderMission(mission) {
    const needsLoot = mission.reward.type === 'arena-card';
    const lootReady = !needsLoot || Boolean(this.selectedLootId);
    return el('article', { className: `mission-card${mission.claimable ? ' is-claimable' : ''}${mission.claimed ? ' is-claimed' : ''}` }, [
      el('div', { className: 'mission-card-copy' }, [
        el('strong', { text: mission.label }),
        el('span', { text: `${mission.progress} / ${mission.target}` }),
        el('div', { className: 'mission-progress-track' }, el('i', { style: `width:${Math.min(100, mission.progress / mission.target * 100)}%` })),
      ]),
      el('div', { className: 'mission-reward-copy' }, [
        mission.reward.type === 'diamonds' ? diamondIcon('mission-diamond') : el('span', { className: 'mission-card-reward-icon', text: 'CARD' }),
        el('b', { text: rewardLabel(mission.reward) }),
      ]),
      el('button', {
        className: mission.claimable ? 'primary-button' : 'text-button',
        text: mission.claimed ? '受取済み' : mission.claimable ? '受け取る' : '進行中',
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
      }, [
        definition ? renderCard({ definition, cardAsset: loot, interactive: false, label: definition.name }) : null,
        el('span', { text: definition?.name ?? loot.masterId }),
      ]);
    }));
  }

  render() {
    const entries = missionEntries(this.economy.missionProgress);
    const daily = entries.filter((mission) => mission.period === 'daily');
    const weekly = entries.filter((mission) => mission.period === 'weekly');
    replace(this.root, el('main', { className: 'mission-screen' }, [
      el('header', { className: 'screen-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'MISSION' }), el('h1', { text: 'ミッション' })]),
        el('button', { className: 'text-button', text: 'ホームへ', onclick: this.onBack }),
      ]),
      el('div', { className: 'mission-columns' }, [
        el('section', { className: 'mission-section' }, [
          el('div', { className: 'mission-section-title' }, [el('h2', { text: 'デイリー' }), el('small', { text: '毎日 0:00 更新' })]),
          ...daily.map((mission) => this.renderMission(mission)),
        ]),
        el('section', { className: 'mission-section' }, [
          el('div', { className: 'mission-section-title' }, [el('h2', { text: 'ウィークリー' }), el('small', { text: '毎週 月曜 0:00 更新' })]),
          ...weekly.map((mission) => this.renderMission(mission)),
        ]),
      ]),
      el('section', { className: 'mission-loot-section' }, [
        el('div', { className: 'mission-section-title' }, [el('h2', { text: '戦利品ストック' }), el('small', { text: '週3勝達成後、ここから1枚獲得' })]),
        this.renderLootStock(),
      ]),
    ]));
  }
}

import { RULES } from '../../battle/rules.js';
import { normalizeSurvivalProgress, survivalRewardForStreak } from '../../survival/SurvivalReward.js';
import { el, replace } from '../dom.js';
import { renderCard } from '../card-renderer.js';
import { openModal } from '../modal.js';
import { playerIconContent } from '../player-icon.js';
import { representativeCardAsset } from '../representative-card.js';

function growthTotal(growth = {}) {
  return Object.values(growth).reduce((sum, entry) => sum
    + Math.max(0, Number(entry?.life) || 0)
    + Math.max(0, Number(entry?.atk) || 0)
    + Math.max(0, Number(entry?.def) || 0), 0);
}

function difficultyLabel(opponent) {
  const level = String(opponent?.aiLevel ?? 'legend').toUpperCase();
  const rounds = Math.max(0, Number(opponent?.difficulty?.virtualGrowthRounds) || 0);
  return rounds ? `${level}・育成${rounds}戦相当` : `${level} AI`;
}

function rankingRow(entry, masterIndex) {
  const representative = masterIndex.monsters.get(entry.representativeMonsterId);
  return el('article', { className: `survival-ranking-row${entry.isSelf ? ' is-self' : ''}${entry.position <= 3 ? ` is-top-${entry.position}` : ''}` }, [
    el('strong', { className: 'survival-ranking-position', text: String(entry.position || '—') }),
    el('span', { className: 'survival-ranking-avatar' }, playerIconContent({
      user: { displayName: entry.ownerDisplayName, playerIconMasterId: entry.playerIconMasterId },
      catalog: { ownedCardMasterIds: entry.playerIconMasterId ? [entry.playerIconMasterId] : [] },
      masterIndex,
    })),
    el('span', { className: 'survival-ranking-player' }, [
      el('strong', { text: entry.ownerDisplayName ?? '名無しブリーダー' }),
      el('small', { text: entry.isSelf ? 'YOU' : `${Number(entry.totalRuns) || 0} RUNS` }),
    ]),
    representative ? el('span', { className: 'survival-ranking-monster', text: representative.name }) : null,
    el('span', { className: 'survival-ranking-streak' }, [el('strong', { text: String(entry.bestStreak ?? 0) }), el('small', { text: 'STREAK' })]),
  ]);
}

export function openSurvivalRankingModal({ leaderboard, masterIndex }) {
  let mode = 'top';
  const content = el('div', { className: 'survival-ranking-board' });
  const render = () => {
    const rows = mode === 'nearby' ? leaderboard.nearby : leaderboard.top;
    replace(content, el('div', { className: 'survival-ranking-board-inner' }, [
      el('div', { className: 'survival-ranking-summary' }, [
        el('span', {}, [el('small', { text: 'YOUR POSITION' }), el('strong', { text: leaderboard.selfRank ? `${leaderboard.selfRank}位` : '未参加' })]),
        el('span', {}, [el('small', { text: 'SURVIVORS' }), el('strong', { text: `${Number(leaderboard.total) || 0}人` })]),
      ]),
      !leaderboard.available ? el('p', { className: 'survival-ranking-empty', text: 'オンライン接続時にランキングを表示できます。' }) : null,
      leaderboard.available ? el('div', { className: 'survival-ranking-tabs' }, [
        el('button', { className: mode === 'top' ? 'selected' : '', text: 'TOP 50', onclick: () => { mode = 'top'; render(); } }),
        el('button', { className: mode === 'nearby' ? 'selected' : '', text: '自分周辺', disabled: !leaderboard.nearby?.length, onclick: () => { mode = 'nearby'; render(); } }),
      ]) : null,
      leaderboard.available && rows?.length
        ? el('div', { className: 'survival-ranking-list' }, rows.map((entry) => rankingRow(entry, masterIndex)))
        : leaderboard.available ? el('p', { className: 'survival-ranking-empty', text: 'まだ記録はありません。' }) : null,
    ]));
  };
  render();
  return openModal({ title: 'サバイバルランキング', content, className: 'survival-ranking-modal' });
}

export class SurvivalScreen {
  constructor({ root, collection, masterIndex, progress, run = null, leaderboard = null, leaderboardLoading = false, onBack, onStart, onStartBattle, onOpenRanking }) {
    this.root = root;
    this.collection = collection;
    this.masterIndex = masterIndex;
    this.progress = normalizeSurvivalProgress(progress);
    this.run = run;
    this.leaderboard = leaderboard;
    this.leaderboardLoading = leaderboardLoading;
    this.onBack = onBack;
    this.onStart = onStart;
    this.onStartBattle = onStartBattle;
    this.onOpenRanking = onOpenRanking;
    this.selectedDeckId = collection.list()[0]?.deckId ?? null;
    this.render();
  }

  setLeaderboard(leaderboard, loading = false) {
    this.leaderboard = leaderboard;
    this.leaderboardLoading = loading;
    this.render();
  }

  renderHeader() {
    return el('header', { className: 'screen-header survival-header' }, [
      el('div', {}, [el('p', { className: 'eyebrow', text: 'ENDLESS DECK TRIAL' }), el('h1', { text: 'サバイバル' })]),
      el('div', { className: 'survival-header-record' }, [
        el('span', {}, [el('small', { text: 'BEST STREAK' }), el('strong', { text: String(this.progress.bestStreak) })]),
        el('span', {}, [el('small', { text: 'TOTAL RUNS' }), el('strong', { text: String(this.progress.totalRuns) })]),
      ]),
      el('div', { className: 'survival-header-actions' }, [
        el('button', { className: 'text-button survival-ranking-button', text: this.leaderboardLoading ? '集計中…' : this.leaderboard?.selfRank ? `ランキング ${this.leaderboard.selfRank}位` : 'ランキング', disabled: this.leaderboardLoading, onclick: this.onOpenRanking }),
        el('button', { className: 'text-button', text: 'ホームへ', onclick: this.onBack }),
      ]),
    ]);
  }

  renderDeckSelection() {
    const decks = this.collection.list();
    const selected = this.selectedDeckId ? this.collection.get(this.selectedDeckId) : null;
    return el('section', { className: 'survival-entry-layout' }, [
      el('section', { className: 'survival-intro-panel' }, [
        el('p', { className: 'eyebrow', text: 'BUILD. ENDURE. ASCEND.' }),
        el('h2', { text: '完成した40枚の、その先へ。' }),
        el('p', { text: 'トーナメントやアリーナで作り上げた保存デッキでCPUと連戦。Trainingと修行の成長、残りプレイヤーLIFEを引き継ぎます。' }),
        el('div', { className: 'survival-rule-chips' }, [
          el('span', { text: '1戦目 SILVER' }), el('span', { text: '3戦目〜 LEGEND' }),
          el('span', { text: '5勝ごと LIFE全回復' }), el('span', { text: 'カード奪取なし' }),
        ]),
        el('div', { className: 'survival-reward-preview' }, [
          el('strong', { text: '到達報酬' }),
          ...[1, 3, 5, 10].map((streak) => {
            const reward = survivalRewardForStreak(streak, streak);
            return el('span', {}, [el('b', { text: `${streak}勝` }), el('small', { text: `${reward.baseDiamonds.toLocaleString('ja-JP')}ダイヤ${reward.packCredits ? ` ＋ パック券${reward.packCredits}` : ''}` })]);
          }),
        ]),
      ]),
      el('section', { className: 'survival-deck-panel' }, [
        el('div', { className: 'section-title' }, [el('span', { className: 'step-number', text: '1' }), el('div', {}, [el('h2', { text: '挑戦デッキを選択' }), el('p', { text: '開始時の40枚をラン終了まで固定します。' })])]),
        el('div', { className: 'survival-deck-list' }, decks.map((deck) => {
          const representative = this.masterIndex.monsters.get(deck.representativeMonsterId);
          return el('button', {
            className: `survival-deck-choice${deck.deckId === this.selectedDeckId ? ' selected' : ''}`,
            onclick: () => { this.selectedDeckId = deck.deckId; this.render(); },
          }, [
            representative ? renderCard({ definition: representative, cardAsset: representativeCardAsset(deck.cards, representative.id), interactive: false, label: representative.name }) : null,
            el('span', {}, [el('strong', { text: deck.deckName }), el('small', { text: `総TP ${deck.totalPlayTp} ／ ${representative?.name ?? '代表未設定'}` })]),
          ]);
        })),
        el('button', { className: 'primary-button survival-start-button', text: 'サバイバルランを開始', disabled: !selected, onclick: () => this.onStart?.(selected) }),
      ]),
    ]);
  }

  renderRun() {
    const state = this.run.state;
    const opponent = this.run.getCurrentOpponent();
    const representative = this.masterIndex.monsters.get(opponent?.representativeMonsterId);
    const lifeRate = Math.max(0, Math.min(100, state.carriedPlayerLife / RULES.playerLife * 100));
    const nextRecovery = Math.ceil((state.currentStreak + 1) / 5) * 5;
    return el('section', { className: 'survival-run-layout' }, [
      el('section', { className: 'survival-streak-panel' }, [
        el('p', { className: 'eyebrow', text: 'CURRENT RUN' }),
        el('div', { className: 'survival-streak-number' }, [el('strong', { text: String(state.currentStreak) }), el('span', { text: '連勝' })]),
        el('div', { className: 'survival-life-copy' }, [
          el('span', {}, [el('small', { text: 'PLAYER LIFE' }), el('strong', { text: `${state.carriedPlayerLife} / ${RULES.playerLife}` })]),
          el('div', { className: 'survival-life-track' }, el('i', { style: `width:${lifeRate}%` })),
          el('small', { text: `${nextRecovery}勝到達後に全回復` }),
        ]),
        el('div', { className: 'survival-growth-copy' }, [
          el('small', { text: 'CARRY OVER GROWTH' }),
          el('strong', { text: `累積 +${growthTotal(state.carryOverGrowth)}` }),
          el('span', { text: 'Training・修行・習得技を継続中' }),
        ]),
      ]),
      el('section', { className: 'survival-next-panel' }, [
        el('div', { className: 'survival-next-heading' }, [
          el('span', {}, [el('small', { text: `NEXT BATTLE ${state.currentStreak + 1}` }), el('strong', { text: opponent?.displayName ?? '対戦者' })]),
          el('b', { text: difficultyLabel(opponent) }),
        ]),
        el('div', { className: 'survival-opponent-card' }, [
          representative ? renderCard({ definition: representative, cardAsset: opponent?.cards?.find((card) => card.masterId === representative.id), interactive: false, label: representative.name }) : null,
          el('div', {}, [
            el('p', { className: 'eyebrow', text: opponent?.theme ?? 'MIXED' }),
            el('h2', { text: opponent?.deckName ?? 'CPUデッキ' }),
            el('p', { text: representative ? `代表 ${representative.name}` : '代表モンスター未設定' }),
            el('small', { text: opponent?.difficulty?.virtualGrowthRounds ? `仮想育成 ${opponent.difficulty.virtualGrowthRounds}戦分を反映` : '基礎デッキで参戦' }),
          ]),
        ]),
        el('button', { className: 'primary-button survival-battle-button', text: `第${state.currentStreak + 1}戦を開始`, onclick: this.onStartBattle }),
      ]),
    ]);
  }

  render() {
    replace(this.root, el('main', { className: 'survival-screen' }, [
      this.renderHeader(),
      this.run ? this.renderRun() : this.renderDeckSelection(),
    ]));
  }
}

export class SurvivalResultScreen {
  constructor({ root, result, progressBefore, progressAfter, reward, onFinish }) {
    this.root = root;
    const streak = Math.max(0, Number(result?.streak) || 0);
    const newBest = progressAfter.bestStreak > progressBefore.bestStreak;
    replace(root, el('main', { className: `survival-result-screen${newBest ? ' is-new-best' : ''}` }, [
      el('section', { className: 'survival-result-panel' }, [
        el('p', { className: 'eyebrow', text: result?.retired ? 'RUN COMPLETE' : result?.draw ? 'DRAW — RUN COMPLETE' : 'SURVIVAL RESULT' }),
        el('h1', { text: newBest ? 'NEW RECORD' : result?.retired ? '撤退完了' : '連戦終了' }),
        el('div', { className: 'survival-result-streak' }, [el('strong', { text: String(streak) }), el('span', { text: '連勝' })]),
        newBest ? el('p', { className: 'survival-new-record-copy', text: `自己ベストを${progressBefore.bestStreak}勝から更新しました。` }) : null,
        el('div', { className: 'survival-result-rewards' }, [
          el('span', {}, [el('small', { text: 'STREAK REWARD' }), el('strong', { text: `${reward.baseDiamonds.toLocaleString('ja-JP')} ダイヤ` })]),
          reward.bestBonusDiamonds ? el('span', {}, [el('small', { text: 'NEW BEST BONUS' }), el('strong', { text: `+${reward.bestBonusDiamonds.toLocaleString('ja-JP')} ダイヤ` })]) : null,
          el('span', {}, [el('small', { text: 'PACK TICKET' }), el('strong', { text: `${reward.packCredits} 枚` })]),
        ]),
        el('button', { className: 'primary-button', text: 'サバイバルへ戻る', onclick: onFinish }),
      ]),
    ]));
  }
}

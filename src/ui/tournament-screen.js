import { TOURNAMENT_LABELS } from '../battle/rules.js';
import { summarizeCpuTournamentGrowth } from '../tournament/cpu-growth.js';
import { ROUND_LABELS } from '../tournament/TournamentRun.js';
import { el, replace } from './dom.js';

function entrantName(bracket, entrantId) {
  return entrantId ? bracket.entrants[entrantId]?.displayName ?? '未定' : '未定';
}

function opponentDeckDescription(opponent) {
  if (opponent.type === 'champion') return '現チャンピオン40枚';
  if (opponent.type === 'challenger') return '他プレイヤーが育てた保存40枚';
  return `${opponent.theme}テーマ`;
}

function opponentGrowthDescription(opponent) {
  const growth = summarizeCpuTournamentGrowth(opponent);
  if (!growth.wins) return null;
  return `勝ち上がり育成 ${growth.wins}戦分・能力+${growth.statGain}${growth.learnedMoves ? `・新技${growth.learnedMoves}` : ''}`;
}

function matchView(bracket, match, currentMatchId) {
  const classes = [
    'bracket-match',
    match.id === currentMatchId ? 'current' : '',
    match.status === 'resolved' ? 'resolved' : '',
    match.resultHidden ? 'awaiting-result' : '',
  ].filter(Boolean).join(' ');
  return el('article', { className: classes }, [...match.entrants.map((id) => el('div', {
    className: `bracket-entrant ${match.winnerId && match.winnerId === id ? 'winner' : ''} ${id === 'player' ? 'is-player' : ''}`,
  }, [
    el('span', { text: entrantName(bracket, id) }),
    match.winnerId && match.winnerId === id ? el('b', { text: 'WIN' }) : null,
  ])), match.resultHidden ? el('small', { className: 'bracket-pending-copy', text: '対戦中' }) : null]);
}

export class TournamentScreen {
  constructor({ root, tournament, onStartMatch, onLeave }) {
    this.root = root;
    this.tournament = tournament;
    this.onStartMatch = onStartMatch;
    this.onLeave = onLeave;
    this.render();
  }

  render() {
    const bracket = this.tournament.getBracket();
    const currentMatch = this.tournament.getCurrentMatch();
    const opponent = this.tournament.getCurrentOpponent();
    const growthDescription = opponent ? opponentGrowthDescription(opponent) : null;
    const rank = this.tournament.state.rank;
    const screen = el('main', { className: `tournament-screen rank-${rank}` }, [
      el('header', { className: 'screen-header' }, [
        el('div', {}, [
          el('p', { className: 'eyebrow', text: '16 MONSTER MASTERS' }),
          el('h1', { text: TOURNAMENT_LABELS[rank] }),
        ]),
        el('div', { className: 'tournament-progress' }, ROUND_LABELS.map((label, index) => el('span', {
          className: index < this.tournament.state.roundIndex ? 'done' : index === this.tournament.state.roundIndex ? 'active' : '',
          text: label,
        }))),
      ]),
      el('section', { className: 'bracket-grid', attrs: { 'aria-label': '16人トーナメント表' } }, ROUND_LABELS.map((label, roundIndex) => el('section', { className: 'bracket-round' }, [
        el('h2', { text: label }),
        el('div', { className: 'bracket-matches' }, (bracket.rounds[roundIndex] ?? Array.from({ length: 8 / 2 ** roundIndex }, (_, index) => ({
          id: `future-${roundIndex}-${index}`, entrants: [null, null], status: 'future', winnerId: null,
        }))).map((match) => matchView(bracket, match, currentMatch?.id))),
      ]))),
      el('footer', { className: 'match-callout' }, this.tournament.state.status === 'active' ? [
        el('div', {}, [
          el('span', { className: 'eyebrow', text: `${ROUND_LABELS[this.tournament.state.roundIndex]} / ${this.tournament.getCurrentAiLevel().toUpperCase()} AI` }),
          el('h2', { text: `VS ${opponent.displayName}` }),
          el('p', { text: `${opponent.deckName}・${opponentDeckDescription(opponent)}` }),
          growthDescription ? el('p', { className: 'opponent-growth-copy', text: growthDescription }) : null,
        ]),
        el('button', { className: 'primary-button', text: '対戦へ', onclick: () => this.onStartMatch?.(opponent) }),
      ] : [
        el('div', {}, [
          el('h2', { text: this.tournament.state.status === 'eliminated' ? '大会敗退' : this.tournament.state.status === 'champion' ? '新チャンピオン' : '大会優勝' }),
          el('p', { text: '確定済みのカード交換は40枚デッキへ保存されます。大会内育成値はここで終了します。' }),
        ]),
        el('button', { className: 'primary-button', text: 'ホームへ', onclick: () => this.onLeave?.() }),
      ]),
    ]);
    replace(this.root, screen);
  }
}

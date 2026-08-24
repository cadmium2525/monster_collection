import { TOURNAMENT_LABELS } from '../battle/rules.js';
import { representativeMonster } from '../battle/deck.js';
import { el, formatDate, replace } from './dom.js';
import { renderCard } from './card-renderer.js';
import { openModal } from './modal.js';

function howToPlayContent() {
  return el('div', { className: 'how-to-play' }, [
    el('p', { text: '大会で4試合を勝ち抜き、勝つたびに相手の40枚から最大2枚を奪います。交換後もデッキは必ず40枚です。' }),
    el('ol', {}, [
      el('li', { text: '手札のモンスターを召喚。召喚したターンは行動できません。' }),
      el('li', { text: '盤上モンスターをタップし、内包する実戦技を選んで攻撃します。距離・移動はありません。' }),
      el('li', { text: 'Training・修行で大会中だけ育成。通常/特殊合体は先攻6T・後攻5Tからです。' }),
      el('li', { text: '相手盤面が空ならプレイヤーへ直接攻撃。LIFEを0にすれば勝利です。' }),
      el('li', { text: '敗退しても確定済みの交換カードは保存。優勝したデッキだけ次大会へ進めます。' }),
    ]),
    el('p', { className: 'legacy-note', text: '旧資料の遠・中・近距離システムはユーザー要望により廃止されています。' }),
    el('p', { className: 'legacy-note', text: 'アプリとして遊ぶ場合は「アプリに追加」を使用します。iPhone/iPadはSafariの共有メニューから「ホーム画面に追加」を選んでください。' }),
  ]);
}

export class HomeScreen {
  constructor({ root, masterIndex, user, champion, repositoryStatus, decks, seed, onTournament, onDecks, onRename, installAvailable = false, onInstall = null }) {
    this.root = root;
    this.masterIndex = masterIndex;
    this.user = user;
    this.champion = champion;
    this.repositoryStatus = repositoryStatus;
    this.decks = decks;
    this.seed = seed;
    this.onTournament = onTournament;
    this.onDecks = onDecks;
    this.onRename = onRename;
    this.installAvailable = installAvailable;
    this.onInstall = onInstall;
    this.render();
  }

  renderChampion() {
    const champion = this.champion;
    const cards = champion?.championDeckSnapshot ?? champion?.cards ?? [];
    const representative = champion?.representativeMonsterId
      ? this.masterIndex.monsters.get(champion.representativeMonsterId)
      : cards.length ? representativeMonster(cards, this.masterIndex) : this.masterIndex.monsters.get('monster-004');
    return el('section', { className: 'champion-panel' }, [
      el('div', { className: 'champion-crown', text: '♛', attrs: { 'aria-hidden': 'true' } }),
      el('div', { className: 'champion-art' }, representative ? renderCard({ definition: representative, label: '現チャンピオンの代表モンスター', interactive: false }) : el('div', { className: 'champion-placeholder', text: '?' })),
      el('div', { className: 'champion-copy' }, [
        el('p', { className: 'eyebrow', text: 'CURRENT LEGEND CHAMPION' }),
        el('h2', { text: champion?.championDisplayName ?? champion?.displayName ?? '初代王者 アルカナ' }),
        el('strong', { text: champion?.championDeckName ?? champion?.deckName ?? '王座の原型' }),
        el('p', { text: representative ? `代表 ${representative.name}` : '代表モンスター未登録' }),
        el('small', { text: champion?.crownedAt ? `戴冠 ${formatDate(champion.crownedAt)} / 防衛 ${champion.defenseCount ?? 0}` : '王座データ未登録・初期王者' }),
      ]),
      el('div', { className: 'champion-version', text: `VERSION ${champion?.championVersion ?? 0}` }),
    ]);
  }

  render() {
    const highest = this.decks.reduce((best, deck) => {
      const order = ['bronze', 'silver', 'gold', 'legend'];
      return order.indexOf(deck.qualification) > order.indexOf(best) ? deck.qualification : best;
    }, 'bronze');
    replace(this.root, el('main', { className: 'home-screen' }, [
      el('header', { className: 'home-header' }, [
        el('div', { className: 'game-title' }, [
          el('div', { className: 'brand-mark', text: 'MC' }),
          el('div', {}, [el('p', { className: 'eyebrow', text: 'BUILD YOUR ETERNAL FORTY' }), el('h1', { text: 'モンスターコンストラクション' }), el('p', { text: '戦い、奪い、自分だけの最強40枚へ。' })]),
        ]),
        el('div', { className: 'profile-chip' }, [
          el('span', { text: this.repositoryStatus.mode === 'firebase' ? '● ONLINE' : '○ LOCAL' }),
          el('strong', { text: this.user.displayName }),
          el('div', { className: 'profile-actions' }, [
            el('button', { className: 'utility-button', text: '名前変更', onclick: this.onRename }),
            this.installAvailable ? el('button', { className: 'utility-button install-button', text: 'アプリに追加', onclick: this.onInstall }) : null,
          ]),
        ]),
      ]),
      el('section', { className: 'home-main' }, [
        this.renderChampion(),
        el('section', { className: 'home-actions' }, [
          el('button', { className: 'home-primary-action', onclick: this.onTournament }, [
            el('span', { className: 'eyebrow', text: 'TOURNAMENT' }),
            el('strong', { text: '大会へ挑戦' }),
            el('small', { text: `${TOURNAMENT_LABELS[highest]}まで出場可能` }),
          ]),
          el('button', { className: 'home-action', onclick: this.onDecks }, [
            el('span', { text: '40' }),
            el('div', {}, [el('strong', { text: '保存デッキ' }), el('small', { text: `${this.decks.length}/5 デッキ` })]),
          ]),
          el('button', { className: 'home-action', onclick: () => openModal({ title: '遊び方', content: howToPlayContent() }) }, [
            el('span', { text: '?' }),
            el('div', {}, [el('strong', { text: '遊び方' }), el('small', { text: '距離廃止版ルール' })]),
          ]),
        ]),
      ]),
      el('footer', { className: 'home-footer' }, [
        el('span', { text: `保存: ${this.repositoryStatus.mode === 'firebase' ? 'Firebase + local backup' : 'このブラウザ'}` }),
        this.repositoryStatus.error ? el('span', { className: 'invalid-copy', text: `同期注意: ${this.repositoryStatus.error}` }) : null,
        el('span', { text: `Debug seed: ${this.seed}` }),
        el('span', { text: 'Sim8.7 / Distance-free amendment' }),
      ]),
    ]));
  }
}

import { TOURNAMENT_LABELS } from '../battle/rules.js';
import { representativeMonster } from '../battle/deck.js';
import { el, formatDate, replace } from './dom.js';
import { renderMonsterPortrait } from './card-renderer.js';
import { openModal } from './modal.js';

export const TUTORIAL_STEPS = Object.freeze([
  {
    title: '勝利と40枚デッキ',
    copy: '相手プレイヤーのLIFEを0にすれば勝利です。勝つたびに相手のカードを奪い、自分の40枚を強くします。',
    tokens: [['100', '自分LIFE'], ['VS', '相手を倒す'], ['40', 'デッキ固定']],
    tip: 'まずはブロンズカップの4試合制覇を目指しましょう。',
  },
  {
    title: 'カードを場へ出す',
    copy: '手札を1回タップして選択し、そのまま空いている自分の枠へスワイプすると召喚します。',
    tokens: [['①', '手札をタップ'], ['⇧', '空き枠へ'], ['召', '召喚']],
    tip: '召喚したターンのモンスターは行動できません。',
  },
  {
    title: '技を選んで攻撃',
    copy: '場の自分モンスターをタップし、詳細にある実戦技を選択して、光った相手をタップします。',
    tokens: [['獣', '場のカード'], ['技', '実戦技'], ['⚔', '対象をタップ']],
    tip: '相手の場が空なら、相手プレイヤーを直接攻撃できます。',
  },
  {
    title: 'Trainingと修行',
    copy: 'Training・修行カードは、強くしたい場のモンスターへスワイプします。修行では技も覚えます。',
    tokens: [['鍛', '能力+5'], ['修', '能力と技'], ['↗', '大会内で持越し']],
    tip: '成長は同じ大会の次試合へ引き継ぎ、大会終了時に元へ戻ります。手札にも強化後の数値が表示されます。',
  },
  {
    title: '合体で手札を戦力へ',
    copy: '合体解禁後、手札のモンスターを場のモンスターへスワイプします。通常合体は1TP、特殊合体は2TPです。',
    tokens: [['場', 'メイン'], ['＋', '手札素材'], ['合', '必ずSP上昇']],
    tip: '先攻6ターン目・後攻5ターン目から解禁。合体後も行動権は回復しません。',
  },
  {
    title: 'ターンとTP',
    copy: 'カードや技にはTPが必要です。使える行動がなければターン終了し、次の自分ターンでTPが戻ります。',
    tokens: [['TP', '最大10'], ['②', '必要コスト'], ['▶', 'ターン終了']],
    tip: '先攻の第1ターンだけ通常ドローがありません。手札は最大8枚です。',
  },
  {
    title: '勝利後にカードを奪う',
    copy: '相手の40枚から提示された5枚を見て、最大2枚を選び、同じ枚数だけ自分のカードと交換します。',
    tokens: [['5', '候補を見る'], ['2', '最大獲得'], ['40', '必ず維持']],
    tip: '敗退しても確定した交換は保存されます。優勝したデッキだけ次大会へ進めます。',
  },
]);

function openTutorial(onTournament) {
  let stepIndex = 0;
  const body = el('div', { className: 'tutorial-player' });
  const tutorial = openModal({ title: '', content: body, className: 'tutorial-modal' });
  const renderStep = () => {
    const step = TUTORIAL_STEPS[stepIndex];
    tutorial.modal.querySelector('.modal-header h2').textContent = `チュートリアル ${stepIndex + 1}/${TUTORIAL_STEPS.length}`;
    replace(body,
      el('div', { className: 'tutorial-progress', attrs: { 'aria-label': `${stepIndex + 1}/${TUTORIAL_STEPS.length}` } }, TUTORIAL_STEPS.map((_, index) => el('i', { className: index <= stepIndex ? 'active' : '' }))),
      el('section', { className: 'tutorial-copy' }, [
        el('p', { className: 'eyebrow', text: `STEP ${stepIndex + 1}` }),
        el('h3', { text: step.title }),
        el('p', { text: step.copy }),
      ]),
      el('div', { className: 'tutorial-visual' }, step.tokens.map(([mark, label]) => el('div', {}, [
        el('strong', { text: mark }),
        el('span', { text: label }),
      ]))),
      el('p', { className: 'tutorial-tip', text: step.tip }),
      el('div', { className: 'tutorial-actions' }, [
        stepIndex > 0 ? el('button', { className: 'text-button', text: '戻る', onclick: () => { stepIndex -= 1; renderStep(); } }) : el('span'),
        stepIndex < TUTORIAL_STEPS.length - 1
          ? el('button', { className: 'primary-button', text: '次へ', onclick: () => { stepIndex += 1; renderStep(); } })
          : el('button', { className: 'primary-button', text: '大会選択へ', onclick: () => { tutorial.close(); onTournament?.(); } }),
      ]),
    );
  };
  renderStep();
}

function howToPlayContent(onTutorial) {
  return el('div', { className: 'how-to-play' }, [
    el('p', { text: '大会で4試合を勝ち抜き、勝つたびに相手の40枚から最大2枚を奪います。交換後もデッキは必ず40枚です。' }),
    el('ol', {}, [
      el('li', { text: '手札をタップして選択し、モンスターは空き枠へ、育成カードは対象モンスターへスワイプします。' }),
      el('li', { text: '盤上モンスターをタップし、詳細内の実戦技を選び、光った攻撃対象をタップします。' }),
      el('li', { text: '修行は候補一覧を確認してから実行し、覚える技はランダムです。通常/特殊合体は先攻6T・後攻5Tからです。' }),
      el('li', { text: 'Training・修行の成長は同じ大会の次試合へ引き継ぎ、大会終了時に元へ戻ります。' }),
      el('li', { text: '相手盤面が空ならプレイヤーへ直接攻撃。LIFEを0にすれば勝利です。' }),
      el('li', { text: '敗退しても確定済みの交換カードは保存。優勝したデッキだけ次大会へ進めます。' }),
    ]),
    el('button', { className: 'primary-button tutorial-start', text: '7ステップのチュートリアルを始める', onclick: onTutorial }),
    el('p', { className: 'legacy-note', text: 'アプリとして遊ぶ場合は「アプリに追加」を使用します。iPhone/iPadはSafariの共有メニューから「ホーム画面に追加」を選んでください。' }),
  ]);
}

function openHowToPlay(onTournament) {
  let help = null;
  const content = howToPlayContent(() => {
    help.close();
    openTutorial(onTournament);
  });
  help = openModal({ title: '遊び方', content });
}

export function homeFooterMode({ debugMode = false, syncError = null } = {}) {
  if (syncError) return 'warning';
  return debugMode ? 'debug' : 'hidden';
}

export class HomeScreen {
  constructor({ root, masterIndex, user, champion, repositoryStatus, decks, seed, debugMode = false, onTournament, onDecks, onRename, installAvailable = false, onInstall = null }) {
    this.root = root;
    this.masterIndex = masterIndex;
    this.user = user;
    this.champion = champion;
    this.repositoryStatus = repositoryStatus;
    this.decks = decks;
    this.seed = seed;
    this.debugMode = debugMode;
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
      el('div', { className: 'champion-art' }, representative ? renderMonsterPortrait(representative, '現チャンピオンの代表モンスター') : el('div', { className: 'champion-placeholder', text: '?' })),
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
    const footerMode = homeFooterMode({ debugMode: this.debugMode, syncError: this.repositoryStatus.error });
    const showFooter = footerMode !== 'hidden';
    replace(this.root, el('main', { className: `home-screen${showFooter ? '' : ' no-technical-footer'}` }, [
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
          el('button', { className: 'home-action', onclick: () => openHowToPlay(this.onTournament) }, [
            el('span', { text: '?' }),
            el('div', {}, [el('strong', { text: '遊び方' }), el('small', { text: '基本操作とチュートリアル' })]),
          ]),
        ]),
      ]),
      showFooter ? el('footer', { className: `home-footer${this.repositoryStatus.error ? ' sync-warning' : ''}` }, [
        this.repositoryStatus.error
          ? el('span', { className: 'invalid-copy', text: 'クラウドと同期できないため、この端末に安全に保存しています。' })
          : null,
        this.debugMode ? el('span', { text: `保存: ${this.repositoryStatus.mode === 'firebase' ? 'Firebase + local backup' : 'このブラウザ'}` }) : null,
        this.debugMode ? el('span', { text: `Debug seed: ${this.seed}` }) : null,
        this.debugMode ? el('span', { text: 'Sim8.7 / PWA' }) : null,
      ]) : null,
    ]));
  }
}

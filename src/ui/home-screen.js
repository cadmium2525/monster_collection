import { TOURNAMENT_LABELS } from '../battle/rules.js';
import { activeTournamentState } from '../tournament/active-run.js';
import { representativeMonster } from '../battle/deck.js';
import { representativeCardAsset } from './representative-card.js';
import { ROUND_LABELS } from '../tournament/TournamentRun.js';
import { el, formatDate, replace } from './dom.js';
import { renderMonsterPortrait } from './card-renderer.js';
import { openModal } from './modal.js';
import { diamondIcon } from './currency-icon.js';
import { APP_VERSION } from '../config/app-version.js';
import { availableCampaignGifts } from '../gacha/economy-state.js';
import { playerIconContent } from './player-icon.js';

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
    title: '後攻10ターン目の覚醒',
    copy: '後攻は10ターン目から、場のモンスター詳細にある覚醒ボタンを使えます。別の味方1体を墓地へ送り、真の能力を開花します。',
    tokens: [['10', '後攻ターン'], ['醒', '全能力+15'], ['墓', '味方1体を素材'] ],
    tip: '召喚酔い中の味方は素材にできません。覚醒は1試合に1回で、覚醒したモンスターは合体できません。',
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
    tip: '敗退しても確定した交換は保存されます。一度解禁した上位大会には、どの保存デッキでも挑戦できます。',
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
      el('li', { text: '後攻10Tから1試合に1回覚醒できます。召喚酔いしていない別の味方1体を墓地へ送り、全能力+15と専用能力を得ます。' }),
      el('li', { text: 'Training・修行の成長は同じ大会の次試合へ引き継ぎ、大会終了時に元へ戻ります。' }),
      el('li', { text: 'レジェンド決勝の現チャンピオンは、戴冠した大会の決勝開始時点の40枚と育成状態を再現して登場します。' }),
      el('li', { text: '相手盤面が空ならプレイヤーへ直接攻撃。LIFEを0にすれば勝利です。' }),
      el('li', { text: '敗退しても確定済みの交換カードは保存。上位大会を一度解禁すれば、ほかの保存デッキでも挑戦できます。' }),
    ]),
    el('button', { className: 'primary-button tutorial-start', text: `${TUTORIAL_STEPS.length}ステップのチュートリアルを始める`, onclick: onTutorial }),
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
  return debugMode ? 'debug' : 'hidden';
}

export function activeRunSummary(activeRun) {
  const state = activeTournamentState(activeRun);
  if (!state) return null;
  const phaseLabel = activeRun.phase === 'battle' ? '試合中' : activeRun.phase === 'reward' ? 'カード奪取中' : '対戦前';
  const displayedRound = activeRun.phase === 'reward' && state.status === 'active'
    ? Math.max(0, state.roundIndex - 1)
    : state.roundIndex;
  return {
    title: activeRun.phase === 'reward' ? 'カード奪取の続きから' : '大会の続きから',
    detail: `${TOURNAMENT_LABELS[state.rank] ?? state.rank}・${ROUND_LABELS[displayedRound] ?? `${displayedRound + 1}戦目`}・${phaseLabel}`,
  };
}

export function homeLeaderArtworkPath(monsterId, cardAsset = null) {
  const number = Number(String(monsterId ?? '').match(/(\d+)$/)?.[1]);
  if (!Number.isInteger(number) || number < 1 || number > 30) return './assets/images/home/monster-019.webp';
  return `./assets/images/home/monster-${String(number).padStart(3, '0')}.webp`;
}

export function homeCollectionLevel(catalog, masterIndex) {
  const owned = new Set(catalog?.ownedCardMasterIds ?? []).size;
  const discovered = new Set(catalog?.discoveredFusionIds ?? []).size;
  const total = (masterIndex?.cards?.size ?? 0) + (masterIndex?.data?.fusions?.length ?? 0);
  return total ? Math.min(100, Math.round(((owned + discovered) / total) * 100)) : 0;
}

const HOME_ICON_PATHS = Object.freeze({
  tournament: ['M15 7h18v8c0 7-3 13-9 13s-9-6-9-13V7Z', 'M15 12H8c0 8 3 12 10 13M33 12h7c0 8-3 12-10 13M24 28v7M16 42h16M19 35h10v7'],
  arena: ['m11 8 26 32M37 8 11 40M8 8l8 2-6 6-2-8Zm32 0-8 2 6 6 2-8ZM8 40l8-2-6-6-2 8Zm32 0-8-2 6-6 2 8Z'],
  home: ['m7 23 17-15 17 15M12 20v21h24V20M20 41V28h8v13'],
  cards: ['M9 7h25v34H9z', 'm18 19 7-5 4 6 8-3 2 17H18V19ZM34 11l5 1v25l-5 1'],
  shop: ['M8 18h32l-3 23H11L8 18Z', 'M15 18a9 9 0 0 1 18 0M18 26v5M30 26v5'],
  gift: ['M7 19h34v23H7zM4 14h40v8H4zM24 14v28', 'M24 14H14c-5 0-6-8-1-9 5-1 11 9 11 9Zm0 0h10c5 0 6-8 1-9-5-1-11 9-11 9Z'],
  notice: ['M11 34h26l-4-6V18a9 9 0 0 0-18 0v10l-4 6ZM20 39a4 4 0 0 0 8 0'],
  help: ['M8 8h13c4 0 6 2 6 6v26c0-4-2-6-6-6H8V8Zm32 0H27v32c0-4 2-6 6-6h7V8Z'],
  install: ['M24 5v25m0 0L14 20m10 10 10-10M8 35v7h32v-7'],
  admin: ['M9 12h30M9 24h30M9 36h30M17 8v8M31 20v8M22 32v8'],
  mission: ['M11 8h26v32H11z', 'M17 16h14M17 24h14M17 32h9M7 15h4M7 24h4M7 33h4'],
});

function homeIcon(name, className = '') {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  if (className) svg.setAttribute('class', className);
  svg.setAttribute('viewBox', '0 0 48 48');
  svg.setAttribute('aria-hidden', 'true');
  svg.setAttribute('focusable', 'false');
  for (const d of HOME_ICON_PATHS[name] ?? []) {
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.append(path);
  }
  return svg;
}

function homeNavButton({ icon, label, sublabel, onclick, className = '', disabled = false, current = false }) {
  return el('button', {
    className: `home-lobby-nav-button ${className}`.trim(),
    disabled,
    onclick,
    attrs: current ? { 'aria-current': 'page' } : {},
  }, [
    el('span', { className: 'home-lobby-nav-icon' }, homeIcon(icon)),
    el('span', { className: 'home-lobby-nav-copy' }, [
      el('strong', { text: label }),
      el('small', { text: sublabel }),
    ]),
  ]);
}

function openGiftBox(economy, gifts, onClaimGift) {
  const pending = economy?.pendingPack;
  let modal = null;
  const claim = (gift) => el('button', {
    className: 'primary-button home-gift-claim',
    text: 'ダイヤを受け取る',
    onclick: async (event) => {
      event.currentTarget.disabled = true;
      event.currentTarget.textContent = '受取中…';
      modal.close();
      await onClaimGift?.(gift.id);
    },
  });
  modal = openModal({
    title: 'ギフトボックス',
    content: el('div', { className: 'home-lobby-modal-copy' }, [
      gifts.length
        ? el('div', { className: 'home-gift-list' }, gifts.map((gift) => el('article', { className: 'home-gift-entry' }, [
          diamondIcon('home-gift-diamond'),
          el('div', {}, [
            el('small', { text: `受取期限 ${gift.endsAt.replaceAll('-', '/')}` }),
            el('strong', { text: gift.label }),
            el('p', { text: gift.description }),
            el('b', { text: `ダイヤ ${gift.amount.toLocaleString('ja-JP')}` }),
          ]),
          claim(gift),
        ])))
        : el('p', { className: 'home-gift-empty', text: '現在、未受取のギフトはありません。' }),
      pending ? el('p', { className: 'home-pending-pack-note', text: '未確認のブースターパックがあります。ショップから開封できます。' }) : null,
      el('small', { text: 'デイリーログインボーナスはその日の初回ログイン時に自動で受け取ります。期間限定ギフトは受取期限までにここから受け取ってください。' }),
    ]),
  });
}

function openHomeNotices(champion) {
  openModal({
    title: 'お知らせ',
    content: el('div', { className: 'home-lobby-modal-copy' }, [
      el('p', { className: 'eyebrow', text: `VERSION ${APP_VERSION}` }),
      el('h3', { text: '王座とデッキを巡る、新しいホームへ' }),
      el('p', { text: '選択中デッキのリーダーを中心に、王者情報・大会・カード・ショップへ直接移動できるホーム画面になりました。' }),
      champion?.championDisplayName ? el('small', { text: `現在のレジェンド王者：${champion.championDisplayName}` }) : null,
    ]),
  });
}

export class HomeScreen {
  constructor({ root, masterIndex, user, champion, repositoryStatus, decks, catalog = null, economy, seed, debugMode = false, adminMode = false, activeRun = null, onResume = null, onTournament, onDecks, onBoosters, onMissions = null, onAdmin = null, onProfile, onClaimGift = null, installAvailable = false, onInstall = null }) {
    this.root = root;
    this.masterIndex = masterIndex;
    this.user = user;
    this.champion = champion;
    this.repositoryStatus = repositoryStatus;
    this.decks = decks;
    this.catalog = catalog;
    this.economy = economy;
    this.seed = seed;
    this.debugMode = debugMode;
    this.adminMode = adminMode;
    this.activeRun = activeRun;
    this.onResume = onResume;
    this.onTournament = onTournament;
    this.onDecks = onDecks;
    this.onBoosters = onBoosters;
    this.onMissions = onMissions;
    this.onAdmin = onAdmin;
    this.onProfile = onProfile;
    this.onClaimGift = onClaimGift;
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
    const representativeAsset = representative ? representativeCardAsset(cards, representative.id) : null;
    return el('section', { className: 'home-lobby-champion' }, [
      el('div', { className: 'home-lobby-champion-art' }, representative ? renderMonsterPortrait(representative, '現チャンピオンの代表モンスター', representativeAsset) : el('div', { className: 'champion-placeholder', text: '?' })),
      el('div', { className: 'home-lobby-champion-copy' }, [
        el('p', { className: 'eyebrow', text: 'CURRENT LEGEND CHAMPION' }),
        el('h2', { text: champion?.championDisplayName ?? champion?.displayName ?? '初代王者 アルカナ' }),
        el('strong', { text: champion?.championDeckName ?? champion?.deckName ?? '王座の原型' }),
        el('p', { text: representative ? `代表 ${representative.name}` : '代表モンスター未登録' }),
        el('small', { text: champion?.crownedAt ? `戴冠 ${formatDate(champion.crownedAt)} ／ 防衛 ${champion.defenseCount ?? 0}回` : '王座データ未登録・初期王者' }),
      ]),
      el('span', { className: 'home-lobby-champion-crown', text: '♛', attrs: { 'aria-hidden': 'true' } }),
    ]);
  }

  render() {
    const highest = this.economy?.tournamentQualification ?? 'bronze';
    const footerMode = homeFooterMode({ debugMode: this.debugMode, syncError: this.repositoryStatus.error });
    const showFooter = footerMode !== 'hidden';
    const resume = activeRunSummary(this.activeRun);
    const selectedDeck = this.decks[0] ?? null;
    const leader = selectedDeck?.representativeMonsterId
      ? this.masterIndex.monsters.get(selectedDeck.representativeMonsterId)
      : selectedDeck?.cards?.length ? representativeMonster(selectedDeck.cards, this.masterIndex) : this.masterIndex.monsters.get('monster-019');
    const leaderAsset = leader && selectedDeck ? representativeCardAsset(selectedDeck.cards, leader.id) : null;
    const collectionLevel = homeCollectionLevel(this.catalog, this.masterIndex);
    const gifts = availableCampaignGifts(this.economy);
    const online = this.repositoryStatus.mode === 'firebase';
    const tournamentAction = resume ? this.onResume : this.onTournament;
    const hero = el('img', {
      className: `home-lobby-hero-art${leaderAsset?.finish === 'foil' ? ' is-foil' : ''}`,
      src: homeLeaderArtworkPath(leader?.id, leaderAsset),
      alt: leader ? `${leader.name}のホーム画面イラスト` : 'ホーム画面のリーダーイラスト',
      draggable: false,
      attrs: { decoding: 'sync', fetchpriority: 'high' },
    });

    replace(this.root, el('main', { className: `home-screen home-lobby${showFooter ? '' : ' no-technical-footer'}` }, [
      el('div', { className: 'home-lobby-artwork', attrs: { 'aria-hidden': 'true' } }, [
        hero,
        el('span', { className: 'home-lobby-art-shade' }),
        leaderAsset?.finish === 'foil' ? el('span', { className: 'home-lobby-foil-shine' }) : null,
      ]),
      el('header', { className: 'home-lobby-topbar' }, [
        el('button', { className: 'home-lobby-profile', onclick: this.onProfile, attrs: { 'aria-label': 'マイページを開く' } }, [
          el('span', { className: 'home-lobby-avatar' }, playerIconContent({ user: this.user, catalog: this.catalog, masterIndex: this.masterIndex })),
          el('span', { className: 'home-lobby-profile-copy' }, [
            el('small', { className: online ? 'is-online' : '', text: online ? '● ONLINE' : '○ LOCAL' }),
            el('strong', { text: this.user.displayName }),
            el('span', { className: 'home-lobby-level' }, [
              el('span', { text: 'COLLECTION LEVEL' }),
              el('b', { text: String(collectionLevel) }),
            ]),
            el('span', { className: 'home-lobby-level-track', attrs: { role: 'progressbar', 'aria-label': 'コレクションレベル進捗', 'aria-valuemin': '0', 'aria-valuemax': '100', 'aria-valuenow': String(collectionLevel) } }, el('i', { style: `width:${collectionLevel}%` })),
            el('span', { className: 'home-profile-link', text: 'マイページ' }),
          ]),
          el('i', { className: 'home-lobby-chevron', text: '›', attrs: { 'aria-hidden': 'true' } }),
        ]),
        el('div', { className: 'home-lobby-brand', attrs: { 'aria-label': 'モンスターコンストラクション' } }, [
          el('span', { className: 'home-lobby-brand-mark' }, el('b', { text: 'MC' })),
          el('span', {}, [el('strong', { text: 'MONSTER' }), el('small', { text: 'CONSTRUCTION' })]),
        ]),
        el('button', { className: 'home-lobby-wallet', onclick: this.onBoosters, attrs: { 'aria-label': `所持ダイヤ ${this.economy?.diamonds ?? 0}。ショップを開く` } }, [
          diamondIcon('home-lobby-diamond'),
          el('span', {}, [el('small', { text: 'DIAMOND' }), el('strong', { text: Number(this.economy?.diamonds ?? 0).toLocaleString('ja-JP') })]),
          el('i', { text: '＋', attrs: { 'aria-hidden': 'true' } }),
        ]),
      ]),
      el('aside', { className: 'home-lobby-left-rail' }, [
        this.renderChampion(),
        el('button', { className: `home-lobby-tournament-banner${resume ? ' has-resume' : ''}`, onclick: tournamentAction }, [
          el('span', {}, [
            el('small', { text: resume ? 'CONTINUE TOURNAMENT' : 'LEGEND CUP' }),
            el('strong', { text: resume?.title ?? '王座への挑戦者、求む' }),
            el('em', { text: resume?.detail ?? `${TOURNAMENT_LABELS[highest]}まで出場可能` }),
          ]),
          el('i', { text: '›', attrs: { 'aria-hidden': 'true' } }),
        ]),
      ]),
      el('aside', { className: 'home-lobby-utility-rail', attrs: { 'aria-label': 'サブメニュー' } }, [
        el('button', { onclick: this.onMissions, attrs: { 'aria-label': 'ミッション' } }, [homeIcon('mission'), el('span', { text: 'ミッション' })]),
        el('button', { onclick: () => openGiftBox(this.economy, gifts, this.onClaimGift), attrs: { 'aria-label': `ギフトボックス${gifts.length ? ` 未受取${gifts.length}件` : ''}` } }, [
          homeIcon('gift'), el('span', { text: 'ギフト' }), gifts.length ? el('i', { className: 'home-lobby-notification', text: String(gifts.length) }) : null,
        ]),
        el('button', { onclick: () => openHomeNotices(this.champion), attrs: { 'aria-label': 'お知らせ' } }, [homeIcon('notice'), el('span', { text: 'お知らせ' })]),
        el('button', { onclick: () => openHowToPlay(this.onTournament), attrs: { 'aria-label': '遊び方' } }, [homeIcon('help'), el('span', { text: '遊び方' })]),
        this.installAvailable ? el('button', { className: 'home-lobby-install', onclick: this.onInstall, attrs: { 'aria-label': 'アプリに追加' } }, [homeIcon('install'), el('span', { text: 'アプリ' })]) : null,
        this.adminMode ? el('button', { className: 'home-lobby-admin admin-entry-button', onclick: this.onAdmin, attrs: { 'aria-label': '管理者ツール' } }, [homeIcon('admin'), el('span', { text: '管理' }), el('span', { className: 'sr-only', text: '管理者ツール' })]) : null,
      ]),
      el('nav', { className: 'home-lobby-bottom-nav', attrs: { 'aria-label': 'メインメニュー' } }, [
        homeNavButton({ icon: 'tournament', label: 'トーナメント', sublabel: resume ? '続きから再開' : 'TOURNAMENT', onclick: tournamentAction, className: resume ? 'has-resume' : '' }),
        homeNavButton({ icon: 'arena', label: 'アリーナ', sublabel: 'COMING SOON', disabled: true, className: 'is-locked' }),
        homeNavButton({ icon: 'home', label: 'ホーム', sublabel: 'HOME', current: true, className: 'is-active' }),
        homeNavButton({ icon: 'cards', label: 'カード', sublabel: `${this.decks.length}/5 DECKS`, onclick: this.onDecks }),
        homeNavButton({ icon: 'shop', label: 'ショップ', sublabel: this.economy?.pendingPack ? '未確認パックあり' : 'BOOSTER', onclick: this.onBoosters, className: this.economy?.pendingPack ? 'has-notice' : '' }),
      ]),
      showFooter ? el('footer', { className: 'home-lobby-footer' }, [
        this.debugMode ? el('span', { text: `保存: ${this.repositoryStatus.mode === 'firebase' ? 'Firebase + local backup' : 'このブラウザ'}` }) : null,
        this.debugMode ? el('span', { text: `Debug seed: ${this.seed}` }) : null,
        this.debugMode ? el('span', { text: 'Sim8.7 / PWA' }) : null,
      ]) : null,
      el('small', { className: 'home-app-version home-lobby-version', text: `v${APP_VERSION}` }),
    ]));
  }
}

import { TOURNAMENT_LABELS } from '../battle/rules.js';
import { battleWinRate, normalizePlayerStats } from '../profile/player-stats.js';
import { el, formatDate, replace } from './dom.js';
import { openModal } from './modal.js';
import { ownedPlayerIconDefinitions, playerIconContent, playerIconThumbnail } from './player-icon.js';
import { defaultHomeArtworkSelection, homeArtworkSelectionKey, normalizeHomeArtworkSelection, ownedHomeArtworkSelections } from '../profile/home-artwork.js';
import { homeArtworkImagePath, homeArtworkLabel, homeArtworkThumbnailStyle } from './home-artwork.js';

function percent(value) {
  return `${Math.round(Number(value || 0) * 100)}%`;
}

function metric(label, value, note = null, className = '') {
  return el('article', { className: `profile-metric ${className}`.trim() }, [
    el('span', { text: label }),
    el('strong', { text: String(value) }),
    note ? el('small', { text: note }) : null,
  ]);
}

function accountCopy(account) {
  if (account.mode !== 'firebase') return {
    tone: 'offline', title: 'この端末だけに保存中',
    copy: 'Firebaseへ接続できていないため、現在は機種変更後の復旧を設定できません。',
  };
  return {
    tone: 'warning', title: 'アカウント復旧が未設定です',
    copy: '端末の紛失やアプリ削除に備えて、任意の復旧IDとパスワードを登録してください。メールアドレスは不要です。',
  };
}

function accountPanel(screen, account) {
  if (screen.account.mode === 'firebase' && !screen.account.recoveryEnabled) {
    return el('section', { className: 'profile-account profile-account-unregistered panel account-warning' }, [
      el('h2', { text: 'ACCOUNT' }),
      el('div', { className: 'profile-account-actions' }, [
        el('button', { className: 'primary-button', text: '新規登録', onclick: screen.onRegisterRecovery }),
        el('button', { className: 'utility-button', disabled: screen.hasActiveRun, text: 'ログイン', onclick: screen.onSignIn }),
      ]),
    ]);
  }

  if (screen.account.mode === 'firebase' && screen.account.recoveryEnabled) {
    return el('section', { className: 'profile-account profile-account-registered panel account-safe' }, [
      el('p', { className: 'eyebrow', text: 'ACCOUNT' }),
      el('h2', { text: `${screen.account.playerId ?? '登録済みID'}でログイン中` }),
      el('span', { className: 'account-state-mark', text: '✓', attrs: { 'aria-label': 'ログイン済み' } }),
    ]);
  }

  return el('section', { className: `profile-account panel account-${account.tone}` }, [
    el('div', { className: 'profile-section-title' }, [
      el('div', {}, [el('p', { className: 'eyebrow', text: 'ACCOUNT' }), el('h2', { text: account.title })]),
      el('span', { className: 'account-state-mark', text: screen.account.recoveryEnabled ? '✓' : '!' }),
    ]),
    el('p', { text: account.copy }),
    screen.account.recoveryEnabled
      ? el('small', { className: 'profile-recovery-warning', text: '復旧IDとパスワードは忘れないよう端末外にも控えてください。現在、忘れた場合の再発行はできません。' }) : null,
  ]);
}

function openPlayerIconPicker(screen) {
  const definitions = ownedPlayerIconDefinitions(screen.catalog, screen.masterIndex);
  let modal = null;
  const choose = (masterId) => {
    modal.close();
    void screen.onSelectIcon?.(masterId);
  };
  const defaultChoice = el('button', {
    className: `player-icon-choice${screen.user.playerIconMasterId ? '' : ' selected'}`,
    onclick: () => choose(null),
    attrs: { 'aria-label': '文字アイコンを使用' },
  }, [
    el('span', { className: 'player-icon-thumbnail player-icon-letter', text: screen.user.displayName.slice(0, 1) || '?' }),
    el('small', { text: '文字' }),
  ]);
  const choices = definitions.map((definition) => el('button', {
    className: `player-icon-choice${screen.user.playerIconMasterId === definition.id ? ' selected' : ''}`,
    onclick: () => choose(definition.id),
    attrs: { 'aria-label': `${definition.name}をプレイヤーアイコンに設定` },
  }, [playerIconThumbnail(definition), el('small', { text: definition.name })]));
  modal = openModal({
    title: 'プレイヤーアイコン',
    content: el('div', { className: 'player-icon-picker' }, [
      el('p', { text: '所持したことのあるカードからアイコンを選択できます。' }),
      el('div', { className: 'player-icon-picker-grid' }, [defaultChoice, ...choices]),
    ]),
    className: 'player-icon-picker-modal',
  });
}

function openHomeArtworkPicker(screen) {
  const current = normalizeHomeArtworkSelection(screen.user.homeArtwork)
    ?? defaultHomeArtworkSelection(screen.decks, screen.masterIndex);
  const currentKey = homeArtworkSelectionKey(current);
  const selections = ownedHomeArtworkSelections({
    catalog: screen.catalog,
    decks: screen.decks,
    economy: screen.economy,
    masterIndex: screen.masterIndex,
    current,
  });
  let modal = null;
  const choices = selections.map((selection) => {
    const special = selection.artVariantId !== 'base';
    const selected = homeArtworkSelectionKey(selection) === currentKey;
    return el('button', {
      className: `home-artwork-choice${special ? ' is-special' : ''}${selection.finish === 'foil' ? ' is-foil' : ''}${selected ? ' selected' : ''}`,
      onclick: () => {
        modal.close();
        void screen.onSelectHomeArtwork?.(selection);
      },
      attrs: {
        'aria-label': `${homeArtworkLabel(selection, screen.masterIndex)}をホーム画面に設定`,
        'aria-pressed': String(selected),
      },
    }, [
      el('span', { className: 'home-artwork-choice-image', attrs: { style: homeArtworkThumbnailStyle(selection), 'aria-hidden': 'true' } }),
      el('span', { className: 'home-artwork-choice-copy' }, [
        el('strong', { text: screen.masterIndex.monsters.get(selection.masterId)?.name ?? selection.masterId }),
        el('small', { text: special ? `SPECIAL${selection.finish === 'foil' ? ' / Foil' : ''}` : selection.finish === 'foil' ? 'NORMAL / Foil' : 'NORMAL' }),
      ]),
    ]);
  });
  modal = openModal({
    title: 'ホーム画面イラスト',
    content: el('div', { className: 'home-artwork-picker' }, [
      el('p', { text: 'デッキリーダーとは別に、所持・獲得したモンスターのホーム画面用イラストを選択できます。' }),
      el('div', { className: 'home-artwork-picker-grid' }, choices),
    ]),
    className: 'home-artwork-picker-modal',
  });
}

export class ProfileScreen {
  constructor({ root, user, account, stats, catalog, decks = [], economy = null, masterIndex, catalogProgress, qualification, champion, hasActiveRun = false, onBack, onRename, onSelectIcon, onSelectHomeArtwork, onRegisterRecovery, onSignIn }) {
    this.root = root;
    this.user = user;
    this.account = account;
    this.stats = normalizePlayerStats(stats);
    this.catalog = catalog;
    this.decks = decks;
    this.economy = economy;
    this.masterIndex = masterIndex;
    this.catalogProgress = catalogProgress;
    this.qualification = qualification;
    this.champion = champion;
    this.hasActiveRun = hasActiveRun;
    this.onBack = onBack;
    this.onRename = onRename;
    this.onSelectIcon = onSelectIcon;
    this.onSelectHomeArtwork = onSelectHomeArtwork;
    this.onRegisterRecovery = onRegisterRecovery;
    this.onSignIn = onSignIn;
    this.render();
  }

  render() {
    const stats = this.stats;
    const account = accountCopy(this.account);
    const currentChampion = this.champion?.championUserId === this.user.id;
    const cupWins = Object.entries(stats.cupWins)
      .map(([rank, wins]) => `${TOURNAMENT_LABELS[rank] ?? rank} ${wins}`)
      .join(' / ');
    const homeArtwork = normalizeHomeArtworkSelection(this.user.homeArtwork)
      ?? defaultHomeArtworkSelection(this.decks, this.masterIndex);
    replace(this.root, el('main', { className: 'profile-screen' }, [
      el('header', { className: 'screen-header profile-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'MY PAGE' }), el('h1', { text: 'マイページ' })]),
        el('button', { className: 'utility-button', text: 'ホームへ', onclick: this.onBack }),
      ]),
      el('div', { className: 'profile-layout' }, [
        el('section', { className: 'profile-identity panel' }, [
          el('button', {
            className: 'profile-avatar profile-avatar-button',
            onclick: () => openPlayerIconPicker(this),
            attrs: { 'aria-label': 'プレイヤーアイコンを変更', title: 'アイコンを変更' },
          }, playerIconContent({ user: this.user, catalog: this.catalog, masterIndex: this.masterIndex })),
          el('div', { className: 'profile-name-copy' }, [
            el('p', { className: 'eyebrow', text: currentChampion ? 'CURRENT LEGEND CHAMPION' : 'MONSTER BREEDER' }),
            el('h2', { text: this.user.displayName }),
            el('span', { text: `${TOURNAMENT_LABELS[this.qualification] ?? this.qualification}まで出場可能` }),
          ]),
          el('button', { className: 'utility-button profile-rename', text: '名前を変更', onclick: this.onRename }),
        ]),
        accountPanel(this, account),
        el('section', { className: 'profile-catalog panel' }, [
          el('div', { className: 'profile-section-title' }, [
            el('div', {}, [el('p', { className: 'eyebrow', text: 'COLLECTION' }), el('h2', { text: 'カード図鑑' })]),
            el('strong', { text: percent(this.catalogProgress.totalRate) }),
          ]),
          el('div', { className: 'catalog-progress-row' }, [
            el('span', { text: '基本カード' }),
            el('div', { className: 'profile-progress' }, el('i', { style: `width:${this.catalogProgress.cardRate * 100}%` })),
            el('b', { text: `${this.catalogProgress.ownedCards}/${this.catalogProgress.totalCards}` }),
          ]),
          el('div', { className: 'catalog-progress-row' }, [
            el('span', { text: '特殊合体' }),
            el('div', { className: 'profile-progress fusion-progress' }, el('i', { style: `width:${this.catalogProgress.fusionRate * 100}%` })),
            el('b', { text: `${this.catalogProgress.discoveredFusions}/${this.catalogProgress.totalFusions}` }),
          ]),
        ]),
        el('section', { className: 'profile-home-art panel' }, [
          el('div', { className: 'profile-section-title' }, [
            el('div', {}, [el('p', { className: 'eyebrow', text: 'HOME ARTWORK' }), el('h2', { text: 'ホーム画面イラスト' })]),
            el('button', { className: 'utility-button', text: '変更', onclick: () => openHomeArtworkPicker(this) }),
          ]),
          el('div', { className: `profile-home-art-preview${homeArtwork.finish === 'foil' ? ' is-foil' : ''}` }, [
            el('img', { src: homeArtworkImagePath(homeArtwork), alt: homeArtworkLabel(homeArtwork, this.masterIndex), draggable: false, attrs: { loading: 'lazy', decoding: 'async' } }),
            homeArtwork.finish === 'foil' ? el('i', { attrs: { 'aria-hidden': 'true' } }) : null,
            el('strong', { text: homeArtworkLabel(homeArtwork, this.masterIndex) }),
          ]),
        ]),
        el('section', { className: 'profile-record panel' }, [
          el('div', { className: 'profile-section-title' }, [
            el('div', {}, [el('p', { className: 'eyebrow', text: 'BATTLE RECORD' }), el('h2', { text: '戦績' })]),
            stats.updatedAt ? el('small', { text: `最終更新 ${formatDate(stats.updatedAt)}` }) : null,
          ]),
          el('div', { className: 'profile-metric-grid' }, [
            metric('通算試合', stats.battlesPlayed, `${stats.battleWins}勝 ${stats.battleLosses}敗 ${stats.battleDraws}分`),
            metric('勝率', percent(battleWinRate(stats)), `最高連勝 ${stats.bestWinStreak}`),
            metric('大会参加', stats.tournamentsEntered, `完走 ${stats.tournamentsCompleted}`),
            metric('大会優勝', stats.tournamentWins, cupWins),
            metric('王座獲得', stats.championshipsWon, currentChampion ? `現王者・防衛 ${this.champion?.defenseCount ?? 0}` : '累計戴冠回数', 'champion-metric'),
            metric('奪取カード', stats.cardsStolen, '確定して持ち帰った枚数'),
          ]),
          el('small', { className: 'profile-stats-note', text: '戦績はこの機能の公開後に終了した試合から記録されます。' }),
        ]),
      ]),
    ]));
  }
}

export function catalogProgress(catalog, masterIndex) {
  const totalCards = masterIndex.cards.size;
  const totalFusions = masterIndex.data.fusions.length;
  const ownedCards = new Set(catalog?.ownedCardMasterIds ?? []).size;
  const discoveredFusions = new Set(catalog?.discoveredFusionIds ?? []).size;
  const total = totalCards + totalFusions;
  return {
    ownedCards, totalCards, discoveredFusions, totalFusions,
    cardRate: totalCards ? ownedCards / totalCards : 0,
    fusionRate: totalFusions ? discoveredFusions / totalFusions : 0,
    totalRate: total ? (ownedCards + discoveredFusions) / total : 0,
  };
}

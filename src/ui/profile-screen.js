import { TOURNAMENT_LABELS } from '../battle/rules.js';
import { battleWinRate, normalizePlayerStats } from '../profile/player-stats.js';
import { el, formatDate, replace } from './dom.js';

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
  if (account.recoveryEnabled) return {
    tone: 'safe', title: 'アカウント保護済み',
    copy: `復旧ID「${account.playerId ?? '登録済み'}」とパスワードで別の端末から復旧できます。`,
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

export class ProfileScreen {
  constructor({ root, user, account, stats, catalogProgress, qualification, champion, hasActiveRun = false, onBack, onRename, onRegisterRecovery, onSignIn }) {
    this.root = root;
    this.user = user;
    this.account = account;
    this.stats = normalizePlayerStats(stats);
    this.catalogProgress = catalogProgress;
    this.qualification = qualification;
    this.champion = champion;
    this.hasActiveRun = hasActiveRun;
    this.onBack = onBack;
    this.onRename = onRename;
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
    replace(this.root, el('main', { className: 'profile-screen' }, [
      el('header', { className: 'screen-header profile-header' }, [
        el('div', {}, [el('p', { className: 'eyebrow', text: 'MY PAGE' }), el('h1', { text: 'マイページ' })]),
        el('button', { className: 'utility-button', text: 'ホームへ', onclick: this.onBack }),
      ]),
      el('div', { className: 'profile-layout' }, [
        el('section', { className: 'profile-identity panel' }, [
          el('div', { className: 'profile-avatar', text: this.user.displayName.slice(0, 1) || '?' }),
          el('div', { className: 'profile-name-copy' }, [
            el('p', { className: 'eyebrow', text: currentChampion ? 'CURRENT LEGEND CHAMPION' : 'MONSTER BREEDER' }),
            el('h2', { text: this.user.displayName }),
            el('span', { text: `${TOURNAMENT_LABELS[this.qualification] ?? this.qualification}まで出場可能` }),
          ]),
          el('button', { className: 'utility-button profile-rename', text: '名前を変更', onclick: this.onRename }),
        ]),
        accountPanel(this, account),
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

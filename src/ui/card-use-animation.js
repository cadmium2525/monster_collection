import { el } from './dom.js';
import { renderCard } from './card-renderer.js';

const CARD_USE_TYPES = new Set(['training', 'shugyo', 'breeder']);
const HAND_EFFECTS = new Set(['breeder-005', 'breeder-021', 'breeder-022']);
const OWN_BOARD_EFFECTS = new Set([
  'breeder-006', 'breeder-011', 'breeder-020', 'breeder-023', 'breeder-026',
  'breeder-028', 'breeder-038', 'breeder-045', 'breeder-051',
]);
const OPPONENT_BOARD_EFFECTS = new Set(['breeder-042', 'breeder-043']);
const OPPONENT_PLAYER_EFFECTS = new Set(['breeder-002']);

const TIMINGS = Object.freeze({
  standard: Object.freeze({ reveal: 420, copyOut: 150, travel: 360, impact: 240 }),
  fast: Object.freeze({ reveal: 130, copyOut: 55, travel: 120, impact: 85 }),
  reduced: Object.freeze({ reveal: 100, copyOut: 45, travel: 105, impact: 75 }),
});

const CHANNEL_PRESENTATION = Object.freeze({
  training: Object.freeze({ symbol: '鍛', fallback: 'STATUS UP' }),
  shugyo: Object.freeze({ symbol: '修', fallback: 'NEW TECHNIQUE' }),
  tp: Object.freeze({ symbol: 'TP', fallback: 'TP RECOVERY' }),
  draw: Object.freeze({ symbol: '札', fallback: 'CARD DRAW' }),
  search: Object.freeze({ symbol: '索', fallback: 'CARD SEARCH' }),
  heal: Object.freeze({ symbol: '癒', fallback: 'LIFE RECOVERY' }),
  guard: Object.freeze({ symbol: '護', fallback: 'PROTECTION' }),
  disrupt: Object.freeze({ symbol: '封', fallback: 'DISRUPTION' }),
  cleanse: Object.freeze({ symbol: '浄', fallback: 'CLEANSE' }),
  recycle: Object.freeze({ symbol: '還', fallback: 'RETURN' }),
  boost: Object.freeze({ symbol: '昇', fallback: 'POWER UP' }),
});

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function waitForTransition(node, propertyName, duration) {
  if (!node?.addEventListener || duration <= 0) return delay(Math.max(0, duration));
  return new Promise((resolve) => {
    let timer = null;
    const finish = () => {
      if (timer !== null) clearTimeout(timer);
      node.removeEventListener('transitionend', onTransitionEnd);
      resolve();
    };
    const onTransitionEnd = (event) => {
      if (event.target === node && event.propertyName === propertyName) finish();
    };
    node.addEventListener('transitionend', onTransitionEnd);
    timer = setTimeout(finish, duration);
  });
}

function timingMode(speed, reducedMotion) {
  if (reducedMotion) return 'reduced';
  return speed === 'fast' ? 'fast' : 'standard';
}

export function cardUseAnimationTimings({ speed = 'standard', reducedMotion = false } = {}) {
  return { ...TIMINGS[timingMode(speed, reducedMotion)] };
}

export function cardUseAnimationDuration(options = {}) {
  return Object.values(cardUseAnimationTimings(options)).reduce((sum, value) => sum + value, 0);
}

export function isCardUseAction(action) {
  return CARD_USE_TYPES.has(action?.type);
}

function findUnit(players, unitId) {
  for (const player of players.filter(Boolean)) {
    const unit = player.board?.find((candidate) => candidate?.id === unitId);
    if (unit) return { player, unit };
  }
  return null;
}

function playerLabel(player, fallback) {
  return player?.displayName?.trim?.() || fallback;
}

function effectTarget(definition, action, beforePlayer, beforeOpponent) {
  const unitId = ['training', 'shugyo'].includes(action.type) ? action.unitId : action.targetUnitId;
  const found = unitId ? findUnit([beforePlayer, beforeOpponent], unitId) : null;
  if (found) {
    return {
      kind: 'unit',
      playerId: found.player.id,
      unitId: found.unit.id,
      label: found.unit.specialForm ?? found.unit.name,
    };
  }
  if (definition.id === 'breeder-022') {
    return {
      kind: 'deck',
      playerId: beforePlayer.id,
      label: `${playerLabel(beforePlayer, '使用者')}の山札`,
    };
  }
  if (HAND_EFFECTS.has(definition.id)) {
    return {
      kind: 'hand',
      playerId: beforePlayer.id,
      label: `${playerLabel(beforePlayer, '使用者')}の手札`,
    };
  }
  if (OWN_BOARD_EFFECTS.has(definition.id)) {
    return { kind: 'board', playerId: beforePlayer.id, label: `${playerLabel(beforePlayer, '使用者')}側全体` };
  }
  if (OPPONENT_BOARD_EFFECTS.has(definition.id)) {
    return { kind: 'board', playerId: beforeOpponent.id, label: `${playerLabel(beforeOpponent, '相手')}側全体` };
  }
  if (OPPONENT_PLAYER_EFFECTS.has(definition.id)) {
    return { kind: 'player', playerId: beforeOpponent.id, label: playerLabel(beforeOpponent, '相手プレイヤー') };
  }
  return { kind: 'player', playerId: beforePlayer.id, label: playerLabel(beforePlayer, '使用者') };
}

function effectChannel(definition) {
  if (definition.kind === 'training') return 'training';
  if (definition.kind === 'shugyo') return 'shugyo';
  const effect = definition.effect ?? '';
  if (definition.id === 'breeder-022' || /探索|確認/.test(effect)) return 'search';
  if (/ドロー|手札を.*山札|カードを.*手札/.test(effect)) return 'draw';
  if (/TP/.test(effect) && /回復|最大TP\+/.test(effect)) return 'tp';
  if (/LIFE.*回復/.test(effect)) return 'heal';
  if (/解除|浄化/.test(effect)) return 'cleanse';
  if (/手札へ戻|帰還|撤退/.test(effect)) return 'recycle';
  if (/相手|敵|妨害|スタン|封鎖|呪印|低下|-20%/.test(effect)) return 'disrupt';
  if (/軽減|防御|DEF\+|回避|耐える|守り|防壁|予備パーツ/.test(effect)) return 'guard';
  return 'boost';
}

function effectOutcome(definition, channel) {
  const effect = definition.effect ?? '';
  if (definition.kind === 'training') return `${definition.stat.toUpperCase()} +${definition.amount}`;
  if (definition.kind === 'shugyo') return `LIFE / ${definition.stat.toUpperCase()} UP`;
  const tp = effect.match(/TPを(\d+)回復/);
  if (tp) return `TP +${tp[1]}`;
  const draw = effect.match(/カードを(\d+)枚ドロー/);
  if (draw) return `DRAW ${draw[1]}`;
  const maxTp = effect.match(/最大TP([+-]\d+)/);
  if (maxTp) return `MAX TP ${maxTp[1]}`;
  const life = effect.match(/LIFEを?(\d+)回復/);
  if (life) return `LIFE +${life[1]}`;
  const atk = effect.match(/ATK\+(\d+)/);
  const def = effect.match(/DEF\+(\d+)/);
  if (atk && def) return `ATK +${atk[1]} / DEF +${def[1]}`;
  if (atk) return `ATK +${atk[1]}`;
  if (def) return `DEF +${def[1]}`;
  if (/行動権.*(?:\+1|1回復)/.test(effect)) return 'ACTION +1';
  if (/完全回避/.test(effect)) return 'EVADE';
  if (/スタン/.test(effect)) return 'STUN';
  if (/合体.*実行できない/.test(effect)) return 'FUSION LOCK';
  if (/技のTP\+2/.test(effect)) return 'MOVE TP +2';
  return CHANNEL_PRESENTATION[channel]?.fallback ?? 'CARD EFFECT';
}

export function createCardUseAnimationModel({ action, beforePlayer, beforeOpponent, masterIndex, humanPlayerId }) {
  if (!isCardUseAction(action) || !beforePlayer || !beforeOpponent) return null;
  const cardAsset = beforePlayer.hand?.find((card) => card.instanceId === action.cardInstanceId);
  const definition = cardAsset ? masterIndex?.cards?.get(cardAsset.masterId) : null;
  if (!definition || definition.kind !== action.type) return null;
  const channel = effectChannel(definition);
  const presentation = CHANNEL_PRESENTATION[channel];
  const playerControlled = beforePlayer.id === humanPlayerId;
  return {
    tone: playerControlled ? 'player' : 'enemy',
    actorLabel: playerControlled ? 'YOUR CARD' : 'ENEMY CARD',
    definition,
    cardAsset: { ...cardAsset },
    name: definition.name,
    effect: definition.effect,
    channel,
    symbol: presentation.symbol,
    outcome: effectOutcome(definition, channel),
    target: effectTarget(definition, action, beforePlayer, beforeOpponent),
  };
}

function cinematicCard(model) {
  return renderCard({
    definition: model.definition,
    cardAsset: model.cardAsset,
    interactive: false,
    showMonsterEffect: true,
    label: `${model.name}。${model.effect}`,
  });
}

function impactNode(model) {
  return el('span', {
    className: `card-use-impact ${model.channel}`,
    attrs: { 'aria-hidden': 'true' },
  }, [
    el('i'),
    el('b', { text: model.symbol }),
    el('strong', { text: model.outcome }),
  ]);
}

export async function playCardUseAnimation({ model, speed = 'standard', targetNode = null } = {}) {
  if (!model || typeof document === 'undefined') return;
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const timing = cardUseAnimationTimings({ speed, reducedMotion });
  const shell = el('div', { className: 'card-use-card-shell' }, cinematicCard(model));
  const copy = el('div', { className: 'card-use-copy' }, [
    el('small', { text: model.actorLabel }),
    el('strong', { text: model.name }),
    el('p', { text: model.effect }),
    el('span', { text: `TARGET  ${model.target.label}` }),
  ]);
  const backdrop = el('div', { className: 'card-use-backdrop', attrs: { 'aria-hidden': 'true' } });
  const radiance = el('div', { className: 'card-use-radiance', attrs: { 'aria-hidden': 'true' } });
  const overlay = el('div', {
    className: `card-use-cinematic ${model.tone} channel-${model.channel}${speed === 'fast' ? ' fast' : ''}${reducedMotion ? ' reduced-motion' : ''}`,
    attrs: {
      role: 'status',
      'aria-live': 'assertive',
      'aria-label': `${model.actorLabel}、${model.name}を使用。${model.effect}。対象、${model.target.label}`,
      style: `--card-use-reveal:${timing.reveal}ms;--card-use-copy-out:${timing.copyOut}ms`,
    },
  }, [
    backdrop,
    radiance,
    el('section', { className: 'card-use-stage' }, [
      shell,
      copy,
    ]),
  ]);

  document.body.append(overlay);
  await delay(timing.reveal);
  overlay.classList.add('copy-ready');
  copy.getAnimations?.().forEach((animation) => animation.cancel());
  copy.getBoundingClientRect?.();
  overlay.classList.add('copy-clearing');
  await waitForTransition(copy, 'opacity', timing.copyOut);
  overlay.classList.add('copy-cleared', 'travel-ready');
  [backdrop, radiance].forEach((node) => node.getAnimations?.().forEach((animation) => animation.cancel()));
  radiance.getBoundingClientRect?.();
  overlay.classList.add('travelling');

  const sourceRect = shell.getBoundingClientRect();
  const targetRect = targetNode?.getBoundingClientRect?.();
  const dx = targetRect ? targetRect.left + targetRect.width / 2 - sourceRect.left - sourceRect.width / 2 : 0;
  const dy = targetRect ? targetRect.top + targetRect.height / 2 - sourceRect.top - sourceRect.height / 2 : 0;
  const flight = shell.animate?.([
    { transform: 'translate3d(0,0,0) scale(1)', opacity: 1, filter: 'brightness(1)' },
    { transform: `translate3d(${dx * .15}px,${dy * .15}px,0) scale(1.08)`, opacity: 1, filter: 'brightness(1.75)', offset: .24 },
    { transform: `translate3d(${dx}px,${dy}px,0) scale(.08)`, opacity: 0, filter: 'brightness(3.2) blur(2px)' },
  ], { duration: timing.travel, easing: 'cubic-bezier(.46,.02,.74,.34)', fill: 'forwards' });

  await delay(Math.round(timing.travel * .7));
  let impact = null;
  if (targetNode?.isConnected) {
    impact = impactNode(model);
    targetNode.append(impact);
    targetNode.animate?.([
      { filter: 'brightness(1)', transform: 'scale(1)' },
      { filter: 'brightness(1.75) saturate(1.3)', transform: 'scale(1.035)' },
      { filter: 'brightness(1)', transform: 'scale(1)' },
    ], { duration: timing.impact + Math.round(timing.travel * .3), easing: 'ease-out' });
  }
  if (flight) await flight.finished.catch(() => {});
  else await delay(Math.round(timing.travel * .3));
  overlay.classList.add('resolved');
  await delay(timing.impact);
  impact?.remove();
  overlay.remove();
}

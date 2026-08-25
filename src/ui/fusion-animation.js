import { el } from './dom.js';
import { renderCard } from './card-renderer.js';

const TIMINGS = Object.freeze({
  standard: Object.freeze({ normal: 1750, special: 2450 }),
  fast: Object.freeze({ normal: 760, special: 1050 }),
  reduced: Object.freeze({ normal: 620, special: 760 }),
});

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function unitById(player, unitId) {
  return player?.board?.find((unit) => unit?.id === unitId) ?? null;
}

export function fusionAnimationDuration({ speed = 'standard', special = false, reducedMotion = false } = {}) {
  const mode = reducedMotion ? 'reduced' : speed === 'fast' ? 'fast' : 'standard';
  return TIMINGS[mode][special ? 'special' : 'normal'];
}

export function createFusionAnimationModel({ action, beforePlayer, afterPlayer, masterIndex }) {
  if (!action?.type?.startsWith('fusion-')) return null;
  const mainBefore = unitById(beforePlayer, action.unitId);
  const mainAfter = unitById(afterPlayer, action.unitId);
  const materialCard = beforePlayer?.hand?.find((card) => card.instanceId === action.materialCardInstanceId);
  const mainDefinition = mainBefore ? masterIndex.monsters.get(mainBefore.sourceMasterId) : null;
  const materialDefinition = materialCard ? masterIndex.cards.get(materialCard.masterId) : null;
  if (!mainBefore || !mainAfter || !mainDefinition || materialDefinition?.kind !== 'monster') return null;

  const special = action.type === 'fusion-special';
  return {
    special,
    mainDefinition,
    materialDefinition,
    mainBefore,
    mainAfter,
    materialGrowth: beforePlayer.tournamentGrowth?.[materialCard.instanceId] ?? null,
    mainName: mainBefore.specialForm ?? mainDefinition.name,
    materialName: materialDefinition.name,
    resultName: mainAfter.specialForm ?? mainDefinition.name,
    deltaSp: Math.max(0, (mainAfter.maxLife + mainAfter.atkBase + mainAfter.defBase)
      - (mainBefore.maxLife + mainBefore.atkBase + mainBefore.defBase)),
  };
}

function fusionCard(definition, unit = null, growth = null, label) {
  const cinematicUnit = unit ? {
    ...unit,
    actionPoints: Math.max(1, unit.actionPoints ?? 0),
    summonedThisTurn: false,
    stunnedThisTurn: false,
  } : null;
  return renderCard({
    definition,
    unit: cinematicUnit,
    growth,
    interactive: false,
    showMonsterEffect: false,
    label,
  });
}

export async function playFusionAnimation({ model, speed = 'standard', onReveal = null }) {
  if (!model || typeof document === 'undefined') {
    onReveal?.();
    return;
  }

  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const duration = fusionAnimationDuration({ speed, special: model.special, reducedMotion });
  const overlay = el('div', {
    className: `fusion-cinematic ${model.special ? 'special' : 'normal'} ${speed === 'fast' ? 'fast' : ''} ${reducedMotion ? 'reduced-motion' : ''}`,
    attrs: {
      role: 'status',
      'aria-live': 'assertive',
      'aria-label': model.special
        ? `${model.mainName}と${model.materialName}が${model.resultName}へ特殊合体`
        : `${model.mainName}と${model.materialName}が通常合体`,
      style: `--fusion-duration:${duration}ms`,
    },
  }, [
    el('div', { className: 'fusion-cinematic-backdrop' }),
    el('div', { className: 'fusion-rays', attrs: { 'aria-hidden': 'true' } }),
    el('header', { className: 'fusion-cinematic-title' }, [
      el('small', { text: model.special ? 'AWAKEN THE HIDDEN FORM' : 'COMBINE THE POWER' }),
      el('strong', { text: model.special ? 'SPECIAL FUSION' : 'FUSION' }),
      el('span', { text: model.special ? '特殊合体' : '通常合体' }),
    ]),
    el('div', { className: 'fusion-cinematic-stage' }, [
      el('div', { className: 'fusion-source fusion-main' }, [
        fusionCard(model.mainDefinition, model.mainBefore, null, `メイン ${model.mainName}`),
        el('b', { text: model.mainName }),
      ]),
      el('div', { className: 'fusion-core', attrs: { 'aria-hidden': 'true' } }, [
        el('i', { className: 'fusion-ring ring-outer' }),
        el('i', { className: 'fusion-ring ring-inner' }),
        el('strong', { text: model.special ? '✦' : '＋' }),
      ]),
      el('div', { className: 'fusion-source fusion-material' }, [
        fusionCard(model.materialDefinition, null, model.materialGrowth, `素材 ${model.materialName}`),
        el('b', { text: model.materialName }),
      ]),
      el('div', { className: 'fusion-result' }, [
        el('div', { className: 'fusion-result-halo', attrs: { 'aria-hidden': 'true' } }),
        fusionCard(model.mainDefinition, model.mainAfter, null, `合体結果 ${model.resultName}`),
      ]),
      el('div', { className: 'fusion-particles', attrs: { 'aria-hidden': 'true' } },
        Array.from({ length: model.special ? 16 : 10 }, (_, index) => el('i', {
          attrs: { style: `--particle-angle:${index * (360 / (model.special ? 16 : 10))}deg;--particle-delay:${(index % 5) * -0.07}s` },
        }))),
    ]),
    el('footer', { className: 'fusion-cinematic-copy' }, [
      el('span', { text: `${model.mainName} ＋ ${model.materialName}` }),
      el('strong', { text: model.special ? model.resultName : `${model.resultName} 強化` }),
      el('small', { text: `TOTAL SP +${model.deltaSp}` }),
    ]),
  ]);

  document.body.append(overlay);
  await delay(Math.round(duration * .58));
  onReveal?.();
  await delay(Math.round(duration * .42));
  overlay.remove();
}

import { el } from './dom.js';
import { renderCard } from './card-renderer.js';

const TIMINGS = Object.freeze({ standard: 3300, fast: 1180, reduced: 820 });

function delay(ms) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function unitById(player, unitId) {
  return player?.board?.find((unit) => unit?.id === unitId) ?? null;
}

export function awakeningAnimationDuration({ speed = 'standard', reducedMotion = false } = {}) {
  return reducedMotion ? TIMINGS.reduced : speed === 'fast' ? TIMINGS.fast : TIMINGS.standard;
}

export function createAwakeningAnimationModel({ action, beforePlayer, afterPlayer, masterIndex }) {
  if (action?.type !== 'awaken') return null;
  const targetBefore = unitById(beforePlayer, action.unitId);
  const materialBefore = unitById(beforePlayer, action.materialUnitId);
  const targetAfter = unitById(afterPlayer, action.unitId);
  const targetDefinition = targetBefore ? masterIndex.monsters.get(targetBefore.sourceMasterId) : null;
  const materialDefinition = materialBefore ? masterIndex.monsters.get(materialBefore.sourceMasterId) : null;
  if (!targetBefore || !materialBefore || !targetAfter || !targetDefinition || !materialDefinition) return null;
  return {
    targetBefore,
    targetAfter,
    materialBefore,
    targetDefinition,
    materialDefinition,
    targetName: targetAfter.specialForm ?? targetAfter.name ?? targetDefinition.name,
    materialName: materialBefore.specialForm ?? materialBefore.name ?? materialDefinition.name,
    abilityName: targetAfter.awakeningAbilityName ?? action.preview?.abilityName ?? '覚醒能力',
    abilityEffect: targetAfter.awakeningAbilityEffect ?? action.preview?.abilityEffect ?? '',
    abilityLimit: targetAfter.awakeningAbilityLimit ?? action.preview?.abilityLimit ?? '常時',
  };
}

function cinematicCard(definition, unit, label) {
  return renderCard({
    definition,
    unit: { ...unit, actionPoints: Math.max(1, unit.actionPoints ?? 0), summonedThisTurn: false, stunnedThisTurn: false },
    interactive: false,
    showMonsterEffect: false,
    label,
  });
}

export async function playAwakeningAnimation({ model, speed = 'standard', onReveal = null }) {
  if (!model || typeof document === 'undefined') {
    onReveal?.();
    return;
  }
  const reducedMotion = globalThis.matchMedia?.('(prefers-reduced-motion: reduce)').matches === true;
  const duration = awakeningAnimationDuration({ speed, reducedMotion });
  const overlay = el('div', {
    className: `awakening-cinematic${speed === 'fast' ? ' fast' : ''}${reducedMotion ? ' reduced-motion' : ''}`,
    attrs: {
      role: 'status',
      'aria-live': 'assertive',
      'aria-label': `${model.materialName}を捧げ、${model.targetName}が覚醒。${model.abilityName}が開花`,
      style: `--awakening-duration:${duration}ms`,
    },
  }, [
    el('div', { className: 'awakening-cinematic-backdrop' }),
    el('div', { className: 'awakening-cinematic-eclipse', attrs: { 'aria-hidden': 'true' } }),
    el('div', { className: 'awakening-cinematic-rift', attrs: { 'aria-hidden': 'true' } },
      Array.from({ length: 9 }, (_, index) => el('i', { attrs: { style: `--rift:${index}` } }))),
    el('div', { className: 'awakening-cinematic-vortex', attrs: { 'aria-hidden': 'true' } }, [
      el('i', { className: 'awakening-rite-ring rite-a' }),
      el('i', { className: 'awakening-rite-ring rite-b' }),
      el('i', { className: 'awakening-rite-ring rite-c' }),
      el('i', { className: 'awakening-rite-ring rite-d' }),
      el('b', { text: '醒' }),
    ]),
    el('header', { className: 'awakening-cinematic-title' }, [
      el('small', { text: 'BREAK THE LIMIT · RELEASE THE SOUL' }),
      el('strong', { text: 'ULTIMATE AWAKENING' }),
      el('span', { text: '極 限 覚 醒' }),
    ]),
    el('div', { className: 'awakening-cinematic-stage' }, [
      el('div', { className: 'awakening-sacrifice-card' }, [
        cinematicCard(model.materialDefinition, model.materialBefore, `覚醒素材 ${model.materialName}`),
        el('b', { text: model.materialName }),
        el('small', { text: 'SACRIFICE' }),
      ]),
      el('div', { className: 'awakening-vessel-card' }, [
        cinematicCard(model.targetDefinition, model.targetBefore, `覚醒前 ${model.targetName}`),
      ]),
      el('div', { className: 'awakening-result-card' }, [
        el('div', { className: 'awakening-result-halo', attrs: { 'aria-hidden': 'true' } }),
        cinematicCard(model.targetDefinition, model.targetAfter, `覚醒後 ${model.targetName}`),
      ]),
      el('div', { className: 'awakening-soul-particles', attrs: { 'aria-hidden': 'true' } },
        Array.from({ length: 30 }, (_, index) => el('i', {
          attrs: { style: `--soul-angle:${index * 12}deg;--soul-delay:${(index % 10) * -0.045}s` },
        }))),
    ]),
    el('footer', { className: 'awakening-cinematic-copy' }, [
      el('small', { text: `LIFE +15  ·  ATK +15  ·  DEF +15  /  ${model.abilityLimit}` }),
      el('strong', { text: model.abilityName }),
      el('span', { text: model.abilityEffect }),
    ]),
    el('div', { className: 'awakening-cinematic-flash', attrs: { 'aria-hidden': 'true' } }),
  ]);

  document.body.append(overlay);
  await delay(Math.round(duration * .66));
  onReveal?.();
  await delay(Math.round(duration * .34));
  overlay.remove();
}

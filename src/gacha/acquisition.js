export const FACTIONS = Object.freeze(['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物']);

export const LEGACY_FACTION_ALIASES = Object.freeze({
  '無機': '機鋼',
  '創造': '神造',
});

export function canonicalFaction(value) {
  const faction = String(value ?? '');
  return LEGACY_FACTION_ALIASES[faction] ?? faction;
}

export function legacyFactionFor(value) {
  const faction = canonicalFaction(value);
  return Object.entries(LEGACY_FACTION_ALIASES).find(([, current]) => current === faction)?.[0] ?? null;
}

export const TROPHY_BREEDER_IDS = Object.freeze(
  [
    ...Array.from({ length: 12 }, (_, index) => `breeder-${String(index + 29).padStart(3, '0')}`),
    ...Array.from({ length: 6 }, (_, index) => `breeder-${String(index + 47).padStart(3, '0')}`),
  ],
);

export const BOOSTER_MONSTER_IDS = Object.freeze(
  Array.from({ length: 12 }, (_, index) => `monster-${String(index + 19).padStart(3, '0')}`),
);

const trophyIds = new Set(TROPHY_BREEDER_IDS);
const boosterIds = new Set(BOOSTER_MONSTER_IDS);

export function acquisitionOrigin(definition) {
  if (!definition) return 'unknown';
  if (trophyIds.has(definition.id)) return 'trophy';
  if (boosterIds.has(definition.id)) return 'booster';
  return 'core';
}

export function isPackEligible(definition) {
  return acquisitionOrigin(definition) !== 'trophy';
}

export function isNormalCpuEligible(definition) {
  return acquisitionOrigin(definition) !== 'booster';
}

export function acquisitionLabel(definition) {
  const origin = acquisitionOrigin(definition);
  if (origin === 'trophy') return '奪取限定';
  if (origin === 'booster') return 'ブースター限定';
  return '汎用';
}

export function normalStealVariant(card) {
  return {
    masterId: card.masterId,
    artVariantId: 'base',
    finish: 'normal',
    origin: 'capture',
  };
}

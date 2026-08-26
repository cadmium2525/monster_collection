import { FACTIONS } from './acquisition.js';

export const PACK_COST = 300;
export const PACK_SIZE = 5;

const PACK_DETAILS = Object.freeze({
  '無機': Object.freeze({ id: 'pack-inorganic', name: '機鋼の覚醒', sigil: '機', color: '#48d7f2', description: '無機モンスターと装甲戦術を中心に収録。' }),
  '創造': Object.freeze({ id: 'pack-creation', name: '創世の錬成', sigil: '創', color: '#f2c760', description: '創造モンスターと技巧的な支援を中心に収録。' }),
  '幻霊': Object.freeze({ id: 'pack-spirit', name: '幽界の残響', sigil: '幻', color: '#7fe6ca', description: '幻霊モンスターと継戦戦術を中心に収録。' }),
  '魔族': Object.freeze({ id: 'pack-demon', name: '深紅の盟約', sigil: '魔', color: '#d96bce', description: '魔族モンスターと攻撃的な指示を中心に収録。' }),
  '獣族': Object.freeze({ id: 'pack-beast', name: '牙王の群れ', sigil: '獣', color: '#ed9b50', description: '獣族モンスターと連続攻勢を中心に収録。' }),
  '怪物': Object.freeze({ id: 'pack-monster', name: '異形の胎動', sigil: '怪', color: '#9f78ea', description: '怪物モンスターと進化戦術を中心に収録。' }),
});

export const BOOSTER_PACKS = Object.freeze(FACTIONS.map((faction) => Object.freeze({
  faction,
  cost: PACK_COST,
  cards: PACK_SIZE,
  ...PACK_DETAILS[faction],
})));

export function boosterPack(faction) {
  return BOOSTER_PACKS.find((pack) => pack.faction === faction) ?? null;
}

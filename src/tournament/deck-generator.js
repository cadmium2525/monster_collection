import { assertLegalDeck, normalizeDeckCards } from '../battle/deck.js';
import { SeededRng } from '../core/rng.js';
import { analyzeDeck, scoreGeneratedDeck } from './deck-analyzer.js';
import { isNormalCpuEligible } from '../gacha/acquisition.js';

export const DECK_THEMES = Object.freeze(['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物', '混合']);

export const GENERATOR_CONFIG = Object.freeze({
  bronze: { candidates: 1, monsters: 16, targetedRecipes: 1, recipeDensity: 1, themeTarget: 6, selectionNoise: 14 },
  silver: { candidates: 4, monsters: 15, targetedRecipes: 2, recipeDensity: 1, themeTarget: 7, selectionNoise: 7 },
  gold: { candidates: 12, monsters: 15, targetedRecipes: 3, recipeDensity: 2, themeTarget: 8, selectionNoise: 2 },
  legend: { candidates: 64, monsters: 15, targetedRecipes: 5, recipeDensity: 2, themeTarget: 11, selectionNoise: 0 },
});

const GENERIC_BREEDERS = [
  'breeder-001', 'breeder-002', 'breeder-003', 'breeder-004', 'breeder-005', 'breeder-006', 'breeder-007', 'breeder-008',
  'breeder-021', 'breeder-022', 'breeder-023', 'breeder-024', 'breeder-025', 'breeder-026', 'breeder-027', 'breeder-028',
  'breeder-041', 'breeder-042', 'breeder-043', 'breeder-044', 'breeder-045', 'breeder-046',
  'breeder-053', 'breeder-054', 'breeder-055',
];

function addCopy(counts, id, max = 3) {
  const current = counts.get(id) ?? 0;
  if (current >= max) return false;
  counts.set(id, current + 1);
  return true;
}

function monsterDefinitionByName(masterIndex, name) {
  const monster = masterIndex.monstersByName.get(name);
  if (!monster) throw new Error(`Unknown monster in fusion recipe: ${name}`);
  return monster;
}

function chooseTargetRecipes(masterIndex, theme, count, rng) {
  // Normal tournament CPUs may carry capture-only cards, but booster monsters
  // remain player assets. Therefore their deliberately targeted fusion routes
  // must also be buildable entirely from normal-CPU-eligible monsters.
  const all = masterIndex.data.fusions.filter((fusion) => (
    isNormalCpuEligible(monsterDefinitionByName(masterIndex, fusion.main))
    && isNormalCpuEligible(monsterDefinitionByName(masterIndex, fusion.material))
  ));
  const themed = theme === '混合' ? all : all.filter((fusion) => {
    const main = monsterDefinitionByName(masterIndex, fusion.main);
    const material = monsterDefinitionByName(masterIndex, fusion.material);
    return main.faction === theme || material.faction === theme;
  });
  return rng.shuffle(themed).slice(0, Math.min(count, themed.length));
}

function fillMonsterCounts(masterIndex, theme, config, recipes, rng) {
  const counts = new Map();
  for (const fusion of recipes) {
    const main = monsterDefinitionByName(masterIndex, fusion.main);
    const material = monsterDefinitionByName(masterIndex, fusion.material);
    for (let copy = 0; copy < config.recipeDensity; copy += 1) {
      addCopy(counts, main.id);
      addCopy(counts, material.id);
    }
  }

  const themed = theme === '混合'
    ? rng.shuffle(masterIndex.data.monsters.filter(isNormalCpuEligible))
    : rng.shuffle(masterIndex.data.monsters.filter((monster) => monster.faction === theme && isNormalCpuEligible(monster)));
  let themedCopies = [...counts].reduce((sum, [id, copies]) => sum + (masterIndex.monsters.get(id).faction === theme ? copies : 0), 0);
  let cursor = 0;
  while (theme !== '混合' && themedCopies < config.themeTarget) {
    const monster = themed[cursor % themed.length];
    if (addCopy(counts, monster.id)) themedCopies += 1;
    cursor += 1;
    if (cursor > 100) break;
  }

  const all = rng.shuffle(masterIndex.data.monsters.filter(isNormalCpuEligible)).sort((a, b) => {
    const themedA = theme !== '混合' && a.faction === theme ? 1 : 0;
    const themedB = theme !== '混合' && b.faction === theme ? 1 : 0;
    const efficiency = (monster) => (monster.base.life + monster.base.atk + monster.base.def) / monster.summonTp;
    return themedB - themedA || efficiency(b) - efficiency(a);
  });
  cursor = 0;
  const total = () => [...counts.values()].reduce((sum, copies) => sum + copies, 0);
  while (total() < config.monsters) {
    const monster = all[cursor % all.length];
    addCopy(counts, monster.id);
    cursor += 1;
    if (cursor > 400) throw new Error('Unable to fill CPU monster slots');
  }
  while (total() > config.monsters) {
    const requiredNames = new Set(recipes.flatMap((fusion) => [fusion.main, fusion.material]));
    const removable = [...counts.entries()].filter(([id, copies]) => {
      const minimum = requiredNames.has(masterIndex.monsters.get(id).name) ? 1 : 0;
      return copies > minimum;
    }).reverse();
    const entry = removable.find(([id]) => !requiredNames.has(masterIndex.monsters.get(id).name)) ?? removable[0];
    if (!entry) throw new Error('Unable to trim monster slots without breaking a targeted fusion recipe');
    counts.set(entry[0], entry[1] - 1);
    if (!counts.get(entry[0])) counts.delete(entry[0]);
  }
  return counts;
}

function genericBreederScore(masterIndex, id, theme, rank) {
  const card = masterIndex.cards.get(id);
  if (!card) return 0;
  let score = 1;
  if (rank === 'legend') {
    if (['強化解除指示', '状態浄化', '反転防壁'].includes(card.name)) score += 4;
    if (['合体妨害工作', '技術封鎖', '緊急撤退指示'].includes(card.name)) score += 3;
    if (['融合強化指示', '素材探索', '全体防御命令', 'TP前借り'].includes(card.name)) score += 2;
    if (card.name === '粛清') score += 5;
    if (['封印の鎖', '道連れの契約'].includes(card.name)) score += 4;
  }
  if (theme === '混合' && card.faction == null) score += 1;
  return score;
}

function selectBreeders(masterIndex, theme, rng, rank) {
  const factionBreeders = theme === '混合'
    ? []
    : masterIndex.data.breeders.filter((card) => card.name.startsWith(theme)).map((card) => card.id);
  const generic = rng.shuffle(GENERIC_BREEDERS.filter((id) => masterIndex.cards.has(id)))
    .sort((a, b) => genericBreederScore(masterIndex, b, theme, rank) - genericBreederScore(masterIndex, a, theme, rank));
  if (rank === 'bronze') return rng.shuffle([...factionBreeders, ...generic]).slice(0, 4);
  if (theme === '混合') return generic.slice(0, 4);
  return [...rng.shuffle(factionBreeders).slice(0, 2), ...generic.slice(0, 2)];
}

function growthCards(masterIndex, count, theme, rank, rng) {
  const ids = [];
  const byId = masterIndex.cards;
  const monsters = masterIndex.data.monsters.filter((monster) => isNormalCpuEligible(monster) && (theme === '混合' || monster.faction === theme));
  const attackers = monsters.filter((monster) => monster.role === 'アタッカー').length;
  const tanks = monsters.filter((monster) => monster.role === 'タンク').length;
  const weights = {
    'training-life': 3,
    'training-atk': 2 + attackers,
    'training-def': 2 + tanks,
    'shugyo-attack': rank === 'bronze' ? 2 : 4 + attackers,
    'shugyo-defense': rank === 'bronze' ? 2 : 4 + tanks,
  };
  const choices = Object.keys(weights).filter((id) => byId.has(id));
  while (ids.length < count) ids.push(rng.weightedChoice(choices, (id) => weights[id]));
  return ids;
}

function oneCandidate(masterIndex, rank, theme, rng, serial) {
  const config = GENERATOR_CONFIG[rank];
  const recipes = chooseTargetRecipes(masterIndex, theme, config.targetedRecipes, rng.fork(`recipes:${serial}`));
  const monsters = fillMonsterCounts(masterIndex, theme, config, recipes, rng.fork(`monsters:${serial}`));
  const ids = [];
  for (const [id, copies] of monsters) for (let copy = 0; copy < copies; copy += 1) ids.push(id);
  ids.push(...selectBreeders(masterIndex, theme, rng.fork(`breeders:${serial}`), rank));
  ids.push(...growthCards(masterIndex, 40 - ids.length, theme, rank, rng.fork(`growth:${serial}`)));
  const cards = normalizeDeckCards(rng.shuffle(ids), `cpu-${rank}-${serial}`);
  assertLegalDeck(cards, masterIndex);
  const targetedFusionIds = recipes.map((fusion) => fusion.id);
  const analysis = analyzeDeck(cards, masterIndex, { theme, targetedFusionIds });
  const qualityScore = scoreGeneratedDeck(analysis, rank) + rng.next() * config.selectionNoise;
  return { cards, theme, rank, targetedFusionIds, analysis, qualityScore };
}

export function generateCpuDeck({ masterIndex, rank, rng, theme = null, seedLabel = 'cpu' }) {
  const config = GENERATOR_CONFIG[rank];
  if (!config) throw new Error(`Unknown tournament rank: ${rank}`);
  const selectedTheme = theme ?? rng.choice(DECK_THEMES);
  if (!DECK_THEMES.includes(selectedTheme)) throw new Error(`Unknown deck theme: ${selectedTheme}`);
  const candidates = Array.from({ length: config.candidates }, (_, index) => oneCandidate(
    masterIndex,
    rank,
    selectedTheme,
    rng.fork(`${seedLabel}:candidate:${index + 1}`),
    index + 1,
  ));
  candidates.sort((a, b) => b.qualityScore - a.qualityScore);
  return {
    ...candidates[0],
    candidateCount: candidates.length,
    candidateQuality: candidates.map((candidate) => candidate.qualityScore),
  };
}

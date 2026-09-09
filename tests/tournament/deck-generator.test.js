import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRng } from '../../src/core/rng.js';
import { validateDeck } from '../../src/battle/deck.js';
import { DECK_THEMES, GENERATOR_CONFIG, generateCpuDeck } from '../../src/tournament/index.js';
import { masterIndex } from '../helpers.js';

test('every rank/theme generator returns a legal 40-card deck and separate fusion metrics', () => {
  for (const rank of Object.keys(GENERATOR_CONFIG)) {
    for (const theme of DECK_THEMES) {
      const generated = generateCpuDeck({ masterIndex, rank, theme, rng: new SeededRng(`${rank}-${theme}`) });
      assert.equal(validateDeck(generated.cards, masterIndex).valid, true, `${rank}/${theme}`);
      assert.equal(generated.cards.length, 40);
      assert.equal(generated.candidateCount, GENERATOR_CONFIG[rank].candidates);
      assert.equal(typeof generated.analysis.fusion.targetedRecipeCount, 'number');
      assert.equal(typeof generated.analysis.fusion.actualRecipeCount, 'number');
      assert.ok(generated.analysis.fusion.actualRecipeCount >= generated.analysis.fusion.completedTargetedRecipeCount);
    }
  }
});

test('upper-rank candidate selection improves average quality without cost-only cheating', () => {
  const average = (rank) => {
    let score = 0;
    let tp = 0;
    for (let index = 0; index < 12; index += 1) {
      const generated = generateCpuDeck({ masterIndex, rank, theme: '魔族', rng: new SeededRng(`quality-${index}`) });
      score += generated.qualityScore;
      tp += generated.analysis.totalPlayTp;
    }
    return { score: score / 12, tp: tp / 12 };
  };
  const bronze = average('bronze');
  const legend = average('legend');
  assert.ok(legend.score > bronze.score);
  assert.ok(Math.abs(legend.tp - bronze.tp) < 50, 'strength must not be produced by extreme total TP inflation');
});

test('Gold and Legend faction decks carry both halves of their new combo package', () => {
  const pairs = {
    '機鋼': ['breeder-056', 'breeder-057'],
    '神造': ['breeder-058', 'breeder-059'],
    '幻霊': ['breeder-060', 'breeder-061'],
    '魔族': ['breeder-062', 'breeder-063'],
    '獣族': ['breeder-064', 'breeder-065'],
    '怪物': ['breeder-066', 'breeder-067'],
  };
  for (const rank of ['gold', 'legend']) {
    for (const [theme, expected] of Object.entries(pairs)) {
      const generated = generateCpuDeck({ masterIndex, rank, theme, rng: new SeededRng(`combo:${rank}:${theme}`) });
      const ids = new Set(generated.cards.map((entry) => entry.masterId));
      assert.equal(expected.every((id) => ids.has(id)), true, `${rank}/${theme} should include ${expected.join(' + ')}`);
    }
  }
});

test('Machine and Demon Legend decks target fusions led by their own classification', () => {
  for (const theme of ['機鋼', '魔族']) {
    const generated = generateCpuDeck({ masterIndex, rank: 'legend', theme, rng: new SeededRng(`primary-routes:${theme}`) });
    assert.equal(generated.targetedFusionIds.length, GENERATOR_CONFIG.legend.targetedRecipes);
    // Normal CPU decks intentionally exclude booster-only monsters, so the
    // three core monsters cap these classifications at 9/15 copies.
    assert.ok(generated.analysis.themePurity >= 0.6);
    for (const fusionId of generated.targetedFusionIds) {
      const fusion = masterIndex.data.fusions.find((candidate) => candidate.id === fusionId);
      assert.ok(fusion);
      const main = masterIndex.monstersByName.get(fusion.main);
      assert.equal(main.faction, theme, `${theme} deck should be led by ${theme}, not only use it as material`);
    }
  }
});

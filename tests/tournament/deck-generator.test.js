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

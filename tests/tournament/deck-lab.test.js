import test from 'node:test';
import assert from 'node:assert/strict';
import { runDeckGenerationLab } from '../../src/tournament/lab.js';
import { masterData } from '../helpers.js';

test('deck lab separates targeted, actual, and accidental fusion-route statistics', () => {
  const report = runDeckGenerationLab({ masterData, seed: 'deck-lab-test', runsPerTheme: 1 });
  assert.equal(report.samples.length, 4 * 7);
  for (const rank of ['bronze', 'silver', 'gold', 'legend']) {
    const row = report.ranks[rank];
    assert.equal(row.samples, 7);
    assert.ok(row.actualRecipes >= row.completedTargetedRecipes);
    assert.ok(row.actualRecipes >= row.accidentalRecipes);
    assert.ok(row.candidateCount >= 1);
  }
  assert.ok(report.ranks.legend.candidateCount > report.ranks.bronze.candidateCount);
  assert.equal(report.samples.every((sample) => sample.completedTargetedRecipeCount === sample.targetedRecipeCount), true);
});

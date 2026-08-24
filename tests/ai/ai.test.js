import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRng } from '../../src/core/rng.js';
import { actionKey } from '../../src/battle/state.js';
import { runAutomatedBattle } from '../../src/battle/simulation.js';
import { AI_LEVELS, chooseAiAction, createAiPolicy } from '../../src/ai/index.js';
import { engine } from '../helpers.js';

test('every AI level returns a legal action without changing battle state', () => {
  for (const level of AI_LEVELS) {
    const battle = engine({ seed: `legal-${level}` });
    const before = battle.getState();
    const playerId = battle.state.currentPlayerId;
    const action = chooseAiAction(level, battle, playerId, new SeededRng(`ai-${level}`), { timeBudgetMs: 25 });
    const legalKeys = new Set(battle.getLegalActions(playerId).map(actionKey));
    assert.ok(legalKeys.has(actionKey(action)), `${level} returned illegal action`);
    assert.deepEqual(battle.getState(), before, `${level} mutated the source engine during thought`);
  }
});

test('all AI policies can finish a seeded game under the shared engine rules', () => {
  for (const level of AI_LEVELS) {
    const battle = engine({ seed: `finish-${level}` });
    const policy = createAiPolicy(level, { timeBudgetMs: 6, beamWidth: 4, branchLimit: 3, maxDepth: 3 });
    const result = runAutomatedBattle(battle, { seed: `policy-${level}`, chooseAction: policy, maxActions: 2500 });
    assert.equal(result.state.status, 'finished');
    assert.ok(result.result.round <= 40);
  }
});

test('AI choice does not depend on opponent hidden hand identities', () => {
  for (const level of AI_LEVELS) {
    const a = engine({ seed: `hidden-${level}`, firstPlayerId: 'p1' });
    const b = a.clone();
    const opponentA = a.player('p2');
    const opponentB = b.player('p2');
    const replacement = opponentB.deck.splice(0, opponentB.hand.length);
    opponentB.deck.push(...opponentB.hand);
    opponentB.hand = replacement;
    assert.equal(opponentA.hand.length, opponentB.hand.length);
    const options = { timeBudgetMs: 20, beamWidth: 5, branchLimit: 4, maxDepth: 4 };
    const choiceA = chooseAiAction(level, a, 'p1', new SeededRng(`same-${level}`), options);
    const choiceB = chooseAiAction(level, b, 'p1', new SeededRng(`same-${level}`), options);
    assert.equal(actionKey(choiceA), actionKey(choiceB), `${level} used hidden opponent cards`);
  }
});

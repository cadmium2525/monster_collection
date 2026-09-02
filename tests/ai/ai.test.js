import test from 'node:test';
import assert from 'node:assert/strict';
import { SeededRng } from '../../src/core/rng.js';
import { actionKey } from '../../src/battle/state.js';
import { runAutomatedBattle } from '../../src/battle/simulation.js';
import {
  AI_LEVELS,
  chooseAiAction,
  createAiPolicy,
  searchPublicResponseSequences,
} from '../../src/ai/index.js';
import { card, engine, masterIndex, moveByName, placeUnit, setHand } from '../helpers.js';

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

test('AI does not waste material search when the inspected cards contain no monster', () => {
  for (const level of AI_LEVELS) {
    const battle = engine({ seed: `empty-material-search-${level}` });
    const player = battle.player('p1');
    player.deck.splice(-5, 5, ...Array.from({ length: 5 }, (_, index) => card(
      index % 2 === 0 ? 'training-atk' : 'training-def',
      `empty-search-support-${level}-${index}`,
    )));
    setHand(battle, 'p1', [card('breeder-022', `empty-search-${level}`)]);

    const search = battle.getLegalActions('p1').find((action) => action.breederId === 'breeder-022');
    assert.equal(search?.meta?.emptySearch, true);
    const selected = chooseAiAction(level, battle, 'p1', new SeededRng(`empty-search-ai-${level}`), {
      deterministicSearch: true,
      beamWidth: 3,
      branchLimit: 3,
      maxDepth: 2,
    });
    assert.equal(selected.type, 'end-turn', `${level} should preserve the card and TP`);
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
    // Hidden-information invariance must test the same complete search tree on
    // fast and slow CI hosts. Production keeps its wall-clock cap; validation
    // uses the same bounded beam/depth with the clock cutoff disabled.
    const options = { deterministicSearch: true, beamWidth: 5, branchLimit: 4, maxDepth: 4 };
    const choiceA = chooseAiAction(level, a, 'p1', new SeededRng(`same-${level}`), options);
    const choiceB = chooseAiAction(level, b, 'p1', new SeededRng(`same-${level}`), options);
    assert.equal(actionKey(choiceA), actionKey(choiceB), `${level} used hidden opponent cards`);
  }
});

test('Champion continuation does not inspect its own next draw identity', () => {
  const a = engine({ seed: 'hidden-next-draw', firstPlayerId: 'p1' });
  const b = a.clone();
  const future = b.player('p1').deck;
  [future[0], future[future.length - 1]] = [future[future.length - 1], future[0]];
  const options = {
    deterministicSearch: true,
    beamWidth: 5,
    branchLimit: 4,
    maxDepth: 3,
    replyBeamWidth: 4,
    replyBranchLimit: 3,
    replyDepth: 2,
    continuationBeamWidth: 3,
    continuationBranchLimit: 3,
    continuationDepth: 2,
  };
  const choiceA = chooseAiAction('champion', a, 'p1', new SeededRng('same-next-draw'), options);
  const choiceB = chooseAiAction('champion', b, 'p1', new SeededRng('same-next-draw'), options);
  assert.equal(actionKey(choiceA), actionKey(choiceB));
});

test('Champion reply search considers a sequence of public board attacks', () => {
  const battle = engine({ seed: 'champion-public-reply', firstPlayerId: 'p1' });
  battle.state.currentPlayerId = 'p2';
  battle.player('p2').tp = 10;
  for (const [slot, name] of ['ヒノトリ', 'ギアセンチネル'].entries()) {
    const attacker = placeUnit(battle, 'p2', name, slot);
    attacker.equippedMoveIds = [attacker.equippedMoveIds.find((moveId) => masterIndex.moves.get(moveId)?.power != null)];
  }
  for (const [slot, name] of ['ゴーレム', 'モノリス', 'デュラハン'].entries()) {
    const defender = placeUnit(battle, 'p1', name, slot);
    defender.maxLife = 300;
    defender.life = 300;
  }
  const before = battle.getState();
  const replies = searchPublicResponseSequences(battle, 'p2', 'p1', {
    replyDepth: 3,
    replyBeamWidth: 8,
    replyBranchLimit: 5,
    replyWidth: 12,
  });
  assert.ok(replies.some((reply) => reply.actions.length >= 2));
  assert.ok(replies.every((reply) => reply.actions.every((action) => action.type === 'move')));
  assert.deepEqual(battle.getState(), before);
});

test('Champion keeps an immediate tactical floor when its deep-search clock is exhausted', () => {
  const battle = engine({ seed: 'champion-free-attack', firstPlayerId: 'p1' });
  const unit = placeUnit(battle, 'p1', 'ヒノトリ', 0);
  unit.equippedMoveIds = [moveByName('ヒノトリ', '火炎').id];
  battle.player('p2').board = [null, null, null];
  const action = chooseAiAction('champion', battle, 'p1', new SeededRng('champion-free-attack'), { timeBudgetMs: 1 });
  assert.equal(action.type, 'move');
  assert.equal(action.targetPlayerId, 'p2');
});

test('Champion recognizes a public enemy enhancement and uses its counter card', () => {
  const battle = engine({ seed: 'champion-dispel', firstPlayerId: 'p1' });
  const own = placeUnit(battle, 'p1', 'モノリス', 0, { actionPoints: 0 });
  own.summonedThisTurn = true;
  const threat = placeUnit(battle, 'p2', 'ドラゴン', 0);
  threat.atkMod = 30;
  threat.statuses.nextDamageBonus = .3;
  setHand(battle, 'p1', [card('breeder-041', 'champion-counter')]);
  const action = chooseAiAction('champion', battle, 'p1', new SeededRng('champion-counter'), {
    deterministicSearch: true,
    beamWidth: 5,
    branchLimit: 4,
    maxDepth: 3,
    replyDepth: 2,
    continuationDepth: 1,
  });
  assert.equal(action.type, 'breeder');
  assert.equal(action.breederId, 'breeder-041');
  assert.equal(action.targetUnitId, threat.id);
});

test('Silver takes a free attack instead of ending a favorable turn', () => {
  const battle = engine({ seed: 'silver-free-attack', firstPlayerId: 'p1' });
  const unit = placeUnit(battle, 'p1', 'ヒノトリ', 0);
  unit.equippedMoveIds = [moveByName('ヒノトリ', '火炎').id];
  battle.player('p2').board = [null, null, null];
  const action = chooseAiAction('silver', battle, 'p1', new SeededRng('silver-free-attack'));
  assert.equal(action.type, 'move');
  assert.equal(action.targetPlayerId, 'p2');
});

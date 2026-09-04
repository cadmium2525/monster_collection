import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  cardUseAnimationDuration,
  cardUseAnimationTimings,
  createCardUseAnimationModel,
  isCardUseAction,
} from '../../src/ui/card-use-animation.js';

function player(id, hand = [], board = []) {
  return { id, hand, board };
}

function card(instanceId, masterId) {
  return { instanceId, masterId, artVariantId: 'base', finish: 'normal' };
}

function index(...definitions) {
  return { cards: new Map(definitions.map((definition) => [definition.id, definition])) };
}

test('player and CPU card use share exactly the same standard and fast timings', () => {
  assert.deepEqual(cardUseAnimationTimings({ speed: 'standard' }), { reveal: 420, descriptionHold: 900, copyOut: 200, preTravel: 300, travel: 420, impact: 260 });
  assert.deepEqual(cardUseAnimationTimings({ speed: 'fast' }), { reveal: 130, descriptionHold: 260, copyOut: 70, preTravel: 90, travel: 150, impact: 100 });
  assert.equal(cardUseAnimationDuration(), 2500);
  assert.equal(cardUseAnimationDuration({ speed: 'fast' }), 800);
  assert.equal(cardUseAnimationDuration({ reducedMotion: true }), 680);
});

test('targeted Training and shugyo resolve into the selected monster', () => {
  const training = { id: 'training-atk', kind: 'training', name: 'ATKトレーニング', tp: 2, stat: 'atk', amount: 5, effect: '対象モンスター1体のATK+5' };
  const shugyo = { id: 'shugyo-defense', kind: 'shugyo', name: '防御修行', tp: 5, stat: 'def', effect: '対象のLIFEとDEFが各+5～10' };
  const masterIndex = index(training, shugyo);
  const own = player('human', [card('training-card', training.id), card('shugyo-card', shugyo.id)], [{ id: 'unit-1', name: 'クロノギア' }]);
  const enemy = player('cpu');

  const trainingModel = createCardUseAnimationModel({
    action: { type: 'training', cardInstanceId: 'training-card', unitId: 'unit-1' },
    beforePlayer: own,
    beforeOpponent: enemy,
    masterIndex,
    humanPlayerId: 'human',
  });
  assert.equal(trainingModel.tone, 'player');
  assert.equal(trainingModel.channel, 'training');
  assert.equal(trainingModel.outcome, 'ATK +5');
  assert.deepEqual(trainingModel.target, { kind: 'unit', playerId: 'human', unitId: 'unit-1', label: 'クロノギア' });

  const shugyoModel = createCardUseAnimationModel({
    action: { type: 'shugyo', cardInstanceId: 'shugyo-card', unitId: 'unit-1' },
    beforePlayer: own,
    beforeOpponent: enemy,
    masterIndex,
    humanPlayerId: 'human',
  });
  assert.equal(shugyoModel.channel, 'shugyo');
  assert.equal(shugyoModel.outcome, 'LIFE / DEF UP');
});

test('CPU cards are revealed as ENEMY CARD and untargeted effects land on their semantic destination', () => {
  const tp = { id: 'breeder-027', kind: 'breeder', name: 'TP前借り', tp: 1, effect: 'TPを2回復。次の自分ターン開始時のTP-1' };
  const draw = { id: 'breeder-005', kind: 'breeder', name: '緊急補給', tp: 3, effect: 'カードを3枚ドロー（手札上限8）' };
  const lock = { id: 'breeder-042', kind: 'breeder', name: '合体妨害工作', tp: 3, effect: '相手は次のターン、通常合体と特殊合体を実行できない' };
  const masterIndex = index(tp, draw, lock);
  const human = player('human');

  const tpModel = createCardUseAnimationModel({
    action: { type: 'breeder', cardInstanceId: 'tp-card' },
    beforePlayer: player('cpu', [card('tp-card', tp.id)]),
    beforeOpponent: human,
    masterIndex,
    humanPlayerId: 'human',
  });
  assert.equal(tpModel.actorLabel, 'ENEMY CARD');
  assert.equal(tpModel.channel, 'tp');
  assert.equal(tpModel.outcome, 'TP +2');
  assert.deepEqual(tpModel.target, { kind: 'player', playerId: 'cpu', label: '使用者' });

  const drawModel = createCardUseAnimationModel({
    action: { type: 'breeder', cardInstanceId: 'draw-card' },
    beforePlayer: player('cpu', [card('draw-card', draw.id)]),
    beforeOpponent: human,
    masterIndex,
    humanPlayerId: 'human',
  });
  assert.equal(drawModel.channel, 'draw');
  assert.equal(drawModel.outcome, 'DRAW 3');
  assert.deepEqual(drawModel.target, { kind: 'hand', playerId: 'cpu', label: '使用者の手札' });

  const lockModel = createCardUseAnimationModel({
    action: { type: 'breeder', cardInstanceId: 'lock-card' },
    beforePlayer: player('cpu', [card('lock-card', lock.id)]),
    beforeOpponent: human,
    masterIndex,
    humanPlayerId: 'human',
  });
  assert.equal(lockModel.channel, 'disrupt');
  assert.deepEqual(lockModel.target, { kind: 'board', playerId: 'human', label: '相手側全体' });
});

test('non support actions do not create card-use animation models', () => {
  assert.equal(isCardUseAction({ type: 'move' }), false);
  assert.equal(createCardUseAnimationModel({ action: { type: 'move' } }), null);
});

test('battle flow uses one shared card-use cinematic and suppresses the duplicate generic banner', () => {
  const source = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const animation = fs.readFileSync(new URL('../../src/ui/card-use-animation.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(source, /createCardUseAnimationModel/);
  assert.match(source, /if \(cardUseModel\) await playCardUseAnimation/);
  assert.match(source, /targetNode: this\.cardUseTargetNode\(cardUseModel\)/);
  assert.match(source, /if \(isCardUseAction\(action\)\) return;/);
  assert.match(styles, /\.card-use-cinematic\s*\{/);
  assert.match(styles, /\.card-use-impact\.tp/);
  assert.match(styles, /@keyframes card-use-card-reveal/);
  assert.match(styles, /\.card-use-cinematic\.copy-clearing \.card-use-copy/);
  assert.match(animation, /await delay\(timing\.reveal\);\s*await delay\(timing\.descriptionHold\);\s*overlay\.classList\.add\('copy-clearing'\)/s);
  assert.match(animation, /classList\.add\('copy-clearing'\);\s*await delay\(timing\.copyOut\);\s*overlay\.classList\.add\('copy-cleared'\);\s*await delay\(timing\.preTravel\);\s*overlay\.classList\.add\('travelling'\)/s);
});

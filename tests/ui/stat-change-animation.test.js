import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {
  interpolatedStatValue,
  statChangeTimings,
  tpGemStates,
  turnStartTpTransition,
} from '../../src/ui/stat-change-animation.js';
import { BattleScreen } from '../../src/ui/battle-screen.js';
import { card, engine, placeUnit, setHand } from '../helpers.js';

test('TP uses ten compact gems with each red-orange gem representing two TP', () => {
  assert.deepEqual(tpGemStates(9), [...Array(9).fill('active'), 'empty']);
  assert.deepEqual(tpGemStates(10), Array(10).fill('active'));
  assert.deepEqual(tpGemStates(11), ['overcharged', ...Array(9).fill('active')]);
  assert.deepEqual(tpGemStates(13), [...Array(3).fill('overcharged'), ...Array(7).fill('active')]);
  assert.deepEqual(tpGemStates(20), Array(10).fill('overcharged'));
});

test('stat values count naturally between their old and new integer values', () => {
  assert.equal(interpolatedStatValue(15, 20, 0), 15);
  assert.equal(interpolatedStatValue(15, 20, 0.5), 18);
  assert.equal(interpolatedStatValue(15, 20, 1), 20);
  assert.equal(interpolatedStatValue(20, 15, 0.5), 18);
  assert.ok(statChangeTimings().count > statChangeTimings({ speed: 'fast' }).count);
  assert.ok(statChangeTimings({ speed: 'fast' }).count > statChangeTimings({ reducedMotion: true }).count);
});

test('LIFE training produces a red upward value transition on its target monster', () => {
  const battle = engine();
  const unit = placeUnit(battle, 'p1', 'ギアセンチネル', 0);
  setHand(battle, 'p1', [card('training-life', 'life-training')]);
  const screen = Object.create(BattleScreen.prototype);
  screen.engine = battle;
  const before = screen.captureStats();
  const action = battle.getLegalActions().find((candidate) => candidate.type === 'training' && candidate.unitId === unit.id);
  const logStart = battle.state.log.length;
  battle.applyAction(action);
  const change = screen.statChanges(before, action, battle.state.log.slice(logStart))
    .find((entry) => entry.kind === 'unit' && entry.id === unit.id);
  const life = change.values.find((value) => value.key === 'life');
  assert.deepEqual(life, {
    key: 'life', label: 'LIFE', from: before.units.get(unit.id).life,
    to: before.units.get(unit.id).life + 5, direction: 'up',
  });
});

test('turn-start events expose TP debt and maximum-TP modifiers to the presentation layer', () => {
  const loan = engine();
  loan.player('p1').tp = 5;
  setHand(loan, 'p1', [card('breeder-027', 'loan')]);
  loan.applyAction(loan.getLegalActions().find((action) => action.type === 'breeder' && action.breederId === 'breeder-027'));
  loan.applyAction(loan.getLegalActions().find((action) => action.type === 'end-turn'));
  const logStart = loan.state.log.length;
  loan.applyAction(loan.getLegalActions().find((action) => action.type === 'end-turn'));
  const debtTurn = loan.state.log.slice(logStart).find((event) => event.type === 'turn-start' && event.playerId === 'p1');
  assert.equal(debtTurn.tpDebtApplied, 1);
  assert.deepEqual(turnStartTpTransition(debtTurn), { from: 10, to: 9, maxFrom: 10, maxTo: 10 });

  const veteran = engine();
  setHand(veteran, 'p1', [card('breeder-001', 'veteran')]);
  veteran.applyAction(veteran.getLegalActions().find((action) => action.type === 'breeder' && action.breederId === 'breeder-001'));
  veteran.applyAction(veteran.getLegalActions().find((action) => action.type === 'end-turn'));
  const veteranLogStart = veteran.state.log.length;
  veteran.applyAction(veteran.getLegalActions().find((action) => action.type === 'end-turn'));
  const bonusTurn = veteran.state.log.slice(veteranLogStart).find((event) => event.type === 'turn-start' && event.playerId === 'p1');
  assert.equal(bonusTurn.maxTpBonusApplied, 1);
  assert.deepEqual(turnStartTpTransition(bonusTurn), { from: 10, to: 11, maxFrom: 10, maxTo: 11 });

  const pressure = engine();
  setHand(pressure, 'p1', [card('breeder-002', 'pressure')]);
  pressure.applyAction(pressure.getLegalActions().find((action) => action.type === 'breeder' && action.breederId === 'breeder-002'));
  const pressureLogStart = pressure.state.log.length;
  pressure.applyAction(pressure.getLegalActions().find((action) => action.type === 'end-turn'));
  const penaltyTurn = pressure.state.log.slice(pressureLogStart).find((event) => event.type === 'turn-start' && event.playerId === 'p2');
  assert.equal(penaltyTurn.maxTpPenaltyApplied, 1);
  assert.deepEqual(turnStartTpTransition(penaltyTurn), { from: 10, to: 9, maxFrom: 10, maxTo: 9 });
});

test('battle presentation resolves card or move effects before animated stat changes', () => {
  const battleSource = fs.readFileSync(new URL('../../src/ui/battle-screen.js', import.meta.url), 'utf8');
  const styles = fs.readFileSync(new URL('../../styles.css', import.meta.url), 'utf8');
  assert.match(battleSource, /playCardUseAnimation\([\s\S]*?showStatDirections/);
  assert.match(battleSource, /if \(turnStarted\) await this\.showCurrentTurnTransition\(\);\s*await this\.showStatDirections/);
  assert.match(battleSource, /className: state === 'empty' \? '' : state/);
  assert.match(styles, /\.tp-gems i\.overcharged/);
  assert.match(styles, /\.stat-change span\.up \{ color:#ff8a70/);
  assert.match(styles, /\.stat-change span\.down \{ color:#79d8ff/);
  assert.match(styles, /@keyframes stat-value-rise/);
  assert.match(styles, /@keyframes stat-value-fall/);
});

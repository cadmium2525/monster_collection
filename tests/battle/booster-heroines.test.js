import test from 'node:test';
import assert from 'node:assert/strict';
import { applyIncomingModifiers, outgoingDamageMultiplier, resolvedMoveTp } from '../../src/battle/effects.js';
import { createUnit } from '../../src/battle/state.js';
import { engine, masterIndex, monsterByName } from '../helpers.js';

function unitFor(name, life = null) {
  const monster = monsterByName(name);
  const unit = createUnit({
    unitId: `unit-${monster.id}`,
    card: { instanceId: `card-${monster.id}`, masterId: monster.id },
    monster,
    growth: {},
    masterIndex,
    slot: 0,
  });
  unit.summonedThisTurn = false;
  if (life != null) unit.life = life;
  return unit;
}

test('six booster heroines cover every classification with nine moves each', () => {
  const expected = [
    ['アークヴァルキア', '機鋼'], ['セラフィノア', '神造'], ['カスミヨ', '幻霊'],
    ['リリヴェル', '魔族'], ['レオネア', '獣族'], ['ミメシア', '怪物'],
  ];
  for (const [name, faction] of expected) {
    const monster = monsterByName(name);
    assert.equal(monster.faction, faction);
    assert.equal(monster.moveIds.length, 9);
    assert.equal(monster.moveIds.filter((id) => masterIndex.moves.get(id).initial).length, 3);
  }
});

test('new trait engines apply their intended bounded combat effects', () => {
  const machine = unitFor('アークヴァルキア');
  assert.equal(applyIncomingModifiers(machine, 20).damage, 17);

  const phantom = unitFor('カスミヨ');
  assert.equal(phantom.statuses.evadeNext, true);

  const demon = unitFor('リリヴェル', 12);
  const demonMove = masterIndex.moves.get(monsterByName('リリヴェル').moveIds[4]);
  assert.equal(resolvedMoveTp({ effects: { factionMoveDiscount: {} } }, demon, null, demonMove), demonMove.tp - 1);

  const beast = unitFor('レオネア');
  const beastMove = masterIndex.moves.get(monsterByName('レオネア').moveIds[0]);
  assert.equal(outgoingDamageMultiplier(beast, null, beastMove, { board: [] }), 1.15);
  beast.movesUsedThisTurn = 1;
  assert.equal(outgoingDamageMultiplier(beast, null, beastMove, { board: [] }), 1);

  const battle = engine();
  const sacred = unitFor('セラフィノア', 20);
  battle.player('p1').board[0] = sacred;
  battle._applyTurnStartEffects(battle.player('p1'));
  assert.equal(sacred.life, 25);
});

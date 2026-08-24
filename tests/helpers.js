import fs from 'node:fs';
import { createMasterIndex } from '../src/data/master-loader.js';
import { BattleEngine } from '../src/battle/BattleEngine.js';
import { createUnit } from '../src/battle/state.js';

export const masterData = JSON.parse(fs.readFileSync(new URL('../src/data/master-data.json', import.meta.url), 'utf8'));
export const masterIndex = createMasterIndex(masterData);

export function legalDeck(id = 'deck') {
  const ids = masterData.monsters.flatMap((monster) => [monster.id, monster.id]);
  ids.push(...masterData.growthCards.slice(0, 4).map((card) => card.id));
  return ids.map((masterId, index) => ({ instanceId: `${id}-${index + 1}`, masterId }));
}

export function engine(options = {}) {
  const firstPlayerId = options.firstPlayerId ?? 'p1';
  return new BattleEngine({
    masterData,
    seed: options.seed ?? 'test-seed',
    firstPlayerId,
    players: [
      { id: 'p1', displayName: 'Player 1', cards: options.deck1 ?? legalDeck('p1'), tournamentGrowth: options.growth1 },
      { id: 'p2', displayName: 'Player 2', cards: options.deck2 ?? legalDeck('p2'), tournamentGrowth: options.growth2 },
    ],
  });
}

export function card(masterId, instanceId = `card-${masterId}`) {
  return { instanceId, masterId };
}

export function monsterByName(name) {
  return masterData.monsters.find((monster) => monster.name === name);
}

export function moveByName(monsterName, moveName) {
  return masterData.moves.find((move) => move.monsterName === monsterName && move.name === moveName);
}

export function placeUnit(battle, playerId, monsterName, slot = 0, options = {}) {
  const player = battle.player(playerId);
  const monster = monsterByName(monsterName);
  const source = card(monster.id, options.instanceId ?? `${playerId}-${monster.id}-${slot}`);
  const unit = createUnit({
    unitId: options.unitId ?? `test-unit-${playerId}-${slot}`,
    card: source,
    monster,
    growth: options.growth ?? {},
    masterIndex: battle.masterIndex,
    slot,
  });
  unit.actionPoints = options.actionPoints ?? 1;
  unit.summonedThisTurn = options.summonedThisTurn ?? false;
  if (options.life != null) unit.life = options.life;
  player.board[slot] = unit;
  player.tournamentGrowth[source.instanceId] = {
    life: 0,
    atk: 0,
    def: 0,
    learnedMoveIds: [...unit.learnedMoveIds],
    equippedMoveIds: [...unit.equippedMoveIds],
  };
  return unit;
}

export function setHand(battle, playerId, entries) {
  battle.player(playerId).hand = entries;
}


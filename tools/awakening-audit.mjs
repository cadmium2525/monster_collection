import fs from 'node:fs';
import { BattleEngine } from '../src/battle/BattleEngine.js';
import { runAutomatedBattle } from '../src/battle/simulation.js';
import { createBaselineDeck } from '../src/data/default-decks.js';
import { SeededRng } from '../src/core/rng.js';
import { awakeningAudit } from '../src/ai/lab.js';

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

const masterData = JSON.parse(fs.readFileSync(new URL('../src/data/master-data.json', import.meta.url), 'utf8'));
const games = Number(option('games', '1000'));
const seed = option('seed', 'awakening-stress');
if (!Number.isInteger(games) || games <= 0) throw new Error('--games must be a positive integer');

function unitById(engine, playerId, unitId) {
  return engine.player(playerId).board.find((unit) => unit?.id === unitId) ?? null;
}

function stressActionScore(engine, playerId, action, rng) {
  const priority = {
    'resolve-shugyo-move': 1200,
    awaken: 1100,
    move: 900,
    'fusion-special': 780,
    'fusion-normal': 700,
    summon: 620,
    breeder: 500,
    training: 390,
    shugyo: 360,
    'end-turn': 0,
  }[action.type] ?? 100;
  let tactical = 0;
  if (action.type === 'awaken') {
    const target = unitById(engine, playerId, action.unitId);
    const material = unitById(engine, playerId, action.materialUnitId);
    const targetValue = target ? target.life + target.atkBase + target.defBase : 0;
    const materialValue = material ? material.life + material.atkBase + material.defBase : 0;
    tactical += targetValue * .2 - materialValue * .08;
  }
  if (action.type === 'move') {
    const move = engine.masterIndex.moves.get(action.moveId);
    tactical += (move?.power ?? 0) * 2 - (action.cost ?? 0) * 3;
    if (action.targetPlayerId) tactical += 35;
    const target = action.targetUnitId ? unitById(engine, engine.opponent(playerId).id, action.targetUnitId) : null;
    if (target) tactical += Math.max(0, 30 - target.life) * .5;
  }
  if (action.type === 'summon') tactical -= (action.cost ?? 0) * 2;
  return priority + tactical + rng.next() * .001;
}

const summary = {
  mode: 'awakening-immediate-use-stress', seed, games,
  firstPlayerWins: 0, secondPlayerWins: 0, draws: 0,
  gamesWithAwakening: 0, turn10Awakenings: 0,
  awakeningTurnWins: 0, turn10AwakeningTurnWins: 0,
  totalRounds: 0, decisiveAbilities: {}, decisiveActions: {},
};

for (let index = 0; index < games; index += 1) {
  const gameSeed = `${seed}:${index + 1}`;
  const battle = new BattleEngine({
    masterData,
    seed: gameSeed,
    players: [
      { id: 'a', displayName: 'Stress A', deckId: `a-${index}`, cards: createBaselineDeck(masterData, `a-${index}`) },
      { id: 'b', displayName: 'Stress B', deckId: `b-${index}`, cards: createBaselineDeck(masterData, `b-${index}`) },
    ],
  });
  const rng = new SeededRng(`${gameSeed}:policy`);
  const completed = runAutomatedBattle(battle, {
    seed: `${gameSeed}:driver`, maxActions: 3000,
    chooseAction: (engine, playerId) => engine.getLegalActions(playerId)
      .map((action) => ({ action, score: stressActionScore(engine, playerId, action, rng) }))
      .sort((a, b) => b.score - a.score)[0].action,
  });
  const audit = awakeningAudit(completed.state.log, completed.state);
  if (!completed.result.winnerId) summary.draws += 1;
  else if (completed.result.winnerId === completed.state.firstPlayerId) summary.firstPlayerWins += 1;
  else summary.secondPlayerWins += 1;
  if (audit) {
    summary.gamesWithAwakening += 1;
    if (audit.secondPlayer && audit.round === 10) summary.turn10Awakenings += 1;
    if (audit.sameTurnWin) {
      summary.awakeningTurnWins += 1;
      if (audit.secondPlayer && audit.round === 10) summary.turn10AwakeningTurnWins += 1;
      const ability = `${audit.abilityId}:${audit.abilityName}`;
      summary.decisiveAbilities[ability] = (summary.decisiveAbilities[ability] ?? 0) + 1;
      const action = audit.decisiveActionType ?? 'other';
      summary.decisiveActions[action] = (summary.decisiveActions[action] ?? 0) + 1;
    }
  }
  summary.totalRounds += completed.result.round;
}

Object.assign(summary, {
  firstPlayerWinRate: summary.firstPlayerWins / games,
  secondPlayerWinRate: summary.secondPlayerWins / games,
  drawRate: summary.draws / games,
  averageRound: summary.totalRounds / games,
  awakeningGameRate: summary.gamesWithAwakening / games,
  turn10AwakeningRate: summary.turn10Awakenings / games,
  awakeningSameTurnWinRate: summary.gamesWithAwakening ? summary.awakeningTurnWins / summary.gamesWithAwakening : 0,
  turn10AwakeningSameTurnWinRate: summary.turn10Awakenings
    ? summary.turn10AwakeningTurnWins / summary.turn10Awakenings : 0,
});

console.log(JSON.stringify(summary, null, 2));

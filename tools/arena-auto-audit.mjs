import fs from 'node:fs';
import { createAiPolicy } from '../src/ai/levels.js';
import { BattleEngine } from '../src/battle/BattleEngine.js';
import { assertLegalDeck, normalizeDeckCards } from '../src/battle/deck.js';
import { runAutomatedBattle } from '../src/battle/simulation.js';
import { SeededRng } from '../src/core/rng.js';
import { createFactionStarterDeck } from '../src/data/default-decks.js';
import { createMasterIndex } from '../src/data/master-loader.js';
import { analyzeDeck, scoreGeneratedDeck } from '../src/tournament/deck-analyzer.js';
import { generateCpuDeck } from '../src/tournament/deck-generator.js';

const FACTIONS = Object.freeze(['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物']);
const ACE_ROUTE_BY_FACTION = Object.freeze({
  '機鋼': 'fusion-049',
  '神造': 'fusion-052',
  '幻霊': 'fusion-053',
  '魔族': 'fusion-056',
  '獣族': 'fusion-057',
  '怪物': 'fusion-059',
});
const COMBO_PAIR_BY_FACTION = Object.freeze({
  '機鋼': ['breeder-056', 'breeder-057'],
  '神造': ['breeder-058', 'breeder-059'],
  '幻霊': ['breeder-060', 'breeder-061'],
  '魔族': ['breeder-062', 'breeder-063'],
  '獣族': ['breeder-064', 'breeder-065'],
  '怪物': ['breeder-066', 'breeder-067'],
});

function option(name, fallback) {
  const index = process.argv.indexOf(`--${name}`);
  return index >= 0 ? process.argv[index + 1] : fallback;
}

function integerOption(name, fallback, minimum = 1) {
  return Math.max(minimum, Math.trunc(Number(option(name, String(fallback))) || fallback));
}

function rate(value, total) {
  return total ? value / total : 0;
}

function percent(value) {
  return Number((value * 100).toFixed(1));
}

function wilson(successes, total, z = 1.96) {
  if (!total) return [0, 0];
  const p = successes / total;
  const denominator = 1 + z ** 2 / total;
  const center = (p + z ** 2 / (2 * total)) / denominator;
  const margin = z * Math.sqrt((p * (1 - p) + z ** 2 / (4 * total)) / total) / denominator;
  return [percent(Math.max(0, center - margin)), percent(Math.min(1, center + margin))];
}

function emptyRecord() {
  return {
    games: 0,
    wins: 0,
    losses: 0,
    draws: 0,
    firstGames: 0,
    firstWins: 0,
    secondGames: 0,
    secondWins: 0,
    rounds: 0,
    specialFusions: 0,
    breederUses: 0,
    aceSpecialFusions: 0,
    comboSetupUses: 0,
    comboPayoffUses: 0,
    comboConversions: 0,
  };
}

function recordResult(record, completed, candidateId, forcedFirstPlayerId, plan = {}) {
  record.games += 1;
  record.rounds += completed.result.round;
  const won = completed.result.winnerId === candidateId;
  const draw = completed.result.winnerId == null;
  if (won) record.wins += 1;
  else if (draw) record.draws += 1;
  else record.losses += 1;
  if (forcedFirstPlayerId === candidateId) {
    record.firstGames += 1;
    if (won) record.firstWins += 1;
  } else {
    record.secondGames += 1;
    if (won) record.secondWins += 1;
  }
  const player = completed.state.players[candidateId];
  record.specialFusions += player.metrics.specialFusions ?? 0;
  record.breederUses += player.metrics.breederUses ?? 0;
  let comboSetupUses = 0;
  let comboPayoffUses = 0;
  for (const event of completed.state.log.filter((entry) => entry.playerId === candidateId)) {
    if (event.type === 'fusion-special' && event.fusionId === plan.aceFusionId) record.aceSpecialFusions += 1;
    if (event.type === 'breeder' && event.breederId === plan.comboIds?.[0]) comboSetupUses += 1;
    if (event.type === 'breeder' && event.breederId === plan.comboIds?.[1]) comboPayoffUses += 1;
  }
  record.comboSetupUses += comboSetupUses;
  record.comboPayoffUses += comboPayoffUses;
  record.comboConversions += Math.min(comboSetupUses, comboPayoffUses);
  return won ? 'win' : draw ? 'draw' : 'loss';
}

function summarize(record) {
  return {
    ...record,
    winRate: percent(rate(record.wins, record.games)),
    winRate95: wilson(record.wins, record.games),
    drawRate: percent(rate(record.draws, record.games)),
    firstWinRate: percent(rate(record.firstWins, record.firstGames)),
    secondWinRate: percent(rate(record.secondWins, record.secondGames)),
    averageRound: Number(rate(record.rounds, record.games).toFixed(2)),
    specialFusionPerGame: Number(rate(record.specialFusions, record.games).toFixed(3)),
    breederUsesPerGame: Number(rate(record.breederUses, record.games).toFixed(2)),
    aceSpecialFusionPerGame: Number(rate(record.aceSpecialFusions, record.games).toFixed(3)),
    comboSetupUsesPerGame: Number(rate(record.comboSetupUses, record.games).toFixed(3)),
    comboPayoffUsesPerGame: Number(rate(record.comboPayoffUses, record.games).toFixed(3)),
    comboConversionRate: percent(rate(record.comboConversions, record.comboSetupUses)),
  };
}

const masterData = JSON.parse(fs.readFileSync(new URL('../src/data/master-data.json', import.meta.url), 'utf8'));
const masterIndex = createMasterIndex(masterData);
const gamesPerMatchup = integerOption('games', 12);
const variants = integerOption('variants', 4);
const seed = option('seed', 'arena-auto-readiness-v1');
const aiLevel = option('ai', 'legend');
const deckRank = option('deck-rank', 'legend');
const matureMode = option('mature-mode', 'focused');
const deterministicSearch = !process.argv.includes('--runtime-budget');
const searchOptions = Object.freeze({
  deterministicSearch,
  timeBudgetMs: integerOption('time-ms', 85),
  beamWidth: integerOption('beam', 2),
  branchLimit: integerOption('branch', 2),
  maxDepth: integerOption('depth', 3),
  candidateEvaluationLimit: integerOption('candidate-limit', 24),
});
const selectedCandidateFactions = String(option('candidate-factions', FACTIONS.join(',')))
  .split(',').map((value) => value.trim()).filter((value) => FACTIONS.includes(value));
const selectedOpponentFactions = String(option('opponent-factions', FACTIONS.join(',')))
  .split(',').map((value) => value.trim()).filter((value) => FACTIONS.includes(value));
if (!selectedCandidateFactions.length || !selectedOpponentFactions.length) {
  throw new Error('--candidate-factions and --opponent-factions must contain a known classification');
}

function createFocusedMatureDeck(faction, variant) {
  const ace = masterIndex.data.fusions.find((fusion) => fusion.id === ACE_ROUTE_BY_FACTION[faction]);
  if (!ace) throw new Error(`Unknown ace route for ${faction}`);
  const main = masterIndex.monstersByName.get(ace.main);
  const material = masterIndex.monstersByName.get(ace.material);
  const sameFaction = masterIndex.data.monsters
    .filter((monster) => monster.faction === faction && monster.id !== main.id)
    .sort((a, b) => ((b.base.life + b.base.atk + b.base.def) / b.summonTp)
      - ((a.base.life + a.base.atk + a.base.def) / a.summonTp)
      || a.id.localeCompare(b.id));
  const offset = variant % sameFaction.length;
  const supportingMonsters = [...sameFaction.slice(offset), ...sameFaction.slice(0, offset)].slice(0, 4);
  const supportCopies = [3, 3, 2, 2];
  const [setupId, payoffId] = COMBO_PAIR_BY_FACTION[faction];
  const ids = [
    ...Array(3).fill(main.id),
    ...Array(3).fill(material.id),
    ...supportingMonsters.flatMap((monster, index) => Array(supportCopies[index]).fill(monster.id)),
    setupId,
    payoffId,
    'breeder-022',
    'breeder-023',
    ...Array(4).fill('training-life'),
    ...Array(4).fill('training-atk'),
    ...Array(4).fill('training-def'),
    ...Array(4).fill('shugyo-attack'),
    ...Array(4).fill('shugyo-defense'),
  ];
  const cards = normalizeDeckCards(
    new SeededRng(`${seed}:focused:${faction}:${variant + 1}`).shuffle(ids),
    `focused-${faction}-${variant + 1}`,
  );
  assertLegalDeck(cards, masterIndex);
  const analysis = analyzeDeck(cards, masterIndex, { theme: faction, targetedFusionIds: [ace.id] });
  return {
    cards,
    theme: faction,
    rank: 'focused-mature',
    targetedFusionIds: [ace.id],
    analysis,
    qualityScore: scoreGeneratedDeck(analysis, 'legend'),
  };
}

const matureDecks = Object.fromEntries(FACTIONS.map((faction) => [faction, Array.from(
  { length: variants },
  (_, variant) => matureMode === 'generated'
    ? generateCpuDeck({
        masterIndex,
        rank: deckRank,
        theme: faction,
        rng: new SeededRng(`${seed}:candidate:${faction}:${variant + 1}`),
        seedLabel: `candidate-${faction}-${variant + 1}`,
      })
    : createFocusedMatureDeck(faction, variant),
)]));
const benchmarkDecks = Object.fromEntries(FACTIONS.map((faction) => [faction, Array.from(
  { length: variants },
  (_, variant) => generateCpuDeck({
    masterIndex,
    rank: deckRank,
    theme: faction,
    rng: new SeededRng(`${seed}:benchmark:${faction}:${variant + 1}`),
    seedLabel: `benchmark-${faction}-${variant + 1}`,
  }),
)]));
const starterDecks = Object.fromEntries(FACTIONS.map((faction) => [
  faction,
  createFactionStarterDeck(masterData, faction, `starter-${faction}`),
]));

function play({ candidateCards, opponentCards, gameSeed, candidateFirst }) {
  const candidateId = 'candidate';
  const opponentId = 'opponent';
  const firstPlayerId = candidateFirst ? candidateId : opponentId;
  const battle = new BattleEngine({
    masterData,
    seed: gameSeed,
    firstPlayerId,
    players: [
      { id: candidateId, displayName: '検証デッキ', deckId: `${gameSeed}:candidate`, cards: candidateCards },
      { id: opponentId, displayName: '基準相手', deckId: `${gameSeed}:opponent`, cards: opponentCards },
    ],
  });
  const chooseAction = createAiPolicy(aiLevel, searchOptions);
  const completed = runAutomatedBattle(battle, {
    seed: `${gameSeed}:driver`,
    maxActions: 3000,
    chooseAction,
  });
  return { completed, candidateId, firstPlayerId };
}

const fieldByFaction = Object.fromEntries(selectedCandidateFactions.map((faction) => [faction, {
  mature: emptyRecord(),
  starter: emptyRecord(),
  paired: { matureOnlyWins: 0, starterOnlyWins: 0, bothWin: 0, neitherWin: 0 },
}]));
const fieldOverall = {
  mature: emptyRecord(),
  starter: emptyRecord(),
  paired: { matureOnlyWins: 0, starterOnlyWins: 0, bothWin: 0, neitherWin: 0 },
};

for (const candidateFaction of selectedCandidateFactions) {
  for (const opponentFaction of selectedOpponentFactions) {
    for (let game = 0; game < gamesPerMatchup; game += 1) {
      const variant = (game + FACTIONS.indexOf(candidateFaction) + FACTIONS.indexOf(opponentFaction)) % variants;
      const candidateMature = matureDecks[candidateFaction][variant].cards;
      const opponent = benchmarkDecks[opponentFaction][(variant + 1) % variants].cards;
      for (const candidateFirst of [true, false]) {
        const pairedSeed = `${seed}:field:${candidateFaction}:${opponentFaction}:${game + 1}:${candidateFirst ? 'first' : 'second'}`;
        const plan = {
          aceFusionId: ACE_ROUTE_BY_FACTION[candidateFaction],
          comboIds: COMBO_PAIR_BY_FACTION[candidateFaction],
        };
        const outcomes = {};
        for (const maturity of ['mature', 'starter']) {
          const candidateCards = maturity === 'mature' ? candidateMature : starterDecks[candidateFaction];
          const result = play({ candidateCards, opponentCards: opponent, gameSeed: pairedSeed, candidateFirst });
          outcomes[maturity] = recordResult(
            fieldByFaction[candidateFaction][maturity], result.completed, result.candidateId, result.firstPlayerId, plan,
          );
          recordResult(fieldOverall[maturity], result.completed, result.candidateId, result.firstPlayerId, plan);
        }
        const pairedKey = outcomes.mature === 'win'
          ? outcomes.starter === 'win' ? 'bothWin' : 'matureOnlyWins'
          : outcomes.starter === 'win' ? 'starterOnlyWins' : 'neitherWin';
        fieldByFaction[candidateFaction].paired[pairedKey] += 1;
        fieldOverall.paired[pairedKey] += 1;
      }
    }
  }
}

const directByFaction = Object.fromEntries(selectedCandidateFactions.map((faction) => [faction, emptyRecord()]));
const directOverall = emptyRecord();
for (const faction of selectedCandidateFactions) {
  for (let game = 0; game < gamesPerMatchup * 2; game += 1) {
    const candidateCards = matureDecks[faction][game % variants].cards;
    for (const candidateFirst of [true, false]) {
      const gameSeed = `${seed}:direct:${faction}:${game + 1}:${candidateFirst ? 'first' : 'second'}`;
      const result = play({ candidateCards, opponentCards: starterDecks[faction], gameSeed, candidateFirst });
      const plan = { aceFusionId: ACE_ROUTE_BY_FACTION[faction], comboIds: COMBO_PAIR_BY_FACTION[faction] };
      recordResult(directByFaction[faction], result.completed, result.candidateId, result.firstPlayerId, plan);
      recordResult(directOverall, result.completed, result.candidateId, result.firstPlayerId, plan);
    }
  }
}

function pairedSummary(paired) {
  const discordant = paired.matureOnlyWins + paired.starterOnlyWins;
  return {
    ...paired,
    netUpgrades: paired.matureOnlyWins - paired.starterOnlyWins,
    matureShareOfDiscordant: percent(rate(paired.matureOnlyWins, discordant)),
  };
}

const field = Object.fromEntries(selectedCandidateFactions.map((faction) => {
  const mature = summarize(fieldByFaction[faction].mature);
  const starter = summarize(fieldByFaction[faction].starter);
  return [faction, {
    mature,
    starter,
    winRateLift: Number((mature.winRate - starter.winRate).toFixed(1)),
    paired: pairedSummary(fieldByFaction[faction].paired),
  }];
}));
const overallMature = summarize(fieldOverall.mature);
const overallStarter = summarize(fieldOverall.starter);
const direct = Object.fromEntries(selectedCandidateFactions.map((faction) => [faction, summarize(directByFaction[faction])]));
const matureRates = Object.values(field).map((entry) => entry.mature.winRate);
const lifts = Object.values(field).map((entry) => entry.winRateLift);
const directRates = Object.values(direct).map((entry) => entry.winRate);
const readinessChecks = {
  overallLiftAtLeast10Points: overallMature.winRate - overallStarter.winRate >= 10,
  everyFactionLiftPositive: lifts.every((value) => value > 0),
  everyMatureFactionAtLeast40PercentVsLegendField: matureRates.every((value) => value >= 40),
  matureFactionSpreadAtMost20Points: Math.max(...matureRates) - Math.min(...matureRates) <= 20,
  directOverallAtLeast60Percent: summarize(directOverall).winRate >= 60,
  everyDirectFactionAtLeast55Percent: directRates.every((value) => value >= 55),
};

const result = {
  mode: 'arena-auto-readiness',
  seed,
  methodology: {
    aiLevel,
    sameAiForBothSides: true,
    deterministicSearch,
    searchOptions,
    deckRank,
    matureMode,
    candidateFactions: selectedCandidateFactions,
    opponentFactions: selectedOpponentFactions,
    deckVariants: variants,
    pairedGamesPerCandidateOpponentFaction: gamesPerMatchup * 2,
    forcedInitiative: '各条件を候補先攻・候補後攻で1回ずつ実行',
    fieldDefinition: '6分類の独立生成Legend成熟デッキ群',
    matureDefinition: matureMode === 'focused'
      ? '主分類81%・モンスター16枚・分類コンボ各1枚・探索/融合強化各1枚・育成20枚の焦点型40枚'
      : '主分類・分類コンボ・狙い特殊合体を持つLegend生成40枚',
    starterDefinition: '同じ分類の初期40枚',
  },
  deckQuality: Object.fromEntries(selectedCandidateFactions.map((faction) => [faction, {
    matureAverageScore: Number((matureDecks[faction].reduce((sum, deck) => sum + deck.qualityScore, 0) / variants).toFixed(2)),
    matureAverageTargetedRecipes: Number((matureDecks[faction].reduce((sum, deck) => sum + deck.analysis.fusion.completedTargetedRecipeCount, 0) / variants).toFixed(2)),
    matureAverageThemePurity: Number((matureDecks[faction].reduce((sum, deck) => sum + deck.analysis.themePurity, 0) / variants).toFixed(3)),
    starter: analyzeDeck(starterDecks[faction], masterIndex, { theme: faction }),
  }])),
  sharedLegendField: {
    overall: {
      mature: overallMature,
      starter: overallStarter,
      winRateLift: Number((overallMature.winRate - overallStarter.winRate).toFixed(1)),
      paired: pairedSummary(fieldOverall.paired),
    },
    factions: field,
  },
  directMatureVsSameFactionStarter: {
    overall: summarize(directOverall),
    factions: direct,
  },
  readinessChecks,
  recommendation: Object.values(readinessChecks).every(Boolean) ? 'GO' : 'HOLD',
};

const outputPath = option('output', '');
if (outputPath) fs.writeFileSync(outputPath, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
if (process.argv.includes('--summary')) {
  console.log(JSON.stringify({
    seed: result.seed,
    candidateFactions: result.methodology.candidateFactions,
    games: result.sharedLegendField.overall.mature.games + result.sharedLegendField.overall.starter.games
      + result.directMatureVsSameFactionStarter.overall.games,
    field: result.sharedLegendField.overall,
    direct: result.directMatureVsSameFactionStarter.overall,
    readinessChecks: result.readinessChecks,
    recommendation: result.recommendation,
    outputPath: outputPath || null,
  }, null, process.argv.includes('--compact') ? 0 : 2));
} else {
  console.log(JSON.stringify(result, null, process.argv.includes('--compact') ? 0 : 2));
}

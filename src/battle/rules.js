export const RULES = Object.freeze({
  deckSize: 40,
  playerLife: 100,
  initialTp: 10,
  baseMaxTp: 10,
  firstInitialHand: 3,
  secondInitialHand: 5,
  firstMulliganMax: 3,
  secondMulliganMax: 5,
  handLimit: 8,
  boardSlots: 3,
  firstFusionTurn: 6,
  secondFusionTurn: 5,
  secondAwakeningTurn: 10,
  normalFusionTp: 1,
  specialFusionTp: 2,
  fusionMultiplier: 1.2,
  fusionMinimumMaterialRate: 0.1,
  maxFusionStage: 2,
  trainingTp: 2,
  trainingGain: 5,
  shugyoTp: 5,
  shugyoGainMin: 5,
  shugyoGainMax: 10,
  maxLearnedMoves: 9,
  equippedMoveSlots: 4,
  tournamentGrowthLifetime: 'tournament',
  maxRounds: 40,
  distanceSystemEnabled: false,
});

export const COPY_LIMITS = Object.freeze({
  monster: 3,
  breeder: 3,
  training: Number.POSITIVE_INFINITY,
  shugyo: Number.POSITIVE_INFINITY,
});

export const TOURNAMENTS = Object.freeze(['bronze', 'silver', 'gold', 'legend']);

export const TOURNAMENT_LABELS = Object.freeze({
  bronze: 'ブロンズカップ',
  silver: 'シルバーカップ',
  gold: 'ゴールドカップ',
  legend: 'レジェンドカップ',
});

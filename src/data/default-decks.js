const BASELINE_MASTER_IDS = Object.freeze([
  // A forgiving 無機 core plus three intentional special-fusion routes.
  // The defensive bodies prevent a new player from losing every summoned
  // monster before its first actionable turn.
  'monster-001', 'monster-001', 'monster-001', // モノリス
  'monster-002', 'monster-002', 'monster-002', // ヘンガー
  'monster-003', 'monster-003',                 // ゴーレム
  'monster-010', 'monster-010',                 // ピクシー
  'monster-005', 'monster-005',                 // メタルナー
  'monster-017', 'monster-017',                 // ワーム
  'monster-011', 'monster-011',                 // デュラハン
  'monster-004', 'monster-004',                 // ヒノトリ
  // General-purpose breeder cards keep the starter understandable while
  // exercising the fourth canonical card category.
  'breeder-001', 'breeder-003', 'breeder-004', 'breeder-010',
  'training-life', 'training-life', 'training-life', 'training-life',
  'training-atk', 'training-atk', 'training-atk', 'training-atk',
  'training-def', 'training-def', 'training-def', 'training-def',
  'shugyo-attack', 'shugyo-attack', 'shugyo-attack',
  'shugyo-defense', 'shugyo-defense', 'shugyo-defense',
]);

export function createBaselineDeck(masterData, deckId = 'baseline') {
  const knownIds = new Set([
    ...masterData.monsters,
    ...masterData.growthCards,
    ...masterData.breeders,
  ].map((card) => card.id));
  if (BASELINE_MASTER_IDS.some((id) => !knownIds.has(id))) throw new Error('Starter deck references unknown master data');
  return BASELINE_MASTER_IDS.map((masterId, index) => ({
    instanceId: `${deckId}-card-${String(index + 1).padStart(2, '0')}`,
    masterId,
  }));
}

export { BASELINE_MASTER_IDS };

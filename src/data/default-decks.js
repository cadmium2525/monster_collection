const BASELINE_MASTER_IDS = Object.freeze([
  // A forgiving 機鋼 core plus three intentional special-fusion routes.
  // The defensive bodies prevent a new player from losing every summoned
  // monster before its first actionable turn.
  'monster-001', 'monster-001', 'monster-001', // モノリス
  'monster-002', 'monster-002', 'monster-002', // ギアセンチネル
  'monster-003', 'monster-003',                 // ゴーレム
  'monster-010', 'monster-010',                 // ピクシー
  'monster-005', 'monster-005',                 // アストラノイド
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

const STARTER_GROWTH_IDS = Object.freeze([
  'training-life', 'training-life', 'training-life', 'training-life',
  'training-atk', 'training-atk', 'training-atk', 'training-atk',
  'training-def', 'training-def', 'training-def', 'training-def',
  'shugyo-attack', 'shugyo-attack', 'shugyo-attack', 'shugyo-attack',
  'shugyo-defense', 'shugyo-defense', 'shugyo-defense', 'shugyo-defense',
]);

export const STARTER_DECK_OPTIONS = Object.freeze([
  Object.freeze({ faction: '機鋼', deckName: '鋼鉄要塞', representativeMonsterId: 'monster-003', description: '硬い盤面を築き、装甲強化と重量級の一撃で押し切る。' }),
  Object.freeze({ faction: '神造', deckName: '創世の火', representativeMonsterId: 'monster-004', description: '軽い技と再設計を重ね、復活と連続攻撃で主導権を握る。' }),
  Object.freeze({ faction: '幻霊', deckName: '幽玄の庭', representativeMonsterId: 'monster-009', description: '回避・再行動・継続効果を操り、相手の計算を崩す。' }),
  Object.freeze({ faction: '魔族', deckName: '魔界の覇道', representativeMonsterId: 'monster-012', description: 'ATK強化を重ね、強力な実戦技で早期決着を狙う。' }),
  Object.freeze({ faction: '獣族', deckName: '野生の群れ', representativeMonsterId: 'monster-013', description: 'TP回復と生命力を活かし、途切れない攻勢を作る。' }),
  Object.freeze({ faction: '怪物', deckName: '異形の進化', representativeMonsterId: 'monster-016', description: '妨害と群体強化で盤面を育て、特殊合体へつなぐ。' }),
]);

const FACTION_STARTER_IDS = Object.freeze({
  '機鋼': Object.freeze([
    'monster-001', 'monster-001', 'monster-001', 'monster-002', 'monster-002', 'monster-002', 'monster-003', 'monster-003', 'monster-003',
    'monster-014', 'monster-014', 'monster-015', 'monster-015', 'monster-016', 'monster-016', 'monster-012',
    'breeder-009', 'breeder-009', 'breeder-010', 'breeder-010', ...STARTER_GROWTH_IDS,
  ]),
  '神造': Object.freeze([
    'monster-004', 'monster-004', 'monster-004', 'monster-005', 'monster-005', 'monster-005', 'monster-006', 'monster-006', 'monster-006',
    'monster-002', 'monster-002', 'monster-009', 'monster-014', 'monster-007', 'monster-010', 'monster-011',
    'breeder-011', 'breeder-011', 'breeder-012', 'breeder-012', ...STARTER_GROWTH_IDS,
  ]),
  '幻霊': Object.freeze([
    'monster-007', 'monster-007', 'monster-007', 'monster-008', 'monster-008', 'monster-008', 'monster-009', 'monster-009', 'monster-009',
    'monster-016', 'monster-016', 'monster-011', 'monster-002', 'monster-010', 'monster-017', 'monster-017',
    'breeder-013', 'breeder-013', 'breeder-014', 'breeder-014', ...STARTER_GROWTH_IDS,
  ]),
  '魔族': Object.freeze([
    'monster-010', 'monster-010', 'monster-010', 'monster-011', 'monster-011', 'monster-011', 'monster-012', 'monster-012', 'monster-012',
    'monster-005', 'monster-017', 'monster-004', 'monster-004', 'monster-013', 'monster-013', 'monster-001',
    'breeder-015', 'breeder-015', 'breeder-016', 'breeder-016', ...STARTER_GROWTH_IDS,
  ]),
  '獣族': Object.freeze([
    'monster-013', 'monster-013', 'monster-013', 'monster-014', 'monster-014', 'monster-014', 'monster-015', 'monster-015', 'monster-015',
    'monster-007', 'monster-007', 'monster-010', 'monster-001', 'monster-003', 'monster-003', 'monster-006',
    'breeder-017', 'breeder-017', 'breeder-018', 'breeder-018', ...STARTER_GROWTH_IDS,
  ]),
  '怪物': Object.freeze([
    'monster-016', 'monster-016', 'monster-016', 'monster-017', 'monster-017', 'monster-017', 'monster-018', 'monster-018', 'monster-018',
    'monster-011', 'monster-009', 'monster-015', 'monster-013', 'monster-012', 'monster-012', 'monster-008',
    'breeder-019', 'breeder-019', 'breeder-020', 'breeder-020', ...STARTER_GROWTH_IDS,
  ]),
});

function cardsFromIds(masterData, ids, deckId) {
  const knownIds = new Set([
    ...masterData.monsters,
    ...masterData.growthCards,
    ...masterData.breeders,
  ].map((card) => card.id));
  if (ids.some((id) => !knownIds.has(id))) throw new Error('Starter deck references unknown master data');
  return ids.map((masterId, index) => ({
    instanceId: `${deckId}-card-${String(index + 1).padStart(2, '0')}`,
    masterId,
  }));
}

export function createBaselineDeck(masterData, deckId = 'baseline') {
  return cardsFromIds(masterData, BASELINE_MASTER_IDS, deckId);
}

export function createFactionStarterDeck(masterData, faction, deckId = `starter-${faction}`) {
  const ids = FACTION_STARTER_IDS[faction];
  if (!ids) throw new Error(`Unknown starter faction: ${faction}`);
  return cardsFromIds(masterData, ids, deckId);
}

export { BASELINE_MASTER_IDS, FACTION_STARTER_IDS };

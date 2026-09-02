import { assertLegalDeck } from '../battle/deck.js';
import { SeededRng } from '../core/rng.js';
import { generateCpuDeck } from '../tournament/deck-generator.js';
import { ARENA_RANKS, ARENA_RANK_THRESHOLDS, normalizeArenaProgress } from './arena-state.js';

const THEMES = Object.freeze(['機鋼', '神造', '幻霊', '魔族', '獣族', '怪物']);
const AI_RANK = Object.freeze({ D: 'bronze', C: 'silver', B: 'silver', A: 'gold', S: 'legend', MASTER: 'legend' });
const AI_LEVEL = Object.freeze({ D: 'bronze', C: 'silver', B: 'gold', A: 'gold', S: 'legend', MASTER: 'champion' });
const OFFICIAL_NAMES = Object.freeze({
  '機鋼': ['鋼環守備隊', '蒼核機関', '零式工房', '天蓋装甲局', '星鉄騎団', '機神中枢'],
  '神造': ['黎明設計院', '聖火継承団', '原初錬成局', '天工評議会', '創星教導隊', '神造玉座'],
  '幻霊': ['薄明観測所', '幽境案内人', '鏡界旅団', '月影交霊会', '夢幻宮廷', '霊王記録院'],
  '魔族': ['紅月結社', '深淵契約局', '魔冠戦団', '煉獄監察府', '黒曜議会', '冥王親衛隊'],
  '獣族': ['翠牙遊撃隊', '荒野追跡団', '雷爪連盟', '金剛猟団', '百獣評議会', '獣王戦線'],
  '怪物': ['異形研究棟', '深層培養区', '群体観測班', '変異対策局', '混沌生態圏', '終端進化群'],
});

export const OFFICIAL_ARENA_SPECS = Object.freeze(ARENA_RANKS.flatMap((rank, rankIndex) => THEMES.map((theme, themeIndex) => Object.freeze({
  id: `official-${rank.toLowerCase()}-${theme}`,
  rank,
  theme,
  displayName: OFFICIAL_NAMES[theme][rankIndex],
  deckName: `${theme}・${rank}級公式デッキ`,
  rating: ARENA_RANK_THRESHOLDS[rank] + 40 + themeIndex * 30,
  aiRank: AI_RANK[rank],
  aiLevel: AI_LEVEL[rank],
}))));

export function deckSignature(cards = []) {
  const counts = new Map();
  for (const card of cards) counts.set(card.masterId, (counts.get(card.masterId) ?? 0) + 1);
  return [...counts].sort(([a], [b]) => a.localeCompare(b)).map(([id, count]) => `${id}:${count}`).join('|');
}

export function deckSimilarity(signatureA, signatureB) {
  const parse = (signature) => new Map(String(signature ?? '').split('|').filter(Boolean).map((entry) => {
    const [id, count] = entry.split(':'); return [id, Number(count) || 0];
  }));
  const a = parse(signatureA);
  const b = parse(signatureB);
  const ids = new Set([...a.keys(), ...b.keys()]);
  let overlap = 0;
  let total = 0;
  for (const id of ids) {
    overlap += Math.min(a.get(id) ?? 0, b.get(id) ?? 0);
    total += Math.max(a.get(id) ?? 0, b.get(id) ?? 0);
  }
  return total ? overlap / total : 0;
}

function officialCandidates(rank) {
  return OFFICIAL_ARENA_SPECS.filter((spec) => !rank || spec.rank === rank).map((spec) => ({
    ...spec,
    sourceType: 'OFFICIAL_AI',
    sourceLabel: 'OFFICIAL AI',
    ownerUserId: null,
    cards: null,
    tournamentGrowth: {},
    deckSignature: `official:${spec.rank}:${spec.theme}`,
  }));
}

function representativeMonsterId(cards, masterIndex, { preferredId = null, theme = null } = {}) {
  const monsterCounts = new Map();
  for (const card of cards ?? []) {
    const definition = masterIndex.cards.get(card.masterId);
    if (definition?.kind !== 'monster') continue;
    monsterCounts.set(card.masterId, (monsterCounts.get(card.masterId) ?? 0) + 1);
  }
  if (preferredId && monsterCounts.has(preferredId)) return preferredId;
  return [...monsterCounts]
    .sort(([idA, countA], [idB, countB]) => {
      const factionA = masterIndex.monsters.get(idA)?.faction === theme ? 1 : 0;
      const factionB = masterIndex.monsters.get(idB)?.faction === theme ? 1 : 0;
      return factionB - factionA || countB - countA || idA.localeCompare(idB);
    })[0]?.[0] ?? null;
}

function materializeOfficial(opponent, masterIndex) {
  if (opponent.sourceType !== 'OFFICIAL_AI') return opponent;
  const rng = new SeededRng(`arena-official-v1:${opponent.id}`);
  const generated = generateCpuDeck({
    masterIndex, rank: opponent.aiRank, theme: opponent.theme, rng, seedLabel: opponent.id,
  });
  return {
    ...opponent,
    cards: generated.cards,
    representativeMonsterId: representativeMonsterId(generated.cards, masterIndex, { theme: opponent.theme }),
    deckSignature: deckSignature(generated.cards),
  };
}

function playerCandidates(records, masterIndex, arena) {
  return (records ?? []).flatMap((record) => {
    try {
      const id = String(record.publicDeckId ?? `${record.ownerUserId}--${record.sourceDeckId}`);
      const cards = assertLegalDeck(record.cards, masterIndex, { deckId: `arena-${id}` });
      return [{
        id: `ghost-${id}`,
        sourceType: 'PLAYER_GHOST', sourceLabel: 'PLAYER',
        ownerUserId: record.ownerUserId ?? null,
        displayName: record.ownerDisplayName ?? '名もなきブリーダー',
        deckName: record.deckName ?? '防衛デッキ',
        rating: Number(record.arenaRating) || arena.rating,
        aiLevel: arena.rank === 'MASTER' ? 'champion' : AI_LEVEL[arena.rank],
        cards,
        representativeMonsterId: representativeMonsterId(cards, masterIndex, { preferredId: record.representativeMonsterId }),
        tournamentGrowth: record.tournamentGrowth ?? {}, deckSignature: deckSignature(cards),
      }];
    } catch { return []; }
  });
}

function archiveCandidates(records, masterIndex) {
  return (records ?? []).flatMap((record) => {
    try {
      const id = String(record.archiveId ?? `v${record.championVersion ?? 'unknown'}`);
      const cards = assertLegalDeck(record.championDeckSnapshot ?? record.cards, masterIndex, { deckId: `archive-${id}` });
      return [{
        id: `archive-${id}`,
        sourceType: 'LEGEND_ARCHIVE', sourceLabel: 'LEGEND ARCHIVE',
        ownerUserId: record.championUserId ?? null,
        displayName: record.championDisplayName ?? '歴代チャンピオン',
        deckName: record.championDeckName ?? '王者の記録',
        rating: Math.max(ARENA_RANK_THRESHOLDS.MASTER, Number(record.arenaRating) || 2050),
        aiLevel: 'champion', cards,
        representativeMonsterId: representativeMonsterId(cards, masterIndex, { preferredId: record.representativeMonsterId }),
        tournamentGrowth: record.championGrowthSnapshot ?? {}, deckSignature: deckSignature(cards),
      }];
    } catch { return []; }
  });
}

export function selectArenaOpponent({ masterIndex, arena: current, playerGhosts = [], legendArchives = [], seed = 'arena-match' }) {
  const arena = normalizeArenaProgress(current);
  const recent = arena.battleHistory.slice(-10);
  const recentOwners = new Set(recent.map((entry) => entry.ownerUserId).filter(Boolean));
  const recentIds = new Set(recent.map((entry) => entry.opponentId));
  const recentSignatures = recent.slice(-5).map((entry) => entry.deckSignature).filter(Boolean);
  const official = officialCandidates();
  const ghosts = playerCandidates(playerGhosts, masterIndex, arena)
    .filter((opponent) => !recentIds.has(opponent.id) && (!opponent.ownerUserId || !recentOwners.has(opponent.ownerUserId)));
  const archives = arena.rank === 'MASTER'
    ? archiveCandidates(legendArchives, masterIndex).filter((opponent) => !recentIds.has(opponent.id))
    : [];
  const candidates = [...official, ...ghosts, ...archives];
  const rng = new SeededRng(seed);
  const ranked = candidates.map((opponent) => {
    const ratingDifference = Math.abs(arena.rating - opponent.rating);
    const similarity = recentSignatures.reduce((max, signature) => Math.max(max, deckSimilarity(signature, opponent.deckSignature)), 0);
    const sourceBonus = opponent.sourceType === 'PLAYER_GHOST' ? 42 : opponent.sourceType === 'LEGEND_ARCHIVE' ? 24 : 0;
    const excessiveGapPenalty = ratingDifference > 250 && opponent.sourceType !== 'OFFICIAL_AI' ? 180 : 0;
    return { opponent, score: sourceBonus + rng.next() * 90 - ratingDifference * .18 - similarity * 110 - excessiveGapPenalty };
  }).sort((a, b) => b.score - a.score || a.opponent.id.localeCompare(b.opponent.id));
  return structuredClone(materializeOfficial(ranked[0]?.opponent ?? official[0], masterIndex));
}

export function selectArenaOpponents(options) {
  const arena = normalizeArenaProgress(options.arena);
  const pool = [];
  for (let index = 0; index < 30 && pool.length < 12; index += 1) {
    const opponent = selectArenaOpponent({ ...options, seed: `${options.seed ?? 'arena-match'}:choice-${index}` });
    if (!pool.some((entry) => entry.id === opponent.id)) pool.push(opponent);
  }

  const tiers = [
    { id: 'lower', label: '格下', offset: -120, description: '堅実に勝利を狙う' },
    { id: 'equal', label: '同格', offset: 0, description: '実力の近い相手に挑む' },
    { id: 'higher', label: '格上', offset: 120, description: '強敵へ挑戦する' },
  ];
  const rng = new SeededRng(`${options.seed ?? 'arena-match'}:tier-variety`);
  const remaining = [...pool];
  const usedRatings = new Set();
  const selected = tiers.map((tier) => {
    const target = arena.rating + tier.offset;
    const ranked = remaining
      .filter((entry) => !usedRatings.has(entry.rating))
      .sort((a, b) => Math.abs(a.rating - target) - Math.abs(b.rating - target) || a.id.localeCompare(b.id));
    const shortlist = ranked.slice(0, Math.min(5, ranked.length));
    const opponent = rng.choice(shortlist) ?? remaining[0]
      ?? selectArenaOpponent({ ...options, seed: `${options.seed ?? 'arena-match'}:${tier.id}` });
    const index = remaining.findIndex((entry) => entry.id === opponent.id);
    if (index >= 0) remaining.splice(index, 1);
    usedRatings.add(opponent.rating);
    return opponent;
  });
  selected.sort((a, b) => a.rating - b.rating || a.id.localeCompare(b.id));
  return selected.map((opponent, index) => ({
    ...opponent,
    matchmakingTier: tiers[index].id,
    matchmakingLabel: tiers[index].label,
    matchmakingDescription: tiers[index].description,
  }));
}

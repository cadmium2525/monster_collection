export function shugyoPoolType(cardDefinition) {
  return cardDefinition.id === 'shugyo-attack' ? 'attack' : 'defense';
}

export function learnableShugyoMoves(masterData, masterIndex, unit, cardDefinition) {
  const pool = masterData.shugyoPools[unit.baseMonsterName]?.[shugyoPoolType(cardDefinition)] ?? [];
  return pool
    .map((name) => masterIndex.movesByName.get(`${unit.baseMonsterName}:${name}`))
    .filter((move) => move && !unit.learnedMoveIds.includes(move.id));
}

// Lower-rank techniques are only slightly more common. Rank 1 and Rank 5
// differ by roughly ten percent, so the pool remains meaningfully random.
export function shugyoMoveWeight(move) {
  return 1 + (3 - Math.max(1, Math.min(5, Number(move?.rank) || 3))) * 0.025;
}

export function chooseShugyoMove(rng, moves) {
  return moves.length ? rng.weightedChoice(moves, shugyoMoveWeight) : null;
}

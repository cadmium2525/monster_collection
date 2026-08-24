export function createBaselineDeck(masterData, deckId = 'baseline') {
  const masterIds = masterData.monsters.flatMap((monster) => [monster.id, monster.id]);
  masterIds.push(...masterData.growthCards.slice(0, 4).map((card) => card.id));
  return masterIds.map((masterId, index) => ({
    instanceId: `${deckId}-card-${String(index + 1).padStart(2, '0')}`,
    masterId,
  }));
}

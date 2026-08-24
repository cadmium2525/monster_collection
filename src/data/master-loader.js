let cachedMaster = null;

export function validateMasterData(master) {
  const errors = [];
  if (master?.monsters?.length !== 18) errors.push('モンスターは18体である必要があります');
  if (master?.moves?.length !== 162) errors.push('技は162件である必要があります');
  if (master?.breeders?.length !== 20) errors.push('ブリーダーは20枚である必要があります');
  if (master?.fusions?.length !== 36) errors.push('特殊合体は36レシピである必要があります');

  for (const monster of master?.monsters ?? []) {
    const moves = (master.moves ?? []).filter((move) => move.monsterName === monster.name);
    if (moves.length !== 9) errors.push(`${monster.name}の技数が9ではありません`);
    if (moves.filter((move) => move.initial).length !== 3) {
      errors.push(`${monster.name}の初期技数が3ではありません`);
    }
  }

  const ids = [
    ...(master?.monsters ?? []),
    ...(master?.moves ?? []),
    ...(master?.breeders ?? []),
    ...(master?.growthCards ?? []),
    ...(master?.fusions ?? []),
  ].map((item) => item.id);
  if (new Set(ids).size !== ids.length) errors.push('マスターIDが重複しています');

  if (errors.length) throw new Error(`マスターデータ不整合:\n${errors.join('\n')}`);
  return master;
}

export function createMasterIndex(master) {
  validateMasterData(master);
  return {
    data: master,
    cards: new Map([
      ...master.monsters.map((card) => [card.id, card]),
      ...master.breeders.map((card) => [card.id, card]),
      ...master.growthCards.map((card) => [card.id, card]),
    ]),
    monsters: new Map(master.monsters.map((monster) => [monster.id, monster])),
    monstersByName: new Map(master.monsters.map((monster) => [monster.name, monster])),
    moves: new Map(master.moves.map((move) => [move.id, move])),
    movesByName: new Map(master.moves.map((move) => [`${move.monsterName}:${move.name}`, move])),
    breeders: new Map(master.breeders.map((card) => [card.id, card])),
    fusions: new Map(master.fusions.map((fusion) => [`${fusion.main}:${fusion.material}`, fusion])),
  };
}

export async function loadMasterData(url = new URL('./master-data.json', import.meta.url)) {
  if (cachedMaster) return cachedMaster;
  const response = await fetch(url);
  if (!response.ok) throw new Error(`マスターデータを読み込めません (${response.status})`);
  cachedMaster = validateMasterData(await response.json());
  return cachedMaster;
}

export function clearMasterCacheForTests() {
  cachedMaster = null;
}

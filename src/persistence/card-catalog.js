function uniqueStrings(values) {
  return [...new Set((Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string' && value.length > 0))]
    .sort((a, b) => a.localeCompare(b));
}

export function normalizeCardCatalog(value = {}) {
  return {
    schemaVersion: 1,
    ownedCardMasterIds: uniqueStrings(value.ownedCardMasterIds),
    discoveredFusionIds: uniqueStrings(value.discoveredFusionIds),
    updatedAt: value.updatedAt ?? value.catalogUpdatedAt ?? null,
  };
}

export function mergeCardCatalogs(...values) {
  const catalogs = values.map((value) => normalizeCardCatalog(value));
  return normalizeCardCatalog({
    ownedCardMasterIds: catalogs.flatMap((catalog) => catalog.ownedCardMasterIds),
    discoveredFusionIds: catalogs.flatMap((catalog) => catalog.discoveredFusionIds),
    updatedAt: catalogs.map((catalog) => catalog.updatedAt).filter(Boolean).sort().at(-1) ?? null,
  });
}

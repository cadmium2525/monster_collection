import { catalogCardThumbnailPlacement } from './card-renderer.js';
import { el } from './dom.js';

export function resolvePlayerIconDefinition(user, catalog, masterIndex) {
  const masterId = String(user?.playerIconMasterId ?? '');
  if (!masterId || !new Set(catalog?.ownedCardMasterIds ?? []).has(masterId)) return null;
  return masterIndex?.cards?.get(masterId) ?? null;
}

export function playerIconContent({ user, catalog, masterIndex }) {
  const definition = resolvePlayerIconDefinition(user, catalog, masterIndex);
  if (!definition) return document.createTextNode(String(user?.displayName ?? '?').slice(0, 1) || '?');
  const art = catalogCardThumbnailPlacement(definition);
  return el('i', {
    className: `player-icon-art ${art.className}`,
    attrs: {
      'aria-hidden': 'true',
      ...(art.style ? { style: art.style } : {}),
    },
  });
}

export function ownedPlayerIconDefinitions(catalog, masterIndex) {
  const kindOrder = new Map([['monster', 0], ['breeder', 1], ['training', 2], ['shugyo', 3]]);
  return [...new Set(catalog?.ownedCardMasterIds ?? [])]
    .map((masterId) => masterIndex?.cards?.get(masterId))
    .filter(Boolean)
    .sort((left, right) => (kindOrder.get(left.kind) ?? 9) - (kindOrder.get(right.kind) ?? 9)
      || left.name.localeCompare(right.name, 'ja'));
}

export function playerIconThumbnail(definition) {
  const art = catalogCardThumbnailPlacement(definition);
  return el('span', { className: 'player-icon-thumbnail' }, el('i', {
    className: `player-icon-art ${art.className}`,
    attrs: art.style ? { style: art.style } : {},
  }));
}

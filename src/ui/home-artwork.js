import { normalizeHomeArtworkSelection } from '../profile/home-artwork.js';

export const HOME_ARTWORK_THUMBNAIL_COLUMNS = 10;
export const HOME_ARTWORK_THUMBNAIL_ROWS = 6;

function monsterNumber(masterId) {
  const number = Number(String(masterId ?? '').match(/(\d+)$/)?.[1]);
  return Number.isInteger(number) && number >= 1 && number <= 30 ? number : 19;
}

export function homeArtworkImagePath(selection) {
  const normalized = normalizeHomeArtworkSelection(selection);
  const number = monsterNumber(normalized?.masterId);
  const id = String(number).padStart(3, '0');
  return normalized && normalized.artVariantId !== 'base'
    ? `./assets/images/home-showcase/monster-${id}.webp`
    : `./assets/images/home/monster-${id}.webp`;
}

export function homeArtworkThumbnailStyle(selection) {
  const normalized = normalizeHomeArtworkSelection(selection);
  const number = monsterNumber(normalized?.masterId);
  const index = number - 1 + (normalized && normalized.artVariantId !== 'base' ? 30 : 0);
  const column = index % HOME_ARTWORK_THUMBNAIL_COLUMNS;
  const row = Math.floor(index / HOME_ARTWORK_THUMBNAIL_COLUMNS);
  const x = column / (HOME_ARTWORK_THUMBNAIL_COLUMNS - 1) * 100;
  const y = row / (HOME_ARTWORK_THUMBNAIL_ROWS - 1) * 100;
  return `--home-thumb-x:${x}%;--home-thumb-y:${y}%`;
}

export function homeArtworkLabel(selection, masterIndex) {
  const normalized = normalizeHomeArtworkSelection(selection);
  const definition = normalized ? masterIndex?.monsters?.get(normalized.masterId) : null;
  if (!definition) return 'ホーム画面イラスト';
  const special = normalized.artVariantId !== 'base' ? '・特別絵' : '';
  const foil = normalized.finish === 'foil' ? '・Foil' : '';
  return `${definition.name}${special}${foil}`;
}

import { el } from './dom.js';

export const DIAMOND_ICON_PATH = './assets/ui/currency/diamond-premium.webp';

export function diamondIcon(className = 'diamond-icon') {
  return el('img', {
    className,
    src: DIAMOND_ICON_PATH,
    alt: '',
    attrs: { 'aria-hidden': 'true', draggable: 'false' },
  });
}

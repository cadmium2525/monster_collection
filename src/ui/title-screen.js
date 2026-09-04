import { el } from './dom.js';

export const TITLE_ARTWORK_PATH = './assets/images/title/title-screen.webp';

export function renderTitleScreen({ onStart }) {
  let started = false;
  const start = () => {
    if (started) return;
    started = true;
    onStart?.();
  };

  return el('main', { className: 'title-screen' }, [
    el('img', {
      className: 'title-screen-art',
      src: TITLE_ARTWORK_PATH,
      alt: '',
      draggable: false,
      attrs: { 'aria-hidden': 'true', decoding: 'async', fetchpriority: 'high' },
    }),
    el('section', { className: 'title-screen-copy', attrs: { 'aria-labelledby': 'title-screen-heading' } }, [
      el('div', { className: 'title-screen-emblem', text: 'MC', attrs: { 'aria-hidden': 'true' } }),
      el('p', { text: 'BUILD YOUR ETERNAL FORTY' }),
      el('h1', { id: 'title-screen-heading', text: 'モンスターコンストラクション' }),
      el('small', { text: '戦い、奪い、自分だけの最強40枚へ。' }),
    ]),
    el('button', {
      className: 'title-start-button',
      attrs: { type: 'button', 'aria-label': 'ゲームを開始' },
      onclick: start,
    }, [
      el('span', { text: 'TAP TO START' }),
      el('small', { text: '画面をタップ' }),
    ]),
  ]);
}

import { el } from './dom.js';

export function openModal({ title, content, className = '', dismissible = true, onClose = null }) {
  const root = document.querySelector('#modal-root');
  const previous = document.activeElement;
  let onKey = null;
  const close = () => {
    if (onKey) document.removeEventListener('keydown', onKey);
    backdrop.remove();
    onClose?.();
    previous?.focus?.();
  };
  const header = el('header', { className: 'modal-header' }, [
    el('h2', { text: title }),
    dismissible ? el('button', {
      className: 'icon-button',
      text: '×',
      attrs: { type: 'button', 'aria-label': '閉じる' },
      onclick: close,
    }) : null,
  ]);
  const modal = el('section', { className: `modal ${className}`.trim(), attrs: { role: 'dialog', 'aria-modal': 'true' } }, [header, content]);
  const backdrop = el('div', {
    className: 'modal-backdrop',
    onclick: (event) => { if (dismissible && event.target === backdrop) close(); },
  }, modal);
  root.append(backdrop);
  modal.querySelector('button, input, select')?.focus();
  onKey = (event) => {
    if (event.key === 'Escape' && dismissible) {
      close();
    }
  };
  document.addEventListener('keydown', onKey);
  return { close, modal, backdrop };
}

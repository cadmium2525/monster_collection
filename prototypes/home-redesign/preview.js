const toast = document.querySelector('.interaction-toast');
let toastTimer = 0;

function announce(label) {
  if (!toast) return;
  window.clearTimeout(toastTimer);
  toast.textContent = `${label}：試作ページのため画面遷移は行いません`;
  toast.classList.add('is-visible');
  toastTimer = window.setTimeout(() => toast.classList.remove('is-visible'), 1800);
}

document.querySelectorAll('[data-preview-action]').forEach((button) => {
  button.addEventListener('click', () => announce(button.dataset.previewAction));
});

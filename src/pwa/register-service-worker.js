export function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) {
    document.documentElement.dataset.pwaStatus = 'unsupported';
    return Promise.resolve(null);
  }
  const appRoot = new URL('../../', import.meta.url);
  const workerUrl = new URL('sw.js', appRoot);
  const hadController = Boolean(navigator.serviceWorker.controller);
  let reloadingForUpdate = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController || reloadingForUpdate) return;
    reloadingForUpdate = true;
    location.reload();
  });
  document.documentElement.dataset.pwaStatus = 'registering';
  return navigator.serviceWorker.register(workerUrl, {
    scope: appRoot.pathname,
    updateViaCache: 'none',
  }).then((registration) => {
    document.documentElement.dataset.pwaStatus = 'registered';
    document.documentElement.dataset.pwaScope = new URL(registration.scope).pathname;
    void navigator.serviceWorker.ready.then((readyRegistration) => {
      document.documentElement.dataset.pwaStatus = 'ready';
      document.documentElement.dataset.pwaScope = new URL(readyRegistration.scope).pathname;
    });
    return registration;
  }).catch((error) => {
    document.documentElement.dataset.pwaStatus = 'failed';
    console.warn('Service Worker registration failed; continuing online.', error);
    return null;
  });
}

// GitHub Pages development default: local repository only.
// Replace `null` with the values from Firebase Console, or assign the same
// object to window.__MC_FIREBASE_CONFIG__ before src/app.js is loaded.
export const firebaseConfig = null;

export function resolveFirebaseConfig() {
  return globalThis.__MC_FIREBASE_CONFIG__ ?? firebaseConfig;
}

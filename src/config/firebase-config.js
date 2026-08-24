// Public Firebase Web App configuration for the production GitHub Pages app.
// Authorization is enforced by Authentication and firestore.rules; these
// project identifiers are intentionally safe to ship in the browser bundle.
export const firebaseConfig = Object.freeze({
  apiKey: 'AIzaSyAKzW2Gb_2QEN4vSiKCMEY9JMm2UOEtWLI',
  authDomain: 'monster-collections.firebaseapp.com',
  projectId: 'monster-collections',
  storageBucket: 'monster-collections.firebasestorage.app',
  messagingSenderId: '837432583764',
  appId: '1:837432583764:web:22c992d2c6db3623dd2fc1',
});

export function resolveFirebaseConfig() {
  return globalThis.__MC_FIREBASE_CONFIG__ ?? firebaseConfig;
}

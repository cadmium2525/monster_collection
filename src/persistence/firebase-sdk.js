export const FIREBASE_SDK_VERSION = '12.17.1';

export async function loadFirebaseSdk() {
  const base = `https://www.gstatic.com/firebasejs/${FIREBASE_SDK_VERSION}`;
  const [app, auth, firestore] = await Promise.all([
    import(`${base}/firebase-app.js`),
    import(`${base}/firebase-auth.js`),
    import(`${base}/firebase-firestore.js`),
  ]);
  return { ...app, ...auth, ...firestore };
}

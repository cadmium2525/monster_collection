# Firebase setup

The game runs in local-only mode when Firebase is not configured. Local saves are kept in browser storage and are not deleted when Firebase initialization or writes fail.

This implementation uses **Cloud Firestore, not Firebase Realtime Database**. Firestore still provides real-time listeners (`onSnapshot`) for the current champion, while its document model and transactions fit saved 40-card decks and versioned crown updates.

## 1. Create the project

1. Create a Firebase project and register a Web app.
2. Enable **Authentication → Sign-in method → Anonymous**.
3. Create a Cloud Firestore database.
4. In Authentication settings, add the production GitHub Pages hostname (for example `YOUR_NAME.github.io`) to Authorized domains.

Firebase's current browser-module setup is documented at [Alternative ways to add Firebase](https://firebase.google.com/docs/web/alt-setup). This project pins the CDN modules to `12.17.1` in `src/persistence/firebase-sdk.js`.

## 2. Add the web configuration

Edit `src/config/firebase-config.js` and replace `null` with the Web app configuration shown by Firebase Console:

```js
export const firebaseConfig = {
  apiKey: "...",
  authDomain: "YOUR_PROJECT.firebaseapp.com",
  projectId: "YOUR_PROJECT",
  storageBucket: "YOUR_PROJECT.firebasestorage.app",
  messagingSenderId: "...",
  appId: "..."
};
```

Alternatively, load a small script before `src/app.js` which assigns the same object to `window.__MC_FIREBASE_CONFIG__`; `firebase-config.example.js` shows the format.

Firebase web configuration identifies the project and is not an administrator secret. Access control still depends on Authentication and `firestore.rules`. Restrict the API key to the required APIs and production host in Google Cloud Console.

## 3. Deploy security rules

Install the Firebase CLI, authenticate it, then copy `.firebaserc.example` to `.firebaserc` and replace the project id.

```sh
firebase deploy --only firestore:rules,firestore:indexes
```

The app uses this schema:

```text
users/{uid}
users/{uid}/savedDecks/{deckId}
legendDecks/{uid--deckId}
gameState/champion
```

Saved deck documents contain 40 card instance/master-id pairs plus name, total play TP, deck-specific qualification, highest reach, representative monster, and timestamps.

When a saved deck earns `qualification: "legend"`, the Repository also publishes a sanitized 40-card snapshot to `legendDecks`. Authenticated players may read these snapshots; only the owner can create, update, or delete one. Security Rules cross-check the public snapshot against the owner's private `savedDecks` document and profile. A Legend tournament loads up to 14 valid snapshots from other users, ignores invalid/stale master data, fills empty slots with generated Legend CPUs, and always reserves the final opponent for `gameState/champion`.

The champion document contains:

- `championUserId`
- `championDisplayName`
- `championDeckId`
- `championDeckName`
- `championDeckSnapshot` (40 cards)
- `representativeMonsterId`
- `crownedAt`
- `defenseCount`
- `championVersion`

## 4. Verify public Legend decks

After deploying the rules, win Gold with a deck (granting Legend qualification), then inspect `legendDecks` in Firebase Console. Open the game with a second anonymous account/browser and start a Legend Cup; the first account's deck should appear in the 16-player bracket as an `他プレイヤー` entrant. The source owner's own snapshot is excluded from their own tournament.

## 5. Champion concurrency policy

The Legend final captures `championVersion` at battle start. A win calls a Firestore transaction which reads the current champion and writes only if that version still matches. Concurrent changes cause `champion/version-conflict`; the old champion cannot overwrite the new champion. The active game policy is `strict-version-rechallenge` in `src/champion/policy.js`.

Firestore transactions fail offline by design. The game therefore does not claim an authoritative online crown through its local fallback when an online transaction fails.

## 6. Production integrity limitation

The static GitHub Pages client and Security Rules can enforce authentication, document shape, ownership, 40-card snapshots, and monotonic champion versions. They cannot prove that a user actually won a legal battle, because modified client code can forge a write. Before treating the crown as cheat-resistant production data, move the final win verification/claim to a trusted service (for example a callable Cloud Function that validates a signed replay) and consider App Check. The current transaction implementation is concurrency-safe, but not server-authoritative anti-cheat.

Anonymous accounts should be upgraded or linked to a durable sign-in method before launch if long-term ownership matters. Firebase can be configured to clean up old anonymous accounts; enabling that option would remove persistent identity for inactive users.

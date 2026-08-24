# Firebaseセットアップ

> 現在の本番環境はFirebaseプロジェクト`monster-collections`へ接続済みです。Webアプリ設定は`src/config/firebase-config.js`へ組み込み済みで、Firestore Security RulesとIndexesは2026-08-25に`(default)`データベースへデプロイ済みです。

Firebaseが設定されていない場合、ゲームはローカル専用モードで動作します。セーブデータはブラウザーのストレージに保持され、Firebaseの初期化や書き込みに失敗しても削除されません。

本実装で使用するデータベースは、Firebase Realtime Databaseではなく**Cloud Firestore**です。Firestoreでもリアルタイムリスナー（`onSnapshot`）を利用して現チャンピオンを購読できます。また、ドキュメント形式のデータモデルとトランザクションは、保存された40枚デッキやバージョン付き王座更新の管理に適しています。

## 1. Firebaseプロジェクトを作成する

1. Firebaseプロジェクトを作成し、Webアプリを登録します。
2. **Authentication → Sign-in method → Anonymous（匿名）**を有効にします。
3. Cloud Firestoreデータベースを作成します。
4. Authenticationの設定で、本番GitHub Pagesのホスト名（例：`YOUR_NAME.github.io`）を承認済みドメインへ追加します。

現在のFirebaseブラウザーモジュールの設定方法は、公式ドキュメントの[Firebaseを追加する別の方法](https://firebase.google.com/docs/web/alt-setup)を参照してください。本プロジェクトでは、`src/persistence/firebase-sdk.js`でCDNモジュールのバージョンを`12.17.1`に固定しています。

## 2. Webアプリの設定を追加する

本番設定は`src/config/firebase-config.js`へ組み込み済みです。将来別のFirebaseプロジェクトへ切り替える場合は、Firebase Consoleに表示されるWebアプリ設定でこのオブジェクトを置き換えます。

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

別の方法として、`src/app.js`より前に小さなスクリプトを読み込み、同じ設定オブジェクトを`window.__MC_FIREBASE_CONFIG__`へ代入することもできます。書式は`firebase-config.example.js`を参照してください。

FirebaseのWeb設定は接続先プロジェクトを識別する情報であり、管理者用の秘密情報ではありません。アクセス制御はAuthenticationと`firestore.rules`で行います。Google Cloud Consoleでは、APIキーの利用先を必要なAPIと本番ホストに制限してください。

## 3. セキュリティルールをデプロイする

Firebase CLIをインストールしてログインします。その後、`.firebaserc.example`を`.firebaserc`へコピーし、プロジェクトIDを書き換えます。

```sh
firebase deploy --only firestore:rules,firestore:indexes
```

アプリでは次のデータ構造を使用します。

```text
users/{uid}
users/{uid}/savedDecks/{deckId}
legendDecks/{uid--deckId}
gameState/champion
```

`users/{uid}`にはプロフィール名に加えて、カード図鑑用の`ownedCardMasterIds`、`discoveredFusionIds`、`catalogSchemaVersion`、`catalogUpdatedAt`を保存します。これらは追加専用の履歴としてRepositoryのtransactionで集合統合し、カードをデッキから放出した後も削除しません。

保存デッキのドキュメントには、40枚分のカードインスタンスIDとマスターIDの組、デッキ名、総プレイTP、デッキ単位の大会出場資格、最高到達大会、代表モンスター、各種日時を保存します。

保存デッキが`qualification: "legend"`を獲得すると、Repositoryは個人情報を除いた40枚スナップショットを`legendDecks`へ公開します。認証済みプレイヤーはこのスナップショットを読み込めますが、作成・更新・削除できるのは所有者だけです。Security Rulesでは、公開スナップショットを所有者の非公開`users/{uid}/savedDecks/{deckId}`ドキュメントおよびプロフィールと照合します。

レジェンドカップでは、他ユーザーの有効なスナップショットを最大14デッキ読み込みます。不正なデータや現在のマスターデータと整合しない古いデータは除外し、空き枠は自動生成したLegend CPUで補います。決勝の対戦相手は常に`gameState/champion`の現チャンピオンです。

チャンピオンのドキュメントには、次の項目を保存します。

- `championUserId`
- `championDisplayName`
- `championDeckId`
- `championDeckName`
- `championDeckSnapshot`（40枚）
- `representativeMonsterId`
- `crownedAt`
- `defenseCount`
- `championVersion`

## 4. 他プレイヤーのレジェンドデッキを確認する

Security Rulesのデプロイ後、デッキでゴールドカップに優勝し、レジェンド出場資格を獲得します。その後、Firebase Consoleで`legendDecks`を確認してください。

別のブラウザーまたは別の匿名アカウントでゲームを開き、レジェンドカップを開始します。最初のアカウントのデッキが、16人トーナメント表へ`他プレイヤー`枠として登場すれば正常です。自分が所有する公開スナップショットは、自分の大会には登場しません。

## 5. 王座更新時の競合ポリシー

レジェンド決勝の開始時に`championVersion`を取得します。勝利後はFirestore transactionで現在のチャンピオンを読み込み、バージョンが一致している場合だけ新チャンピオンを書き込みます。

対戦中に別ユーザーが王座を更新していた場合は`champion/version-conflict`となり、古い王者データが新しい王者を上書きすることはありません。現在のゲームポリシーは、`src/champion/policy.js`の`strict-version-rechallenge`です。

Firestore transactionは、仕様上オフラインでは失敗します。そのため、オンラインでの王座更新に失敗した場合、ローカル保存へのフォールバックだけで正式な王座獲得とは判定しません。

## 6. 本番運用における整合性の制限

静的なGitHub PagesクライアントとSecurity Rulesでは、認証、ドキュメント形式、所有権、40枚スナップショット、`championVersion`の単調増加を検証できます。一方、改変されたクライアントコードから勝利結果を偽装できるため、ユーザーが正規のバトルに実際に勝利したことまでは証明できません。

不正耐性のある本番王座データとして運用する前に、最終勝利の検証と王座更新を信頼できるサーバー側処理へ移してください。例えば、署名付きリプレイを検証するCallable Cloud Functionsを利用し、App Checkの導入も検討します。現在のtransaction実装は同時更新に対して安全ですが、サーバー権威型のチート対策ではありません。

長期的なデッキ所有権を維持する場合、正式公開前に匿名アカウントを永続的なログイン方法へアップグレードまたは連携できるようにしてください。Firebaseには古い匿名アカウントを自動削除する設定がありますが、これを有効にすると、長期間利用していないユーザーの永続IDも削除されます。

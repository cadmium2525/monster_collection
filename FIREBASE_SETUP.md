# Firebaseセットアップ

> 現在の本番環境はFirebaseプロジェクト`monster-collections`へ接続済みです。Webアプリ設定は`src/config/firebase-config.js`へ組み込み済みです。Firestore Security Rulesは2026-08-29、Indexesは2026-08-25に`(default)`データベースへデプロイ済みです。

Firebaseが設定されていない場合、ゲームはローカル専用モードで動作します。セーブデータはブラウザーのストレージに保持され、Firebaseの初期化や書き込みに失敗しても削除されません。

本実装で使用するデータベースは、Firebase Realtime Databaseではなく**Cloud Firestore**です。Firestoreでもリアルタイムリスナー（`onSnapshot`）を利用して現チャンピオンを購読できます。また、ドキュメント形式のデータモデルとトランザクションは、保存された40枚デッキやバージョン付き王座更新の管理に適しています。

## 1. Firebaseプロジェクトを作成する

1. Firebaseプロジェクトを作成し、Webアプリを登録します。
2. **Authentication → Sign-in method → Anonymous（匿名）**を有効にします。
3. 同じ画面で**Email/Password（メール/パスワード）**も有効にします。メールリンク方式は有効にしなくて構いません。
4. Cloud Firestoreデータベースを作成します。
5. Authenticationの設定で、本番GitHub Pagesのホスト名（例：`YOUR_NAME.github.io`）を承認済みドメインへ追加します。

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

`users/{uid}`にはプロフィール名に加えて、カード図鑑用の`ownedCardMasterIds`、`discoveredFusionIds`、`catalogSchemaVersion`、`catalogUpdatedAt`を保存します。これらは追加専用の履歴としてRepositoryのtransactionで集合統合し、カードをデッキから放出した後も削除しません。v1.20.0以降は、通算試合・勝敗・大会参加／優勝・王座獲得・奪取枚数を`stats`へ保存します。各更新は一意のoperation IDを持ち、大会再開時にも二重計上しません。

v1.14.0以降は同じ`users/{uid}`に`economy`も保存します。ここには所持ダイヤ、初回無料回数、未所属カード資産、モン類別パック回数、処理済みoperation ID、演出前に確定した未確認パックが入ります。v1.17.0以降はさらにプレイヤー共通の`tournamentQualification`、デイリー報酬の`lastDailyLoginDate`、一回性報酬の`claimedCampaignIds`を保存します。パック購入・大会報酬・ログイン報酬・大会解禁はFirestore transactionで更新し、再送時の二重消費・二重受取を防ぎます。`savedDecks/{deckId}`には使用中40枚に加えて、その保存デッキだけで使える`pool`が保存されます。外観違いは`artVariantId`と`finish`で区別します。

同じユーザードキュメントの`activeRun`には、進行中大会・バトル・カード奪取の再開用チェックポイントを保存します。自分だけが読み書きでき、各端末のLocalStorageにも同じデータを先に保存します。`updatedAtMs`が新しい状態だけをtransactionで採用し、大会終了時は`phase: "cleared"`のtombstoneを残すため、遅れて届いた古い保存で終了済み大会が復活しません。

保存デッキのドキュメントには、40枚分のカードインスタンスIDとマスターIDの組、デッキ名、デッキ総TP、最高到達大会、代表モンスター、各種日時を保存します。`qualification`は旧版および公開デッキ互換用にプレイヤー解禁をミラーしますが、解禁の正本は`users/{uid}.economy.tournamentQualification`です。

プレイヤーが`tournamentQualification: "legend"`を獲得した後、Repositoryは個人情報を除いた保存40枚スナップショットを`legendDecks`へ公開します。認証済みプレイヤーはこのスナップショットを読み込めますが、作成・更新・削除できるのは所有者だけです。Security Rulesでは、公開スナップショットを所有者の非公開`users/{uid}/savedDecks/{deckId}`ドキュメント、プロフィール、プレイヤーのLegend解禁と照合します。

レジェンドカップでは、他ユーザーの有効なスナップショットを最大14デッキ読み込みます。不正なデータや現在のマスターデータと整合しない古いデータは除外し、空き枠は自動生成したLegend CPUで補います。決勝の対戦相手は常に`gameState/champion`の現チャンピオンで、戴冠した大会の決勝開始時40枚と成長状態を再現します。

チャンピオンのドキュメントには、次の項目を保存します。

- `championUserId`
- `championDisplayName`
- `championDeckId`
- `championDeckName`
- `championDeckSnapshot`（40枚）
- `championGrowthSnapshot`（決勝開始時のカードインスタンス別LIFE／ATK／DEF成長・習得技・実戦4技）
- `championSnapshotVersion`（現行は`2`）
- `representativeMonsterId`
- `crownedAt`
- `defenseCount`
- `championVersion`

## 4. 他プレイヤーのレジェンドデッキを確認する

Security Rulesのデプロイ後、いずれかのデッキでゴールドカップに優勝し、プレイヤー共通のレジェンド出場資格を獲得します。その後、Firebase Consoleで`legendDecks`を確認してください。

別のブラウザーまたは別の匿名アカウントでゲームを開き、レジェンドカップを開始します。最初のアカウントのデッキが、16人トーナメント表へ`他プレイヤー`枠として登場すれば正常です。自分が所有する公開スナップショットは、自分の大会には登場しません。

## 5. 王座更新時の競合ポリシー

レジェンド決勝の開始時に`championVersion`を取得します。勝利後はFirestore transactionで現在のチャンピオンを読み込み、バージョンが一致している場合だけ新チャンピオンを書き込みます。

王座へ保存する40枚と成長状態は、決勝のBattleEngineを作成する直前に固定します。決勝中に追加されたTraining・修行、および決勝勝利後のカード奪取はユーザーの保存デッキには反映されますが、今回の王座防衛スナップショットには含めません。旧形式の現チャンピオンに`championGrowthSnapshot`がない場合は、次の戴冠まで成長量0として互換動作します。

対戦中に別ユーザーが王座を更新していた場合は`champion/version-conflict`となり、古い王者データが新しい王者を上書きすることはありません。現在のゲームポリシーは、`src/champion/policy.js`の`strict-version-rechallenge`です。

Firestore transactionは、仕様上オフラインでは失敗します。そのため、オンラインでの王座更新に失敗した場合、ローカル保存へのフォールバックだけで正式な王座獲得とは判定しません。

## 6. 本番運用における整合性の制限

静的なGitHub PagesクライアントとSecurity Rulesでは、認証、ドキュメント形式、所有権、40枚スナップショット、`championVersion`の単調増加を検証できます。一方、改変されたクライアントコードから勝利結果を偽装できるため、ユーザーが正規のバトルに実際に勝利したことまでは証明できません。

不正耐性のある本番王座データとして運用する前に、最終勝利の検証と王座更新を信頼できるサーバー側処理へ移してください。例えば、署名付きリプレイを検証するCallable Cloud Functionsを利用し、App Checkの導入も検討します。現在のtransaction実装は同時更新に対して安全ですが、サーバー権威型のチート対策ではありません。

## 7. マイページのアカウント復旧

新規プレイヤーは従来どおり匿名認証で直ちに開始します。ホーム右上の**マイページ**から「このデータに復旧設定を登録」を選ぶと、現在の匿名Firebase UIDへメールアドレス／パスワード資格情報をリンクします。リンク時にUIDは変わらないため、既存の保存デッキ、ダイヤ、未所属資産、図鑑、大会再開データ、王座データの所有者IDを移行する必要はありません。

機種変更後またはPWAを削除した後は、新しい端末でマイページを開き「既存アカウントで復旧」から同じメールアドレス／パスワードでログインします。ログイン成功後にアプリを再読込し、そのUIDのFirestoreデータを読み込みます。仮の匿名端末キャッシュと復旧したアカウントのローカルバックアップは別スコープへ保存され、図鑑やデッキが混ざらない構造です。進行中大会がある端末では、別アカウントへの切替を禁止します。

パスワードを忘れた場合は、マイページまたは復旧ログイン画面からFirebase Authenticationの再設定メールを送信します。Authentication → Templatesで、送信者名、件名、本文、アクションURLの表示を本番公開前に確認してください。登録時にも確認メールを送りますが、現版では未確認メールでもログイン自体は可能です。

Firebase Authentication with Identity Platformの「匿名アカウントの自動クリーンアップ」を使う場合、復旧設定を登録していない匿名ユーザーは削除対象になり得ます。メール／パスワードをリンクしたユーザーは匿名アカウントではなくなるため対象外です。

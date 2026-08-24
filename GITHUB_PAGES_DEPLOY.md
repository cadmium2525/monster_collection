# GitHub Pages公開手順

このプロジェクトはルート直下を直接公開せず、`npm run build` が作る `dist/` だけをPagesへ送ります。すべての実行時URLは相対指定なので、`https://USER.github.io/REPOSITORY/` のようなサブパスでも動作します。

## 初回設定

1. GitHubへリポジトリを作成し、このコードを `main` または `master` へpushします。
2. GitHubの **Settings → Pages → Build and deployment → Source** で **GitHub Actions** を選択します。
3. Firebaseを使う場合は、先に [FIREBASE_SETUP.md](./FIREBASE_SETUP.md) に従って `src/config/firebase-config.js` を設定し、Firestore Rulesをデプロイします。
4. Firebase AuthenticationのAuthorized domainsへ `USER.github.io` と、使用する独自ドメインがあればそのホスト名を追加します。

`.github/workflows/pages.yml` はpushごとに次を実行します。

1. Node.js 20で全テスト
2. Pages用静的成果物の生成
3. `dist/` のartifact upload
4. GitHub Pagesへのdeploy

Actionsの `Test and deploy GitHub Pages` が成功すると、deploy jobのEnvironment URLから開けます。

## 手元での本番確認

```sh
npm run check
npm run preview
```

サブパスまで検証する場合は次を実行し、表示されたURLを開きます。

```sh
node scripts/serve.mjs --root dist --base /REPOSITORY/ --port 4175
```

## 公開前チェック

- 横画面844×390相当でホーム、バトル、報酬、40枚一覧が収まる
- `npm test` と `npm run build` が成功する
- Firebase利用時はホーム表示が `FIREBASE` になり、匿名ユーザーが作成される
- Firestoreの `gameState/champion` を別ブラウザで更新するとホームへ反映される
- レジェンド戦開始後に王座versionを変え、古いversionで上書きされない
- Firebase障害時も直前のローカル40枚が残る

## キャッシュ

ビルドは相対ES Moduleの各importとマスターJSONへpackage versionを付けます。リリース内容を変えた場合は `package.json` のversionも更新してください。`.nojekyll` によりJekyll処理は無効です。

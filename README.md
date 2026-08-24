# モンスターコンストラクション

Repository: [cadmium2525/monster_collection](https://github.com/cadmium2525/monster_collection)

GitHub Pages: `https://cadmium2525.github.io/monster_collection/`

Sim8.7完全展開版を正本にした、スマートフォン横画面向けの静的Webカードゲームです。トーナメント4試合、勝利後のカード奪取、40枚の永続更新、上位大会解禁、レジェンド決勝の現チャンピオン戦まで一連に遊べます。

2026-08-24の仕様差分として、距離・得意距離・移動をゲーム判定から完全に廃止しています。盤面は距離を持たない3枠で、モンスター内包の実戦4技は任意の合法対象へ使います。マスターの `legacyDistance` は原典追跡専用で、UI・AI・ダメージ計算には使いません。

## 実装済み

- LIFE/TP/ドロー/召喚酔い/行動権/40T判定を含む共通 `BattleEngine`
- Training、修行、最大9習得技・実戦4技、通常合体、36種の特殊合体
- 全18モンスター、162技、20ブリーダーのマスターデータ
- 非チートのBronze / Silver / Gold / Legend / Champion AI
- 7テーマ・4ランクの制約付きCPU40枚生成と16人ブラケット
- 5枚提示、最大2枚獲得、同数放出、最終確認付きカード奪取
- ユーザーごと最大5つの名前付き保存デッキとデッキ単位の大会資格
- LocalStorage / FirebaseのRepository層、匿名認証、王座のリアルタイム購読
- `championVersion` を比較するFirestore transaction
- GitHub Pages用ビルドとGitHub Actions
- インストール可能なPWA、横画面standalone表示、オフライン用アプリシェル、maskableアイコン
- seed付きAI・大会・デッキ生成検証CLI

## ローカル起動

必要環境はNode.js 20以上です。外部npm依存はありません。

```sh
npm test
npm run dev
```

表示された `http://127.0.0.1:4173/` を開きます。Firebase未設定時も、保存先をこのブラウザのLocalStorageとして全ゲームループを利用できます。

本番相当のPages成果物は次で確認できます。

```sh
npm run build
npm run preview
```

## 遊び方

1. ホームから保存デッキを1つ選び、大会へエントリーします。
2. 手札カードをタップして選択し、モンスターは空き枠へ、Training・修行・対象指定ブリーダーは盤上モンスターへスワイプします。対象を取らないブリーダーは盤面の任意位置へスワイプします。
3. 盤上モンスターをタップすると、現在覚えている技と能力を確認できます。実戦技をタップし、光った相手モンスター（盤面が空なら相手LIFE）をタップして攻撃します。
4. 勝利後、相手40枚から提示された5枚のうち0〜2枚を選び、同数の自分のカードと交換します。
5. 交換確定時点の40枚は即時保存されます。敗退しても確定済みカードは残ります。
6. 優勝したデッキだけが次大会へ進めます。レジェンド決勝勝利で王座更新を試みます。

修行では攻撃/防御別の候補一覧を確認後、seed付き乱数で技を1つ習得します。Rankによる確率差は小さくしています。5個目以降を覚えた場合は、その場で現在の実戦4技のどれかと入れ替えるか、「習得のみ」を選ぶまで次の行動へ進みません。Training・修行の成長は同じ大会の次試合へ持ち越され、大会終了時に消えます。カード構成と大会資格だけが永続です。

各試合の開始時に、双方の40枚は試合seedから分岐したプレイヤー別seedでシャッフルされ、その後に初期3枚を引きます。通常プレイは大会を開始するたびに新しいseedを発行します。URLの `?seed=任意文字列` を使った場合だけ、同じ大会回数・ラウンドの順序をデバッグ用に再現します。山札切れ時も墓地をシャッフルして山札へ戻します。

## PWAとしてインストール

- Android/デスクトップChrome系: ホームに表示される「アプリに追加」またはブラウザーのインストール操作を使用。
- iPhone/iPad: Safariの共有ボタンから「ホーム画面に追加」を選択。
- 一度オンラインで起動すると、ゲーム本体とマスターデータを端末へ保存し、Firebase未接続時もオフラインでLocalStorageのデッキを遊べます。

王座の取得・更新やクラウド同期には通信が必要です。オフライン中に王座更新をローカル成功として偽装することはありません。

## 検証コマンド

```sh
npm test
npm run sim -- --a silver --b gold --games 20 --seed sample --time-ms 22 --summary
npm run sim:decks -- --runs 5 --seed sample --summary
npm run sim:tournament -- --rank bronze --runs 3 --player-ai legend --seed sample --time-ms 55 --summary
```

詳細出力から `--summary` を外すと、カード・技・特性統計と各試合seedを含む完全JSONを取得できます。URLへ `?seed=任意文字列` を付けるとブラウザ側の大会seedも固定できます。`&debug=1` の試合決着補助は `localhost` / `127.0.0.1` だけで有効です。

## Firebaseと公開

- Firebase設定: [FIREBASE_SETUP.md](./FIREBASE_SETUP.md)
- GitHub Pages公開: [GITHUB_PAGES_DEPLOY.md](./GITHUB_PAGES_DEPLOY.md)
- ルール: [firestore.rules](./firestore.rules)

Firebase Web設定値はプロジェクト識別子であり管理者秘密ではありませんが、アクセス制御はAuthenticationとSecurity Rulesへ依存します。静的クライアントだけでは勝利の改ざん耐性を証明できないため、競合安全な王座更新とサーバー権威の不正防止は別問題として扱っています。

## コード構成

```text
src/data          マスター・初期40枚
src/battle        純粋ルール、BattleEngine、seeded simulation
src/ai            評価器、行動列探索、5段階AI、検証集計
src/tournament    16人大会、ランク別CPU生成・統計
src/reward        カード奪取transactionモデル
src/decks         最大5保存デッキ
src/persistence   Local/Firebase/Resilient Repository
src/champion      王座競合ポリシー
src/game          一連プレイ統合・大会プレイテスト
src/ui            動的カード、バトル、大会、報酬、デッキ画面
tests             Node標準テスト
tools             AI・大会・生成統計CLI
```

仕様判断は [IMPLEMENTATION_QUESTIONS.md](./IMPLEMENTATION_QUESTIONS.md)、実測と提案は [PLAYTEST_REPORT.md](./PLAYTEST_REPORT.md)、残課題は [HANDOFF.md](./HANDOFF.md) を参照してください。

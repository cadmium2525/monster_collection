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
2. 手札カードをタップして合法行動を選びます。同じモンスターをもう一度タップすると、全9技・実戦4技・現在値を確認できます。
3. 勝利後、相手40枚から提示された5枚のうち0〜2枚を選び、同数の自分のカードと交換します。
4. 交換確定時点の40枚は即時保存されます。敗退しても確定済みカードは残ります。
5. 優勝したデッキだけが次大会へ進めます。レジェンド決勝勝利で王座更新を試みます。

Training・修行の成長は同じ大会の次試合へ持ち越され、大会終了時に消えます。カード構成と大会資格だけが永続です。

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

# モンスターコンストラクション 実装計画

基準: SavePoint Sim8.7 完全展開版（2026-08-23）  
実装開始: 2026-08-24

## 実装原則

- 添付ZIPの展開内容を唯一のプロジェクト正本とする。
- ユーザー追加指示「距離システム廃止」はSim8.7より新しい確定差分として優先する。
- 永続40枚デッキと、トーナメント内だけの育成状態を別モデルにする。
- 人間UIと全CPUは同じ `BattleEngine` と合法手APIを使う。
- 乱数はすべてseed注入可能にする。
- Firebase SDKはRepository層の外へ漏らさない。未設定・障害時は検証済みローカル保存を保護する。
- GitHub Pages向けに相対URLだけを使う静的Webアプリとする。

## 採用技術

- HTML / CSS / JavaScript ES Modules（ビルド不要）
- Node.js標準テストランナー (`node --test`)
- Firebase Authentication（匿名認証）/ Cloud Firestore（任意設定）
- LocalStorage Repository（オフライン・未設定時の完全フォールバック）
- GitHub Actions + GitHub Pages

## Phase 1: 正本解析

- [x] ZIP展開・manifest確認
- [x] Sim8.3〜8.7仕様、最新引き継ぎ、UIリファレンス確認
- [x] Ver5 ExcelをJSONへ変換（18モンスター、162技、20ブリーダー、36特殊合体）
- [x] Sim8.0〜8.6dの進行・先後・40T・CPU生成検証を確認
- [x] 距離廃止の影響範囲を確定
- [x] マスター読み込み・整合性テスト

## Phase 2: BattleEngine（完了）

- 40枚検証、同名上限、総プレイTP、先攻決定
- 初期手札、通常ドロー、手札上限、墓地再シャッフル
- 召喚、召喚酔い、行動権、攻撃、直接攻撃、超過ダメージ
- Training、修行、習得最大9技、実戦4技
- 通常/特殊合体、解禁ターン、TP、SP再配分、行動権非回復
- 通常18特性、特殊合体36特性、技効果、ブリーダー20種
- 40T残LIFE判定
- seeded自動対戦と単体テスト

## Phase 3: カード・バトルUI（完了）

- 動的カード描画（画像へ数値を焼き込まない）
- 汎用3枠盤面、手札、山札/墓地、LIFE/TP、ターン、状態、ログ
- モンスター詳細、習得技/実戦4技、攻撃技選択
- 召喚、攻撃、Training、修行、ブリーダー、合体、ターン終了
- 標準/高速テンポ、safe-area、iPhone横画面対応
- 遊び方内の7ステップチュートリアル、大会内成長の手札現在値表示

## Phase 4: CPU AI（完了）

- Bronze: 単一合法手の局所評価と小さな揺らぎ
- Silver: 撃破・打点・盤面・TP・育成・合体のスコアリング
- Gold: 1ターン行動列のBeam Search
- Legend: 公開情報だけから代表的な相手の返しを評価
- Champion: 時間上限付きの自分→相手返し→自分探索
- 同一40枚デッキAI比較と統計出力

## Phase 5: トーナメント（完了）

- 自分+CPU15名の16人ブラケット
- 1回戦、2回戦、準決勝、決勝の4試合
- 7テーマ×4大会の制約付きCPUデッキ生成
- 意図レシピ数、実成立レシピ数、素材コピー密度を別計測
- Bronze/Silver/Gold/Legendで候補生成数と選別精度を変更
- Legend決勝だけChampion Repositoryの40枚を使用

## Phase 6: カード奪取・デッキ管理（完了）

- 敗者40枚からseed付きランダム5枚提示
- 0〜2枚の仮選択、同数放出、最終確認、確定前キャンセル
- 交換確定時だけ40枚を更新
- 最大5デッキ、自由命名、総TP、代表モンスター、最高到達表示
- 敗退時保存、優勝時だけ次大会資格付与

## Phase 7: Firebase・王座（完了）

- Local / Firebase / Resilient Repository
- users、savedDecks、legendDecks、champion/current
- 現王者のリアルタイム購読
- championVersion付きFirestore transaction
- Legend資格40枚の公開スナップショットと他プレイヤー大会枠
- Firebase Security Rules、設定例、障害時ローカル保護

## Phase 8: 一連プレイ統合（完了）

- ホーム→デッキ→大会→4試合→奪取→保存→次大会
- レジェンド決勝→王座更新→ホーム反映
- GitHub Pages workflowと公開手順

## Phase 9: 検証・文書化（完了）

- 全自動テスト
- AI大量対戦CLI
- スマホ横画面の視覚QA
- 複数トーナメントの自動プレイと操作プレイ
- `PLAYTEST_REPORT.md`、`CHANGELOG.md`、`HANDOFF.md`

## 完了時点

- 実装完了日: 2026-08-24（1.5.0追補: 2026-08-25）
- 自動テスト、AI固定seed検証、実エンジン大会走行、844×390横画面のブラウザ操作を実施。
- Firebase資格情報なしでもLocalStorageで全ゲームループを実行可能。オンライン王座には利用者側Firebaseプロジェクト設定が必要。
- 未確定仕様、バランス観測、静的クライアントの不正耐性限界は `IMPLEMENTATION_QUESTIONS.md` と `HANDOFF.md` に分離した。

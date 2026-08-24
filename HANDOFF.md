# HANDOFF

基準: Sim8.7完全展開版 + 2026-08-24距離廃止差分  
リリース: 1.5.0（合体停滞対策・チュートリアル・公開Legendデッキ版）

## 現在の状態

ホームから保存40枚を選び、16人大会の4試合、各勝利後のカード奪取、敗退/優勝保存、次大会解禁、レジェンド決勝、王座transaction、ホームの王者リアルタイム表示まで接続済みです。Firebase未設定でもLocalStorageで同じゲームループを遊べます。

「遊び方」には横画面用の7ステップチュートリアルを追加済みです。旧い距離廃止注記は通常UIから除去しています。

距離システムはコード上も無効です。`RULES.distanceSystemEnabled` は `false`、合法行動にmovementはなく、盤面は汎用3枠です。`legacyDistance` は正本由来の追跡情報であり判定へ使わないでください。

バトル画面は左ステータス・中央テーブル・右ログの3列です。行動一覧はなく、手札を一度タップしてから合法対象へスワイプします。盤上モンスターは詳細内の実戦技を選び、盤面上の対象をタップします。高さ430px以下ではカードを高さ基準で縮尺します。Pointer Eventsは選択済みカードだけで開始し、バトル中のbody/appはviewportへ固定しています。タッチ端末ではhover/選択によるカード位置移動を発生させません。

ログは各再描画後に最下段へ追従します。CPUの最終イベント表示中にプレイヤーターンへ切り替わった場合も、その間の手札タップを1件保持し、演出終了後に選択へ反映します。

修行の合法手はカード/対象ごとに1つです。習得候補を `preview.possibleMoveIds` として表示しますが、確定技は `BattleEngine._shugyo()` がseed付き乱数で決めます。Rank重みはRank 1と5でも約10%差です。5個目以降を覚えると `state.pendingMoveChoice` が立ち、`resolve-shugyo-move` の「4技のどれかと入替」または「習得のみ」以外は合法になりません。人間は必須モーダル、CPUは同じ合法手と技評価で解決します。

特殊合体は `specialFusionId` で36セルの専用アトラスへ切り替わります。ブルードリルだけは切れを直した `blue-drill-v2.jpg` を使用します。Training・修行・ブリーダーも25セルの専用アトラスを使い、カード文字・数値・効果は従来どおり動的HTMLです。

合体は平均×1.20式に「メイン現在SP＋素材現在SPの10%（切上げ）」の最低保証を加え、必ずSPが増えます。合法手の `preview` と盤面のドロップ表示に増加量を出します。Training/修行は大会4試合を通じて保持し、大会終了時に消去します。手札カードにも現在の持越し値を表示します。

FirebaseはRealtime DatabaseではなくCloud Firestoreです。Legend資格を得た保存デッキは `legendDecks` に所有者管理の公開スナップショットを作り、他ユーザーのLegend通常枠へ最大14件を読み込みます。不足枠は生成CPU、決勝は現チャンピオン固定です。公開文書はSecurity Rulesで非公開元デッキと照合し、クライアントでも合法40枚を再検証します。

## 最初に実行する確認

```sh
npm test
npm run build
npm run preview
```

Pages workflowは `.github/workflows/pages.yml`。Firebase設定は `FIREBASE_SETUP.md`。外部資格情報はリポジトリへ含めていません。

## 重要な設計境界

- `BattleEngine.getLegalActions()` が人間と全AIの唯一の合法手供給源。
- AIへ渡す相手情報は `getObservation()` の公開情報だけ。相手の手札内容、山札順、未来乱数を参照しない。
- 永続デッキには `{instanceId, masterId}` だけを保存し、`tournamentGrowth` を混ぜない。
- カード奪取は `CardStealSession.commit()` まで元40枚を変更しない。
- Firebase SDKをUI・ゲームルールから直接呼ばず、Repositoryを介す。
- Online王座claimが失敗した場合、ローカル王座を真のOnline王座として成立させない。
- 特殊合体は基礎モンスターのモン類・技・育成を保持し、特性だけを特殊個体へ置換する。

## 未解決・本番前に必要な外部判断

1. **王座のサーバー権威化**  
   現在のFirestore transactionは同時更新と旧version上書きを防ぎますが、改造クライアントによる勝利偽装までは証明できません。本番で不正耐性が必要なら、行動ログを検証するCloud Function等へclaimを移してください。

2. **匿名アカウントの恒久化**  
   匿名認証のままブラウザデータを消すと同じ所有者へ戻れません。メール・Google等へのlink方針は正本にないため未採用です。

3. **王座戦中version変更のゲーム扱い**  
   現在は `strict-version-rechallenge`。旧王者スナップショット撃破後にversionが変わっていれば王座を書き換えず、現王者へ再挑戦します。これは設定可能なポリシーとして分離済みです。

4. **進行中大会のブラウザ再読込**  
   交換確定済み40枚は常に安全ですが、試合/大会の途中state自体は再開しません。再読込するとホームへ戻ります。正本の完成条件には含まれないため、壊れやすい半端なsession復元は入れていません。

5. **距離廃止後の長期バランス**  
   supplied simulatorの旧勝率は距離あり条件です。本実装では同一40枚AI差を再校正しましたが、公開後のカード別・先後・大会突破率telemetryはありません。数値を無断変更せず、変更案はデータ取得後に提案として扱ってください。

6. **偶発特殊合体の多さ**  
   35生成×4ランクでは狙いレシピが1/2/3/4へ増える一方、Bronzeは多様な16モンスターから偶発レシピが多く成立します。狙いと実成立を別統計にしてあるため、実戦でBronzeが特殊合体過多なら低ランク候補poolの種数制約を検討してください。

7. **本番Firebaseプロジェクトの接続**
   Repository、Firestore schema、Rulesは実装済みですが、`src/config/firebase-config.js` は資格情報未提供のため `null` です。Firebase ConsoleのWeb設定、匿名認証、GitHub PagesのAuthorized domain、Rules deployを行うまでは本番もLocalStorageモードです。

## 保守時の主な場所

| 変更対象 | 主ファイル |
|---|---|
| 正式ルール | `src/battle/rules.js`, `src/battle/BattleEngine.js` |
| カード数値 | `src/data/master-data.json`（正本変換scriptも更新） |
| AI評価/探索 | `src/ai/public-evaluator.js`, `src/ai/search.js`, `src/ai/levels.js` |
| CPU40枚 | `src/tournament/deck-generator.js`, `deck-analyzer.js` |
| 大会進行 | `src/tournament/TournamentRun.js`, `src/game/GameSession.js` |
| バトル/大会UI | `src/ui/battle-screen.js`, `src/ui/card-renderer.js`, `styles.css` |
| 奪取 | `src/reward/CardStealSession.js`, `src/ui/reward-screen.js` |
| 永続化/公開Legend/王座 | `src/persistence/`, `src/tournament/TournamentRun.js`, `firestore.rules` |
| Pages | `scripts/build-pages.mjs`, `.github/workflows/pages.yml` |

## リリース前チェックリスト

- Firebase project設定、匿名認証、Authorized domains、Rules deploy
- `npm run check` 成功
- 実機iPhone横画面でタップ領域、safe-area、文字サイズ確認
- 2ブラウザ同時王座claimの競合試験
- Firebase offline/復帰試験
- 本番URLでマスターJSON、base/special/support atlas、背景、全ES Modulesが200になること
- `PLAYTEST_REPORT.md` の提案を仕様変更と混同しないこと

# HANDOFF

基準: Sim8.7完全展開版 + 2026-08-24距離廃止差分  
リリース: 1.0.0（プレイテスト可能な第1完成版）

## 現在の状態

ホームから保存40枚を選び、16人大会の4試合、各勝利後のカード奪取、敗退/優勝保存、次大会解禁、レジェンド決勝、王座transaction、ホームの王者リアルタイム表示まで接続済みです。Firebase未設定でもLocalStorageで同じゲームループを遊べます。

距離システムはコード上も無効です。`RULES.distanceSystemEnabled` は `false`、合法行動にmovementはなく、盤面は汎用3枠です。`legacyDistance` は正本由来の追跡情報であり判定へ使わないでください。

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

## 保守時の主な場所

| 変更対象 | 主ファイル |
|---|---|
| 正式ルール | `src/battle/rules.js`, `src/battle/BattleEngine.js` |
| カード数値 | `src/data/master-data.json`（正本変換scriptも更新） |
| AI評価/探索 | `src/ai/public-evaluator.js`, `src/ai/search.js`, `src/ai/levels.js` |
| CPU40枚 | `src/tournament/deck-generator.js`, `deck-analyzer.js` |
| 大会進行 | `src/tournament/TournamentRun.js`, `src/game/GameSession.js` |
| 奪取 | `src/reward/CardStealSession.js`, `src/ui/reward-screen.js` |
| 永続化/王座 | `src/persistence/`, `firestore.rules` |
| Pages | `scripts/build-pages.mjs`, `.github/workflows/pages.yml` |

## リリース前チェックリスト

- Firebase project設定、匿名認証、Authorized domains、Rules deploy
- `npm run check` 成功
- 実機iPhone横画面でタップ領域、safe-area、文字サイズ確認
- 2ブラウザ同時王座claimの競合試験
- Firebase offline/復帰試験
- 本番URLでマスターJSON、monster atlas、背景、全ES Modulesが200になること
- `PLAYTEST_REPORT.md` の提案を仕様変更と混同しないこと

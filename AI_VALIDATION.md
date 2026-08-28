# AI検証結果

実施日: 2026-08-29

基準: Sim8.7正本 + ユーザー指定の距離システム廃止

条件: 両者に同じ40枚スターターデッキを与え、AIレベルだけを変更

CPUは全レベルで人間と同じ `BattleEngine` の合法手APIを使用する。参照できるのは自分の手札と公開情報だけで、相手手札、山札順、次のドロー、未確定乱数は探索へ渡さない。

## Champion / Legend AI v1.16.0

決勝は1試合のまま、Championの自ターンを最大7行動、相手の公開盤面による返しを最大4行動、Championの既知カードによる次ターン継続を最大3行動まで探索する。本番予算はLegend 85ms、Champion 240ms。候補行動は48件まで即時評価してから枝刈りするため、技の対象候補が多い盤面でも強化解除や合体妨害などのサポート札が探索前に脱落しにくい。

評価には、実戦4技の威力とTPから見積もる公開打点、有効な強化・弱体状態、最大TP変化、合体妨害、次ターン最初の技TP増加、終盤の残LIFE優位を含める。相手の召喚、手札合体、Training、修行、ブリーダーは引き続き具体的カードを見ず、公開手札枚数と空き枠による危険度だけを使う。

同一40枚で左右を入れ替えた計24戦ではChampion 17勝、Legend 7勝でChampion勝率70.8%。先攻13勝、後攻11勝、40T判定0%、合体発生83.3%、特殊合体発生62.5%だった。強度差を明確にする今回の目標に合わせ、従来の隣接AI調整目安55〜60%より決勝だけ意図的に高くしている。

道中用Legend AIは同一40枚12戦でGoldへ7勝5敗（58.3%）。先攻・後攻は6勝ずつ、40T判定0%だった。デッキ生成は64候補・狙いレシピ5・モンスター15へ変更し、35生成の平均品質281.04、素材密度17.97。CPU同士の勝者は1試合10TPまで、修行を最大2枚使って成長を持ち越す。

## Champion AI v1.15.12

レジェンド決勝専用Champion AIは、以下の3層を制限時間内で評価する。

1. Championの現在ターン行動列（最大5行動）
2. 相手の公開盤面にいるモンスターによる返し（最大3行動）
3. Championの次ターンにおける既知カード／盤面の継続（最大2行動）

相手の召喚・Training・修行・ブリーダー・手札合体は、手札内容を見なければ確定できないため探索分岐へ入れず、公開されている手札枚数、空き枠、合体解禁状況から危険度として評価する。Championの次ドローも実カードを候補へ入れず、探索前から既知の手札、墓地、場のカードだけを使用可能とする。公開盤面が同一になった相手応手は重複除去する。

本番予算はLegend 55ms、Champion 140ms。固定seed `champion-minimax-v1`、同一40枚、両者10msへ圧縮した回帰12戦ではChampion 7勝、Legend 5勝。固定seed `champion-before-1.15.11`の6戦は旧Championが0勝6敗だった時間切れ条件から、新Championは6勝0敗へ改善した。140ms設定の初期盤面12判断は開発環境で平均105.0ms、最大129.9msだった。小標本かつ端末性能依存のため、勝率は強度の絶対保証ではなく回帰基準として扱う。

## 最終キャリブレーション

| 対戦 | 試合数 | 上位AI勝率 | 先攻勝率 | 平均ラウンド | 平均行動数 | 40T | 合体発生 | 特殊合体発生 |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| Bronze vs Silver | 20 | Silver 60% | 55% | 14.35 | 142.60 | 5% | 95% | 65% |
| Silver vs Gold | 20 | Gold 55% | 60% | 13.40 | 133.40 | 0% | 80% | 75% |
| Gold vs Legend | 20 | Legend 55% | 55% | 14.95 | 148.85 | 5% | 85% | 70% |
| Legend vs Champion | 20 | Champion 60% | 65% | 14.10 | 135.50 | 5% | 95% | 70% |

初期目標だった「隣接AIで上位が55〜60%」は全組合せで達成した。ただし各20戦の小標本なので、確定的なランキングではなく回帰検証用の固定seedベースラインとして扱う。

## 先攻・後攻の確認

同じGold AI、同じ40枚、30戦（seed `final-first-second`）では先攻22勝、後攻8勝で、先攻勝率73.3%だった。平均13.30ラウンド、40T判定0%、合体発生90%、特殊合体発生76.7%。

総プレイTPによる先攻決定そのものは仕様どおりで、同値時だけseed付き乱数を使っている。しかし、正本の「ほぼ50:50」という実績は距離・移動ありの旧シミュレーション結果である。距離廃止版には先攻優位の可能性があり、追加の大標本検証が必要。カード数値、ドロー、TP、先攻決定は無断で変更していない。

## 大会別デッキ生成統計

各ランク35デッキの固定seed集計:

| ランク | 意図レシピ | 実成立レシピ | 偶発レシピ | 素材密度 | 平均品質 |
|---|---:|---:|---:|---:|---:|
| Bronze | 1.00 | 13.14 | 12.14 | 14.23 | 99.77 |
| Silver | 2.00 | 11.29 | 9.29 | 12.60 | 144.43 |
| Gold | 3.00 | 7.03 | 4.03 | 13.77 | 191.41 |
| Legend | 4.00 | 7.74 | 3.74 | 15.37 | 249.67 |

候補選別により平均品質は大会ごとに上昇している。36レシピの素材重複が大きく、Bronzeでも偶発成立が多いことはバランス上の未解決事項である。生成器は意図数・実成立数・偶発数・素材密度を分離して出力するため、今後の制約調整を測定できる。

## 再現コマンド

```sh
npm run sim -- --a bronze --b silver --games 20 --seed tune2-bs --time-ms 12 --summary
npm run sim -- --a silver --b gold --games 20 --seed tune2-sg --time-ms 22 --summary
npm run sim -- --a gold --b legend --games 20 --seed tune2-gl --time-ms 55 --summary
npm run sim -- --a legend --b champion --games 20 --seed final-lc-v2 --time-ms 85 --summary
npm run sim -- --a legend --b champion --games 20 --seed champion-production --time-a 55 --time-b 140 --summary
npm run sim -- --a champion --b legend --games 12 --seed post-strengthening --time-a 240 --time-b 85 --summary
npm run sim -- --a legend --b champion --games 12 --seed post-strengthening-swap --time-a 85 --time-b 240 --summary
npm run sim -- --a legend --b gold --games 12 --seed legend-road-strengthening --time-a 85 --time-b 22 --summary
npm run sim -- --a gold --b gold --games 30 --seed final-first-second --time-ms 22 --summary
npm run sim:decks -- --runs 5 --seed final-deck-lab --summary
```

`tools/ai-lab.mjs` は勝率、先後勝率、平均ラウンド/行動数、40T率、合体/特殊合体率、カード・技・観測可能な特性発動統計、各試合seedを出力する。

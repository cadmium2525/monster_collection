# Changelog

## 1.5.1 — 2026-08-25

### Changed

- Firebaseプロジェクト`monster-collections`のWebアプリ設定を本番クライアントへ接続。
- GitHub Pages/PWAのキャッシュバージョンを1.5.1へ更新し、Firebase接続設定を既存インストールにも確実に配信。

### Security

- Firestoreへのアクセスは匿名Authenticationとリポジトリ管理の`firestore.rules`を前提とし、Firebase障害時は既存のLocalStorageデータを保持。

### Verified

- `monster-collections`の`(default)`データベースへFirestore Rules/Indexesをデプロイし、Rulesのコンパイルとrelease成功を確認。

## 1.5.0 — 2026-08-25

### Added

- ホームの「遊び方」から開始できる7ステップの横画面チュートリアル。勝利条件、スワイプ召喚、技攻撃、Training/修行、合体、TP、カード奪取を順に説明。
- Cloud Firestoreの `legendDecks` 公開スナップショット。Legend資格を得た保存40枚を所有者だけが更新し、他プレイヤーのレジェンド杯通常枠へ最大14デッキまで投入。
- 公開40枚を所有者の非公開保存デッキ・プロフィールと照合するFirestore Security Rulesと、破損/旧マスター文書を大会投入前に除外する合法性検証。
- 特殊合体36体を実ゲームの横長カード比率で一括確認する `tools/fusion-art-qa.html`。

### Changed

- 合体SPは従来の平均×1.20式を維持しつつ、最低でも「メイン現在SP＋素材現在SPの10%（切上げ）」になる保証を追加。育成済みメインの弱体化と手札モンスター滞留を防止。
- 手札モンスターへ同一大会で持ち越したTraining/修行の現在LIFE/ATK/DEFを表示し、`大会 +N` バッジを追加。成長寿命は大会終了までのまま維持。
- Legend杯は他プレイヤーの合法な公開デッキを優先して16人表へ入れ、不足枠だけを従来の制約付きLegend CPUで補完。決勝は引き続き現チャンピオン固定。
- PWAキャッシュと静的アセット版を1.5.0へ更新。

### Fixed

- ブルードリルの角・口先・頭部がアトラスセル境界で切れる問題を、専用の安全余白付きイラストへ差し替えて修正。
- 「遊び方」下の `距離廃止版ルール` と旧距離廃止注記を通常UIから削除。
- Champion AIの非公開手札不変テストを、端末負荷で探索深度が変わらない決定的探索モードへ分離。本番のスマホ向け思考時間上限は維持。

### Verified

- 67件の自動テストとGitHub Pagesビルドを確認。
- 844×390で7ステップすべてが680×341px内、内部スクロールなし、横縦overflowなしで表示され、大会選択まで遷移することを実ブラウザーで確認。
- 特殊合体36体を166×114pxの実カード画像比率で確認。ブルードリルは専用画像、他35体は正しいアトラスセルを使用し、欠落画像と追加の致命的な部位切れがないことを確認。
- Gold同士6戦の小標本で合体発生試合83.3%、特殊合体発生試合83.3%、40T判定0%、平均9.83ラウンドを確認。長期バランスの確定値ではない。
- Firestore Repository mockでLegend公開、他ユーザー読込、自分の除外、削除連動、16人枠への混在、決勝Champion固定を確認。

## 1.4.1 — 2026-08-24

### Fixed

- バトル画面の再描画後もログを最下段へ自動追従させ、常に最新イベントが見えるように修正。
- CPUの最終演出中に先行入力された手札カードのタップを予約し、演出完了後に1回のタップで選択状態へ反映。
- 予約されたタップへ即時の枠色・明度フィードバックを追加し、入力を受け付けたことを明示。

### Added

- ログoverflowとCPU最終演出中のタップを決定的に再現する844×390開発用QA画面。

### Verified

- 60件の自動テストとGitHub Pagesビルドを確認。
- 844×390で、ログ最下端への追従、1回のタップによる予約表示、演出終了後の同一カード選択を実ブラウザーで確認。

## 1.4.0 — 2026-08-24

### Added

- 修行で5個目以降の技を習得した直後に、現在の実戦4技のどれかと入れ替えるか、習得だけにするかを選ぶ必須フロー。
- 5択を `BattleEngine` の正式な合法行動にし、人間・全CPU・シミュレータで同じ4枠制限を使用。
- 特殊合体36形態をレシピ順に収録した6×6アトラスと、Training 3種・修行2種・ブリーダー20種を収録した5×5アトラス。
- 844×390 / 667×375のUI確認と5技目入替を再現する開発用viewport harness。

### Changed

- モンスターカードのLIFEを現在値だけの表示へ変更し、モン類の印章アイコンを撤去。
- 標準速度を緩和し、CPU行動間隔600ms、通常イベント850ms、重要イベント1250msへ延長。
- 能力増減を差分付き（例 `⬆︎ ATK +5` / `⬇︎ LIFE -12`）で約1.2秒表示し、矢印提示後に数値を更新。
- タッチ端末でカードhover/選択が位置を動かさないようにし、バトル中のbody/appをviewportへ固定。
- 新規画像を高品質JPEGへ最適化し、2アトラス合計を約7.7MBから約1.4MBへ削減。

### Verified

- 58件の自動テスト、GitHub Pagesビルド、全AI完走を確認。
- 844×390でbody/htmlが844×390、scroll 0、`position: fixed` / `overflow: hidden`であることを実測。
- 5技目の4入替候補＋習得のみを全表示し、「かみつき」→「インフェルノ」の入替とログ反映を実操作。
- 増減表示中に旧値から新値へ切り替わり、切替後も表示が残る順序を実ブラウザーで確認。

## 1.3.0 — 2026-08-24

### Added

- 選択済み手札カードを盤面へスワイプして、召喚、Training、修行、ブリーダー、合体を実行する直接操作。
- 盤上モンスター詳細の実戦技タップから、合法な攻撃対象を盤面上で選ぶ攻撃フロー。
- 修行前の習得候補一覧と確認/キャンセル、seed付きランダム技習得、小差のRank重み。
- Training/修行の発光演出、攻撃カードの突進、能力増減前の `⬆︎` / `⬇︎` 表示。

### Changed

- カード右上TPを `②` 形式へ変更し、モンスター名左へアタッカー/バランス/タンクの小型マークを表示。
- 手札モンスターから特性文と「モン類 / 役割」文字列を除き、詳細は現在覚えている技だけに簡略化。
- 右側の「行動を選ぶ」一覧を撤去し、ログ、速度、選択解除、ターン終了だけに整理。
- 相手盤上カードを180度反転し、ホームの代表モンスターをイラスト領域だけの表示へ変更。

### Verified

- 844×390と667×375で、スワイプ召喚、対象Training、修行候補/抽選、技選択/対象攻撃を実操作。
- 667×375でbodyの縦横overflowなし、技詳細は2列のまま主要情報と覚えている技を同時表示。

## 1.2.1 — 2026-08-24

### Changed

- バトル画面をUIリファレンス準拠の「左ステータス / 中央テーブル / 右コマンド」構成へ全面再設計。
- 相手の伏せ手札、LIFE/TPゲージ、山札/墓地、上下3枠盤面、常時表示ログを一画面へ整理。
- 手札カードを高さ基準で縮尺し、モンスター画像・TP・LIFE/ATK/DEF・効果が潰れにくい表示へ変更。
- Training、修行、ブリーダーのカード種別を色と印章で識別可能に変更。
- 高さ430px以下では大会の対戦案内を右側へ移し、16人ブラケットの縦領域を確保。

### Fixed

- 844×390前後の横画面で、行動候補が手札へ重なりカード下部が欠ける問題。
- 低い横画面で大会ブラケット下部が切れ、全8試合を確認できない問題。
- デバッグseed表示を本番UIへ出さず、デバッグモード内だけに限定。
- PWA更新時に新Service Workerへ切り替わったら一度だけ自動再読込し、旧UIキャッシュが残る問題。

## 1.1.0 — 2026-08-24

### Added

- GitHub Pagesのサブパスに対応したWeb App ManifestとService Worker。
- 192px、512px、1024px maskable、iOS 180pxのアプリアイコン。
- standalone横画面、オフラインアプリシェル、Firebase CDNの通信失敗時cache fallback。
- 対応ブラウザーのホーム画面に「アプリに追加」導線、iOS向け追加手順。
- 各試合開始時の双方40枚シャッフルを同一seed再現・異seed変化まで確認する回帰テスト。
- 同じページ内で再挑戦しても、通常プレイの大会seedを使い回さないrun seed発行器。

### Verified

- シャッフルは初期3枚を引く前に実行され、山札切れ時も墓地を再シャッフルする。
- PWAのstart URLとscopeは相対指定で、`/monster_collection/`配下から外れない。

## 1.0.0 — 2026-08-24

プレイテスト可能な第1完成版。

### Added

- Sim8.7完全展開版の18モンスター、162技、20ブリーダー、36特殊合体をJSONマスター化。
- 人間UIと全CPUが共有するseed注入可能な `BattleEngine`。
- 正式ドロー、召喚酔い、行動権、合体解禁、総プレイTP先攻、40ラウンド残LIFE判定。
- Training、修行、トーナメント内成長、最大9習得技・実戦4技。
- Bronze / Silver / Gold / Legend / Championの非チートAIと時間制限付き探索。
- 7テーマ、ランク別候補選別、狙い/実成立/偶発レシピを分離するCPUデッキ生成器。
- 16人ブラケット、プレイヤー4試合、レジェンド決勝だけ現チャンピオンとなる大会進行。
- 5枚提示、最大2枚、同数放出、最終確認、キャンセル可能なカード奪取。
- 最大5保存デッキ、デッキ単位資格、敗退時保存。
- LocalStorage / Firebase / 障害耐性Repositoryと王座version transaction。
- スマホ横画面UI、safe-area、標準/高速演出、縦向き案内。
- GitHub Pagesビルド、サブパスpreview、Actions deploy。
- AI比較、CPUデッキ統計、実エンジン大会プレイテストCLI。
- オリジナルの大会背景と18体モンスター肖像atlas。

### Changed from Sim8.7 by explicit user amendment

- 距離、得意距離、遠/中/近レーン、移動行動を廃止。
- 盤面を距離のない3つの汎用枠とし、実戦技は任意の合法対象へ使用可能に変更。
- 旧距離データは原典追跡用 `legacyDistance` としてのみ保持。

### Fixed during playtest

- 未来ラウンドへ誤ってWINが表示されるブラケット表示。
- CPU名の姓が過度に重複する生成。
- 844×390でブラケット下部がはみ出す問題。
- CPU演出待機中に試合が終了した際、終了済みstateへ行動を適用する競合。
- 特殊合体後も基礎特性の状態・表示文が残る問題。
- 反動ダメージが「被攻撃」特性を発動する問題。
- Silverのターン終了だけ絶対評価値、他行動は差分値だったAIスコア不整合。
- 上位AIが下位AIより明白に悪い単発手を選ぶ探索退行。
- 初期40枚に修行とブリーダーがなく、序盤の学習と耐久性が不足していた構成。
- Legend生成時の素材削減で狙った特殊合体レシピが壊れる場合。

## Generated raster asset prompts

生成には組み込みImageGenを使用し、成果物を `assets/images/` へ保存した。カード名、数値、効果、UIは画像へ焼き込んでいない。

### `battle-arena.png`

```text
A wide 16:9 dark fantasy tournament arena background for a Japanese mobile landscape web card battle game. Ancient circular stone colosseum at twilight, deep navy and charcoal palette, subtle teal magical light, warm amber braziers, ornate but restrained, clear central battlefield area, atmospheric depth, polished premium trading-card-game illustration. No people, no monsters, no cards, no logos, no UI, no symbols that resemble text, no letters, no numbers. Keep the center and lower third visually quiet so dynamic HTML game pieces remain readable. Full-bleed raster game background.
```

### `monster-atlas.png`

```text
Use case: stylized-concept
Asset type: 6-column by 3-row monster portrait sprite atlas for a dark fantasy mobile trading-card web game
Primary request: Create one clean 6x3 atlas containing exactly 18 distinct original monster portrait illustrations, one subject per equal cell, in this fixed left-to-right order.
Row 1: (1) towering rune-carved stone monolith guardian, (2) hovering bronze-and-teal mechanical automaton, (3) massive craggy stone golem, (4) elegant blazing phoenix firebird, (5) slender friendly silver cosmic alien, (6) masked one-eyed arcane sage.
Row 2: (7) carnivorous flowering vine plant, (8) round soft white mochi-like creature with ears, (9) regal water elemental woman, (10) winged violet demon fairy, (11) headless black-armored knight carrying a spectral helm, (12) horned crimson western dragon.
Row 3: (13) blue-white lightning wolf, (14) compact athletic golden-furred ape fighter, (15) green feathered raptor dinosaur, (16) eerie masked shadow jester, (17) large armored teal caterpillar-worm, (18) translucent pale-blue sheet-like ghost.
Style/medium: polished original Japanese dark-fantasy trading-card illustration, painterly raster, consistent art direction, readable at thumbnail size, not copied from any existing franchise designs
Composition/framing: exact equal 6 columns and 3 rows, centered bust or three-quarter subject in every cell, consistent portrait scale, clear thin gutters, no subject crossing cell boundaries
Lighting/mood: dramatic rim light, deep navy backgrounds, faction accents in stone/teal/gold/violet/red/blue
Constraints: exactly 18 cells and exactly one creature per cell; no empty cells; no text, letters, numbers, UI, card borders, logos, symbols, captions, watermarks, or baked-in stats; keep all important anatomy away from gutters; 3:2 full atlas aspect ratio
Avoid: existing copyrighted character likenesses, photorealism, chibi-only proportions, messy collage, variable cell sizes
```

### `special-fusion-atlas-v1.jpg`

組み込みImageGenの生成PNGを目視確認後、品質90のJPEGへ変換した。元PNGは生成物保管領域に残し、PWAには軽量版だけを収録する。

```text
Create one production-ready square raster sprite atlas for a dark high-fantasy collectible card battle game.

LAYOUT IS CRITICAL:
- Exactly 6 columns by 6 rows, 36 equal-size rectangular cells in row-major order.
- Each cell is a separate full-bleed monster portrait illustration.
- Perfectly aligned cell boundaries; no gutters, no padding, no frames, no separators.
- No text, letters, numbers, symbols, logos, UI, card frames, watermarks, or labels anywhere.
- Keep each monster centered with head and upper body clearly readable after a cell is cropped.
- Consistent dramatic painterly style: premium Japanese dark-fantasy card art, realistic painted textures, strong silhouette, cinematic rim lighting, deep atmospheric backgrounds, saturated accent color, high contrast.
- Every cell must be visually distinct. Avoid placing important anatomy across cell boundaries.
- Do not make a contact sheet with captions. This must be a seamless crop-ready game asset.

CELL CONTENT IN EXACT ROW-MAJOR ORDER:
Row 1:
1. elegant psychic fairy fused with sleek silver alien machine, cyan-magenta energy wings;
2. nocturnal butterfly witch fused with giant armored worm, violet moonlight;
3. undead knight fused with immortal firebird, blazing armored avian warrior;
4. frost-armored headless knight fused with blue lightning wolf, icy electric warrior;
5. muscular martial-arts hamster fused with lightning wolf, compact blue-white beast fighter;
6. blue lightning wolf fused with carnivorous healing plant, botanical electric beast.
Row 2:
7. muscular hamster fused with radiant fairy, agile winged prizefighter;
8. dark obsidian hamster fused with black monolith, blocky cursed martial beast;
9. dinosaur fused with stone golem, ankylosaur-like rock fortress;
10. dinosaur fused with golden sun-mask deity, radiant armored reptile;
11. ghost fused with fallen samurai armor, spectral ronin;
12. ghost fused with water spirit maiden, eerie drowned apparition.
Row 3:
13. giant worm fused with dinosaur, plated venomous reptilian insect;
14. giant worm fused with lightning wolf, blue horned burrowing predator;
15. demonic jester fused with red dragon, apocalyptic flame demon;
16. demonic jester fused with pink rice-cake creature, beautiful sakura death spirit;
17. black monolith fused with muscular hamster, wild stone brawler;
18. black monolith fused with dinosaur, colossal prehistoric fortress wall.
Row 4:
19. stone golem fused with demonic jester, eldritch apocalypse idol;
20. stone golem fused with red dragon, tyrant magma titan;
21. sleek silver robot fused with dinosaur, omega cyber rex;
22. sleek silver robot fused with demonic jester, black-red execution machine;
23. immortal firebird fused with sleek robot, mechanical raptor phoenix;
24. immortal firebird fused with water spirit, blue heron made of ghost flame.
Row 5:
25. golden sun-mask deity fused with muscular hamster, leonine celestial guardian;
26. golden sun-mask deity fused with carnivorous plant, many-colored ritual mask bloom;
27. silver alien machine fused with radiant fairy, charming psychic extraterrestrial;
28. silver alien machine fused with undead knight, biomechanical armored horse-spirit;
29. water spirit maiden fused with demonic jester, dark siren;
30. water spirit maiden fused with pink rice-cake creature, serene immortal mermaid.
Row 6:
31. pink rice-cake creature fused with undead knight, adorable armored mochi warrior;
32. pink rice-cake creature fused with sleek robot, eight-armed cyber mochi guardian;
33. carnivorous plant fused with radiant fairy, crimson princess flower;
34. carnivorous plant fused with giant moth/worm, pale moth-wing flower monster;
35. red dragon fused with black monolith, rune-covered volcanic dragon fortress;
36. red dragon fused with blue lightning wolf, glacial lightning dragon.

Art direction: mature fantasy, imposing but readable, no gore, no existing franchise character likenesses. Make this a cohesive atlas usable as card illustrations.
```

### `support-card-atlas-v1.jpg`

組み込みImageGenの生成PNGを目視確認後、品質90のJPEGへ変換した。カード順は `growthCards` 5件の後に `breeder-001`〜`breeder-020`。

```text
Create one production-ready square raster sprite atlas for non-monster cards in a dark high-fantasy collectible card battle game.

LAYOUT IS CRITICAL:
- Exactly 5 columns by 5 rows, 25 equal-size square cells in row-major order.
- Each cell is a separate full-bleed vertical-card-compatible illustration (compose the important subject in the center).
- Perfectly aligned cell boundaries; no gutters, no padding, no frames, no separators.
- No text, letters, numbers, symbols, logos, UI, card frames, watermarks, or labels anywhere.
- Consistent premium painterly Japanese dark-fantasy card-art style, cinematic rim lighting, readable silhouettes, rich atmospheric backgrounds.
- These are support/action cards, not monster portraits. Show trainers, hands, equipment, magic, training scenes, or tactical commands.
- Every cell visually distinct. No existing franchise character likenesses.
- Do not make a contact sheet with captions. This must be a seamless crop-ready game asset.

CELL CONTENT IN EXACT ROW-MAJOR ORDER:
Row 1 — growth:
1. life training: determined young monster trainer and creature running uphill at sunrise, vitality aura;
2. attack training: creature smashing a massive stone training pillar with an explosive punch;
3. defense training: creature bracing behind a heavy forged shield under a rain of impacts;
4. attack discipline retreat: mountain dojo, martial master teaching an offensive strike, red-gold ki;
5. defense discipline retreat: waterfall temple, armored master teaching an immovable guard, blue-silver ki.

Row 2 — breeder tactics 1–5:
6. veteran breeder calmly directing several creatures, golden command aura;
7. intimidating tactical commander applying psychological pressure across a battlefield;
8. focused trainer pointing at one ally, concentrated red energy around its next strike;
9. protective trainer raising a luminous barrier around one ally;
10. emergency supply satchel opening with card-like magical provisions flying out, no readable marks.

Row 3 — breeder tactics 6–10:
11. commander ordering a full team charge, all allies glowing with attack energy;
12. trainer granting a tired creature renewed action with a burst of green-gold energy;
13. saboteur issuing interference orders, shadow chains weakening an enemy attack;
14. inorganic specialist reinforcing a stone-and-metal creature’s armor plates;
15. precision engineer revealing weak seams in an enemy shield to ignore defense.

Row 4 — breeder tactics 11–15:
16. magical creator tuning a crystalline artificial creature to spend less energy;
17. arcane controller freezing an enemy in a temporal stun seal;
18. spirit medium granting a spectral creature another immediate action;
19. phantom trainer wrapping an ally in translucent mist so the next attack passes through;
20. demonic war coach empowering one horned ally with crimson attack flames.

Row 5 — breeder tactics 16–20:
21. demon tactician drawing power from several demonic allies into one champion;
22. beast handler converting the pack’s momentum into glowing energy crystals;
23. gentle beast healer restoring a wounded animal companion with warm green light;
24. monster hunter cursing one enemy with black tendrils and a slowing hex;
25. commander uniting multiple giant monsters under a combined red-and-blue power aura.

Art direction: mature fantasy, energetic and dramatic, no gore. Make this a cohesive atlas usable as card illustrations.
```

### `blue-drill-v2.jpg`

ブルードリルだけに確認された重要部位の切れを直すため、組み込みImageGenで専用画像を生成し、JPEGへ変換した。ゲーム内の名称・TP・能力・効果は引き続きHTML描画で、画像には含めていない。

```text
Use case: stylized-concept
Asset type: square monster card illustration for a dark high-fantasy mobile collectible card game
Primary request: create the special fusion monster ブルードリル (Blue Drill), a giant armored burrowing worm fused with a blue lightning wolf
Scene/backdrop: dark subterranean rock cavern with blue electrical arcs and dust
Subject: one powerful blue horned burrowing predator; segmented worm-like armored body, wolf-like ferocity, a prominent drill-shaped horn, icy blue metal scales, electric mane accents
Style/medium: premium painterly Japanese dark-fantasy card art, realistic painted textures, strong silhouette, cinematic rim lighting, saturated cyan-blue accents, high contrast; visually cohesive with a mature fantasy monster atlas
Composition/framing: square portrait; center the entire head, horn, snout, neck and readable upper-body coil; keep every important feature inside a generous 15 percent safe margin on all sides; the horn and snout must be fully visible and must not touch or cross the image edges
Lighting/mood: cold blue lightning against deep charcoal rock, imposing and energetic
Constraints: exactly one monster; full-bleed background; no text, letters, numbers, symbols, logos, UI, card frame, border, caption, watermark; no important anatomy cropped; no existing copyrighted character likeness
Avoid: cut-off head, cut-off horn, cut-off snout, anatomy touching edges, multiple creatures, collage, chibi proportions, photorealistic animal photo
```

# Changelog

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

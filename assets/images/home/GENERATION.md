# Home artwork

通常絵・特別絵それぞれ全30体のホーム画面専用アートは、対応するカードイラストをデザイン参照として、組み込みの画像生成機能で新規生成した横長一枚絵です。

- 用途: 横向きモバイルのホーム画面背景
- 通常絵: `assets/images/home/monster-001.webp` 〜 `monster-030.webp`
- 特別絵: `assets/images/home-showcase/monster-001.webp` 〜 `monster-030.webp`
- 構図: 16:9の横長、モンスター全身を中央寄り・画面高の42〜48%程度に配置し、左右へUI用の暗い余白を確保
- 制約: 元デザイン・色・素材・種族特徴を維持し、文字・UI・ロゴ・カード枠を含めない
- 形式: 通常絵はWebP、特別絵は1536×864 WebP（quality 80、各330KB未満）
- 読み込み: 選択中の1枚のみオンデマンド取得。選択モーダルは60候補をまとめた `home-artwork-thumbnails.webp` のみ取得

特別絵ホームアートの共通プロンプト方針:

> Create a brand-new native widescreen 16:9 home-screen illustration using the referenced special card artwork as the exact character-design reference. Preserve the monster's identity, anatomy, face, costume, colors, materials, and signature motifs exactly. Change to a clearly different dynamic pose and camera composition. Show the complete subject at roughly 42–48% of canvas height, centered with generous dark low-detail breathing room on both sides for game UI. No text, letters, numbers, logos, icons, UI, frames, borders, card layout, watermark, or signature.

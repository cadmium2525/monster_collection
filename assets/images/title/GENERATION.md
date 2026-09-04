# Title artwork

`title-screen.webp`は、組み込みの画像生成機能でタイトル画面専用の16:9一枚絵として新規生成した画像です。既存の縦長カード絵やホーム絵の転用ではありません。

- 用途: ローディング完了後のタイトル画面背景
- 解像度: 1536×864
- 形式: WebP（quality 76、メタデータなし）
- 文字・ロゴ・開始案内: 画像へ焼き込まずHTML/CSSで表示
- 構図: 6分類を想起させるモンスターを左右へ配置し、中央をタイトル表示用の安全域として確保
- 読み込み: 起動時にpreloadし、PWAのアプリシェルへ含める

生成プロンプトの要旨:

> Create a completely new native 16:9 title illustration for a strategic monster card battle game. Arrange six distinct champions—a bronze mechanical sentinel, luminous celestial guardian, blue spectral being, crimson demonic knight, white-blue thunder wolf, and living stone colossus—around an ancient circular construction altar in a ruined gothic arena fused with an arcane forge. Use luminous cyan and antique gold, keep the central title-safe area readable, and include no text, logo, UI, card frame, watermark, or signature.

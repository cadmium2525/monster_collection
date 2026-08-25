# Changelog

## 1.11.0 — 2026-08-26

### Added

- 汎用8枚と各モン類2枚ずつの専用12枚、合計20枚の新ブリーダーカードを追加。既存20枚は維持し、マスター総数を40枚へ拡張。
- 戦線整理、素材探索、融合強化、状態回復、反動攻撃、全体防御、TP前借り、逆境強化、オーバークロック、自動修復、ATK/DEF入替、撃破耐性、残響追撃、手札帰還、血の契約、呪印、狩猟報酬、群れ防御、暴食、捕食進化を共通BattleEngineへ実装。
- 複数の手札・探索・捕食候補を、人間プレイヤーがスワイプ後に選べるブリーダー専用選択モーダルを追加。
- 新規20枚それぞれに組み込みImageGenで文字なし正方形イラストを生成。768×768・JPEG品質90へ最適化した個別アートと生成プロンプト記録を追加。

### Changed

- 大会別CPUデッキ生成器へ新規汎用・モン類ブリーダーを追加し、従来どおり1デッキ4枠の範囲で選別するよう更新。
- PWAの大量事前キャッシュを考慮し、生成画像20枚を約50MBのPNGから合計約3.5MBの配信用JPEGへ最適化。

### Verified

- 新規20効果の合法手・数値・持続・撃破時処理・手札移動・合体プレビューを自動テストで確認。
- 20枚の一覧と実カード表示を目視し、文字混入、主題切れ、画像欠損がないことを確認。
- 99件の既存＋追加テストが成功。追加画像20枚を含むv1.11.0のGitHub Pages/PWA配信物（96ファイル、13,262,264 bytes）を正常に生成。

## 1.10.1 — 2026-08-25

### Changed

- モンスターのLIFE・ATK・DEFバッジを同じ大きさへ統一し、従来のATKよりわずかに拡大。コスト円の確定済みサイズは変更していない。
- カード上のアタッカー・バランス・タンクの役割アイコンを撤廃。役割名はカード詳細でのみ確認できる。
- 手札・保存一覧などのモンスター名をカード最上部へ移動し、表示面積の小さい盤面カードでは名前帯を非表示にした。アクセシブル名、詳細画面、バトルログの名前は維持している。

### Verified

- 844×390の実バトルでLIFE・ATK・DEFが各22px、コストが19px、役割アイコン0件、手札の名前帯が上端から1px、盤面の名前帯が非表示になることを確認。
- 1280×720でLIFE・ATK・DEFが各37px、コストが31pxになることを確認。ブラウザconsole errorは0件。
- 92件の自動テストとv1.10.1 Pages/PWAビルドを確認。

## 1.10.0 — 2026-08-25

### Added

- プロジェクト提供のLIFEハート、コスト円、ATK剣、DEF盾を、元の金縁・色・質感を保った透過512px PNGとしてカード描画へ追加。

### Changed

- バトル手札の「YOUR HAND / 操作案内 / 山札・墓地」見出し行を撤廃。山札・墓地枚数は左HUDに残し、空いた高さをカード表示へ割り当てた。
- 横画面の手札領域を33dvh・最大224pxへ拡大し、手札カードを高さ100%で表示。カード間隔と外周余白も広げ、外付けバッジを欠けずに表示する。
- LIFE/DEFを大きな基準バッジ、コスト/ATKを約25〜30%小さい補助バッジとし、四隅を従来よりカード外側へ移動。
- 保存40枚、カード一覧、カード奪取、リーダー選択でも外付けバッジ同士が重ならないよう、カード間隔とスクロール外周余白を拡大。

### Asset provenance

- 4点は2026-08-25にプロジェクト所有者から提供されたJPEGを正本とし、生成し直していない。背景抽出用ImageGenはLIFEの市松模様を画像化したため不採用とし、均一な無彩色背景だけを除去して透過PNGへ正規化した。

### Verified

- 844×390の実バトルで手札見出しが0件、手札高さ128px、カード高さ101pxとなり、5枚のLIFE/コスト/ATK/DEFが欠けずに表示されることを確認。
- 1280×720の実バトルで手札高さ224px、カード132×183px、LIFE/DEF 48px、コスト31px、ATK34pxを確認。
- 1280×720の保存40枚でカード本体間22pxを確保し、10列の外付けバッジが隣接カードと重ならないことを確認。ブラウザconsole errorは0件。
- 91件の自動テストとv1.10.0 Pages/PWAビルドを確認。

## 1.9.1 — 2026-08-25

### Changed

- 全カードの背景とは別に、アトラス内の1体分を正しい縦横比で名前帯より下へ重ねる頭部セーフエリアを追加。モンスターは縦長、育成・ブリーダー・特殊合体は正方形の全体像を維持する。
- カード詳細の固定横長画像を廃止し、モンスターは3:4、育成・ブリーダー・特殊合体は1:1で表示。
- 右上コスト円を通常カード・高さ430px以下の手札とも縮小。
- 保存デッキ、カード一覧、カード奪取、リーダー選択、バトル手札、盤面のカード間隔と外周余白を拡大。
- 大会内育成を示す「大会+数値」バッジを撤廃。成長後のLIFE/ATK/DEF数値への反映は維持。

### Verified

- 1280×720の保存40枚で10列すべての頭部・四隅アイコン・カード間隔を目視確認。
- 844×390の手札でコスト円と隣接カードが重ならず、育成バッジが生成されないことを確認。
- 通常モンスターとブリーダーの詳細を開き、画像が横長に切れず全体表示されることを確認。
- 89件の自動テストとv1.9.1 Pages/PWAビルドを確認。

## 1.9.0 — 2026-08-25

### Changed

- バトルカードを全面イラストへ変更し、LIFEを左上のハート、召喚/使用コストを右上の青い円、ATKを左下の剣、DEFを右下の盾としてカード外周へ重ねるレイアウトへ刷新。
- カード面の特性・効果文を外し、タップ後の詳細画面へ集約。名前と役割マーク、動的な四隅数値、状態変化だけをバトル中に表示する。
- バトルHUD、ターン、ログ、手札案内、操作ボタンの文字を通常画面と高さ430px以下の両方で拡大。
- 相手盤面のカードを正立表示へ戻し、プレイヤー側から四隅数値と名称をそのまま読める向きへ統一。
- 特殊合体/育成カードの正方形アトラスを縦長カードへ強制変形せず、中央の1体画像は縦横比を維持し、外周だけ同画像で補完する表示へ変更。

### Verified

- 特殊合体36体を全面イラストの実カードとして前半・後半に分けて目視し、全IDが正しい個体へ対応し、ブルードリルを含め中央画像の欠け・セルずれがないことを確認。
- 844×390のバトルQAで四隅バッジが手札から欠けず、拡大したHUD/ログ/操作文字が3列レイアウト内へ収まることを確認。
- 88件の自動テストとv1.9.0 Pages/PWAビルドを確認。

## 1.8.0 — 2026-08-25

### Added

- 大会表、進行中バトル、カード奪取の未確定選択を端末とCloud Firestoreへチェックポイント保存し、再読込・PWA終了・タスクキル後にホームの「大会の続きから」から復元する機能。
- BattleEngine、TournamentRun、CardStealSessionのseed/RNG状態を含む復元APIと、古い非同期保存による巻き戻りを防ぐ単調更新時刻・終了tombstone。
- 相手ターンや演出中にタップした手札1枚を予約し、自分の入力受付開始時に自動選択する操作。

### Changed

- 16人トーナメントのCPU同士の結果は内部ではseed付きで先に確定しつつ、表示上はプレイヤーの同ラウンド終了まで「対戦中」として伏せる。
- 縦向き案内をページ直下の単一オーバーレイへ統一し、バトル画面側の重複表示を削除。

### Verified

- 87件の自動テストとv1.8.0 Pages/PWAビルドを確認。
- 大会開始直後、試合途中の双方でページを再読込し、同じ大会表・山札/手札・盤面・LIFE/TP・バトルログへ復帰することを確認。
- 390×844で縦向き案内が1枚だけ中央に固定表示され、844×390/667×375の横画面を妨げないことを確認。

## 1.7.0 — 2026-08-25

### Added

- 通常合体でメインカードと素材カードが左右から収束し、完成カードとSP増加を見せる全画面演出。
- 特殊合体専用の紫光、二重紋章、放射光、粒子、特殊個体イラストと名称を使った上位演出。
- 標準/高速の演出時間差と、`prefers-reduced-motion`利用者向けの短縮表示。

### Changed

- Training・修行カードの効果文から「大会中継続」を外し、同じ内容を遊び方と7ステップチュートリアルへ集約。
- ホーム最下部の保存方式、debug seed、Sim番号を通常ユーザーから非表示化。localhostの`?debug=1`だけで確認可能とし、同期失敗時は技術詳細ではなく安全な端末保存中であることだけを表示。
- 合体演出内では盤面用の「行動済」帯を出さず、カードイラストを広く表示。実際の行動権は正式ルールどおり回復しない。

### Verified

- 78件の自動テストとv1.7.0 Pages/PWAビルドを確認。
- 844×390の特殊合体と667×375の通常合体で、素材収束、完成カード、合体名、SP増加表示が画面内に収まることを確認。
- 通常ホームのDOMにdebug seed、Sim番号、保存方式フッターが存在しないことを確認。

## 1.6.1 — 2026-08-25

### Added

- CPU同士の裏試合勝者へ、実デッキ内のTraining・修行による大会内育成をseed付きで蓄積する進行。
- 2回戦・準決勝・決勝の対戦相手へ、それぞれ1・2・3戦分の育成状態を共通BattleEngine経由で反映。
- 対戦前画面に、相手の「勝ち上がり育成」戦数、能力上昇合計、新技数を表示。

### Balance

- 裏試合育成は大会別の軽量TP予算を使い、Bronze 5 / Silver 6 / Gold 7 / Legend 8。修行は1試合最大1回とし、カードを持たないCPUへ架空の強化を与えない。
- CPUブラケット勝敗評価へ、それまでの能力上昇と新技習得を小さく加点。

### Verified

- 後半戦の相手が育成状態を保持してBattleEngineへ入ること、同一seedで完全再現できることを自動テスト。
- 40seed平均の決勝時総能力上昇はBronze +33.4、Silver +44.6、Gold +57.0、Legend +61.2。複数モンスターへ分散し、最も育った1枚の80seed平均は+13.6～20.9。
- Legend大会を200回生成・3ラウンド進行した平均処理時間は16.69ms。完全なCPU戦シミュレーションを11試合追加せず、スマホ負荷を抑えた。
- 75件の自動テスト、v1.6.1 Pages/PWAビルド、844×390と667×375の対戦前表示を確認。外側overflowとコンソールwarning/errorは0件。

## 1.6.0 — 2026-08-25

### Added

- 保存デッキ内の任意のモンスターをリーダーへ変更し、一覧・大会・公開Legendデッキ・王座へ反映する機能。
- 一度でも所有した基本カードと、プレイヤーが一度でも成功させた特殊合体を永続表示する「カード一覧」。種類別フィルター、収集数、カード詳細、特殊合体レシピ詳細を収録。
- LocalStorage / Cloud Firestore間で所有・発見履歴を安全に和集合するRepository APIと、既存保存デッキからの自動移行。

### Fixed

- Training 3種と修行2種に動的な効果説明を復元し、マスター再生成後も欠落しない検証を追加。
- 選択したリーダーがカード交換後もデッキ内に残る場合、先頭モンスターへ意図せず戻る問題を修正。

### Verified

- リーダーの保存・不正選択拒否・放出時フォールバック、カード履歴の追加専用統合、敗戦時を含む特殊合体発見、育成カード説明を自動テスト。
- 自動テスト72件とGitHub Pages/PWAビルドを確認。
- 844×390と667×375で外側overflowなしのデッキ詳細・リーダー候補・カード一覧・特殊合体詳細を操作し、コンソールwarning/error 0件を確認。

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

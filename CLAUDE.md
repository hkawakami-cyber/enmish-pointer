# Enmish Pointer — 開発メモリ（CLAUDE.md）

> このファイルは Claude が自動で読み込む。新しいセッションはまずここを読めば、認識合わせの往復なしで開発に入れる。

## 1. プロダクト概要
オンライン商談・社内MTGの**画面共有を分かりやすくする注釈ツール**（カーソル強調・ペン/蛍光/矢印/横線/丸/四角/文字・スポットライト・ズーム・録画・スクショ）。開発元 Enmish（営業支援）。
**2つの成果物を常に同期**して開発する：
- **Webデモ**（`index.html` + `js/` + `css/` → 単一ファイル `enmish-focus-prototype.html` に結合して Artifact 公開）
- **Chrome拡張 (MV3)**（`extension/`）= 本命。実際に Meet / Google スライド / Salesforce のタブ共有で使う。

## 2. 構成と「共有ファイル」
- 描画エンジン `js/drawing.js` とアイコン `js/icons.js` は **拡張の `extension/lib/` にコピーして共有**。
  → これらを編集したら必ず `cp js/drawing.js extension/lib/ && cp js/icons.js extension/lib/`。
- Web状態は `js/state.js`（`EF.state` / `EF.PALETTE` / `PERSIST`）。拡張は `extension/content.js` 内の `state` に同等物を持つ（**両方直す**）。
- 拡張UIは Shadow DOM（`#enmish-focus-host`）。スタイル分離のため CSS は `content.js` 内のテンプレ文字列。
- 永続化：Web=localStorage `enmishFocus.settings.v1` / 拡張=`chrome.storage.local` `efSettings`。どちらも `PERSIST` 配列で管理。プロファイルは別キー（Web `enmishFocus.profiles.v1` / 拡張 `efProfiles`、スロット `c1/c2/c3`）。
- **拡張は再インストール時に storage がクリアされる** → 既定値を変えれば新既定がそのまま反映される（移行コード不要）。
- **アンインストール時のクリーンアップ**：拡張を削除/無効化しても、開いているタブの注入済みオーバーレイはChromeが自動で消さない。`content.js` は `chrome.runtime.id` の消失を `setInterval` で監視し、無効化を検知したら `teardown()`（host削除・margin/transform復元・描画ループ停止 `engine._stopped`）する。

## 3. 開発フロー（毎回この順で。これが速さの肝）
1. **Web と拡張の両方**を同じ仕様に直す（片方だけにしない）。
2. 共有ファイルを編集したら `extension/lib/` へ cp。
3. `node --check` で全 JS 構文チェック。
4. **Playwright で実機相当の検証（コンソール/ページエラー 0 件を必須確認）**。
   - Web: chromium 直起動で `enmish-focus-prototype.html` を開く。
   - 拡張: `xvfb-run` + `--load-extension`。Shadow DOM は `document.getElementById('enmish-focus-host').shadowRoot` で操作。内部状態は isolated world にあり page eval から読めない → DOM/クラス or Service Worker 経由で検証。
   - chromium: `/opt/pw-browsers/chromium-1194/chrome-linux/chrome`、playwright-core は scratchpad の node_modules にある。
5. `node tools/build-artifact.js` で `enmish-focus-prototype.html` を再生成。
6. **拡張のバージョンを必ず上げる**（後述）。
7. `dist/enmish-pointer-extension-vX.Y.Z.zip` を作り直す（旧zipは消す）。
8. commit & push（ブランチ `claude/enmish-pointer-prototype-d1hqdt` / PR #1）。コミット文は日本語で要点を箇条書き。
9. Artifact を再公開（`enmish-focus-prototype.html`、favicon は 🟢、URL は固定の同一Artifact）。
10. **更新版 zip をチャットに添付**して渡す（GitHub の `dist/` 直リンクも案内可）。

### バージョン管理（重要・過去にハマった）
zip 名がずっと `v0.1.0` 固定で「どれが最新か分からず古い展開フォルダを読み込む」事故が頻発した。**拡張を変更したら毎回**：
- `extension/manifest.json` の `version`
- `extension/content.js` の設定パネル末尾表示 `Enmish Pointer vX.Y.Z`
- `extension/popup.html` の `.ver`
- zip ファイル名 `dist/enmish-pointer-extension-vX.Y.Z.zip`
を**揃えて上げる**。差し替え時は「`chrome://extensions` でバージョン番号を確認」を必ず案内する。

## 4. 河上さんの進め方・好み（これに合わせると速い）
- **超高速イテレーション**。短いカジュアルな日本語で、思いついた改善を次々投げる。作業途中でも新しい依頼が割り込む（中断歓迎、柔軟に拾う）。
- **画像で判断する人**。文章説明より、こちらが**3〜5案を画像で並べて見せる**と即決できる（ロゴ・色・ドックの形などは必ずビジュアル提示→番号で選択）。スクショで状況・不具合を共有してくる。
- **ミニマル志向が強い**。「いらない」と判断したものは即削除（プリセット/ホワイトボード/ショートカット/バッジ/番号スタンプ/ロゴの箱 等を撤去してきた）。**文字数は少なく**、ラベルや冗長文を嫌う。
- **「邪魔にならない」を最重視**。共有画面に被らない・透ける・自動で隠れる（Macドック風）・終了で完全に消える、を好む。
- **実機ファースト**。Meet / Google スライド / Salesforce の実画面で使い、その文脈で評価する。理屈より「実際こうなる」を見せると話が早い。
- **デザイン基準は Claude**。「Claudeのロゴを見習って」＝フラット・単色・箱なし・1マーク・適切な大きさ。装飾過多を嫌う。
- **決めるのは速いが、選択肢は欲しい**。「案出して」と来たら必ず複数案＋推奨を出す。こちらの推奨も歓迎。
- **戦略視点もある**。「他に必要な機能は？」と聞く。配布のしやすさ（Chromeウェブストア公開）を提案すると刺さる。
- 視認性・操作性の細部に敏感（白背景で白文字が見えない、ポインターが大きい、設定パネルが被る等を的確に指摘）。→ **明/暗どちらの背景でも成立するか**を毎回チェックすること。

### コミュニケーションの型（推奨）
- まず**結論＋反映物（zip/Artifact URL/スクショ）**を出す。長い手順説明は最小限、必要時のみ。
- 変更は**Web・拡張の両方に入れたと明記**し、**エラー0件で検証済み**と添える。
- デザイン/色/名前など主観が入る決定は**ビジュアル比較を先に出して選んでもらう**。

## 5. ブランド / デザイン規定（現行 v0.3.x）
- **ロゴ／アイコン**：ミントの「パルス」マーク（同心円＋中心ドット, `#34d3a6`）。箱なし・フラット・キャンバスいっぱい。`assets/favicon-pointer.svg` が原本、`extension/icons/icon-{16,32,48,128}.png` は透過PNG、`index.html` の favicon は同SVGのデータURI、横ロゴは `assets/logo-pointer.svg`。
- **ツールバー**：半透明の紺パネル（`rgba(6,32,52,.92)`）＋白アイコン（影付きで明暗どちらでも可読）。**2列グリッド**でスクロール不要。幅124px、ラベルOFFや収まらない時は自動コンパクト。右端ホバーで自動表示（Macドック風）、`autoHide` 既定ON。
- **左下マーク**：枠なしの丸い電源ボタン。OFF=紺 `#0c2c46` / ON=緑 `#6cbba5`＋グロー。ツールバーメニューの「終了」を押すと `dismissed` 状態でこのマークごと消える（再開はツールバーアイコンのメニュー or `⌘⇧E`）。
- **ツールバーアイコンのメニュー**（`extension/popup.html`）：ポインターON/OFF・表示/最小化・全消去・設定・終了。
- **注釈のペン色（4色）**：赤 `#e23b3b` / グリーン `#6cbba5`(既定) / 黒 `#1a1a1a` / 白 `#ffffff`。スウォッチは内ダーク＋外ライトの二重縁で明暗どちらでも縁が見える。設定で変更可。
- **テキスト注釈**：既定サイズ20・標準太さ。文字色の明暗に応じた下地チップを敷いて可読性確保。
- **アプリのアクセント色**（選択中ハイライト等）は `#6cbba5`。ロゴはミント `#34d3a6`（=やや明るい）。統一したい場合は要相談。
- **カーソル強調リング**：`tool === "cursor"` のときだけ表示（他ツールでは消える）。既定サイズ52（小36/中52/大72）。

## 6. 撤去済み・避けたい提案（蒸し返さない）
プリセット機能 / ホワイトボード / スタンプバー / 自動消去の常時ON / 番号スタンプ / ツールバー上部のロゴ表示 / 「バー隠す」ボタン / 中央下のステータスバッジ / ショートカット表の常設。ショートカット自体は内部に残すが**前面に出さない**（覚えない方針）。

## 7. 未着手の候補（提案するなら）
- **Chrome ウェブストア公開**（配布が一気に楽・自動更新。最優先級）
- 線の太さの素早い切替（色の隣）/ Redoボタン / 初回オンボーディングの簡略ガイド / アプリ全体のミント統一。

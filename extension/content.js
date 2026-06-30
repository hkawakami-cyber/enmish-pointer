/* ============================================================
   Enmish Pointer — content script
   実ページ上に Shadow DOM のオーバーレイを重ね、注釈・カーソル強調・
   スポットライト・ズーム・スタンプを描く。ブラウザのタブ共有時に、
   そのまま視線誘導ツールとして使える。
   ============================================================ */
(function () {
  if (window.__enmishFocusLoaded) return;
  window.__enmishFocusLoaded = true;

  const EF = (window.EF = window.EF || {}); // drawing.js が DrawingEngine を載せている

  // ---------- 定義 ----------
  // Enmishブランド規定色のみ
  // 波長順（長波長＝赤系 → 短波長＝青系、無彩色は末尾）
  const PALETTE = ["#e23b3b", "#6cbba5", "#1a1a1a", "#ffffff"]; // 赤 / グリーン(既定) / 黒 / 白
  const DRAW_TOOLS = ["pen", "highlighter", "arrow", "hline", "ellipse", "rect", "text"];
  const TOOL_NAMES = {
    cursor: "カーソル強調", pen: "ペン", highlighter: "蛍光ペン", arrow: "矢印",
    hline: "横線", ellipse: "丸囲み", rect: "四角囲み", text: "テキスト",
  };

  const state = {
    appOn: false, tool: "rect", color: "#6cbba5", strokeWidth: 6,
    ring: { width: 6, size: 52, opacity: 0.9, ripple: true },
    cursorStyle: "dot", arrowHead: "start", uiHidden: false, optionsOpen: false,
    autoErase: 0, spotlight: false, spotShape: "band", spotBand: 0.33, spotDim: 0.72,
    zoom: false, zoomScale: 2.0,
    textSize: 20, textBold: false, textColor: "#032841",
    // ring.size の既定は 52（中）。64 から少し小さく。
    // ツールバーのカスタム（並べ替え・表示/非表示）
    toolOrder: ["rect", "highlighter", "arrow", "hline", "text", "pen", "cursor", "ellipse", "spotlight", "zoom"],
    toolHidden: {},
    barSide: "right", dockPos: "bottom-left",
    autoHide: true, // 右端ホバーで自動表示（Mac のドック風）
    showLabels: true, // ツールの文字ラベル表示（OFFで記号だけ）
    dismissed: false, // 「終了」で画面から完全に消した状態（左下マークも非表示）
    recording: false,
    recMic: false, // 録画時に自分のマイク音声も混ぜる（登壇録画向け。既定OFF）
    recShotSec: 30, // 録画中の自動スクショ間隔（秒）。0=OFF / 15 / 30 / 60
    mouse: { x: -999, y: -999 },
  };

  let onboarded = false;

  // ---------- Shadow DOM 構築 ----------
  const host = document.createElement("div");
  host.id = "enmish-focus-host";
  host.style.cssText = "position:fixed;inset:0;margin:0;padding:0;border:0;pointer-events:none;z-index:2147483646;";
  (document.documentElement || document.body).appendChild(host);
  const root = host.attachShadow({ mode: "open" });

  const CSS = `
    :host { all: initial; }
    * { box-sizing: border-box; font-family: "Helvetica Neue", Helvetica, Arial, "Noto Sans JP", "Hiragino Sans", "Hiragino Kaku Gothic ProN", "Yu Gothic", Meiryo, sans-serif; }
    canvas, .ring, .badge, .toast, .hint { position: fixed; }
    .layer { inset: 0; width: 100vw; height: 100vh; pointer-events: none; }
    #annot { pointer-events: none; }
    #annot.live { pointer-events: auto; cursor: crosshair; }
    #annot.tool-cursor { cursor: none; }
    .ring { border-radius: 50%; transform: translate(-50%,-50%); border-style: solid; border-color: #6cbba5; pointer-events: none; }
    .ring .cdot { position: absolute; left: 50%; top: 50%; transform: translate(-50%,-50%); border-radius: 50%; display: none; }
    .ring .carrow { position: absolute; left: 0; top: 0; display: none; overflow: visible; filter: drop-shadow(0 1px 2px rgba(0,0,0,.35)); }
    :host(.ui-hidden) .toolbar, :host(.ui-hidden) .stamp-bar, :host(.ui-hidden) .tool-options { display: none !important; }
    /* 機能OFF時はツールバー自体を隠す（操作は左下のマークから） */
    .toolbar.app-off { display: none !important; }
    .ripple { position: fixed; border-radius: 50%; transform: translate(-50%,-50%); border: 3px solid #6cbba5; pointer-events: none; animation: rip .55s ease-out forwards; }
    @keyframes rip { from { width: 8px; height: 8px; opacity: .85; } to { width: 90px; height: 90px; opacity: 0; } }

    .toolbar, .stamp-bar, .reopen, .badge, .toast, .hint { pointer-events: auto; }
    .toolbar {
      position: fixed; top: 50%; right: 0; transform: translateY(-50%);
      background: rgba(6,32,52,.92); color: #fff; border-radius: 14px 0 0 14px;
      box-shadow: 0 8px 26px rgba(0,0,0,.32); backdrop-filter: blur(8px); -webkit-backdrop-filter: blur(8px);
      padding: 7px 7px; border: 1px solid rgba(255,255,255,.16); border-right: none; width: 124px;
      display: grid; grid-template-columns: 1fr 1fr; gap: 3px; align-content: start; max-height: calc(100vh - 24px); overflow-y: auto;
      transition: transform .22s ease, opacity .22s ease;
    }
    /* 仕切り線・カラー・設定・最小化は横いっぱい（2列をまたぐ） */
    .toolbar > .sep, .toolbar > .colors,
    .toolbar > .tool[data-action="options"], .toolbar > .tool[data-action="collapse"] { grid-column: 1 / -1; }
    /* 未起動でもツールは押せる（押すと自動的に起動して選択される）。視覚的にだけ少し淡く。 */
    .toolbar.app-off .tool[data-tool], .toolbar.app-off .tool[data-toggle], .toolbar.app-off .colors { opacity: .7; }
    .toolbar.side-left { right: auto; left: 0; border-radius: 0 14px 14px 0; border-left: none; border-right: 1px solid rgba(176,184,196,.45); }
    /* 右端ホバーで自動表示（Macのドック風）：普段は画面外へスライド、近づくと出る */
    .toolbar.auto-hide { transform: translate(calc(100% + 6px), -50%); opacity: 0; }
    .toolbar.auto-hide.revealed { transform: translate(0, -50%); opacity: 1; }
    .toolbar.auto-hide.side-left { transform: translate(calc(-100% - 6px), -50%); }
    .toolbar.auto-hide.side-left.revealed { transform: translate(0, -50%); }
    .toolbar.auto-hide .tool[data-action="collapse"] { display: none; } /* 自動表示中は最小化ボタン不要 */
    /* 自動表示モードのヒント（右端の細い帯） */
    .edge-hint { position: fixed; right: 0; top: 50%; transform: translateY(-50%); width: 6px; height: 130px; border-radius: 5px 0 0 5px; background: rgba(108,187,165,.85); box-shadow: 0 0 12px rgba(0,0,0,.3); pointer-events: none; transition: opacity .2s ease; }
    .edge-hint.side-left { right: auto; left: 0; border-radius: 0 4px 4px 0; }
    .toolbar.compact { width: 82px; gap: 2px; }
    .toolbar.compact .lbl { display: none; }
    .toolbar.compact .tool { padding: 7px 3px; }
    .toolbar.compact .sep { margin: 3px 4px; }
    .brand { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 1px 0 6px; }
    .brand .ef-mark { width: 22px; height: 22px; border-radius: 50%; background: #6cbba5; position: relative; }
    .brand .ef-mark::after { content: ""; position: absolute; right: 4px; top: 4px; width: 6px; height: 6px; border-radius: 50%; background: #032841; }
    .brand .ef-word { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #f4f8f7; line-height: 1; }
    .brand .ef-tag { font-size: 8px; letter-spacing: .18em; color: #6cbba5; font-weight: 600; }
    .sep { height: 1px; background: rgba(150,160,175,.5); margin: 4px 4px; }
    .tool {
      display: flex; flex-direction: column; align-items: center; gap: 2px; border: none;
      background: transparent; color: #e8ecf4; padding: 6px 3px; border-radius: 9px;
      cursor: pointer; font-size: 10px; line-height: 1;
    }
    .tool:hover { background: rgba(255,255,255,.18); }
    /* 透明な帯の上でも、明るい/暗いどちらの背景でも読めるよう白＋濃い影 */
    .tool .ico { font-size: 16px; display: inline-flex; align-items: center; justify-content: center; height: 18px; color: #fff; filter: drop-shadow(0 0 1px rgba(0,0,0,.7)) drop-shadow(0 1px 1.5px rgba(0,0,0,.85)); }
    .tool .lbl { color: #fff; text-shadow: 0 1px 2px rgba(0,0,0,.95); }
    .ico svg { display: block; }
    .tool.active { background: #6cbba5; } .tool.active .ico { filter: none; } .tool.active .lbl { color: #fff; text-shadow: none; }
    .tool.toggled { background: rgba(108,187,165,.28); outline: 1.5px solid #6cbba5; }
    .tool.recording { background: rgba(193,103,127,.30); outline: 1.5px solid #c1677f; }
    .tool.recording .ico, .tool.recording .lbl { color: #c1677f; }
    .colors { display: grid; grid-template-columns: repeat(4,1fr); gap: 4px; padding: 2px; }
    /* 白・黒・どんな背景でも縁が分かるよう、内側ダーク＋外側ライトの二重縁 */
    .swatch { width: 14px; height: 14px; border-radius: 50%; border: 2px solid transparent; box-shadow: 0 0 0 1px rgba(0,0,0,.35), 0 0 0 2px rgba(255,255,255,.6); cursor: pointer; }
    .swatch.active { border-color: #fff; box-shadow: 0 0 0 1.5px rgba(0,0,0,.55); }

    .stamp-bar {
      position: fixed; left: 12px; top: 50%; transform: translateY(-50%); width: 148px;
      background: rgba(3,40,65,.94); color: #e8ecf4; border-radius: 14px; padding: 28px 11px 11px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35); backdrop-filter: blur(14px); border: 1px solid rgba(255,255,255,.08);
    }
    .stamp-bar.collapsed { display: none; }
    .sb-title { font-size: 11px; color: #97a0b5; margin: 3px 2px 5px; }
    .chips { display: flex; flex-wrap: wrap; gap: 5px; margin-bottom: 7px; }
    .chip { font-size: 11px; padding: 4px 8px; border-radius: 999px; cursor: pointer; border: 1px solid rgba(255,255,255,.18); color: #fff; font-weight: 600; line-height: 1.3; }
    .chip:hover { filter: brightness(1.12); } .chip.armed { outline: 2px solid #fff; }
    .sb-hide { position: absolute; top: 6px; right: 6px; width: 22px; height: 22px; border: none; border-radius: 6px; background: rgba(255,255,255,.10); color: #e8ecf4; cursor: pointer; font-size: 11px; }
    .sb-hide:hover { background: rgba(255,255,255,.22); }
    /* 最小化中の再表示タブ（バーと同じ端に小さく出す） */
    .reopen { position: fixed; right: 0; top: 50%; transform: translateY(-50%); display: flex; align-items: center; justify-content: center; width: 30px; height: 46px; background: rgba(3,40,65,.86); color: #fff; border: 1px solid rgba(176,184,196,.45); border-right: none; border-radius: 12px 0 0 12px; padding: 0; cursor: pointer; box-shadow: 0 6px 18px rgba(0,0,0,.3); backdrop-filter: blur(6px); }
    .reopen .ico { display: inline-flex; transform: scaleX(-1); filter: drop-shadow(0 1px 1.5px rgba(0,0,0,.85)); }
    .reopen.side-left { right: auto; left: 0; border: 1px solid rgba(176,184,196,.45); border-left: none; border-radius: 0 12px 12px 0; }
    .reopen.side-left .ico { transform: none; }
    /* 最小化ボタンの矢印は、ドックされている端に向ける */
    .toolbar.side-left .tool[data-action="collapse"] .ico { transform: scaleX(-1); }

    .badge { bottom: 18px; left: 50%; transform: translateX(-50%); background: rgba(3,40,65,.94); color: #fff; padding: 7px 15px; border-radius: 999px; font-size: 13px; box-shadow: 0 10px 30px rgba(0,0,0,.35); pointer-events: none; }
    .badge .dotc { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; vertical-align: middle; }
    .toast { bottom: 64px; left: 50%; transform: translateX(-50%) translateY(8px); background: #1b2130; color: #fff; padding: 10px 18px; border-radius: 11px; font-size: 13px; opacity: 0; transition: opacity .2s, transform .2s; pointer-events: none; }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .hint { bottom: 20px; left: 50%; transform: translateX(-50%); background: #6cbba5; color: #fff; padding: 8px 16px; border-radius: 999px; font-size: 13px; pointer-events: none; }
    .ef-dock.dock-bottom-right { left: auto; right: 8px; bottom: 6px; top: auto; }
    .ef-dock.dock-top-left { top: 16px; left: 16px; bottom: auto; right: auto; }
    .ef-dock.dock-top-right { top: 16px; right: 16px; bottom: auto; left: auto; }
    /* ドックは枠なし（位置だけ）。マーク1枚で見せる。 */
    .ef-dock { position: fixed; left: 8px; bottom: 6px; display: flex; gap: 6px; padding: 0; background: none; border: none; box-shadow: none; pointer-events: auto; }
    .dock-btn { display: flex; align-items: center; justify-content: center; border: none; cursor: pointer; background: rgba(255,255,255,.10); color: #c4ccda; line-height: 1; transition: background .15s, color .15s, box-shadow .2s; }
    .dock-btn .ico { display: inline-flex; }
    /* 左下マーク：OFF=紺の丸 / ON=緑＋緑グロー（色で状態が一目で分かる） */
    .dock-power-mark { width: 46px; height: 46px; border-radius: 50%; padding: 0; background: #0c2c46; color: #e8ecf4; box-shadow: 0 6px 16px rgba(0,0,0,.25); }
    .dock-power-mark:hover { background: #123a59; }
    #dock-power.on { background: #6cbba5; color: #06251c; box-shadow: 0 0 0 4px rgba(108,187,165,.30), 0 6px 18px rgba(108,187,165,.45); }
    #dock-power.on:hover { background: #7cc7b1; }
    /* ラベル非表示（記号だけ）＝幅を詰める */
    .toolbar.labels-off { width: 86px; }
    .toolbar.labels-off .lbl { display: none; }
    .ef-text { position: fixed; transform: translateY(-4px); z-index: 10; pointer-events: auto; border: none; border-bottom: 2px solid currentColor; background: rgba(255,255,255,.92); font-weight: 700; padding: 2px 6px; border-radius: 4px; min-width: 120px; outline: none; }
    .tool-options { position: fixed; right: 140px; top: 50%; transform: translateY(-50%); background: rgba(3,40,65,.96); color: #e8ecf4; border-radius: 14px; padding: 13px; width: 168px; max-height: 88vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,.4); border: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(14px); display: flex; flex-direction: column; gap: 11px; pointer-events: auto; }
    /* バーが左側のときは設定パネルも左側に出す（バーと被らない） */
    .tool-options.side-left { right: auto; left: 140px; }
    .to-group { display: flex; flex-direction: column; gap: 5px; }
    .to-title { font-size: 10.5px; color: #9fc6bb; }
    .opt-ver { font-size: 10px; color: rgba(255,255,255,.45); text-align: center; padding-top: 2px; }
    .prof-row { display: flex; align-items: center; gap: 6px; }
    .prof-name { flex: 1; font-size: 11px; color: #cdd6e2; }
    .prof-btn { border: 1px solid rgba(255,255,255,.18); background: rgba(255,255,255,.06); color: #e8ecf4; border-radius: 7px; padding: 4px 9px; font-size: 11px; cursor: pointer; }
    .prof-btn.save { border-color: rgba(108,187,165,.5); color: #8df1d5; }
    .prof-btn:hover { background: rgba(255,255,255,.16); }
    .prof-btn:disabled { opacity: .4; cursor: default; }
    .to-btns { display: flex; flex-wrap: wrap; gap: 5px; }
    .to-btn { display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: #e8ecf4; border-radius: 8px; padding: 5px 8px; font-size: 11px; cursor: pointer; line-height: 1; }
    .to-btn:hover { background: rgba(255,255,255,.12); }
    .to-btn.on { background: #6cbba5; border-color: #6cbba5; color: #06251c; font-weight: 700; }
    .tb-tools { display: grid; grid-template-columns: 1fr 1fr; gap: 3px; }
    .toolbar > .tb-tools { grid-column: 1 / -1; }
    /* 設定フライアウト内：ツールバー編集 */
    .to-tool-row { display: flex; align-items: center; gap: 5px; }
    .to-tool-row .to-chk { display: inline-flex; align-items: center; gap: 5px; flex: 1; font-size: 11px; color: #e8ecf4; cursor: pointer; padding: 3px 6px; border: 1px solid rgba(255,255,255,.14); border-radius: 7px; background: rgba(255,255,255,.05); }
    .to-tool-row .to-chk.off { opacity: .5; }
    .to-tool-row .to-chk input { accent-color: #6cbba5; margin: 0; }
    .to-tool-row .to-chk .tt-ico { display: inline-flex; align-items: center; }
    .to-tool-row .to-chk .tt-ico svg { display: block; }
    .to-mv { width: 24px; height: 24px; flex: none; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: #e8ecf4; border-radius: 7px; cursor: pointer; display: inline-flex; align-items: center; justify-content: center; padding: 0; }
    .to-mv:hover { background: rgba(255,255,255,.14); }
    .to-mv:disabled { opacity: .3; cursor: default; }
    .to-mv svg { display: block; }
    .to-mv.dn svg { transform: rotate(180deg); }
    .tool-options input[type="checkbox"] { appearance: none; -webkit-appearance: none; margin: 0; width: 16px; height: 16px; flex: none; border: 1.5px solid #6cbba5; border-radius: 4px; background: rgba(255,255,255,.06); cursor: pointer; position: relative; vertical-align: middle; }
    .tool-options input[type="checkbox"]:checked { background: #6cbba5; border-color: #6cbba5; }
    .tool-options input[type="checkbox"]:checked::after { content: ""; position: absolute; left: 4.5px; top: 1px; width: 4px; height: 8px; border: solid #fff; border-width: 0 2px 2px 0; transform: rotate(45deg); }
    [hidden] { display: none !important; }
  `;

  // 並べ替え・表示/非表示の対象ツール定義（kind,key,fallbackアイコン,ラベル）
  const TOOL_DEFS = [
    ["tool", "cursor", "◎", "カーソル"],
    ["tool", "pen", "✎", "ペン"],
    ["tool", "highlighter", "▰", "蛍光"],
    ["tool", "arrow", "↗", "矢印"],
    ["tool", "hline", "—", "横線"],
    ["tool", "ellipse", "◯", "丸"],
    ["tool", "rect", "▢", "四角"],
    ["tool", "text", "T", "文字"],
    ["toggle", "spotlight", "☀", "注目"],
    ["toggle", "zoom", "🔍", "ズーム"],
  ];
  const toolDef = (key) => TOOL_DEFS.find((d) => d[1] === key);

  // 固定部（並べ替え対象外）。"tools" の位置に動的ツール群を差し込む。
  const TOOL_BTNS = [
    ["tools"],
    ["sep"],
    ["action", "options", "⚙", "設定"],
    ["sep"],
    ["colors"],
    ["sep"],
    ["action", "undo", "↶", "戻る"],
    ["action", "clear", "🗑", "全消去"],
    ["action", "screenshot", "📷", "保存"],
    ["action", "copy", "⧉", "コピー"],
    ["action", "record", "⏺", "録画"],
    ["sep"],
    ["action", "collapse", "»", "最小化"],
  ];

  function toolBtnHtml(kind, key, fallback, label) {
    const attr = kind === "tool" ? `data-tool="${key}"` : kind === "toggle" ? `data-toggle="${key}"` : `data-action="${key}"`;
    const id = key === "spotlight" ? 'id="btn-spot"' : key === "zoom" ? 'id="btn-zoom"' : key === "options" ? 'id="btn-options"' : "";
    const icoName = key === "screenshot" ? "save" : key;
    const ico = (EF.iconSvg && EF.iconSvg(icoName)) || fallback;
    return `<button class="tool" ${attr} ${id}><span class="ico">${ico}</span><span class="lbl">${label}</span></button>`;
  }

  // 動的ツール群（state.toolOrder 順・state.toolHidden 除外）
  function toolsHtml() {
    let html = "";
    state.toolOrder.forEach((key) => {
      if (state.toolHidden[key]) return;
      const d = toolDef(key);
      if (!d) return;
      html += toolBtnHtml(d[0], d[1], d[2], d[3]);
    });
    return html;
  }

  function buildToolbar() {
    let html = '';
    for (const b of TOOL_BTNS) {
      if (b[0] === "sep") { html += '<div class="sep"></div>'; continue; }
      if (b[0] === "colors") { html += '<div class="colors" id="colors"></div>'; continue; }
      if (b[0] === "tools") { html += `<div class="tb-tools" id="tb-tools">${toolsHtml()}</div>`; continue; }
      html += toolBtnHtml(b[0], b[1], b[2], b[3]);
    }
    return html;
  }

  root.innerHTML = `
    <style>${CSS}</style>
    <canvas id="annot" class="layer" tabindex="-1"></canvas>
    <canvas id="spot" class="layer"></canvas>
    <div id="ring" class="ring" hidden><i class="cdot"></i><svg class="carrow" viewBox="0 0 24 24"><path d="M3 2 L3 21 L8 16 L11.5 23.5 L14.5 22 L11 15 L18 15 Z" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"></path></svg></div>
    <div id="tb" class="toolbar app-off">${buildToolbar()}</div>
    <button id="reopen" class="reopen" hidden title="ツールバーを表示"><span class="ico">${(EF.iconSvg && EF.iconSvg("collapse", 18)) || "«"}</span></button>
    <div id="edge-hint" class="edge-hint" hidden></div>
    <div id="tool-options" class="tool-options" hidden></div>
    <div id="badge" class="badge" hidden></div>
    <div id="toast" class="toast" hidden></div>
    <div id="ef-dock" class="ef-dock">
      <button class="dock-btn dock-power-mark" id="dock-power" title="ポインター ON/OFF (⌘⇧E)"><span class="ico">${(EF.iconSvg && EF.iconSvg("power", 18)) || "⏻"}</span></button>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);
  const annot = $("#annot"), spot = $("#spot"), ring = $("#ring");
  const tb = $("#tb");
  const badgeEl = $("#badge"), toastEl = $("#toast"), optEl = $("#tool-options"), dockEl = $("#ef-dock"), reopenEl = $("#reopen"), hintEl = $("#edge-hint");

  // ---------- ユーティリティ ----------
  let toastT;
  function toast(msg, ms) {
    toastEl.textContent = msg; toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add("show"));
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.classList.remove("show"); setTimeout(() => (toastEl.hidden = true), 220); }, ms || 1600);
  }
  function setBadge() {
    // 現在のツールを示す中央下のバッジは非表示（ツールバーの緑ハイライトで判別できるため）
    badgeEl.hidden = true; return;
    const extras = [];
    if (state.spotlight) extras.push("スポットライト");
    if (state.zoom) extras.push("ズーム×" + state.zoomScale.toFixed(1));
    badgeEl.innerHTML = `<span class="dotc" style="background:${state.color}"></span>` +
      (TOOL_NAMES[state.tool] || state.tool) + (extras.length ? " ・ " + extras.join(" ・ ") : "");
    badgeEl.hidden = false;
  }

  // ---------- 描画エンジン ----------
  const engine = new EF.DrawingEngine(annot, {
    getStyle: () => ({ tool: state.tool, color: state.color, width: state.strokeWidth, head: state.arrowHead }),
    getAutoErase: () => state.autoErase,
  });
  window.addEventListener("resize", () => { engine.resize(); sizeSpot(); });

  // ---------- カーソルリング & 描画入力 ----------
  let drawing = false;
  let drawPending = null;    // mousedown後、6px以上ドラッグで描画確定する座標
  let drewThisPress = false; // 今回の押下でドラッグ描画が発生したか（click stopper用）
  let inFullscreen = false;  // プレゼン（全画面）中フラグ
  function canvasInteractive() {
    const on = state.appOn && !state.zoom && DRAW_TOOLS.indexOf(state.tool) !== -1;
    annot.classList.toggle("live", !!on);
    annot.classList.toggle("tool-cursor", false);
  }
  window.addEventListener("mousemove", (ev) => {
    state.mouse = { x: ev.clientX, y: ev.clientY };
    updateRing();
    if (state.zoom) applyZoom();
    // 6px 以上移動したら描画を確定（それ未満はクリック扱いでスライド送り可）
    if (drawPending) {
      if (Math.hypot(ev.clientX - drawPending.x, ev.clientY - drawPending.y) >= 6) {
        drawing = true; engine.start(drawPending.x, drawPending.y); drawPending = null;
      }
    }
    if (drawing) engine.move(ev.clientX, ev.clientY);
    updateReveal(ev.clientX, ev.clientY);
  }, true);

  // ---- 右端ホバーで自動表示（Macのドック風）----
  const HOT = 56; // 端から何pxで反応するか（広めにして出しやすく）
  let revealTimer = null, revealed = false;
  function autoHideActive() { return state.appOn && state.autoHide && !state.uiHidden; }
  function setReveal(on) {
    revealed = on;
    tb.classList.toggle("revealed", on);
    hintEl.hidden = on || !autoHideActive();
  }
  function reveal(on) {
    if (on) { if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; } if (!revealed) setReveal(true); }
    else if (revealed && !revealTimer) { revealTimer = setTimeout(() => { revealTimer = null; setReveal(false); }, 320); }
  }
  function updateReveal(x, y) {
    if (!autoHideActive()) return;
    if (drawing) return; // 描画中はツールバー自動表示を更新しない
    const left = state.barSide === "left";
    const nearEdge = left ? x <= HOT : x >= window.innerWidth - HOT;
    let overBar = false;
    if (revealed) { const r = tb.getBoundingClientRect(); overBar = x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10; }
    reveal(nearEdge || overBar);
  }
  function refreshAutoHide() {
    const active = autoHideActive();
    tb.classList.toggle("auto-hide", active);
    hintEl.classList.toggle("side-left", state.barSide === "left");
    if (!active) {
      tb.classList.remove("revealed"); revealed = false;
      if (revealTimer) { clearTimeout(revealTimer); revealTimer = null; }
    }
    hintEl.hidden = !active || revealed;
  }
  annot.addEventListener("mousedown", (ev) => {
    if (!state.appOn || ev.button !== 0) return;
    if (state.zoom) return;
    if (state.tool === "text") { ev.preventDefault(); ev.stopPropagation(); showTextInput(ev.clientX, ev.clientY, engine.hitText(ev.clientX, ev.clientY)); return; }
    if (DRAW_TOOLS.indexOf(state.tool) === -1) return;
    // 描画開始でcanvasにフォーカスを引き込む → Deleteキーがメインフレームのkeyboard_early.jsで確実に捕捉される
    annot.focus({ preventScroll: true });
    // ドラッグ閾値まではクリックをスライドへ通す（スライドショーでのクリック送りが使える）
    drewThisPress = false;
    drawPending = { x: ev.clientX, y: ev.clientY };
    ev.preventDefault(); // テキスト選択等を防止（stopPropagation はしない）
  });
  window.addEventListener("mouseup", (ev) => {
    const wasPending = drawPending;
    drawPending = null;
    if (drawing) { drawing = false; drewThisPress = true; engine.end(); return; }
    // 純クリック（ドラッグなし）→ mousedown で preventDefault したため click が発生しない。
    // host は pointer-events:none なので elementFromPoint で下の要素（スライド等）を取得し
    // 合成 click を届ける。
    if (wasPending && state.appOn) {
      // annot の pointer-events を一時的に none にしないと shadow host が
      // elementFromPoint に拾われてしまう（shadow child が auto だと host が
      // hit-target になる Chromium の挙動）。
      annot.style.pointerEvents = "none";
      const underEl = document.elementFromPoint(wasPending.x, wasPending.y);
      annot.style.pointerEvents = "";
      if (underEl && underEl !== host) {
        underEl.dispatchEvent(new MouseEvent("click", {
          bubbles: true, cancelable: true,
          clientX: wasPending.x, clientY: wasPending.y,
          button: 0, buttons: 0, view: window
        }));
      }
    }
  }, true);
  // 描画が発生した直後のみ click を止める
  annot.addEventListener("click", (e) => {
    if (!state.appOn || !annot.classList.contains("live")) return;
    if (drewThisPress) { drewThisPress = false; e.stopPropagation(); }
  });
  // dblclick / contextmenu は描画モード中は常に止める
  ["dblclick", "contextmenu"].forEach((t) =>
    annot.addEventListener(t, (e) => { if (state.appOn && annot.classList.contains("live")) e.stopPropagation(); }));
  // pointer 系は描画中のみ止める
  ["pointerdown", "pointerup"].forEach((t) =>
    annot.addEventListener(t, (e) => { if (state.appOn && drawing) e.stopPropagation(); }));
  // クリック波紋
  window.addEventListener("mousedown", (ev) => {
    if (!state.appOn || !state.ring.ripple) return;
    const r = document.createElement("div");
    r.className = "ripple"; r.style.left = ev.clientX + "px"; r.style.top = ev.clientY + "px";
    r.style.borderColor = ev.button === 2 ? "#ff3b4e" : state.color;
    root.appendChild(r); setTimeout(() => r.remove(), 600);
  }, true);

  // インラインのテキスト入力。hit を渡すと既存テキストの再編集。
  function showTextInput(x, y, hit) {
    const old = root.querySelector(".ef-text"); if (old) old.remove();
    const px = hit ? hit.a.x : x, py = hit ? hit.a.y : y;
    const color = hit ? hit.color : state.textColor;
    const size = hit ? hit.size : state.textSize;
    const weight = hit ? hit.weight : (state.textBold ? 800 : 500);
    if (hit) hit._editing = true;
    const inp = document.createElement("input");
    inp.className = "ef-text"; inp.type = "text"; inp.value = hit ? hit.text : "";
    inp.style.left = px + "px"; inp.style.top = py + "px";
    inp.style.color = color; inp.style.fontSize = size + "px"; inp.style.fontWeight = weight;
    root.appendChild(inp); requestAnimationFrame(() => { inp.focus(); inp.select(); });
    let done = false;
    const close = (keep) => {
      if (done) return; done = true;
      inp.removeEventListener("blur", onBlur);
      const v = inp.value.trim();
      if (inp.isConnected) inp.remove();
      if (hit) {
        hit._editing = false;
        if (!keep) return;
        if (v) hit.text = v; else engine.removeStroke(hit);
      } else if (keep && v) {
        engine.addText(px, py, v, { color: color, size: size, weight: weight });
      }
    };
    const onBlur = () => close(true);
    inp.addEventListener("keydown", (e) => {
      e.stopPropagation();
      if (e.key === "Enter" && !e.isComposing) close(true);
      else if (e.key === "Escape") close(false);
    });
    inp.addEventListener("blur", onBlur);
  }

  // ツール別オプション（カーソル形状 / 矢じり向き / 注目の帯）
  function optGroup(title, opt, cur, items) {
    const btns = items.map((it) =>
      `<button class="to-btn${String(it[0]) === String(cur) ? " on" : ""}" data-opt="${opt}" data-val="${it[0]}">` +
      (it[1] ? `<span>${it[1]}</span>` : "") + `<span>${it[2]}</span></button>`).join("");
    return `<div class="to-group"><div class="to-title">${title}</div><div class="to-btns">${btns}</div></div>`;
  }
  function fitToolbar() {
    tb.classList.remove("compact");
    // 2列でも収まらない短い画面のときだけ、アイコンのみのコンパクト表示に
    if (tb.scrollHeight > window.innerHeight - 24) tb.classList.add("compact");
  }

  // ツール群だけ再生成（順序・表示/非表示の変更を反映）
  function rebuildTools() {
    const tt = root.getElementById("tb-tools");
    if (tt) tt.innerHTML = toolsHtml();
    syncUI();
    fitToolbar();
  }

  // 設定フライアウト用：ツールバー編集グループ（チェック+↑↓）
  function toolbarGroup() {
    const order = state.toolOrder;
    const rows = order.map((key, idx) => {
      const d = toolDef(key); if (!d) return "";
      const ico = (EF.iconSvg && EF.iconSvg(d[1], 14)) || d[2];
      const on = !state.toolHidden[key];
      const up = `<button class="to-mv up" data-mv="up" data-key="${key}" ${idx === 0 ? "disabled" : ""}>${(EF.iconSvg && EF.iconSvg("arrow", 13)) || "↑"}</button>`;
      const dn = `<button class="to-mv dn" data-mv="dn" data-key="${key}" ${idx === order.length - 1 ? "disabled" : ""}>${(EF.iconSvg && EF.iconSvg("arrow", 13)) || "↓"}</button>`;
      return `<div class="to-tool-row">${up}${dn}` +
        `<label class="to-chk${on ? "" : " off"}"><input type="checkbox" data-tool-show="${key}" ${on ? "checked" : ""}>` +
        `<span class="tt-ico">${ico}</span><span>${d[3]}</span></label></div>`;
    }).join("");
    return `<div class="to-group"><div class="to-title">ツールバー</div>${rows}</div>`;
  }

  function profileGroup() {
    const row = (key) => {
      const saved = !!profiles[key];
      return `<div class="prof-row"><span class="prof-name">${PROFILE_NAMES[key]}</span>` +
        `<button class="prof-btn" data-prof="${key}" data-pact="apply"${saved ? "" : " disabled"}>適用</button>` +
        `<button class="prof-btn save" data-prof="${key}" data-pact="save">保存</button></div>`;
    };
    return `<div class="to-group"><div class="to-title">プロファイル</div>${row("c1")}${row("c2")}${row("c3")}</div>`;
  }

  // 設定の永続化（chrome.storage.local）
  const PERSIST = ["color", "strokeWidth", "ring", "cursorStyle", "arrowHead",
    "spotShape", "spotBand", "spotDim", "zoomScale", "textSize", "textBold", "textColor",
    "toolOrder", "toolHidden", "barSide", "dockPos", "autoHide", "showLabels", "autoErase", "tool", "recMic", "recShotSec"];
  // 保存済み順序に新規ツールが欠けていたら補完、未知のキーは除去
  function normalizeToolOrder() {
    if (!Array.isArray(state.toolOrder)) state.toolOrder = TOOL_DEFS.map((d) => d[1]);
    const valid = TOOL_DEFS.map((d) => d[1]);
    state.toolOrder = state.toolOrder.filter((k) => valid.indexOf(k) !== -1);
    valid.forEach((k) => { if (state.toolOrder.indexOf(k) === -1) state.toolOrder.push(k); });
    if (!state.toolHidden || typeof state.toolHidden !== "object") state.toolHidden = {};
  }

  function saveSettings() {
    try {
      const o = {}; PERSIST.forEach((k) => { o[k] = state[k]; });
      chrome.storage && chrome.storage.local.set({ efSettings: o });
    } catch (e) { /* noop */ }
  }

  // ---- 設定プロファイル（商談用 / 社内用 をワンタップ切替）----
  const PROFILE_NAMES = { c1: "設定1", c2: "設定2", c3: "設定3" };
  let profiles = {};
  function loadProfiles(done) {
    try {
      chrome.storage.local.get("efProfiles", (r) => { profiles = (r && r.efProfiles) || {}; done && done(); });
    } catch (e) { done && done(); }
  }
  function saveProfile(key) {
    const snap = {}; PERSIST.forEach((k) => { snap[k] = state[k]; });
    delete snap.tool; // ツールの選択状態はプロファイルに含めない
    profiles[key] = snap;
    try { chrome.storage.local.set({ efProfiles: profiles }); } catch (e) { /* noop */ }
    toast(PROFILE_NAMES[key] + "に保存しました", 2000);
  }
  function applyProfile(key) {
    const o = profiles[key];
    if (!o) { toast(PROFILE_NAMES[key] + "は未保存です", 2000); return; }
    PERSIST.forEach((k) => {
      if (k === "tool" || o[k] === undefined) return;
      if (k === "ring") state.ring = Object.assign({}, state.ring, o.ring);
      else state[k] = o[k];
    });
    normalizeToolOrder();
    saveSettings(); updateRing(); rebuildTools(); renderOptions(); applyLayout(); syncUI();
    toast(PROFILE_NAMES[key] + "を適用しました", 1800);
  }
  function loadSettings(done) {
    try {
      chrome.storage.local.get("efSettings", (r) => {
        const o = r && r.efSettings;
        if (o) PERSIST.forEach((k) => {
          if (o[k] === undefined) return;
          if (k === "ring") state.ring = Object.assign({}, state.ring, o.ring);
          else state[k] = o[k];
        });
        normalizeToolOrder();
        done && done();
      });
    } catch (e) { done && done(); }
  }

  function updateDock() {
    // 左下マークは基本常時表示（色でON/OFF）。ただし「終了」されたら完全に隠す。
    dockEl.hidden = state.dismissed && !state.appOn;
    const power = root.getElementById("dock-power");
    power.classList.toggle("on", state.appOn);
    power.title = state.appOn ? "ポインター ON（クリックでOFF）" : "ポインター OFF（クリックでON）";
    // 最小化中だけ、右端の再表示タブを出す
    reopenEl.hidden = !(state.appOn && state.uiHidden);
    reopenEl.classList.toggle("side-left", state.barSide === "left");
    refreshAutoHide();
  }

  function renderOptions() {
    if (!state.optionsOpen) { optEl.hidden = true; return; }
    const groups = [];
    // 共通設定（常に表示）
    groups.push(optGroup("線の太さ", "strokeWidth", state.strokeWidth, [[4, "", "細"], [6, "", "中"], [10, "", "太"]]));
    groups.push(optGroup("ズーム倍率", "zoomScale", state.zoomScale, [[1.5, "", "×1.5"], [2, "", "×2"], [3, "", "×3"]]));
    groups.push(optGroup("クリック波紋", "ripple", state.ring.ripple ? "on" : "off", [["on", "", "ON"], ["off", "", "OFF"]]));
    groups.push(optGroup("注目の濃さ", "spotDim", state.spotDim, [[0.55, "", "薄"], [0.72, "", "標準"], [0.88, "", "濃"]]));
    groups.push(optGroup("ラベル表示（記号だけ＝OFF）", "showLabels", state.showLabels ? "on" : "off", [["on", "", "ON"], ["off", "", "OFF"]]));
    groups.push(optGroup("自動で消える（レーザー）", "laser", state.autoErase > 0 ? "on" : "off", [["on", "", "ON"], ["off", "", "OFF"]]));
    groups.push(optGroup("録画でマイクも録る", "recMic", state.recMic ? "on" : "off", [["on", "", "ON"], ["off", "", "OFF"]]));
    groups.push(optGroup("録画中の自動スクショ", "recShotSec", state.recShotSec, [[0, "", "OFF"], [15, "", "15秒"], [30, "", "30秒"], [60, "", "1分"]]));
    groups.push(optGroup("自動表示（右端ホバー）", "autoHide", state.autoHide ? "on" : "off", [["on", "", "ON"], ["off", "", "OFF"]]));
    groups.push(optGroup("ツールバー位置", "barSide", state.barSide, [["left", "", "左"], ["right", "", "右"]]));
    groups.push(optGroup("ドック位置", "dockPos", state.dockPos, [["bottom-left", "", "左下"], ["bottom-right", "", "右下"], ["top-left", "", "左上"], ["top-right", "", "右上"]]));
    if (state.appOn && state.tool === "cursor") {
      groups.push(optGroup("カーソル", "cursorStyle", state.cursorStyle, [["dot", "●", "ドット"], ["arrow", "➤", "矢印"], ["ring", "◎", "リング"], ["halo", "✦", "ハロー"]]));
      groups.push(optGroup("大きさ", "ringSize", state.ring.size, [[36, "", "小"], [52, "", "中"], [72, "", "大"]]));
    } else if (state.appOn && state.tool === "arrow")
      groups.push(optGroup("矢じり", "arrowHead", state.arrowHead, [["end", "→", "終点"], ["start", "←", "始点"], ["both", "↔", "両方"]]));
    if (state.appOn && state.spotlight) {
      groups.push(optGroup("注目の形", "spotShape", state.spotShape, [["band", "▭", "帯"], ["circle", "◯", "丸"]]));
      if (state.spotShape === "band")
        groups.push(optGroup("帯の高さ", "spotBand", state.spotBand, [[0.25, "", "25%"], [0.33, "", "33%"], [0.5, "", "50%"]]));
    }
    // ツールバー編集（並べ替え・表示/非表示）
    groups.push(toolbarGroup());
    groups.push(profileGroup());
    groups.push('<div class="opt-ver">Enmish Pointer v0.5.20</div>');
    if (!groups.length) { optEl.hidden = true; return; }
    optEl.innerHTML = groups.join(""); optEl.hidden = false;
  }

  function updateRing() {
    // リング（カーソル強調）は「カーソル」ツールのときだけ表示。他ツールでは消す。
    if (!state.appOn || state.tool !== "cursor") { ring.hidden = true; return; }
    const r = state.ring, color = state.color, style = state.cursorStyle || "dot";
    const dot = ring.querySelector(".cdot"), arrow = ring.querySelector(".carrow");
    ring.hidden = false;
    ring.style.width = r.size + "px"; ring.style.height = r.size + "px";
    ring.style.left = state.mouse.x + "px"; ring.style.top = state.mouse.y + "px";
    ring.style.opacity = r.opacity;
    ring.style.borderWidth = "0"; ring.style.background = "transparent"; ring.style.boxShadow = "none";
    if (dot) dot.style.display = "none";
    if (arrow) arrow.style.display = "none";
    ring.style.transform = "translate(-50%, -50%)";
    if (style === "arrow") {
      ring.style.transform = "translate(" + (-(3 / 24) * r.size) + "px, " + (-(2 / 24) * r.size) + "px)";
      if (arrow) {
        arrow.style.display = "block"; arrow.style.width = r.size + "px"; arrow.style.height = r.size + "px";
        const path = arrow.querySelector("path"); if (path) path.setAttribute("fill", color);
      }
      return;
    }
    if (style === "ring" || style === "ringdot") { ring.style.borderWidth = r.width + "px"; ring.style.borderColor = color; }
    if (style === "halo") { ring.style.background = "radial-gradient(circle, " + color + "cc 0%, " + color + "44 38%, transparent 70%)"; }
    if ((style === "dot" || style === "ringdot") && dot) {
      const ds = style === "dot" ? Math.max(10, r.size * 0.42) : Math.max(8, r.size * 0.24);
      dot.style.display = "block"; dot.style.width = ds + "px"; dot.style.height = ds + "px"; dot.style.background = color;
    }
  }

  // ---------- スポットライト ----------
  const sctx = spot.getContext("2d");
  function sizeSpot() {
    const dpr = window.devicePixelRatio || 1;
    spot.width = Math.round(window.innerWidth * dpr);
    spot.height = Math.round(window.innerHeight * dpr);
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }
  let spotRadius = 130;
  function renderSpot() {
    sctx.clearRect(0, 0, window.innerWidth, window.innerHeight);
    if (state.appOn && state.spotlight) {
      sctx.fillStyle = "rgba(8,10,16," + (state.spotDim || 0.72) + ")";
      sctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      const m = state.mouse, W = window.innerWidth, H = window.innerHeight;
      sctx.save();
      sctx.globalCompositeOperation = "destination-out";
      if (state.spotShape === "band") {
        const bandH = Math.max(60, H * (state.spotBand || 0.33));
        const top = Math.min(Math.max(m.y - bandH / 2, 0), H - bandH);
        const soft = Math.min(0.18, 28 / bandH);
        const g = sctx.createLinearGradient(0, top, 0, top + bandH);
        g.addColorStop(0, "rgba(0,0,0,0)"); g.addColorStop(soft, "rgba(0,0,0,1)");
        g.addColorStop(1 - soft, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
        sctx.fillStyle = g; sctx.fillRect(0, top, W, bandH);
      } else {
        const g = sctx.createRadialGradient(m.x, m.y, spotRadius * 0.55, m.x, m.y, spotRadius);
        g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
        sctx.fillStyle = g; sctx.beginPath(); sctx.arc(m.x, m.y, spotRadius, 0, Math.PI * 2); sctx.fill();
      }
      sctx.restore();
    }
    requestAnimationFrame(renderSpot);
  }
  sizeSpot(); renderSpot();

  // ---------- 右端レーン（ツールバーがページ本体に被らないよう余白を確保） ----------
  const GUTTER = 86;
  function reserveGutter(on) {
    const el = document.documentElement;
    el.style.removeProperty("margin-right");
    el.style.removeProperty("margin-left");
    if (on) el.style.setProperty(state.barSide === "left" ? "margin-left" : "margin-right", GUTTER + "px", "important");
  }
  function applyLayout() {
    tb.classList.toggle("side-left", state.barSide === "left");
    tb.classList.toggle("labels-off", !state.showLabels);
    optEl.classList.toggle("side-left", state.barSide === "left");
    dockEl.classList.remove("dock-bottom-right", "dock-top-left", "dock-top-right");
    if (state.dockPos && state.dockPos !== "bottom-left") dockEl.classList.add("dock-" + state.dockPos);
    // 自動表示モードはバーが浮いて出るのでガターは取らない
    reserveGutter(state.appOn && !state.uiHidden && !state.autoHide);
    refreshAutoHide();
    fitToolbar();
  }

  // ---------- ズーム（カーソル周辺を拡大・表示専用） ----------
  function applyZoom() {
    const b = document.body; if (!b) return;
    if (!state.zoom) {
      b.style.removeProperty("transform");
      b.style.removeProperty("transform-origin");
      b.style.removeProperty("zoom");
      return;
    }
    // body に CSS transform: scale() を適用してカーソル中心で拡大する。
    // host は body の外（html の直下）にあるため transform の影響を受けず
    // オーバーレイの位置・サイズは常に正しい。
    // setProperty の第3引数 "important" で Google Slides 等の CSS 上書きを防ぐ。
    const m = state.mouse;
    const mx = m ? m.x : window.innerWidth / 2;
    const my = m ? m.y : window.innerHeight / 2;
    const ox = (mx / window.innerWidth) * 100;
    const oy = (my / window.innerHeight) * 100;
    b.style.setProperty("transform-origin", ox + "% " + oy + "%", "important");
    b.style.setProperty("transform", "scale(" + state.zoomScale + ")", "important");
    b.style.removeProperty("zoom");
  }

  // ---------- UI 同期 ----------
  function syncUI() {
    tb.classList.toggle("app-off", !state.appOn);
    tb.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", state.appOn && b.dataset.tool === state.tool));
    $("#btn-spot").classList.toggle("toggled", state.spotlight);
    $("#btn-zoom").classList.toggle("toggled", state.zoom);
    root.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s.dataset.color === state.color));
    canvasInteractive();
  }

  // ---------- ZIP（無圧縮 store。PNG/webmは既に圧縮済みなので十分） ----------
  function efCrc32(buf) {
    let table = efCrc32._t;
    if (!table) {
      table = efCrc32._t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function efZip(files) { // files: [{name, data:Uint8Array}]
    const enc = new TextEncoder();
    const u16 = (n) => [n & 255, (n >>> 8) & 255];
    const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    const local = [], central = []; let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = efCrc32(f.data), size = f.data.length;
      // gp flag に bit11(0x0800)=UTF-8 を立て、日本語ファイル名（メモ.txt）を正しく扱う
      const lh = [].concat(u32(0x04034b50), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0));
      local.push(new Uint8Array(lh), name, f.data);
      const ch = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0x0800), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push(new Uint8Array(ch), name);
      offset += lh.length + name.length + size;
    }
    let cenSize = 0; central.forEach((c) => (cenSize += c.length));
    const eocd = [].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cenSize), u32(offset), u16(0));
    return new Blob([...local, ...central, new Uint8Array(eocd)], { type: "application/zip" });
  }
  function efDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // ---------- コマンド ----------
  const app = {
    setTool(t) {
      if (!state.appOn) app.toggle(true);
      state.tool = t; syncUI(); renderOptions(); setBadge(); updateRing();
    },
    setColor(c) { state.color = c; syncUI(); updateRing(); setBadge(); saveSettings(); },
    toggleMode(what) {
      if (!state.appOn) app.toggle(true);
      if (what === "spotlight") { state.spotlight = !state.spotlight; toast(state.spotlight ? "スポットライト ON（[ ]で広さ）" : "スポットライト OFF"); }
      else if (what === "zoom") {
        state.zoom = !state.zoom; applyZoom();
        toast(state.zoom ? "ズーム ON（- =で倍率／表示専用）" : "ズーム OFF");
      }
      syncUI(); renderOptions(); setBadge();
    },
    action(name) {
      if (name === "undo") engine.undo();
      else if (name === "clear") { engine.clear(); toast("全消去（『戻る』で復元できます）"); }
      else if (name === "screenshot") app.screenshot();
      else if (name === "copy") app.copyShot();
      else if (name === "record") app.toggleRecord();
      else if (name === "collapse") app.toggleUI();
      else if (name === "options") {
        if (!state.appOn) app.toggle(true);
        state.optionsOpen = !state.optionsOpen;
        const btn = root.getElementById("btn-options");
        if (btn) btn.classList.toggle("toggled", state.optionsOpen);
        renderOptions();
      }
    },
    toggleUI() {
      if (!state.appOn) return;
      state.uiHidden = !state.uiHidden;
      host.classList.toggle("ui-hidden", state.uiHidden);
      reserveGutter(!state.uiHidden && !state.autoHide);
      updateDock();
      toast(state.uiHidden ? "ツールバーを最小化（端のマークで再表示）" : "ツールバーを表示");
    },
    toggle(forceOn) {
      host.style.display = ""; // Esc+Tabで隠していた場合も復帰
      const next = forceOn === true ? true : !state.appOn;
      state.appOn = next;
      if (window.__efEarly) window.__efEarly.appOn = next;
      broadcastToIframes(next);
      if (next) state.dismissed = false; // オンにしたら「終了」状態は解除（左下マーク復活）
      if (!next) {
        state.spotlight = false; state.zoom = false; applyZoom();
        state.uiHidden = false; host.classList.remove("ui-hidden");
        state.optionsOpen = false;
        const ob = root.getElementById("btn-options"); if (ob) ob.classList.remove("toggled");
        reserveGutter(false);
        toast("Enmish Pointer を終了");
      } else {
        reserveGutter(!state.autoHide);
        if (!onboarded) {
          onboarded = true;
          toast("ツールを選んでドラッグで注釈 ／ 左下マークでON/OFF ／ 右端にマウスでバー表示 ／ ⚙設定で詳細", 4600);
        } else {
          toast("Enmish Pointer 起動 — カーソル強調中");
        }
      }
      updateRing(); syncUI(); renderOptions(); updateDock(); setBadge();
      // 自動表示モードは、起動時に一度だけバーを覗かせてから引っ込める（場所の気づき用）
      if (next && state.autoHide && !state.uiHidden) {
        setReveal(true);
        if (revealTimer) { clearTimeout(revealTimer); }
        revealTimer = setTimeout(() => { revealTimer = null; setReveal(false); }, 1700);
      }
    },
    handleEscape() {
      // 大きいモードの解除のみ（ツール切替・全消去は素のEsc側で扱う）
      if (state.uiHidden) { app.toggleUI(); return true; }
      if (state.zoom) { state.zoom = false; applyZoom(); syncUI(); setBadge(); return true; }
      if (state.spotlight) { state.spotlight = false; syncUI(); setBadge(); return true; }
      return false;
    },
    screenshot() {
      const d = new Date(), p = (n) => String(n).padStart(2, "0");
      // chrome.downloads はスペースや一部記号を弾くため安全な文字へ寄せる
      const title = (document.title || "画面")
        .replace(/[\s\\/:*?"<>|.~#%&{}$!'@+`=,;()\[\]]+/g, "_")
        .replace(/_+/g, "_").replace(/^_+|_+$/g, "")
        .slice(0, 30).replace(/_+$/, "") || "画面";
      const fn = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}_${title}_annot.png`;
      // UI を一時的に隠してから撮る（注釈は残す）
      const hide = [tb, badgeEl, ring, toastEl, optEl, dockEl];
      const prev = hide.map((e) => e.style.visibility);
      hide.forEach((e) => (e.style.visibility = "hidden"));
      toast("スクリーンショットを保存中…", 1200);
      requestAnimationFrame(() => requestAnimationFrame(() => {
        chrome.runtime.sendMessage({ type: "ef-capture" }, (res) => {
          hide.forEach((e, i) => (e.style.visibility = prev[i]));
          if (chrome.runtime.lastError) { toast("保存に失敗: " + chrome.runtime.lastError.message, 2400); return; }
          if (res && res.ok && res.dataUrl) {
            const a = document.createElement("a");
            a.href = res.dataUrl; a.download = fn;
            document.body.appendChild(a); a.click(); a.remove();
            toast("保存しました: " + fn, 2400);
          } else {
            toast("保存に失敗しました" + (res && res.error ? "（" + res.error + "）" : ""), 2600);
          }
        });
      }));
    },
    // 表示中タブを撮影してクリップボードへコピー（チャット等にすぐ貼れる）
    copyShot() {
      if (!navigator.clipboard || !window.ClipboardItem) { toast("この環境ではコピー未対応です", 2400); return; }
      const hide = [tb, badgeEl, ring, toastEl, optEl, dockEl, reopenEl, hintEl];
      const prev = hide.map((e) => e.style.visibility);
      // ジェスチャ保持のため、clipboard.write は同期で呼び、Blob を Promise で渡す
      const capP = new Promise((resolve, reject) => {
        hide.forEach((e) => (e.style.visibility = "hidden"));
        requestAnimationFrame(() => requestAnimationFrame(() => {
          chrome.runtime.sendMessage({ type: "ef-capture" }, (res) => {
            hide.forEach((e, i) => (e.style.visibility = prev[i]));
            if (chrome.runtime.lastError || !res || !res.ok || !res.dataUrl) { reject(new Error("capture")); return; }
            fetch(res.dataUrl).then((r) => r.blob()).then(resolve, reject);
          });
        }));
      });
      navigator.clipboard.write([new ClipboardItem({ "image/png": capP })])
        .then(() => toast("画像をクリップボードにコピーしました", 2200))
        .catch(() => toast("コピーに失敗しました（保存をお試しください）", 2600));
    },
    // 録画ボタンの見た目を更新（録画中=赤・停止アイコン）
    _syncRecordBtn() {
      const btn = tb.querySelector('.tool[data-action="record"]');
      if (!btn) return;
      const rec = !!state.recording;
      btn.classList.toggle("recording", rec);
      const ico = btn.querySelector(".ico");
      if (ico && EF.iconSvg) ico.innerHTML = EF.iconSvg(rec ? "stop" : "record");
      const lbl = btn.querySelector(".lbl");
      if (lbl) lbl.textContent = rec ? "停止" : "録画";
      btn.title = rec ? "録画を停止" : "画面録画 (webm保存)";
    },
    toggleRecord() {
      if (state.recording) { app._stopRecord(); return; }
      app._startRecord();
    },
    async _startRecord() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        toast("この環境では画面録画に対応していません", 2600);
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: true,
          // 既定だと「いま開いているタブ」（＝オーバーレイを注入した Google スライド/
          // ドキュメント等）がピッカーで選べない/除外されることがあるため明示的に含める
          selfBrowserSurface: "include",
          surfaceSwitching: "include",
          systemAudio: "include",
        });
      } catch (err) {
        toast("画面録画を開始できませんでした（権限が許可されていない可能性があります）", 2800);
        return;
      }
      // 録画用ストリーム。マイクONなら「画面/タブの音声」＋「自分のマイク」をミックスする
      let recStream = stream, micStream = null, audioCtx = null;
      if (state.recMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const AC = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AC();
          const dest = audioCtx.createMediaStreamDestination();
          if (stream.getAudioTracks().length) {
            audioCtx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(dest);
          }
          audioCtx.createMediaStreamSource(micStream).connect(dest);
          recStream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        } catch (err) {
          if (micStream) micStream.getTracks().forEach((t) => t.stop());
          if (audioCtx) { try { audioCtx.close(); } catch (e) { /* noop */ } }
          micStream = null; audioCtx = null; recStream = stream;
          toast("マイクが取得できなかったため、画面音声のみで録画します", 2800);
        }
      }
      let rec;
      try {
        const opt = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? { mimeType: "video/webm;codecs=vp9" } : { mimeType: "video/webm" };
        rec = new MediaRecorder(recStream, opt);
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        if (micStream) micStream.getTracks().forEach((t) => t.stop());
        if (audioCtx) { try { audioCtx.close(); } catch (e) { /* noop */ } }
        toast("録画の初期化に失敗しました", 2600);
        return;
      }
      // 録画中の自動スクショ（間隔ごとに録画ストリームのフレームをPNGで貯める）
      const shotSec = state.recShotSec | 0;
      const shots = []; // {name, data:Uint8Array}
      let shotTimer = null, shotVideo = null, shotIdx = 0;
      const startMs = Date.now();
      if (shotSec > 0) {
        shotVideo = document.createElement("video");
        shotVideo.muted = true; shotVideo.playsInline = true;
        try { shotVideo.srcObject = recStream; shotVideo.play().catch(() => {}); } catch (e) { /* noop */ }
        const grab = () => {
          const vw = shotVideo.videoWidth, vh = shotVideo.videoHeight;
          if (!vw || !vh) return;
          const cv = document.createElement("canvas"); cv.width = vw; cv.height = vh;
          try { cv.getContext("2d").drawImage(shotVideo, 0, 0, vw, vh); } catch (e) { return; }
          const idx = ++shotIdx, sec = Math.round((Date.now() - startMs) / 1000);
          const mm = String(Math.floor(sec / 60)).padStart(2, "0"), ss = String(sec % 60).padStart(2, "0");
          cv.toBlob((b) => {
            if (!b) return;
            b.arrayBuffer().then((ab) => {
              shots.push({ name: `slides/${String(idx).padStart(3, "0")}_${mm}m${ss}s.png`, data: new Uint8Array(ab) });
            });
          }, "image/png");
        };
        setTimeout(grab, 1200); // 開始直後に1枚
        shotTimer = setInterval(grab, shotSec * 1000);
      }
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        if (shotTimer) clearInterval(shotTimer);
        if (shotVideo) { try { shotVideo.pause(); shotVideo.srcObject = null; } catch (e) { /* noop */ } }
        stream.getTracks().forEach((t) => t.stop());
        if (micStream) micStream.getTracks().forEach((t) => t.stop());
        if (audioCtx) { try { audioCtx.close(); } catch (e) { /* noop */ } }
        const blob = new Blob(chunks, { type: "video/webm" });
        const d = new Date(), p = (n) => String(n).padStart(2, "0");
        const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
        recorder = null; state.recording = false; app._syncRecordBtn();
        if (shots.length) {
          // 動画＋スライド＋メモを1つのZIP（フォルダ）にまとめて保存
          toast(`記録パックを作成中…（スライド${shots.length}枚）`, 2200);
          const dur = Math.round((Date.now() - startMs) / 1000);
          const memo = "\uFEFF" + [
            "Enmish Pointer 記録パック",
            `録画日時: ${d.getFullYear()}/${p(d.getMonth() + 1)}/${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`,
            `録画時間: ${Math.floor(dur / 60)}分${dur % 60}秒`,
            `スライド: ${shots.length}枚（slides/ フォルダ）`,
            `音声: ${micStream ? "画面＋マイク" : "画面のみ"}`,
            `ページ: ${document.title || "-"}`,
            "",
            "※文字起こしは video.webm を Notta / tl;dv / Meet字幕 等に渡してください。",
          ].join("\r\n");
          blob.arrayBuffer().then((ab) => {
            const files = [
              { name: "memo.txt", data: new TextEncoder().encode(memo) },
              { name: "video.webm", data: new Uint8Array(ab) },
            ].concat(shots);
            efDownload(efZip(files), `rec_${stamp}.zip`);
            toast(`記録パックを保存：動画＋スライド${shots.length}枚`, 3000);
          });
        } else {
          efDownload(blob, `${stamp}_screen.webm`);
          toast("録画を保存しました: " + stamp, 2600);
        }
      };
      const vt = stream.getVideoTracks()[0];
      if (vt) vt.onended = () => { if (state.recording) app._stopRecord(); };
      recorder = rec;
      state.recording = true;
      app._syncRecordBtn();
      rec.start();
      const parts = ["画面"];
      if (micStream) parts.push("マイク");
      if (shotSec > 0) parts.push(`スライド自動(${shotSec}秒)`);
      toast(`録画開始：${parts.join("＋")}（もう一度押すと停止）`, 2800);
    },
    _stopRecord() {
      if (recorder && recorder.state !== "inactive") {
        try { recorder.stop(); } catch (e) { /* noop */ }
      } else {
        state.recording = false;
        app._syncRecordBtn();
      }
    },
  };
  let recorder = null;

  // ---------- イベント配線 ----------
  // カラースウォッチ
  const colors = $("#colors");
  colors.innerHTML = PALETTE.map((c) => `<div class="swatch" data-color="${c}" style="background:${c}"></div>`).join("");
  colors.addEventListener("click", (e) => { const s = e.target.closest(".swatch"); if (s) app.setColor(s.dataset.color); });

  tb.addEventListener("click", (e) => {
    const b = e.target.closest("button"); if (!b) return;
    if (b.dataset.tool) app.setTool(b.dataset.tool);
    else if (b.dataset.toggle) app.toggleMode(b.dataset.toggle);
    else if (b.dataset.action) app.action(b.dataset.action);
  });

  root.getElementById("dock-power").addEventListener("click", () => app.toggle());
  reopenEl.addEventListener("click", () => app.toggleUI());

  // UI（バー/ドック/設定/再表示）のイベントをスライドへ渡さない。
  // mousedown に preventDefault を加えてフォーカスの奪取を防ぐ（矢印キー等でスライド送りが維持される）。
  [tb, dockEl, optEl, reopenEl].forEach((el) => {
    el.addEventListener("mousedown", (e) => { e.preventDefault(); e.stopPropagation(); });
    ["pointerdown", "pointerup", "click", "dblclick", "contextmenu"].forEach((t) =>
      el.addEventListener(t, (e) => e.stopPropagation()));
  });

  optEl.addEventListener("click", (e) => {
    // プロファイル：適用／保存
    const pb = e.target.closest(".prof-btn");
    if (pb) { if (pb.dataset.pact === "save") saveProfile(pb.dataset.prof); else applyProfile(pb.dataset.prof); return; }
    // ツールバー：並べ替え（↑↓）
    const mv = e.target.closest(".to-mv");
    if (mv) {
      const key = mv.dataset.key, dir = mv.dataset.mv === "up" ? -1 : 1;
      const order = state.toolOrder, i = order.indexOf(key), j = i + dir;
      if (i >= 0 && j >= 0 && j < order.length) {
        const t = order[i]; order[i] = order[j]; order[j] = t;
        rebuildTools(); renderOptions(); saveSettings();
      }
      return;
    }
    const b = e.target.closest(".to-btn"); if (!b) return;
    const opt = b.dataset.opt; let v = b.dataset.val;
    if (opt === "ringSize") state.ring.size = parseFloat(v);
    else if (opt === "spotBand") state.spotBand = parseFloat(v);
    else if (opt === "spotDim") state.spotDim = parseFloat(v);
    else if (opt === "strokeWidth") state.strokeWidth = parseFloat(v);
    else if (opt === "zoomScale") { state.zoomScale = parseFloat(v); applyZoom(); }
    else if (opt === "ripple") state.ring.ripple = (v === "on");
    else if (opt === "showLabels") { state.showLabels = (v === "on"); applyLayout(); }
    else if (opt === "laser") { state.autoErase = (v === "on") ? 2 : 0; }
    else if (opt === "recMic") { state.recMic = (v === "on"); }
    else if (opt === "recShotSec") { state.recShotSec = parseInt(v, 10) || 0; }
    else if (opt === "autoHide") { state.autoHide = (v === "on"); applyLayout(); }
    else if (opt === "barSide" || opt === "dockPos") { state[opt] = v; applyLayout(); }
    else state[opt] = v;
    updateRing(); renderOptions(); setBadge(); saveSettings();
  });

  // ツールバー：表示/非表示チェック
  optEl.addEventListener("change", (e) => {
    const cb = e.target.closest("[data-tool-show]"); if (!cb) return;
    const key = cb.dataset.toolShow;
    if (cb.checked) delete state.toolHidden[key];
    else state.toolHidden[key] = true;
    rebuildTools(); renderOptions(); saveSettings();
  });

  // ---------- ショートカット ----------
  // Esc を押している間だけ true（Esc+Tab の検出用）
  let escDown = false;
  window.addEventListener("keyup", (e) => { if (e.key === "Escape") escDown = false; }, true);
  window.addEventListener("blur", () => { escDown = false; }, true);
  // 起動中だけ：Esc+Tab でオーバーレイを丸ごと隠す/戻す（クリーンな画面にしたい時）
  const isPeeked = () => host.style.display === "none";
  function togglePeek() { host.style.display = isPeeked() ? "" : "none"; }

  // 素のEsc（peek復帰・大きいモード解除のどれにも当たらない時）の挙動：
  //   1回目 → ツールをカーソルに戻す（描画モード解除）
  //   450ms以内に2回連打 → 全消去（文字編集と衝突しない安全なキー操作）
  // 注釈が無ければ何も起きない。Docs等のiframeからは esc 転送で同じ処理に合流する。
  let lastEscTime = 0;
  function onBareEsc() {
    if (!state.appOn) return false;
    const now = Date.now();
    if (lastEscTime && (now - lastEscTime) < 450) {
      lastEscTime = 0;
      if (!engine.isEmpty()) { app.action("clear"); return true; }
      return false;
    }
    lastEscTime = now;
    if (state.tool !== "cursor") { app.setTool("cursor"); return true; }
    return false;
  }
  // Esc の統一処理。消費したら true（呼び出し側で preventDefault する）。
  function processEsc() {
    if (isPeeked()) { togglePeek(); lastEscTime = 0; return true; }
    if (app.handleEscape()) { lastEscTime = 0; return true; }
    return onBareEsc();
  }

  // タブが非表示になったらズームを解除（他タブ移動後の残留防止）
  document.addEventListener("visibilitychange", () => {
    if (document.hidden && state.zoom) { state.zoom = false; applyZoom(); setBadge(); }
  });

  window.addEventListener("keydown", (ev) => {
    const ae = document.activeElement;
    // Shadow DOM 内の入力欄（テキスト注釈 ef-text）もチェック
    const sae = host && host.shadowRoot && host.shadowRoot.activeElement;
    const typing = (ae && (/^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || ae.isContentEditable)) ||
                   (sae && (/^(INPUT|TEXTAREA)$/.test(sae.tagName) || sae.isContentEditable));
    const mod = ev.metaKey || ev.ctrlKey, code = ev.code;

    // Esc+Tab：起動中のみオーバーレイを隠す/戻す
    if (code === "Tab" && escDown && state.appOn && !typing) { ev.preventDefault(); togglePeek(); return; }
    if (ev.key === "Escape") { escDown = true; if (processEsc()) { ev.preventDefault(); ev.stopPropagation(); } return; }

    if (mod && ev.shiftKey) {
      if (code === "KeyE") { ev.preventDefault(); app.toggle(); return; }
      if (!state.appOn) return;
      const map = { Digit1: "pen", Digit2: "arrow", Digit3: "ellipse", Digit4: "rect" };
      if (map[code]) { ev.preventDefault(); app.setTool(map[code]); return; }
      if (code === "Digit5") { ev.preventDefault(); app.toggleMode("spotlight"); return; }
      if (code === "Digit6") { ev.preventDefault(); app.toggleMode("zoom"); return; }
      if (code === "KeyH") { ev.preventDefault(); app.toggleUI(); return; }
      if (ev.key === "Backspace" || ev.key === "Delete") { ev.preventDefault(); app.action("clear"); return; }
      if (code === "KeyZ" && !typing) { ev.preventDefault(); engine.redoLast(); toast("1つ進めました"); return; }
      return;
    }

    // Ctrl+Z → undo / Ctrl+Y → redo（typing中は横取りしない）
    if (mod && !ev.shiftKey && state.appOn && !typing) {
      if (code === "KeyZ") { ev.preventDefault(); engine.undo(); toast("1つ戻しました"); return; }
      if (code === "KeyY") { ev.preventDefault(); engine.redoLast(); toast("1つ進めました"); return; }
    }

    if (!state.appOn || typing) return;
    if (state.spotlight && (ev.key === "[" || ev.key === "]")) {
      if (state.spotShape === "band") {
        const opts = [0.25, 0.33, 0.5]; const i = opts.indexOf(state.spotBand);
        state.spotBand = opts[Math.min(2, Math.max(0, (i < 0 ? 1 : i) + (ev.key === "[" ? -1 : 1)))];
        renderOptions();
      } else { spotRadius = Math.max(60, Math.min(380, spotRadius + (ev.key === "[" ? -25 : 25))); }
      ev.preventDefault(); return;
    }
    if (state.zoom && (ev.key === "-" || ev.key === "=" || ev.key === "+")) { state.zoomScale = Math.max(1.4, Math.min(4, state.zoomScale + (ev.key === "-" ? -0.2 : 0.2))); applyZoom(); setBadge(); ev.preventDefault(); return; }
  }, true);

  // background / ツールバーのメニュー からの操作
  chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
    if (!msg) return;
    if (msg.type === "ef-toggle") { app.toggle(); return; }
    if (msg.type === "ef-state") { if (sendResponse) sendResponse({ appOn: state.appOn }); return true; }
    if (msg.type === "ef-cmd") {
      switch (msg.cmd) {
        case "toggle": app.toggle(); break;
        case "off": state.dismissed = true; if (state.appOn) app.toggle(); else updateDock(); break;
        case "clear": if (state.appOn) { engine.clear(); toast("全消去（『戻る』で復元できます）"); } break;
        case "options": if (!state.appOn) app.toggle(true); if (!state.optionsOpen) app.action("options"); break;
        case "minimize": app.toggleUI(); break;
      }
      if (sendResponse) sendResponse({ ok: true, appOn: state.appOn });
      return true;
    }
  });

  if (window.__efEarly) {
    window.__efEarly.cb = function() { engine.undo(); toast("1つ戻しました"); };
    window.__efEarly.clearCb = function() { app.action("clear"); };
  }

  // iframe 内の keyboard_early.js へ appOn 状態を配信する
  function broadcastToIframes(on) {
    try {
      document.querySelectorAll("iframe").forEach(function(f) {
        try { f.contentWindow.postMessage({ __efType: "efState", appOn: on }, "*"); } catch (e) {}
      });
    } catch (e) {}
  }
  window.addEventListener("message", function(ev) {
    if (!ev.data) return;
    // iframe からの状態リクエスト
    if (ev.data.__efType === "efReq") {
      try { ev.source.postMessage({ __efType: "efState", appOn: state.appOn }, "*"); } catch (e) {}
      return;
    }
    // iframe からのキー操作
    if (ev.data.__efType === "efKey" && state.appOn) {
      if (ev.data.action === "undo") { engine.undo(); toast("1つ戻しました"); }
      if (ev.data.action === "clear") { app.action("clear"); }
      if (ev.data.action === "esc") { processEsc(); } // Docs等のiframe内Esc → ダブルEsc全消去
    }
  });

  syncUI();
  renderOptions();
  updateDock();
  fitToolbar();
  window.addEventListener("resize", fitToolbar, true);

  // 拡張を削除/無効化/更新すると、開いているタブの注入済みオーバーレイはChromeが自動では消さない。
  // 拡張コンテキストの無効化（chrome.runtime.id が消える）を検知して、自分で完全に片付ける。
  function teardown() {
    try { if (hostParentObserver) hostParentObserver.disconnect(); } catch (e) { /* noop */ }
    try { if (engine) engine._stopped = true; } catch (e) { /* noop */ }
    try { host.remove(); } catch (e) { /* noop */ }
    try {
      const el = document.documentElement;
      el.style.removeProperty("margin-right"); el.style.removeProperty("margin-left");
      const b = document.body;
      if (b) { b.style.removeProperty("transform"); b.style.removeProperty("transform-origin"); b.style.removeProperty("zoom"); }
    } catch (e) { /* noop */ }
  }
  const _ctxWatch = setInterval(() => {
    let alive = true;
    try { alive = !!(chrome && chrome.runtime && chrome.runtime.id); } catch (e) { alive = false; }
    if (!alive) { clearInterval(_ctxWatch); teardown(); }
  }, 1200);

  // Google スライド等の「全画面プレゼン」では、特定要素だけが全画面表示になり
  // documentElement 直下のオーバーレイは隠れてしまう。全画面要素の中へ host を移動して追従させる。
  let hostParentObserver = null;
  function followFullscreen() {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    inFullscreen = !!fs;
    const parent = fs || document.documentElement || document.body;
    // 親が変わった、または末尾（最前面）でなくなった場合は末尾へ移動
    if (host.parentNode !== parent || parent.lastElementChild !== host) {
      parent.appendChild(host);
      requestAnimationFrame(() => { engine.resize(); sizeSpot(); });
    }
    // 全画面コンテナに他の要素が追加されても最前面を維持するよう監視
    if (hostParentObserver) hostParentObserver.disconnect();
    if (host.parentNode) {
      hostParentObserver = new MutationObserver(() => {
        if (host.isConnected && host.parentNode && host.parentNode.lastElementChild !== host) {
          host.parentNode.appendChild(host);
        }
      });
      hostParentObserver.observe(host.parentNode, { childList: true });
    }
    refreshAutoHide();
    fitToolbar();
  }
  document.addEventListener("fullscreenchange", followFullscreen, true);
  document.addEventListener("webkitfullscreenchange", followFullscreen, true);

  loadProfiles();
  loadSettings(() => { updateRing(); rebuildTools(); renderOptions(); applyLayout(); }); // 保存済み設定を反映（ツール群も再生成・配置も）
})();

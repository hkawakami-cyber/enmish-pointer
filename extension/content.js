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
  const PALETTE = [
    "#c1677f", "#917d44", "#8df1d5", "#6cbba5",
    "#31594e", "#032841", "#5b6478", "#ffffff",
  ];
  const DRAW_TOOLS = ["pen", "highlighter", "arrow", "hline", "ellipse", "rect", "text"];
  const TOOL_NAMES = {
    cursor: "カーソル強調", pen: "ペン", highlighter: "蛍光ペン", arrow: "矢印",
    hline: "横線", ellipse: "丸囲み", rect: "四角囲み", text: "テキスト",
  };

  const state = {
    appOn: false, tool: "cursor", color: "#6cbba5", strokeWidth: 6,
    ring: { width: 6, size: 64, opacity: 0.9, ripple: true },
    cursorStyle: "ring", arrowHead: "end", uiHidden: false, optionsOpen: false,
    autoErase: 0, spotlight: false, spotShape: "band", spotBand: 0.5, spotDim: 0.72,
    zoom: false, zoomScale: 2.0,
    textSize: 28, textBold: true, textColor: "#032841",
    // ツールバーのカスタム（並べ替え・表示/非表示）
    toolOrder: ["rect", "highlighter", "arrow", "hline", "text", "pen", "cursor", "ellipse", "spotlight", "zoom"],
    toolHidden: {},
    barSide: "right", dockPos: "bottom-left",
    recording: false,
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
    :host(.ui-hidden) .toolbar, :host(.ui-hidden) .stamp-bar, :host(.ui-hidden) .reopen, :host(.ui-hidden) .tool-options { display: none !important; }
    .ripple { position: fixed; border-radius: 50%; transform: translate(-50%,-50%); border: 3px solid #6cbba5; pointer-events: none; animation: rip .55s ease-out forwards; }
    @keyframes rip { from { width: 8px; height: 8px; opacity: .85; } to { width: 90px; height: 90px; opacity: 0; } }

    .toolbar, .stamp-bar, .reopen, .badge, .toast, .hint { pointer-events: auto; }
    .toolbar {
      position: fixed; top: 50%; right: 0; transform: translateY(-50%);
      background: rgba(3,40,65,.94); color: #e8ecf4; border-radius: 16px 0 0 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35); backdrop-filter: blur(14px);
      padding: 9px 7px; border: 1px solid rgba(255,255,255,.08); border-right: none; width: 76px;
      display: flex; flex-direction: column; gap: 2px; max-height: calc(100vh - 168px); overflow-y: auto;
    }
    /* 未起動でもツールは押せる（押すと自動的に起動して選択される）。視覚的にだけ少し淡く。 */
    .toolbar.app-off .tool[data-tool], .toolbar.app-off .tool[data-toggle], .toolbar.app-off .colors { opacity: .7; }
    .toolbar.side-left { right: auto; left: 0; border-radius: 0 16px 16px 0; border-left: none; border-right: 1px solid rgba(255,255,255,.08); }
    .toolbar.compact { width: 46px; gap: 1px; }
    .toolbar.compact .lbl { display: none; }
    .toolbar.compact .tool { padding: 7px 3px; }
    .toolbar.compact .brand .ef-word, .toolbar.compact .brand .ef-tag { display: none; }
    .toolbar.compact .colors { grid-template-columns: repeat(2,1fr); }
    .toolbar.compact .sep { margin: 3px 4px; }
    .brand { display: flex; flex-direction: column; align-items: center; gap: 3px; padding: 1px 0 6px; }
    .brand .ef-mark { width: 22px; height: 22px; border-radius: 50%; background: #6cbba5; position: relative; }
    .brand .ef-mark::after { content: ""; position: absolute; right: 4px; top: 4px; width: 6px; height: 6px; border-radius: 50%; background: #032841; }
    .brand .ef-word { font-family: "Helvetica Neue", Helvetica, Arial, sans-serif; font-size: 13px; font-weight: 700; color: #f4f8f7; line-height: 1; }
    .brand .ef-tag { font-size: 8px; letter-spacing: .18em; color: #6cbba5; font-weight: 600; }
    .sep { height: 1px; background: rgba(255,255,255,.10); margin: 4px 4px; }
    .tool {
      display: flex; flex-direction: column; align-items: center; gap: 2px; border: none;
      background: transparent; color: #e8ecf4; padding: 6px 3px; border-radius: 9px;
      cursor: pointer; font-size: 10px; line-height: 1;
    }
    .tool:hover { background: rgba(255,255,255,.10); }
    .tool .ico { font-size: 16px; display: inline-flex; align-items: center; justify-content: center; height: 18px; } .tool .lbl { color: #97a0b5; }
    .ico svg { display: block; }
    .tool.active { background: #6cbba5; } .tool.active .lbl { color: #fff; }
    .tool.toggled { background: rgba(108,187,165,.28); outline: 1.5px solid #6cbba5; }
    .tool.recording { background: rgba(193,103,127,.30); outline: 1.5px solid #c1677f; }
    .tool.recording .ico, .tool.recording .lbl { color: #c1677f; }
    .colors { display: grid; grid-template-columns: repeat(4,1fr); gap: 4px; padding: 2px; }
    .swatch { width: 14px; height: 14px; border-radius: 50%; border: 2px solid transparent; cursor: pointer; }
    .swatch.active { border-color: #fff; box-shadow: 0 0 0 1.5px rgba(0,0,0,.4); }

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
    .reopen { position: fixed; left: 0; top: 50%; transform: translateY(-50%); writing-mode: vertical-rl; background: rgba(3,40,65,.94); color: #e8ecf4; border: 1px solid rgba(255,255,255,.08); border-left: none; border-radius: 0 11px 11px 0; padding: 15px 7px; cursor: pointer; font-size: 12px; box-shadow: 0 10px 30px rgba(0,0,0,.35); }

    .badge { bottom: 18px; left: 50%; transform: translateX(-50%); background: rgba(3,40,65,.94); color: #fff; padding: 7px 15px; border-radius: 999px; font-size: 13px; box-shadow: 0 10px 30px rgba(0,0,0,.35); pointer-events: none; }
    .badge .dotc { display: inline-block; width: 9px; height: 9px; border-radius: 50%; margin-right: 7px; vertical-align: middle; }
    .toast { bottom: 64px; left: 50%; transform: translateX(-50%) translateY(8px); background: #1b2130; color: #fff; padding: 10px 18px; border-radius: 11px; font-size: 13px; opacity: 0; transition: opacity .2s, transform .2s; pointer-events: none; }
    .toast.show { opacity: 1; transform: translateX(-50%) translateY(0); }
    .hint { bottom: 20px; left: 50%; transform: translateX(-50%); background: #6cbba5; color: #fff; padding: 8px 16px; border-radius: 999px; font-size: 13px; pointer-events: none; }
    .ef-dock.dock-bottom-right { left: auto; right: 16px; bottom: 16px; top: auto; }
    .ef-dock.dock-top-left { top: 16px; left: 16px; bottom: auto; right: auto; }
    .ef-dock.dock-top-right { top: 16px; right: 16px; bottom: auto; left: auto; }
    .ef-dock { position: fixed; left: 16px; bottom: 16px; display: flex; gap: 6px; padding: 6px; background: rgba(3,40,65,.94); border: 1px solid rgba(255,255,255,.08); border-radius: 14px; box-shadow: 0 10px 30px rgba(0,0,0,.35); backdrop-filter: blur(14px); pointer-events: auto; }
    .dock-btn { display: flex; align-items: center; gap: 6px; border: none; cursor: pointer; background: rgba(255,255,255,.06); color: #e8ecf4; padding: 8px 12px; border-radius: 10px; font-size: 12px; line-height: 1; }
    .dock-btn:hover { background: rgba(255,255,255,.14); }
    #dock-power.on { background: #6cbba5; color: #06251c; font-weight: 700; }
    #dock-bars.on { background: #917d44; color: #fff; font-weight: 700; }
    .ef-text { position: fixed; transform: translateY(-4px); z-index: 10; pointer-events: auto; border: none; border-bottom: 2px solid currentColor; background: rgba(255,255,255,.92); font-weight: 700; padding: 2px 6px; border-radius: 4px; min-width: 120px; outline: none; }
    .tool-options { position: fixed; right: 92px; top: 50%; transform: translateY(-50%); background: rgba(3,40,65,.94); color: #e8ecf4; border-radius: 14px; padding: 13px; width: 168px; max-height: 88vh; overflow-y: auto; box-shadow: 0 10px 30px rgba(0,0,0,.35); border: 1px solid rgba(255,255,255,.08); backdrop-filter: blur(14px); display: flex; flex-direction: column; gap: 11px; pointer-events: auto; }
    .to-group { display: flex; flex-direction: column; gap: 5px; }
    .to-title { font-size: 10.5px; color: #9fc6bb; }
    .to-btns { display: flex; flex-wrap: wrap; gap: 5px; }
    .to-btn { display: inline-flex; align-items: center; gap: 4px; border: 1px solid rgba(255,255,255,.14); background: rgba(255,255,255,.05); color: #e8ecf4; border-radius: 8px; padding: 5px 8px; font-size: 11px; cursor: pointer; line-height: 1; }
    .to-btn:hover { background: rgba(255,255,255,.12); }
    .to-btn.on { background: #6cbba5; border-color: #6cbba5; color: #06251c; font-weight: 700; }
    .tb-tools { display: flex; flex-direction: column; gap: 2px; }
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
    ["action", "record", "⏺", "録画"],
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
    <canvas id="annot" class="layer"></canvas>
    <canvas id="spot" class="layer"></canvas>
    <div id="ring" class="ring" hidden><i class="cdot"></i><svg class="carrow" viewBox="0 0 24 24"><path d="M3 2 L3 21 L8 16 L11.5 23.5 L14.5 22 L11 15 L18 15 Z" stroke="#fff" stroke-width="1.1" stroke-linejoin="round"></path></svg></div>
    <div id="tb" class="toolbar app-off">${buildToolbar()}</div>
    <div id="tool-options" class="tool-options" hidden></div>
    <div id="badge" class="badge" hidden></div>
    <div id="toast" class="toast" hidden></div>
    <div id="ef-dock" class="ef-dock" hidden>
      <button class="dock-btn on" id="dock-power" title="ポインターモード ON/OFF (⌘⇧E)"><span class="ico">${(EF.iconSvg && EF.iconSvg("power", 16)) || "⏻"}</span><span class="lbl">ポインターON</span></button>
      <button class="dock-btn" id="dock-bars" title="バーの表示/非表示 (⌘⇧H)"><span class="ico">${(EF.iconSvg && EF.iconSvg("bars", 16)) || "▤"}</span><span class="lbl">バー隠す</span></button>
    </div>
  `;

  const $ = (sel) => root.querySelector(sel);
  const annot = $("#annot"), spot = $("#spot"), ring = $("#ring");
  const tb = $("#tb");
  const badgeEl = $("#badge"), toastEl = $("#toast"), optEl = $("#tool-options"), dockEl = $("#ef-dock");

  // ---------- ユーティリティ ----------
  let toastT;
  function toast(msg, ms) {
    toastEl.textContent = msg; toastEl.hidden = false;
    requestAnimationFrame(() => toastEl.classList.add("show"));
    clearTimeout(toastT);
    toastT = setTimeout(() => { toastEl.classList.remove("show"); setTimeout(() => (toastEl.hidden = true), 220); }, ms || 1600);
  }
  function setBadge() {
    if (!state.appOn) { badgeEl.hidden = true; return; }
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
  function canvasInteractive() {
    const on = state.appOn && !state.zoom && DRAW_TOOLS.indexOf(state.tool) !== -1;
    annot.classList.toggle("live", !!on);
    annot.classList.toggle("tool-cursor", false);
  }
  window.addEventListener("mousemove", (ev) => {
    state.mouse = { x: ev.clientX, y: ev.clientY };
    updateRing();
    if (state.zoom) applyZoom();
    if (drawing) engine.move(ev.clientX, ev.clientY);
  }, true);
  annot.addEventListener("mousedown", (ev) => {
    if (!state.appOn || ev.button !== 0) return;
    if (state.zoom) return;
    if (state.tool === "text") { ev.preventDefault(); showTextInput(ev.clientX, ev.clientY, engine.hitText(ev.clientX, ev.clientY)); return; }
    if (DRAW_TOOLS.indexOf(state.tool) === -1) return;
    drawing = true; engine.start(ev.clientX, ev.clientY); ev.preventDefault();
  });
  window.addEventListener("mouseup", () => { if (drawing) { drawing = false; engine.end(); } }, true);
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
      if (e.key === "Enter") close(true);
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
    // Meet/Slides 等のボタンと被らないよう、上下に余白を確保して早めにコンパクト化（アイコンのみ）
    if (tb.scrollHeight > window.innerHeight - 168) tb.classList.add("compact");
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

  // 設定の永続化（chrome.storage.local）
  const PERSIST = ["color", "strokeWidth", "ring", "cursorStyle", "arrowHead",
    "spotShape", "spotBand", "spotDim", "zoomScale", "textSize", "textBold", "textColor",
    "toolOrder", "toolHidden", "barSide", "dockPos"];
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
    dockEl.hidden = !state.appOn;
    const bars = root.getElementById("dock-bars");
    bars.classList.toggle("on", state.uiHidden);
    bars.querySelector(".lbl").textContent = state.uiHidden ? "バー表示" : "バー隠す";
  }

  function renderOptions() {
    if (!state.optionsOpen) { optEl.hidden = true; return; }
    const groups = [];
    // 共通設定（常に表示）
    groups.push(optGroup("線の太さ", "strokeWidth", state.strokeWidth, [[4, "", "細"], [6, "", "中"], [10, "", "太"]]));
    groups.push(optGroup("ズーム倍率", "zoomScale", state.zoomScale, [[1.5, "", "×1.5"], [2, "", "×2"], [3, "", "×3"]]));
    groups.push(optGroup("クリック波紋", "ripple", state.ring.ripple ? "on" : "off", [["on", "", "ON"], ["off", "", "OFF"]]));
    groups.push(optGroup("注目の濃さ", "spotDim", state.spotDim, [[0.55, "", "薄"], [0.72, "", "標準"], [0.88, "", "濃"]]));
    groups.push(optGroup("ツールバー位置", "barSide", state.barSide, [["left", "", "左"], ["right", "", "右"]]));
    groups.push(optGroup("ドック位置", "dockPos", state.dockPos, [["bottom-left", "", "左下"], ["bottom-right", "", "右下"], ["top-left", "", "左上"], ["top-right", "", "右上"]]));
    if (state.appOn && state.tool === "cursor") {
      groups.push(optGroup("カーソル", "cursorStyle", state.cursorStyle, [["ring", "◎", "リング"], ["arrow", "➤", "矢印"], ["dot", "●", "ドット"], ["ringdot", "◉", "両方"], ["halo", "✦", "ハロー"]]));
      groups.push(optGroup("大きさ", "ringSize", state.ring.size, [[28, "", "極小"], [44, "", "小"], [60, "", "中"]]));
    } else if (state.appOn && state.tool === "arrow")
      groups.push(optGroup("矢じり", "arrowHead", state.arrowHead, [["end", "→", "終点"], ["start", "←", "始点"], ["both", "↔", "両方"]]));
    if (state.appOn && state.spotlight) {
      groups.push(optGroup("注目の形", "spotShape", state.spotShape, [["band", "▭", "帯"], ["circle", "◯", "丸"]]));
      if (state.spotShape === "band")
        groups.push(optGroup("帯の高さ", "spotBand", state.spotBand, [[0.25, "", "25%"], [0.5, "", "50%"], [0.75, "", "75%"]]));
    }
    // ツールバー編集（並べ替え・表示/非表示）
    groups.push(toolbarGroup());
    if (!groups.length) { optEl.hidden = true; return; }
    optEl.innerHTML = groups.join(""); optEl.hidden = false;
  }

  function updateRing() {
    if (!state.appOn) { ring.hidden = true; return; }
    const r = state.ring, color = state.color, style = state.cursorStyle || "ring";
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
        const bandH = Math.max(60, H * (state.spotBand || 0.5));
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
    dockEl.classList.remove("dock-bottom-right", "dock-top-left", "dock-top-right");
    if (state.dockPos && state.dockPos !== "bottom-left") dockEl.classList.add("dock-" + state.dockPos);
    if (state.appOn && !state.uiHidden) reserveGutter(true);
    fitToolbar();
  }

  // ---------- ズーム（ページ本体を拡大・表示専用） ----------
  function applyZoom() {
    const b = document.body; if (!b) return;
    if (!state.zoom) { b.style.transform = ""; b.style.transformOrigin = ""; return; }
    const ox = window.scrollX + state.mouse.x, oy = window.scrollY + state.mouse.y;
    b.style.transformOrigin = ox + "px " + oy + "px";
    b.style.transform = "scale(" + state.zoomScale + ")";
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

  // ---------- コマンド ----------
  const app = {
    setTool(t) {
      if (!state.appOn) app.toggle(true);
      state.tool = t; syncUI(); renderOptions(); setBadge();
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
      else if (name === "clear") { engine.clear(); toast("注釈を全消去しました"); }
      else if (name === "screenshot") app.screenshot();
      else if (name === "record") app.toggleRecord();
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
      reserveGutter(!state.uiHidden);
      updateDock();
      toast(state.uiHidden ? "バーを非表示（右下のドックで再表示）" : "バーを表示");
    },
    toggle(forceOn) {
      const next = forceOn === true ? true : !state.appOn;
      state.appOn = next;
      if (!next) {
        state.spotlight = false; state.zoom = false; applyZoom();
        state.uiHidden = false; host.classList.remove("ui-hidden");
        state.optionsOpen = false;
        const ob = root.getElementById("btn-options"); if (ob) ob.classList.remove("toggled");
        reserveGutter(false);
        toast("Enmish Pointer を終了");
      } else {
        reserveGutter(true);
        if (!onboarded) {
          onboarded = true;
          toast("ツールを選んでドラッグで注釈 ／ 左下ドックでON/OFF・バー表示 ／ ⚙設定で詳細", 4600);
        } else {
          toast("Enmish Pointer 起動 — カーソル強調中");
        }
      }
      updateRing(); syncUI(); renderOptions(); updateDock(); setBadge();
    },
    handleEscape() {
      if (state.uiHidden) { app.toggleUI(); return true; }
      if (state.zoom) { state.zoom = false; applyZoom(); syncUI(); setBadge(); return true; }
      if (state.spotlight) { state.spotlight = false; syncUI(); setBadge(); return true; }
      if (state.appOn && state.tool !== "cursor") { app.setTool("cursor"); return true; }
      return false;
    },
    screenshot() {
      const d = new Date(), p = (n) => String(n).padStart(2, "0");
      // chrome.downloads はスペースや一部記号を弾くため安全な文字へ寄せる
      const title = (document.title || "画面")
        .replace(/[\s\\/:*?"<>|.~#%&{}$!'@+`=,;()\[\]]+/g, "_")
        .replace(/_+/g, "_").replace(/^_+|_+$/g, "")
        .slice(0, 30).replace(/_+$/, "") || "画面";
      const fn = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}_${title}_注釈.png`;
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
        stream = await navigator.mediaDevices.getDisplayMedia({ video: { frameRate: 30 }, audio: true });
      } catch (err) {
        toast("画面録画を開始できませんでした（権限が許可されていない可能性があります）", 2800);
        return;
      }
      let rec;
      try {
        const opt = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? { mimeType: "video/webm;codecs=vp9" } : { mimeType: "video/webm" };
        rec = new MediaRecorder(stream, opt);
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        toast("録画の初期化に失敗しました", 2600);
        return;
      }
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunks, { type: "video/webm" });
        const d = new Date(), p = (n) => String(n).padStart(2, "0");
        const fn = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}_画面録画.webm`;
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url; a.download = fn;
        document.body.appendChild(a); a.click(); a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 4000);
        recorder = null;
        state.recording = false;
        app._syncRecordBtn();
        toast("録画を保存しました: " + fn, 2600);
      };
      const vt = stream.getVideoTracks()[0];
      if (vt) vt.onended = () => { if (state.recording) app._stopRecord(); };
      recorder = rec;
      state.recording = true;
      app._syncRecordBtn();
      rec.start();
      toast("画面録画を開始しました（もう一度押すと停止）", 2600);
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
  root.getElementById("dock-bars").addEventListener("click", () => app.toggleUI());

  optEl.addEventListener("click", (e) => {
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
  window.addEventListener("keydown", (ev) => {
    const ae = document.activeElement;
    const typing = ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName) || (ae && ae.isContentEditable);
    const mod = ev.metaKey || ev.ctrlKey, code = ev.code;

    if (ev.key === "Escape") { if (app.handleEscape()) ev.preventDefault(); return; }

    if (mod && ev.shiftKey) {
      if (code === "KeyE") { ev.preventDefault(); app.toggle(); return; }
      if (!state.appOn) return;
      const map = { Digit1: "pen", Digit2: "arrow", Digit3: "ellipse", Digit4: "rect" };
      if (map[code]) { ev.preventDefault(); app.setTool(map[code]); return; }
      if (code === "Digit5") { ev.preventDefault(); app.toggleMode("spotlight"); return; }
      if (code === "Digit6") { ev.preventDefault(); app.toggleMode("zoom"); return; }
      if (code === "KeyH") { ev.preventDefault(); app.toggleUI(); return; }
      if (ev.key === "Backspace" || ev.key === "Delete") { ev.preventDefault(); app.action("clear"); return; }
      return;
    }

    if (!state.appOn || typing) return;

    if ((ev.key === "Backspace" || ev.key === "Delete") && !mod) { ev.preventDefault(); engine.undo(); toast("1つ戻しました"); return; }
    if (state.spotlight && (ev.key === "[" || ev.key === "]")) {
      if (state.spotShape === "band") {
        const opts = [0.25, 0.5, 0.75]; const i = opts.indexOf(state.spotBand);
        state.spotBand = opts[Math.min(2, Math.max(0, (i < 0 ? 1 : i) + (ev.key === "[" ? -1 : 1)))];
        renderOptions();
      } else { spotRadius = Math.max(60, Math.min(380, spotRadius + (ev.key === "[" ? -25 : 25))); }
      ev.preventDefault(); return;
    }
    if (state.zoom && (ev.key === "-" || ev.key === "=" || ev.key === "+")) { state.zoomScale = Math.max(1.4, Math.min(4, state.zoomScale + (ev.key === "-" ? -0.2 : 0.2))); applyZoom(); setBadge(); ev.preventDefault(); return; }
  }, true);

  // background からの ON/OFF
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "ef-toggle") app.toggle();
  });

  syncUI();
  renderOptions();
  updateDock();
  fitToolbar();
  window.addEventListener("resize", fitToolbar, true);

  // Google スライド等の「全画面プレゼン」では、特定要素だけが全画面表示になり
  // documentElement 直下のオーバーレイは隠れてしまう。全画面要素の中へ host を移動して追従させる。
  function followFullscreen() {
    const fs = document.fullscreenElement || document.webkitFullscreenElement;
    const parent = fs || document.documentElement || document.body;
    if (host.parentNode !== parent) parent.appendChild(host); // 末尾へ移動＝最前面を維持
    fitToolbar();
  }
  document.addEventListener("fullscreenchange", followFullscreen, true);
  document.addEventListener("webkitfullscreenchange", followFullscreen, true);

  loadSettings(() => { updateRing(); rebuildTools(); renderOptions(); applyLayout(); }); // 保存済み設定を反映（ツール群も再生成・配置も）
})();

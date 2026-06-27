/* ============================================================
   Enmish Focus — content script
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
  const PALETTE = [
    "#6cbba5", "#31594e", "#032841", "#917d44",
    "#c1677f", "#8df1d5", "#ffffff", "#5b6478",
  ];
  const SALES_TEMPLATES = [
    ["要確認", "#917d44"], ["宿題", "#c1677f"], ["次回まで", "#6cbba5"],
    ["論点", "#032841"], ["懸念", "#c1677f"], ["決裁者", "#31594e"],
    ["金額", "#6cbba5"], ["優先度高", "#c1677f"], ["未対応", "#5b6478"],
    ["ボトルネック", "#917d44"],
  ];
  const KPI_MARKERS = [
    ["目標未達", "#c1677f"], ["改善余地", "#917d44"], ["要因確認", "#032841"],
    ["施策候補", "#6cbba5"], ["勝ち筋", "#31594e"], ["歩留低下", "#c1677f"],
    ["次アクション", "#6cbba5"],
  ];
  const PRESETS = {
    proposal: { name: "商談", color: "#6cbba5", strokeWidth: 6, ring: { width: 6, size: 64, opacity: 0.9, ripple: true }, autoErase: 5 },
    review: { name: "社内", color: "#032841", strokeWidth: 4, ring: { width: 4, size: 40, opacity: 0.55, ripple: false }, autoErase: 0 },
    record: { name: "録画", color: "#917d44", strokeWidth: 7, ring: { width: 8, size: 78, opacity: 1, ripple: true }, autoErase: 0 },
    demo: { name: "デモ", color: "#31594e", strokeWidth: 5, ring: { width: 6, size: 56, opacity: 0.85, ripple: true }, autoErase: 3 },
  };
  const DRAW_TOOLS = ["pen", "highlighter", "arrow", "hline", "ellipse", "rect", "text"];
  const TOOL_NAMES = {
    cursor: "カーソル強調", pen: "ペン", highlighter: "蛍光ペン", arrow: "矢印",
    hline: "横線", ellipse: "丸囲み", rect: "四角囲み", text: "テキスト",
  };

  const state = {
    appOn: false, tool: "cursor", color: "#6cbba5", strokeWidth: 6,
    ring: { width: 6, size: 64, opacity: 0.9, ripple: true },
    autoErase: 0, spotlight: false, zoom: false, zoomScale: 2.0,
    preset: "proposal", armedStamp: null,
    mouse: { x: -999, y: -999 },
  };

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
    .ripple { position: fixed; border-radius: 50%; transform: translate(-50%,-50%); border: 3px solid #6cbba5; pointer-events: none; animation: rip .55s ease-out forwards; }
    @keyframes rip { from { width: 8px; height: 8px; opacity: .85; } to { width: 90px; height: 90px; opacity: 0; } }

    --tb-bg: rgba(3,40,65,.94);
    .toolbar, .stamp-bar, .reopen, .badge, .toast, .hint { pointer-events: auto; }
    .toolbar {
      position: fixed; top: 50%; right: 0; transform: translateY(-50%);
      background: rgba(3,40,65,.94); color: #e8ecf4; border-radius: 16px 0 0 16px;
      box-shadow: 0 10px 30px rgba(0,0,0,.35); backdrop-filter: blur(14px);
      padding: 9px 7px; border: 1px solid rgba(255,255,255,.08); border-right: none; width: 76px;
      display: flex; flex-direction: column; gap: 2px; max-height: 94vh; overflow-y: auto;
    }
    .toolbar.app-off .tool[data-tool], .toolbar.app-off .tool[data-toggle],
    .toolbar.app-off .tool[data-action="whiteboard"], .toolbar.app-off .colors { opacity: .35; pointer-events: none; }
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
    .tool .ico { font-size: 16px; } .tool .lbl { color: #97a0b5; }
    .tool.active { background: #6cbba5; } .tool.active .lbl { color: #fff; }
    .tool.toggled { background: rgba(108,187,165,.28); outline: 1.5px solid #6cbba5; }
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
    [hidden] { display: none !important; }
  `;

  const TOOL_BTNS = [
    ["tool", "cursor", "◎", "カーソル"],
    ["sep"],
    ["tool", "pen", "✎", "ペン"],
    ["tool", "highlighter", "▰", "蛍光"],
    ["tool", "arrow", "↗", "矢印"],
    ["tool", "hline", "—", "横線"],
    ["tool", "ellipse", "◯", "丸"],
    ["tool", "rect", "▢", "四角"],
    ["tool", "text", "T", "文字"],
    ["sep"],
    ["toggle", "spotlight", "☀", "注目"],
    ["toggle", "zoom", "🔍", "ズーム"],
    ["sep"],
    ["colors"],
    ["sep"],
    ["action", "undo", "↶", "戻る"],
    ["action", "clear", "🗑", "全消去"],
    ["action", "screenshot", "📷", "保存"],
  ];

  function buildToolbar() {
    let html = '<div class="brand"><span class="ef-mark"></span><span class="ef-word">enmish</span><span class="ef-tag">FOCUS</span></div>';
    for (const b of TOOL_BTNS) {
      if (b[0] === "sep") { html += '<div class="sep"></div>'; continue; }
      if (b[0] === "colors") { html += '<div class="colors" id="colors"></div>'; continue; }
      const attr = b[0] === "tool" ? `data-tool="${b[1]}"` : b[0] === "toggle" ? `data-toggle="${b[1]}"` : `data-action="${b[1]}"`;
      const id = b[1] === "spotlight" ? 'id="btn-spot"' : b[1] === "zoom" ? 'id="btn-zoom"' : "";
      html += `<button class="tool" ${attr} ${id}><span class="ico">${b[2]}</span><span class="lbl">${b[3]}</span></button>`;
    }
    return html;
  }

  function chipHtml(items) {
    return items.map((it) => `<button class="chip" data-label="${it[0]}" data-color="${it[1]}" style="background:${it[1]}">${it[0]}</button>`).join("");
  }

  root.innerHTML = `
    <style>${CSS}</style>
    <canvas id="annot" class="layer"></canvas>
    <canvas id="spot" class="layer"></canvas>
    <div id="ring" class="ring" hidden></div>
    <div id="tb" class="toolbar app-off">${buildToolbar()}</div>
    <div id="sb" class="stamp-bar">
      <button class="sb-hide" id="sb-hide" title="このバーを隠す">✕</button>
      <div class="sb-title">営業テンプレ</div>
      <div class="chips" id="chips-sales">${chipHtml(SALES_TEMPLATES)}</div>
      <div class="sb-title">KPIマーカー</div>
      <div class="chips" id="chips-kpi">${chipHtml(KPI_MARKERS)}</div>
    </div>
    <button id="reopen" class="reopen" hidden title="営業テンプレを表示">営業テンプレ ▸</button>
    <div id="badge" class="badge" hidden></div>
    <div id="toast" class="toast" hidden></div>
    <div id="hint" class="hint" hidden>クリックした位置にラベルを配置（Escで取消）</div>
  `;

  const $ = (sel) => root.querySelector(sel);
  const annot = $("#annot"), spot = $("#spot"), ring = $("#ring");
  const tb = $("#tb"), sb = $("#sb"), reopen = $("#reopen");
  const badgeEl = $("#badge"), toastEl = $("#toast"), hintEl = $("#hint");

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
    getStyle: () => ({ tool: state.tool, color: state.color, width: state.strokeWidth }),
    getAutoErase: () => state.autoErase,
  });
  window.addEventListener("resize", () => { engine.resize(); sizeSpot(); });

  // ---------- カーソルリング & 描画入力 ----------
  let drawing = false;
  function canvasInteractive() {
    const on = state.appOn && !state.zoom && (DRAW_TOOLS.indexOf(state.tool) !== -1 || state.armedStamp);
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
    if (state.armedStamp) { engine.addStamp(ev.clientX, ev.clientY, state.armedStamp[0], state.armedStamp[1]); disarmStamp(); return; }
    if (state.zoom || DRAW_TOOLS.indexOf(state.tool) === -1) return;
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

  function updateRing() {
    if (!state.appOn) { ring.hidden = true; return; }
    const r = state.ring;
    ring.hidden = false;
    ring.style.width = r.size + "px"; ring.style.height = r.size + "px";
    ring.style.left = state.mouse.x + "px"; ring.style.top = state.mouse.y + "px";
    ring.style.borderWidth = r.width + "px"; ring.style.borderColor = state.color; ring.style.opacity = r.opacity;
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
      sctx.fillStyle = "rgba(8,10,16,0.72)";
      sctx.fillRect(0, 0, window.innerWidth, window.innerHeight);
      const m = state.mouse;
      sctx.save();
      sctx.globalCompositeOperation = "destination-out";
      const g = sctx.createRadialGradient(m.x, m.y, spotRadius * 0.55, m.x, m.y, spotRadius);
      g.addColorStop(0, "rgba(0,0,0,1)"); g.addColorStop(1, "rgba(0,0,0,0)");
      sctx.fillStyle = g; sctx.beginPath(); sctx.arc(m.x, m.y, spotRadius, 0, Math.PI * 2); sctx.fill();
      sctx.restore();
    }
    requestAnimationFrame(renderSpot);
  }
  sizeSpot(); renderSpot();

  // ---------- 右端レーン（ツールバーがページ本体に被らないよう余白を確保） ----------
  const GUTTER = 86;
  function reserveGutter(on) {
    const el = document.documentElement;
    if (on) el.style.setProperty("margin-right", GUTTER + "px", "important");
    else el.style.removeProperty("margin-right");
  }

  // ---------- ズーム（ページ本体を拡大・表示専用） ----------
  function applyZoom() {
    const b = document.body; if (!b) return;
    if (!state.zoom) { b.style.transform = ""; b.style.transformOrigin = ""; return; }
    const ox = window.scrollX + state.mouse.x, oy = window.scrollY + state.mouse.y;
    b.style.transformOrigin = ox + "px " + oy + "px";
    b.style.transform = "scale(" + state.zoomScale + ")";
  }

  // ---------- スタンプ ----------
  function armStamp(label, color, el) {
    if (!state.appOn) { toast("先に Enmish Focus を起動（⌘⇧E）"); return; }
    root.querySelectorAll(".chip.armed").forEach((c) => c.classList.remove("armed"));
    if (state.armedStamp && state.armedStamp[0] === label) { disarmStamp(); return; }
    state.armedStamp = [label, color];
    if (el) el.classList.add("armed");
    hintEl.hidden = false; canvasInteractive();
  }
  function disarmStamp() {
    state.armedStamp = null;
    root.querySelectorAll(".chip.armed").forEach((c) => c.classList.remove("armed"));
    hintEl.hidden = true; canvasInteractive();
  }

  // ---------- プリセット ----------
  function applyPreset(key) {
    const p = PRESETS[key]; if (!p) return;
    state.preset = key; state.color = p.color; state.strokeWidth = p.strokeWidth;
    state.ring = Object.assign({}, p.ring); state.autoErase = p.autoErase;
    syncUI(); updateRing(); setBadge();
    toast("プリセット: " + p.name);
  }

  // ---------- UI 同期 ----------
  function syncUI() {
    tb.classList.toggle("app-off", !state.appOn);
    tb.querySelectorAll("[data-tool]").forEach((b) => b.classList.toggle("active", state.appOn && b.dataset.tool === state.tool));
    $("#btn-spot").classList.toggle("toggled", state.spotlight);
    $("#btn-zoom").classList.toggle("toggled", state.zoom);
    root.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s.dataset.color === state.color));
    sb.style.opacity = state.appOn ? "1" : ".4";
    canvasInteractive();
  }

  // ---------- コマンド ----------
  const app = {
    setTool(t) {
      if (!state.appOn) app.toggle(true);
      state.tool = t; disarmStamp(); syncUI(); setBadge();
    },
    setColor(c) { state.color = c; syncUI(); updateRing(); setBadge(); },
    toggleMode(what) {
      if (!state.appOn) app.toggle(true);
      if (what === "spotlight") { state.spotlight = !state.spotlight; toast(state.spotlight ? "スポットライト ON（[ ]で広さ）" : "スポットライト OFF"); }
      else if (what === "zoom") {
        state.zoom = !state.zoom; applyZoom();
        toast(state.zoom ? "ズーム ON（- =で倍率／表示専用）" : "ズーム OFF");
      }
      syncUI(); setBadge();
    },
    action(name) {
      if (name === "undo") engine.undo();
      else if (name === "clear") { engine.clear(); toast("注釈を全消去しました"); }
      else if (name === "screenshot") app.screenshot();
    },
    toggle(forceOn) {
      const next = forceOn === true ? true : !state.appOn;
      state.appOn = next;
      if (!next) {
        state.spotlight = false; state.zoom = false; applyZoom(); disarmStamp();
        reserveGutter(false);
        toast("Enmish Focus を終了");
      } else {
        reserveGutter(true);
        toast("Enmish Focus 起動 — カーソル強調中");
      }
      updateRing(); syncUI(); setBadge();
    },
    handleEscape() {
      if (state.armedStamp) { disarmStamp(); return true; }
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
      const hide = [tb, sb, reopen, badgeEl, hintEl, ring, toastEl];
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
  };

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

  sb.addEventListener("click", (e) => {
    const c = e.target.closest(".chip");
    if (c) { armStamp(c.dataset.label, c.dataset.color, c); return; }
    if (e.target.id === "sb-hide") { sb.classList.add("collapsed"); reopen.hidden = false; }
  });
  reopen.addEventListener("click", () => { sb.classList.remove("collapsed"); reopen.hidden = true; });

  // プリセット切替（ツールバー長押しは作らず、ショートカット ⌘⇧0 で循環）
  function cyclePreset() {
    const keys = Object.keys(PRESETS);
    const i = (keys.indexOf(state.preset) + 1) % keys.length;
    applyPreset(keys[i]);
  }

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
      if (code === "Digit0") { ev.preventDefault(); cyclePreset(); return; }
      if (ev.key === "Backspace" || ev.key === "Delete") { ev.preventDefault(); app.action("clear"); return; }
      return;
    }

    if (!state.appOn || typing) return;

    if ((ev.key === "Backspace" || ev.key === "Delete") && !mod) { ev.preventDefault(); engine.undo(); toast("1つ戻しました"); return; }
    if (state.spotlight && (ev.key === "[" || ev.key === "]")) { spotRadius = Math.max(60, Math.min(380, spotRadius + (ev.key === "[" ? -25 : 25))); ev.preventDefault(); return; }
    if (state.zoom && (ev.key === "-" || ev.key === "=" || ev.key === "+")) { state.zoomScale = Math.max(1.4, Math.min(4, state.zoomScale + (ev.key === "-" ? -0.2 : 0.2))); applyZoom(); setBadge(); ev.preventDefault(); return; }
  }, true);

  // background からの ON/OFF
  chrome.runtime.onMessage.addListener((msg) => {
    if (msg && msg.type === "ef-toggle") app.toggle();
  });

  syncUI();
})();

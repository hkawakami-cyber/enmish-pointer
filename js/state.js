/* ============================================================
   state.js — アプリ全体の状態と共有ヘルパー
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  // カラーパレット（Enmishブランド規定色のみ）
  // 波長順（長波長＝赤系 → 短波長＝青系、無彩色は末尾）
  EF.PALETTE = [
    { name: "rose", value: "#c1677f" },        // 赤系（長波長）
    { name: "gold", value: "#917d44" },        // 黄
    { name: "green-light", value: "#8df1d5" },
    { name: "green", value: "#6cbba5" },       // エンミッシュグリーン
    { name: "green-dark", value: "#31594e" },
    { name: "ink", value: "#032841" },         // 青（短波長）
    { name: "gray", value: "#5b6478" },
    { name: "white", value: "#ffffff" },       // 無彩色
  ];



  // 実行時状態
  EF.state = {
    appOn: false,        // アプリ起動状態
    tool: "cursor",      // 現在の注釈ツール: cursor|pen|highlighter|arrow|ellipse|rect|text
    color: "#6cbba5",
    strokeWidth: 6,
    textSize: 28,        // テキスト注釈の大きさ(px)
    textBold: true,      // テキスト注釈の太さ
    textColor: "#032841",// テキスト注釈の色
    ring: { width: 6, size: 64, opacity: 0.9, ripple: true },
    cursorStyle: "ring", // ring | dot | halo | ringdot | arrow
    arrowHead: "end",    // end | start | both
    showOptions: false,  // ツールオプションのフライアウトを画面に表示するか
    uiHidden: false,
    spotlight: false,
    spotShape: "band",   // band（横帯） | circle
    spotBand: 0.5,       // 帯の高さ（ビューポート比）
    spotDim: 0.72,       // スポットライトの暗さ（0〜1）
    zoom: false,
    zoomScale: 2.0,
    // ツールバーのカスタム（並べ替え・表示/非表示）
    toolOrder: ["rect", "highlighter", "arrow", "hline", "text", "pen", "cursor", "ellipse", "spotlight", "zoom"],
    toolHidden: {},
    // バーの配置
    barSide: "right",    // ツールバーの左右: right | left
    dockPos: "bottom-left", // ドック位置: bottom-left | bottom-right | top-left | top-right
    autoHide: true,      // 右端ホバーで自動表示（Mac のドック風）
    recording: false,
    mouse: { x: -999, y: -999, inStage: false },
  };

  // --- 共有ユーティリティ ---
  EF.toast = function (msg, ms) {
    const el = document.getElementById("toast");
    el.textContent = msg;
    el.hidden = false;
    requestAnimationFrame(() => el.classList.add("show"));
    clearTimeout(EF._toastT);
    EF._toastT = setTimeout(() => {
      el.classList.remove("show");
      setTimeout(() => (el.hidden = true), 220);
    }, ms || 1600);
  };

  EF.setStatus = function () {
    const el = document.getElementById("status-badge");
    // 現在のツールを示す中央下のバッジは非表示（ツールバーの緑ハイライトで判別できるため）
    if (el) el.hidden = true;
    return;
    /* eslint-disable no-unreachable */
    if (!EF.state.appOn) { el.hidden = true; return; }
    const names = {
      cursor: "カーソル強調", pen: "ペン", highlighter: "蛍光ペン",
      arrow: "矢印", hline: "横線", ellipse: "丸囲み", rect: "四角囲み", text: "テキスト",
    };
    const extras = [];
    if (EF.state.spotlight) extras.push("スポットライト");
    if (EF.state.zoom) extras.push(`ズーム×${EF.state.zoomScale.toFixed(1)}`);
    const label = names[EF.state.tool] || EF.state.tool;
    el.innerHTML = `<span class="dotc" style="background:${EF.state.color}"></span>` +
      label + (extras.length ? " ・ " + extras.join(" ・ ") : "");
    el.hidden = false;
  };

  // --- 設定の永続化（localStorage） ---
  const STORE_KEY = "enmishFocus.settings.v1";
  const PERSIST = ["color", "strokeWidth", "textSize", "textBold", "textColor", "ring", "cursorStyle", "arrowHead",
    "spotShape", "spotBand", "spotDim", "zoomScale", "showOptions", "toolOrder", "toolHidden", "barSide", "dockPos", "autoHide"];

  EF.saveSettings = function () {
    try {
      const obj = { palette: EF.PALETTE.map((c) => c.value) };
      PERSIST.forEach((k) => { obj[k] = EF.state[k]; });
      localStorage.setItem(STORE_KEY, JSON.stringify(obj));
    } catch (e) { /* sandbox等で不可なら黙ってスキップ */ }
  };

  EF.loadSettings = function () {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (!raw) return;
      const obj = JSON.parse(raw);
      if (Array.isArray(obj.palette)) {
        obj.palette.forEach((v, i) => { if (EF.PALETTE[i]) EF.PALETTE[i].value = v; });
      }
      PERSIST.forEach((k) => {
        if (obj[k] === undefined) return;
        if (k === "ring") EF.state.ring = Object.assign({}, EF.state.ring, obj.ring);
        else EF.state[k] = obj[k];
      });
    } catch (e) { /* noop */ }
  };

  EF.loadSettings(); // 起動時に保存済み設定を反映

  // ステージ座標へ正規化（mouseEvent → ステージ相対 px）
  EF.stagePoint = function (ev) {
    const stage = document.getElementById("stage");
    const r = stage.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  };

  // イベントバス（疎結合に各モジュールへ通知）
  const listeners = {};
  EF.on = function (ev, fn) { (listeners[ev] = listeners[ev] || []).push(fn); };
  EF.emit = function (ev, data) { (listeners[ev] || []).forEach((fn) => fn(data)); };
})();

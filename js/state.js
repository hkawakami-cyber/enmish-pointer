/* ============================================================
   state.js — アプリ全体の状態と共有ヘルパー
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  // カラーパレット（商談で安っぽく見えない配色）
  EF.PALETTE = [
    { name: "blue", value: "#2f6bff" },
    { name: "red", value: "#ff3b4e" },
    { name: "green", value: "#18b56a" },
    { name: "amber", value: "#ffb020" },
    { name: "purple", value: "#8b5cf6" },
    { name: "ink", value: "#1c2230" },
    { name: "white", value: "#ffffff" },
    { name: "pink", value: "#ff5fa2" },
  ];

  // 営業テンプレ注釈（ワンクリックでステージに配置）
  EF.SALES_TEMPLATES = [
    { label: "要確認", color: "#ffb020" },
    { label: "宿題", color: "#ff3b4e" },
    { label: "次回まで", color: "#2f6bff" },
    { label: "論点", color: "#8b5cf6" },
    { label: "懸念", color: "#ff5fa2" },
    { label: "決裁者", color: "#18b56a" },
    { label: "金額", color: "#0ea5b7" },
    { label: "優先度高", color: "#ff3b4e" },
    { label: "未対応", color: "#6b7488" },
    { label: "ボトルネック", color: "#e0531f" },
  ];

  EF.KPI_MARKERS = [
    { label: "目標未達", color: "#ff3b4e" },
    { label: "改善余地", color: "#ffb020" },
    { label: "要因確認", color: "#8b5cf6" },
    { label: "施策候補", color: "#2f6bff" },
    { label: "勝ち筋", color: "#18b56a" },
    { label: "歩留低下", color: "#e0531f" },
    { label: "次アクション", color: "#0ea5b7" },
  ];

  // プリセット定義
  EF.PRESETS = {
    proposal: {
      name: "商談モード",
      desc: "顧客向け提案。カーソル大きめ、赤・青中心、自動消去5秒。",
      color: "#2f6bff",
      strokeWidth: 6,
      ring: { width: 6, size: 64, opacity: 0.9, ripple: true },
      autoErase: 5,
    },
    review: {
      name: "社内レビュー",
      desc: "KPI・資料レビュー。薄め表示で邪魔にならない。残す設定。",
      color: "#8b5cf6",
      strokeWidth: 4,
      ring: { width: 4, size: 40, opacity: 0.55, ripple: false },
      autoErase: 0,
    },
    record: {
      name: "録画モード",
      desc: "マニュアル・研修動画。カーソル大きめ、クリック波紋あり。",
      color: "#ff3b4e",
      strokeWidth: 7,
      ring: { width: 8, size: 78, opacity: 1.0, ripple: true },
      autoErase: 0,
    },
    whiteboard: {
      name: "ホワイトボード",
      desc: "図解・壁打ち。太めペン、ホワイトボードを自動で開く。",
      color: "#1c2230",
      strokeWidth: 8,
      ring: { width: 5, size: 48, opacity: 0.7, ripple: false },
      autoErase: 0,
      openWhiteboard: true,
    },
    demo: {
      name: "デモモード",
      desc: "SaaS画面説明。スポットライト・ズーム優先、青系。",
      color: "#2f6bff",
      strokeWidth: 5,
      ring: { width: 6, size: 56, opacity: 0.85, ripple: true },
      autoErase: 3,
    },
  };

  // 実行時状態
  EF.state = {
    appOn: false,        // アプリ起動状態
    tool: "cursor",      // 現在の注釈ツール: cursor|pen|highlighter|arrow|ellipse|rect|text
    color: "#2f6bff",
    strokeWidth: 6,
    ring: { width: 6, size: 64, opacity: 0.9, ripple: true },
    autoErase: 0,        // 秒（0で残す）
    spotlight: false,
    zoom: false,
    zoomScale: 2.2,
    preset: "proposal",
    armedStamp: null,    // 配置待ちの営業テンプレ {label,color}
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

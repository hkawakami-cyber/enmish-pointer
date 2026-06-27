/* ============================================================
   state.js — アプリ全体の状態と共有ヘルパー
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  // カラーパレット（Enmishブランド規定色のみ）
  EF.PALETTE = [
    { name: "green", value: "#6cbba5" },       // エンミッシュグリーン
    { name: "green-dark", value: "#31594e" },
    { name: "ink", value: "#032841" },         // エンミッシュブラック
    { name: "gold", value: "#917d44" },        // 強調
    { name: "rose", value: "#c1677f" },        // 警告
    { name: "green-light", value: "#8df1d5" },
    { name: "white", value: "#ffffff" },
    { name: "gray", value: "#5b6478" },
  ];

  // 営業テンプレ注釈（ブランド色: グリーン/ブラック/Gold/Rose/Gray のみ）
  EF.SALES_TEMPLATES = [
    { label: "要確認", color: "#917d44" },
    { label: "宿題", color: "#c1677f" },
    { label: "次回まで", color: "#6cbba5" },
    { label: "論点", color: "#032841" },
    { label: "懸念", color: "#c1677f" },
    { label: "決裁者", color: "#31594e" },
    { label: "金額", color: "#6cbba5" },
    { label: "優先度高", color: "#c1677f" },
    { label: "未対応", color: "#5b6478" },
    { label: "ボトルネック", color: "#917d44" },
  ];

  EF.KPI_MARKERS = [
    { label: "目標未達", color: "#c1677f" },
    { label: "改善余地", color: "#917d44" },
    { label: "要因確認", color: "#032841" },
    { label: "施策候補", color: "#6cbba5" },
    { label: "勝ち筋", color: "#31594e" },
    { label: "歩留低下", color: "#c1677f" },
    { label: "次アクション", color: "#6cbba5" },
  ];

  // プリセット定義
  EF.PRESETS = {
    proposal: {
      name: "商談モード",
      desc: "顧客向け提案。グリーン中心・リングカーソル中・自動消去5秒。",
      color: "#6cbba5",
      strokeWidth: 6,
      ring: { width: 6, size: 60, opacity: 0.9, ripple: true },
      cursorStyle: "ring",
      autoErase: 5,
    },
    review: {
      name: "社内レビュー",
      desc: "KPI・資料レビュー。ブラックで薄め・ドット小・残す設定。",
      color: "#032841",
      strokeWidth: 4,
      ring: { width: 4, size: 44, opacity: 0.55, ripple: false },
      cursorStyle: "dot",
      autoErase: 0,
    },
    record: {
      name: "録画モード",
      desc: "マニュアル・研修動画。Gold強調・矢印カーソル大・波紋あり。",
      color: "#917d44",
      strokeWidth: 7,
      ring: { width: 8, size: 60, opacity: 1.0, ripple: true },
      cursorStyle: "arrow",
      autoErase: 0,
    },
    demo: {
      name: "デモモード",
      desc: "SaaS画面説明。スポットライト・ズーム優先・ハローカーソル。",
      color: "#31594e",
      strokeWidth: 5,
      ring: { width: 6, size: 44, opacity: 0.85, ripple: true },
      cursorStyle: "halo",
      autoErase: 3,
    },
  };

  // 実行時状態
  EF.state = {
    appOn: false,        // アプリ起動状態
    tool: "cursor",      // 現在の注釈ツール: cursor|pen|highlighter|arrow|ellipse|rect|text
    color: "#6cbba5",
    strokeWidth: 6,
    ring: { width: 6, size: 64, opacity: 0.9, ripple: true },
    cursorStyle: "ring", // ring | dot | halo | ringdot | arrow
    arrowHead: "end",    // end | start | both
    showOptions: false,  // ツールオプションのフライアウトを画面に表示するか
    uiHidden: false,
    autoErase: 0,        // 秒（0で残す）
    spotlight: false,
    spotShape: "band",   // band（横帯） | circle
    spotBand: 0.5,       // 帯の高さ（ビューポート比）
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

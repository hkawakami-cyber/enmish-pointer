/* ============================================================
   toolbar.js — 常駐ミニツールバーの構築とイベント配線
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  EF.toolbar = {
    init() {
      const tb = document.getElementById("toolbar");
      if (EF.fillIcons) EF.fillIcons(document); // 絵文字→SVGアイコン

      // カラースウォッチ生成
      this.buildColors();

      // ツール選択
      tb.querySelectorAll("[data-tool]").forEach((b) =>
        b.addEventListener("click", () => EF.app.setTool(b.dataset.tool)));

      // トグル（スポットライト/ズーム）
      tb.querySelectorAll("[data-toggle]").forEach((b) =>
        b.addEventListener("click", () => EF.app.toggle(b.dataset.toggle)));

      // アクション
      tb.querySelectorAll("[data-action]").forEach((b) =>
        b.addEventListener("click", () => EF.app.action(b.dataset.action)));

      // 収納ハンドル
      document.getElementById("tb-handle").addEventListener("click", () => {
        tb.dataset.collapsed = tb.dataset.collapsed === "true" ? "false" : "true";
      });

      this.fit();
      window.addEventListener("resize", () => this.fit());
      this.sync();
    },

    // カラースウォッチ（パレット編集後の再生成にも使う）
    buildColors() {
      const colors = document.getElementById("tb-colors");
      colors.innerHTML = "";
      EF.PALETTE.forEach((c) => {
        const sw = document.createElement("div");
        sw.className = "swatch";
        sw.style.background = c.value;
        sw.dataset.color = c.value;
        sw.title = c.name;
        sw.addEventListener("click", () => EF.app.setColor(c.value));
        colors.appendChild(sw);
      });
      this.sync();
    },

    // ウィンドウ高さに収まらなければアイコンのみのコンパクト表示に自動切替
    fit() {
      const tb = document.getElementById("toolbar");
      tb.classList.remove("compact");
      if (tb.scrollHeight > window.innerHeight - 16) tb.classList.add("compact");
    },

    // 状態をUIへ反映
    sync() {
      const tb = document.getElementById("toolbar");
      tb.classList.toggle("app-off", !EF.state.appOn);

      tb.querySelectorAll("[data-tool]").forEach((b) =>
        b.classList.toggle("active", EF.state.appOn && b.dataset.tool === EF.state.tool));

      const btnSpot = document.getElementById("btn-spotlight");
      btnSpot.classList.toggle("toggled", EF.state.spotlight);
      const btnZoom = document.getElementById("btn-zoom");
      btnZoom.classList.toggle("toggled", EF.state.zoom);

      const btnApp = document.getElementById("btn-app");
      btnApp.classList.toggle("active", EF.state.appOn);
      btnApp.querySelector(".lbl").textContent = EF.state.appOn ? "稼働中" : "起動";

      document.querySelectorAll(".swatch").forEach((s) =>
        s.classList.toggle("active", s.dataset.color === EF.state.color));

    },
  };
})();

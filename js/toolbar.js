/* ============================================================
   toolbar.js — 常駐ミニツールバーの構築とイベント配線
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  // 並べ替え・表示/非表示の対象ツール定義（key,label,ic,kind）
  EF.TOOL_DEFS = [
    { key: "cursor", label: "カーソル", ic: "cursor", kind: "tool" },
    { key: "pen", label: "ペン", ic: "pen", kind: "tool" },
    { key: "highlighter", label: "蛍光", ic: "highlighter", kind: "tool" },
    { key: "arrow", label: "矢印", ic: "arrow", kind: "tool" },
    { key: "hline", label: "横線", ic: "hline", kind: "tool" },
    { key: "ellipse", label: "丸", ic: "ellipse", kind: "tool" },
    { key: "rect", label: "四角", ic: "rect", kind: "tool" },
    { key: "text", label: "文字", ic: "text", kind: "tool" },
    { key: "spotlight", label: "注目", ic: "spotlight", kind: "toggle" },
    { key: "zoom", label: "ズーム", ic: "zoom", kind: "toggle" },
  ];
  EF.toolDef = function (key) { return EF.TOOL_DEFS.find((d) => d.key === key); };

  EF.toolbar = {
    init() {
      const tb = document.getElementById("toolbar");
      if (EF.fillIcons) EF.fillIcons(document); // 絵文字→SVGアイコン

      // カラースウォッチ生成
      this.buildColors();

      // 線の太さ クイック切替
      this.buildWidths();

      // ツール群を動的生成（並べ替え・表示/非表示反映）
      this.buildTools();

      // ツール選択/トグルは #tb-tools へ委譲
      const tbtools = document.getElementById("tb-tools");
      tbtools.addEventListener("click", (e) => {
        const b = e.target.closest("button"); if (!b) return;
        if (b.dataset.tool) EF.app.setTool(b.dataset.tool);
        else if (b.dataset.toggle) EF.app.toggle(b.dataset.toggle);
      });

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

    // 線の太さ クイック切替（細4 / 中6 / 太10）
    buildWidths() {
      const box = document.getElementById("tb-widths");
      if (!box) return;
      box.innerHTML = "";
      [[4, 2, "細"], [6, 4, "中"], [10, 7, "太"]].forEach(([w, barH, name]) => {
        const b = document.createElement("button");
        b.className = "wbtn";
        b.dataset.w = w;
        b.title = "線の太さ：" + name;
        b.innerHTML = `<i style="height:${barH}px"></i>`;
        b.addEventListener("click", () => {
          EF.state.strokeWidth = w;
          this.sync();
          if (EF.saveSettings) EF.saveSettings();
        });
        box.appendChild(b);
      });
      this.sync();
    },

    // ツール群（並べ替え順・表示/非表示を反映して再生成）
    buildTools() {
      const tbtools = document.getElementById("tb-tools");
      if (!tbtools) return;
      // 保存済み順序に新規ツール（番号など）が欠けていたら補完、未知のキーは除去
      const valid = EF.TOOL_DEFS.map((d) => d.key);
      EF.state.toolOrder = (Array.isArray(EF.state.toolOrder) ? EF.state.toolOrder : valid.slice()).filter((k) => valid.indexOf(k) !== -1);
      valid.forEach((k) => { if (EF.state.toolOrder.indexOf(k) === -1) EF.state.toolOrder.push(k); });
      tbtools.innerHTML = "";
      const titles = {
        cursor: "カーソル強調", pen: "ペン (⌘⇧1)", highlighter: "蛍光ペン",
        arrow: "矢印 (⌘⇧2)", hline: "横線（高さ固定・アンダーライン）",
        ellipse: "丸囲み (⌘⇧3)", rect: "四角囲み (⌘⇧4)", text: "テキスト注釈",
        spotlight: "スポットライト (⌘⇧5)", zoom: "ズーム (⌘⇧6)",
      };
      EF.state.toolOrder.forEach((key) => {
        if (EF.state.toolHidden[key]) return;
        const def = EF.toolDef(key);
        if (!def) return;
        const b = document.createElement("button");
        b.className = "tool";
        if (def.kind === "toggle") {
          b.dataset.toggle = key;
          b.id = key === "spotlight" ? "btn-spotlight" : key === "zoom" ? "btn-zoom" : "";
        } else {
          b.dataset.tool = key;
          if (key === "cursor") b.id = "btn-cursor";
        }
        b.title = titles[key] || def.label;
        b.innerHTML = `<span class="ico" data-ic="${def.ic}"></span><span class="lbl">${def.label}</span>`;
        tbtools.appendChild(b);
      });
      if (EF.fillIcons) EF.fillIcons(tbtools);
      this.sync();
    },

    // ウィンドウ高さに収まらなければアイコンのみのコンパクト表示に自動切替
    fit() {
      const tb = document.getElementById("toolbar");
      tb.classList.remove("compact");
      if (tb.scrollHeight > window.innerHeight - 24) tb.classList.add("compact");
    },

    // 状態をUIへ反映
    sync() {
      const tb = document.getElementById("toolbar");
      tb.classList.toggle("app-off", !EF.state.appOn);

      tb.querySelectorAll("[data-tool]").forEach((b) =>
        b.classList.toggle("active", EF.state.appOn && b.dataset.tool === EF.state.tool));

      const btnSpot = document.getElementById("btn-spotlight");
      if (btnSpot) btnSpot.classList.toggle("toggled", EF.state.spotlight);
      const btnZoom = document.getElementById("btn-zoom");
      if (btnZoom) btnZoom.classList.toggle("toggled", EF.state.zoom);

      const btnApp = document.getElementById("btn-app");
      if (btnApp) {
        btnApp.classList.toggle("active", EF.state.appOn);
        btnApp.querySelector(".lbl").textContent = EF.state.appOn ? "稼働中" : "起動";
      }

      document.querySelectorAll(".swatch").forEach((s) =>
        s.classList.toggle("active", s.dataset.color === EF.state.color));

      document.querySelectorAll("#tb-widths .wbtn").forEach((b) =>
        b.classList.toggle("active", parseFloat(b.dataset.w) === EF.state.strokeWidth));
    },
  };
})();

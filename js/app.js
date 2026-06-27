/* ============================================================
   app.js — メインオーケストレーター
   各モジュールを初期化し、注釈レイヤーのポインタ操作と
   ツールバー/ショートカットからのコマンドを束ねる。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  const DRAW_TOOLS = ["pen", "highlighter", "arrow", "hline", "ellipse", "rect", "text"];

  // 注釈レイヤー（ステージ上の描画）
  EF.annot = {
    engine: null,
    drawing: false,
    init() {
      const canvas = document.getElementById("annot-canvas");
      this.engine = new EF.DrawingEngine(canvas, {
        getStyle: () => ({ tool: EF.state.tool, color: EF.state.color, width: EF.state.strokeWidth }),
        getAutoErase: () => EF.state.autoErase,
      });
      window.addEventListener("resize", () => this.engine.resize());

      const stage = document.getElementById("stage");
      stage.addEventListener("mousedown", (ev) => {
        if (!EF.state.appOn || ev.button !== 0) return;
        const p = EF.stagePoint(ev);
        // 営業テンプレ配置待ちなら配置
        if (EF.stamps.tryPlace(p)) return;
        // ズーム中は座標がずれるため描画しない（表示専用）
        if (EF.state.zoom) return;
        if (DRAW_TOOLS.indexOf(EF.state.tool) === -1) return;
        this.drawing = true;
        this.engine.start(p.x, p.y);
      });
      stage.addEventListener("mousemove", (ev) => {
        if (!this.drawing) return;
        const p = EF.stagePoint(ev);
        this.engine.move(p.x, p.y);
      });
      window.addEventListener("mouseup", () => {
        if (this.drawing) { this.drawing = false; this.engine.end(); }
      });
    },
  };

  // コマンド面
  EF.app = {
    setTool(tool) {
      if (!EF.state.appOn) this.toggleApp(true);
      EF.state.tool = tool;
      EF.stamps.disarm();
      const stage = document.getElementById("stage");
      stage.classList.toggle("tool-cursor", tool === "cursor");
      stage.classList.toggle("armed", tool !== "cursor");
      EF.toolbar.sync();
      EF.setStatus();
    },

    setColor(color) {
      EF.state.color = color;
      EF.cursor.update();
      EF.toolbar.sync();
      EF.setStatus();
    },

    toggle(what) {
      if (!EF.state.appOn) this.toggleApp(true);
      if (what === "spotlight") {
        EF.state.spotlight = !EF.state.spotlight;
        EF.toast(EF.state.spotlight ? "スポットライト ON （[ ] で広さ調整）" : "スポットライト OFF");
      } else if (what === "zoom") {
        EF.state.zoom = !EF.state.zoom;
        EF.zoom.refresh();
        EF.toast(EF.state.zoom ? "ズーム ON （- = で倍率調整）" : "ズーム OFF");
      }
      EF.toolbar.sync();
      EF.setStatus();
    },

    action(name) {
      switch (name) {
        case "toggle-app": this.toggleApp(); break;
        case "undo": if (EF.state.appOn) EF.annot.engine.undo(); break;
        case "clear":
          EF.annot.engine.clear();
          if (EF.whiteboard.isOpen()) { /* WBは独立。誤消去を避ける */ }
          EF.toast("注釈を全消去しました");
          break;
        case "screenshot": EF.screenshot.capture(); break;
        case "settings": EF.presets.openModal(); break;
        case "whiteboard":
          if (!EF.state.appOn) this.toggleApp(true);
          EF.whiteboard.toggle();
          break;
      }
    },

    toggleApp(forceOn) {
      const next = forceOn ? true : !EF.state.appOn;
      // OFF→ONかつ強制でない場合はクイックパレットを一瞬見せる演出
      EF.state.appOn = next;
      document.body.classList.toggle("ef-on", next);
      if (!next) {
        // 全モードを畳む
        EF.state.spotlight = false;
        EF.state.zoom = false;
        EF.zoom.refresh();
        EF.stamps.disarm();
        document.getElementById("stage").classList.remove("armed", "tool-cursor");
        EF.toast("Enmish Focus を終了");
      } else {
        if (!forceOn) this.openPalette();
        document.getElementById("stage").classList.add(
          EF.state.tool === "cursor" ? "tool-cursor" : "armed");
        EF.toast("Enmish Focus 起動 — カーソル強調中");
      }
      EF.cursor.update();
      EF.toolbar.sync();
      EF.setStatus();
    },

    openPalette() { document.getElementById("quick-palette").hidden = false; },
    closePalette() { document.getElementById("quick-palette").hidden = true; },

    // Esc処理。何か閉じたら true。
    handleEscape() {
      if (!document.getElementById("settings").hidden) { EF.presets.closeModal(); return true; }
      if (!document.getElementById("quick-palette").hidden) { this.closePalette(); return true; }
      if (EF.whiteboard.isOpen()) { EF.whiteboard.close(); return true; }
      if (EF.state.armedStamp) { EF.stamps.disarm(); return true; }
      if (EF.state.zoom) { EF.state.zoom = false; EF.zoom.refresh(); EF.toolbar.sync(); EF.setStatus(); return true; }
      if (EF.state.spotlight) { EF.state.spotlight = false; EF.toolbar.sync(); EF.setStatus(); return true; }
      if (EF.state.appOn && EF.state.tool !== "cursor") { this.setTool("cursor"); return true; }
      return false;
    },
  };

  // クイックパレット内ボタン
  function bindPalette() {
    const qp = document.getElementById("quick-palette");
    qp.querySelectorAll("[data-tool]").forEach((b) =>
      b.addEventListener("click", () => { EF.app.setTool(b.dataset.tool); EF.app.closePalette(); }));
    qp.querySelectorAll("[data-toggle]").forEach((b) =>
      b.addEventListener("click", () => { EF.app.toggle(b.dataset.toggle); EF.app.closePalette(); }));
    qp.querySelectorAll("[data-action]").forEach((b) =>
      b.addEventListener("click", () => {
        if (b.dataset.action === "close-palette") EF.app.closePalette();
        else { EF.app.action(b.dataset.action); EF.app.closePalette(); }
      }));
  }

  // シーン切替
  function bindScenes() {
    document.querySelectorAll(".ss-btn").forEach((b) =>
      b.addEventListener("click", () => EF.setScene(b.dataset.scene)));
  }

  // 初期化
  window.addEventListener("DOMContentLoaded", () => {
    EF.setScene("proposal");
    EF.cursor.init();
    EF.annot.init();
    EF.spotlight.init();
    EF.zoom.init();
    EF.whiteboard.init();
    EF.stamps.init();
    EF.toolbar.init();
    EF.shortcuts.init();
    EF.presets.init();
    bindPalette();
    bindScenes();

    EF.toolbar.sync();
    EF.toast("Enmish Focus プロトタイプ — ⌘⇧E で起動", 2600);
  });
})();

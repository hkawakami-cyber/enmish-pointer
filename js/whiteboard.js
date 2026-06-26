/* ============================================================
   whiteboard.js — ミニホワイトボード
   独立キャンバスに DrawingEngine をもう一つ載せる。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  let panel, canvas, engine, wbTool = "pen", drawing = false;

  function localStyle() {
    const dark = panel.dataset.bg === "dark";
    return { tool: wbTool, color: dark ? "#ffffff" : EF.state.color, width: 8 };
  }

  function pt(ev) {
    const r = canvas.getBoundingClientRect();
    return { x: ev.clientX - r.left, y: ev.clientY - r.top };
  }

  EF.whiteboard = {
    init() {
      panel = document.getElementById("whiteboard");
      canvas = document.getElementById("wb-canvas");

      canvas.addEventListener("mousedown", (ev) => {
        const p = pt(ev); drawing = true; engine.start(p.x, p.y);
      });
      window.addEventListener("mousemove", (ev) => {
        if (!drawing) return;
        const p = pt(ev); engine.move(p.x, p.y);
      });
      window.addEventListener("mouseup", () => { if (drawing) { drawing = false; engine.end(); } });

      panel.querySelectorAll("[data-wb-tool]").forEach((b) =>
        b.addEventListener("click", () => this.setTool(b.dataset.wbTool)));
      panel.querySelector('[data-wb-action="bg"]').addEventListener("click", () => this.toggleBg());
      panel.querySelector('[data-wb-action="clear"]').addEventListener("click", () => engine.clear());
      panel.querySelector('[data-wb-action="close"]').addEventListener("click", () => this.close());
    },

    setTool(t) {
      wbTool = t;
      panel.querySelectorAll("[data-wb-tool]").forEach((b) =>
        b.classList.toggle("active", b.dataset.wbTool === t));
    },
    toggleBg() {
      panel.dataset.bg = panel.dataset.bg === "dark" ? "light" : "dark";
    },
    open() {
      panel.hidden = false;
      if (!engine) {
        engine = new EF.DrawingEngine(canvas, { getStyle: localStyle, getAutoErase: () => 0 });
        this.setTool("pen");
      } else {
        engine.resize();
      }
      document.getElementById("btn-wb").classList.add("toggled");
    },
    close() {
      panel.hidden = true;
      document.getElementById("btn-wb").classList.remove("toggled");
    },
    toggle() { panel.hidden ? this.open() : this.close(); },
    isOpen() { return !panel.hidden; },
  };
})();

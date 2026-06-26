/* ============================================================
   spotlight.js — スポットライト（カーソル周辺以外を暗転）
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  let canvas, ctx, dpr, w, h, raf;
  let radius = 130;
  let shape = "circle"; // circle | rect

  function resize() {
    const r = canvas.getBoundingClientRect();
    dpr = window.devicePixelRatio || 1;
    w = r.width; h = r.height;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  function render() {
    ctx.clearRect(0, 0, w, h);
    if (!EF.state.spotlight) { raf = requestAnimationFrame(render); return; }

    ctx.fillStyle = "rgba(8,10,16,0.74)";
    ctx.fillRect(0, 0, w, h);

    const m = EF.state.mouse;
    if (m.inStage) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      const grad = ctx.createRadialGradient(m.x, m.y, radius * 0.55, m.x, m.y, radius);
      grad.addColorStop(0, "rgba(0,0,0,1)");
      grad.addColorStop(1, "rgba(0,0,0,0)");
      if (shape === "circle") {
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, radius, 0, Math.PI * 2);
        ctx.fill();
      } else {
        ctx.fillStyle = "rgba(0,0,0,1)";
        ctx.fillRect(m.x - radius * 1.4, m.y - radius, radius * 2.8, radius * 2);
      }
      ctx.restore();
    }
    raf = requestAnimationFrame(render);
  }

  EF.spotlight = {
    init() {
      canvas = document.getElementById("spotlight-canvas");
      ctx = canvas.getContext("2d");
      resize();
      window.addEventListener("resize", resize);
      render();
    },
    setRadius(px) { radius = Math.max(60, Math.min(360, px)); },
    adjust(delta) { this.setRadius(radius + delta); },
    toggleShape() { shape = shape === "circle" ? "rect" : "circle"; },
  };
})();

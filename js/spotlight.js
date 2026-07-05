/* ============================================================
   spotlight.js — スポットライト（カーソル周辺以外を暗転）
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  let canvas, ctx, dpr, w, h, raf;
  let radius = 130;

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

    ctx.fillStyle = "rgba(8,10,16," + (EF.state.spotDim || 0.72) + ")";
    ctx.fillRect(0, 0, w, h);

    const m = EF.state.mouse;
    if (m.inStage) {
      ctx.save();
      ctx.globalCompositeOperation = "destination-out";
      if (EF.state.spotShape === "band") {
        // カーソルのY位置を中心にした横帯（高さはビューポート比で選択）
        const bandH = Math.max(60, h * (EF.state.spotBand || 0.33));
        const top = Math.min(Math.max(m.y - bandH / 2, 0), h - bandH);
        const soft = Math.min(0.18, 28 / bandH);
        const grad = ctx.createLinearGradient(0, top, 0, top + bandH);
        grad.addColorStop(0, "rgba(0,0,0,0)");
        grad.addColorStop(soft, "rgba(0,0,0,1)");
        grad.addColorStop(1 - soft, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.fillRect(0, top, w, bandH);
      } else {
        const grad = ctx.createRadialGradient(m.x, m.y, radius * 0.55, m.x, m.y, radius);
        grad.addColorStop(0, "rgba(0,0,0,1)");
        grad.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = grad;
        ctx.beginPath();
        ctx.arc(m.x, m.y, radius, 0, Math.PI * 2);
        ctx.fill();
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
    adjust(delta) {
      if (EF.state.spotShape === "band") {
        const opts = [0.25, 0.33, 0.5];
        const i = opts.indexOf(EF.state.spotBand);
        EF.state.spotBand = opts[Math.min(opts.length - 1, Math.max(0, (i < 0 ? 1 : i) + (delta > 0 ? 1 : -1)))];
      } else { this.setRadius(radius + delta); }
    },
  };
})();

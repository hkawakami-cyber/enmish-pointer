/* ============================================================
   zoom.js — カーソル周辺ズーム
   #zoomable（コンテンツ＋注釈レイヤー）に CSS transform を当て、
   transform-origin をカーソルに追従させることで「カーソル周辺を拡大」。
   カーソルリングはステージ直下にあるため実位置に留まる＝点が一致。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  let zoomable;

  function apply() {
    const m = EF.state.mouse;
    if (!EF.state.zoom || !m.inStage) {
      zoomable.style.transform = "scale(1)";
      return;
    }
    const stage = document.getElementById("stage");
    const r = stage.getBoundingClientRect();
    const ox = (m.x / r.width) * 100;
    const oy = (m.y / r.height) * 100;
    zoomable.style.transformOrigin = `${ox}% ${oy}%`;
    zoomable.style.transform = `scale(${EF.state.zoomScale})`;
  }

  EF.zoom = {
    init() {
      zoomable = document.getElementById("zoomable");
      EF.on("mousemove", apply);
    },
    refresh: apply,
    setScale(s) {
      EF.state.zoomScale = Math.max(1.4, Math.min(5, s));
      apply();
      EF.setStatus();
    },
    adjust(delta) { this.setScale(EF.state.zoomScale + delta); },
  };
})();

/* ============================================================
   cursor.js — カーソル強調（リング＋クリック波紋）
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  let ring;

  EF.cursor = {
    init() {
      ring = document.getElementById("cursor-ring");
      const stage = document.getElementById("stage");

      stage.addEventListener("mousemove", (ev) => {
        const p = EF.stagePoint(ev);
        EF.state.mouse = { x: p.x, y: p.y, inStage: true };
        this.update();
        EF.emit("mousemove", p);
      });
      stage.addEventListener("mouseleave", () => {
        EF.state.mouse.inStage = false;
        ring.hidden = true;
        EF.emit("mouseleave");
      });
      stage.addEventListener("mouseenter", () => {
        EF.state.mouse.inStage = true;
        this.update();
      });

      // クリック波紋（右/左で色を変える）
      stage.addEventListener("mousedown", (ev) => {
        if (!EF.state.appOn || !EF.state.ring.ripple) return;
        const p = EF.stagePoint(ev);
        const r = document.createElement("div");
        r.className = "ripple";
        r.style.left = p.x + "px";
        r.style.top = p.y + "px";
        r.style.borderColor = ev.button === 2 ? EF.PALETTE[1].value : EF.state.color;
        stage.appendChild(r);
        setTimeout(() => r.remove(), 600);
      });
      stage.addEventListener("contextmenu", (ev) => {
        if (EF.state.appOn) ev.preventDefault();
      });
    },

    update() {
      const on = EF.state.appOn && EF.state.mouse.inStage;
      if (!on) { ring.hidden = true; return; }
      const r = EF.state.ring;
      ring.hidden = false;
      ring.style.width = r.size + "px";
      ring.style.height = r.size + "px";
      ring.style.left = EF.state.mouse.x + "px";
      ring.style.top = EF.state.mouse.y + "px";
      ring.style.borderWidth = r.width + "px";
      ring.style.borderColor = EF.state.color;
      ring.style.opacity = r.opacity;
    },
  };
})();

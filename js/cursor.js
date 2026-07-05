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
      // リング（カーソル強調）は「カーソル」ツールのときだけ表示。他ツールでは消す。
      const on = EF.state.appOn && EF.state.mouse.inStage && EF.state.tool === "cursor";
      if (!on) { ring.hidden = true; return; }
      const r = EF.state.ring, color = EF.state.color, style = EF.state.cursorStyle || "dot";
      const dot = ring.querySelector(".cr-dot");
      const arrow = ring.querySelector(".cr-arrow");
      ring.hidden = false;
      ring.style.width = r.size + "px";
      ring.style.height = r.size + "px";
      ring.style.left = EF.state.mouse.x + "px";
      ring.style.top = EF.state.mouse.y + "px";
      ring.style.opacity = r.opacity;
      // 一旦リセット
      ring.style.borderWidth = "0"; ring.style.background = "transparent"; ring.style.boxShadow = "none";
      if (dot) dot.style.display = "none";
      if (arrow) arrow.style.display = "none";
      ring.style.transform = "translate(-50%, -50%)";
      if (style === "arrow") {
        // 矢印カーソル：先端をマウス位置に合わせる
        ring.style.transform = "translate(" + (-(3 / 24) * r.size) + "px, " + (-(2 / 24) * r.size) + "px)";
        if (arrow) {
          arrow.style.display = "block";
          arrow.style.width = r.size + "px"; arrow.style.height = r.size + "px";
          const path = arrow.querySelector("path");
          if (path) path.setAttribute("fill", color);
        }
        return;
      }
      if (style === "ring" || style === "ringdot") {
        ring.style.borderWidth = r.width + "px";
        ring.style.borderColor = color;
      }
      if (style === "halo") {
        ring.style.background = "radial-gradient(circle, " + color + "cc 0%, " + color + "44 38%, transparent 70%)";
      }
      if (style === "dot" || style === "ringdot") {
        if (dot) {
          const ds = style === "dot" ? Math.max(10, r.size * 0.42) : Math.max(8, r.size * 0.24);
          dot.style.display = "block";
          dot.style.width = ds + "px"; dot.style.height = ds + "px";
          dot.style.background = color;
        }
      }
    },
  };
})();

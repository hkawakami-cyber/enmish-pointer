/* ============================================================
   presets.js — プリセット適用と設定モーダル
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  function $(id) { return document.getElementById(id); }

  EF.presets = {
    init() {
      // プリセットカード生成
      const grid = $("preset-grid");
      grid.innerHTML = "";
      Object.entries(EF.PRESETS).forEach(([key, p]) => {
        const b = document.createElement("button");
        b.className = "preset";
        b.dataset.preset = key;
        b.innerHTML = `<div class="p-name">${p.name}</div><div class="p-desc">${p.desc}</div>`;
        b.addEventListener("click", () => this.apply(key));
        grid.appendChild(b);
      });

      // スライダー類
      this.bindRange("set-ring-width", "out-ring-width", (v) => { EF.state.ring.width = +v; EF.cursor.update(); }, (v) => v + "px");
      this.bindRange("set-ring-size", "out-ring-size", (v) => { EF.state.ring.size = +v; EF.cursor.update(); }, (v) => v + "px");
      this.bindRange("set-ring-opacity", "out-ring-opacity", (v) => { EF.state.ring.opacity = v / 100; EF.cursor.update(); }, (v) => v + "%");
      this.bindRange("set-stroke-width", "out-stroke-width", (v) => { EF.state.strokeWidth = +v; }, (v) => v + "px");

      $("set-click-ripple").addEventListener("change", (e) => { EF.state.ring.ripple = e.target.checked; });

      // カーソルの形
      $("set-cursor-style").querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => {
          EF.state.cursorStyle = b.dataset.cursor;
          $("set-cursor-style").querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
          EF.cursor.update();
          if (EF.options) EF.options.render();
        }));

      // 自動消去セグメント
      $("autoerase-seg").querySelectorAll("button").forEach((b) =>
        b.addEventListener("click", () => this.setAutoErase(+b.dataset.autoerase)));

      // 閉じる
      document.querySelectorAll('[data-action="close-settings"]').forEach((b) =>
        b.addEventListener("click", () => this.closeModal()));
      $("settings").addEventListener("click", (e) => { if (e.target.id === "settings") this.closeModal(); });

      this.apply(EF.state.preset, true);
    },

    bindRange(inId, outId, onInput, fmt) {
      const inp = $(inId), out = $(outId);
      inp.addEventListener("input", () => { onInput(inp.value); out.textContent = fmt(inp.value); });
    },

    setAutoErase(sec) {
      EF.state.autoErase = sec;
      $("autoerase-seg").querySelectorAll("button").forEach((b) =>
        b.classList.toggle("active", +b.dataset.autoerase === sec));
    },

    apply(key, silent) {
      const p = EF.PRESETS[key];
      if (!p) return;
      EF.state.preset = key;
      EF.state.color = p.color;
      EF.state.strokeWidth = p.strokeWidth;
      EF.state.ring = Object.assign({}, p.ring);
      EF.state.cursorStyle = p.cursorStyle || "ring";
      EF.state.autoErase = p.autoErase;

      // UI同期
      $("set-ring-width").value = p.ring.width; $("out-ring-width").textContent = p.ring.width + "px";
      $("set-ring-size").value = p.ring.size; $("out-ring-size").textContent = p.ring.size + "px";
      $("set-ring-opacity").value = Math.round(p.ring.opacity * 100); $("out-ring-opacity").textContent = Math.round(p.ring.opacity * 100) + "%";
      $("set-stroke-width").value = p.strokeWidth; $("out-stroke-width").textContent = p.strokeWidth + "px";
      $("set-click-ripple").checked = p.ring.ripple;
      this.setAutoErase(p.autoErase);

      document.querySelectorAll(".preset").forEach((b) =>
        b.classList.toggle("active", b.dataset.preset === key));

      // カーソル形状セレクタの同期
      const cs = document.getElementById("set-cursor-style");
      if (cs) cs.querySelectorAll("button").forEach((b) =>
        b.classList.toggle("active", b.dataset.cursor === EF.state.cursorStyle));

      EF.cursor.update();
      EF.toolbar.sync();
      if (EF.options) EF.options.render();
      EF.setStatus();
      if (!silent) EF.toast(`プリセット: ${p.name}`);
    },

    openModal() { $("settings").hidden = false; },
    closeModal() { $("settings").hidden = true; },
  };
})();

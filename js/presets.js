/* ============================================================
   presets.js — 設定モーダル（プリセットは廃止／設定は自動保存）
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  function $(id) { return document.getElementById(id); }
  const save = () => EF.saveSettings && EF.saveSettings();

  EF.presets = {
    init() {
      // カラーパレット編集
      this.buildPalette();

      // スライダー類（変更時に保存）
      this.bindRange("set-ring-width", "out-ring-width", (v) => { EF.state.ring.width = +v; EF.cursor.update(); }, (v) => v + "px");
      this.bindRange("set-ring-size", "out-ring-size", (v) => { EF.state.ring.size = +v; EF.cursor.update(); }, (v) => v + "px");
      this.bindRange("set-ring-opacity", "out-ring-opacity", (v) => { EF.state.ring.opacity = v / 100; EF.cursor.update(); }, (v) => v + "%");
      this.bindRange("set-stroke-width", "out-stroke-width", (v) => { EF.state.strokeWidth = +v; }, (v) => v + "px");

      $("set-click-ripple").addEventListener("change", (e) => { EF.state.ring.ripple = e.target.checked; save(); });

      // セグメント共通ヘルパー
      const seg = (id, attr, apply) =>
        $(id).querySelectorAll("button").forEach((b) =>
          b.addEventListener("click", () => {
            apply(b.dataset[attr], b);
            $(id).querySelectorAll("button").forEach((x) => x.classList.toggle("active", x === b));
            if (EF.options) EF.options.render();
            EF.cursor.update();
            save();
          }));

      seg("set-cursor-style", "cursor", (v) => { EF.state.cursorStyle = v; });
      seg("set-cursor-size", "size", (v) => {
        EF.state.ring.size = +v;
        $("set-ring-size").value = EF.state.ring.size; $("out-ring-size").textContent = EF.state.ring.size + "px";
      });
      seg("set-arrow-head", "head", (v) => { EF.state.arrowHead = v; });
      seg("set-spot-shape", "shape", (v) => { EF.state.spotShape = v; });
      seg("set-spot-band", "band", (v) => { EF.state.spotBand = parseFloat(v); });
      seg("set-spot-dim", "dim", (v) => { EF.state.spotDim = parseFloat(v); });
      seg("set-zoom-scale", "zoom", (v) => { EF.state.zoomScale = parseFloat(v); EF.zoom.refresh(); EF.setStatus(); });

      // テキスト設定
      seg("set-text-size", "size", (v) => { EF.state.textSize = +v; });
      seg("set-text-weight", "weight", (v) => { EF.state.textBold = (v === "bold"); });
      this.buildTextColors();

      // オプションパネルの表示/非表示
      $("set-show-options").addEventListener("change", (e) => {
        EF.state.showOptions = e.target.checked;
        if (EF.options) EF.options.render();
        save();
      });

      // 閉じる
      document.querySelectorAll('[data-action="close-settings"]').forEach((b) =>
        b.addEventListener("click", () => this.closeModal()));
      $("settings").addEventListener("click", (e) => { if (e.target.id === "settings") this.closeModal(); });

      // 起動時に現在の状態をUIへ反映
      this.syncUI();
    },

    bindRange(inId, outId, onInput, fmt) {
      const inp = $(inId), out = $(outId);
      inp.addEventListener("input", () => { onInput(inp.value); out.textContent = fmt(inp.value); });
      inp.addEventListener("change", save);
    },

    // カラーパレット編集（クリックで色変更・自動保存）
    buildPalette() {
      const box = $("palette-edit");
      box.innerHTML = "";
      EF.PALETTE.forEach((c, i) => {
        const inp = document.createElement("input");
        inp.type = "color";
        inp.className = "pal-color";
        inp.value = c.value;
        inp.title = c.name;
        inp.addEventListener("input", () => {
          const old = EF.PALETTE[i].value;
          EF.PALETTE[i].value = inp.value;
          if (EF.state.color === old) EF.state.color = inp.value; // 選択中の色も追従
          EF.toolbar.buildColors();
          EF.cursor.update();
          save();
        });
        box.appendChild(inp);
      });
    },

    // テキスト色（パレットから選択）
    buildTextColors() {
      const box = $("set-text-color");
      box.innerHTML = "";
      EF.PALETTE.forEach((c) => {
        const sw = document.createElement("div");
        sw.className = "swatch";
        sw.style.background = c.value;
        sw.dataset.color = c.value;
        sw.addEventListener("click", () => {
          EF.state.textColor = c.value;
          box.querySelectorAll(".swatch").forEach((s) => s.classList.toggle("active", s === sw));
          save();
        });
        box.appendChild(sw);
      });
    },

    syncUI() {
      $("set-show-options").checked = EF.state.showOptions;
      $("set-ring-width").value = EF.state.ring.width; $("out-ring-width").textContent = EF.state.ring.width + "px";
      $("set-ring-size").value = EF.state.ring.size; $("out-ring-size").textContent = EF.state.ring.size + "px";
      $("set-ring-opacity").value = Math.round(EF.state.ring.opacity * 100); $("out-ring-opacity").textContent = Math.round(EF.state.ring.opacity * 100) + "%";
      $("set-stroke-width").value = EF.state.strokeWidth; $("out-stroke-width").textContent = EF.state.strokeWidth + "px";
      $("set-click-ripple").checked = EF.state.ring.ripple;
      const setActive = (id, attr, val) =>
        $(id).querySelectorAll("button").forEach((b) => b.classList.toggle("active", b.dataset[attr] === String(val)));
      setActive("set-cursor-style", "cursor", EF.state.cursorStyle);
      setActive("set-cursor-size", "size", EF.state.ring.size);
      setActive("set-arrow-head", "head", EF.state.arrowHead);
      setActive("set-spot-shape", "shape", EF.state.spotShape);
      setActive("set-spot-band", "band", EF.state.spotBand);
      setActive("set-spot-dim", "dim", EF.state.spotDim);
      setActive("set-zoom-scale", "zoom", EF.state.zoomScale);
      setActive("set-text-size", "size", EF.state.textSize);
      setActive("set-text-weight", "weight", EF.state.textBold ? "bold" : "normal");
      $("set-text-color").querySelectorAll(".swatch").forEach((s) =>
        s.classList.toggle("active", s.dataset.color === EF.state.textColor));
    },

    openModal() { this.syncUI(); $("settings").hidden = false; },
    closeModal() { $("settings").hidden = true; },
  };
})();

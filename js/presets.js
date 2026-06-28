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

      // ツールバー（並べ替え・表示/非表示）
      this.buildToolList();

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

      // バーの配置
      seg("set-show-labels", "labels", (v) => { EF.state.showLabels = (v === "on"); EF.app.applyLayout(); });
      seg("set-laser", "laser", (v) => { EF.state.autoErase = (v === "on") ? 2 : 0; });
      seg("set-auto-hide", "auto", (v) => { EF.state.autoHide = (v === "on"); EF.app.applyLayout(); });
      seg("set-bar-side", "side", (v) => { EF.state.barSide = v; EF.app.applyLayout(); });
      seg("set-dock-pos", "pos", (v) => { EF.state.dockPos = v; EF.app.applyLayout(); });

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

      // プロファイル（商談/社内）
      document.querySelectorAll(".prof-btn").forEach((b) =>
        b.addEventListener("click", () => {
          if (b.dataset.pact === "save") this.saveProfile(b.dataset.prof);
          else this.applyProfile(b.dataset.prof);
        }));

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

    // ツールバーの並べ替え（ドラッグ＆ドロップ）・表示/非表示リスト
    buildToolList() {
      const box = $("set-tools");
      if (!box) return;
      box.innerHTML = "";
      const order = EF.state.toolOrder;
      order.forEach((key) => {
        const def = EF.toolDef ? EF.toolDef(key) : null;
        if (!def) return;
        const row = document.createElement("div");
        row.className = "set-tool-row";
        row.draggable = true;
        row.dataset.key = key;

        const grip = document.createElement("span");
        grip.className = "st-grip";
        grip.title = "ドラッグで並べ替え";
        grip.innerHTML = EF.iconSvg ? EF.iconSvg("grip", 16) : "⋮⋮";

        const lab = document.createElement("label");
        lab.className = "st-label";
        const cb = document.createElement("input");
        cb.type = "checkbox";
        cb.checked = !EF.state.toolHidden[key];
        cb.addEventListener("change", () => {
          if (cb.checked) delete EF.state.toolHidden[key];
          else EF.state.toolHidden[key] = true;
          if (EF.toolbar) EF.toolbar.buildTools();
          save();
        });
        const icoSpan = document.createElement("span");
        icoSpan.className = "st-ico";
        icoSpan.innerHTML = EF.iconSvg ? EF.iconSvg(def.ic, 16) : "";
        const txt = document.createElement("span");
        txt.textContent = def.label;
        lab.appendChild(cb);
        lab.appendChild(icoSpan);
        lab.appendChild(txt);

        row.appendChild(grip);
        row.appendChild(lab);

        // ドラッグ＆ドロップ並べ替え
        row.addEventListener("dragstart", (e) => {
          this._dragKey = key;
          e.dataTransfer.effectAllowed = "move";
          row.classList.add("dragging");
        });
        row.addEventListener("dragend", () => row.classList.remove("dragging"));
        row.addEventListener("dragover", (e) => { e.preventDefault(); e.dataTransfer.dropEffect = "move"; row.classList.add("drag-over"); });
        row.addEventListener("dragleave", () => row.classList.remove("drag-over"));
        row.addEventListener("drop", (e) => { e.preventDefault(); row.classList.remove("drag-over"); this.reorderTool(this._dragKey, key); });

        box.appendChild(row);
      });
    },

    reorderTool(fromKey, toKey) {
      if (!fromKey || fromKey === toKey) return;
      const order = EF.state.toolOrder;
      const fi = order.indexOf(fromKey);
      if (fi < 0) return;
      order.splice(fi, 1);
      const ti = order.indexOf(toKey);
      order.splice(ti < 0 ? order.length : ti, 0, fromKey); // ドロップ先の前に挿入
      if (EF.toolbar) EF.toolbar.buildTools();
      save();
      this.buildToolList();
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
      setActive("set-show-labels", "labels", EF.state.showLabels ? "on" : "off");
      setActive("set-laser", "laser", EF.state.autoErase > 0 ? "on" : "off");
      setActive("set-auto-hide", "auto", EF.state.autoHide ? "on" : "off");
      setActive("set-bar-side", "side", EF.state.barSide);
      setActive("set-dock-pos", "pos", EF.state.dockPos);
      setActive("set-text-size", "size", EF.state.textSize);
      setActive("set-text-weight", "weight", EF.state.textBold ? "bold" : "normal");
      $("set-text-color").querySelectorAll(".swatch").forEach((s) =>
        s.classList.toggle("active", s.dataset.color === EF.state.textColor));
    },

    // ---- プロファイル（商談/社内）----
    PROF_KEY: "enmishFocus.profiles.v1",
    PROF_NAMES: { c1: "設定1", c2: "設定2", c3: "設定3" },
    _profiles() { try { return JSON.parse(localStorage.getItem(this.PROF_KEY) || "{}"); } catch (e) { return {}; } },
    saveProfile(key) {
      const snap = {};
      (EF.PERSIST || []).forEach((k) => { if (k !== "tool") snap[k] = EF.state[k]; });
      snap.palette = EF.PALETTE.map((c) => c.value);
      const all = this._profiles(); all[key] = snap;
      try { localStorage.setItem(this.PROF_KEY, JSON.stringify(all)); } catch (e) { /* noop */ }
      EF.toast(this.PROF_NAMES[key] + "に保存しました", 2000);
      this.syncUI();
    },
    applyProfile(key) {
      const o = this._profiles()[key];
      if (!o) { EF.toast(this.PROF_NAMES[key] + "は未保存です", 2000); return; }
      if (Array.isArray(o.palette)) o.palette.forEach((v, i) => { if (EF.PALETTE[i]) EF.PALETTE[i].value = v; });
      (EF.PERSIST || []).forEach((k) => {
        if (k === "tool" || o[k] === undefined) return;
        if (k === "ring") EF.state.ring = Object.assign({}, EF.state.ring, o.ring);
        else EF.state[k] = o[k];
      });
      save();
      EF.toolbar.buildColors(); EF.toolbar.buildTools(); EF.cursor.update();
      EF.app.applyLayout(); if (EF.options) EF.options.render(); this.syncUI();
      EF.toast(this.PROF_NAMES[key] + "を適用しました", 1800);
    },

    openModal() { this.syncUI(); this.buildToolList(); $("settings").hidden = false; },
    closeModal() { $("settings").hidden = true; },
  };
})();

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
        getStyle: () => ({ tool: EF.state.tool, color: EF.state.color, width: EF.state.strokeWidth, head: EF.state.arrowHead }),
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
        // テキストはインライン入力欄で
        if (EF.state.tool === "text") { ev.preventDefault(); EF.app.showTextInput(p); return; }
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
      EF.options.render();
      EF.setStatus();
    },

    // インラインのテキスト入力欄
    showTextInput(p) {
      const stage = document.getElementById("stage");
      const old = stage.querySelector(".ef-text-input");
      if (old) old.remove();
      const inp = document.createElement("input");
      inp.className = "ef-text-input";
      inp.type = "text";
      inp.style.left = p.x + "px";
      inp.style.top = p.y + "px";
      inp.style.color = EF.state.color;
      inp.style.fontSize = Math.max(16, EF.state.strokeWidth * 3) + "px";
      stage.appendChild(inp);
      requestAnimationFrame(() => inp.focus());
      let done = false;
      const close = (keep) => {
        if (done) return; done = true;
        inp.removeEventListener("blur", onBlur);
        const v = inp.value;
        if (inp.isConnected) inp.remove();
        if (keep && v && v.trim()) EF.annot.engine.addText(p.x, p.y, v, EF.state.color, EF.state.strokeWidth);
      };
      const onBlur = () => close(true);
      inp.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") close(true);
        else if (e.key === "Escape") close(false);
      });
      inp.addEventListener("blur", onBlur);
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
      EF.options.render();
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
      EF.options.render();
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

  // ツール別オプション（カーソル形状 / 矢じり向き / 注目の帯）
  function optGroup(title, opt, cur, items) {
    const btns = items.map((it) =>
      `<button class="to-btn${String(it[0]) === String(cur) ? " on" : ""}" data-opt="${opt}" data-val="${it[0]}">` +
      (it[1] ? `<span class="to-ico">${it[1]}</span>` : "") + `<span>${it[2]}</span></button>`).join("");
    return `<div class="to-group"><div class="to-title">${title}</div><div class="to-btns">${btns}</div></div>`;
  }
  EF.options = {
    render() {
      const el = document.getElementById("tool-options");
      if (!el) return;
      const groups = [];
      if (EF.state.appOn && EF.state.tool === "cursor") {
        groups.push(optGroup("カーソル", "cursorStyle", EF.state.cursorStyle,
          [["ring", "◎", "リング"], ["dot", "●", "ドット"], ["ringdot", "◉", "両方"], ["halo", "✦", "ハロー"]]));
      } else if (EF.state.appOn && EF.state.tool === "arrow") {
        groups.push(optGroup("矢じり", "arrowHead", EF.state.arrowHead,
          [["end", "→", "終点"], ["start", "←", "始点"], ["both", "↔", "両方"]]));
      }
      if (EF.state.appOn && EF.state.spotlight) {
        groups.push(optGroup("注目の形", "spotShape", EF.state.spotShape,
          [["band", "▭", "帯"], ["circle", "◯", "丸"]]));
        if (EF.state.spotShape === "band") {
          groups.push(optGroup("帯の高さ", "spotBand", EF.state.spotBand,
            [[0.25, "", "25%"], [0.5, "", "50%"], [0.75, "", "75%"]]));
        }
      }
      if (!groups.length) { el.hidden = true; return; }
      el.innerHTML = groups.join("");
      el.hidden = false;
    },
    bind() {
      const el = document.getElementById("tool-options");
      el.addEventListener("click", (e) => {
        const b = e.target.closest(".to-btn"); if (!b) return;
        let v = b.dataset.val;
        if (b.dataset.opt === "spotBand") v = parseFloat(v);
        EF.state[b.dataset.opt] = v;
        EF.cursor.update();
        this.render();
        EF.setStatus();
      });
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
    EF.options.bind();
    EF.options.render();

    EF.toolbar.sync();
    EF.toast("Enmish Focus プロトタイプ — ⌘⇧E で起動", 2600);
  });
})();

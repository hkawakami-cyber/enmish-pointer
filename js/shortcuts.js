/* ============================================================
   shortcuts.js — グローバル風キーボードショートカット
   実機(macOSネイティブ)ではOSのグローバルショートカットになる想定。
   Webでは ⌘/Ctrl + ⇧ + キー を横取りしてプロトタイプの操作に割当てる。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  EF.shortcuts = {
    init() {
      window.addEventListener("keydown", (ev) => {
        const mod = ev.metaKey || ev.ctrlKey;
        const key = ev.key.toLowerCase();

        // クイックパレットが開いているとき
        const palette = document.getElementById("quick-palette");
        if (!palette.hidden) {
          if (ev.key === "Escape") { EF.app.closePalette(); ev.preventDefault(); return; }
          const map = { "1": "pen", "2": "arrow", "3": "ellipse", "4": "rect" };
          if (map[ev.key]) { EF.app.setTool(map[ev.key]); EF.app.closePalette(); ev.preventDefault(); return; }
          if (ev.key === "5") { EF.app.toggle("spotlight"); EF.app.closePalette(); ev.preventDefault(); return; }
          if (ev.key === "6") { EF.app.toggle("zoom"); EF.app.closePalette(); ev.preventDefault(); return; }
          if (ev.key === "Backspace" || ev.key === "Delete") { EF.app.action("clear"); EF.app.closePalette(); ev.preventDefault(); return; }
          return;
        }

        // Esc: 注釈ツール解除→カーソルへ / 配置待ち解除 / WB閉じる / モーダル閉じる
        if (ev.key === "Escape") {
          if (EF.app.handleEscape()) ev.preventDefault();
          return;
        }

        // Shift併用だと ev.key が記号化（2→@）するため ev.code で判定する
        const code = ev.code;
        if (mod && ev.shiftKey) {
          // ⌘⇧E : アプリ ON/OFF（OFF時はクイックパレット表示）
          if (code === "KeyE") { ev.preventDefault(); EF.app.toggleApp(); return; }
          if (!EF.state.appOn) return;

          if (code === "Digit1") { ev.preventDefault(); EF.app.setTool("pen"); return; }
          if (code === "Digit2") { ev.preventDefault(); EF.app.setTool("arrow"); return; }
          if (code === "Digit3") { ev.preventDefault(); EF.app.setTool("ellipse"); return; }
          if (code === "Digit4") { ev.preventDefault(); EF.app.setTool("rect"); return; }
          if (code === "Digit5") { ev.preventDefault(); EF.app.toggle("spotlight"); return; }
          if (code === "Digit6") { ev.preventDefault(); EF.app.toggle("zoom"); return; }
          if (code === "KeyW") { ev.preventDefault(); EF.app.action("whiteboard"); return; }
          if (ev.key === "Backspace" || ev.key === "Delete") { ev.preventDefault(); EF.app.action("clear"); return; }
        }

        // ⌘Z : 元に戻す（注釈レイヤー）
        if (mod && !ev.shiftKey && code === "KeyZ") {
          if (EF.state.appOn) { ev.preventDefault(); EF.annot.engine.undo(); }
          return;
        }

        // 補助: スポットライト半径 [ / ] 、ズーム倍率 - / =
        if (EF.state.appOn && !mod) {
          if (EF.state.spotlight && (ev.key === "[" || ev.key === "]")) {
            EF.spotlight.adjust(ev.key === "[" ? -25 : 25); ev.preventDefault(); return;
          }
          if (EF.state.zoom && (ev.key === "-" || ev.key === "=" || ev.key === "+")) {
            EF.zoom.adjust(ev.key === "-" ? -0.3 : 0.3); ev.preventDefault(); return;
          }
        }
      });
    },
  };
})();

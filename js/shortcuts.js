/* ============================================================
   shortcuts.js — グローバル風キーボードショートカット
   実機(macOSネイティブ)ではOSのグローバルショートカットになる想定。
   Webでは ⌘/Ctrl + ⇧ + キー を横取りしてプロトタイプの操作に割当てる。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  EF.shortcuts = {
    _lastEsc: 0, // 直近のEsc時刻（ダブルEsc全消去の判定用）
    init() {
      window.addEventListener("keydown", (ev) => {
        const mod = ev.metaKey || ev.ctrlKey;

        // Esc: ①大きいモード解除/モーダル閉じる → ②素のEsc（1回=カーソルへ / 450ms以内に2連打=全消去）
        // 長押しのオートリピートは無視（ダブルEsc全消去の誤発動防止）
        if (ev.key === "Escape") {
          if (ev.repeat) return;
          if (EF.app.handleEscape()) { EF.shortcuts._lastEsc = 0; ev.preventDefault(); return; }
          if (EF.state.appOn) {
            const now = Date.now();
            if (EF.shortcuts._lastEsc && (now - EF.shortcuts._lastEsc) < 450) {
              EF.shortcuts._lastEsc = 0;
              if (!EF.annot.engine.isEmpty()) { ev.preventDefault(); EF.app.action("clear"); }
            } else {
              EF.shortcuts._lastEsc = now;
              if (EF.state.tool !== "cursor") { ev.preventDefault(); EF.app.setTool("cursor"); }
            }
          }
          return;
        }

        // Delete / Backspace 単体で「1つ戻る」（直感操作）。入力欄では無効。
        if ((ev.key === "Backspace" || ev.key === "Delete") && !mod && !ev.shiftKey) {
          const ae = document.activeElement;
          if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
          if (EF.state.appOn) { ev.preventDefault(); if (EF.annot.engine.undo()) EF.toast("1つ戻しました"); }
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
          if (code === "KeyH") { ev.preventDefault(); EF.app.toggleUI(); return; }
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

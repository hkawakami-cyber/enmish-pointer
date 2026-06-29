// ページスクリプトより先に登録して Delete/Backspace を確実に捕捉する。
// all_frames:true で iframe 内にも注入し、postMessage で親フレームへ転送する。
(function() {
  const inIframe = window.parent !== window;

  window.__efEarly = window.__efEarly || { appOn: false, cb: null, clearCb: null };

  if (inIframe) {
    // 親フレームに現在の appOn 状態を問い合わせる
    try { window.parent.postMessage({ __efType: "efReq" }, "*"); } catch (e) {}
    // 親フレームから appOn の更新を受け取る
    window.addEventListener("message", function(ev) {
      if (ev.data && ev.data.__efType === "efState") {
        window.__efEarly.appOn = !!ev.data.appOn;
      }
    });
  }

  window.addEventListener("keydown", function(ev) {
    if (!window.__efEarly.appOn) return;
    if (ev.key !== "Delete" && ev.key !== "Backspace") return;

    // Ctrl+Shift+Delete / Cmd+Shift+Delete → 全消去
    if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (window.__efEarly.clearCb) {
        window.__efEarly.clearCb();
      } else if (inIframe) {
        try { window.parent.postMessage({ __efType: "efKey", action: "clear" }, "*"); } catch (e) {}
      }
      return;
    }

    // 修飾キーなし → 1つ戻す
    if (!ev.metaKey && !ev.ctrlKey && !ev.shiftKey) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (window.__efEarly.cb) {
        window.__efEarly.cb();
      } else if (inIframe) {
        try { window.parent.postMessage({ __efType: "efKey", action: "undo" }, "*"); } catch (e) {}
      }
    }
  }, true);
})();

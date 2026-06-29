// ページスクリプトより先に登録して Delete/Backspace を確実に捕捉する
window.__efEarly = { appOn: false, cb: null, clearCb: null };
window.addEventListener("keydown", function(ev) {
  if (!window.__efEarly.appOn) return;
  if (ev.key !== "Delete" && ev.key !== "Backspace") return;
  // Ctrl+Shift+Delete / Cmd+Shift+Delete → 全消去
  if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (window.__efEarly.clearCb) window.__efEarly.clearCb();
    return;
  }
  // 修飾キーなし → 1つ戻す
  if (!ev.metaKey && !ev.ctrlKey && !ev.shiftKey) {
    ev.preventDefault();
    ev.stopImmediatePropagation();
    if (window.__efEarly.cb) window.__efEarly.cb();
  }
}, true);

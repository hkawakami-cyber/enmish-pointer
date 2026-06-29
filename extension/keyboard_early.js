// ページスクリプトより先に登録して Delete/Backspace を確実に捕捉する
window.__efEarly = { appOn: false, cb: null };
window.addEventListener("keydown", function(ev) {
  if (!window.__efEarly.appOn) return;
  if (ev.metaKey || ev.ctrlKey || ev.shiftKey) return;
  if (ev.key !== "Delete" && ev.key !== "Backspace") return;
  ev.preventDefault();
  ev.stopImmediatePropagation();
  if (window.__efEarly.cb) window.__efEarly.cb();
}, true);

/* ============================================================
   popup.js — ツールバーアイコンのメニュー
   アクティブタブの content script に操作メッセージを送る。
   ============================================================ */
(function () {
  const EF = window.EF || {};
  const $ = (s) => document.querySelector(s);

  // アイコン流し込み（lib/icons.js の EF.fillIcons）
  if (EF.fillIcons) EF.fillIcons(document);

  function withTab(cb) {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
      const t = tabs[0];
      if (t && t.id != null) cb(t);
    });
  }

  function setState(on) {
    const st = $("#st"), mk = $("#mk");
    st.textContent = on ? "ON" : "OFF";
    st.classList.toggle("on", !!on);
    mk.classList.toggle("on", !!on);
  }

  function isInternalUrl(url) {
    if (!url) return true;
    return /^(chrome|chrome-extension|edge|about|data|blob):/.test(url);
  }

  function showReload(tabId) {
    $("#menu").hidden = true;
    $("#note-reload").hidden = false;
    $("#reload-btn").onclick = () => {
      chrome.tabs.reload(tabId, {}, () => window.close());
    };
  }

  function showInternal() {
    $("#menu").hidden = true;
    $("#note-internal").hidden = false;
  }

  function refresh() {
    withTab((tab) => {
      if (isInternalUrl(tab.url)) { showInternal(); return; }
      chrome.tabs.sendMessage(tab.id, { type: "ef-state" }, (res) => {
        if (chrome.runtime.lastError || !res) { showReload(tab.id); return; }
        setState(res.appOn);
      });
    });
  }

  document.querySelectorAll(".item").forEach((b) => {
    b.addEventListener("click", () => {
      const cmd = b.dataset.cmd;
      withTab((tab) => {
        chrome.tabs.sendMessage(tab.id, { type: "ef-cmd", cmd }, (res) => {
          if (chrome.runtime.lastError) { showReload(tab.id); return; }
          if (res && typeof res.appOn === "boolean") setState(res.appOn);
          // 終了・設定・最小化はメニューを閉じる
          if (cmd === "off" || cmd === "options" || cmd === "minimize") window.close();
        });
      });
    });
  });

  refresh();
})();

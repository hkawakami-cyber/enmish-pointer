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
      if (t && t.id != null) cb(t.id);
    });
  }

  function setState(on) {
    const st = $("#st"), mk = $("#mk");
    st.textContent = on ? "ON" : "OFF";
    st.classList.toggle("on", !!on);
    mk.classList.toggle("on", !!on);
  }

  function unavailable() {
    $("#menu").hidden = true;
    $("#note").hidden = false;
  }

  function refresh() {
    withTab((id) => {
      chrome.tabs.sendMessage(id, { type: "ef-state" }, (res) => {
        if (chrome.runtime.lastError || !res) { unavailable(); return; }
        setState(res.appOn);
      });
    });
  }

  document.querySelectorAll(".item").forEach((b) => {
    b.addEventListener("click", () => {
      const cmd = b.dataset.cmd;
      withTab((id) => {
        chrome.tabs.sendMessage(id, { type: "ef-cmd", cmd }, (res) => {
          if (chrome.runtime.lastError) { unavailable(); return; }
          if (res && typeof res.appOn === "boolean") setState(res.appOn);
          // 終了・設定・最小化はメニューを閉じる
          if (cmd === "off" || cmd === "options" || cmd === "minimize") window.close();
        });
      });
    });
  });

  refresh();
})();

/* ============================================================
   background.js — Service Worker
   ・ショートカット / ツールバーボタン → コンテンツへ ON/OFF 通知
   ・スクショ要求 → 表示中タブをキャプチャして保存
   ============================================================ */

function sendToActive(msg) {
  chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
    if (tabs[0] && tabs[0].id != null) {
      chrome.tabs.sendMessage(tabs[0].id, msg, () => void chrome.runtime.lastError);
    }
  });
}

chrome.commands.onCommand.addListener((cmd) => {
  if (cmd === "toggle-app") sendToActive({ type: "ef-toggle" });
});

chrome.action.onClicked.addListener((tab) => {
  if (tab.id != null) chrome.tabs.sendMessage(tab.id, { type: "ef-toggle" }, () => void chrome.runtime.lastError);
});

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg && msg.type === "ef-capture") {
    const winId = sender.tab ? sender.tab.windowId : chrome.windows.WINDOW_ID_CURRENT;
    chrome.tabs.captureVisibleTab(winId, { format: "png" }, (dataUrl) => {
      if (chrome.runtime.lastError || !dataUrl) {
        sendResponse({ ok: false, error: (chrome.runtime.lastError && chrome.runtime.lastError.message) || "capture failed" });
        return;
      }
      chrome.downloads.download({ url: dataUrl, filename: msg.filename, saveAs: false }, () => {
        if (chrome.runtime.lastError) { sendResponse({ ok: false, error: chrome.runtime.lastError.message }); return; }
        sendResponse({ ok: true });
      });
    });
    return true; // 非同期レスポンス
  }
});

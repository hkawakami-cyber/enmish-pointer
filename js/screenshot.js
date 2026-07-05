/* ============================================================
   screenshot.js — 注釈付きスクリーンショット保存
   html2canvas でステージ全体（共有画面＋注釈）を画像化する。
   ファイル名は 20260627_商談レビュー_注釈.png 形式で自動生成。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  const SCENE_LABEL = { proposal: "提案資料", kpi: "KPIレビュー", salesforce: "商談画面" };

  function stamp() {
    const d = new Date();
    const p = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
  }

  function activeScene() {
    const b = document.querySelector(".ss-btn.active");
    return (b && b.dataset.scene) || "proposal";
  }

  EF.screenshot = {
    async capture() {
      if (typeof html2canvas !== "function") {
        EF.toast("html2canvas が読み込めませんでした");
        return;
      }
      EF.toast("スクリーンショットを生成中…", 1200);
      const stage = document.getElementById("stage");
      try {
        const canvas = await html2canvas(stage, {
          backgroundColor: "#0f1626",
          scale: Math.min(2, window.devicePixelRatio || 1),
          logging: false,
          ignoreElements: (el) =>
            el.id === "toolbar" || el.id === "stamp-bar" ||
            el.id === "scene-switch" || el.id === "status-badge" ||
            el.id === "toast" || el.id === "cursor-ring" || el.id === "stamp-hint",
        });
        const name = `${stamp()}_${SCENE_LABEL[activeScene()]}_注釈.png`;
        canvas.toBlob((blob) => {
          const url = URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = url; a.download = name;
          document.body.appendChild(a); a.click(); a.remove();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
          EF.toast(`保存しました: ${name}`, 2200);
        }, "image/png");
      } catch (e) {
        console.error(e);
        EF.toast("スクショ生成に失敗しました");
      }
    },

    // 注釈付きスクショをクリップボードにコピー（チャット等にすぐ貼れる）
    copy() {
      if (typeof html2canvas !== "function") { EF.toast("html2canvas が読み込めませんでした"); return; }
      if (!navigator.clipboard || !window.ClipboardItem) { EF.toast("この環境ではコピー未対応です"); return; }
      const stage = document.getElementById("stage");
      // ジェスチャ保持のため write は同期で呼び、Blob を Promise で渡す
      const blobP = html2canvas(stage, {
        backgroundColor: "#0f1626",
        scale: Math.min(2, window.devicePixelRatio || 1),
        logging: false,
        ignoreElements: (el) => el.id === "toolbar" || el.id === "stamp-bar" ||
          el.id === "scene-switch" || el.id === "status-badge" || el.id === "ef-dock" ||
          el.id === "reopen" || el.id === "edge-hint" ||
          el.id === "toast" || el.id === "cursor-ring" || el.id === "stamp-hint",
      }).then((canvas) => new Promise((res) => canvas.toBlob(res, "image/png")));
      navigator.clipboard.write([new ClipboardItem({ "image/png": blobP })])
        .then(() => EF.toast("画像をクリップボードにコピーしました", 2200))
        .catch(() => EF.toast("コピーに失敗しました（保存をお試しください）", 2400));
    },
  };
})();

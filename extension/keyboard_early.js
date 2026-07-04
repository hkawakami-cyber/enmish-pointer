// ページスクリプトより先に登録して Delete/Backspace を確実に捕捉する。
// all_frames:true で iframe 内にも注入し、postMessage で親フレームへ転送する。
(function() {
  const inIframe = window.parent !== window;

  window.__efEarly = window.__efEarly || { appOn: false, cb: null, clearCb: null };

  if (inIframe) {
    // 最上位フレーム（content.js がいる場所）に appOn 状態を問い合わせる。
    // window.parent ではなく window.top を使い、深くネストしたiframe（Slidesのキャンバス等）でも届くようにする。
    try { window.top.postMessage({ __efType: "efReq" }, "*"); } catch (e) {}
  }

  // efState を受け取ったら appOn を更新し、さらに子iframeへ転送してネストを伝播させる。
  window.addEventListener("message", function(ev) {
    if (ev.data && ev.data.__efType === "efState") {
      window.__efEarly.appOn = !!ev.data.appOn;
      // 子iframeにも転送（Slidesのような多段iframe構造に対応）
      var frames = document.querySelectorAll("iframe");
      for (var i = 0; i < frames.length; i++) {
        try { frames[i].contentWindow.postMessage(ev.data, "*"); } catch (e) {}
      }
    }
  });

  window.addEventListener("keydown", function(ev) {
    if (!window.__efEarly.appOn) return;

    // Esc：iframe（Docs等）からは最上位フレームへ転送し、ダブルEsc全消去に合流させる。
    // 文字編集中でも転送する（Escは文字を消さないので安全）。preventDefault はしない。
    // 長押しのオートリピートは転送しない（ダブルEsc全消去の誤発動防止）。
    if (ev.key === "Escape") {
      if (inIframe && !ev.repeat) { try { window.top.postMessage({ __efType: "efKey", action: "esc" }, "*"); } catch (e) {} }
      return;
    }
    if (ev.key !== "Delete" && ev.key !== "Backspace") return;

    // 入力欄フォーカス中は横取りしない（Shadow DOM内の ef-text も含む）
    var ae = document.activeElement;
    var host = document.getElementById("enmish-focus-host");
    var sae = host && host.shadowRoot && host.shadowRoot.activeElement;
    if (ae && /^(INPUT|TEXTAREA|SELECT)$/.test(ae.tagName)) return;
    if (sae && (/^(INPUT|TEXTAREA)$/.test(sae.tagName) || sae.isContentEditable)) return;
    // contentEditable（Docs/Gmail等の文字編集）は、注釈が無い限り横取りしない＝文字編集を壊さない。
    // 注釈がある時だけ Delete=注釈を1つ戻す を優先（Slides編集モード対策。
    // hasStrokes は content.js が同一フレームに定義する getter。iframe内は undefined=常に素通し）。
    if (ae && ae.isContentEditable && !window.__efEarly.hasStrokes) return;

    // Ctrl+Shift+Delete / Cmd+Shift+Delete → 全消去
    if ((ev.metaKey || ev.ctrlKey) && ev.shiftKey) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (window.__efEarly.clearCb) {
        window.__efEarly.clearCb();
      } else if (inIframe) {
        try { window.top.postMessage({ __efType: "efKey", action: "clear" }, "*"); } catch (e) {}
      }
      return;
    }

    // 修飾キーなし → 1つ戻す。
    // ツールON中は Delete を常に拡張が受け取り、ページ（Slides等）には絶対渡さない。
    // 注釈が無ければ undo は空振り＝安全。スライド削除はツールOFFにしてから。
    if (!ev.metaKey && !ev.ctrlKey && !ev.shiftKey) {
      ev.preventDefault();
      ev.stopImmediatePropagation();
      if (window.__efEarly.cb) {
        window.__efEarly.cb();
      } else if (inIframe) {
        try { window.top.postMessage({ __efType: "efKey", action: "undo" }, "*"); } catch (e) {}
      }
    }
  }, true);
})();

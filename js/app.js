/* ============================================================
   app.js — メインオーケストレーター
   各モジュールを初期化し、注釈レイヤーのポインタ操作と
   ツールバー/ショートカットからのコマンドを束ねる。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  const DRAW_TOOLS = ["pen", "highlighter", "arrow", "hline", "ellipse", "rect", "text"];

  // ZIP（無圧縮 store。PNG/webmは既に圧縮済みなので十分）
  function efCrc32(buf) {
    let table = efCrc32._t;
    if (!table) {
      table = efCrc32._t = new Uint32Array(256);
      for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1); table[n] = c >>> 0; }
    }
    let c = 0xFFFFFFFF;
    for (let i = 0; i < buf.length; i++) c = table[(c ^ buf[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
  }
  function efZip(files) { // files: [{name, data:Uint8Array}]
    const enc = new TextEncoder();
    const u16 = (n) => [n & 255, (n >>> 8) & 255];
    const u32 = (n) => [n & 255, (n >>> 8) & 255, (n >>> 16) & 255, (n >>> 24) & 255];
    const local = [], central = []; let offset = 0;
    for (const f of files) {
      const name = enc.encode(f.name), crc = efCrc32(f.data), size = f.data.length;
      const lh = [].concat(u32(0x04034b50), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0));
      local.push(new Uint8Array(lh), name, f.data);
      const ch = [].concat(u32(0x02014b50), u16(20), u16(20), u16(0), u16(0), u16(0), u16(0), u32(crc), u32(size), u32(size), u16(name.length), u16(0), u16(0), u16(0), u16(0), u32(0), u32(offset));
      central.push(new Uint8Array(ch), name);
      offset += lh.length + name.length + size;
    }
    let cenSize = 0; central.forEach((c) => (cenSize += c.length));
    const eocd = [].concat(u32(0x06054b50), u16(0), u16(0), u16(files.length), u16(files.length), u32(cenSize), u32(offset), u16(0));
    return new Blob([...local, ...central, new Uint8Array(eocd)], { type: "application/zip" });
  }
  function efDownload(blob, name) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = name;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }

  // 注釈レイヤー（ステージ上の描画）
  EF.annot = {
    engine: null,
    drawing: false,
    init() {
      const canvas = document.getElementById("annot-canvas");
      this.engine = new EF.DrawingEngine(canvas, {
        getStyle: () => ({ tool: EF.state.tool, color: EF.state.color, width: EF.state.strokeWidth, head: EF.state.arrowHead }),
        getAutoErase: () => EF.state.autoErase || 0,
      });
      window.addEventListener("resize", () => this.engine.resize());

      const stage = document.getElementById("stage");
      stage.addEventListener("mousedown", (ev) => {
        if (!EF.state.appOn || ev.button !== 0) return;
        const p = EF.stagePoint(ev);
        // ズーム中は座標がずれるため描画しない（表示専用）
        if (EF.state.zoom) return;
        // テキストはインライン入力欄で（既存テキストをクリックしたら再編集）
        if (EF.state.tool === "text") {
          ev.preventDefault();
          const hit = this.engine.hitText(p.x, p.y);
          EF.app.showTextInput(p, hit);
          return;
        }
        if (DRAW_TOOLS.indexOf(EF.state.tool) === -1) return;
        this.drawing = true;
        this.engine.start(p.x, p.y);
      });
      stage.addEventListener("mousemove", (ev) => {
        if (!this.drawing) return;
        const p = EF.stagePoint(ev);
        this.engine.move(p.x, p.y);
      });
      window.addEventListener("mouseup", () => {
        if (this.drawing) { this.drawing = false; this.engine.end(); }
      });
    },
  };

  // コマンド面
  EF.app = {
    setTool(tool) {
      if (!EF.state.appOn) this.toggleApp(true);
      EF.state.tool = tool;
      const stage = document.getElementById("stage");
      stage.classList.toggle("tool-cursor", tool === "cursor");
      stage.classList.toggle("armed", tool !== "cursor");
      EF.toolbar.sync();
      EF.options.render();
      EF.setStatus();
      EF.cursor.update();
    },

    // インラインのテキスト入力欄。hit を渡すと既存テキストの再編集。
    showTextInput(p, hit) {
      const stage = document.getElementById("stage");
      const old = stage.querySelector(".ef-text-input");
      if (old) old.remove();
      const x = hit ? hit.a.x : p.x, y = hit ? hit.a.y : p.y;
      const color = hit ? hit.color : EF.state.textColor;
      const size = hit ? hit.size : EF.state.textSize;
      const weight = hit ? hit.weight : (EF.state.textBold ? 800 : 500);
      if (hit) hit._editing = true; // 編集中は元の描画を隠す
      const inp = document.createElement("input");
      inp.className = "ef-text-input";
      inp.type = "text";
      inp.value = hit ? hit.text : "";
      inp.style.left = x + "px";
      inp.style.top = y + "px";
      inp.style.color = color;
      inp.style.fontSize = size + "px";
      inp.style.fontWeight = weight;
      stage.appendChild(inp);
      requestAnimationFrame(() => { inp.focus(); inp.select(); });
      let done = false;
      const close = (keep) => {
        if (done) return; done = true;
        inp.removeEventListener("blur", onBlur);
        const v = inp.value.trim();
        if (inp.isConnected) inp.remove();
        if (hit) {
          hit._editing = false;
          if (!keep) return;                       // Escはそのまま
          if (v) hit.text = v;                      // 更新
          else EF.annot.engine.removeStroke(hit);   // 空なら削除
        } else if (keep && v) {
          EF.annot.engine.addText(x, y, v, { color: color, size: size, weight: weight });
        }
      };
      const onBlur = () => close(true);
      inp.addEventListener("keydown", (e) => {
        e.stopPropagation();
        if (e.key === "Enter") close(true);
        else if (e.key === "Escape") close(false);
      });
      inp.addEventListener("blur", onBlur);
    },

    setColor(color) {
      EF.state.color = color;
      EF.cursor.update();
      EF.toolbar.sync();
      EF.setStatus();
      if (EF.saveSettings) EF.saveSettings();
    },

    toggle(what) {
      if (!EF.state.appOn) this.toggleApp(true);
      if (what === "spotlight") {
        EF.state.spotlight = !EF.state.spotlight;
        EF.toast(EF.state.spotlight ? "スポットライト ON （[ ] で広さ調整）" : "スポットライト OFF");
      } else if (what === "zoom") {
        EF.state.zoom = !EF.state.zoom;
        EF.zoom.refresh();
        EF.toast(EF.state.zoom ? "ズーム ON （- = で倍率調整）" : "ズーム OFF");
      }
      EF.toolbar.sync();
      EF.options.render();
      EF.setStatus();
    },

    action(name) {
      switch (name) {
        case "toggle-app": this.toggleApp(); break;
        case "undo": if (EF.state.appOn) EF.annot.engine.undo(); break;
        case "clear":
          EF.annot.engine.clear();
          EF.toast("全消去（『戻る』で復元できます）");
          break;
        case "screenshot": EF.screenshot.capture(); break;
        case "copy": EF.screenshot.copy(); break;
        case "record": this.toggleRecord(); break;
        case "settings": EF.presets.openModal(); break;
        case "hide-ui": this.toggleUI(); break;
      }
    },

    // 画面録画ボタンの見た目を更新（録画中=赤・停止アイコン）
    _syncRecordBtn() {
      const btn = document.querySelector('.tool[data-action="record"]');
      if (!btn) return;
      const rec = !!EF.state.recording;
      btn.classList.toggle("recording", rec);
      const ico = btn.querySelector(".ico");
      if (ico) {
        const name = rec ? "stop" : "record";
        ico.dataset.ic = name;
        if (EF.iconSvg) ico.innerHTML = EF.iconSvg(name);
      }
      const lbl = btn.querySelector(".lbl");
      if (lbl) lbl.textContent = rec ? "停止" : "録画";
      btn.title = rec ? "録画を停止" : "画面録画 (webm保存)";
    },

    // 画面録画のトグル（getDisplayMedia + MediaRecorder）
    toggleRecord() {
      if (EF.state.recording) { this._stopRecord(); return; }
      this._startRecord();
    },

    async _startRecord() {
      if (!navigator.mediaDevices || !navigator.mediaDevices.getDisplayMedia) {
        EF.toast("この環境では画面録画に対応していません", 2600);
        return;
      }
      let stream;
      try {
        stream = await navigator.mediaDevices.getDisplayMedia({
          video: { frameRate: { ideal: 30 } },
          audio: true,
          // いま開いているタブ（Google スライド/ドキュメント等）もピッカーで選べるように
          selfBrowserSurface: "include",
          surfaceSwitching: "include",
          systemAudio: "include",
        });
      } catch (err) {
        EF.toast("画面録画を開始できませんでした（権限が許可されていない可能性があります）", 2800);
        return;
      }
      // 録画用ストリーム。マイクONなら「画面/タブの音声」＋「自分のマイク」をミックスする
      let recStream = stream, micStream = null, audioCtx = null;
      if (EF.state.recMic) {
        try {
          micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
          const AC = window.AudioContext || window.webkitAudioContext;
          audioCtx = new AC();
          const dest = audioCtx.createMediaStreamDestination();
          if (stream.getAudioTracks().length) {
            audioCtx.createMediaStreamSource(new MediaStream(stream.getAudioTracks())).connect(dest);
          }
          audioCtx.createMediaStreamSource(micStream).connect(dest);
          recStream = new MediaStream([...stream.getVideoTracks(), ...dest.stream.getAudioTracks()]);
        } catch (err) {
          if (micStream) micStream.getTracks().forEach((t) => t.stop());
          if (audioCtx) { try { audioCtx.close(); } catch (e) { /* noop */ } }
          micStream = null; audioCtx = null; recStream = stream;
          EF.toast("マイクが取得できなかったため、画面音声のみで録画します", 2800);
        }
      }
      let rec;
      try {
        const opt = MediaRecorder.isTypeSupported("video/webm;codecs=vp9")
          ? { mimeType: "video/webm;codecs=vp9" } : { mimeType: "video/webm" };
        rec = new MediaRecorder(recStream, opt);
      } catch (err) {
        stream.getTracks().forEach((t) => t.stop());
        if (micStream) micStream.getTracks().forEach((t) => t.stop());
        if (audioCtx) { try { audioCtx.close(); } catch (e) { /* noop */ } }
        EF.toast("録画の初期化に失敗しました", 2600);
        return;
      }
      // 録画中の自動スクショ（間隔ごとに録画ストリームのフレームをPNGで貯める）
      const shotSec = EF.state.recShotSec | 0;
      const shots = []; let shotTimer = null, shotVideo = null, shotIdx = 0;
      const startMs = Date.now();
      if (shotSec > 0) {
        shotVideo = document.createElement("video");
        shotVideo.muted = true; shotVideo.playsInline = true;
        try { shotVideo.srcObject = recStream; shotVideo.play().catch(() => {}); } catch (e) { /* noop */ }
        const grab = () => {
          const vw = shotVideo.videoWidth, vh = shotVideo.videoHeight;
          if (!vw || !vh) return;
          const cv = document.createElement("canvas"); cv.width = vw; cv.height = vh;
          try { cv.getContext("2d").drawImage(shotVideo, 0, 0, vw, vh); } catch (e) { return; }
          const idx = ++shotIdx, sec = Math.round((Date.now() - startMs) / 1000);
          const mm = String(Math.floor(sec / 60)).padStart(2, "0"), ss = String(sec % 60).padStart(2, "0");
          cv.toBlob((b) => {
            if (!b) return;
            b.arrayBuffer().then((ab) => {
              shots.push({ name: `slides/${String(idx).padStart(3, "0")}_${mm}m${ss}s.png`, data: new Uint8Array(ab) });
            });
          }, "image/png");
        };
        setTimeout(grab, 1200);
        shotTimer = setInterval(grab, shotSec * 1000);
      }
      const chunks = [];
      rec.ondataavailable = (e) => { if (e.data && e.data.size) chunks.push(e.data); };
      rec.onstop = () => {
        if (shotTimer) clearInterval(shotTimer);
        if (shotVideo) { try { shotVideo.pause(); shotVideo.srcObject = null; } catch (e) { /* noop */ } }
        stream.getTracks().forEach((t) => t.stop());
        if (micStream) micStream.getTracks().forEach((t) => t.stop());
        if (audioCtx) { try { audioCtx.close(); } catch (e) { /* noop */ } }
        const blob = new Blob(chunks, { type: "video/webm" });
        const d = new Date(), p = (n) => String(n).padStart(2, "0");
        const stamp = `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}_${p(d.getHours())}${p(d.getMinutes())}`;
        EF._recorder = null; EF.state.recording = false; EF.app._syncRecordBtn();
        if (shots.length) {
          EF.toast(`記録パックを作成中…（スライド${shots.length}枚）`, 2200);
          blob.arrayBuffer().then((ab) => {
            const files = [{ name: "video.webm", data: new Uint8Array(ab) }].concat(shots);
            efDownload(efZip(files), `記録_${stamp}.zip`);
            EF.toast(`記録パックを保存：動画＋スライド${shots.length}枚`, 3000);
          });
        } else {
          efDownload(blob, `${stamp}_画面録画.webm`);
          EF.toast("録画を保存しました: " + stamp, 2600);
        }
      };
      // ユーザーが共有を停止した場合も録画停止
      const vt = stream.getVideoTracks()[0];
      if (vt) vt.onended = () => { if (EF.state.recording) this._stopRecord(); };
      EF._recorder = rec;
      EF.state.recording = true;
      this._syncRecordBtn();
      rec.start();
      const parts = ["画面"];
      if (micStream) parts.push("マイク");
      if (shotSec > 0) parts.push(`スライド自動(${shotSec}秒)`);
      EF.toast(`録画開始：${parts.join("＋")}（もう一度押すと停止）`, 2800);
    },

    _stopRecord() {
      const rec = EF._recorder;
      if (rec && rec.state !== "inactive") {
        try { rec.stop(); } catch (e) { /* noop */ }
      } else {
        EF.state.recording = false;
        this._syncRecordBtn();
      }
    },

    // ポインターモード（アプリ）のかんたんON/OFF（パレットを出さない）
    togglePointer() {
      if (EF.state.appOn) this.toggleApp();
      else this.toggleApp(true);
    },

    // UI（ツールバー・サイドバー等）の表示/非表示
    toggleUI() {
      if (!EF.state.appOn) return;
      EF.state.uiHidden = !EF.state.uiHidden;
      document.body.classList.toggle("ef-ui-hidden", EF.state.uiHidden);
      EF.dock.update();
      this.refreshAutoHide();
      EF.toast(EF.state.uiHidden ? "ツールバーを最小化（端のマークで再表示）" : "ツールバーを表示");
    },

    toggleApp(forceOn) {
      const next = forceOn ? true : !EF.state.appOn;
      // OFF→ONかつ強制でない場合はクイックパレットを一瞬見せる演出
      EF.state.appOn = next;
      document.body.classList.toggle("ef-on", next);
      if (!next) {
        // 全モードを畳む
        EF.state.spotlight = false;
        EF.state.zoom = false;
        EF.zoom.refresh();
        EF.state.uiHidden = false;
        document.body.classList.remove("ef-ui-hidden");
        document.getElementById("stage").classList.remove("armed", "tool-cursor");
        EF.toast("Enmish Pointer を終了");
      } else {
        document.getElementById("stage").classList.add(
          EF.state.tool === "cursor" ? "tool-cursor" : "armed");
        if (!EF._onboarded) {
          EF._onboarded = true;
          EF.toast("ツールを選んでドラッグで注釈 ／ 左下マークでON/OFF ／ バー下の » で最小化 ／ ⚙設定で詳細", 4600);
        } else {
          EF.toast("Enmish Pointer 起動 — カーソル強調中");
        }
      }
      document.body.classList.toggle("bar-left", EF.state.barSide === "left");
      EF.cursor.update();
      EF.toolbar.sync();
      EF.options.render();
      EF.dock.update();
      EF.setStatus();
      this.refreshAutoHide();
      // 自動表示モードは起動時に一度だけ覗かせてから引っ込める（場所の気づき用）
      if (next && EF.state.autoHide && !EF.state.uiHidden) {
        this.setReveal(true);
        if (this._revealTimer) clearTimeout(this._revealTimer);
        this._revealTimer = setTimeout(() => { this._revealTimer = null; this.setReveal(false); }, 1700);
      }
    },

    // バーの配置（ツールバー左右・ドック位置）を反映
    applyLayout() {
      const tb = document.getElementById("toolbar");
      if (tb) tb.classList.toggle("side-left", EF.state.barSide === "left");
      if (tb) tb.classList.toggle("labels-off", !EF.state.showLabels);
      const topt = document.getElementById("tool-options");
      if (topt) topt.classList.toggle("side-left", EF.state.barSide === "left");
      document.body.classList.toggle("bar-left", EF.state.barSide === "left");
      const dock = document.getElementById("ef-dock");
      if (dock) {
        dock.classList.remove("dock-bottom-right", "dock-top-left", "dock-top-right");
        if (EF.state.dockPos && EF.state.dockPos !== "bottom-left") dock.classList.add("dock-" + EF.state.dockPos);
      }
      if (EF.toolbar && EF.toolbar.fit) EF.toolbar.fit();
      this.refreshAutoHide();
    },

    // ---- 右端ホバーで自動表示（Macのドック風）----
    refreshAutoHide() {
      const tb = document.getElementById("toolbar");
      const hint = document.getElementById("edge-hint");
      const active = EF.state.appOn && EF.state.autoHide && !EF.state.uiHidden;
      if (tb) tb.classList.toggle("auto-hide", active);
      document.body.classList.toggle("ef-autohide", active);
      if (hint) hint.classList.toggle("side-left", EF.state.barSide === "left");
      if (!active) {
        if (tb) tb.classList.remove("revealed");
        this._revealed = false;
        if (this._revealTimer) { clearTimeout(this._revealTimer); this._revealTimer = null; }
      }
      if (hint) hint.hidden = !active || this._revealed;
    },
    setReveal(on) {
      const tb = document.getElementById("toolbar");
      const hint = document.getElementById("edge-hint");
      this._revealed = on;
      if (tb) tb.classList.toggle("revealed", on);
      const active = EF.state.appOn && EF.state.autoHide && !EF.state.uiHidden;
      if (hint) hint.hidden = on || !active;
    },
    reveal(on) {
      if (on) { if (this._revealTimer) { clearTimeout(this._revealTimer); this._revealTimer = null; } if (!this._revealed) this.setReveal(true); }
      else if (this._revealed && !this._revealTimer) { this._revealTimer = setTimeout(() => { this._revealTimer = null; this.setReveal(false); }, 320); }
    },
    updateReveal(x, y) {
      if (!(EF.state.appOn && EF.state.autoHide && !EF.state.uiHidden)) return;
      const HOT = 56, left = EF.state.barSide === "left";
      const nearEdge = left ? x <= HOT : x >= window.innerWidth - HOT;
      let overBar = false;
      if (this._revealed) { const tb = document.getElementById("toolbar"); if (tb) { const r = tb.getBoundingClientRect(); overBar = x >= r.left - 10 && x <= r.right + 10 && y >= r.top - 10 && y <= r.bottom + 10; } }
      this.reveal(nearEdge || overBar);
    },

    // Esc処理。何か閉じたら true。
    handleEscape() {
      if (!document.getElementById("settings").hidden) { EF.presets.closeModal(); return true; }
      if (EF.state.uiHidden) { this.toggleUI(); return true; }
      if (EF.state.zoom) { EF.state.zoom = false; EF.zoom.refresh(); EF.toolbar.sync(); EF.setStatus(); return true; }
      if (EF.state.spotlight) { EF.state.spotlight = false; EF.toolbar.sync(); EF.setStatus(); return true; }
      if (EF.state.appOn && EF.state.tool !== "cursor") { this.setTool("cursor"); return true; }
      return false;
    },
  };

  // ツール別オプション（カーソル形状 / 矢じり向き / 注目の帯）
  function optGroup(title, opt, cur, items) {
    const btns = items.map((it) =>
      `<button class="to-btn${String(it[0]) === String(cur) ? " on" : ""}" data-opt="${opt}" data-val="${it[0]}">` +
      (it[1] ? `<span class="to-ico">${it[1]}</span>` : "") + `<span>${it[2]}</span></button>`).join("");
    return `<div class="to-group"><div class="to-title">${title}</div><div class="to-btns">${btns}</div></div>`;
  }
  EF.options = {
    render() {
      const el = document.getElementById("tool-options");
      if (!el) return;
      if (!EF.state.showOptions) { el.hidden = true; return; }
      const groups = [];
      if (EF.state.appOn && EF.state.tool === "cursor") {
        groups.push(optGroup("カーソル", "cursorStyle", EF.state.cursorStyle,
          [["ring", "◎", "リング"], ["arrow", "➤", "矢印"], ["dot", "●", "ドット"], ["ringdot", "◉", "両方"], ["halo", "✦", "ハロー"]]));
        groups.push(optGroup("大きさ", "ringSize", EF.state.ring.size,
          [[28, "", "極小"], [44, "", "小"], [60, "", "中"]]));
      } else if (EF.state.appOn && EF.state.tool === "arrow") {
        groups.push(optGroup("矢じり", "arrowHead", EF.state.arrowHead,
          [["end", "→", "終点"], ["start", "←", "始点"], ["both", "↔", "両方"]]));
      }
      if (EF.state.appOn && EF.state.spotlight) {
        groups.push(optGroup("注目の形", "spotShape", EF.state.spotShape,
          [["band", "▭", "帯"], ["circle", "◯", "丸"]]));
        if (EF.state.spotShape === "band") {
          groups.push(optGroup("帯の高さ", "spotBand", EF.state.spotBand,
            [[0.25, "", "25%"], [0.5, "", "50%"], [0.75, "", "75%"]]));
        }
      }
      if (!groups.length) { el.hidden = true; return; }
      el.innerHTML = groups.join("");
      el.hidden = false;
    },
    bind() {
      const el = document.getElementById("tool-options");
      el.addEventListener("click", (e) => {
        const b = e.target.closest(".to-btn"); if (!b) return;
        const opt = b.dataset.opt; let v = b.dataset.val;
        if (opt === "ringSize") EF.state.ring.size = parseFloat(v);
        else if (opt === "spotBand") EF.state.spotBand = parseFloat(v);
        else EF.state[opt] = v;
        EF.cursor.update();
        this.render();
        EF.setStatus();
        if (EF.saveSettings) EF.saveSettings();
      });
    },
  };

  // 常駐ドック
  EF.dock = {
    init() {
      document.getElementById("dock-power").addEventListener("click", () => EF.app.togglePointer());
      const reopen = document.getElementById("reopen");
      if (reopen) reopen.addEventListener("click", () => EF.app.toggleUI());
      this.update();
    },
    update() {
      // 左下マークは常に表示。色（緑＝ON／グレー＝OFF）で機能の状態を示す。
      const power = document.getElementById("dock-power");
      power.classList.toggle("on", EF.state.appOn);
      power.title = EF.state.appOn ? "ポインター ON（クリックでOFF）" : "ポインター OFF（クリックでON）";
      // 最小化中だけ、端の再表示タブを出す
      const reopen = document.getElementById("reopen");
      if (reopen) {
        reopen.hidden = !(EF.state.appOn && EF.state.uiHidden);
        reopen.classList.toggle("side-left", EF.state.barSide === "left");
      }
    },
  };

  // シーン切替
  function bindScenes() {
    document.querySelectorAll(".ss-btn").forEach((b) =>
      b.addEventListener("click", () => EF.setScene(b.dataset.scene)));
  }

  // 初期化
  window.addEventListener("DOMContentLoaded", () => {
    EF.setScene("proposal");
    EF.cursor.init();
    EF.annot.init();
    EF.spotlight.init();
    EF.zoom.init();
    EF.toolbar.init();
    EF.shortcuts.init();
    EF.presets.init();
    bindScenes();
    EF.options.bind();
    EF.options.render();
    EF.dock.init();
    EF.app.applyLayout();

    EF.toolbar.sync();
    // 自動表示（右端ホバー）用に、ウィンドウ全体のマウス位置を監視
    window.addEventListener("mousemove", (e) => EF.app.updateReveal(e.clientX, e.clientY), true);
    EF.toast("Enmish Pointer プロトタイプ — ⌘⇧E で起動", 2600);
  });
})();

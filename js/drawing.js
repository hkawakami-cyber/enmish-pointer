/* ============================================================
   drawing.js — 注釈描画エンジン
   注釈レイヤーとミニホワイトボードの両方で使い回す。
   strokes 配列を保持し requestAnimationFrame で再描画。
   自動消去（フェードアウト）も担当する。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  const FADE_MS = 600; // 自動消去時のフェード時間

  // 文字色が明るいか（下地チップの明暗を反転させる用）
  function isLight(hex) {
    if (typeof hex !== "string") return false;
    let h = hex.replace("#", "");
    if (h.length === 3) h = h[0] + h[0] + h[1] + h[1] + h[2] + h[2];
    const r = parseInt(h.slice(0, 2), 16), g = parseInt(h.slice(2, 4), 16), b = parseInt(h.slice(4, 6), 16);
    if ([r, g, b].some(Number.isNaN)) return false;
    // 相対輝度
    return (0.2126 * r + 0.7152 * g + 0.0722 * b) > 150;
  }

  function DrawingEngine(canvas, opts) {
    opts = opts || {};
    this.canvas = canvas;
    this.ctx = canvas.getContext("2d");
    this.strokes = [];
    this.redo = [];
    this.current = null;
    this.dpr = window.devicePixelRatio || 1;
    this.getStyle = opts.getStyle || (() => ({ color: "#2f6bff", width: 6, tool: "pen" }));
    this.getAutoErase = opts.getAutoErase || (() => 0);
    this.resize();
    this._loop = this._loop.bind(this);
    requestAnimationFrame(this._loop);
  }

  DrawingEngine.prototype.resize = function () {
    const r = this.canvas.getBoundingClientRect();
    this.dpr = window.devicePixelRatio || 1;
    this.w = r.width; this.h = r.height;
    this.canvas.width = Math.max(1, Math.round(r.width * this.dpr));
    this.canvas.height = Math.max(1, Math.round(r.height * this.dpr));
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
  };

  // --- ポインタ操作 ---
  DrawingEngine.prototype.start = function (x, y) {
    const s = this.getStyle();
    if (s.tool === "text") { return; } // テキストはインライン入力で別途処理
    this.current = {
      tool: s.tool, color: s.color, width: s.width, head: s.head || "end",
      points: [{ x, y }], a: { x, y }, b: { x, y },
    };
    this.redo.length = 0; this._cleared = null;
  };

  DrawingEngine.prototype.move = function (x, y) {
    if (!this.current) return;
    const c = this.current;
    // 横線・蛍光ペンはY固定（高さが変わらない＝水平に引く）
    if (c.tool === "hline" || c.tool === "highlighter") y = c.a.y;
    c.b = { x, y };
    if (c.tool === "pen" || c.tool === "highlighter") c.points.push({ x, y });
  };

  DrawingEngine.prototype.end = function () {
    if (!this.current) return;
    const c = this.current;
    // クリックだけ（移動なし）の図形は無視
    const moved = Math.hypot(c.b.x - c.a.x, c.b.y - c.a.y) > 3 || c.points.length > 2;
    if (moved) { c.born = performance.now(); this.strokes.push(c); }
    this.current = null;
  };

  DrawingEngine.prototype.addText = function (x, y, text, opts) {
    if (!text || !text.trim()) return;
    opts = opts || {};
    const s = {
      tool: "text", text: text.trim(), a: { x, y },
      color: opts.color || "#032841",
      size: opts.size || 28,
      weight: opts.weight || 700,
      born: performance.now(),
    };
    this.strokes.push(s);
    this.redo.length = 0; this._cleared = null;
    return s;
  };

  // クリック位置にあるテキスト注釈を返す（再編集用）。なければ null。
  DrawingEngine.prototype.hitText = function (x, y) {
    const ctx = this.ctx;
    for (let i = this.strokes.length - 1; i >= 0; i--) {
      const s = this.strokes[i];
      if (s.tool !== "text") continue;
      const fs = s.size || 28;
      ctx.font = `${s.weight || 700} ${fs}px -apple-system, "Hiragino Sans", sans-serif`;
      const tw = ctx.measureText(s.text).width, pad = 8;
      if (x >= s.a.x - pad && x <= s.a.x + tw + pad && y >= s.a.y - pad && y <= s.a.y + fs + pad) return s;
    }
    return null;
  };

  DrawingEngine.prototype.removeStroke = function (s) {
    const i = this.strokes.indexOf(s);
    if (i >= 0) this.strokes.splice(i, 1);
  };

  DrawingEngine.prototype.addStamp = function (x, y, label, color) {
    this.strokes.push({ tool: "stamp", label, color, a: { x, y }, born: performance.now() });
    this.redo.length = 0; this._cleared = null;
  };

  DrawingEngine.prototype.undo = function () {
    if (this.current) { this.current = null; return; }
    // 全消去の直後なら、まず消去をなかったことに（誤操作対策）
    if (!this.strokes.length && this._cleared && this._cleared.length) {
      this.strokes = this._cleared.slice(); this._cleared = null; return;
    }
    const s = this.strokes.pop();
    if (s) this.redo.push(s);
  };
  DrawingEngine.prototype.redoLast = function () {
    const s = this.redo.pop();
    if (s) this.strokes.push(s);
  };
  DrawingEngine.prototype.clear = function () {
    // 直前の状態を1段だけ保持し、undo で復元できるようにする
    if (this.strokes.length) this._cleared = this.strokes.slice();
    this.strokes.length = 0; this.current = null; this.redo.length = 0;
  };
  DrawingEngine.prototype.isEmpty = function () {
    return this.strokes.length === 0 && !this.current;
  };

  // --- 描画ループ ---
  DrawingEngine.prototype._loop = function () {
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.w, this.h);
    const ae = this.getAutoErase();
    const now = performance.now();

    // 自動消去：寿命を過ぎたものはフェード→削除
    if (ae > 0) {
      const lifeMs = ae * 1000;
      this.strokes = this.strokes.filter((s) => now - s.born < lifeMs + FADE_MS);
    }

    for (const s of this.strokes) {
      if (s._editing) continue; // 再編集中のテキストは入力欄で表示するため描かない
      let alpha = 1;
      if (ae > 0) {
        const age = now - s.born;
        const lifeMs = ae * 1000;
        if (age > lifeMs) alpha = Math.max(0, 1 - (age - lifeMs) / FADE_MS);
      }
      this._drawStroke(ctx, s, alpha);
    }
    if (this.current) this._drawStroke(ctx, this.current, 1);

    requestAnimationFrame(this._loop);
  };

  DrawingEngine.prototype._drawStroke = function (ctx, s, alpha) {
    ctx.save();
    ctx.globalAlpha = alpha;
    ctx.lineCap = "round";
    ctx.lineJoin = "round";
    ctx.strokeStyle = s.color;
    ctx.fillStyle = s.color;
    ctx.lineWidth = s.width || 6;

    if (s.tool === "pen") {
      this._poly(ctx, s.points);
    } else if (s.tool === "highlighter") {
      ctx.globalAlpha = alpha * 0.35;
      ctx.lineWidth = (s.width || 6) * 3;
      this._poly(ctx, s.points);
    } else if (s.tool === "line" || s.tool === "hline") {
      ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
    } else if (s.tool === "arrow") {
      this._arrow(ctx, s.a, s.b, s.width || 6, s.head || "end");
    } else if (s.tool === "rect") {
      const x = Math.min(s.a.x, s.b.x), y = Math.min(s.a.y, s.b.y);
      this._roundRect(ctx, x, y, Math.abs(s.b.x - s.a.x), Math.abs(s.b.y - s.a.y), 8);
      ctx.stroke();
    } else if (s.tool === "ellipse") {
      const cx = (s.a.x + s.b.x) / 2, cy = (s.a.y + s.b.y) / 2;
      const rx = Math.abs(s.b.x - s.a.x) / 2, ry = Math.abs(s.b.y - s.a.y) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (s.tool === "text") {
      const fs = s.size || 28;
      ctx.font = `${s.weight || 700} ${fs}px -apple-system, "Hiragino Sans", sans-serif`;
      ctx.textBaseline = "top";
      const tw = ctx.measureText(s.text).width, padX = 6, padY = 4;
      // どんな背景でも読めるよう、文字色の明暗に応じた下地チップを敷く
      ctx.globalAlpha = alpha * 0.85;
      ctx.fillStyle = isLight(s.color) ? "rgba(16,24,36,0.74)" : "rgba(255,255,255,0.88)";
      this._roundRect(ctx, s.a.x - padX, s.a.y - padY, tw + padX * 2, fs + padY * 2, 6);
      ctx.fill();
      ctx.globalAlpha = alpha;
      ctx.fillStyle = s.color;
      ctx.fillText(s.text, s.a.x, s.a.y);
    } else if (s.tool === "stamp") {
      this._stamp(ctx, s, alpha);
    }
    ctx.restore();
  };

  DrawingEngine.prototype._poly = function (ctx, pts) {
    if (!pts || pts.length < 2) {
      if (pts && pts.length === 1) { ctx.beginPath(); ctx.arc(pts[0].x, pts[0].y, ctx.lineWidth / 2, 0, Math.PI * 2); ctx.fill(); }
      return;
    }
    ctx.beginPath();
    ctx.moveTo(pts[0].x, pts[0].y);
    for (let i = 1; i < pts.length - 1; i++) {
      const mx = (pts[i].x + pts[i + 1].x) / 2;
      const my = (pts[i].y + pts[i + 1].y) / 2;
      ctx.quadraticCurveTo(pts[i].x, pts[i].y, mx, my);
    }
    ctx.lineTo(pts[pts.length - 1].x, pts[pts.length - 1].y);
    ctx.stroke();
  };

  DrawingEngine.prototype._arrow = function (ctx, a, b, w, head) {
    const size = Math.max(16, w * 3.4);     // 矢じりの長さ
    const spread = Math.PI / 5.5;            // 矢じりの開き（広めで自然に）
    // 矢じりの根元までで線を止める（線が矢じりを突き抜けないように）
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const back = size * 0.72;
    const ea = { x: a.x, y: a.y }, eb = { x: b.x, y: b.y };
    if (head === "end" || head === "both") { eb.x = b.x - back * Math.cos(ang); eb.y = b.y - back * Math.sin(ang); }
    if (head === "start" || head === "both") { ea.x = a.x + back * Math.cos(ang); ea.y = a.y + back * Math.sin(ang); }
    ctx.beginPath(); ctx.moveTo(ea.x, ea.y); ctx.lineTo(eb.x, eb.y); ctx.stroke();
    const drawHead = (tip, from) => {
      const an = Math.atan2(tip.y - from.y, tip.x - from.x);
      ctx.beginPath();
      ctx.moveTo(tip.x, tip.y);
      ctx.lineTo(tip.x - size * Math.cos(an - spread), tip.y - size * Math.sin(an - spread));
      ctx.lineTo(tip.x - size * Math.cos(an + spread), tip.y - size * Math.sin(an + spread));
      ctx.closePath(); ctx.fill();
    };
    if (head === "end" || head === "both") drawHead(b, a);
    if (head === "start" || head === "both") drawHead(a, b);
  };

  DrawingEngine.prototype._roundRect = function (ctx, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + w, y, x + w, y + h, r);
    ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r);
    ctx.arcTo(x, y, x + w, y, r);
    ctx.closePath();
  };

  DrawingEngine.prototype._stamp = function (ctx, s, alpha) {
    const fs = 15;
    ctx.font = `700 ${fs}px -apple-system, "Hiragino Sans", sans-serif`;
    const padX = 11, padY = 7, th = fs + padY * 2;
    const tw = ctx.measureText(s.label).width + padX * 2;
    const x = s.a.x, y = s.a.y;
    // ピン形の吹き出し
    ctx.globalAlpha = alpha;
    ctx.fillStyle = s.color;
    this._roundRect(ctx, x, y, tw, th, 7);
    ctx.fill();
    // 下向きの三角ポインタ
    ctx.beginPath();
    ctx.moveTo(x + 14, y + th);
    ctx.lineTo(x + 26, y + th);
    ctx.lineTo(x + 14, y + th + 11);
    ctx.closePath();
    ctx.fill();
    ctx.fillStyle = "#fff";
    ctx.textBaseline = "middle";
    ctx.fillText(s.label, x + padX, y + th / 2 + 1);
  };

  EF.DrawingEngine = DrawingEngine;
})();

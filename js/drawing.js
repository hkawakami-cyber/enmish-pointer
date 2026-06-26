/* ============================================================
   drawing.js — 注釈描画エンジン
   注釈レイヤーとミニホワイトボードの両方で使い回す。
   strokes 配列を保持し requestAnimationFrame で再描画。
   自動消去（フェードアウト）も担当する。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  const FADE_MS = 600; // 自動消去時のフェード時間

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
    if (s.tool === "text") { return this._placeText(x, y, s); }
    this.current = {
      tool: s.tool, color: s.color, width: s.width,
      points: [{ x, y }], a: { x, y }, b: { x, y },
    };
    this.redo.length = 0;
  };

  DrawingEngine.prototype.move = function (x, y) {
    if (!this.current) return;
    const c = this.current;
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

  DrawingEngine.prototype._placeText = function (x, y, s) {
    const txt = window.prompt("注釈テキストを入力");
    if (txt && txt.trim()) {
      this.strokes.push({ tool: "text", text: txt.trim(), a: { x, y }, color: s.color, width: s.width, born: performance.now() });
    }
  };

  DrawingEngine.prototype.addStamp = function (x, y, label, color) {
    this.strokes.push({ tool: "stamp", label, color, a: { x, y }, born: performance.now() });
    this.redo.length = 0;
  };

  DrawingEngine.prototype.undo = function () {
    if (this.current) { this.current = null; return; }
    const s = this.strokes.pop();
    if (s) this.redo.push(s);
  };
  DrawingEngine.prototype.redoLast = function () {
    const s = this.redo.pop();
    if (s) this.strokes.push(s);
  };
  DrawingEngine.prototype.clear = function () {
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
    } else if (s.tool === "line") {
      ctx.beginPath(); ctx.moveTo(s.a.x, s.a.y); ctx.lineTo(s.b.x, s.b.y); ctx.stroke();
    } else if (s.tool === "arrow") {
      this._arrow(ctx, s.a, s.b, s.width || 6);
    } else if (s.tool === "rect") {
      const x = Math.min(s.a.x, s.b.x), y = Math.min(s.a.y, s.b.y);
      this._roundRect(ctx, x, y, Math.abs(s.b.x - s.a.x), Math.abs(s.b.y - s.a.y), 8);
      ctx.stroke();
    } else if (s.tool === "ellipse") {
      const cx = (s.a.x + s.b.x) / 2, cy = (s.a.y + s.b.y) / 2;
      const rx = Math.abs(s.b.x - s.a.x) / 2, ry = Math.abs(s.b.y - s.a.y) / 2;
      ctx.beginPath(); ctx.ellipse(cx, cy, rx, ry, 0, 0, Math.PI * 2); ctx.stroke();
    } else if (s.tool === "text") {
      ctx.globalAlpha = alpha;
      const fs = Math.max(16, (s.width || 6) * 3);
      ctx.font = `700 ${fs}px -apple-system, "Hiragino Sans", sans-serif`;
      ctx.textBaseline = "top";
      // 視認性のため白縁取り
      ctx.lineWidth = 4; ctx.strokeStyle = "rgba(255,255,255,.9)";
      ctx.strokeText(s.text, s.a.x, s.a.y);
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

  DrawingEngine.prototype._arrow = function (ctx, a, b, w) {
    const ang = Math.atan2(b.y - a.y, b.x - a.x);
    const head = Math.max(14, w * 3.2);
    ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(b.x, b.y);
    ctx.lineTo(b.x - head * Math.cos(ang - Math.PI / 7), b.y - head * Math.sin(ang - Math.PI / 7));
    ctx.lineTo(b.x - head * Math.cos(ang + Math.PI / 7), b.y - head * Math.sin(ang + Math.PI / 7));
    ctx.closePath(); ctx.fill();
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

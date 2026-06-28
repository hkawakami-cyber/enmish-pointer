/* ============================================================
   build-artifact.js — Web版（index.html + js + css）を
   単一ファイル enmish-focus-prototype.html に結合する。
   これを Artifact として公開する（claude.ai/code のWebデモ）。
   使い方:  node tools/build-artifact.js
   ============================================================ */
const fs = require("fs");
const path = require("path");
const ROOT = path.resolve(__dirname, "..");

const css = fs.readFileSync(path.join(ROOT, "css/styles.css"), "utf8");

// JS の読み込み順は index.html と一致させる
const jsFiles = [
  "js/vendor/html2canvas.min.js",
  "js/icons.js", "js/state.js", "js/scenes.js", "js/drawing.js", "js/cursor.js",
  "js/spotlight.js", "js/zoom.js", "js/toolbar.js", "js/shortcuts.js",
  "js/screenshot.js", "js/presets.js", "js/app.js",
];

const html = fs.readFileSync(path.join(ROOT, "index.html"), "utf8");
const bodyInner = html.split("<body>")[1].split("</body>")[0];
const markup = bodyInner.replace(/\s*<script src="[^"]*"><\/script>/g, "").trim();

// 先頭で UTF-8 を明示（charset 無しで配信されても日本語が化けないよう、HTMLのエンコーディング先読みに拾わせる）
let out = `<meta charset="utf-8">\n<style>\n${css}\n</style>\n${markup}\n`;
for (const f of jsFiles) {
  out += `<script>\n${fs.readFileSync(path.join(ROOT, f), "utf8")}\n</script>\n`;
}

fs.writeFileSync(path.join(ROOT, "enmish-focus-prototype.html"), out);
console.log("built enmish-focus-prototype.html:", out.length, "bytes");

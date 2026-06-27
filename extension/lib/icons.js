/* ============================================================
   icons.js — ツールバー/ドック用の統一ラインアイコン（SVG）
   絵文字を使わず、currentColor のストロークで描く。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  // 各アイコンの内側マークアップ（viewBox 0 0 24 24）
  EF.ICON_PATHS = {
    cursor: '<circle cx="12" cy="12" r="7.5"/><circle cx="12" cy="12" r="2.2" fill="currentColor" stroke="none"/>',
    pen: '<path d="M16.5 4.5l3 3-10.5 10.5-4 1 1-4z"/><path d="M14 7l3 3"/>',
    highlighter: '<path d="M4 20.5h11" stroke-width="2.8"/><path d="M8.5 16.5l-3-3 8.5-8.5 3 3z"/><path d="M13 5l3 3"/>',
    arrow: '<path d="M6 18L18 6"/><path d="M9.5 6H18v8.5"/>',
    hline: '<path d="M3.5 12H20.5"/>',
    ellipse: '<circle cx="12" cy="12" r="8"/>',
    rect: '<rect x="4" y="6" width="16" height="12" rx="2.5"/>',
    text: '<path d="M5 6h14"/><path d="M12 6v13"/>',
    spotlight: '<circle cx="12" cy="12" r="4.4"/><path d="M12 2.5v2.4M12 19.1v2.4M2.5 12h2.4M19.1 12h2.4M5 5l1.7 1.7M17.3 17.3 19 19M19 5l-1.7 1.7M6.7 17.3 5 19"/>',
    zoom: '<circle cx="11" cy="11" r="6.2"/><path d="M15.5 15.5L21 21"/>',
    options: '<path d="M4 7h16M4 12h16M4 17h16"/><circle cx="9" cy="7" r="2.3" fill="currentColor" stroke="none"/><circle cx="15" cy="12" r="2.3" fill="currentColor" stroke="none"/><circle cx="8" cy="17" r="2.3" fill="currentColor" stroke="none"/>',
    undo: '<path d="M8.5 7L4 11l4.5 4"/><path d="M4 11h10a5.5 5.5 0 0 1 0 11H9"/>',
    clear: '<path d="M4.5 7h15"/><path d="M9 7V5.2A1.2 1.2 0 0 1 10.2 4h3.6A1.2 1.2 0 0 1 15 5.2V7"/><path d="M6.5 7l1 12.2A1.5 1.5 0 0 0 9 20.7h6a1.5 1.5 0 0 0 1.5-1.5L17.5 7"/><path d="M10 10.5v6M14 10.5v6"/>',
    save: '<rect x="3" y="7" width="18" height="13" rx="2.5"/><path d="M8 7l1.6-2.6h4.8L16 7"/><circle cx="12" cy="13.3" r="3.3"/>',
    power: '<path d="M12 3.5v8"/><path d="M7.6 6.4a7 7 0 1 0 8.8 0"/>',
    bars: '<rect x="4" y="4.5" width="16" height="15" rx="2"/><path d="M4 9h16"/>',
  };

  EF.iconSvg = function (name, size) {
    const inner = EF.ICON_PATHS[name];
    if (!inner) return "";
    const s = size || 18;
    return `<svg viewBox="0 0 24 24" width="${s}" height="${s}" fill="none" stroke="currentColor" ` +
      `stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${inner}</svg>`;
  };

  // data-ic 属性を持つ要素にアイコンを流し込む
  EF.fillIcons = function (root) {
    (root || document).querySelectorAll("[data-ic]").forEach((el) => {
      el.innerHTML = EF.iconSvg(el.dataset.ic, el.dataset.icSize ? +el.dataset.icSize : 18);
    });
  };
})();

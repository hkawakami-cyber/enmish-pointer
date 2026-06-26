/* ============================================================
   stamps.js — 営業テンプレ注釈 / KPIマーカー
   チップをクリック→「配置待ち」→ステージクリックでラベル配置。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  function buildChips(containerId, items) {
    const box = document.getElementById(containerId);
    box.innerHTML = "";
    items.forEach((it) => {
      const chip = document.createElement("button");
      chip.className = "chip";
      chip.textContent = it.label;
      chip.style.background = it.color;
      chip.addEventListener("click", () => EF.stamps.arm(it, chip));
      box.appendChild(chip);
    });
  }

  EF.stamps = {
    init() {
      buildChips("stamp-chips", EF.SALES_TEMPLATES);
      buildChips("kpi-chips", EF.KPI_MARKERS);

      // 左バーの表示/非表示
      const bar = document.getElementById("stamp-bar");
      const reopen = document.getElementById("sb-reopen");
      document.getElementById("sb-hide").addEventListener("click", () => {
        bar.classList.add("collapsed");
        reopen.hidden = false;
      });
      reopen.addEventListener("click", () => {
        bar.classList.remove("collapsed");
        reopen.hidden = true;
      });
    },

    arm(item, chipEl) {
      if (!EF.state.appOn) { EF.toast("先に Enmish Focus を起動してください（⌘⇧E）"); return; }
      document.querySelectorAll(".chip.armed").forEach((c) => c.classList.remove("armed"));
      if (EF.state.armedStamp && EF.state.armedStamp.label === item.label) {
        // 同じものを再クリックで解除
        this.disarm();
        return;
      }
      EF.state.armedStamp = item;
      if (chipEl) chipEl.classList.add("armed");
      document.getElementById("stamp-hint").hidden = false;
    },

    disarm() {
      EF.state.armedStamp = null;
      document.querySelectorAll(".chip.armed").forEach((c) => c.classList.remove("armed"));
      document.getElementById("stamp-hint").hidden = true;
    },

    // ステージクリック時に呼ばれる。配置したら true を返す。
    tryPlace(p) {
      if (!EF.state.armedStamp) return false;
      EF.annot.engine.addStamp(p.x, p.y, EF.state.armedStamp.label, EF.state.armedStamp.color);
      this.disarm();
      return true;
    },
  };
})();

/* ============================================================
   scenes.js — デモ用の疑似「共有画面」
   実機では任意アプリ上に重ねるが、Webでは検証用に
   営業支援業務でありがちな画面を用意する。
   ============================================================ */
(function () {
  const EF = (window.EF = window.EF || {});

  const SCENES = {
    proposal: `
      <div class="surface">
        <div class="surface-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
          <span class="surface-url">提案資料 ｜ エンミッシュ 営業支援プラン.key</span></div>
        <div class="slide">
          <div class="eyebrow">ENMISH PROPOSAL</div>
          <h1>インサイドセールス立ち上げ支援プラン</h1>
          <ul>
            <li>BDR / IS 体制の設計と立ち上げ代行</li>
            <li>架電リスト作成・トークスクリプト設計</li>
            <li>商談化までの歩留まりモニタリング</li>
            <li>SalesforceダッシュボードでのKPI可視化</li>
          </ul>
          <div class="price-box">
            <div class="price-card"><div class="pc-name">初期構築</div><div class="pc-amt">¥480,000</div></div>
            <div class="price-card feature"><div class="pc-name">月額運用（おすすめ）</div><div class="pc-amt">¥320,000<span style="font-size:14px">/月</span></div></div>
            <div class="price-card"><div class="pc-name">成果報酬</div><div class="pc-amt">商談 ¥15,000</div></div>
          </div>
        </div>
      </div>`,

    kpi: `
      <div class="surface">
        <div class="surface-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
          <span class="surface-url">KPIレビュー ｜ Q2 架電・商談化サマリ - Google スプレッドシート</span></div>
        <div class="sheet">
          <table>
            <tr><th>月</th><th>架電数</th><th>接触</th><th>接触率</th><th>商談化</th><th>受注</th><th>受注率</th></tr>
            <tr><td>4月</td><td>2,400</td><td>720</td><td>30%</td><td>96</td><td>12</td><td class="good">12.5%</td></tr>
            <tr><td>5月</td><td>2,650</td><td>742</td><td>28%</td><td>84</td><td>9</td><td class="bad">10.7%</td></tr>
            <tr><td>6月</td><td>2,800</td><td>700</td><td class="bad">25%</td><td>70</td><td>6</td><td class="bad">8.6%</td></tr>
            <tr><td>合計</td><td>7,850</td><td>2,162</td><td>27.5%</td><td>250</td><td>27</td><td>10.8%</td></tr>
          </table>
        </div>
      </div>`,

    salesforce: `
      <div class="surface">
        <div class="surface-bar"><span class="dot r"></span><span class="dot y"></span><span class="dot g"></span>
          <span class="surface-url">Salesforce ｜ 商談: 株式会社サンプル商事 - 新規SaaS導入</span></div>
        <div class="sf">
          <div class="sf-top"><div class="sf-kicker">商談 / Opportunity</div><h2>株式会社サンプル商事 — 新規SaaS導入</h2></div>
          <div class="sf-stage">
            <div class="sf-step done">リード</div>
            <div class="sf-step done">初回商談</div>
            <div class="sf-step curr">提案・見積</div>
            <div class="sf-step">最終交渉</div>
            <div class="sf-step">受注</div>
          </div>
          <div class="sf-grid">
            <div class="sf-field"><div class="k">金額</div><div class="v">¥3,840,000</div></div>
            <div class="sf-field"><div class="k">完了予定日</div><div class="v">2026/07/31</div></div>
            <div class="sf-field"><div class="k">フェーズ</div><div class="v">提案・見積 (確度60%)</div></div>
            <div class="sf-field"><div class="k">次のステップ</div><div class="v">決裁者へ提案、見積提示</div></div>
            <div class="sf-field"><div class="k">商談所有者</div><div class="v">川上（FS）</div></div>
            <div class="sf-field"><div class="k">リードソース</div><div class="v">アウトバウンド架電</div></div>
          </div>
        </div>
      </div>`,
  };

  EF.setScene = function (key) {
    const root = document.getElementById("scene-root");
    root.innerHTML = SCENES[key] || SCENES.proposal;
    document.querySelectorAll(".ss-btn").forEach((b) =>
      b.classList.toggle("active", b.dataset.scene === key));
  };
})();

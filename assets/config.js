/* =========================================================
 *  PAS English Lab — 全站設定（只要改這一個檔）
 * =========================================================
 *  後端：Supabase Edge Function（2026-07 由 Google Apps Script 遷移，快 5~10 倍）。
 *  API_KEY 是 Supabase 的 Publishable key，官方定義為「可安全公開」的前端金鑰。
 */
window.PAS_CONFIG = {
  API_URL: "https://nvnrkzveyehcnlaszzin.supabase.co/functions/v1/paslab-api",
  API_KEY: "sb_publishable_8-cmiPFlZNzWu4VyhMA7dA_B0hteB1u"
};

/* 共用：呼叫後端 API。
   內建「⏳ 處理中」提示條：只要有請求在跑就顯示，讓使用者知道系統在工作。 */
(function () {
  let busy = 0, bar = null;
  function indicator(on) {
    if (!bar) {
      bar = document.createElement('div');
      bar.textContent = '⏳ 處理中，請稍候…';
      bar.style.cssText = 'position:fixed;top:0;left:0;right:0;z-index:9999;text-align:center;' +
        'padding:7px;font-size:14px;font-weight:700;color:#04120a;background:#00ff88;' +
        'font-family:inherit;display:none;box-shadow:0 2px 10px rgba(0,0,0,.4)';
      (document.body || document.documentElement).appendChild(bar);
    }
    bar.style.display = on ? 'block' : 'none';
  }
  window.apiCall = async function (payload) {
    busy++; try { indicator(true); } catch (e) {}
    try {
      const res = await fetch(window.PAS_CONFIG.API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "text/plain;charset=utf-8",
          "Authorization": "Bearer " + window.PAS_CONFIG.API_KEY
        },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } finally {
      busy--; if (busy <= 0) { busy = 0; try { indicator(false); } catch (e) {} }
    }
  };
})();

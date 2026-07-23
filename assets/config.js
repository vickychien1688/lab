/* =========================================================
 *  PAS English Lab — 全站設定（只要改這一個檔）
 * =========================================================
 *  部署好 Google Apps Script 後，把「網頁應用程式」的 /exec 網址
 *  貼到下面 API_URL 即可。學生 App 與後台都會讀這裡。
 */
window.PAS_CONFIG = {
  // ↓↓↓ 你的 GAS /exec 網址（已設定好）↓↓↓
  API_URL: "https://script.google.com/macros/s/AKfycbxNackZqJWK2TeVyQsi-zarT3K_Z594U2rk5bPJTzg5OZ2S15Fjs1p7GtmEybz4R4X8rw/exec"
};

/* 共用：呼叫後端 API（POST + text/plain，避開 CORS 預檢，可讀回應）
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
        headers: { "Content-Type": "text/plain;charset=utf-8" },
        body: JSON.stringify(payload)
      });
      return await res.json();
    } finally {
      busy--; if (busy <= 0) { busy = 0; try { indicator(false); } catch (e) {} }
    }
  };
})();

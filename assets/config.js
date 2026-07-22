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

/* 共用：呼叫後端 API（POST + text/plain，避開 CORS 預檢，可讀回應） */
window.apiCall = async function (payload) {
  const res = await fetch(window.PAS_CONFIG.API_URL, {
    method: "POST",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  });
  return res.json();
};

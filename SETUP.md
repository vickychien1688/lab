# 部署說明（30 分鐘，全部免費）

整套系統分兩半，各自免費：

| 部分 | 放哪 | 做什麼 |
|------|------|--------|
| 前端（學生 App + 老師後台） | GitHub Pages | 學生錄音、老師管理的網頁 |
| 後端 API + 資料庫 | Google Apps Script + Google Sheet + Drive | 存錄音、存課程、驗證密碼 |

照著下面做一次即可，之後改課文、改密碼都在網頁後台完成，不用再碰程式碼。

---

## 步驟 1：建立後端（Google Apps Script）

1. 開 <https://script.google.com> → 新增專案。
2. 把 `gas/Code.gs` 的**全部內容**貼進去，取代原本的 `myFunction`。
3. 上方函式選單選 **`setup`** → 按 **執行**。
   - 第一次會跳「授權」→ 選你的 Google 帳號 → 「進階 / 前往（不安全）」→ 允許。
     （這是 Google 對自己寫的腳本的正常提示，因為程式要幫你建 Sheet 和 Drive 資料夾。）
   - 執行完，點下方「執行紀錄」，會看到：
     - 「資料庫試算表：」+ 一個網址（這就是你的資料庫，之後可直接開來看）
     - 「錄音資料夾ID」
4. **部署**：右上「部署」→「新增部署作業」→ 齒輪選 **網頁應用程式**：
   - 說明：隨意
   - 執行身分：**我**
   - 具有存取權的使用者：**所有人**
   - 按「部署」→ 複製那條 **網頁應用程式網址**（結尾是 `/exec`）。

> 之後若改了 `Code.gs`，要「部署 → 管理部署作業 → 編輯（鉛筆）→ 版本選『新版本』→ 部署」，網址不變。

---

## 步驟 2：接上前端

打開 `assets/config.js`，把 `API_URL` 換成步驟 1 複製的 `/exec` 網址：

```js
window.PAS_CONFIG = {
  API_URL: "https://script.google.com/macros/s/你的部署碼/exec"
};
```

存檔。

---

## 步驟 3：上架到 GitHub Pages

把這個資料夾整包推到你的 `pas-english/lab` repo（會覆蓋舊的 index.html 與 G7/G8）：

```bash
cd pas-english-lab
git init
git remote add origin https://github.com/pas-english/lab.git
git add .
git commit -m "跟讀系統 v2 + 老師後台"
git branch -M main
git push -f origin main
```

然後在 GitHub repo → **Settings → Pages** → Source 選 `main` / `/ (root)` → 存檔。
等 1–2 分鐘，網站會出現在：

- 學生首頁： `https://pas-english.github.io/lab/`
- 老師後台： `https://pas-english.github.io/lab/admin.html`

---

## 步驟 4：第一次登入後台

- 後台預設密碼：**`1234`**
- 進去後到 **⚙️ 設定** 分頁，**馬上改成你自己的密碼**。
- 到 **📚 課程管理** 就能新增班級、新增課文、貼示範音檔網址——不用再改 HTML。

---

## 老師的日常操作

| 想做的事 | 去哪 |
|----------|------|
| 聽學生錄音、打分數、寫評語 | 🎧 學生錄音 |
| 看誰交了、誰沒交 | 👤 學生繳交 |
| 看各課繳交數、平均分 | 📊 統計 |
| 新增/修改班級與課文、換示範音檔 | 📚 課程管理 |
| 改後台密碼 | ⚙️ 設定 |

## 新增示範音檔的兩種方式

1. **（推薦）放進 repo**：把 mp3 丟進 repo（例如 `G9/lesson1.mp3`），推上去後，
   在後台課文的「示範音檔網址」填相對路徑 `G9/lesson1.mp3`。同網域最穩定，混音一定錄得進去。
2. **外部網址**：貼完整 `https://...mp3`，但該網址必須支援 CORS，否則老師示範聲音會錄不進學生的檔案。

---

## 常見問題

- **後台顯示「連線失敗」**：`config.js` 的 `API_URL` 沒貼對，或 GAS 部署的存取權不是「所有人」。
- **學生按送出失敗**：同上，多半是 `API_URL` 問題；也可能是瀏覽器沒給麥克風權限。
- **想備份 / 匯出成績**：直接打開步驟 1 記錄的那份 Google 試算表，`Submissions` 分頁就是全部繳交紀錄，可用 Google 內建功能匯出 Excel。
- **錄音檔在哪**：你的 Google Drive → `PAS English Lab Recordings` 資料夾。

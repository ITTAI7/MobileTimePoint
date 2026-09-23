# SYSTEM — 系統規格與部署說明

給接手建置／部署本專案的人或 AI agent。使用說明請看 `note.md`。

---

## 1. 系統概觀

**MobileTimePoint** — 家庭用的週末手機時間積分獎勵 PWA。

```
瀏覽器 (React SPA / PWA)
        │  fetch  HTTPS
        ▼
Google Apps Script Web App  (/exec)
        │
        ▼
Google 試算表（3 個分頁，唯一的資料來源）
```

**沒有自己的後端伺服器。** 前端是純靜態產出，資料的讀寫全部打 Google Apps Script。
部署時只需要一個靜態檔案主機，不需要 Node runtime、不需要資料庫。

---

## 2. 技術棧

| 項目 | 版本 | 備註 |
|---|---|---|
| React | 19 | |
| Vite | 8.3 | rolldown-based |
| Tailwind CSS | 4.3 | 透過 `@tailwindcss/vite` |
| vite-plugin-pwa | 1.3 | `generateSW` 模式，autoUpdate |
| TypeScript | 7.0 | 僅型別檢查，不參與建置 |
| lucide-react / motion | | 圖示與動畫 |

建置驗證環境：Node 24.16.0、npm 11.13.0。

**`esbuild` 必須維持 `^0.28.0`。** Vite 8 的 peer dependency 要求 `^0.27.0 || ^0.28.0`，
專案原本宣告的 `^0.25.0` 會讓 `npm install` 直接 ERESOLVE 失敗。

**倉庫內沒有 lock 檔。** 原本的 `bun.lock` 仍鎖著修正前的 `esbuild ^0.25.0`，
與上述修正衝突，已移除以免安裝到裝不起來的舊版本。
安裝時會依 `package.json` 的版本範圍重新解析，並產生該套件管理器自己的 lock 檔。

---

## 3. 建置與部署

```bash
npm install
npm run lint     # tsc --noEmit，目前零錯誤
npm run build    # 產出到 dist/
```

已驗證的建置結果（約 9 秒）：

```
dist/index.html                   1.70 kB
dist/assets/index-*.css          48.35 kB │ gzip   8.26 kB
dist/assets/index-*.js          417.02 kB │ gzip 126.93 kB
dist/manifest.webmanifest
dist/sw.js  dist/workbox-*.js            （PWA，precache 15 項 / 480 KiB）
```

**部署方式：把 `dist/` 整個目錄當靜態網站託管即可。** 不需要 SSR、不需要 API 代理、不需要後端 runtime。

其他指令：`npm run dev`（port 3000、`--host 0.0.0.0`）、`npm run preview`。
`npm run clean` 裡提到的 `server.js` 並不存在，是樣板殘留。

### 部署到 Vercel

**這是目前的部署目標。** 匯入 GitHub 倉庫後，Vercel 的 Vite 預設值即可直接使用：

| 設定 | 值 |
|---|---|
| Framework Preset | Vite |
| Build Command | `npm run build` |
| Output Directory | `dist` |
| Install Command | `npm install`（預設） |
| Root Directory | `./`（`package.json` 在倉庫根目錄） |
| Environment Variables | **不需要任何一個** |

**Node 版本**：Vite 8 要求 `^20.19.0 || >=22.12.0`。專案沒有宣告 `engines`，
所以會用 Vercel 的預設版本 —— 請確認專案設定裡的 Node.js Version 不低於上述需求。

**倉庫內的 `vercel.json` 只做一件事：設定快取標頭。**

- `/assets/*` → 一年 immutable（檔名帶內容雜湊，安全）
- `/sw.js`、`/registerSW.js`、`/manifest.webmanifest` → `max-age=0, must-revalidate`

實測 Vercel 的預設值本來就是 `public, max-age=0, must-revalidate`，所以 Service Worker
**預設已經是安全的**，不會發生「卡在舊版本拿不到更新」的經典 PWA 問題。
這份設定的實際效益是**讓帶雜湊的 `/assets/*` 能被長期快取**（預設每次都要回源驗證，浪費往返），
另外把 Service Worker 相關檔案的行為明文寫死，避免哪天平台預設值改變。

**不需要 SPA rewrite。** 本專案沒有前端路由，只有單一頁面（分頁切換是 React state，不改網址），
所以不要加 catch-all rewrite，以免干擾 Service Worker 對靜態檔案的請求。

### 部署限制（適用於任何平台）

1. **必須掛在網域根目錄。**
   PWA manifest 的 `id` / `start_url` / `scope` 都是 `/`（見 `vite.config.ts`）。
   若要部署到子路徑，必須同時修改 Vite 的 `base` 與 manifest 這三個欄位，否則 Service Worker 與「安裝 App」會失效。
   （Vercel 預設就是根目錄，不受此限。）

2. **必須是 HTTPS**（`localhost` 除外），否則 Service Worker 不會註冊，PWA 功能全失。
   （Vercel 自動提供 HTTPS，不受此限。）

3. **瀏覽器要連得到 `script.google.com`。**
   資料是從使用者的瀏覽器直接打 Apps Script，**不經過部署主機**。
   所以 Vercel 這端不需要任何網路設定；但若使用者所在網路（例如公司內網）封鎖該網域，
   App 會退回本機快取模式並顯示警示橫幅。

4. **不需要任何環境變數。** 見第 6 節。

---

## 4. 後端 API 契約

**後端原始碼不在本倉庫內。** 它只存在於 Google Apps Script 專案裡（開發者本機另有一份 `gas/Code.gs`）。
部署前端**不需要**動到後端；Apps Script 已經是部署好的狀態，前端只是呼叫它。

若需要修改後端，必須手動貼進 Apps Script 編輯器並重新部署 —— 沒有自動化流程。

重新部署務必走：**部署 → 管理部署作業 → 選現有部署 → 編輯（鉛筆）→ 版本選「新版本」→ 部署**。
使用「新增部署作業」會產生**全新的 `/exec` 網址**，舊網址立即 404，前端會整個連不上。

### 讀取

```
GET  {EXEC_URL}              → 只回傳「本週」（週日~週六）的存摺紀錄
GET  {EXEC_URL}?range=all    → 回傳完整歷史
```

回應：

```json
{
  "status": "success",
  "任務與配分表":        [ ... ],
  "積分明細/點數存摺":   [ ... ],
  "使用者資料與餘額":    [ ... ],
  "range": "week",
  "weekStart": "2026-09-19T16:00:00.000Z",
  "weekEnd":   "2026-09-26T16:00:00.000Z",
  "logsTotal": 11,
  "trustedDevices": [ { "credentialId": "...", "label": "爸爸的手機", "registeredAt": "..." } ],
  "maxTrustedDevices": 2,
  "timestamp": "..."
}
```

`trustedDevices` 存在 **ScriptProperties**（不在試算表裡），所以清空試算表不會影響它。

### 寫入

`POST {EXEC_URL}`，`Content-Type: text/plain;charset=utf-8`，body 為 JSON。
用 `text/plain` 是為了避開 CORS preflight。

| `action` | 用途 | 冪等 |
|---|---|---|
| `addLog`（省略時的預設） | 新增一筆點數異動，並同步更新使用者餘額 | **否** |
| `addTask` | 新增任務項目，編號由伺服器接續產生 | **否** |
| `updateLog` | 依 `logId` 修改既有紀錄的 `timestamp` / `taskName` / `note` | 是 |
| `updatePassword` | 更新 ADM 的密碼 | 是 |
| `recalculate` | 以存摺為準重算所有餘額，可帶 `dryRun` | 是 |
| `registerDevice` | 登記一支受信任裝置（需 `password`、`credentialId`、`label`） | 是 |
| `removeDevice` | 移除受信任裝置（需 `password`、`credentialId`） | 是 |

回應一律是 `{"status": "success"|"error", ...}`。錯誤時可能帶 `code`：
`INSUFFICIENT_POINTS`（兌換透支）、`LOG_NOT_FOUND`、`BUSY`（拿不到寫入鎖）、
`BAD_PASSWORD`（裝置操作的密碼不符）、`DEVICE_LIMIT`（受信任裝置已達 2 支）。

### 呼叫時的兩個陷阱

**a) POST 的回應經常遺失，但寫入其實已經成功。**
Apps Script 的 `/exec` 是「先執行 doPost，再 302 轉址去取結果」。轉址那一段會間歇性回 Google 的 404 頁面。**此時資料已經寫進試算表了。**

→ 失敗時**先用 GET 核對資料在不在，不要盲目重試**。`addLog` / `addTask` 不是冪等的，重送會產生重複紀錄與重複扣分。

**b) 用 curl 測試時不要加 `-X POST`。**

```bash
# 正確
curl -sk -L --data-binary @payload.json \
     -H 'Content-Type: text/plain;charset=utf-8' "$EXEC_URL"

# 錯誤：-X POST 會讓 curl 在轉址後仍用 POST，得到 405
# 錯誤：不加 --data-binary 而用管線餵入，會漏 Content-Length，得到 411
```

### 伺服器端的資料保護

- **欄位以標題名稱比對**（`findCol_`），不依賴欄位順序，可自由調整試算表欄位位置。
  注意 `Current_Points (目前積分)` 字串裡也含有 `Points`，所以找 Points 欄時會排除餘額欄。
- **兌換不得透支**：類別含「兌換」且異動後餘額為負時拒絕。前端沒帶 `category` 時，伺服器會回任務表用任務名稱反查，所以直接呼叫 API 也繞不過。
- **扣分可累計負分**，不受上述限制（刻意的設計）。
- **餘額由伺服器計算**（讀試算表現值 + 異動量），不採用前端送來的 `newBalance`。
- **所有寫入包在 `LockService` 內**，確保「讀現值 → 判斷 → 寫回」不可分割。
- **裝置登記／移除一律在伺服器驗家長密碼**，空密碼直接拒絕。否則任何人直接打 API 就能佔滿兩個名額，或把家長的手機踢掉。
- **名額上限由伺服器把關**（`MAX_TRUSTED_DEVICES = 2`）；重複登記同一個 `credentialId` 只更新名稱，不佔用新名額。
- 兩支裝置都遺失時，在 Apps Script 編輯器執行 `resetTrustedDevices()` 清空名單。密碼登入不受影響，不會被鎖在外面。

---

## 5. 前後端的耦合點（改動前務必確認）

| 耦合點 | 位置 | 說明 |
|---|---|---|
| Apps Script 網址 | `src/utils/sheetData.ts` 第 3 行 `DEFAULT_GAS_API_URL` | 也可在 App 設定畫面覆寫，存在 localStorage |
| doGet 輸出 key | Apps Script 的 `OUTPUT_KEYS` | **必須維持 `積分明細/點數存摺`**，前端讀這個名稱。與試算表分頁實際叫什麼無關 |
| 試算表分頁名 | Apps Script 的 `SHEET_NAMES` | 分頁改名只需改這裡。目前容許 `點數存摺` / `積分明細/點數存摺` 兩種 |
| 試算表欄位名 | 兩邊都有 | 前端 `parseClean*` 與後端 `findCol_` 都靠欄位名比對 |
| 受信任裝置 | 後端 ScriptProperties `trusted_devices_v1` | 前端以 `credentialId` 比對。**本機憑證必須同時在伺服器名單上才算受信任** —— 只看 localStorage 的話，偽造一筆就能繞過 |
| 週的定義 | 前後端各一份 | 前端 `getWeekRange()`、後端 `weekRange_()`，皆為「週日 00:00 起、下週日 00:00 止」，邏輯必須一致 |

**時區**：Apps Script 專案時區必須與試算表時區相同（目前為 `Asia/Taipei`），否則週的分界會偏移數小時。

---

## 6. 環境變數

**本專案不需要任何環境變數。**

`.env.example` 裡的 `GEMINI_API_KEY` 與 `APP_URL` 是 Google AI Studio 樣板殘留，程式碼完全沒有使用。
`metadata.json` 宣告的 `MAJOR_CAPABILITY_SERVER_SIDE_GEMINI_API` 同理 —— 專案沒有任何 Gemini 呼叫。
若部署平台不要求，這些都可以移除。

`package.json` 中的 `@google/genai`、`express`、`dotenv` 同樣**沒有被任何原始碼引用**，可安全移除以縮小依賴。

---

## 7. 已知問題

| 問題 | 影響 | 建議 |
|---|---|---|
| `vite.config.ts` 使用 `__dirname` | 目前只是警告，未來 Vite 版本會不支援 | 改用 `import.meta.dirname` |
| 倉庫未納入 lock 檔 | 不同時間安裝可能取得不同的相依版本 | 若需可重現的建置，在部署環境提交該環境產生的 lock 檔 |
| 家長密碼僅前端驗證 | 明碼寫在 bundle 與試算表，開 DevTools 即可看到 | 定位是「防小孩誤按」，**不是安全機制**。不要用它保護真正敏感的東西 |
| 寫入失敗時的網路錯誤會走 `no-cors` 後備 | 該路徑讀不到回應，無法判斷成功與否 | 標為 `confirmed: false`，前端改去試算表核對該筆 `logId` 是否存在，不直接當成功 |
| 指紋解鎖不做密碼學驗證 | WebAuthn 的簽章沒有送回伺服器檢查，開 DevTools 可繞過 | 與密碼同級的「防小孩」機制。名額上限與名單本身是伺服器把關的，那部分繞不過 |
| `trustedDevices` 在 doGet 公開回傳 | 任何人打 exec 網址都看得到裝置標籤與 credentialId | 實害有限（沒有私鑰按不出指紋）。要收斂的話，改成只回「這台在不在名單上」，完整名單驗密碼才給 |
| 登記被伺服器拒絕時，手機裡的 passkey 無法刪除 | WebAuthn 沒有提供刪除 API，只能由使用者自行到密碼管理員清 | 送出前先用已載入的名單檢查名額，縮小發生窗口。**不可以改成先查伺服器再建憑證** —— `credentials.create` 需要使用者手勢，中間插入網路請求會讓指紋視窗叫不出來 |
| 補登過去日期的紀錄需直接呼叫 API | App 介面只能記錄「當下」時間 | 若常用，可在家長操作區加日期選擇器 |

---

## 8. 檔案結構

```
src/
  App.tsx                    狀態容器：載入資料、確認寫入後才更新、密碼鎖與裝置名單
  types.ts                   試算表原始欄位 → 乾淨型別的對應
  utils/sheetData.ts         資料層：API 讀寫、欄位容錯解析、週區間、localStorage 快取
  utils/biometric.ts         WebAuthn 平台驗證器：註冊／驗證指紋，錯誤訊息中文化
  components/
    KidView.tsx              小孩檢視區：積分、兌換卡片、本週明細
    ParentView.tsx           家長操作區：分類選單、加扣分、兌換透支檢查
    SettingsModal.tsx        API 網址設定、家長裝置名單、原始回應檢視、清除本機快取
    TasksTableModal.tsx      配分表檢視
    ParentPasswordModal.tsx / ChangePasswordModal.tsx
    PWAInstallButton.tsx
  hooks/                     useOnlineStatus、usePWAInstall
scripts/generate-icons.js    產生 PWA 圖示的一次性工具
vercel.json                  Vercel 快取標頭設定（Service Worker 不可長快取）
```

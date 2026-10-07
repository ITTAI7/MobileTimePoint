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

**登記積分是「先顯示、背景寫入」**（2.2 起；之前是等試算表確認才顯示，每筆要等 3 秒以上）。
按下登記時紀錄進入**待送清單**（`src/utils/outbox.ts`，存在 localStorage），畫面立刻把它疊上去顯示，
背景再依序一筆一筆送 `addLog`。畫面上的狀態：

| 狀態 | 畫面 | 計分 |
|---|---|---|
| 核對中（pending） | 紀錄與總分旁灰色「!」 | 算進畫面上的分數 |
| 試算表確認 | 記號消失，分數改用伺服器回傳的 `newBalance` | 以試算表為準 |
| 被拒絕（failed，例如兌換透支） | 紅色「!」、劃掉；家長區出現「再送一次／不要這筆」 | **不計分**，留著直到家長處理 |

`users` / `records` 狀態只放試算表確認過的資料，畫面看到的是 `overlayOutbox()` 疊上待送清單的結果。
收不到回應時**先回讀試算表（完整歷史）核對 LogID**，確定沒有才用同一個 LogID 重送；
沒網路時逐步拉長間隔重試，網路恢復或 App 回到畫面時立刻再試。App 關掉再開會接著送。
代價：寫入完成前，其他手機看不到這筆。

**刪除紀錄也走待送清單**（2.3 起）。家長解鎖後在小孩區點一筆紀錄 → 確認框 → 刪除，
畫面立刻拿掉那筆、總分先扣回（灰色「!」），背景再送 `deleteLog`，確認後整份重讀（後面每列的餘額都變了）。
**試算表不真的刪列**，只在「點數存摺」的 `Deleted_At (刪除時間)` 欄填上時間；有填的列一律當作不存在。
待送清單的每一項是「動作（`kind`：add／delete）＋ LogID」，同一筆可能同時有登記和排在後面的刪除：

| 要刪的那筆 | 處理 |
|---|---|
| 試算表上已經有 | 排一個 delete 依序送。刪除是冪等的，收不到回應就直接重送，不必先核對 |
| 登記還在清單裡、一次都沒送過（`attempts` 為 0） | 直接從清單拿掉，不打 API |
| 登記已送出、還沒確認 | delete 排在它後面，清單依序送，不會比登記先到 |
| 登記被拒絕（紅色「!」） | 直接從清單拿掉（等同「不要這筆」） |
| 刪除被拒絕（例如 GAS 還是舊版） | 那筆照常顯示、照常計分；家長區出現「刪除沒成功」，可「再刪一次／不刪了」 |

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

**版本號**只維護在 `package.json` 的 `version`，建置時由 `vite.config.ts` 的 `define` 寫成 `__APP_VERSION__`，顯示在標題右邊（`2.1.0` 顯示成 `v2.1`，修正號不是 0 才顯示三段）。
**每次部署都要升版**，家人手機是不是最新版就靠這個數字判斷。規則（主版本.次版本.修正號）：

| 升哪一段 | 條件 | 其餘歸零 |
|---|---|---|
| 主版本 | 前後端要配合部署，**舊版 App 的主要功能會受影響**（例如 doGet 回傳格式改了），全家手機都得更新 | 次版本、修正號 |
| 次版本 | 新增使用者看得到的功能或行為 | 修正號 |
| 修正號 | 修錯誤、調文字、內部改善，功能不變 | — |

同一次推送有多種改動時，取影響最大的那一種。只改文件不升版（不會觸發使用者看得到的變化）。

版本號從 2.1.0 開始顯示，之前的版本是照上述規則從 git 歷史回推的：

| 版本 | commit | 內容 |
|---|---|---|
| 1.0.0 | `0a3ebce` | 第一次部署到 Vercel |
| 1.1.0 | `2fafea3` | 以存摺為準重算積分 |
| 1.1.1 – 1.1.2 | `d95a122` `0bc671a` | 自動重試、秒開、確認寫入後才顯示 |
| 1.2.0 | `c4f07fd` | 指紋解鎖 |
| 1.2.1 – 1.2.5 | `470a9f5` … `b6d4291` | 指紋與密碼的多項修正、外部審查 9 題 |
| 1.3.0 | `1c955e1` | 本週紀錄依日期分組 |
| 1.3.1 | `988d263` | 日期標題只留筆數 |
| 2.0.0 | `ef4c1a0` | 密碼不再明文公開（舊版 App 會進不了家長區）＋第二輪審查 11 題 |
| 2.1.0 | `41505fd` | 標題顯示版本號、新版自動換新 |
| 2.2.0 | `be1be5f` | 登記立即顯示、背景寫入試算表（核對中灰色 !、被拒絕紅色 !） |
| 2.2.1 | `3b93982` | 登記提示精簡為一行「已登記」、2 秒消失，不再解釋寫入狀態 |
| 2.3.0 | — | 家長解鎖後在小孩區點紀錄可以刪除（試算表標記刪除時間，不真的刪列） |

**新版自動換新**：`src/utils/appUpdate.ts` 在新的 Service Worker 接手（`controllerchange`）時重新載入，打開一次就換成新版。
背景送出待送清單、新增配分項目的期間不重載，改成等 App 退到背景時再換 —— 中斷寫入就得多核對一次。
待送清單存在手機裡，真的被重載也不會遺失，重開後會先核對再決定要不要重送。
注意：這段程式要先在手機上生效，**下一次**更新才會自動換；2.1 之前的舊版仍要完全關掉 App 再開。

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

**部署後一定要核對**：`node scripts/verify-gas.mjs`（只讀，不碰試算表）。
它呼叫 `doGet ?action=version` 取得線上每個函式原始碼的指紋，跟本機 `gas/Code.gs` 逐一比對，
貼錯檔、少貼一段、只存檔沒部署新版本都會被抓出來，並指出是哪個函式。
回應與寫入結果相同的改動（例如效能優化）從外面看不出差別，這是唯一能確認的方法。
新增的設定值（非函式的全域變數）要加進 `Code.gs` 的 `VERIFIED_CONSTANTS_` 才會被比對。

**改到 doGet 回傳格式時，部署順序是「先前端、後 GAS」。**
前端要先寫成新舊格式都能讀，推上 Vercel、每支手機打開一次 App 拿到新版之後，才部署 GAS。
反過來的話，還沒更新的手機會讀不懂新格式 —— 例如密碼改成雜湊那次，舊前端會以為沒有設定密碼，家長區就進不去了。

**新增寫入動作時則是「先 GAS、後前端」**（例如 2.3 的 `deleteLog`）。
2.3 以前的 GAS 遇到不認得的 `action` 會落到 `addLog`：LogID 已存在時回「成功」但什麼都沒做，
LogID 不存在時還會**追加一列空白紀錄**。所以要先部署 GAS、跑核對確認一致，才推前端。
前端另外有一道保險：`deleteLog` 的回應沒有 `deleted: true` 就當成沒刪成功。
2.3 起的 GAS 遇到不認得的 `action` 一律回 `UNKNOWN_ACTION`，以後再加新動作就不會有這個問題。

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
  "adminPasswordHash": "9f86d0…（64 碼）",
  "trustedDevices": [ { "credentialId": "...", "label": "爸爸的手機", "registeredAt": "..." } ],
  "maxTrustedDevices": 2,
  "timestamp": "..."
}
```

`trustedDevices` 存在 **ScriptProperties**（不在試算表裡），所以清空試算表不會影響它。

**回應裡沒有密碼。** 「使用者資料與餘額」的密碼欄在放進回應（與快取）之前就被拿掉，
改成 `adminPasswordHash` = SHA-256(`mobiletimepoint:v1:` + 密碼)，16 進位小寫；
密碼欄空白時是空字串，前端當成「尚未設定密碼」。
讀取網址是公開的（寫在前端程式裡），明文密碼放在這裡等於公布給所有人。

前端兩種回應都吃：舊版 GAS 仍回傳明文時，前端自行算出同樣的雜湊，且不把明文留在記憶體。

### 寫入

`POST {EXEC_URL}`，`Content-Type: text/plain;charset=utf-8`，body 為 JSON。
用 `text/plain` 是為了避開 CORS preflight。

| `action` | 用途 | 冪等 |
|---|---|---|
| `addLog`（省略時的預設） | 新增一筆點數異動，並同步更新使用者餘額 | **是**（以 `logId` 去重） |
| `addTask` | 新增任務項目，編號由伺服器接續產生 | **否** |
| `updateLog` | 依 `logId` 修改既有紀錄的 `timestamp` / `taskName` / `note` | 是 |
| `deleteLog` | 依 `logId` 標記刪除（填 `Deleted_At (刪除時間)`）、從總分扣回、重算該孩子的餘額快照。回應一定帶 `deleted: true` 與 `newBalance` | **是**（已刪過的回成功、帶 `alreadyDeleted`，不再扣分） |
| `updatePassword` | 更新 ADM 的密碼（需 `oldPassword`、`newPassword`） | 是（已是新密碼時直接回成功） |
| `recalculate` | 以存摺為準重算所有餘額，可帶 `dryRun` | 是 |
| `registerDevice` | 登記一支受信任裝置（需 `password`、`credentialId`、`label`） | 是 |
| `removeDevice` | 移除受信任裝置（需 `password`、`credentialId`） | 是 |

回應一律是 `{"status": "success"|"error", ...}`。錯誤時可能帶 `code`：
`INSUFFICIENT_POINTS`（兌換透支）、`LOG_NOT_FOUND`、`BUSY`（拿不到寫入鎖）、
`BAD_PASSWORD`（裝置操作的密碼不符）、`DEVICE_LIMIT`（受信任裝置已達 2 支）、`UNKNOWN_ACTION`（不認得的動作）。
沒帶 `action` 仍當成 `addLog`（相容很舊的 App）。

### 呼叫時的兩個陷阱

**a) POST 的回應經常遺失，但寫入其實已經成功。**
Apps Script 的 `/exec` 是「先執行 doPost，再 302 轉址去取結果」。轉址那一段會間歇性回 Google 的 404 頁面。**此時資料已經寫進試算表了。**

→ 失敗時**先用 GET 核對資料在不在**。

`addLog` 現在會先用 `logId` 查存摺，已經存在就直接回成功而不追加 —— 所以帶同一個 `logId` 重送是安全的。
**但 `logId` 必須由呼叫端沿用同一個**；重新產生一個就會變成兩筆。前端的 `logId` 是
`L` + 毫秒 + 四位隨機碼，隨機碼是必要的：只有毫秒的話，兩台裝置同時送出會被誤判成重複而靜默丟失。

`addTask` 仍然不是冪等的。

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
- **已刪除的列（`Deleted_At` 有值）一律當作不存在**：doGet 不回傳（舊版 App 也看不到）、對帳與重新計算都不算、
  餘額快照重算時跳過、它自己的餘額欄停在刪除當時不再改。**唯一的例外是 LogID 去重**：被刪掉的那筆重送 `addLog` 不會加回來。
  這一欄第一次刪除時自動加在存摺最右邊。刪錯要救回：清掉那格 → App 出現「積分與明細對不上」→ 按「以存摺為準重新計算」。
- **`addLog` 整張存摺只讀一次**（2026-10-06 起），LogID 去重與餘額快照重算都在記憶體裡做。
  跟試算表每來回一次要 0.3～0.5 秒；**不要在寫入之後再讀試算表**，那會逼試算表先把寫入送出去，整筆多等一秒以上。
- **裝置登記／移除一律在伺服器驗家長密碼**，空密碼直接拒絕。否則任何人直接打 API 就能佔滿兩個名額，或把家長的手機踢掉。
- **改密碼也要在伺服器驗目前密碼**（`oldPassword`），否則知道 exec 網址就能改掉家長密碼。試算表密碼欄為空時一律拒絕，第一組密碼只能直接在試算表填。
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
| 刪除欄 | 只在後端（`DELETED_HEADER`，以 `Deleted`／`刪除` 比對） | doGet 回傳前就拿掉已刪除的列與這一欄，前端看不到它 |
| `deleteLog` 的 `deleted: true` | 後端回應 → 前端 `deleteRecordInGoogleSheet` | 前端靠它分辨「真的刪了」與「舊版 GAS 當成登記、回了假的成功」 |
| 受信任裝置 | 後端 ScriptProperties `trusted_devices_v1` | 前端以 `credentialId` 比對。**本機憑證必須同時在伺服器名單上才算受信任** —— 只看 localStorage 的話，偽造一筆就能繞過 |
| 週的定義 | 前後端各一份 | 前端 `getWeekRange()`、後端 `weekRange_()`，皆為「週日 00:00 起、下週日 00:00 止」，邏輯必須一致 |
| 密碼雜湊的鹽 | 前端 `sheetData.ts` 的 `HASH_SALT`、後端的 `PASSWORD_HASH_SALT` | 兩邊必須完全相同，否則任何密碼都解不了鎖。改了鹽，所有裝置的本機雜湊也會失效，要重新連線一次 |

**時區**：Apps Script 專案時區必須與試算表時區相同（目前為 `Asia/Taipei`），否則週的分界會偏移數小時。
前端**不用瀏覽器時區**：週區間、補登日期、寫入試算表的時間、明細顯示一律以固定 UTC+8 計算（`sheetData.ts` 的台北時間段落），手機時區設錯或出國時才不會與後端對不上。

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
| 家長密碼僅前端驗證 | 讀取網址只回傳加鹽雜湊，但四位數密碼的雜湊會寫程式的人幾毫秒就能反推；登記分數的 `addLog` 本身也不驗密碼，知道網址又會打 API 的人可以直接加分 | 定位是「防小孩」，**不是安全機制**。要真正擋住，得讓 `addLog` 等寫入動作也在伺服器驗證身分，改動較大 |
| 寫入時的網路錯誤無法判斷是否已寫入 | 回應可能在回程遺失，但資料常常已經寫進去 | addLog：待送清單不會直接重送，先回讀試算表（**完整歷史**，補登上週的才找得到）核對該筆 `logId`，確定沒有才用同一個 `logId` 重送；核對不了就保持灰色「!」繼續等。addTask 不是冪等的，仍然不重送，回報「無法確認」請使用者先重新整理 |
| 登記後到寫入完成前，畫面與試算表短暫不一致 | 正常約 3 秒；沒網路時會更久，期間其他手機看不到這筆 | 2.2 起刻意的取捨（家長選擇體感速度）。用灰色「!」標示；連續兩輪送不出去時家長區顯示「還有 N 筆沒同步」 |
| 試算表 ADM 密碼欄為空時無法進入家長區 | 沒有內建預設密碼可用 | 刻意的：預設密碼寫在前端等於人人都知道。到試算表填入密碼後重新整理即可 |
| 指紋解鎖不做密碼學驗證 | WebAuthn 的簽章沒有送回伺服器檢查，開 DevTools 可繞過 | 與密碼同級的「防小孩」機制。名額上限與名單本身是伺服器把關的，那部分繞不過 |
| `trustedDevices` 在 doGet 公開回傳 | 任何人打 exec 網址都看得到裝置標籤與 credentialId | 實害有限（沒有私鑰按不出指紋）。要收斂的話，改成只回「這台在不在名單上」，完整名單驗密碼才給 |
| 登記被伺服器拒絕時，手機裡的 passkey 無法刪除 | WebAuthn 沒有提供刪除 API，只能由使用者自行到密碼管理員清 | 送出前先用已載入的名單檢查名額，縮小發生窗口。**不可以改成先查伺服器再建憑證** —— `credentials.create` 需要使用者手勢，中間插入網路請求會讓指紋視窗叫不出來 |

---

## 8. 檔案結構

```
src/
  App.tsx                    狀態容器：載入資料、背景送出待送清單（登記與刪除）、密碼鎖與裝置名單
  types.ts                   試算表原始欄位 → 乾淨型別的對應
  utils/sheetData.ts         資料層：API 讀寫、欄位容錯解析、週區間、localStorage 快取
  utils/outbox.ts            待送清單：存取、把未確認的登記與刪除疊到畫面上（overlayOutbox）
  utils/biometric.ts         WebAuthn 平台驗證器：註冊／驗證指紋，錯誤訊息中文化
  components/
    KidView.tsx              小孩檢視區：積分、兌換卡片、本週明細（家長解鎖時點紀錄可刪除）
    DeleteRecordDialog.tsx   刪除確認框：這筆的內容與刪除後剩幾點
    ParentView.tsx           家長操作區：分類選單、加扣分、兌換透支檢查
    SettingsModal.tsx        API 網址、改密碼、家長裝置名單、清除本機快取（都要家長解鎖後才顯示）
    TasksTableModal.tsx      配分表檢視
    ParentPasswordModal.tsx    家長區解鎖（密碼雜湊比對／指紋）
    SyncMark.tsx             紀錄與分數旁的「!」：灰色核對中、紅色沒寫進去
    PWAInstallButton.tsx
  hooks/                     useOnlineStatus、usePWAInstall
scripts/generate-icons.js    產生 PWA 圖示的一次性工具
scripts/verify-gas.mjs       核對 Apps Script 部署中的版本是否與本機 gas/Code.gs 一致
vercel.json                  Vercel 快取標頭設定（Service Worker 不可長快取）
```

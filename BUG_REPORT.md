# 🐞 網站 Bug 測試報告與追蹤

> 測試角色：網頁測試工程師（靜態程式碼審查，未改動任何程式）
> 測試範圍：`src/`（前端 React 19 + TypeScript）＋ `gas/Code.gs`（Google Apps Script 後端）
> 建立日期：2026/09/23
> 最後核對：2026/09/29（11 題全數完修；`tsc --noEmit` 通過、零錯誤）

---

## 狀態圖例

| 圖示 | 意義 |
|---|---|
| ✅ 已完修 | 程式已核對，確認修正完成 |
| ⚠️ 待確認 | 標記已修，但實測程式仍殘留問題 |
| ❌ 未修 | 尚未處理，等待另一 AI 冷卻後續修 |

---

## 總覽表

| # | 嚴重度 | 摘要 | 狀態 |
|---|---|---|---|
| 1 | 🔴 高 | 「重設為預設密碼」把試算表密碼覆寫成 77777777 | ✅ 已完修 |
| 2 | 🔴 高 | 兌換匯率在前端多處寫死 3 分鐘/點 | ✅ 已完修 |
| 3 | 🔴 高 | no-cors 後備重複送同一筆 addLog（非冪等） | ✅ 已完修 |
| 4 | 🟠 中 | 清除本機資料沒清掉明文密碼 | ✅ 已完修 |
| 5 | 🟠 中 | 前端時區（瀏覽器）與後端（Asia/Taipei）不一致 | ✅ 已完修 |
| 6 | 🟠 中 | 孩子密碼欄誤填會被當成 admin、從名單消失 | ✅ 已完修 |
| 7 | 🟠 中 | 修改密碼無視同步結果，UI 永遠顯示成功 | ✅ 已完修 |
| 8 | 🟠 中 | 無 LogID 的紀錄用 Date.now() 當 fallback，React key 不穩定 | ✅ 已完修 |
| 9 | 🟡 低 | 預設密碼寫死 77777777 | ✅ 已完修 |
| 10 | 🟡 低 | 「本週」區間 mount 後就凍結，跨週不更新 | ✅ 已完修 |
| 11 | 🟡 低 | 更新密碼／新增任務 API 幾乎永不回報失敗 | ✅ 已完修 |

---

## 詳細紀錄

### 🔴 #1 「重設為預設密碼」把試算表密碼覆寫成寫死的 77777777

- **狀態**：✅ 已完修
- **位置**：`src/components/SettingsModal.tsx` → `sheetAdminPassword`（約 180–188 行）、`handleResetPasswordToDefault()`（約 197–211 行）
- **問題描述**：舊版在清除本機 override 後呼叫 `getParentPassword()`（不帶參數），回傳寫死的 `'77777777'`，再 `updateParentPasswordInGoogleSheet()` 把該值寫進試算表 ADM 密碼欄，與按鈕文案「改用試算表中 ADM 的密碼」相反。
- **修正方式（已驗證）**：
  - 新增 `sheetAdminPassword`，從 `rawResponse['使用者資料與餘額']` 讀出 ADM 那列的密碼。
  - `handleResetPasswordToDefault()` 只做兩件事：移除本機 `weekend_points_parent_password`、呼叫 `onPasswordChanged(sheetAdminPassword)`。
  - **不再回寫試算表**。
- **驗證結果**：✅ 程式已無回寫試算表的動作，行為與文案一致。

---

### 🔴 #2 兌換匯率在前端多處寫死 3 分鐘/點

- **狀態**：✅ 已完修
- **位置**：
  - `src/utils/sheetData.ts` → `getMinutesPerPoint()`（現行約 733–749 行）、`pointsToTime()`（現行約 751–771 行）
  - `src/components/KidView.tsx`（現行約 58–60 行）
  - `src/components/TasksTableModal.tsx`（現行約 14–21、111 行）
- **問題描述**：`note.md` 承諾「兌換匯率從配分表最便宜的兌換項目自動推算」，但舊版 hero 大卡片與任務表 footer 都用寫死的 `*3`，改配分表不會跟著變。
- **修正方式（已驗證）**：
  - 新增 `getMinutesPerPoint(tasks)`：從「兌換項目」最便宜的一項，解析名稱中的「X 小時 / Y 分鐘」與所需點數，算出「1 點 = 幾分鐘」，算不出才退回 3。
  - `pointsToTime(points, minutesPerPoint)` 改吃參數。
  - `KidView` 用 `getMinutesPerPoint(tasks)` 傳入；`TasksTableModal` 的 footer 改用動態 `redeemHint`。
- **驗證結果**：✅ 三處都已改為動態推算，不再寫死。

---

### 🔴 #3 no-cors 後備重複送同一筆 addLog（非冪等）

- **狀態**：✅ 已完修（2026/09/29）
- **位置**：`src/utils/sheetData.ts` → `writeRecordToGoogleSheet()`（catch 區塊，現行約 871–878 行）
- **問題描述**：第一個 `fetch` 一旦 throw（例如伺服器已寫入、但回應在回程遺失），catch 區塊會用 `mode:'no-cors'` **把同一筆 payload 再送一次**。而 `addLog` 不是冪等的，重送會產生重複紀錄＋重複扣分。
- **修正方式（已驗證）**：移除 no-cors 重送；連線層失敗改回傳 `{ success: false, confirmed: false, message }`，交由 `App.tsx` 的 `loadData(true)` 依 `logId` 回讀核對實際結果。

---

### 🟠 #4 清除本機資料沒清掉明文密碼

- **狀態**：✅ 已完修（2026/09/29）
- **位置**：`src/utils/sheetData.ts` → `clearLocalData()`（現行約 623–636 行，已補 `localStorage.removeItem(PARENT_PASSWORD_OVERRIDE_KEY)`）
- **問題描述**：清除 logs / devices / users / tasks / hash，唯獨漏掉 `weekend_points_parent_password`（明文密碼 override）。`note.md` 說清除後下次解鎖要重新等連線，但明文密碼仍在，解鎖仍用舊值。
- **建議**：在 `clearLocalData()` 補 `localStorage.removeItem('weekend_points_parent_password')`。

---

### 🟠 #5 前端時區（瀏覽器）與後端（Asia/Taipei）不一致

- **狀態**：✅ 已完修（2026/09/29）
- **位置**：
  - `src/utils/sheetData.ts` → 新增台北時間工具 `taipeiParts()`（約 650–661）、`fromTaipei()`（約 664–666）、`todayTaipeiISO()`（約 669–673）、`parseSheetTime()`（約 681–689）；`getWeekRange()`（約 699–704）改用台北時間切週。
  - `src/components/ParentView.tsx` → `toTimestamp()`（約 39–45）、`isThisWeek()`（約 48–54）改用 `fromTaipei()`/`getWeekRange()`；`recordDate`（約 108、488–489 行）改用 `todayTaipeiISO()`。
  - 後端 `gas/Code.gs` → `weekRange_()`（約 281–288 行，用 Apps Script 時區 Asia/Taipei）
- **問題描述**：手機不在台北時區時，「本週」分界與補登日期會與後端偏移數小時，小孩區的本週明細可能多列/漏列。
- **建議**：前端週區間改用固定 Asia/Taipei 計算，或後端回傳的 `weekStart/weekEnd` 讓前端直接採用。

---

### 🟠 #6 孩子密碼欄誤填會被當成 admin、從名單消失

- **狀態**：✅ 已完修（2026/09/29）
- **位置**：`src/utils/sheetData.ts` → `parseCleanUsers()`（現行約 80 行，已改為只認 `UserID === 'ADM'` 或 `name === '家長'`）
- **問題描述**：`const isAdmin = id.toUpperCase() === 'ADM' || name === '家長' || !!password;`——任何孩子那列的「密碼」欄只要被誤填任何值，就會被判定為 admin，進而從小孩檢視區/家長操作區的孩子名單被過濾掉。
- **建議**：admin 判定只認 `UserID === 'ADM'`（或 name === '家長'），不要因為「有密碼」就當 admin。

---

### 🟠 #7 修改密碼無視同步結果，UI 永遠顯示成功

- **狀態**：✅ 已完修（2026/09/29）
- **位置**：
  - `src/components/SettingsModal.tsx` → `handleChangePasswordSubmit()`（現行約 123–178 行，先寫試算表、確認成功才改本機）
  - `src/utils/sheetData.ts` → `updateParentPasswordInGoogleSheet()`（現行約 888–921 行）
- **問題描述**：`updateParentPasswordInGoogleSheet` 的回傳值被忽略；且該函式即使 `json.status === 'error'` 也會 fall through 到 `return { success: true }`，幾乎永不回報失敗。本地與試算表密碼可能無聲分叉。
- **建議**：接收回傳值並在失敗時顯示錯誤；修正 `updateParentPasswordInGoogleSheet` 讓它在 `status === 'error'` 時回傳失敗。

---

### 🟠 #8 無 LogID 的紀錄用 Date.now() 當 fallback，React key 不穩定

- **狀態**：✅ 已完修（2026/09/29）
- **位置**：`src/utils/sheetData.ts` → `parseCleanRecords()`（現行約 189 行，fallback id 改為 `R${index}-${rawTimestamp}`，不再用 `Date.now()`）
- **問題描述**：`R${Date.now()}-${index}` 每次重新解析都會產生新 id，同筆資料的 React key 會變，造成列表重掛載、動畫/鍵值錯亂（正常情況 LogID 都有值，屬邊際案例）。
- **建議**：fallback id 改用與該列內容相關的穩定值（例如 `R${index}` 或時間戳記欄位＋index 的組合）。

---

### 🟡 #9 預設密碼寫死 77777777

- **狀態**：✅ 已完修（2026/09/29：移除預設值，ADM 密碼欄為空時家長區顯示「請先在試算表設定密碼」並停用解鎖）
- **位置**：`src/utils/sheetData.ts` → `getParentPassword()`（現行約 101–109 行，回傳 `''` 而非預設值）；種子資料約 56 行。
- **建議**：若試算表 ADM 密碼欄為空，前端不應靜默採用萬用預設值，可改為提示家長先設定密碼。

---

### 🟡 #10 「本週」區間 mount 後就凍結，跨週不更新

- **狀態**：✅ 已完修（2026/09/29）
- **位置**：`src/components/KidView.tsx`（現行約 66–75 行，改為 `useState` + `setInterval`（每分鐘）＋ `visibilitychange`（回前景）重算本週）
- **問題描述**：App 若跨週日午夜一直開著，本週標籤與明細不會自動切到新的一週。
- **建議**：加入時間依賴或定時重新計算（例如依 `Date` 的日／週做依賴，或每分鐘刷新）。

---

### 🟡 #11 更新密碼／新增任務 API 幾乎永不回報失敗

- **狀態**：✅ 已完修（2026/09/29）
- **位置**：
  - `src/utils/sheetData.ts` → `updateParentPasswordInGoogleSheet()`（現行約 888–921 行，只有明確 success 才回 true，並對冪等寫入做重試）
  - `src/utils/sheetData.ts` → `addNewTaskToGoogleSheet()`（現行約 930–977 行，明確 success 才回 true，不重送）
- **問題描述**：兩個函式在 JSON 解析失敗、或 `json.status === 'error'` 時，仍 fall through 到 `return { success: true }`，錯誤被吞掉。
- **建議**：僅在「明確收到 success」時回傳 true，其餘一律回傳失敗訊息。

---

## ✅ 已知做得好的地方（不需修改，僅供參考）

- 兌換透支的最終把關在伺服器（`addLog_` 讀試算表現值判斷），前端只做 UX 提示，繞過前端也擋得住。
- 餘額由伺服器計算（`applyUserBalance_`），不採信前端 `newBalance`，避免多裝置互相覆蓋。
- 所有寫入包在 `LockService` 內，讀現值→判斷→寫回不可分割。
- 對帳（audit）用完整歷史比對，只提示不自動修正。
- 裝置登記/移除在伺服器驗密碼、名額上限在伺服器把關。

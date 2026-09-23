import { RawSheetResponse, CleanTask, CleanUser, CleanRecord, RawTask, RawUser, RawRecord, SheetAudit, RecalcResult, TrustedDevice } from '../types';

export const DEFAULT_GAS_API_URL = 'https://script.google.com/macros/s/AKfycbz39OiajdWzbMOroIMCtdU_JmtSE5zNq9wnoModKLDEDuzcW3vzquh4Is1GJn1Ucw2P/exec';

// Built-in initial seed based directly on the actual fetched sheet response
export const INITIAL_TASKS_SEED: CleanTask[] = [
  { id: 'T01', category: '每日任務', name: '1小時內洗完澡', points: 2 },
  { id: 'T02', category: '每日任務', name: '洗學校碗筷', points: 2 },
  { id: 'T03', category: '加分項目', name: '幫忙做家事', points: 3 },
  { id: 'T04', category: '扣分項目', name: '忘記關燈', points: -2 },
  { id: 'T05', category: '兌換項目', name: '兌換30分鐘手機時間', points: -10 },
];

export const INITIAL_USERS_SEED: CleanUser[] = [
  { id: 'U01', name: '哥哥', grade: '國中二', currentPoints: 0, avatarColor: 'blue' },
  { id: 'U02', name: '妹妹', grade: '國小五', currentPoints: 0, avatarColor: 'emerald' },
];

export function getStoredApiUrl(): string {
  try {
    return localStorage.getItem('weekend_points_api_url') || DEFAULT_GAS_API_URL;
  } catch {
    return DEFAULT_GAS_API_URL;
  }
}

export function setStoredApiUrl(url: string) {
  try {
    localStorage.setItem('weekend_points_api_url', url.trim());
  } catch {
    // ignore
  }
}

export function parseCleanTasks(rawTasks?: RawTask[]): CleanTask[] {
  if (!Array.isArray(rawTasks) || rawTasks.length === 0) {
    return INITIAL_TASKS_SEED;
  }

  return rawTasks.map((t, index) => {
    const id = String(t.TaskID || t.id || `T${index + 1}`);
    const category = String(t['Category (類別)'] || t.Category || t['類別'] || '一般項目');
    const name = String(t['Task_Name (任務名稱)'] || t.Task_Name || t['任務名稱'] || `任務 ${index + 1}`);
    
    const rawPts = t['Default_Points (預設分數)'] ?? t.Default_Points ?? t['預設分數'] ?? 0;
    const points = typeof rawPts === 'number' ? rawPts : parseInt(String(rawPts), 10) || 0;

    return { id, category, name, points };
  });
}

export function parseCleanUsers(rawUsers?: RawUser[]): CleanUser[] {
  if (!Array.isArray(rawUsers) || rawUsers.length === 0) {
    return [
      ...INITIAL_USERS_SEED,
      { id: 'ADM', name: '家長', grade: '', currentPoints: 0, password: '77777777', isAdmin: true },
    ];
  }

  const colors = ['blue', 'emerald', 'amber', 'purple', 'rose'];

  return rawUsers.map((u, index) => {
    const id = String(u.UserID || u.id || `U${index + 1}`).trim();
    const name = String(u['Name (姓名)'] || u.Name || u['姓名'] || `孩子 ${index + 1}`).trim();
    const grade = String(u['Grade (年級)'] || u.Grade || u['年級'] || '').trim();
    
    const rawPts = u['Current_Points (目前積分)'] ?? u.Current_Points ?? u['目前積分'] ?? 0;
    let currentPoints = 0;
    if (typeof rawPts === 'number') {
      currentPoints = rawPts;
    } else if (typeof rawPts === 'string' && rawPts.trim() !== '') {
      currentPoints = parseInt(rawPts.trim(), 10) || 0;
    }

    const rawPassword = u['密碼'] ?? u.Password ?? '';
    const password = rawPassword !== '' && rawPassword !== null && rawPassword !== undefined ? String(rawPassword).trim() : undefined;
    const isAdmin = id.toUpperCase() === 'ADM' || name === '家長' || !!password;

    return {
      id,
      name,
      grade,
      currentPoints,
      password,
      isAdmin,
      avatarColor: colors[index % colors.length],
    };
  });
}

export function getParentPassword(sheetPassword?: string): string {
  try {
    const local = localStorage.getItem('weekend_points_parent_password');
    if (local && local.trim() !== '') return local.trim();
  } catch {
    // ignore
  }
  return (sheetPassword && sheetPassword.trim()) ? sheetPassword.trim() : '77777777';
}

/* ─────────────── 家長密碼的本機雜湊 ───────────────
 * 密碼存在試算表裡，所以原本每次都要等連線回來才能驗證（約 3 秒）。
 * 這裡把密碼的 SHA-256 存在本機，解鎖時改為雜湊比對，不用連線。
 *
 * 只存雜湊不存明文，小孩開開發者工具看到的是一串 16 進位字元。
 * 要強調的是：**這是遮蔽，不是加密**。四位數密碼的雜湊對懂的人來說
 * 幾毫秒就能暴力反推。它擋的是「隨手翻一下」，不是有心破解。
 */

const PASSWORD_HASH_KEY = 'weekend_points_parent_password_hash_v1';
const HASH_SALT = 'mobiletimepoint:v1:';

/** 算不出來時回 null（瀏覽器不支援或非安全來源），呼叫端要能退回連線驗證 */
export async function hashPassword(password: string): Promise<string | null> {
  try {
    const subtle = globalThis.crypto?.subtle;
    if (!subtle) return null;
    const data = new TextEncoder().encode(HASH_SALT + password.trim());
    const buf = await subtle.digest('SHA-256', data);
    return Array.from(new Uint8Array(buf))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  } catch {
    return null;
  }
}

export function getCachedPasswordHash(): string | null {
  try {
    return localStorage.getItem(PASSWORD_HASH_KEY);
  } catch {
    return null;
  }
}

export function saveCachedPasswordHash(hash: string) {
  try {
    localStorage.setItem(PASSWORD_HASH_KEY, hash);
  } catch {
    // ignore
  }
}

export function setParentPassword(newPassword: string): void {
  try {
    localStorage.setItem('weekend_points_parent_password', newPassword.trim());
  } catch {
    // ignore
  }
}

export function parseCleanRecords(rawRecords?: RawRecord[], users?: CleanUser[]): CleanRecord[] {
  if (!Array.isArray(rawRecords)) return [];

  // Create lookup for user names
  const userNameMap: Record<string, string> = {};
  if (Array.isArray(users)) {
    users.forEach((u) => {
      userNameMap[u.id] = u.name;
    });
  }

  return rawRecords.map((r, index) => {
    const id = String(r.LogID || r.RecordID || r.ID || `R${Date.now()}-${index}`).trim();
    const timestamp = String(
      r['Timestamp (時間戳記)'] || r['Timestamp (時間)'] || r.Timestamp || r.Date || new Date().toISOString()
    );
    const userId = String(r['UserID (對象)'] || r['UserID (使用者ID)'] || r.UserID || '').trim();
    const userName = String(
      r['Name (姓名)'] || r.Name || (userId && userNameMap[userId] ? userNameMap[userId] : '')
    ).trim();
    const taskName = String(
      r['Task_Name (項目)'] || r['Task_Name (項目名稱)'] || r.Task_Name || r['項目名稱'] || '任務點數變動'
    ).trim();
    const category = String(r['Category (類別)'] || r.Category || '一般').trim();
    
    const rawPts = r['Points (異動積分)'] ?? r['Points (變動點數)'] ?? r.Points ?? 0;
    const points = typeof rawPts === 'number' ? rawPts : parseInt(String(rawPts), 10) || 0;

    const rawBal = r['Current_Points (目前積分)'] ?? r['目前積分'] ?? r['Balance (剩餘點數)'] ?? r.Balance ?? 0;
    const balanceAfter = typeof rawBal === 'number' ? rawBal : parseInt(String(rawBal), 10) || 0;

    const note = r['Note (備註說明)']
      ? String(r['Note (備註說明)'])
      : r['Note (備註)']
      ? String(r['Note (備註)'])
      : r.Note
      ? String(r.Note)
      : undefined;

    return {
      id,
      timestamp,
      userId,
      userName,
      taskName,
      category,
      points,
      balanceAfter,
      note,
      isLocal: false,
    };
  });
}

/**
 * 解析伺服器的對帳結果。
 * 舊版 Apps Script 不會回傳 audit，這時回 null（視為「沒有對帳資訊」而非「有問題」）。
 */
export function parseAudit(raw: unknown): SheetAudit | null {
  if (!raw || typeof raw !== 'object') return null;
  const a = raw as Record<string, unknown>;
  if (typeof a.ok !== 'boolean') return null;

  const items = Array.isArray(a.mismatches) ? a.mismatches : [];
  const mismatches = items.map((item) => {
    const m = (item || {}) as Record<string, unknown>;
    return {
      userId: String(m.userId ?? ''),
      name: String(m.name ?? m.userId ?? ''),
      stored: Number(m.stored) || 0,
      sum: Number(m.sum) || 0,
      diff: Number(m.diff) || 0,
    };
  });

  const rawOrphans = Array.isArray(a.orphans) ? a.orphans : [];
  const orphans = rawOrphans.map((item) => {
    const o = (item || {}) as Record<string, unknown>;
    return { userId: String(o.userId ?? ''), sum: Number(o.sum) || 0 };
  });

  const duplicateLogIds = (Array.isArray(a.duplicateLogIds) ? a.duplicateLogIds : []).map((x) =>
    String(x)
  );

  const staleBalances = (Array.isArray(a.staleBalances) ? a.staleBalances : []).map((item) => {
    const s = (item || {}) as Record<string, unknown>;
    return {
      userId: String(s.userId ?? ''),
      name: String(s.name ?? s.userId ?? ''),
      rows: Number(s.rows) || 0,
    };
  });

  return {
    ok: a.ok,
    mismatches,
    orphans,
    duplicateLogIds,
    staleBalances,
    skipped: typeof a.skipped === 'string' ? a.skipped : undefined,
  };
}

/**
 * 請伺服器以「點數存摺」為準重算餘額與總分。
 *
 * dryRun = true 只取得「會改什麼」，不寫入。
 * 這個動作是冪等的（重算兩次結果相同），所以回應遺失時可以安全重試 ——
 * 與 addLog 不同，那個重送會產生重複紀錄。
 */
export async function recalculateGoogleSheet(dryRun: boolean): Promise<RecalcResult> {
  const empty = { dryRun, balanceRowsChanged: 0, totals: [], orphans: [] };

  // 這裡可以重試，是因為重算冪等（算幾次結果都一樣）。
  // addLog / addTask 就絕對不行 —— 重送會多出一筆紀錄。
  const ATTEMPTS = 3;
  let json: Record<string, unknown> | null = null;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(getStoredApiUrl(), {
        method: 'POST',
        body: JSON.stringify({ action: 'recalculate', dryRun }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
      });
      json = JSON.parse(await response.text());
      break;
    } catch {
      if (attempt === ATTEMPTS) {
        return { ok: false, ...empty, message: `連線失敗，已重試 ${ATTEMPTS} 次，請稍後再試` };
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }

  try {
    if (!json) return { ok: false, ...empty, message: '沒有取得結果' };

    if (json.status !== 'success') {
      return { ok: false, ...empty, message: String(json.message || '重新計算失敗') };
    }

    const totals = (Array.isArray(json.totals) ? json.totals : []).map(
      (t: Record<string, unknown>) => ({
        userId: String(t.userId ?? ''),
        name: String(t.name ?? t.userId ?? ''),
        from: Number(t.from) || 0,
        to: Number(t.to) || 0,
      })
    );
    const orphans = (Array.isArray(json.orphans) ? json.orphans : []).map(
      (o: Record<string, unknown>) => ({
        userId: String(o.userId ?? ''),
        sum: Number(o.sum) || 0,
      })
    );

    return {
      ok: true,
      dryRun: !!json.dryRun,
      balanceRowsChanged: Number(json.balanceRowsChanged) || 0,
      totals,
      orphans,
    };
  } catch {
    // 這裡不做 no-cors 後備：重算必須讀得到結果，讀不到就不能當成功
    return { ok: false, ...empty, message: '連線失敗或回應無法解析，請稍後再試一次' };
  }
}

/** 舊版 Apps Script 不會回傳這個欄位，當作「沒有登記任何裝置」處理 */
export function parseTrustedDevices(raw: unknown): TrustedDevice[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const d = (item || {}) as Record<string, unknown>;
      return {
        credentialId: String(d.credentialId ?? ''),
        label: String(d.label ?? '家長裝置'),
        registeredAt: String(d.registeredAt ?? ''),
      };
    })
    .filter((d) => d.credentialId !== '');
}

export interface DeviceResult {
  ok: boolean;
  devices: TrustedDevice[];
  code?: string;
  message?: string;
}

/**
 * 登記／移除受信任裝置。
 *
 * 兩者都要附上家長密碼由伺服器驗證 —— 否則任何人都能直接打 API
 * 把兩個名額佔掉，或把你的手機踢掉。
 *
 * 這兩個動作都是冪等的（重複登記同一支只會更新標籤），回應遺失時可安全重試。
 */
async function deviceAction(
  action: 'registerDevice' | 'removeDevice',
  payload: Record<string, unknown>
): Promise<DeviceResult> {
  const ATTEMPTS = 3;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const response = await fetch(getStoredApiUrl(), {
        method: 'POST',
        body: JSON.stringify({ action, ...payload }),
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        redirect: 'follow',
      });

      const json = JSON.parse(await response.text());
      const devices = parseTrustedDevices(json.devices);

      if (json.status === 'success') return { ok: true, devices };
      return {
        ok: false,
        devices,
        code: typeof json.code === 'string' ? json.code : undefined,
        message: String(json.message || '操作失敗'),
      };
    } catch {
      if (attempt === ATTEMPTS) {
        return { ok: false, devices: [], message: `連線失敗，已重試 ${ATTEMPTS} 次` };
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }

  return { ok: false, devices: [], message: '操作失敗' };
}

export function registerTrustedDevice(
  credentialId: string,
  label: string,
  password: string
): Promise<DeviceResult> {
  return deviceAction('registerDevice', { credentialId, label, password });
}

export function removeTrustedDevice(
  credentialId: string,
  password: string
): Promise<DeviceResult> {
  return deviceAction('removeDevice', { credentialId, password });
}

/**
 * @param fresh 略過伺服器端快取，強制重讀試算表。
 *              平常開啟用快取（快很多）；按下重新整理、或需要確認剛才的寫入時才用 true。
 */
export async function fetchSheetData(fresh = false, customUrl?: string): Promise<{
  tasks: CleanTask[];
  users: CleanUser[];
  records: CleanRecord[];
  audit: SheetAudit | null;
  trustedDevices: TrustedDevice[];
  /**
   * 這次回應到底有沒有帶裝置名單這個欄位。
   * 用來區分「伺服器說名單是空的」與「伺服器根本沒有這個功能」——
   * 後者發生在 GAS 被回退到舊版部署時，若當成空名單處理，
   * 會把所有裝置默默地解除授權。
   */
  hasDeviceRegistry: boolean;
  maxTrustedDevices: number;
  raw: RawSheetResponse;
}> {
  const base = customUrl || getStoredApiUrl();
  const url = fresh ? `${base}${base.includes('?') ? '&' : '?'}fresh=1` : base;

  // Apps Script 的 /exec 會 302 轉到 googleusercontent.com，那一跳約有兩成機率回 404。
  // 這是 Google 端的間歇性問題，不是網址或權限錯誤，所以重試即可 ——
  // GET 沒有副作用，重試絕對安全。
  const ATTEMPTS = 4;
  let data: RawSheetResponse | null = null;
  let lastStatus = 0;

  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    try {
      const res = await fetch(url, {
        method: 'GET',
        headers: { Accept: 'application/json' },
        redirect: 'follow',
      });
      lastStatus = res.status;
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      // 轉址失敗時會回 HTML，這行會丟出例外，一樣進到重試
      data = (await res.json()) as RawSheetResponse;
      break;
    } catch {
      if (attempt === ATTEMPTS) {
        throw new Error(
          lastStatus
            ? `連線失敗 (HTTP ${lastStatus})：已重試 ${ATTEMPTS} 次。請檢查網路，或到設定確認 API 網址。`
            : `連線失敗：已重試 ${ATTEMPTS} 次。請檢查網路連線。`
        );
      }
      await new Promise((r) => setTimeout(r, 400 * attempt));
    }
  }

  if (!data) throw new Error('連線失敗：沒有取得資料');
  const tasks = parseCleanTasks(data['任務與配分表']);
  const users = parseCleanUsers(data['使用者資料與餘額']);
  const records = parseCleanRecords(
    (data['積分明細/點數存摺'] as RawRecord[]) || (data['點數存摺'] as RawRecord[]),
    users
  );

  return {
    tasks,
    users,
    records,
    audit: parseAudit(data.audit),
    trustedDevices: parseTrustedDevices(data.trustedDevices),
    hasDeviceRegistry: Array.isArray(data.trustedDevices),
    // 伺服器沒回報時退回 2，與後端的 MAX_TRUSTED_DEVICES 一致
    maxTrustedDevices: Number(data.maxTrustedDevices) || 2,
    raw: data,
  };
}

// Local Storage helpers for seamless offline and instant updates
const STORAGE_KEY_LOGS = 'weekend_points_local_logs_v1';
const STORAGE_KEY_USERS = 'weekend_points_local_users_v1';

export function getLocalLogs(): CleanRecord[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_LOGS);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

export function saveLocalLogs(logs: CleanRecord[]) {
  try {
    localStorage.setItem(STORAGE_KEY_LOGS, JSON.stringify(logs));
  } catch {
    // ignore
  }
}

export function getLocalUsersOverride(): Record<string, number> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

export function saveLocalUsersOverride(map: Record<string, number>) {
  try {
    localStorage.setItem(STORAGE_KEY_USERS, JSON.stringify(map));
  } catch {
    // ignore
  }
}

/* ─────────────── 首次繪製用的快取 ───────────────
 * 讀 Google Sheet 要 2.5~3 秒，而且時間全花在 Apps Script 執行，縮小傳輸量沒用。
 * 所以改成：開啟時先用上次的資料立刻畫出畫面，背景再去抓新的。
 */

const STORAGE_KEY_TASKS_CACHE = 'weekend_points_cache_tasks_v1';
const STORAGE_KEY_USERS_CACHE = 'weekend_points_cache_users_v1';
const STORAGE_KEY_DEVICES_CACHE = 'weekend_points_cache_devices_v1';

export function saveCachedTasks(tasks: CleanTask[]) {
  try {
    localStorage.setItem(STORAGE_KEY_TASKS_CACHE, JSON.stringify(tasks));
  } catch {
    // ignore
  }
}

export function getCachedTasks(): CleanTask[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_TASKS_CACHE);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 快取使用者資料，但**不包含密碼** ——
 * 密碼只留在記憶體，不落地到 localStorage，避免小孩用開發者工具翻出來。
 * 代價是資料還沒抓回來之前無法驗證家長密碼，這由 hasFreshData 擋住。
 */
export function saveCachedUsers(users: CleanUser[]) {
  try {
    const withoutPassword = users.map(({ password: _password, ...rest }) => rest);
    localStorage.setItem(STORAGE_KEY_USERS_CACHE, JSON.stringify(withoutPassword));
  } catch {
    // ignore
  }
}

export function getCachedUsers(): CleanUser[] | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_USERS_CACHE);
    const parsed = raw ? JSON.parse(raw) : null;
    return Array.isArray(parsed) && parsed.length > 0 ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * 快取受信任裝置名單。
 *
 * 不快取的話，開 App 的前 2~3 秒（以及整個離線期間）名單都是空的，
 * 指紋按鈕就不會出現 —— 等於這個功能在最需要的時候用不了。
 *
 * 安全上沒有變差：名單本來就是 doGet 公開回傳的，而且光有 credentialId
 * 也按不出指紋 —— 私鑰在手機的安全晶片裡，偽造 localStorage 只會拿到 NotAllowedError。
 */
export function saveCachedTrustedDevices(devices: TrustedDevice[], max: number) {
  try {
    localStorage.setItem(STORAGE_KEY_DEVICES_CACHE, JSON.stringify({ devices, max }));
  } catch {
    // ignore
  }
}

export function getCachedTrustedDevices(): { devices: TrustedDevice[]; max: number } | null {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_DEVICES_CACHE);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { devices?: unknown; max?: unknown };
    const devices = parseTrustedDevices(parsed?.devices);
    const max = Number(parsed?.max);
    return { devices, max: Number.isFinite(max) && max > 0 ? max : 2 };
  } catch {
    return null;
  }
}

export function clearLocalData() {
  try {
    localStorage.removeItem(STORAGE_KEY_LOGS);
    localStorage.removeItem(STORAGE_KEY_DEVICES_CACHE);
    localStorage.removeItem(STORAGE_KEY_USERS);
    localStorage.removeItem(STORAGE_KEY_TASKS_CACHE);
    localStorage.removeItem(STORAGE_KEY_USERS_CACHE);
    localStorage.removeItem(PASSWORD_HASH_KEY);
  } catch {
    // ignore
  }
}

/* ─────────────── 週結算區間（星期日 ~ 星期六） ─────────────── */

export interface WeekRange {
  start: Date;  // 星期日 00:00:00
  end: Date;    // 下個星期日 00:00:00（不含）
}

/** 取得 ref 所屬那一週的區間，以本機時區的星期日為起點 */
export function getWeekRange(ref: Date = new Date()): WeekRange {
  const start = new Date(ref);
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay()); // getDay(): 0 = 星期日
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return { start, end };
}

/**
 * 判斷一筆紀錄是否落在指定週內。
 * 時間格式無法解析時一律保留 —— 寧可多顯示，也不要讓資料悄悄消失。
 */
export function isInWeek(timestamp: string, range: WeekRange): boolean {
  const t = new Date(timestamp).getTime();
  if (isNaN(t)) return true;
  return t >= range.start.getTime() && t < range.end.getTime();
}

/** 顯示用標籤，例如：9/21（日）– 9/27（六） */
export function formatWeekLabel(range: WeekRange): string {
  const last = new Date(range.end);
  last.setDate(last.getDate() - 1);
  const f = (d: Date) => `${d.getMonth() + 1}/${d.getDate()}`;
  return `${f(range.start)}（日）– ${f(last)}（六）`;
}

// Convert points to weekend screen time (default rule based on T05: 10 points = 30 min, meaning 1 point = 3 minutes)
/**
 * 從配分表最便宜的兌換項目推算「1 點 = 幾分鐘」。
 *
 * 名稱裡的時間是唯一的來源（例如「兌換30分鐘手機時間」＝ -10 點 → 3 分鐘/點），
 * 所以家長在試算表調整兌換方案，畫面就會跟著變 —— 這是 note.md 承諾的行為。
 * 推算不出來（沒有兌換項目、或名稱沒寫時間）才退回 3。
 */
export function getMinutesPerPoint(tasks: CleanTask[]): number {
  const rates = tasks
    .filter((t) => t.category.includes('兌換') && t.points < 0)
    .sort((a, b) => Math.abs(a.points) - Math.abs(b.points))
    .map((t) => {
      const hourMatch = t.name.match(/(\d+(?:\.\d+)?)\s*小時/);
      const minMatch = t.name.match(/(\d+)\s*分鐘/);
      let minutes = 0;
      if (hourMatch) minutes += Number(hourMatch[1]) * 60;
      if (minMatch) minutes += Number(minMatch[1]);
      const cost = Math.abs(t.points);
      return minutes > 0 && cost > 0 ? minutes / cost : NaN;
    })
    .filter((v) => Number.isFinite(v) && v > 0);

  return rates.length > 0 ? rates[0] : 3;
}

export function pointsToTime(
  points: number,
  minutesPerPoint = 3
): { minutes: number; text: string; hours: number; remainingMins: number } {
  const safePoints = Math.max(0, points);
  const rate = Number.isFinite(minutesPerPoint) && minutesPerPoint > 0 ? minutesPerPoint : 3;
  const minutes = Math.round(safePoints * rate);
  const hours = Math.floor(minutes / 60);
  const remainingMins = minutes % 60;

  let text = '';
  if (hours > 0 && remainingMins > 0) {
    text = `${hours} 小時 ${remainingMins} 分鐘`;
  } else if (hours > 0) {
    text = `${hours} 小時`;
  } else {
    text = `${remainingMins} 分鐘`;
  }

  return { minutes, text, hours, remainingMins };
}

export interface WriteRecordResult {
  /** false 代表伺服器明確拒絕 */
  success: boolean;
  /**
   * 伺服器是否明確回覆成功。
   *
   * false 表示「不知道寫進去了沒有」——Apps Script 的轉址約有兩成機率掉回應，
   * 但那時資料其實常常已經寫入。這種情況**絕對不能當成失敗**，
   * 否則使用者會重送而產生重複紀錄；正確做法是回頭讀試算表確認。
   */
  confirmed: boolean;
  /** 伺服器依試算表現值算出的權威餘額，只有 confirmed 時才有 */
  newBalance?: number;
  logId?: string;
  message?: string;
  code?: string;
  isMissingDoPost?: boolean;
}

/**
 * Sends a newly created record to Google Apps Script doPost to append row in sheet
 * and update the user's current points balance.
 */
export async function writeRecordToGoogleSheet(
  record: CleanRecord,
  newBalance: number
): Promise<WriteRecordResult> {
  const apiUrl = getStoredApiUrl();
  const dateObj = record.timestamp ? new Date(record.timestamp) : new Date();
  
  // Format as YYYY/MM/DD HH:mm:ss
  const pad = (n: number) => String(n).padStart(2, '0');
  const formattedTime = `${dateObj.getFullYear()}/${pad(dateObj.getMonth() + 1)}/${pad(dateObj.getDate())} ${pad(dateObj.getHours())}:${pad(dateObj.getMinutes())}:${pad(dateObj.getSeconds())}`;

  const payload = {
    action: 'addLog',
    logId: record.id,
    timestamp: formattedTime,
    userId: record.userId,
    userName: record.userName,
    taskName: record.taskName,
    // 伺服器靠 category 判斷是否為兌換（兌換不得透支）
    category: record.category,
    points: record.points,
    note: record.note || '',
    newBalance: newBalance,
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      redirect: 'follow',
    });

    const responseText = await response.text();
    if (responseText.includes('找不到以下指令碼函式：doPost')) {
      return {
        success: false,
        confirmed: true,
        isMissingDoPost: true,
        message: 'Google Apps Script 尚未部署 doPost 函式',
      };
    }

    try {
      const json = JSON.parse(responseText);

      if (json.status === 'success' || json.success) {
        return {
          success: true,
          confirmed: true,
          // 伺服器是讀試算表現值算出來的，比前端自己加減可靠
          newBalance: typeof json.newBalance === 'number' ? json.newBalance : undefined,
          logId: typeof json.logId === 'string' ? json.logId : undefined,
          message: '已成功寫入 Google Sheet！',
        };
      }

      // 伺服器明確拒絕（例如兌換點數不足）——必須回報失敗，不能當成成功
      if (json.status === 'error') {
        return {
          success: false,
          confirmed: true,
          code: json.code,
          message: json.message || '寫入 Google Sheet 失敗',
        };
      }
    } catch {
      // 回應不是 JSON（多半是轉址失敗的 HTML）——寫入可能已經完成，無法判斷
    }

    return { success: true, confirmed: false };
  } catch (err: unknown) {
    // 連線層失敗：改用 no-cors 再送一次。這條路讀不到回應，所以一律標為不確定。
    try {
      await fetch(apiUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
      });
      return { success: true, confirmed: false };
    } catch {
      const errorMsg = err instanceof Error ? err.message : '連線失敗';
      return { success: false, confirmed: false, message: errorMsg };
    }
  }
}

/**
 * Updates the parent password in Google Sheet (ADM row in '使用者資料與餘額')
 */
export async function updateParentPasswordInGoogleSheet(
  newPassword: string
): Promise<{ success: boolean; message?: string }> {
  const apiUrl = getStoredApiUrl();
  const payload = {
    action: 'updatePassword',
    userId: 'ADM',
    newPassword: newPassword,
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      redirect: 'follow',
    });

    const responseText = await response.text();
    try {
      const json = JSON.parse(responseText);
      if (json.status === 'success' || json.success) {
        return { success: true, message: 'Google Sheet 密碼已同步更新！' };
      }
    } catch {
      if (response.ok) {
        return { success: true };
      }
    }
    return { success: true };
  } catch (err: unknown) {
    try {
      await fetch(apiUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
      });
      return { success: true };
    } catch (e2: unknown) {
      return { success: false, message: '同步更新至 Google Sheet 失敗' };
    }
  }
}

/**
 * Adds a new custom task to the '任務與配分表' sheet
 */
export async function addNewTaskToGoogleSheet(task: {
  category: string;
  name: string;
  points: number;
  note?: string;
}): Promise<{ success: boolean; taskId?: string; message?: string }> {
  const apiUrl = getStoredApiUrl();
  // 不在前端編號：前端不知道試算表現在編到幾號，一律由伺服器接續產生
  const payload = {
    action: 'addTask',
    category: task.category,
    taskName: task.name,
    points: task.points,
    note: task.note || '',
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      body: JSON.stringify(payload),
      headers: {
        'Content-Type': 'text/plain;charset=utf-8',
      },
      redirect: 'follow',
    });

    const responseText = await response.text();
    try {
      const json = JSON.parse(responseText);
      if (json.status === 'success' || json.success) {
        return { success: true, taskId: json.taskId, message: '自訂項目已新增至任務與配分表！' };
      }
    } catch {
      if (response.ok) {
        return { success: true };
      }
    }
    return { success: true };
  } catch (err: unknown) {
    try {
      await fetch(apiUrl, {
        method: 'POST',
        mode: 'no-cors',
        body: JSON.stringify(payload),
        headers: {
          'Content-Type': 'text/plain;charset=utf-8',
        },
      });
      return { success: true };
    } catch (e2: unknown) {
      return { success: false, message: '同步新增至 Google Sheet 失敗' };
    }
  }
}

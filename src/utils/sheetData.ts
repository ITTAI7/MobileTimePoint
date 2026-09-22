import { RawSheetResponse, CleanTask, CleanUser, CleanRecord, RawTask, RawUser, RawRecord, SheetAudit, RecalcResult } from '../types';

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

  return {
    ok: a.ok,
    mismatches,
    orphans,
    duplicateLogIds,
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

export async function fetchSheetData(customUrl?: string): Promise<{
  tasks: CleanTask[];
  users: CleanUser[];
  records: CleanRecord[];
  audit: SheetAudit | null;
  raw: RawSheetResponse;
}> {
  const url = customUrl || getStoredApiUrl();

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

  return { tasks, users, records, audit: parseAudit(data.audit), raw: data };
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

export function clearLocalData() {
  try {
    localStorage.removeItem(STORAGE_KEY_LOGS);
    localStorage.removeItem(STORAGE_KEY_USERS);
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
export function pointsToTime(points: number): { minutes: number; text: string; hours: number; remainingMins: number } {
  const safePoints = Math.max(0, points);
  const minutes = safePoints * 3;
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
  success: boolean;
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
    if (responseText.includes('找不到以下指令碼函式：doPost') || responseText.includes('doPost')) {
      return {
        success: false,
        isMissingDoPost: true,
        message: 'Google Apps Script 尚未部署 doPost 函式',
      };
    }

    try {
      const json = JSON.parse(responseText);
      if (json.status === 'success' || json.success) {
        return { success: true, message: '已成功寫入 Google Sheet！' };
      }
      // 伺服器明確拒絕（例如兌換點數不足）——必須回報失敗，不能當成成功
      if (json.status === 'error') {
        return {
          success: false,
          code: json.code,
          message: json.message || '寫入 Google Sheet 失敗',
        };
      }
    } catch {
      if (response.ok) {
        return { success: true };
      }
    }

    return { success: true };
  } catch (err: unknown) {
    // If CORS preflight issue or redirect issue, attempt fire-and-forget
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
      const errorMsg = err instanceof Error ? err.message : '連線失敗';
      return {
        success: false,
        message: errorMsg,
      };
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

import { RawSheetResponse, CleanTask, CleanUser, CleanRecord, RawTask, RawUser, RawRecord } from '../types';

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

    const rawBal = r['目前積分'] ?? r['Balance (剩餘點數)'] ?? r.Balance ?? 0;
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

export async function fetchSheetData(customUrl?: string): Promise<{
  tasks: CleanTask[];
  users: CleanUser[];
  records: CleanRecord[];
  raw: RawSheetResponse;
}> {
  const url = customUrl || getStoredApiUrl();
  const res = await fetch(url, {
    method: 'GET',
    headers: {
      Accept: 'application/json',
    },
    // Keep redirect follow for Google Apps Script 302 redirects
    redirect: 'follow',
  });

  if (!res.ok) {
    throw new Error(`連線失敗 (HTTP ${res.status}): 請檢查 API 網址與 Apps Script 權限`);
  }

  const data: RawSheetResponse = await res.json();
  const tasks = parseCleanTasks(data['任務與配分表']);
  const users = parseCleanUsers(data['使用者資料與餘額']);
  const records = parseCleanRecords(data['積分明細/點數存摺'], users);

  return { tasks, users, records, raw: data };
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
  const taskId = 'T' + String(Date.now()).slice(-4);
  const payload = {
    action: 'addTask',
    taskId: taskId,
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
        return { success: true, taskId: json.taskId || taskId, message: '自訂項目已新增至任務與配分表！' };
      }
    } catch {
      if (response.ok) {
        return { success: true, taskId };
      }
    }
    return { success: true, taskId };
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
      return { success: true, taskId };
    } catch (e2: unknown) {
      return { success: false, message: '同步新增至 Google Sheet 失敗' };
    }
  }
}

export const RECOMMENDED_GAS_CODE = `/**
 * 週末手機時間積分獎勵系統 - Google Apps Script 完整後端程式碼
 * 支援：
 * 1. doGet(e) - 讀取所有工作表 (任務與配分表、積分明細/點數存摺、使用者資料與餘額)
 * 2. doPost(e) - 支援：
 *    - action === "updatePassword"：更新「使用者資料與餘額」家長密碼
 *    - action === "addTask"：新增項目至「任務與配分表」
 *    - 登記任務：寫入「積分明細/點數存摺」並同步更新孩子「目前積分」
 */

function doGet(e) {
  var ss = SpreadsheetApp.getActiveSpreadsheet();
  var sheets = ss.getSheets();
  var result = {};
  
  sheets.forEach(function(sheet) {
    var sheetName = sheet.getName().trim();
    var data = sheet.getDataRange().getValues();
    if (data.length > 1) {
      var headers = data[0];
      var rows = [];
      for (var i = 1; i < data.length; i++) {
        var row = {};
        var hasContent = false;
        for (var j = 0; j < headers.length; j++) {
          var key = String(headers[j]).trim();
          if (key) {
            row[key] = data[i][j];
            if (data[i][j] !== "" && data[i][j] !== null && data[i][j] !== undefined) {
              hasContent = true;
            }
          }
        }
        if (hasContent) {
          rows.push(row);
        }
      }
      result[sheetName] = rows;
    } else {
      result[sheetName] = [];
    }
  });

  return ContentService.createTextOutput(JSON.stringify(result))
    .setMimeType(ContentService.MimeType.JSON);
}

function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    
    // 【操作 1】更新家長密碼
    if (data.action === "updatePassword") {
      var sheetUser = ss.getSheetByName("使用者資料與餘額") || ss.getSheetByName("使用者資料") || ss.getSheets()[2];
      if (sheetUser) {
        var userValues = sheetUser.getDataRange().getValues();
        var headers = userValues[0];
        var userIdCol = -1;
        var passCol = -1;
        
        for (var c = 0; c < headers.length; c++) {
          var colName = String(headers[c]);
          if (colName.indexOf("UserID") !== -1 || colName.indexOf("ID") !== -1) userIdCol = c;
          if (colName.indexOf("密碼") !== -1 || colName.indexOf("Password") !== -1) passCol = c;
        }
        
        var targetUserId = String(data.userId || "ADM").trim();
        if (userIdCol !== -1 && passCol !== -1) {
          for (var r = 1; r < userValues.length; r++) {
            if (String(userValues[r][userIdCol]).trim() === targetUserId) {
              sheetUser.getRange(r + 1, passCol + 1).setValue(String(data.newPassword));
              return ContentService.createTextOutput(JSON.stringify({ status: "success", message: "密碼已更新至試算表" }))
                .setMimeType(ContentService.MimeType.JSON);
            }
          }
        }
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "找不到使用者資料或密碼欄位" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 【操作 2】新增任務至「任務與配分表」
    if (data.action === "addTask") {
      var sheetTask = ss.getSheetByName("任務與配分表") || ss.getSheetByName("任務配分表") || ss.getSheets()[0];
      if (sheetTask) {
        var lastRow = sheetTask.getLastRow();
        var taskId = data.taskId || ("T" + (lastRow < 10 ? "0" + lastRow : lastRow));
        var category = String(data.category || "加分項目").trim();
        var taskName = String(data.taskName || "").trim();
        var points = Number(data.points) || 0;
        var note = String(data.note || "").trim();
        
        // 欄位順序：TaskID, Category (類別), Task_Name (任務名稱), Default_Points (預設分數), 備註
        sheetTask.appendRow([taskId, category, taskName, points, note]);
        return ContentService.createTextOutput(JSON.stringify({ status: "success", taskId: taskId, message: "已新增至任務與配分表" }))
          .setMimeType(ContentService.MimeType.JSON);
      }
      return ContentService.createTextOutput(JSON.stringify({ status: "error", message: "找不到任務與配分表" }))
        .setMimeType(ContentService.MimeType.JSON);
    }
    
    // 【操作 3】登記點數異動 (積分明細與更新使用者目前餘額)
    // 1. 寫入「積分明細/點數存摺」
    var sheetLog = ss.getSheetByName("積分明細/點數存摺") || ss.getSheetByName("積分明細") || ss.getSheets()[1];
    var timestamp = data.timestamp || Utilities.formatDate(new Date(), "Asia/Taipei", "yyyy/MM/dd HH:mm:ss");
    var logId = data.logId || ("L" + new Date().getTime());
    var userId = data.userId || "";
    var taskName = data.taskName || "";
    var points = Number(data.points) || 0;
    var note = data.note || "";
    
    // 依據欄位順序：LogID, Timestamp (時間戳記), UserID (對象), Task_Name (項目), Points (異動積分), Note (備註說明)
    sheetLog.appendRow([logId, timestamp, userId, taskName, points, note]);
    
    // 2. 更新「使用者資料與餘額」中對應孩子的「Current_Points (目前積分)」
    var sheetUser = ss.getSheetByName("使用者資料與餘額") || ss.getSheetByName("使用者資料") || ss.getSheets()[2];
    if (sheetUser && userId) {
      var userValues = sheetUser.getDataRange().getValues();
      var headers = userValues[0];
      var userIdCol = -1;
      var pointsCol = -1;
      
      for (var c = 0; c < headers.length; c++) {
        var colName = String(headers[c]);
        if (colName.indexOf("UserID") !== -1 || colName.indexOf("ID") !== -1) userIdCol = c;
        if (colName.indexOf("Current_Points") !== -1 || colName.indexOf("目前積分") !== -1) pointsCol = c;
      }
      
      if (userIdCol !== -1 && pointsCol !== -1) {
        for (var r = 1; r < userValues.length; r++) {
          if (String(userValues[r][userIdCol]).trim() === String(userId).trim()) {
            var currentVal = Number(userValues[r][pointsCol]) || 0;
            var newTotal = (data.newBalance !== undefined && data.newBalance !== null) ? Number(data.newBalance) : (currentVal + points);
            sheetUser.getRange(r + 1, pointsCol + 1).setValue(newTotal);
            break;
          }
        }
      }
    }
    
    return ContentService.createTextOutput(JSON.stringify({ status: "success", logId: logId }))
      .setMimeType(ContentService.MimeType.JSON);
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ status: "error", message: err.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}
`;

export interface RawTask {
  TaskID?: string;
  'Category (類別)'?: string;
  Category?: string;
  'Task_Name (任務名稱)'?: string;
  Task_Name?: string;
  'Default_Points (預設分數)'?: number | string;
  Default_Points?: number | string;
  [key: string]: unknown;
}

export interface RawUser {
  UserID?: string;
  'Name (姓名)'?: string;
  Name?: string;
  'Grade (年級)'?: string;
  Grade?: string;
  'Current_Points (目前積分)'?: number | string;
  Current_Points?: number | string;
  '密碼'?: number | string;
  Password?: number | string;
  [key: string]: unknown;
}

export interface RawRecord {
  RecordID?: string;
  LogID?: string;
  ID?: string;
  'Timestamp (時間戳記)'?: string;
  'Timestamp (時間)'?: string;
  Timestamp?: string;
  Date?: string;
  'UserID (對象)'?: string;
  'UserID (使用者ID)'?: string;
  UserID?: string;
  'Name (姓名)'?: string;
  Name?: string;
  'Task_Name (項目)'?: string;
  'Task_Name (項目名稱)'?: string;
  Task_Name?: string;
  'Category (類別)'?: string;
  Category?: string;
  'Points (異動積分)'?: number | string;
  'Points (變動點數)'?: number | string;
  Points?: number | string;
  'Current_Points (目前積分)'?: number | string;
  '目前積分'?: number | string;
  'Balance (剩餘點數)'?: number | string;
  Balance?: number | string;
  'Note (備註說明)'?: string;
  'Note (備註)'?: string;
  Note?: string;
  [key: string]: unknown;
}

export interface RawSheetResponse {
  '任務與配分表'?: RawTask[];
  '積分明細/點數存摺'?: RawRecord[];
  '使用者資料與餘額'?: RawUser[];
  [key: string]: unknown;
}

/** 伺服器用完整歷史比對「明細加總」與「使用者表總分」的結果 */
export interface SheetAuditMismatch {
  userId: string;
  name: string;
  stored: number;   // 使用者資料與餘額的目前積分
  sum: number;      // 存摺所有異動的加總
  diff: number;     // stored - sum
}

/** 存摺裡出現、但使用者表沒有的 UserID（多半是手動輸入打錯） */
export interface SheetAuditOrphan {
  userId: string;
  sum: number;
}

export interface SheetAudit {
  ok: boolean;
  mismatches: SheetAuditMismatch[];
  orphans: SheetAuditOrphan[];
  /** 重複的 LogID，多半是複製整列貼上卻忘了改編號 */
  duplicateLogIds: string[];
  skipped?: string;
}

/** 以存摺為準重算餘額的結果 */
export interface RecalcTotal {
  userId: string;
  name: string;
  from: number;
  to: number;
}

export interface RecalcResult {
  ok: boolean;
  dryRun: boolean;
  balanceRowsChanged: number;
  totals: RecalcTotal[];
  orphans: SheetAuditOrphan[];
  message?: string;
}

export interface CleanTask {
  id: string;
  category: string;
  name: string;
  points: number;
}

export interface CleanUser {
  id: string;
  name: string;
  grade: string;
  currentPoints: number;
  avatarColor?: string;
  password?: string;
  isAdmin?: boolean;
}

export interface CleanRecord {
  id: string;
  timestamp: string;
  userId: string;
  userName: string;
  taskName: string;
  category: string;
  points: number;
  balanceAfter: number;
  note?: string;
  isLocal?: boolean;
}

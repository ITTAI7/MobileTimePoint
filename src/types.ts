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
  /** 新版 Apps Script 不回傳密碼本身，只回傳這個雜湊（空字串 = 沒設定密碼） */
  adminPasswordHash?: string;
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

/**
 * 每列「當下餘額」與依時間累加的結果不符。
 * 總分仍然正確，所以單看總分比對抓不出來，但明細顯示的餘額已經錯了。
 */
export interface SheetAuditStale {
  userId: string;
  name: string;
  rows: number;
}

export interface SheetAudit {
  ok: boolean;
  mismatches: SheetAuditMismatch[];
  orphans: SheetAuditOrphan[];
  /** 重複的 LogID，多半是複製整列貼上卻忘了改編號 */
  duplicateLogIds: string[];
  staleBalances: SheetAuditStale[];
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

/** 可以進入家長區的受信任裝置（最多兩支） */
export interface TrustedDevice {
  credentialId: string;
  label: string;
  registeredAt: string;
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
  /** 分數裡含有還沒跟試算表核對完的紀錄（只出現在畫面用的資料上） */
  unverified?: boolean;
}

/**
 * 還沒跟試算表核對完的紀錄狀態。
 * pending：已經算進畫面，背景正在寫入／核對；failed：伺服器明確拒絕，沒寫進去，不計分。
 */
export type SyncState = 'pending' | 'failed';

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
  /** 只出現在畫面用的資料上；試算表讀回來的紀錄沒有這個欄位 */
  syncState?: SyncState;
  /** failed 時的原因 */
  syncMessage?: string;
}

/** 登記後等著寫進試算表的一筆（存在手機裡，App 關掉再開會接著送） */
export interface OutboxItem {
  /** id 就是 LogID，重送時沿用同一個，伺服器才擋得掉重複 */
  record: CleanRecord;
  status: SyncState;
  /**
   * 送出過幾次。大於 0 代表伺服器可能已經收到 ——
   * 下一次要先回讀試算表核對，確定沒有才重送。
   */
  attempts: number;
  /**
   * 連續沒成功的輪數（沒網路、收不到回覆、伺服器忙）。
   * 掉一次回應很常見，核對一下就好；連續好幾輪才需要讓家長知道。
   */
  retries?: number;
  /** pending 時：上次沒成功的原因（會自動重試）；failed 時：伺服器拒絕的原因 */
  message?: string;
  code?: string;
}

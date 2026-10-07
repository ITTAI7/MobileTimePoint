import React, { useEffect, useState, useCallback, useRef, useMemo } from 'react';
import {
  CleanTask,
  CleanUser,
  CleanRecord,
  SheetAudit,
  RecalcResult,
  TrustedDevice,
  OutboxItem,
  OutboxKind,
} from './types';
import {
  fetchSheetData,
  getLocalLogs,
  saveLocalLogs,
  getLocalUsersOverride,
  saveLocalUsersOverride,
  getCachedTasks,
  saveCachedTasks,
  getCachedUsers,
  saveCachedUsers,
  clearLocalData,
  clearParentPasswordOverride,
  hashPassword,
  getCachedPasswordHash,
  saveCachedPasswordHash,
  clearCachedPasswordHash,
  writeRecordToGoogleSheet,
  deleteRecordInGoogleSheet,
  addNewTaskToGoogleSheet,
  recalculateGoogleSheet,
  registerTrustedDevice,
  removeTrustedDevice,
  getCachedTrustedDevices,
  saveCachedTrustedDevices,
  parseSheetTime,
  getWeekRange,
  isInWeek,
  taipeiDateISO,
  todayTaipeiISO,
  INITIAL_TASKS_SEED,
  INITIAL_USERS_SEED,
  WriteRecordResult,
} from './utils/sheetData';
import {
  getOutbox,
  saveOutbox,
  overlayOutbox,
  sortNewestFirst,
  kindOf,
  isOutboxItem,
} from './utils/outbox';
import { KidView } from './components/KidView';
import { ParentView } from './components/ParentView';
import { ParentPasswordModal } from './components/ParentPasswordModal';
import { TasksTableModal } from './components/TasksTableModal';
import { SettingsModal } from './components/SettingsModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { markWriteStart, markWriteEnd } from './utils/appUpdate';
import { useOnlineStatus } from './hooks/useOnlineStatus';
import {
  isBiometricAvailable,
  registerBiometric,
  verifyBiometric,
  getStoredCredentialId,
  clearStoredCredential,
} from './utils/biometric';
import { 
  Smartphone, 
  RefreshCw, 
  Settings, 
  WifiOff, 
  ListChecks,
  Info,
  Lock,
  Unlock,
  ShieldCheck,
  Sparkles
} from 'lucide-react';

/** 家長區解鎖後，App 退到背景超過這個時間，回來時自動上鎖 */
const AUTO_LOCK_AFTER_MS = 5 * 60 * 1000;

/** 標題旁的版本號：2.1.0 顯示成 2.1，修正號不是 0 時才顯示完整的 2.1.1（規則見 SYSTEM.md） */
const APP_VERSION_LABEL = __APP_VERSION__.replace(/\.0$/, '');

export default function App() {
  // 用 lazy initializer 在「第一次渲染之前」就把快取讀進來，
  // 這樣有快取時完全不會出現載入轉圈，畫面是秒開的。
  const cachedUsersOnMount = getCachedUsers();

  const [tasks, setTasks] = useState<CleanTask[]>(() => getCachedTasks() ?? INITIAL_TASKS_SEED);
  const [users, setUsers] = useState<CleanUser[]>(() => cachedUsersOnMount ?? INITIAL_USERS_SEED);
  const [records, setRecords] = useState<CleanRecord[]>(() => getLocalLogs());

  // 資料是否已經跟 Google Sheet 同步過（快取畫出來的不算）
  const [hasFreshData, setHasFreshData] = useState(false);
  const [audit, setAudit] = useState<SheetAudit | null>(null);
  const [recalcPreview, setRecalcPreview] = useState<RecalcResult | null>(null);
  const [recalcBusy, setRecalcBusy] = useState(false);
  const [recalcError, setRecalcError] = useState<string | null>(null);

  // 只有「完全沒有快取」時才顯示載入畫面
  const [isLoading, setIsLoading] = useState(cachedUsersOnMount === null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tab & Auth States
  const [activeTab, setActiveTab] = useState<'kid' | 'parent'>('kid');
  const [isParentUnlocked, setIsParentUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);

  const [selectedUserId, setSelectedUserId] = useState<string>('U01');

  const [showTasksModal, setShowTasksModal] = useState(false);
  const [showSettingsModal, setShowSettingsModal] = useState(false);

  /* ─── 待送清單：登記後畫面立刻更新，背景再寫進試算表（見 utils/outbox.ts）─── */
  const [outbox, setOutbox] = useState<OutboxItem[]>(() => getOutbox());
  // 背景送出的迴圈要讀「此刻」的清單，不能等下一次渲染，所以另外用 ref 保存最新值
  const outboxRef = useRef(outbox);
  /** 改清單一律走這裡：ref、localStorage、畫面同步更新。先存進手機才送出，App 被關掉也不會遺失 */
  const updateOutbox = useCallback((fn: (items: OutboxItem[]) => OutboxItem[]) => {
    const next = fn(outboxRef.current);
    outboxRef.current = next;
    saveOutbox(next);
    setOutbox(next);
  }, []);

  // users / records 只放試算表確認過的資料；畫面看到的是再疊上待送清單的結果
  const { users: displayUsers, records: displayRecords } = useMemo(
    () => overlayOutbox(users, records, outbox),
    [users, records, outbox]
  );

  const isOnline = useOnlineStatus();

  // 舊版在本機留的明文密碼會蓋過試算表，那台手機從此不理會試算表改的密碼。一律以試算表為準。
  useEffect(() => {
    clearParentPasswordOverride();
  }, []);

  // 家長密碼的雜湊（來自伺服器，並存在本機）。解鎖只比對雜湊，不用等連線，
  // 也不需要知道密碼本身 —— 伺服器的讀取網址是公開的，不能回傳明文密碼。
  const [passwordHash, setPasswordHash] = useState<string | null>(() => getCachedPasswordHash());

  /* ─── 受信任裝置（指紋解鎖）─── */
  // 從快取起手：不然開 App 的前 2~3 秒與離線時，指紋按鈕都不會出現
  const cachedDevicesOnMount = getCachedTrustedDevices();
  const [trustedDevices, setTrustedDevices] = useState<TrustedDevice[]>(
    () => cachedDevicesOnMount?.devices ?? []
  );
  const [maxTrustedDevices, setMaxTrustedDevices] = useState(
    () => cachedDevicesOnMount?.max ?? 2
  );
  // 最後一次登記完成的時間。只有「在這之後才發出」的請求，其回應才反映得出新登記，
  // 才能拿來判斷本機憑證是否已失效。用固定秒數的保護期不夠可靠 ——
  // GAS 偶爾會塞車到數十秒，窗口開多大都可能被穿過去。
  const lastEnrollAt = useRef(0);
  const [bioAvailable, setBioAvailable] = useState(false);
  const [localCredentialId, setLocalCredentialId] = useState<string | null>(() =>
    getStoredCredentialId()
  );

  useEffect(() => {
    isBiometricAvailable().then(setBioAvailable);
  }, []);

  // 本機憑證同時要在伺服器名單上才算數 ——
  // 只看本機的話，把 localStorage 塞一筆假的就能繞過。
  const isThisDeviceTrusted =
    localCredentialId !== null &&
    trustedDevices.some((d) => d.credentialId === localCredentialId);

  /** 解鎖後才會呼叫：把這台裝置登記成受信任裝置 */
  const enrollThisDevice = async (
    label: string,
    password: string
  ): Promise<{ ok: boolean; message?: string }> => {
    // 名額滿了就別建憑證：手機一旦產生 passkey，網頁沒有任何 API 能刪掉它，
    // 被伺服器拒絕後那把憑證會永遠留在手機的密碼管理員裡。
    //
    // 這裡刻意用已載入的名單做「同步」檢查，不先去查伺服器 ——
    // credentials.create 需要使用者手勢，而手勢授權只有幾秒，
    // 中間插一個 2~3 秒的請求反而會讓指紋視窗叫不出來（Safari 尤其嚴格）。
    // 名單萬一是舊的也無妨，伺服器仍會把關，只是會多留一把沒用的憑證。
    const effectiveMax = maxTrustedDevices;
    if (
      !trustedDevices.some((d) => d.credentialId === localCredentialId) &&
      trustedDevices.length >= effectiveMax
    ) {
      return {
        ok: false,
        message: `已經登記 ${effectiveMax} 支裝置，請先解除其中一支的授權`,
      };
    }

    const bio = await registerBiometric(label);
    if (!bio.ok) return { ok: false, message: bio.message };

    const credentialId = getStoredCredentialId();
    if (!credentialId) return { ok: false, message: '沒有取得憑證識別碼' };

    const res = await registerTrustedDevice(credentialId, label, password);
    lastEnrollAt.current = Date.now();

    if (res.ok) {
      setTrustedDevices(res.devices);
      saveCachedTrustedDevices(res.devices, effectiveMax);
      setLocalCredentialId(credentialId);
      return { ok: true };
    }

    // 伺服器明確拒絕（密碼錯、名額滿）才是真的沒寫進去。
    // 沒有 code 代表連線層失敗 —— GAS 的回應會間歇性遺失，但資料常常已經寫進去了，
    // 這時直接清掉本機憑證，會讓伺服器名單上多一筆沒有任何裝置對應的幽靈，白白吃掉名額。
    if (!res.code) {
      try {
        const check = await fetchSheetData(true);
        if (!check.hasDeviceRegistry) {
          // 伺服器根本沒回報名單，無從判斷。保留憑證，不要亂清。
          return { ok: false, message: '送出了但無法確認結果，請稍後重新整理再看一次' };
        }
        setTrustedDevices(check.trustedDevices);
        setMaxTrustedDevices(check.maxTrustedDevices);
        saveCachedTrustedDevices(check.trustedDevices, check.maxTrustedDevices);

        if (check.trustedDevices.some((d) => d.credentialId === credentialId)) {
          setLocalCredentialId(credentialId);
          return { ok: true };   // 回應掉了，但其實登記成功
        }
      } catch {
        // 連核對都失敗：保留本機憑證，下次重試會沿用同一個 id（伺服器端是冪等的）
        return { ok: false, message: '送出了但無法確認結果，請稍後重新整理再看一次' };
      }
    }

    clearStoredCredential();
    setLocalCredentialId(null);
    return { ok: false, message: res.message };
  };

  const revokeDevice = async (
    credentialId: string,
    password: string
  ): Promise<{ ok: boolean; message?: string }> => {
    const res = await removeTrustedDevice(credentialId, password);
    if (!res.ok) return { ok: false, message: res.message };

    setTrustedDevices(res.devices);
    saveCachedTrustedDevices(res.devices, maxTrustedDevices);
    if (credentialId === localCredentialId) {
      clearStoredCredential();
      setLocalCredentialId(null);
    }
    return { ok: true };
  };

  /**
   * 讀取的先後順序。每次讀取開始時領一個號碼，畫面上的分數與紀錄只接受
   * 「比目前顯示的資料更新」的回應。
   *
   * 沒有這道檢查的話：開 App 時的背景讀取還沒回來（GAS 塞車時會重試好幾次），
   * 家長已經登記成功、畫面也更新了；接著那個較早發出的讀取才回來，
   * 把畫面蓋回登記前的分數，剛才那筆也不見了 —— 家長會以為沒登記到而重登一次。
   */
  const loadTicket = useRef(0);
  const shownDataTicket = useRef(0);
  const passwordChangedTicket = useRef(0);
  const loadsInFlight = useRef(0);
  /** 標記「畫面上的資料已經比在這之前發出的讀取都新」（寫入確認成功時呼叫） */
  const markScreenNewest = () => {
    shownDataTicket.current = ++loadTicket.current;
  };

  /** 比對密碼但不改任何狀態；還沒有雜湊可比（從沒同步過）時回 null */
  const checkParentPassword = (input: string): boolean | null => {
    const candidate = input.trim();
    if (!passwordHash) return null;
    return candidate !== '' && hashPassword(candidate) === passwordHash;
  };

  /** 驗證家長密碼。通過時把密碼暫存在記憶體，登記指紋時伺服器要再驗一次。 */
  const verifyParentPassword = async (input: string): Promise<boolean> => {
    const ok = checkParentPassword(input) === true;
    if (ok) setUnlockedWithPassword(input.trim());
    return ok;
  };

  /** 設定裡改密碼成功（試算表已確認寫入）之後呼叫 */
  const handlePasswordChanged = (newPassword: string) => {
    const h = hashPassword(newPassword);
    saveCachedPasswordHash(h);
    setPasswordHash(h);
    // 記憶體裡暫存的也要換成新的，否則接著登記指紋會被伺服器以「密碼錯誤」拒絕 ——
    // 而且是在手機已經建立 passkey 之後才被拒，那把憑證會永遠刪不掉。
    setUnlockedWithPassword(newPassword);
    // 改密碼之前就發出的讀取，回來時帶的是舊密碼的雜湊，不能拿來蓋掉新的
    passwordChangedTicket.current = ++loadTicket.current;
  };

  // Load and merge data from Google Sheet & Local Storage
  /**
   * 回傳這次抓到的紀錄，讓「寫入結果不確定」時可以據此判斷實際有沒有寫進去。
   * 讀取失敗、或回應比畫面上的資料還舊而被捨棄時回 null。
   *
   * @param fresh 略過伺服器快取。開啟 App 時不用（快取快很多），
   *              使用者按重新整理、或要確認剛才的寫入時才需要。
   * @param options.allHistory 讀完整歷史（回傳值是全部紀錄），畫面上仍只放本週的。
   */
  const loadData = useCallback(async (
    fresh = false,
    options: { allHistory?: boolean } = {}
  ): Promise<CleanRecord[] | null> => {
    // 畫面已經用快取畫好了，這裡只是背景更新，所以一律走 refreshing 而不是 loading
    loadsInFlight.current += 1;
    setIsRefreshing(true);
    setErrorMessage(null);
    const startedAt = Date.now();
    const ticket = ++loadTicket.current;
    const isOutdated = () => ticket < shownDataTicket.current;

    try {
      const data = await fetchSheetData(fresh, options);

      // 密碼雜湊一律跟著試算表走：ADM 密碼欄被清空時，這裡也要變成「未設定」，
      // 舊的雜湊同時作廢，否則離線時仍能用舊密碼解鎖
      if (ticket > passwordChangedTicket.current) {
        if (data.adminPasswordHash) {
          saveCachedPasswordHash(data.adminPasswordHash);
          setPasswordHash(data.adminPasswordHash);
        } else {
          clearCachedPasswordHash();
          setPasswordHash(null);
        }
      }
      setHasFreshData(true);

      // 比畫面上的資料還舊（在最近一次寫入確認之前就發出的讀取）：
      // 分數、紀錄、對帳結果都不能拿來覆蓋；配分表與裝置名單不受那次寫入影響，照常更新
      const outdated = isOutdated();
      if (!outdated) setAudit(data.audit);
      // 舊版 GAS 沒有這個欄位。當成「名單是空的」會把所有裝置默默解除授權，
      // 所以伺服器沒回報時，裝置狀態一律原封不動。
      if (data.hasDeviceRegistry) {
        setTrustedDevices(data.trustedDevices);
        setMaxTrustedDevices(data.maxTrustedDevices);
        saveCachedTrustedDevices(data.trustedDevices, data.maxTrustedDevices);

        // 這台的憑證已經被別支手機解除授權 —— 順手清掉，否則重新登記時
        // 會再產生一把新的 passkey，舊的留在手機裡變成垃圾。
        // 只有「在最後一次登記之後才發出」的請求才算數，否則可能是在途中的舊回應。
        if (startedAt > lastEnrollAt.current) {
          // 直接讀 localStorage，不靠 state ——
          // loadData 的相依是空陣列，閉包裡的 localCredentialId 會是舊的
          const localId = getStoredCredentialId();
          if (localId && !data.trustedDevices.some((d) => d.credentialId === localId)) {
            clearStoredCredential();
            setLocalCredentialId(null);
          }
        }
      }

      // Tasks
      if (data.tasks.length > 0) {
        setTasks(data.tasks);
        saveCachedTasks(data.tasks);
      }

      if (outdated) return null;
      shownDataTicket.current = ticket;

      // Users: Prioritize actual Google Sheet data
      const mergedUsers = data.users.length > 0 ? data.users : INITIAL_USERS_SEED;
      setUsers(mergedUsers);

      // If selectedUserId is not in children, default to first child.
      // 這裡用 functional update 讀取目前選取的孩子，loadData 才不需要相依 selectedUserId
      // ——否則每次切換哥哥/妹妹都會重新抓一次整份 Google Sheet。
      const childrenOnly = mergedUsers.filter((u) => !u.isAdmin && u.id.toUpperCase() !== 'ADM' && u.name !== '家長');
      setSelectedUserId((prev) =>
        childrenOnly.length > 0 && !childrenOnly.some((u) => u.id === prev)
          ? childrenOnly[0].id
          : prev
      );

      // Records: Directly sync with Google Sheet records (if sheet is cleared to empty, display empty records)
      const sortedRecords = sortNewestFirst(data.records);
      // 讀完整歷史時（核對寫入用），畫面上仍只放本週的，與平常的讀取一致
      const weekRange = getWeekRange();
      const shownRecords = options.allHistory
        ? sortedRecords.filter((r) => isInWeek(r.timestamp, weekRange))
        : sortedRecords;
      setRecords(shownRecords);

      // 試算表裡已經有的登記，就不必再等寫入的回應了（回應掉了、或讀取剛好比回應先回來）。
      // 這裡的分數已經含有那筆，不移出清單的話畫面會算兩次。
      // 只看登記：正在刪的那筆還在試算表上是正常的，移掉就等於取消刪除。
      const onSheet = new Set(sortedRecords.map((r) => r.id));
      const landed = (i: OutboxItem) => kindOf(i) === 'add' && onSheet.has(i.record.id);
      if (outboxRef.current.some(landed)) {
        updateOutbox((items) => items.filter((i) => !landed(i)));
      }

      // On successful live sheet sync (especially manual refresh), keep local cache aligned with live sheet
      saveLocalLogs(shownRecords);
      const sheetUserPoints: Record<string, number> = {};
      mergedUsers.forEach((u) => {
        sheetUserPoints[u.id] = u.currentPoints;
      });
      saveLocalUsersOverride(sheetUserPoints);

      return sortedRecords;
    } catch (err: unknown) {
      console.warn('Google Sheet fetch error:', err);
      // 更新的資料已經顯示了，這次較早的讀取失敗不影響什麼，不要跳出錯誤橫幅
      if (isOutdated()) return null;
      const msg = err instanceof Error ? err.message : '連線失敗';
      setErrorMessage(msg);

      // 已經用快取畫出畫面時就維持現狀 ——
      // 拿內建種子資料覆蓋掉真實的快取，反而會讓畫面顯示錯的名字與分數。
      if (getCachedUsers() === null) {
        const localUsersOverride = getLocalUsersOverride();
        setUsers(
          INITIAL_USERS_SEED.map((u) => ({
            ...u,
            currentPoints:
              localUsersOverride[u.id] !== undefined ? localUsersOverride[u.id] : u.currentPoints,
          }))
        );
        setRecords(getLocalLogs());
      }
      return null;
    } finally {
      setIsLoading(false);
      // 可能同時有好幾個讀取在跑（開啟時的背景讀取＋按重新整理），全部結束才停止轉圈
      loadsInFlight.current -= 1;
      if (loadsInFlight.current === 0) setIsRefreshing(false);
    }
  }, [updateOutbox]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // 供下次開啟時立刻繪製。寫入確認後的分數也要存，
  // 否則關掉再開時，會先顯示確認前的舊分數，等讀取回來才跳回正確的數字。
  useEffect(() => {
    if (hasFreshData) saveCachedUsers(users);
  }, [users, hasFreshData]);

  // Handle Tab Switching with Password Check
  const handleTabClick = (targetTab: 'kid' | 'parent') => {
    if (targetTab === 'kid') {
      setActiveTab('kid');
      return;
    }

    // Entering Parent Zone
    if (isParentUnlocked) {
      setActiveTab('parent');
    } else {
      setShowPasswordModal(true);
    }
  };

  // 剛驗證過的密碼：登記裝置時伺服器要再驗一次，暫存在記憶體（不落地）
  const [unlockedWithPassword, setUnlockedWithPassword] = useState<string | null>(null);

  /** 設定面板用：登記這一台。密碼取自剛才解鎖時暫存在記憶體的那組。 */
  const handleEnrollFromSettings = async (label: string) => {
    if (!unlockedWithPassword) return { ok: false, message: '請先用密碼進入家長區' };
    return enrollThisDevice(label, unlockedWithPassword);
  };

  const handlePasswordSuccess = () => {
    setIsParentUnlocked(true);
    setShowPasswordModal(false);
    setActiveTab('parent');
    // 登記裝置改在「設定 → 家長裝置」裡做，不在這裡打斷流程
  };

  const handleLockAndForget = () => {
    setUnlockedWithPassword(null);
  };

  const handleLockParentMode = () => {
    setIsParentUnlocked(false);
    setActiveTab('kid');
    handleLockAndForget();
  };

  // 退到背景太久就自動上鎖：手機停在家長區放著過夜、或順手遞給小孩時，不會一直開著。
  // 只在回到畫面時判斷（背景中的計時器會被系統暫停，不可靠）。
  // 登記的寫入在背景進行、結果記在待送清單裡，上鎖不會讓結果消失，所以不必等寫完。
  useEffect(() => {
    let hiddenAt: number | null = null;
    const onVisibilityChange = () => {
      if (document.visibilityState === 'hidden') {
        hiddenAt = Date.now();
        return;
      }
      const awayMs = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (awayMs >= AUTO_LOCK_AFTER_MS) handleLockParentMode();
    };
    document.addEventListener('visibilitychange', onVisibilityChange);
    return () => document.removeEventListener('visibilitychange', onVisibilityChange);
    // handleLockParentMode 只用到 setState，每次渲染都等價，不需要列為相依
  }, []);

  /* ─────────────── 登記積分：先顯示、背景寫入 ───────────────
   * 按下登記，畫面立刻更新，紀錄放進待送清單，背景再一筆一筆寫進試算表。
   * 試算表確認前，紀錄與總分旁有灰色「!」；確認後改用伺服器回傳的餘額，記號消失。
   * 伺服器明確拒絕（例如兌換時另一台手機已先扣過點）就改成紅色「!」、不計分，留給家長處理。
   *
   * 依序送、一次一筆：存摺的餘額快照要照登記的先後算，同時送出的話順序沒有保證。
   */

  const sendingRef = useRef(false);
  const retryTimerRef = useRef<number | null>(null);
  const retryDelayRef = useRef(0);

  /** 試算表確認寫入：改用伺服器的權威餘額，紀錄移出待送清單、併進確認過的資料 */
  const commitConfirmed = (record: CleanRecord, result: WriteRecordResult) => {
    // 在這之前發出、還沒回來的讀取都是寫入前的舊資料，回來時不能蓋掉這筆
    markScreenNewest();

    const confirmedBalance =
      typeof result.newBalance === 'number' ? result.newBalance : undefined;
    setUsers((prev) =>
      prev.map((u) =>
        u.id === record.userId
          ? { ...u, currentPoints: confirmedBalance ?? u.currentPoints + record.points }
          : u
      )
    );
    if (confirmedBalance !== undefined) {
      const userMap = getLocalUsersOverride();
      userMap[record.userId] = confirmedBalance;
      saveLocalUsersOverride(userMap);
    }

    const confirmedRecord: CleanRecord = {
      ...record,
      balanceAfter: confirmedBalance ?? record.balanceAfter,
    };
    // 先濾掉同一筆：期間若有其他讀取已經把它帶回來，不能出現兩次
    const withConfirmed = (list: CleanRecord[]) =>
      sortNewestFirst([confirmedRecord, ...list.filter((r) => r.id !== record.id)]);
    setRecords(withConfirmed);
    saveLocalLogs(withConfirmed(getLocalLogs()));

    // 與上面的 setState 在同一輪合併繪製，畫面不會出現「清單已移除、分數還沒更新」的瞬間
    updateOutbox((items) => items.filter((i) => !isOutboxItem(i, 'add', record.id)));
  };

  /** 只動待送清單裡「這個動作、這筆紀錄」那一項 —— 同一筆可能同時有登記和排在後面的刪除 */
  const itemOps = (kind: OutboxKind, id: string) => ({
    remove: () => updateOutbox((items) => items.filter((i) => !isOutboxItem(i, kind, id))),
    patch: (patch: Partial<OutboxItem>) =>
      updateOutbox((items) => items.map((i) => (isOutboxItem(i, kind, id) ? { ...i, ...patch } : i))),
  });

  /** 刪除確認、但整份重讀失敗時：先在畫面上拿掉這筆，總分改用伺服器回傳的，下次重新整理會校正各列餘額 */
  const commitDeleted = (record: CleanRecord, newBalance?: number) => {
    if (newBalance !== undefined) {
      setUsers((prev) =>
        prev.map((u) => (u.id === record.userId ? { ...u, currentPoints: newBalance } : u))
      );
      const userMap = getLocalUsersOverride();
      userMap[record.userId] = newBalance;
      saveLocalUsersOverride(userMap);
    }
    const without = (list: CleanRecord[]) => list.filter((r) => r.id !== record.id);
    setRecords(without);
    saveLocalLogs(without(getLocalLogs()));
  };

  /**
   * 送出一筆刪除。伺服器端是冪等的（刪過的再送一次也回成功、不會多扣分），
   * 所以收不到回覆時不必像登記那樣先核對，下一輪直接重送。
   */
  const sendDeleteItem = async (item: OutboxItem): Promise<'done' | { retry: string }> => {
    const id = item.record.id;
    const { patch: patchItem } = itemOps('delete', id);

    patchItem({ attempts: item.attempts + 1 });
    const result = await deleteRecordInGoogleSheet(id);

    // 找不到：試算表上本來就沒有這筆（登記被拒絕、或有人直接在試算表刪了那列），要的結果已經達成
    if (result.success || result.code === 'LOG_NOT_FOUND') {
      // 這筆之後每一列的「餘額」都變了，整份重讀才會跟試算表一致
      markScreenNewest();
      if ((await loadData(true)) === null) commitDeleted(item.record, result.newBalance);
      // 登記被拒絕、接著又被刪掉的那筆，也一起從清單拿掉
      updateOutbox((items) =>
        items.filter(
          (i) => !(i.record.id === id && (kindOf(i) === 'delete' || i.status === 'failed'))
        )
      );
      return 'done';
    }

    if (result.confirmed) {
      // 拿不到寫入鎖：伺服器什麼都沒做，稍後再送
      if (result.code === 'BUSY') return { retry: '試算表正忙，會自動再試' };
      // 明確拒絕（例如試算表的程式還沒更新）：重試也不會變，交給家長處理。這筆照常顯示、照常計分
      patchItem({
        status: 'failed',
        attempts: 0,
        retries: 0,
        message: result.message || '試算表拒絕刪除',
        code: result.code,
      });
      return 'done';
    }

    return { retry: '收不到試算表的回覆，會自動再試' };
  };

  /** 送出（或核對）一項。回傳 'done'，或下一輪要重試的原因 */
  const sendOutboxItem = async (item: OutboxItem): Promise<'done' | { retry: string }> => {
    if (kindOf(item) === 'delete') return sendDeleteItem(item);

    const id = item.record.id;
    const { remove: removeItem, patch: patchItem } = itemOps('add', id);

    // 送過但沒收到回覆：伺服器可能已經寫入。先回讀試算表核對，確定沒有才重送。
    // （伺服器雖然會用 LogID 擋重複，但「先看再送」不必賭那一層一定有部署。）
    // 一定要讀完整歷史：補登上週的那筆不會出現在「本週」的回應裡，只讀本週會誤判成沒寫入。
    if (item.attempts > 0) {
      const onSheet = await loadData(true, { allHistory: true });
      if (onSheet === null) return { retry: '暫時連不上試算表，會自動再試' };
      if (onSheet.some((r) => r.id === id)) {
        removeItem();
        return 'done';
      }
    }

    // 先記下「送過了」再送：送到一半 App 被關掉，下次打開才知道要先核對
    patchItem({ attempts: item.attempts + 1 });
    const result = await writeRecordToGoogleSheet(item.record, item.record.balanceAfter);

    if (result.success && result.confirmed) {
      // 補登過去的日期：這筆在時間上排到中間，伺服器已經重算了其他列的「餘額」，
      // 這筆當天的餘額也不是目前總分。前端拼湊不出正確的畫面，直接整份重讀試算表。
      const isBackdated =
        (result.snapshotsResynced ?? 0) > 0 ||
        taipeiDateISO(parseSheetTime(item.record.timestamp)) !== todayTaipeiISO();
      if (isBackdated) {
        markScreenNewest();
        if ((await loadData(true)) !== null) {
          // 補登上週的不在本週的回應裡，讀取時移不掉，這裡明確移除
          removeItem();
          return 'done';
        }
        // 重讀失敗時寫入仍是確定成功的：先把這筆放進畫面，下次重新整理會校正各列餘額
      }
      commitConfirmed(item.record, result);
      return 'done';
    }

    if (!result.success && result.confirmed) {
      // 拿不到寫入鎖：伺服器什麼都沒做，確定沒寫入，稍後直接重送即可
      if (result.code === 'BUSY') {
        patchItem({ attempts: 0 });
        return { retry: '試算表正忙，會自動再試' };
      }
      // 明確拒絕（點數不足、GAS 沒部署 doPost…）：重試也不會變，交給家長處理
      patchItem({
        status: 'failed',
        attempts: 0,
        retries: 0,
        message: result.message || '試算表拒絕這筆登記',
        code: result.code,
      });
      return 'done';
    }

    // 收不到回覆，不知道寫進去沒有 —— 不用猜，下一輪先核對再決定
    return { retry: '收不到試算表的回覆，會自動再試' };
  };

  /**
   * 把待送清單裡的 pending 依序送完。已經在跑就不重複開；
   * 遇到連不上就停下來，間隔逐步拉長後再試（網路恢復、App 回到畫面時會立刻再試）。
   */
  const processOutbox = async () => {
    if (sendingRef.current) return;
    if (retryTimerRef.current !== null) {
      clearTimeout(retryTimerRef.current);
      retryTimerRef.current = null;
    }
    sendingRef.current = true;
    // 送出期間新版 App 接手也先不要重新載入（清單存在手機裡，重載不會遺失，只是要多核對一次）
    markWriteStart();

    let stalled = false;
    try {
      for (;;) {
        const item = outboxRef.current.find((i) => i.status === 'pending');
        if (!item) break;

        let outcome: 'done' | { retry: string };
        try {
          outcome = await sendOutboxItem(item);
        } catch (err) {
          console.warn('Outbox send error:', err);
          outcome = { retry: '發生錯誤，會自動再試' };
        }

        if (outcome !== 'done') {
          const reason = outcome.retry;
          updateOutbox((items) =>
            items.map((i) =>
              isOutboxItem(i, kindOf(item), item.record.id)
                ? { ...i, retries: (i.retries ?? 0) + 1, message: reason }
                : i
            )
          );
          stalled = true;
          break;
        }
      }
    } finally {
      sendingRef.current = false;
      markWriteEnd();
    }

    if (stalled) {
      retryDelayRef.current = Math.min(60_000, retryDelayRef.current ? retryDelayRef.current * 2 : 2_000);
      retryTimerRef.current = window.setTimeout(() => {
        retryTimerRef.current = null;
        processOutbox();
      }, retryDelayRef.current);
    } else {
      retryDelayRef.current = 0;
    }
  };

  // 打開 App 時把上次沒送完的接著送；網路恢復、App 回到畫面時也立刻再試，不必等計時器。
  // 這裡用的都是 ref 與 setState，取第一次渲染的 processOutbox 也不會讀到舊資料。
  useEffect(() => {
    processOutbox();
    const retryNow = () => {
      if (document.visibilityState === 'visible' && outboxRef.current.some((i) => i.status === 'pending')) {
        processOutbox();
      }
    };
    window.addEventListener('online', retryNow);
    document.addEventListener('visibilitychange', retryNow);
    return () => {
      window.removeEventListener('online', retryNow);
      document.removeEventListener('visibilitychange', retryNow);
    };
  }, []);

  const handleParentSubmitRecord = (
    newRecordData: Omit<CleanRecord, 'id' | 'balanceAfter' | 'isLocal'>
  ) => {
    // timestamp 由表單決定（可以補登過去的日期），不是固定用「現在」
    // 加隨機碼：伺服器會用 LogID 去重（避免重送造成重複計分），
    // 只有毫秒的話，兩台裝置剛好同時送出就會被誤判成同一筆而靜默丟失。
    const logId = `L${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const shown = displayUsers.find((u) => u.id === newRecordData.userId);
    const record: CleanRecord = {
      ...newRecordData,
      id: logId,
      // 畫面上的餘額由待送清單依序推算；這個值只在伺服器找不到這個孩子時當備援
      balanceAfter: (shown?.currentPoints ?? 0) + newRecordData.points,
    };

    updateOutbox((items) => [...items, { record, status: 'pending', attempts: 0 }]);
    processOutbox();
  };

  /** 被拒絕的那項再送一次（沿用同一個 LogID）。伺服器明確拒絕過，確定沒寫入，不必先核對 */
  const handleRetryFailed = (item: OutboxItem) => {
    const kind = kindOf(item);
    updateOutbox((items) =>
      items.map((i) =>
        isOutboxItem(i, kind, item.record.id) && i.status === 'failed'
          ? { ...i, status: 'pending', attempts: 0, retries: 0, message: undefined, code: undefined }
          : i
      )
    );
    processOutbox();
  };

  /**
   * 放棄被拒絕的那項。登記：本來就沒寫進試算表、也沒算進分數，移掉就好。
   * 刪除：等於不刪了，那筆照常留著計分。
   */
  const handleDiscardFailed = (item: OutboxItem) => {
    const kind = kindOf(item);
    updateOutbox((items) =>
      items.filter((i) => !(isOutboxItem(i, kind, item.record.id) && i.status === 'failed'))
    );
  };

  /**
   * 家長在小孩區點紀錄、確認刪除。跟登記一樣：畫面上立刻拿掉，背景再寫進試算表。
   * 試算表不會真的刪掉那列，只標記刪除時間（見 gas/Code.gs 的「刪除紀錄」）。
   */
  const handleDeleteRecord = (record: CleanRecord) => {
    const id = record.id;
    const items = outboxRef.current;

    const deleting = items.find((i) => isOutboxItem(i, 'delete', id));
    if (deleting) {
      // 上次刪除被拒絕、紀錄又出現了：再刪一次就是重送
      if (deleting.status === 'failed') handleRetryFailed(deleting);
      return;
    }

    // 被拒絕、或還在排隊沒送過的登記：試算表上沒有這筆，從待送清單拿掉就好。
    // attempts 是 0 就一定還沒送出 —— 送出前會先記下 attempts（見 sendOutboxItem）
    const add = items.find((i) => isOutboxItem(i, 'add', id));
    if (add && (add.status === 'failed' || add.attempts === 0)) {
      updateOutbox((list) => list.filter((i) => !isOutboxItem(i, 'add', id)));
      return;
    }

    // 登記可能已經送出、還沒確認：刪除排在它後面，待送清單依序送，不會比登記先到
    const { syncState: _syncState, syncMessage: _syncMessage, ...clean } = record;
    updateOutbox((list) => [...list, { kind: 'delete', record: clean, status: 'pending', attempts: 0 }]);
    processOutbox();
  };

  // 新增自訂項目到「任務與配分表」。
  // 這個動作放在 App 而不是 ParentView，因為 tasks 狀態在這裡 ——
  // 寫入試算表後要立刻把新項目補進清單，不能等下次重新載入才出現。
  const handleAddTask = async (task: {
    category: string;
    name: string;
    points: number;
    note?: string;
  }): Promise<{ ok: boolean; taskId?: string; message?: string }> => {
    markWriteStart();
    const res = await addNewTaskToGoogleSheet(task).finally(markWriteEnd);
    if (!res.success) {
      return { ok: false, message: res.message || '新增項目至試算表失敗' };
    }

    // 舊版 GAS 可能不回傳編號，這時先用暫時 id，
    // 下次重新載入會被試算表的真實編號整份取代。
    const newTask: CleanTask = {
      id: res.taskId || `T-pending-${Date.now()}`,
      category: task.category,
      name: task.name,
      points: task.points,
    };

    setTasks((prev) => (prev.some((t) => t.id === newTask.id) ? prev : [...prev, newTask]));
    return { ok: true, taskId: res.taskId };
  };

  // 以存摺為準重算餘額。先跑 dryRun 取得「會改什麼」，確認後才真的寫入。
  const handleRecalcPreview = async () => {
    setRecalcBusy(true);
    setRecalcError(null);
    const res = await recalculateGoogleSheet(true);
    setRecalcBusy(false);

    if (!res.ok) {
      setRecalcError(res.message || '無法取得重算結果');
      return;
    }
    setRecalcPreview(res);
  };

  const handleRecalcApply = async () => {
    setRecalcBusy(true);
    setRecalcError(null);
    const res = await recalculateGoogleSheet(false);
    setRecalcBusy(false);

    if (!res.ok) {
      setRecalcError(res.message || '重新計算失敗');
      return;
    }
    setRecalcPreview(null);
    // 剛改過試算表，一定要拿最新的
    await loadData(true);
  };

  // Reset Local Additions
  const handleResetLocalData = () => {
    clearLocalData();
    // 密碼雜湊也一併清掉了，重讀時會從試算表重新取得
    loadData(true);
  };

  return (
    <div className="min-h-screen bg-slate-100/70 text-slate-900 font-sans flex flex-col justify-between selection:bg-blue-600 selection:text-white">
      {/* Top Mobile Header */}
      <header className="sticky top-0 z-40 bg-white/95 backdrop-blur-md border-b border-slate-200/80 shadow-xs">
        <div className="max-w-md mx-auto px-4 py-2.5 flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-gradient-to-tr from-blue-600 to-indigo-600 text-white flex items-center justify-center shadow-md shadow-blue-500/20">
              <Smartphone className="w-4 h-4" />
            </div>
            <div>
              <div className="flex items-center gap-1.5">
                <h1 className="font-black text-slate-800 text-sm leading-tight tracking-tight">
                  手機時間存摺
                </h1>
                <span className="text-[10px] font-semibold text-slate-400 tabular-nums">
                  v{APP_VERSION_LABEL}
                </span>
                <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
              </div>
              <p className="text-[10px] text-slate-500 font-medium">週末積分獎勵系統</p>
            </div>
          </div>

          {/* Header Action Buttons */}
          <div className="flex items-center gap-1.5">
            {/* View Tasks Reference Button */}
            <button
              onClick={() => setShowTasksModal(true)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition active:scale-95 flex items-center gap-1 text-xs font-medium"
              title="檢視配分表"
            >
              <ListChecks className="w-4 h-4 text-amber-500" />
            </button>

            {/* PWA Install Button */}
            <PWAInstallButton compact />

            {/* Refresh Button */}
            <button
              onClick={() => loadData(true)}
              disabled={isRefreshing}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition active:scale-95"
              title="重新整理資料"
            >
              <RefreshCw className={`w-4 h-4 ${isRefreshing ? 'animate-spin text-blue-600' : ''}`} />
            </button>

            {/* Settings Button */}
            <button
              onClick={() => setShowSettingsModal(true)}
              className="p-2 rounded-xl text-slate-600 hover:text-slate-900 hover:bg-slate-100 transition active:scale-95"
              title="系統設定與 API"
            >
              <Settings className="w-4 h-4" />
            </button>

            {/* 上鎖：只在家長模式已解鎖時出現，點一下就退出並回到小孩檢視區 */}
            {isParentUnlocked && (
              <button
                onClick={handleLockParentMode}
                className="p-2 rounded-xl bg-orange-100 text-orange-700 hover:bg-orange-200 transition active:scale-95"
                title="上鎖並返回小孩檢視區"
              >
                <Lock className="w-4 h-4" />
              </button>
            )}
          </div>
        </div>

        {/* Top Navigation Tabs: Kid View vs Parent Operation Zone */}
        <div className="max-w-md mx-auto px-4 pb-2.5">
          <div className="grid grid-cols-2 gap-1.5 p-1 bg-slate-100 rounded-2xl border border-slate-200/60">
            <button
              id="tab-kid-view"
              onClick={() => handleTabClick('kid')}
              className={`py-2 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'kid'
                  ? 'bg-white text-blue-700 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Sparkles className="w-3.5 h-3.5 text-amber-500" />
              <span>小孩檢視區</span>
            </button>

            <button
              id="tab-parent-view"
              onClick={() => handleTabClick('parent')}
              className={`py-2 px-3 rounded-xl font-bold text-xs sm:text-sm transition-all flex items-center justify-center gap-1.5 ${
                activeTab === 'parent'
                  ? 'bg-white text-orange-600 shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {isParentUnlocked ? (
                <Unlock className="w-3.5 h-3.5 text-emerald-500" />
              ) : (
                <Lock className="w-3.5 h-3.5 text-orange-400" />
              )}
              <span>家長操作區</span>
              {!isParentUnlocked && (
                <span className="text-[10px] bg-orange-100 text-orange-700 px-1 rounded font-normal">密碼</span>
              )}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 max-w-md w-full mx-auto p-4">
        {/* Network Error or Notice banner */}
        {errorMessage && (
          <div className="mb-4 p-3 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 text-xs flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <Info className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">已切換至快取模式</p>
                <p className="text-[11px] text-amber-700 mt-0.5">{errorMessage}</p>
              </div>
            </div>
            <button
              onClick={() => setShowSettingsModal(true)}
              className="text-xs text-blue-700 underline shrink-0 font-medium"
            >
              檢查 API
            </button>
          </div>
        )}

        {/* 對帳警示：伺服器用完整歷史比對，發現明細加總與總分對不上時顯示。
            只提示不自動修正 —— 差異的原因不同，正確的修法也不同。 */}
        {audit &&
          !audit.ok &&
          (audit.mismatches.length > 0 ||
            audit.orphans.length > 0 ||
            audit.duplicateLogIds.length > 0 ||
            audit.staleBalances.length > 0) && (
          <div className="mb-4 p-3 rounded-2xl bg-orange-50 border border-orange-300 text-orange-900 text-xs">
            <div className="flex items-center gap-2">
              <ShieldCheck className="w-4 h-4 text-orange-600 shrink-0" />
              <p className="font-bold">積分與明細對不上</p>
            </div>
            <div className="mt-2 space-y-1">
              {audit.mismatches.map((m) => (
                <div key={m.userId} className="flex items-center justify-between gap-2 font-mono">
                  <span className="font-sans font-semibold">{m.name}</span>
                  <span className="text-orange-700">
                    總分 {m.stored} / 明細加總 {m.sum}
                    <span className="ml-1 font-bold">
                      （差 {m.diff > 0 ? '+' : ''}{m.diff}）
                    </span>
                  </span>
                </div>
              ))}
            </div>
            {audit.orphans.length > 0 && (
              <div className="mt-2 pt-2 border-t border-orange-200 space-y-1">
                <p className="font-semibold">找不到對應孩子的紀錄</p>
                {audit.orphans.map((o) => (
                  <div key={o.userId} className="flex items-center justify-between gap-2 font-mono">
                    <span>UserID「{o.userId}」</span>
                    <span className="text-orange-700">共 {o.sum} 點</span>
                  </div>
                ))}
                <p className="text-[11px] text-orange-700/90">
                  這些分數不屬於任何孩子，通常是 UserID 打錯。
                </p>
              </div>
            )}

            {audit.staleBalances.length > 0 && (
              <div className="mt-2 pt-2 border-t border-orange-200 space-y-1">
                <p className="font-semibold">明細的餘額欄過期</p>
                {audit.staleBalances.map((s) => (
                  <div key={s.userId} className="flex items-center justify-between gap-2">
                    <span className="font-sans font-semibold">{s.name}</span>
                    <span className="text-orange-700 font-mono">{s.rows} 列</span>
                  </div>
                ))}
                <p className="text-[11px] text-orange-700/90">
                  總分是對的，但明細每列顯示的「餘額」不對。多半是補登了過去日期的紀錄。
                  按下面的重新計算即可修正。
                </p>
              </div>
            )}

            {audit.duplicateLogIds.length > 0 && (
              <div className="mt-2 pt-2 border-t border-orange-200 space-y-1">
                <p className="font-semibold">LogID 重複</p>
                <p className="font-mono text-orange-700">
                  {audit.duplicateLogIds.join('、')}
                </p>
                <p className="text-[11px] text-orange-700/90">
                  多半是複製整列貼上忘了改編號。請在「點數存摺」把重複的改成不同編號。
                  重新計算不會修這個。
                </p>
              </div>
            )}

            <p className="mt-2 text-[11px] text-orange-700/90">
              積分對不上通常是手動刪改了紀錄但沒同步總分。
              {isParentUnlocked
                ? '可以用下面的按鈕讓系統以存摺為準重算。'
                : '家長解鎖後，這裡會出現以存摺為準重算的按鈕。'}
            </p>

            {/* 重算：先預覽再套用，不直接改資料。這會寫入試算表，只給已解鎖的家長 */}
            {isParentUnlocked && (
              <div className="mt-2.5 pt-2.5 border-t border-orange-200">
                {recalcError && (
                  <p className="mb-2 text-[11px] text-rose-700 font-medium">{recalcError}</p>
                )}

                {!recalcPreview ? (
                  <button
                    onClick={handleRecalcPreview}
                    disabled={recalcBusy}
                    className="w-full py-2 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 active:scale-98 transition disabled:opacity-50"
                  >
                    {recalcBusy ? '計算中...' : '以存摺為準重新計算'}
                  </button>
                ) : (
                  <div className="space-y-2">
                    <p className="font-bold">將會這樣修正：</p>
                    {recalcPreview.totals.length === 0 && recalcPreview.balanceRowsChanged === 0 ? (
                      <p className="text-orange-700">沒有需要修正的地方。</p>
                    ) : (
                      <div className="space-y-1">
                        {recalcPreview.totals.map((t) => (
                          <div key={t.userId} className="flex items-center justify-between gap-2">
                            <span className="font-semibold">{t.name} 總分</span>
                            <span className="font-mono text-orange-700">
                              {t.from} → <span className="font-bold">{t.to}</span>
                            </span>
                          </div>
                        ))}
                        {recalcPreview.balanceRowsChanged > 0 && (
                          <p className="text-orange-700">
                            另外修正存摺中 {recalcPreview.balanceRowsChanged} 列的餘額欄
                          </p>
                        )}
                      </div>
                    )}

                    <div className="flex gap-2 pt-1">
                      <button
                        onClick={handleRecalcApply}
                        disabled={recalcBusy}
                        className="flex-1 py-2 rounded-xl bg-orange-600 text-white text-xs font-bold hover:bg-orange-700 active:scale-98 transition disabled:opacity-50"
                      >
                        {recalcBusy ? '寫入中...' : '確認修正'}
                      </button>
                      <button
                        onClick={() => setRecalcPreview(null)}
                        disabled={recalcBusy}
                        className="px-3 py-2 rounded-xl bg-white border border-orange-300 text-orange-800 text-xs font-medium hover:bg-orange-50 transition disabled:opacity-50"
                      >
                        取消
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        )}

        {/* Loading State Skeleton */}
        {isLoading ? (
          <div className="space-y-4 py-8 text-center">
            <div className="w-12 h-12 border-3 border-blue-600 border-t-transparent rounded-full animate-spin mx-auto" />
            <p className="text-sm font-medium text-slate-600">正在同步 Google Sheet 資料中...</p>
            <p className="text-xs text-slate-400">讀取任務與配分表、點數存摺、使用者資料</p>
          </div>
        ) : activeTab === 'kid' ? (
          <KidView
            users={displayUsers}
            records={displayRecords}
            tasks={tasks}
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
            onRefresh={() => loadData(true)}
            isRefreshing={isRefreshing}
            // 只有解鎖的家長點紀錄才會跳出刪除確認；小孩點了沒有反應
            onDeleteRecord={isParentUnlocked ? handleDeleteRecord : undefined}
          />
        ) : (
          <>

            <ParentView
            users={displayUsers}
            tasks={tasks}
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
            onSubmitRecord={handleParentSubmitRecord}
            onAddTask={handleAddTask}
            failedItems={outbox.filter((i) => i.status === 'failed')}
            // 掉一次回應很常見，核對一下就好；連續兩輪以上沒成功才讓家長知道
            stuckCount={outbox.filter((i) => i.status === 'pending' && (i.retries ?? 0) >= 2).length}
            onRetryFailed={handleRetryFailed}
            onDiscardFailed={handleDiscardFailed}
            />
          </>
        )}
      </main>

      {/* Offline Toast Banner */}
      {!isOnline && (
        <div className="fixed bottom-4 left-4 right-4 max-w-md mx-auto z-50 flex items-center justify-center gap-2 rounded-2xl bg-amber-600 text-white px-4 py-2.5 text-xs font-medium shadow-xl">
          <WifiOff className="w-4 h-4" />
          <span>離線模式 — 正使用本機快取資料</span>
        </div>
      )}

      {/* Floating View Tasks Button (Sticky on bottom corner) */}
      <div className="fixed bottom-5 right-5 z-30">
        <button
          onClick={() => setShowTasksModal(true)}
          className="flex items-center gap-1.5 px-3.5 py-2.5 rounded-full bg-slate-900 text-white font-medium text-xs shadow-lg shadow-slate-900/20 hover:bg-slate-800 active:scale-95 transition"
        >
          <ListChecks className="w-4 h-4 text-amber-400" />
          <span>任務配分表</span>
        </button>
      </div>

      {/* Parent Password Verification Modal */}
      {showPasswordModal && (
        <ParentPasswordModal
          onVerify={verifyParentPassword}
          // 有本機雜湊就能立刻驗證；沒有的話要等第一次連線成功
          isSyncing={!hasFreshData && !passwordHash && isRefreshing}
          // 連線已經失敗、手上又沒有雜湊：不要一直顯示「同步中」，要說清楚是連不上
          syncFailed={!hasFreshData && !passwordHash && !isRefreshing}
          // 試算表 ADM 密碼欄是空的：不給任何密碼通過，也不退回內建預設值
          notConfigured={hasFreshData && !passwordHash}
          // 只有「本機有憑證且伺服器名單也有」才給指紋，避免偽造 localStorage 繞過
          onBiometric={isThisDeviceTrusted ? verifyBiometric : undefined}
          onSuccess={handlePasswordSuccess}
          onClose={() => setShowPasswordModal(false)}
        />
      )}

      {/* Tasks Reference Modal */}
      {showTasksModal && (
        <TasksTableModal
          tasks={tasks}
          onClose={() => setShowTasksModal(false)}
        />
      )}

      {/* Settings Modal */}
      {showSettingsModal && (
        <SettingsModal
          onClose={() => setShowSettingsModal(false)}
          trustedDevices={trustedDevices}
          maxTrustedDevices={maxTrustedDevices}
          localCredentialId={localCredentialId}
          // 只有已解鎖家長區時才給裝置管理 —— 小孩點設定看不到這一區
          onRemoveDevice={isParentUnlocked ? revokeDevice : undefined}
          onEnrollDevice={
            isParentUnlocked && unlockedWithPassword ? handleEnrollFromSettings : undefined
          }
          bioAvailable={bioAvailable}
          isThisDeviceTrusted={isThisDeviceTrusted}
          onRefreshData={() => loadData(true)}
          onResetLocalData={handleResetLocalData}
          isParentUnlocked={isParentUnlocked}
          // 連線設定平常只給已解鎖的家長。例外是這台根本無法驗證密碼（從沒連上過）——
          // 此時家長也解不了鎖，若網址設錯就永遠救不回來，所以開放修改
          allowConnectionSettings={isParentUnlocked || !passwordHash}
          onCheckPassword={checkParentPassword}
          onPasswordChanged={handlePasswordChanged}
        />
      )}
    </div>
  );
}

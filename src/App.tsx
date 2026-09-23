import React, { useEffect, useState, useCallback, useRef } from 'react';
import { CleanTask, CleanUser, CleanRecord, RawSheetResponse, SheetAudit, RecalcResult, TrustedDevice } from './types';
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
  getParentPassword,
  hashPassword,
  getCachedPasswordHash,
  saveCachedPasswordHash,
  writeRecordToGoogleSheet,
  addNewTaskToGoogleSheet,
  recalculateGoogleSheet,
  registerTrustedDevice,
  removeTrustedDevice,
  getCachedTrustedDevices,
  saveCachedTrustedDevices,
  INITIAL_TASKS_SEED,
  INITIAL_USERS_SEED,
} from './utils/sheetData';
import { KidView } from './components/KidView';
import { ParentView } from './components/ParentView';
import { ParentPasswordModal } from './components/ParentPasswordModal';
import { TasksTableModal } from './components/TasksTableModal';
import { SettingsModal } from './components/SettingsModal';
import { PWAInstallButton } from './components/PWAInstallButton';
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

export default function App() {
  // 用 lazy initializer 在「第一次渲染之前」就把快取讀進來，
  // 這樣有快取時完全不會出現載入轉圈，畫面是秒開的。
  const cachedUsersOnMount = getCachedUsers();

  const [tasks, setTasks] = useState<CleanTask[]>(() => getCachedTasks() ?? INITIAL_TASKS_SEED);
  const [users, setUsers] = useState<CleanUser[]>(() => cachedUsersOnMount ?? INITIAL_USERS_SEED);
  const [records, setRecords] = useState<CleanRecord[]>(() => getLocalLogs());

  // 資料是否已經跟 Google Sheet 同步過（快取畫出來的不算）
  const [hasFreshData, setHasFreshData] = useState(false);
  const [rawResponse, setRawResponse] = useState<RawSheetResponse | null>(null);
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
  const [isWritingToSheet, setIsWritingToSheet] = useState(false);

  const isOnline = useOnlineStatus();

  // Find admin user for password
  const adminUser = users.find((u) => u.isAdmin || u.id.toUpperCase() === 'ADM' || u.name === '家長');
  const [effectivePassword, setEffectivePassword] = useState<string>(() =>
    getParentPassword(adminUser?.password)
  );

  // Keep effective password in sync if adminUser changes
  useEffect(() => {
    if (adminUser?.password) {
      setEffectivePassword(getParentPassword(adminUser.password));
    }
  }, [adminUser]);

  // 密碼的本機雜湊，讓解鎖不必等連線
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

  // 只在資料確實同步過之後才存雜湊 ——
  // 否則連線失敗時 effectivePassword 會是內建預設值，存下去就把錯的密碼記起來了。
  useEffect(() => {
    if (!hasFreshData || !effectivePassword) return;
    let cancelled = false;
    hashPassword(effectivePassword).then((h) => {
      if (cancelled || !h) return;
      saveCachedPasswordHash(h);
      setPasswordHash(h);
    });
    return () => {
      cancelled = true;
    };
  }, [hasFreshData, effectivePassword]);

  /**
   * 驗證家長密碼。
   * 資料已同步時直接比對明文（最權威）；否則用本機雜湊，使用者就不用等那 3 秒。
   */
  const verifyParentPassword = async (input: string): Promise<boolean> => {
    const candidate = input.trim();
    if (!candidate) return false;

    const remember = (ok: boolean) => {
      if (ok) setUnlockedWithPassword(candidate);
      return ok;
    };

    if (hasFreshData) return remember(candidate === effectivePassword.trim());

    if (passwordHash) {
      const h = await hashPassword(candidate);
      return remember(h !== null && h === passwordHash);
    }
    return false;
  };

  // Load and merge data from Google Sheet & Local Storage
  /**
   * 回傳這次抓到的紀錄，讓「寫入結果不確定」時可以據此判斷實際有沒有寫進去。
   *
   * @param fresh 略過伺服器快取。開啟 App 時不用（快取快很多），
   *              使用者按重新整理、或要確認剛才的寫入時才需要。
   */
  const loadData = useCallback(async (fresh = false): Promise<CleanRecord[] | null> => {
    // 畫面已經用快取畫好了，這裡只是背景更新，所以一律走 refreshing 而不是 loading
    setIsRefreshing(true);
    setErrorMessage(null);
    const startedAt = Date.now();

    try {
      const data = await fetchSheetData(fresh);
      setRawResponse(data.raw);
      setAudit(data.audit);
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
      }

      // Users: Prioritize actual Google Sheet data
      const mergedUsers = data.users.length > 0 ? data.users : INITIAL_USERS_SEED;
      setUsers(mergedUsers);

      // Ensure effective password picks up any sheet changes
      const foundAdmin = mergedUsers.find((u) => u.isAdmin || u.id.toUpperCase() === 'ADM' || u.name === '家長');
      if (foundAdmin?.password) {
        setEffectivePassword(getParentPassword(foundAdmin.password));
      }

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
      const sortedRecords = [...data.records].sort(
        (a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
      );
      setRecords(sortedRecords);

      // On successful live sheet sync (especially manual refresh), keep local cache aligned with live sheet
      saveLocalLogs(sortedRecords);
      const sheetUserPoints: Record<string, number> = {};
      mergedUsers.forEach((u) => {
        sheetUserPoints[u.id] = u.currentPoints;
      });
      saveLocalUsersOverride(sheetUserPoints);

      // 供下次開啟時立刻繪製（使用者資料會自動去掉密碼）
      saveCachedTasks(data.tasks);
      saveCachedUsers(mergedUsers);

      setHasFreshData(true);
      return sortedRecords;
    } catch (err: unknown) {
      console.warn('Google Sheet fetch error:', err);
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
      setIsRefreshing(false);
    }
  }, []);

  useEffect(() => {
    loadData();
  }, [loadData]);

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

  // Handle Parent Submitting a Point Adjustment Record
  const handleParentSubmitRecord = async (
    newRecordData: Omit<CleanRecord, 'id' | 'balanceAfter' | 'isLocal'>
  ): Promise<{ ok: boolean; message?: string }> => {
    // 一切以試算表為準：**先寫入、確認成功後才更新畫面**，不做樂觀更新。
    // 代價是送出後要等約 3 秒；換來的是畫面上的數字必定與試算表一致。
    const userToUpdate = users.find((u) => u.id === newRecordData.userId);
    const prevPoints = userToUpdate ? userToUpdate.currentPoints : 0;

    // timestamp 由表單決定（可以補登過去的日期），不是固定用「現在」
    // 加隨機碼：伺服器會用 LogID 去重（避免重送造成重複計分），
    // 只有毫秒的話，兩台裝置剛好同時送出就會被誤判成同一筆而靜默丟失。
    const logId = `L${Date.now()}${Math.random().toString(36).slice(2, 6)}`;
    const pendingRecord: CleanRecord = {
      ...newRecordData,
      id: logId,
      balanceAfter: prevPoints + newRecordData.points,
      isLocal: true,
    };

    setIsWritingToSheet(true);
    try {
      const result = await writeRecordToGoogleSheet(pendingRecord, pendingRecord.balanceAfter);

      // 伺服器明確拒絕（例如兌換點數不足）——畫面完全沒動過，直接回報
      if (!result.success && result.confirmed) {
        return { ok: false, message: result.message || '寫入 Google Sheet 失敗' };
      }

      // 明確成功：用伺服器回傳的權威餘額更新，而不是前端自己加減出來的數字
      if (result.success && result.confirmed) {
        const confirmedBalance =
          typeof result.newBalance === 'number' ? result.newBalance : pendingRecord.balanceAfter;
        const confirmedRecord: CleanRecord = { ...pendingRecord, balanceAfter: confirmedBalance };

        setUsers((prev) =>
          prev.map((u) =>
            u.id === newRecordData.userId ? { ...u, currentPoints: confirmedBalance } : u
          )
        );
        const userMap = getLocalUsersOverride();
        userMap[newRecordData.userId] = confirmedBalance;
        saveLocalUsersOverride(userMap);

        setRecords((prev) => [confirmedRecord, ...prev]);
        saveLocalLogs([confirmedRecord, ...getLocalLogs()]);

        return { ok: true };
      }

      // 不確定有沒有寫進去（轉址掉回應時約兩成機率）——
      // 不要用猜的，直接回頭讀試算表看實際結果。
      const refreshed = await loadData(true);
      if (refreshed === null) {
        return {
          ok: false,
          message: '已送出但無法確認結果，也讀不到試算表。請稍後按重新整理確認，不要直接重送。',
        };
      }
      if (refreshed.some((r) => r.id === logId)) {
        return { ok: true };
      }
      return { ok: false, message: '這筆沒有寫入試算表，請再登記一次' };
    } finally {
      setIsWritingToSheet(false);
    }
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
    const res = await addNewTaskToGoogleSheet(task);
    if (!res.success) {
      return { ok: false, message: res.message || '新增項目至試算表失敗' };
    }

    // no-cors 後備路徑讀不到回應，拿不到伺服器編號時先用暫時 id，
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
              積分對不上通常是手動刪改了紀錄但沒同步總分。可以用下面的按鈕讓系統以存摺為準重算。
            </p>

            {/* 重算：先預覽再套用，不直接改資料 */}
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
            users={users}
            records={records}
            tasks={tasks}
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
            onRefresh={() => loadData(true)}
            isRefreshing={isRefreshing}
          />
        ) : (
          <>

            <ParentView
            users={users}
            tasks={tasks}
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
            onSubmitRecord={handleParentSubmitRecord}
            onAddTask={handleAddTask}
            isWritingToSheet={isWritingToSheet}
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
          // 有本機雜湊就能立刻驗證；兩者皆無時才需要等連線
          isSyncing={!hasFreshData && !passwordHash}
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
          rawResponse={rawResponse}
          currentPassword={effectivePassword}
          onPasswordChanged={(newPass) => setEffectivePassword(newPass)}
        />
      )}
    </div>
  );
}

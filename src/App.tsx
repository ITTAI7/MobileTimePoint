import React, { useEffect, useState, useCallback } from 'react';
import { CleanTask, CleanUser, CleanRecord, RawSheetResponse } from './types';
import {
  fetchSheetData,
  getLocalLogs,
  saveLocalLogs,
  getLocalUsersOverride,
  saveLocalUsersOverride,
  clearLocalData,
  getParentPassword,
  writeRecordToGoogleSheet,
  INITIAL_TASKS_SEED,
  INITIAL_USERS_SEED,
} from './utils/sheetData';
import { KidView } from './components/KidView';
import { ParentView } from './components/ParentView';
import { ParentPasswordModal } from './components/ParentPasswordModal';
import { ChangePasswordModal } from './components/ChangePasswordModal';
import { TasksTableModal } from './components/TasksTableModal';
import { SettingsModal } from './components/SettingsModal';
import { PWAInstallButton } from './components/PWAInstallButton';
import { useOnlineStatus } from './hooks/useOnlineStatus';
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
  const [tasks, setTasks] = useState<CleanTask[]>(INITIAL_TASKS_SEED);
  const [users, setUsers] = useState<CleanUser[]>(INITIAL_USERS_SEED);
  const [records, setRecords] = useState<CleanRecord[]>([]);
  const [rawResponse, setRawResponse] = useState<RawSheetResponse | null>(null);

  const [isLoading, setIsLoading] = useState(true);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  // Tab & Auth States
  const [activeTab, setActiveTab] = useState<'kid' | 'parent'>('kid');
  const [isParentUnlocked, setIsParentUnlocked] = useState(false);
  const [showPasswordModal, setShowPasswordModal] = useState(false);
  const [showChangePasswordModal, setShowChangePasswordModal] = useState(false);

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

  // Load and merge data from Google Sheet & Local Storage
  const loadData = useCallback(async (isManualRefresh = false) => {
    if (isManualRefresh) {
      setIsRefreshing(true);
    } else {
      setIsLoading(true);
    }
    setErrorMessage(null);

    try {
      const data = await fetchSheetData();
      setRawResponse(data.raw);

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

      // If selectedUserId is not in children, default to first child
      const childrenOnly = mergedUsers.filter((u) => !u.isAdmin && u.id.toUpperCase() !== 'ADM' && u.name !== '家長');
      if (childrenOnly.length > 0 && !childrenOnly.some((u) => u.id === selectedUserId)) {
        setSelectedUserId(childrenOnly[0].id);
      }

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
    } catch (err: unknown) {
      console.warn('Google Sheet fetch error:', err);
      const msg = err instanceof Error ? err.message : '連線失敗';
      setErrorMessage(msg);

      // Fallback gracefully to local data
      const localLogs = getLocalLogs();
      const localUsersOverride = getLocalUsersOverride();
      const fallbackUsers = INITIAL_USERS_SEED.map((u) => ({
        ...u,
        currentPoints: localUsersOverride[u.id] !== undefined ? localUsersOverride[u.id] : u.currentPoints,
      }));

      setUsers(fallbackUsers);
      setRecords(localLogs);
    } finally {
      setIsLoading(false);
      setIsRefreshing(false);
    }
  }, [selectedUserId]);

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

  const handlePasswordSuccess = () => {
    setIsParentUnlocked(true);
    setShowPasswordModal(false);
    setActiveTab('parent');
  };

  const handleLockParentMode = () => {
    setIsParentUnlocked(false);
    setActiveTab('kid');
  };

  // Handle Parent Submitting a Point Adjustment Record
  const handleParentSubmitRecord = async (
    newRecordData: Omit<CleanRecord, 'id' | 'timestamp' | 'balanceAfter' | 'isLocal'>
  ) => {
    // 1. Calculate new points for the targeted child
    const userToUpdate = users.find((u) => u.id === newRecordData.userId);
    const prevPoints = userToUpdate ? userToUpdate.currentPoints : 0;
    const newBalance = prevPoints + newRecordData.points;

    // 2. Create the clean record with consistent LogID
    const createdRecord: CleanRecord = {
      ...newRecordData,
      id: `L${Date.now()}`,
      timestamp: new Date().toISOString(),
      balanceAfter: newBalance,
      isLocal: true,
    };

    // 3. Update Users in state and local storage immediately
    const updatedUsers = users.map((u) => {
      if (u.id === newRecordData.userId) {
        return { ...u, currentPoints: newBalance };
      }
      return u;
    });
    setUsers(updatedUsers);

    const userMap = getLocalUsersOverride();
    userMap[newRecordData.userId] = newBalance;
    saveLocalUsersOverride(userMap);

    // 4. Update Records in state and local storage
    const currentLocalLogs = getLocalLogs();
    const updatedLocalLogs = [createdRecord, ...currentLocalLogs];
    saveLocalLogs(updatedLocalLogs);

    setRecords((prev) => [createdRecord, ...prev]);

    // 5. Trigger writing to Google Sheet via doPost
    setIsWritingToSheet(true);
    try {
      await writeRecordToGoogleSheet(createdRecord, newBalance);
    } catch (err) {
      console.warn('writeRecordToGoogleSheet error:', err);
    } finally {
      setIsWritingToSheet(false);
    }
  };

  // Reset Local Additions
  const handleResetLocalData = () => {
    localStorage.removeItem('weekend_points_local_logs_v1');
    localStorage.removeItem('weekend_points_local_users_v1');
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
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
            onRefresh={() => loadData(true)}
            isRefreshing={isRefreshing}
          />
        ) : (
          <ParentView
            users={users}
            tasks={tasks}
            selectedUserId={selectedUserId}
            onSelectUser={setSelectedUserId}
            onSubmitRecord={handleParentSubmitRecord}
            onOpenTasksModal={() => setShowTasksModal(true)}
            onLockParentMode={handleLockParentMode}
            onChangePasswordClick={() => setShowChangePasswordModal(true)}
            isWritingToSheet={isWritingToSheet}
          />
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
          expectedPassword={effectivePassword}
          onSuccess={handlePasswordSuccess}
          onClose={() => setShowPasswordModal(false)}
        />
      )}

      {/* Change Password Modal */}
      {showChangePasswordModal && (
        <ChangePasswordModal
          currentPassword={effectivePassword}
          onSuccess={(newPass) => {
            setEffectivePassword(newPass);
            setShowChangePasswordModal(false);
          }}
          onClose={() => setShowChangePasswordModal(false)}
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

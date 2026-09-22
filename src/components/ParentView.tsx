import React, { useMemo, useState } from 'react';
import { CleanUser, CleanTask, CleanRecord } from '../types';
import { 
  Check, 
  Plus, 
  Minus, 
  ShieldCheck, 
  Sparkles, 
  ListPlus, 
  Lock, 
  KeyRound,
  CheckCircle,
  ChevronDown,
  LogOut,
  Loader2,
  AlertTriangle,
  BookmarkPlus
} from 'lucide-react';
import { motion } from 'motion/react';

interface Props {
  users: CleanUser[];
  tasks: CleanTask[];
  selectedUserId: string;
  onSelectUser: (userId: string) => void;
  onSubmitRecord: (
    record: Omit<CleanRecord, 'id' | 'balanceAfter' | 'isLocal'>
  ) => Promise<{ ok: boolean; message?: string }>;
  onAddTask: (task: {
    category: string;
    name: string;
    points: number;
    note?: string;
  }) => Promise<{ ok: boolean; taskId?: string; message?: string }>;
  onOpenTasksModal: () => void;
  onLockParentMode: () => void;
  onChangePasswordClick: () => void;
  isWritingToSheet?: boolean;
}

/** 本機時區的今天，格式 YYYY-MM-DD（date input 需要） */
function todayLocalISO(): string {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/**
 * 把 date input 的 YYYY-MM-DD 轉成完整時間戳。
 * 時分秒沿用當下的時鐘 —— 補登時連續登記多筆才會保持先後順序。
 */
function toTimestamp(dateStr: string): string {
  const now = new Date();
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return now.toISOString();
  return new Date(y, m - 1, d, now.getHours(), now.getMinutes(), now.getSeconds()).toISOString();
}

/** 這個日期是否落在本週（星期日~星期六）—— 不在的話不會出現在小孩區的本週明細 */
function isThisWeek(dateStr: string): boolean {
  const [y, m, d] = dateStr.split('-').map(Number);
  if (!y || !m || !d) return true;
  const target = new Date(y, m - 1, d).getTime();
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  start.setDate(start.getDate() - start.getDay());
  const end = new Date(start);
  end.setDate(end.getDate() + 7);
  return target >= start.getTime() && target < end.getTime();
}

/** 分類按鈕選中時的配色，與小孩區的類別標籤一致 */
function getCategoryPillActive(category: string): string {
  if (category.includes('兌換')) return 'bg-purple-600 text-white border-purple-600 shadow-xs';
  if (category.includes('扣分')) return 'bg-rose-600 text-white border-rose-600 shadow-xs';
  if (category.includes('加分')) return 'bg-emerald-600 text-white border-emerald-600 shadow-xs';
  return 'bg-blue-600 text-white border-blue-600 shadow-xs';
}

export const ParentView: React.FC<Props> = ({
  users,
  tasks,
  selectedUserId,
  onSelectUser,
  onSubmitRecord,
  onAddTask,
  onOpenTasksModal,
  onLockParentMode,
  onChangePasswordClick,
  isWritingToSheet = false,
}) => {
  // Filter only children (exclude admin ADM)
  const childrenList = users.filter((u) => !u.isAdmin && u.id.toUpperCase() !== 'ADM' && u.name !== '家長');
  
  // 依類別分組排序：每日任務 → 加分 → 扣分 → 兌換 → 其他。
  // 兌換項目排最後，避免表單一打開就預設停在扣點的選項。
  const categoryOrder = (category: string): number => {
    if (category.includes('每日')) return 0;
    if (category.includes('加分')) return 1;
    if (category.includes('扣分')) return 2;
    if (category.includes('兌換')) return 4;
    return 3;
  };

  const parentTasks = [...tasks].sort(
    (a, b) => categoryOrder(a.category) - categoryOrder(b.category)
  );

  // 類別清單，供步驟 2 的分類按鈕使用
  const categories = useMemo(() => {
    const seen: string[] = [];
    parentTasks.forEach((t) => {
      if (!seen.includes(t.category)) seen.push(t.category);
    });
    return seen;
  }, [parentTasks]);

  // Form states
  const [isCustom, setIsCustom] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(parentTasks[0]?.id || '');
  const [selectedCategory, setSelectedCategory] = useState<string>(parentTasks[0]?.category || '');
  const [customTaskName, setCustomTaskName] = useState('');
  const [customCategory, setCustomCategory] = useState('加分項目');
  const [saveCustomToTaskList, setSaveCustomToTaskList] = useState(true);
  const [pointsChange, setPointsChange] = useState<number>(parentTasks[0]?.points || 2);
  const [note, setNote] = useState('');
  const [recordDate, setRecordDate] = useState<string>(todayLocalISO());
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [taskSavedMessage, setTaskSavedMessage] = useState<string | null>(null);

  // Default to first child if selected is admin or not in children list
  const currentChild = childrenList.find((u) => u.id === selectedUserId) || childrenList[0] || {
    id: 'U01',
    name: '孩子',
    grade: '',
    currentPoints: 0,
  };

  // 任務是非同步載入的，初始 state 可能對不上實際資料，所以這裡都要有退路
  const activeCategory = categories.includes(selectedCategory) ? selectedCategory : categories[0] || '';
  const visibleTasks = parentTasks.filter((t) => t.category === activeCategory);
  const selectedPresetTask = visibleTasks.find((t) => t.id === selectedTaskId) || visibleTasks[0];

  const handleCategoryChange = (category: string) => {
    setSelectedCategory(category);
    setIsCustom(false);
    const first = parentTasks.find((t) => t.category === category);
    if (first) {
      setSelectedTaskId(first.id);
      setPointsChange(first.points);
    }
  };

  // Handle Preset Task Selection
  const handleTaskChange = (taskId: string) => {
    if (taskId === '__CUSTOM__') {
      setIsCustom(true);
      return;
    }
    setIsCustom(false);
    setSelectedTaskId(taskId);
    const task = parentTasks.find((t) => t.id === taskId);
    if (task) {
      setPointsChange(task.points);
    }
  };

  const handlePointAdjust = (delta: number) => {
    setPointsChange((prev) => prev + delta);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // 按鈕已停用，這裡再擋一次以防萬一
    if (insufficientPoints) return;

    setSubmitError(null);

    const taskName = isCustom
      ? customTaskName.trim() || '自訂項目'
      : selectedPresetTask?.name || '任務';
    const category = isCustom
      ? customCategory
      : selectedPresetTask?.category || '一般任務';

    // If custom and user selected to save to sheet tasks table
    if (isCustom && saveCustomToTaskList) {
      setTaskSavedMessage('正在同步新增項目至「任務與配分表」...');
      onAddTask({
        category,
        name: taskName,
        points: pointsChange,
        note: note.trim() || undefined,
      })
        .then((res) => {
          // onAddTask 成功後會直接更新任務清單，切回「任務選單」就看得到，不用重新載入
          setTaskSavedMessage(
            res.ok
              ? `已新增至「任務與配分表」${res.taskId ? `（編號 ${res.taskId}）` : ''}，切到「任務選單」就能重複使用`
              : res.message || '新增項目至試算表失敗'
          );
        })
        .catch(() => {
          setTaskSavedMessage('新增項目至試算表失敗');
        });
    } else {
      setTaskSavedMessage(null);
    }

    const result = await onSubmitRecord({
      userId: currentChild.id,
      userName: currentChild.name,
      taskName,
      category,
      points: pointsChange,
      note: note.trim() || undefined,
      timestamp: toTimestamp(recordDate),
    });

    // 伺服器拒絕（例如另一台裝置搶先兌換掉點數）：顯示原因，不要報成功
    if (!result.ok) {
      setSubmitError(result.message || '登記失敗，請重新整理後再試');
      return;
    }

    setSubmittedSuccess(true);
    setTimeout(() => {
      setSubmittedSuccess(false);
      setTaskSavedMessage(null);
    }, 4000);

    setNote('');
    if (isCustom) {
      setCustomTaskName('');
    }
  };

  const newBalance = currentChild.currentPoints + pointsChange;

  // 兌換不能透支：點數不夠就擋下來。
  // 扣分項目則允許扣成負分（表現不好扣到欠點是合理的）。
  const isRedeem = isCustom
    ? customCategory.includes('兌換')
    : !!selectedPresetTask?.category.includes('兌換');
  const insufficientPoints = isRedeem && newBalance < 0;

  return (
    <div className="space-y-4 pb-24 animate-in fade-in duration-200">
      {/* Header Banner with Lock & Change Password buttons */}
      <div className="flex items-center justify-between p-4 rounded-2xl bg-gradient-to-r from-amber-500 via-orange-500 to-amber-600 text-white shadow-md shadow-orange-500/15">
        <div className="flex items-center gap-2.5">
          <div className="w-9 h-9 rounded-xl bg-white/20 backdrop-blur-xs flex items-center justify-center text-white">
            <ShieldCheck className="w-5 h-5" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <h2 className="font-bold text-base">家長操作專區</h2>
              <span className="text-[10px] bg-white/20 px-1.5 py-0.5 rounded font-mono">ADM 已驗證</span>
            </div>
            <p className="text-xs text-orange-100">管理每日任務、加分與扣分</p>
          </div>
        </div>

        <div className="flex items-center gap-1.5">
          {/* Change Password */}
          <button
            type="button"
            onClick={onChangePasswordClick}
            className="p-2 rounded-xl bg-white/20 hover:bg-white/30 text-white transition active:scale-95 text-xs flex items-center gap-1"
            title="修改家長密碼"
          >
            <KeyRound className="w-4 h-4" />
          </button>

          {/* Lock / Exit Parent Mode */}
          <button
            type="button"
            onClick={onLockParentMode}
            className="px-2.5 py-1.5 rounded-xl bg-white text-orange-700 hover:bg-orange-50 text-xs font-bold transition active:scale-95 flex items-center gap-1 shadow-xs"
            title="鎖定並返回小孩檢視區"
          >
            <Lock className="w-3.5 h-3.5" />
            <span>上鎖離開</span>
          </button>
        </div>
      </div>

      {/* Main Operation Form */}
      <form onSubmit={handleSubmit} className="p-5 rounded-3xl bg-white border border-slate-200/80 shadow-xs space-y-4">
        {/* Step 1: Select Child */}
        <div>
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            步驟 1：選擇孩子
          </label>
          <div className="grid grid-cols-2 gap-2">
            {childrenList.map((user) => {
              const isSelected = user.id === currentChild.id;
              return (
                <button
                  type="button"
                  key={user.id}
                  onClick={() => onSelectUser(user.id)}
                  className={`p-3 rounded-2xl border text-left transition-all relative ${
                    isSelected
                      ? 'border-blue-600 bg-blue-50/70 text-blue-900 ring-2 ring-blue-600/20 shadow-xs'
                      : 'border-slate-200 bg-slate-50/50 text-slate-700 hover:bg-slate-100'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <span className="font-bold text-sm">{user.name}</span>
                    <span className="text-xs px-2 py-0.5 rounded-full bg-white font-mono font-bold text-blue-600 border border-slate-100">
                      {user.currentPoints} 點
                    </span>
                  </div>
                  <div className="text-xs text-slate-500 mt-1 flex items-center justify-between">
                    <span>{user.grade || '學生'}</span>
                    {isSelected && (
                      <span className="text-blue-600 text-xs font-semibold flex items-center gap-0.5">
                        <Check className="w-3.5 h-3.5" /> 已選
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Step 2: Select Task Mode (Preset Tasks excluding 兌換 vs Custom) */}
        <div className="pt-2 border-t border-slate-100">
          <div className="flex items-center justify-between mb-2">
            <label className="text-xs font-semibold text-slate-500 uppercase tracking-wider">
              步驟 2：選擇任務項目
            </label>
            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
              <button
                type="button"
                onClick={() => {
                  setIsCustom(false);
                  if (visibleTasks[0]) {
                    setSelectedTaskId(visibleTasks[0].id);
                    setPointsChange(visibleTasks[0].points);
                  }
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  !isCustom ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                任務選單
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsCustom(true);
                  if (pointsChange === 0) setPointsChange(2);
                }}
                className={`px-2.5 py-1 rounded-lg font-medium transition ${
                  isCustom ? 'bg-white text-blue-700 shadow-xs' : 'text-slate-600'
                }`}
              >
                自訂項目 ✨
              </button>
            </div>
          </div>

          {!isCustom ? (
            /* 先用分類按鈕縮小範圍，下拉只列該分類 —— 手機上 15 個項目一次列完難讀 */
            <div className="space-y-2">
              {categories.length > 1 && (
                <div className="flex items-center gap-1.5 overflow-x-auto pb-0.5 -mx-0.5 px-0.5">
                  {categories.map((cat) => {
                    const active = cat === activeCategory;
                    const count = parentTasks.filter((t) => t.category === cat).length;
                    return (
                      <button
                        type="button"
                        key={cat}
                        onClick={() => handleCategoryChange(cat)}
                        className={`shrink-0 px-2.5 py-1.5 rounded-xl text-xs font-medium border transition active:scale-95 ${
                          active
                            ? getCategoryPillActive(cat)
                            : 'bg-white text-slate-600 border-slate-200 hover:bg-slate-50'
                        }`}
                      >
                        {cat}
                        <span className={`ml-1 ${active ? 'opacity-70' : 'text-slate-400'}`}>
                          {count}
                        </span>
                      </button>
                    );
                  })}
                </div>
              )}

              <div className="relative">
                <select
                  id="preset-task-select"
                  value={selectedPresetTask?.id || ''}
                  onChange={(e) => handleTaskChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 font-medium text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white pr-10"
                >
                  {visibleTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      {task.name} ({task.points > 0 ? `+${task.points}` : task.points} 點)
                    </option>
                  ))}
                  <option value="__CUSTOM__">➕ 自訂全新項目...</option>
                </select>
                <div className="absolute right-3.5 top-1/2 -translate-y-1/2 pointer-events-none text-slate-400">
                  <ChevronDown className="w-5 h-5" />
                </div>
              </div>
            </div>
          ) : (
            /* Custom Item Input */
            <div className="space-y-3 p-3.5 rounded-2xl bg-blue-50/50 border border-blue-100">
              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">自訂項目名稱</label>
                <input
                  type="text"
                  required
                  placeholder="例如：段考數學滿分、主動洗碗、超時玩手機..."
                  value={customTaskName}
                  onChange={(e) => setCustomTaskName(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-white border border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
                />
              </div>

              <div>
                <label className="block text-xs font-medium text-slate-600 mb-1">類別標籤</label>
                <div className="grid grid-cols-3 gap-1.5 text-xs">
                  {['加分項目', '扣分項目', '每日任務'].map((cat) => (
                    <button
                      type="button"
                      key={cat}
                      onClick={() => {
                        setCustomCategory(cat);
                        if (cat === '扣分項目' && pointsChange > 0) {
                          setPointsChange(-Math.abs(pointsChange));
                        } else if (cat === '加分項目' && pointsChange < 0) {
                          setPointsChange(Math.abs(pointsChange));
                        }
                      }}
                      className={`py-1.5 rounded-lg font-medium transition ${
                        customCategory === cat
                          ? 'bg-blue-600 text-white shadow-xs'
                          : 'bg-white text-slate-600 border border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      {cat}
                    </button>
                  ))}
                </div>
              </div>

              {/* Checkbox: Also save to Google Sheet Tasks & Points table */}
              <div className="pt-2 border-t border-blue-100/80">
                <label className="flex items-center gap-2 text-xs text-slate-700 cursor-pointer select-none">
                  <input
                    type="checkbox"
                    checked={saveCustomToTaskList}
                    onChange={(e) => setSaveCustomToTaskList(e.target.checked)}
                    className="w-4 h-4 text-blue-600 rounded-md border-slate-300 focus:ring-blue-500 cursor-pointer"
                  />
                  <div className="flex items-center gap-1">
                    <BookmarkPlus className="w-3.5 h-3.5 text-blue-600" />
                    <span className="font-medium">同時儲存至試算表「任務與配分表」供未來重複使用</span>
                  </div>
                </label>
              </div>
            </div>
          )}
        </div>

        {/* Step 3: Adjust Points */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2">
            步驟 3：變動分數 ({pointsChange > 0 ? `+${pointsChange}` : pointsChange} 點)
          </label>

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => handlePointAdjust(-1)}
              className="w-12 h-12 rounded-2xl bg-rose-50 text-rose-600 hover:bg-rose-100 active:scale-95 flex items-center justify-center font-bold text-xl border border-rose-100 transition"
              title="扣 1 點"
            >
              <Minus className="w-5 h-5" />
            </button>

            <div className="flex-1 text-center">
              <input
                type="number"
                value={pointsChange}
                onChange={(e) => setPointsChange(parseInt(e.target.value, 10) || 0)}
                className={`w-full text-center text-3xl font-black rounded-2xl py-2 font-mono border focus:outline-none focus:ring-2 ${
                  pointsChange >= 0
                    ? 'text-emerald-600 bg-emerald-50/50 border-emerald-200 focus:ring-emerald-500'
                    : 'text-rose-600 bg-rose-50/50 border-rose-200 focus:ring-rose-500'
                }`}
              />
              <p className="text-[11px] text-slate-400 mt-1">可點擊按鈕或輸入數字</p>
            </div>

            <button
              type="button"
              onClick={() => handlePointAdjust(1)}
              className="w-12 h-12 rounded-2xl bg-emerald-50 text-emerald-600 hover:bg-emerald-100 active:scale-95 flex items-center justify-center font-bold text-xl border border-emerald-100 transition"
              title="加 1 點"
            >
              <Plus className="w-5 h-5" />
            </button>
          </div>

          {/* Point quick chips */}
          <div className="flex items-center justify-center gap-1.5 mt-2.5 flex-wrap">
            {[-5, -3, -2, -1, 1, 2, 3, 5, 10].map((val) => (
              <button
                key={val}
                type="button"
                onClick={() => setPointsChange(val)}
                className={`px-2.5 py-1 rounded-lg text-xs font-mono font-semibold transition border ${
                  pointsChange === val
                    ? val > 0
                      ? 'bg-emerald-600 text-white border-emerald-600'
                      : 'bg-rose-600 text-white border-rose-600'
                    : 'bg-slate-50 text-slate-700 border-slate-200 hover:bg-slate-100'
                }`}
              >
                {val > 0 ? `+${val}` : val}
              </button>
            ))}
          </div>
        </div>

        {/* Step 4: 登記日期（可補登過去） */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            步驟 4：登記日期
          </label>
          <input
            type="date"
            value={recordDate}
            max={todayLocalISO()}
            onChange={(e) => setRecordDate(e.target.value || todayLocalISO())}
            className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
          />

          {recordDate !== todayLocalISO() && (
            <div className="mt-2 p-2.5 rounded-xl bg-blue-50 border border-blue-200 text-[11px] text-blue-900">
              <p className="font-semibold">補登過去的紀錄</p>
              {!isThisWeek(recordDate) && (
                <p className="mt-0.5 text-blue-700">
                  這個日期不在本週，分數照算，但<strong className="font-bold">不會</strong>
                  出現在小孩區的「本週積分紀錄」裡。
                </p>
              )}
            </div>
          )}
        </div>

        {/* Step 5: Optional Note */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            步驟 5：備註說明 (選填)
          </label>
          <input
            type="text"
            placeholder="例如：主動幫忙、段考表現好、時間控制優良..."
            value={note}
            onChange={(e) => setNote(e.target.value)}
            className="w-full px-3.5 py-2 rounded-xl bg-slate-50 border border-slate-200 text-slate-800 text-sm focus:ring-2 focus:ring-blue-500 focus:bg-white focus:outline-none"
          />
        </div>

        {/* Calculation Preview */}
        <div className="p-3.5 rounded-2xl bg-slate-50 border border-slate-200 flex items-center justify-between text-sm">
          <div>
            <span className="text-slate-500 text-xs block">變動前餘額</span>
            <span className="font-bold text-slate-700">{currentChild.currentPoints} 點</span>
          </div>
          <div className="text-xl text-slate-400 font-mono">➜</div>
          <div>
            <span className="text-slate-500 text-xs block">變動量</span>
            <span
              className={`font-bold font-mono ${
                pointsChange >= 0 ? 'text-emerald-600' : 'text-rose-600'
              }`}
            >
              {pointsChange >= 0 ? `+${pointsChange}` : pointsChange} 點
            </span>
          </div>
          <div className="text-xl text-slate-400 font-mono">➜</div>
          <div className="text-right">
            <span className="text-slate-500 text-xs block">變動後新餘額</span>
            <span
              className={`font-black text-base ${
                newBalance < 0 ? 'text-rose-600' : 'text-blue-700'
              }`}
            >
              {newBalance} 點
            </span>
          </div>
        </div>

        {/* 兌換點數不足的阻擋提示 */}
        {insufficientPoints && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-800">點數不足，無法兌換</p>
              <p className="text-rose-700 mt-0.5">
                {currentChild.name}目前 {currentChild.currentPoints} 點，這項需要{' '}
                {Math.abs(pointsChange)} 點，還差 {Math.abs(newBalance)} 點。
              </p>
            </div>
          </div>
        )}

        {/* Submit Button */}
        <button
          type="submit"
          disabled={(pointsChange === 0 && !isCustom) || isWritingToSheet || insufficientPoints}
          className="w-full py-3.5 px-4 rounded-2xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white font-bold text-base shadow-md shadow-blue-500/25 hover:opacity-95 active:scale-98 transition flex items-center justify-center gap-2 disabled:opacity-50"
        >
          {isWritingToSheet ? (
            <>
              <Loader2 className="w-5 h-5 animate-spin" />
              <span>正在寫入 Google Sheet 存摺...</span>
            </>
          ) : (
            <>
              <CheckCircle className="w-5 h-5" />
              <span>確認登記積分 ({pointsChange >= 0 ? `+${pointsChange}` : pointsChange} 點)</span>
            </>
          )}
        </button>

        {/* 伺服器拒絕的錯誤訊息 */}
        {submitError && (
          <div className="p-3.5 rounded-2xl bg-rose-50 border border-rose-200 text-rose-900 text-xs flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-rose-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold text-rose-800">登記失敗，已還原</p>
              <p className="text-rose-700 mt-0.5">{submitError}</p>
              <p className="text-rose-600/80 mt-1">
                點數與紀錄都沒有變動。請按右上角重新整理取得最新餘額後再試。
              </p>
            </div>
          </div>
        )}

        {/* Feedback Alert */}
        {submittedSuccess && (
          <motion.div
            initial={{ opacity: 0, y: -5 }}
            animate={{ opacity: 1, y: 0 }}
            className="p-3.5 rounded-2xl bg-emerald-50 border border-emerald-200 text-emerald-900 text-xs flex items-start gap-2.5"
          >
            <CheckCircle className="w-4 h-4 text-emerald-600 shrink-0 mt-0.5" />
            <div className="space-y-1">
              <p className="font-bold text-emerald-800">登記成功！</p>
              <p className="text-emerald-700">
                小孩存摺與餘額已即時更新，並同步送出寫入 Google Sheet『積分明細/點數存摺』。
              </p>
              {taskSavedMessage && (
                <p className="text-blue-700 font-medium flex items-center gap-1 mt-1">
                  <BookmarkPlus className="w-3.5 h-3.5" />
                  <span>{taskSavedMessage}</span>
                </p>
              )}
            </div>
          </motion.div>
        )}
      </form>
    </div>
  );
};

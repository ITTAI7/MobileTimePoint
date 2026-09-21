import React, { useState } from 'react';
import { CleanUser, CleanTask, CleanRecord } from '../types';
import { addNewTaskToGoogleSheet } from '../utils/sheetData';
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
  onSubmitRecord: (record: Omit<CleanRecord, 'id' | 'timestamp' | 'balanceAfter' | 'isLocal'>) => Promise<boolean | void> | void;
  onOpenTasksModal: () => void;
  onLockParentMode: () => void;
  onChangePasswordClick: () => void;
  isWritingToSheet?: boolean;
}

export const ParentView: React.FC<Props> = ({
  users,
  tasks,
  selectedUserId,
  onSelectUser,
  onSubmitRecord,
  onOpenTasksModal,
  onLockParentMode,
  onChangePasswordClick,
  isWritingToSheet = false,
}) => {
  // Filter only children (exclude admin ADM)
  const childrenList = users.filter((u) => !u.isAdmin && u.id.toUpperCase() !== 'ADM' && u.name !== '家長');
  
  // Exclude "兌換項目" as requested: 家長操作區移除積分兌換部份，專注於日常任務、加分與扣分
  const parentTasks = tasks.filter((t) => !t.category.includes('兌換'));

  // Form states
  const [isCustom, setIsCustom] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<string>(parentTasks[0]?.id || '');
  const [customTaskName, setCustomTaskName] = useState('');
  const [customCategory, setCustomCategory] = useState('加分項目');
  const [saveCustomToTaskList, setSaveCustomToTaskList] = useState(true);
  const [pointsChange, setPointsChange] = useState<number>(parentTasks[0]?.points || 2);
  const [note, setNote] = useState('');
  const [submittedSuccess, setSubmittedSuccess] = useState(false);
  const [taskSavedMessage, setTaskSavedMessage] = useState<string | null>(null);

  // Default to first child if selected is admin or not in children list
  const currentChild = childrenList.find((u) => u.id === selectedUserId) || childrenList[0] || {
    id: 'U01',
    name: '孩子',
    grade: '',
    currentPoints: 0,
  };

  const selectedPresetTask = parentTasks.find((t) => t.id === selectedTaskId);

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

    const taskName = isCustom
      ? customTaskName.trim() || '自訂項目'
      : selectedPresetTask?.name || '任務';
    const category = isCustom
      ? customCategory
      : selectedPresetTask?.category || '一般任務';

    // If custom and user selected to save to sheet tasks table
    if (isCustom && saveCustomToTaskList) {
      setTaskSavedMessage('正在同步新增項目至「任務與配分表」...');
      addNewTaskToGoogleSheet({
        category,
        name: taskName,
        points: pointsChange,
        note: note.trim() || undefined,
      }).then((res) => {
        if (res.success) {
          setTaskSavedMessage('自訂項目已成功寫入 Google Sheet「任務與配分表」！');
        }
      }).catch(() => {
        // ignore background error
      });
    } else {
      setTaskSavedMessage(null);
    }

    await onSubmitRecord({
      userId: currentChild.id,
      userName: currentChild.name,
      taskName,
      category,
      points: pointsChange,
      note: note.trim() || undefined,
    });

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
                  if (parentTasks[0]) {
                    setSelectedTaskId(parentTasks[0].id);
                    setPointsChange(parentTasks[0].points);
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
            /* Dropdown selecting from preset tasks (excluding 兌換) */
            <div className="space-y-2">
              <div className="relative">
                <select
                  id="preset-task-select"
                  value={selectedTaskId}
                  onChange={(e) => handleTaskChange(e.target.value)}
                  className="w-full px-4 py-3 rounded-2xl bg-slate-50 border border-slate-200 text-slate-800 font-medium text-sm appearance-none focus:outline-none focus:ring-2 focus:ring-blue-500 focus:bg-white pr-10"
                >
                  {parentTasks.map((task) => (
                    <option key={task.id} value={task.id}>
                      [{task.category}] {task.name} ({task.points > 0 ? `+${task.points}` : task.points} 點)
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

        {/* Step 4: Optional Note */}
        <div className="pt-2 border-t border-slate-100">
          <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wider mb-1">
            步驟 4：備註說明 (選填)
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
            <span className="font-black text-blue-700 text-base">{newBalance} 點</span>
          </div>
        </div>

        {/* Submit Button */}
        <button
          type="submit"
          disabled={(pointsChange === 0 && !isCustom) || isWritingToSheet}
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

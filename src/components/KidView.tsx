import React, { useMemo, useState } from 'react';
import { CleanUser, CleanRecord, CleanTask } from '../types';
import { pointsToTime, getWeekRange, isInWeek, formatWeekLabel } from '../utils/sheetData';
import { 
  Sparkles, 
  Smartphone, 
  Clock, 
  ArrowUpRight, 
  ArrowDownRight, 
  History, 
  Award,
  Filter,
  CheckCircle2,
  Calendar
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

interface Props {
  users: CleanUser[];
  records: CleanRecord[];
  tasks: CleanTask[];
  selectedUserId: string;
  onSelectUser: (userId: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const KidView: React.FC<Props> = ({
  users,
  records,
  tasks,
  selectedUserId,
  onSelectUser,
  onRefresh,
  isRefreshing,
}) => {
  const [filterType, setFilterType] = useState<'all' | 'plus' | 'minus'>('all');

  // Filter only children (exclude ADM/家長)
  const kidsList = users.filter((u) => !u.isAdmin && u.id.toUpperCase() !== 'ADM' && u.name !== '家長');
  const availableUsers = kidsList.length > 0 ? kidsList : users;

  const currentUser = availableUsers.find((u) => u.id === selectedUserId) || availableUsers[0] || {
    id: 'U01',
    name: '孩子',
    grade: '',
    currentPoints: 0,
  };

  const timeInfo = pointsToTime(currentUser.currentPoints);

  // 本週區間（星期日 ~ 星期六）
  const week = useMemo(() => getWeekRange(), []);

  // 「點數存摺」沒有類別欄，紀錄解析出來一律是「一般」。
  // 這裡回「任務與配分表」用任務名稱反查真正的類別，標籤與配色才有意義。
  const categoryByTaskName = useMemo(() => {
    const map: Record<string, string> = {};
    tasks.forEach((t) => {
      map[t.name] = t.category;
    });
    return map;
  }, [tasks]);

  const resolveCategory = (record: CleanRecord): string => {
    const fromTasks = categoryByTaskName[record.taskName];
    if (fromTasks) return fromTasks;
    if (record.category && record.category !== '一般') return record.category;
    // 自訂的兌換項目不在配分表裡，退回用名稱判斷
    if (record.taskName.includes('兌換')) return '兌換項目';
    return record.category || '一般';
  };

  // Filter records for this child，並且只留本週
  const childRecords = records.filter(
    (r) =>
      (r.userId === currentUser.id || r.userName === currentUser.name || !r.userId) &&
      isInWeek(r.timestamp, week)
  );

  const filteredRecords = childRecords.filter((r) => {
    if (filterType === 'plus') return r.points > 0;
    if (filterType === 'minus') return r.points < 0;
    return true;
  });

  // 兌換方案全部來自試算表的「兌換項目」，由便宜到貴排序。
  // 以後在配分表新增或調整兌換方案，畫面自動跟著變，不用改程式。
  const redeemTasks = useMemo(
    () =>
      tasks
        .filter((t) => t.category.includes('兌換') && t.points < 0)
        .map((t) => ({ ...t, cost: Math.abs(t.points) }))
        .sort((a, b) => a.cost - b.cost),
    [tasks]
  );

  // 進度條以「最便宜的兌換方案」為一段；試算表沒有兌換項目時退回 10 點
  const cheapest = redeemTasks[0];
  const nextMilestone = cheapest ? cheapest.cost : 10;
  const currentChunkProgress = (Math.max(0, currentUser.currentPoints) % nextMilestone) / nextMilestone * 100;
  const pointsNeededForNext = currentUser.currentPoints >= 0
    ? nextMilestone - (currentUser.currentPoints % nextMilestone)
    : nextMilestone + Math.abs(currentUser.currentPoints);

  return (
    <div className="space-y-4 pb-20">
      {/* Child Switcher Pills */}
      {availableUsers.length > 1 && (
        <div className="flex items-center gap-2 p-1.5 bg-slate-200/70 rounded-2xl">
          {availableUsers.map((user) => {
            const isSelected = user.id === currentUser.id;
            return (
              <button
                key={user.id}
                onClick={() => onSelectUser(user.id)}
                className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-3 rounded-xl font-medium text-sm transition-all ${
                  isSelected
                    ? 'bg-white text-blue-700 shadow-sm shadow-slate-200'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-white/40'
                }`}
              >
                <div
                  className={`w-6 h-6 rounded-full flex items-center justify-center text-xs font-bold ${
                    isSelected ? 'bg-blue-600 text-white' : 'bg-slate-300 text-slate-700'
                  }`}
                >
                  {user.name.charAt(0)}
                </div>
                <span>{user.name}</span>
                {user.grade && (
                  <span className="text-xs opacity-75 font-normal">({user.grade})</span>
                )}
              </button>
            );
          })}
        </div>
      )}

      {/* Main Points & Screen Time Hero Card */}
      <motion.div
        layout
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-blue-600 via-indigo-600 to-violet-700 text-white p-6 shadow-xl shadow-blue-500/20"
      >
        {/* Background decorative elements */}
        <div className="absolute -top-12 -right-12 w-44 h-44 rounded-full bg-white/10 blur-2xl pointer-events-none" />
        <div className="absolute -bottom-8 -left-8 w-36 h-36 rounded-full bg-indigo-400/20 blur-xl pointer-events-none" />

        <div className="relative z-10">
          <div className="flex items-center justify-between">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-white/15 backdrop-blur-md text-xs font-medium text-blue-100 border border-white/10">
              <Award className="w-3.5 h-3.5 text-amber-300" />
              <span>{currentUser.name} 的手機時間存摺</span>
              {currentUser.grade && <span className="opacity-80">· {currentUser.grade}</span>}
            </div>

            <button
              onClick={onRefresh}
              disabled={isRefreshing}
              className="p-2 rounded-full bg-white/10 hover:bg-white/20 active:scale-95 text-white transition text-xs flex items-center gap-1"
              title="重新載入 Google Sheet 最新資料"
            >
              <span className={isRefreshing ? 'animate-spin inline-block' : ''}>🔄</span>
            </button>
          </div>

          {/* Large Points Value */}
          <div className="mt-5 text-center">
            <p className="text-xs uppercase tracking-wider text-blue-200 font-semibold">目前剩餘積分</p>
            <div className="mt-1 flex items-baseline justify-center gap-2">
              {/* 負分用暖色示警，不要跟正常分數一樣是白的 */}
              <span
                className={`text-6xl font-black tracking-tight drop-shadow-sm ${
                  currentUser.currentPoints < 0 ? 'text-rose-300' : 'text-white'
                }`}
              >
                {currentUser.currentPoints}
              </span>
              <span
                className={`text-lg font-medium ${
                  currentUser.currentPoints < 0 ? 'text-rose-200' : 'text-blue-200'
                }`}
              >
                點
              </span>
            </div>

            {currentUser.currentPoints < 0 && (
              <div className="mt-2 flex justify-center">
                <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-rose-500 text-white text-[11px] font-bold shadow-sm">
                  目前負分了，請好好表現!
                </span>
              </div>
            )}
          </div>

          {/* Screen Time Conversion Box */}
          <div className="mt-6 p-4 rounded-2xl bg-white/15 backdrop-blur-md border border-white/15 text-white">
            <div className="flex items-center gap-3">
              <div className="w-11 h-11 rounded-xl bg-amber-400 text-amber-950 flex items-center justify-center shrink-0 shadow-md">
                <Smartphone className="w-6 h-6" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-1 text-xs text-blue-100 font-medium">
                  <Clock className="w-3.5 h-3.5 text-amber-300" />
                  <span>週末可用手機時間</span>
                </div>
                <div className="text-xl font-bold tracking-tight text-white mt-0.5 truncate">
                  {timeInfo.text}
                </div>
              </div>
            </div>

            {/* Next 30-min Target Progress */}
            <div className="mt-3.5 pt-3 border-t border-white/15">
              <div className="flex items-center justify-between text-xs text-blue-100 mb-1.5">
                <span className="flex items-center gap-1">
                  <Sparkles className="w-3 h-3 text-amber-300" />
                  <span>
                    {cheapest
                      ? `每 ${cheapest.cost} 點可兌換 ${shortRedeemLabel(cheapest.name)}`
                      : '尚未設定兌換方案'}
                  </span>
                </span>
                <span
                  className={`px-2 py-0.5 rounded-full font-bold ${
                    currentUser.currentPoints >= nextMilestone
                      ? 'bg-emerald-400 text-emerald-950'
                      : 'bg-amber-400 text-amber-950'
                  }`}
                >
                  {currentUser.currentPoints >= nextMilestone
                    ? '現在就可以兌換'
                    : `再 ${pointsNeededForNext} 點滿一段`}
                </span>
              </div>
              <div className="w-full h-2 rounded-full bg-white/20 overflow-hidden">
                <div
                  className="h-full rounded-full bg-gradient-to-r from-amber-300 to-emerald-300 transition-all duration-500"
                  style={{ width: `${Math.min(100, Math.max(8, currentChunkProgress))}%` }}
                />
              </div>
            </div>
          </div>
        </div>
      </motion.div>

      {/* 兌換方案：全部讀自試算表的「兌換項目」 */}
      {redeemTasks.length > 0 && (
        <div className={`grid gap-2.5 ${redeemTasks.length <= 2 ? 'grid-cols-2' : 'grid-cols-3'}`}>
          {redeemTasks.map((task) => {
            const affordable = currentUser.currentPoints >= task.cost;
            return (
              <div
                key={task.id}
                title={task.name}
                className={`p-3 rounded-2xl text-center transition ${
                  affordable
                    ? 'bg-emerald-50/60 border-2 border-emerald-400 shadow-sm shadow-emerald-500/10'
                    : 'bg-white border border-slate-200/80 shadow-xs'
                }`}
              >
                <p className="text-[11px] text-slate-500 font-medium truncate">
                  兌換 {shortRedeemLabel(task.name)}
                </p>
                <p
                  className={`text-base font-bold mt-0.5 ${
                    affordable ? 'text-emerald-700' : 'text-slate-800'
                  }`}
                >
                  {task.cost} 點
                </p>
                <div className="mt-1">
                  <span
                    className={`inline-block px-2 py-0.5 rounded-full text-[10px] font-bold ${
                      affordable
                        ? 'bg-emerald-500 text-white shadow-sm'
                        : 'bg-amber-400 text-amber-950'
                    }`}
                  >
                    {/* 負分時差距要從負數起算：−3 到 10 是差 13，不是差 10 */}
                    {affordable ? '可兌換' : `差 ${task.cost - currentUser.currentPoints} 點`}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Recent Records Section (最近紀錄) */}
      <div className="rounded-3xl bg-white border border-slate-200/80 shadow-xs p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-base">本週積分紀錄</h3>
              <p className="text-xs text-slate-500">{formatWeekLabel(week)}</p>
            </div>
          </div>

          {/* Filter Pills */}
          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-xl text-xs">
            <button
              onClick={() => setFilterType('all')}
              className={`px-2 py-1 rounded-lg font-medium transition ${
                filterType === 'all'
                  ? 'bg-white text-slate-800 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              全部
            </button>
            <button
              onClick={() => setFilterType('plus')}
              className={`px-2 py-1 rounded-lg font-medium transition ${
                filterType === 'plus'
                  ? 'bg-white text-emerald-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              加分
            </button>
            <button
              onClick={() => setFilterType('minus')}
              className={`px-2 py-1 rounded-lg font-medium transition ${
                filterType === 'minus'
                  ? 'bg-white text-rose-700 shadow-xs'
                  : 'text-slate-500 hover:text-slate-700'
              }`}
            >
              扣分/兌換
            </button>
          </div>
        </div>

        {/* Records List */}
        <div className="mt-3 divide-y divide-slate-100">
          {filteredRecords.length === 0 ? (
            <div className="py-10 text-center">
              <div className="w-12 h-12 mx-auto rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mb-2">
                <CheckCircle2 className="w-6 h-6" />
              </div>
              <p className="text-sm font-medium text-slate-600">本週尚無積分明細</p>
              <p className="text-xs text-slate-400 mt-0.5">
                家長可以在「家長操作區」記錄任務完成與加扣分！
              </p>
            </div>
          ) : (
            filteredRecords.map((record) => {
              const category = resolveCategory(record);
              // 兌換是開心的事（換到手機時間），不該跟扣分共用負面的紅色下箭頭
              const isRedeem = category.includes('兌換');
              const isPositive = record.points > 0;
              const formattedDate = formatRecordTime(record.timestamp);

              return (
                <div key={record.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isRedeem
                          ? 'bg-purple-50 text-purple-600'
                          : isPositive
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {isRedeem ? (
                        <Smartphone className="w-5 h-5" />
                      ) : isPositive ? (
                        <ArrowUpRight className="w-5 h-5" />
                      ) : (
                        <ArrowDownRight className="w-5 h-5" />
                      )}
                    </div>

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="font-semibold text-slate-800 text-sm truncate">
                          {record.taskName}
                        </span>
                        <span
                          className={`text-[10px] font-medium px-1.5 py-0.5 rounded ${getCategoryBadgeColor(
                            category
                          )}`}
                        >
                          {category}
                        </span>
                        {record.isLocal && (
                          <span className="text-[10px] bg-slate-100 text-slate-500 px-1 rounded">
                            剛建立
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5">
                        <span>{formattedDate}</span>
                        {record.note && (
                          <>
                            <span>·</span>
                            <span className="italic truncate">{record.note}</span>
                          </>
                        )}
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div
                      className={`text-base font-bold font-mono ${
                        isRedeem
                          ? 'text-purple-600'
                          : isPositive
                          ? 'text-emerald-600'
                          : 'text-rose-600'
                      }`}
                    >
                      {isPositive ? `+${record.points}` : record.points} 點
                    </div>
                    {record.balanceAfter !== undefined && (
                      <div className="text-[11px] text-slate-400">
                        餘額 {record.balanceAfter}
                      </div>
                    )}
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
};

function formatRecordTime(raw: string): string {
  try {
    const d = new Date(raw);
    if (isNaN(d.getTime())) return raw;
    const month = d.getMonth() + 1;
    const date = d.getDate();
    const hours = d.getHours().toString().padStart(2, '0');
    const minutes = d.getMinutes().toString().padStart(2, '0');
    return `${month}/${date} ${hours}:${minutes}`;
  } catch {
    return raw;
  }
}

/** 「兌換30分鐘手機時間」→「30分鐘」；認不出格式就原樣顯示 */
function shortRedeemLabel(name: string): string {
  const short = name.replace(/^兌換/, '').replace(/手機時間$/, '').trim();
  return short || name;
}

function getCategoryBadgeColor(category: string): string {
  if (category.includes('每日')) return 'bg-blue-50 text-blue-700';
  if (category.includes('加分')) return 'bg-emerald-50 text-emerald-700';
  if (category.includes('扣分')) return 'bg-rose-50 text-rose-700';
  if (category.includes('兌換')) return 'bg-purple-50 text-purple-700';
  return 'bg-slate-100 text-slate-700';
}

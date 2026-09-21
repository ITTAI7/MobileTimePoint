import React, { useState } from 'react';
import { CleanUser, CleanRecord } from '../types';
import { pointsToTime } from '../utils/sheetData';
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
  selectedUserId: string;
  onSelectUser: (userId: string) => void;
  onRefresh: () => void;
  isRefreshing: boolean;
}

export const KidView: React.FC<Props> = ({
  users,
  records,
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

  // Filter records for this child
  const childRecords = records.filter(
    (r) => r.userId === currentUser.id || r.userName === currentUser.name || !r.userId
  );

  const filteredRecords = childRecords.filter((r) => {
    if (filterType === 'plus') return r.points > 0;
    if (filterType === 'minus') return r.points < 0;
    return true;
  });

  // Calculate progress toward next 30-min phone time chunk (10 points)
  const nextMilestone = 10;
  const currentChunkProgress = (Math.max(0, currentUser.currentPoints) % nextMilestone) / nextMilestone * 100;
  const pointsNeededForNext = currentUser.currentPoints >= 0 
    ? nextMilestone - (currentUser.currentPoints % nextMilestone) 
    : 10 + Math.abs(currentUser.currentPoints);

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
              <span className="text-6xl font-black tracking-tight drop-shadow-sm">
                {currentUser.currentPoints}
              </span>
              <span className="text-lg font-medium text-blue-200">點</span>
            </div>
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
                  <span>每 10 點可兌換 30 分鐘</span>
                </span>
                <span>
                  {pointsNeededForNext === 10
                    ? '滿 10 點即可兌換'
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

      {/* Screen Time Exchange Rules & Milestones Quick Card */}
      <div className="grid grid-cols-3 gap-2.5">
        <div className="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] text-slate-500 font-medium">兌換 30 分鐘</p>
          <p className="text-base font-bold text-slate-800 mt-0.5">10 點</p>
          <div className="mt-1">
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                currentUser.currentPoints >= 10
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {currentUser.currentPoints >= 10 ? '可兌換' : '差 ' + Math.max(0, 10 - currentUser.currentPoints) + ' 點'}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] text-slate-500 font-medium">兌換 60 分鐘</p>
          <p className="text-base font-bold text-slate-800 mt-0.5">20 點</p>
          <div className="mt-1">
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                currentUser.currentPoints >= 20
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {currentUser.currentPoints >= 20 ? '可兌換' : '差 ' + Math.max(0, 20 - currentUser.currentPoints) + ' 點'}
            </span>
          </div>
        </div>

        <div className="p-3 rounded-2xl bg-white border border-slate-200/80 shadow-xs text-center">
          <p className="text-[11px] text-slate-500 font-medium">兌換 90 分鐘</p>
          <p className="text-base font-bold text-slate-800 mt-0.5">30 點</p>
          <div className="mt-1">
            <span
              className={`inline-block px-1.5 py-0.5 rounded text-[10px] font-medium ${
                currentUser.currentPoints >= 30
                  ? 'bg-emerald-50 text-emerald-700'
                  : 'bg-slate-100 text-slate-500'
              }`}
            >
              {currentUser.currentPoints >= 30 ? '可兌換' : '差 ' + Math.max(0, 30 - currentUser.currentPoints) + ' 點'}
            </span>
          </div>
        </div>
      </div>

      {/* Recent Records Section (最近紀錄) */}
      <div className="rounded-3xl bg-white border border-slate-200/80 shadow-xs p-5">
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <History className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-semibold text-slate-800 text-base">最近積分紀錄</h3>
              <p className="text-xs text-slate-500">點數存摺明細</p>
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
              <p className="text-sm font-medium text-slate-600">尚無相關積分明細</p>
              <p className="text-xs text-slate-400 mt-0.5">
                家長可以在「家長操作區」記錄任務完成與加扣分！
              </p>
            </div>
          ) : (
            filteredRecords.map((record) => {
              const isPositive = record.points > 0;
              const formattedDate = formatRecordTime(record.timestamp);

              return (
                <div key={record.id} className="py-3 flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isPositive
                          ? 'bg-emerald-50 text-emerald-600'
                          : 'bg-rose-50 text-rose-600'
                      }`}
                    >
                      {isPositive ? (
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
                            record.category
                          )}`}
                        >
                          {record.category}
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
                        isPositive ? 'text-emerald-600' : 'text-rose-600'
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

function getCategoryBadgeColor(category: string): string {
  if (category.includes('每日')) return 'bg-blue-50 text-blue-700';
  if (category.includes('加分')) return 'bg-emerald-50 text-emerald-700';
  if (category.includes('扣分')) return 'bg-rose-50 text-rose-700';
  if (category.includes('兌換')) return 'bg-purple-50 text-purple-700';
  return 'bg-slate-100 text-slate-700';
}

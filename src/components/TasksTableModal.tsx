import React from 'react';
import { CleanTask } from '../types';
import { X, Award, CheckCircle, Smartphone } from 'lucide-react';

interface Props {
  tasks: CleanTask[];
  onClose: () => void;
  onSelectTask?: (taskId: string) => void;
}

export const TasksTableModal: React.FC<Props> = ({ tasks, onClose, onSelectTask }) => {
  const categories = Array.from(new Set(tasks.map((t) => t.category)));

  // 匯率直接引用配分表最便宜的兌換項目，不寫死 ——
  // 家長改了試算表，這行字才不會跟實際規則對不上。
  const cheapestRedeem = tasks
    .filter((t) => t.category.includes('兌換') && t.points < 0)
    .sort((a, b) => Math.abs(a.points) - Math.abs(b.points))[0];
  const redeemHint = cheapestRedeem
    ? `${Math.abs(cheapestRedeem.points)} 點 = ${cheapestRedeem.name}`
    : '配分表裡沒有兌換項目';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Award className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">任務與配分表 (Google Sheet)</h3>
              <p className="text-xs text-slate-500">共 {tasks.length} 項標準配分規則</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-5 space-y-4">
          {categories.map((category) => {
            const catTasks = tasks.filter((t) => t.category === category);
            return (
              <div key={category} className="space-y-2">
                <div className="flex items-center gap-2">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-500">
                    {category}
                  </span>
                  <span className="text-[11px] text-slate-400">({catTasks.length})</span>
                </div>

                <div className="divide-y divide-slate-100 rounded-2xl border border-slate-200/80 overflow-hidden">
                  {catTasks.map((task) => {
                    const isPositive = task.points > 0;
                    return (
                      <div
                        key={task.id}
                        onClick={() => {
                          if (onSelectTask) {
                            onSelectTask(task.id);
                            onClose();
                          }
                        }}
                        className={`p-3.5 flex items-center justify-between bg-white hover:bg-slate-50 transition ${
                          onSelectTask ? 'cursor-pointer' : ''
                        }`}
                      >
                        <div className="flex items-center gap-3">
                          <span className="text-xs font-mono font-medium text-slate-400 bg-slate-100 px-1.5 py-0.5 rounded">
                            {task.id}
                          </span>
                          <span className="font-medium text-slate-800 text-sm">{task.name}</span>
                        </div>

                        <div className="text-right">
                          <span
                            className={`text-sm font-bold font-mono px-2 py-0.5 rounded-lg ${
                              isPositive
                                ? 'bg-emerald-50 text-emerald-700'
                                : 'bg-rose-50 text-rose-700'
                            }`}
                          >
                            {isPositive ? `+${task.points}` : task.points} 點
                          </span>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            );
          })}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-between">
          <span className="text-xs text-slate-500 flex items-center gap-1">
            <Smartphone className="w-3.5 h-3.5 text-blue-600" />
            {redeemHint}
          </span>
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-medium hover:bg-slate-900 transition"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};

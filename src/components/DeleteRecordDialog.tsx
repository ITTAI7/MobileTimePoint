import React from 'react';
import { Trash2, X } from 'lucide-react';
import { CleanRecord } from '../types';
import { parseSheetTime, taipeiParts } from '../utils/sheetData';

interface Props {
  record: CleanRecord;
  userName: string;
  /** 這個孩子現在畫面上的總分 */
  currentPoints: number;
  /** 兌換用紫色，跟小孩區的明細一致 */
  isRedeem: boolean;
  onConfirm: () => void;
  onClose: () => void;
}

/**
 * 家長在小孩區點紀錄後的刪除確認。
 * 把這筆的內容和「刪除後剩幾點」寫清楚 —— 點錯人、點錯筆一眼就看得出來。
 */
export const DeleteRecordDialog: React.FC<Props> = ({
  record,
  userName,
  currentPoints,
  isRedeem,
  onConfirm,
  onClose,
}) => {
  // 沒寫進試算表的那筆本來就沒計分，刪掉分數不變
  const counted = record.syncState !== 'failed';
  const after = counted ? currentPoints - record.points : currentPoints;
  const pointsColor = isRedeem
    ? 'text-purple-600'
    : record.points > 0
    ? 'text-emerald-600'
    : 'text-rose-600';

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="delete-record-title"
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between">
          <h3 id="delete-record-title" className="font-bold text-slate-800 text-base">
            刪除這筆？
          </h3>
          <button
            type="button"
            onClick={onClose}
            aria-label="關閉"
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="mt-3 p-3 rounded-2xl bg-slate-50 border border-slate-200">
          <div className="flex items-center justify-between gap-3">
            <span className="font-semibold text-slate-800 text-sm min-w-0 break-words">
              {userName}・{record.taskName}
            </span>
            <span className={`font-mono font-bold shrink-0 ${pointsColor}`}>
              {record.points > 0 ? `+${record.points}` : record.points} 點
            </span>
          </div>
          <div className="text-xs text-slate-500 mt-1 tabular-nums">{formatWhen(record.timestamp)}</div>
          {record.note && (
            <div className="text-xs text-amber-800 mt-1 break-words">{record.note}</div>
          )}
        </div>

        <p className="mt-3 text-sm text-slate-700">
          {counted ? (
            <>
              刪除後{userName}剩{' '}
              <strong className={`font-mono ${after < 0 ? 'text-rose-600' : 'text-slate-900'}`}>
                {after}
              </strong>{' '}
              點
            </>
          ) : (
            '這筆本來就沒有計分'
          )}
        </p>

        <div className="mt-5 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold transition"
          >
            取消
          </button>
          <button
            type="button"
            onClick={onConfirm}
            className="flex-1 py-2.5 rounded-xl bg-rose-600 hover:bg-rose-700 text-white text-sm font-bold shadow-md shadow-rose-600/20 active:scale-95 transition flex items-center justify-center gap-1.5"
          >
            <Trash2 className="w-4 h-4" />
            <span>刪除</span>
          </button>
        </div>
      </div>
    </div>
  );
};

/** 例如 10/7（三）19:30，台北時間 */
function formatWhen(raw: string): string {
  const d = parseSheetTime(raw);
  if (isNaN(d.getTime())) return raw;
  const p = taipeiParts(d);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${p.month}/${p.day}（${'日一二三四五六'[p.weekday]}）${pad(p.hours)}:${pad(p.minutes)}`;
}

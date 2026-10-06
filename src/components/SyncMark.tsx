import React from 'react';
import { SyncState } from '../types';

interface Props {
  state: SyncState;
  /** 放在深色底（小孩區的大分數卡）上時用半透明白 */
  onDark?: boolean;
}

/**
 * 紀錄與分數旁的小「!」。
 * 灰色：正在跟試算表核對，完成後自動消失；紅色：沒寫進試算表，不計分。
 * 兩種刻意分開 —— 都用紅色的話，平常每登記一筆都像出錯，真的出錯時反而分不出來。
 */
export const SyncMark: React.FC<Props> = ({ state, onDark = false }) => {
  const label = state === 'pending' ? '正在跟試算表核對' : '沒有寫進試算表，不計分';
  const color =
    state === 'failed'
      ? 'bg-rose-500 text-white'
      : onDark
      ? 'bg-white/25 text-white'
      : 'bg-slate-200 text-slate-500';

  return (
    <span
      role="img"
      aria-label={label}
      title={label}
      className={`inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] font-black leading-none shrink-0 ${color}`}
    >
      !
    </span>
  );
};

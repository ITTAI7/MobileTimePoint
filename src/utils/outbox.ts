import { CleanRecord, CleanUser, OutboxItem } from '../types';
import { parseSheetTime } from './sheetData';

/* ─────────────── 待送清單 ───────────────
 * 家長按下登記後，畫面立刻更新，紀錄先放進這裡，背景再一筆一筆寫進試算表。
 * 試算表確認後就從清單移除，畫面改用伺服器回傳的餘額。
 *
 * 清單存在 localStorage：送出後馬上關掉 App 也不會遺失，下次打開會接著送。
 * 「清除本機快取」刻意不清這裡 —— 清掉就是把還沒寫進試算表的紀錄丟掉。
 */

const STORAGE_KEY_OUTBOX = 'weekend_points_outbox_v1';

export function getOutbox(): OutboxItem[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY_OUTBOX);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];
    return parsed.filter(
      (i): i is OutboxItem =>
        !!i &&
        typeof i === 'object' &&
        !!i.record &&
        typeof i.record.id === 'string' &&
        (i.status === 'pending' || i.status === 'failed')
    );
  } catch {
    return [];
  }
}

export function saveOutbox(items: OutboxItem[]) {
  try {
    localStorage.setItem(STORAGE_KEY_OUTBOX, JSON.stringify(items));
  } catch {
    // ignore
  }
}

/** 依時間由新到舊排序（台北時間解讀，與畫面顯示一致） */
export function sortNewestFirst(records: CleanRecord[]): CleanRecord[] {
  return [...records].sort(
    (a, b) => parseSheetTime(b.timestamp).getTime() - parseSheetTime(a.timestamp).getTime()
  );
}

/**
 * 把待送清單疊到試算表的資料上，得到畫面要顯示的分數與紀錄。
 *
 * - pending：分數照算，紀錄與總分標上「核對中」
 * - failed：紀錄照樣列出（標紅、劃掉），但**不計分** —— 試算表裡沒有這筆
 * - 試算表已經有同一個 LogID 的：不再疊加，否則會算兩次
 *   （發生在讀取剛好比寫入的回應先回來時）
 *
 * 每筆 pending 的「餘額」依送出順序從試算表的總分往上累加；
 * 前面有一筆失敗時，後面的會自動少算那筆，不會留著錯的數字。
 */
export function overlayOutbox(
  users: CleanUser[],
  records: CleanRecord[],
  outbox: OutboxItem[]
): { users: CleanUser[]; records: CleanRecord[] } {
  if (outbox.length === 0) return { users, records };

  const onSheet = new Set(records.map((r) => r.id));
  const running: Record<string, number> = {};
  users.forEach((u) => {
    running[u.id] = u.currentPoints;
  });
  const unverified = new Set<string>();

  const extra: CleanRecord[] = [];
  outbox.forEach((item) => {
    const r = item.record;
    if (onSheet.has(r.id)) return;

    if (item.status === 'pending') {
      running[r.userId] = (running[r.userId] ?? 0) + r.points;
      unverified.add(r.userId);
      extra.push({ ...r, balanceAfter: running[r.userId], syncState: 'pending' });
    } else {
      extra.push({ ...r, syncState: 'failed', syncMessage: item.message });
    }
  });

  if (extra.length === 0) return { users, records };

  return {
    users: users.map((u) =>
      unverified.has(u.id) ? { ...u, currentPoints: running[u.id], unverified: true } : u
    ),
    records: sortNewestFirst([...extra, ...records]),
  };
}

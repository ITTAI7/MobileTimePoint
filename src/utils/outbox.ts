import { CleanRecord, CleanUser, OutboxItem, OutboxKind } from '../types';
import { parseSheetTime } from './sheetData';

/* ─────────────── 待送清單 ───────────────
 * 家長按下登記或刪除後，畫面立刻更新，動作先放進這裡，背景再一項一項寫進試算表。
 * 試算表確認後就從清單移除，畫面改用伺服器回傳的資料。
 *
 * 清單存在 localStorage：送出後馬上關掉 App 也不會遺失，下次打開會接著送。
 * 「清除本機快取」刻意不清這裡 —— 清掉就是把還沒寫進試算表的動作丟掉。
 */

const STORAGE_KEY_OUTBOX = 'weekend_points_outbox_v1';

export function kindOf(item: OutboxItem): OutboxKind {
  return item.kind ?? 'add';
}

/** 是不是「這個動作、這筆紀錄」那一項（同一筆可能同時有登記和刪除） */
export function isOutboxItem(item: OutboxItem, kind: OutboxKind, id: string): boolean {
  return kindOf(item) === kind && item.record.id === id;
}

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
        (i.kind === undefined || i.kind === 'add' || i.kind === 'delete') &&
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
 * 登記：
 * - pending：分數照算，紀錄與總分標上「核對中」
 * - failed：紀錄照樣列出（標紅、劃掉），但**不計分** —— 試算表裡沒有這筆
 * - 試算表已經有同一個 LogID 的：不再疊加，否則會算兩次
 *   （發生在讀取剛好比寫入的回應先回來時）
 *
 * 刪除：
 * - pending：紀錄不顯示，試算表上還有的話先從總分扣掉，總分標上「核對中」。
 *   已經不在試算表上的（刪除其實成功、只是回應掉了）不再扣 —— 讀回來的總分已經扣過了
 * - failed：沒刪成功，紀錄照常顯示、照常計分
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

  const deleting = new Set(
    outbox
      .filter((i) => kindOf(i) === 'delete' && i.status === 'pending')
      .map((i) => i.record.id)
  );
  records.forEach((r) => {
    if (!deleting.has(r.id)) return;
    running[r.userId] = (running[r.userId] ?? 0) - r.points;
    unverified.add(r.userId);
  });

  const extra: CleanRecord[] = [];
  outbox.forEach((item) => {
    if (kindOf(item) !== 'add') return;
    const r = item.record;
    if (onSheet.has(r.id)) return;
    // 登記完馬上刪、登記還沒寫進去：兩者抵銷，不顯示也不計分
    if (deleting.has(r.id)) {
      unverified.add(r.userId);
      return;
    }

    if (item.status === 'pending') {
      running[r.userId] = (running[r.userId] ?? 0) + r.points;
      unverified.add(r.userId);
      extra.push({ ...r, balanceAfter: running[r.userId], syncState: 'pending' });
    } else {
      extra.push({ ...r, syncState: 'failed', syncMessage: item.message });
    }
  });

  if (extra.length === 0 && unverified.size === 0) return { users, records };

  return {
    users: users.map((u) =>
      unverified.has(u.id) ? { ...u, currentPoints: running[u.id], unverified: true } : u
    ),
    records: sortNewestFirst([...extra, ...withoutDeleting(records, deleting)]),
  };
}

/**
 * 拿掉正在刪的紀錄。同一個孩子在它之後的每一列，「餘額」也先減掉它 ——
 * 試算表確認刪除後會整份重讀，這裡只是讓等待的那幾秒數字對得起來。
 *
 * @param records 由新到舊排好的（App 裡的 records 一律是這個順序）
 */
function withoutDeleting(records: CleanRecord[], deleting: Set<string>): CleanRecord[] {
  if (deleting.size === 0) return records;
  const removed: Record<string, number> = {};
  const out: CleanRecord[] = [];
  for (let i = records.length - 1; i >= 0; i--) {
    const r = records[i];
    if (deleting.has(r.id)) {
      removed[r.userId] = (removed[r.userId] ?? 0) + r.points;
      continue;
    }
    const d = removed[r.userId];
    out.push(d ? { ...r, balanceAfter: r.balanceAfter - d } : r);
  }
  return out.reverse();
}

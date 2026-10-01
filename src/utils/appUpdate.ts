/* ─────────────── 新版上線後自動換新 ───────────────
 * PWA 打開時，畫面是 Service Worker 從手機裡拿出來的舊版；同時瀏覽器去檢查有沒有新版，
 * 有的話在背景下載、接手（sw.js 設了 skipWaiting + clientsClaim）。
 * 但已經畫出來的畫面仍是舊程式，原本要「完全關掉再開」才會換成新版 ——
 * 家人的手機不在身邊時，等於一直卡在舊版。
 *
 * 這裡在新版接手的那一刻重新載入，打開一次就換成新版。
 * 正在寫入試算表時不重載（中斷的話不知道寫進去沒有），改成等 App 退到背景時再換。
 */

// 可能同時有兩個寫入（登記一筆＋把自訂項目存進配分表），所以用計數
let writesInProgress = 0;
let reloadPending = false;

export function watchForAppUpdate() {
  // 開發時不需要：HMR 已經會即時更新畫面
  if (import.meta.env.DEV || !('serviceWorker' in navigator)) return;

  // 第一次安裝時本來就沒有舊版在控制，畫面已經是從網路拿的最新版，不用重載
  const hadController = navigator.serviceWorker.controller !== null;

  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!hadController) return;
    if (writesInProgress > 0) {
      // 寫入中：等 App 退到背景再換。寫完立刻重載的話，畫面上的結果
      // （尤其是「無法確認是否已登記」）會被洗掉，家長可能因此重登
      reloadPending = true;
      return;
    }
    window.location.reload();
  });

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden' && reloadPending && writesInProgress === 0) {
      window.location.reload();
    }
  });
}

/**
 * 標記「重送會重複」的寫入（登記積分、新增配分項目）的開始與結束，兩者必須成對呼叫。
 * 這段期間新版接手的話不會重載，以免中斷寫入、弄不清楚到底寫進去沒有。
 */
export function markWriteStart() {
  writesInProgress += 1;
}

export function markWriteEnd() {
  writesInProgress = Math.max(0, writesInProgress - 1);
}

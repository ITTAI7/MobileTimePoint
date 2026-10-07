// 核對 Apps Script「部署中」的版本，是否跟電腦上的 gas/Code.gs 一字不差。
//
// 用法：node scripts/verify-gas.mjs [exec 網址]
//   網址省略時用 src/utils/sheetData.ts 的 DEFAULT_GAS_API_URL。
//
// 只讀不寫：呼叫的是 doGet ?action=version，不碰試算表。
// 結束碼：0 一致／1 不一致／2 無法核對
import fs from 'node:fs';
import vm from 'node:vm';
import path from 'node:path';
import crypto from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const codePath = path.join(root, 'gas', 'Code.gs');

function fail(message) {
  console.error(message);
  process.exit(2);
}

if (!fs.existsSync(codePath)) {
  fail('找不到 gas/Code.gs（這個資料夾不在 git 裡，只存在維護者的電腦上）');
}

const url =
  process.argv[2] ||
  (fs
    .readFileSync(path.join(root, 'src/utils/sheetData.ts'), 'utf8')
    .match(/DEFAULT_GAS_API_URL\s*=\s*'([^']+)'/) || [])[1];
if (!url) fail('找不到 exec 網址，請當成參數傳進來');

/* ── 本機：在沙盒裡載入 Code.gs，呼叫同一個 codeFingerprint_()，演算法保證跟線上一致 ── */
const sandbox = {
  Utilities: {
    DigestAlgorithm: { SHA_256: 'SHA_256' },
    Charset: { UTF_8: 'UTF_8' },
    // 與 Apps Script 相同：回傳 -128~127 的有號位元組
    computeDigest: (_alg, text) =>
      Array.from(new Int8Array(crypto.createHash('sha256').update(String(text), 'utf8').digest())),
  },
};
vm.createContext(sandbox);
vm.runInContext(fs.readFileSync(codePath, 'utf8'), sandbox, { filename: 'Code.gs' });
if (typeof sandbox.codeFingerprint_ !== 'function') {
  fail('gas/Code.gs 裡沒有 codeFingerprint_()，請先加上「部署核對」那一段');
}
const local = JSON.parse(JSON.stringify(sandbox.codeFingerprint_()));

/* ── 線上：GET ?action=version ── */
function fetchRemote() {
  const target = `${url}${url.includes('?') ? '&' : '?'}action=version`;
  for (let attempt = 1; attempt <= 4; attempt++) {
    try {
      // -k：公司內網的 TLS 攔截憑證會讓驗證失敗。這裡只讀雜湊，不送出任何資料。
      const out = execFileSync('curl', ['-sk', '-L', '--max-time', '60', target], {
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'ignore'],
      });
      return JSON.parse(out);
    } catch {
      // 轉址那一跳偶爾回 Google 的 404 網頁，重試即可
    }
  }
  return null;
}

const remote = fetchRemote();
if (!remote) fail('連不上 Apps Script（已重試 4 次），請檢查網路後再試');
if (!remote.parts) {
  console.error('❌ 線上的版本還沒有核對功能 —— 部署中的不是電腦上這份 gas/Code.gs。');
  console.error('   常見原因：只按了存檔、沒有到「管理部署作業 → 編輯 → 新版本 → 部署」。');
  process.exit(1);
}

/* ── 逐項比對 ── */
const label = (k) => (k.startsWith('$') ? `設定值 ${k.slice(1)}` : `${k}()`);
const changed = [];
const missing = [];
for (const [k, h] of Object.entries(local.parts)) {
  if (!(k in remote.parts)) missing.push(label(k));
  else if (remote.parts[k] !== h) changed.push(label(k));
}
const extra = Object.keys(remote.parts)
  .filter((k) => !(k in local.parts))
  .map(label);

console.log(`本機 gas/Code.gs：${local.count} 項　線上部署版本：${remote.count} 項`);

if (changed.length === 0 && missing.length === 0) {
  console.log(`✅ 完全一致（指紋 ${local.fingerprint}）`);
  if (extra.length) {
    console.log(`⚠️  線上多出 ${extra.length} 項本機沒有的：${extra.join('、')}`);
    console.log('   可能是 Apps Script 專案裡還有其他 .gs 檔，或執行環境自帶的函式。');
  }
  process.exit(0);
}

console.log('❌ 不一致：');
if (changed.length) console.log(`   內容不同：${changed.join('、')}`);
if (missing.length) console.log(`   線上缺少：${missing.join('、')}`);
if (extra.length) console.log(`   線上多出：${extra.join('、')}`);
console.log('   請把 gas/Code.gs 整份重新貼上，存檔後「部署 → 管理部署作業 → 編輯 → 新版本 → 部署」。');
process.exit(1);

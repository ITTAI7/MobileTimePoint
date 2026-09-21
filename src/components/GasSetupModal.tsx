import React, { useState } from 'react';
import { FileCode, X, Copy, Check, ExternalLink, AlertTriangle, ShieldCheck } from 'lucide-react';
import { RECOMMENDED_GAS_CODE } from '../utils/sheetData';

interface Props {
  onClose: () => void;
}

export const GasSetupModal: React.FC<Props> = ({ onClose }) => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText(RECOMMENDED_GAS_CODE);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl overflow-hidden transition-all max-h-[90vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between pb-3 border-b border-slate-100 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-emerald-100 text-emerald-700 flex items-center justify-center">
              <FileCode className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">Google Sheet 寫入指令碼 (doPost)</h3>
              <p className="text-xs text-slate-500">將加減分紀錄直接寫回試算表</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content with Scroll */}
        <div className="overflow-y-auto space-y-4 py-3 text-xs text-slate-600 leading-relaxed pr-1">
          {/* Explanation Alert */}
          <div className="p-3.5 rounded-2xl bg-amber-50 border border-amber-200 text-amber-900 flex items-start gap-2.5">
            <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">為什麼需要這段程式碼？</p>
              <p className="mt-0.5 text-slate-700">
                您原本的 Google Apps Script 只有 <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-amber-900">doGet</code>（只能讀取）。要讓前端網頁能將加減分<strong>寫回『積分明細/點數存摺』</strong>並<strong>即時更新『目前積分』</strong>，必須在 Apps Script 加入 <code className="bg-amber-100/80 px-1 py-0.5 rounded font-mono text-amber-900">doPost</code> 函式。
              </p>
            </div>
          </div>

          {/* Setup Steps */}
          <div className="space-y-2">
            <h4 className="font-bold text-slate-800 flex items-center gap-1.5 text-xs">
              <ShieldCheck className="w-4 h-4 text-blue-600" />
              <span>只需 3 步驟，1 分鐘即可設定完成：</span>
            </h4>
            <ol className="list-decimal list-inside space-y-1.5 pl-1 text-slate-700">
              <li>
                打開您的 Google Sheet 試算表，點上方選單<strong>「擴充功能」➜「Apps Script」</strong>。
              </li>
              <li>
                點擊下方按鈕<strong>「複製完整 Apps Script 程式碼」</strong>，直接取代或貼入編輯器中。
              </li>
              <li>
                點擊右上角<strong>「部署」➜「管理部署」</strong>➜ 點鉛筆圖示編輯 ➜ 版本選<strong>「新版本」</strong>➜ 點<strong>「部署」</strong>完成！
              </li>
            </ol>
          </div>

          {/* Code Block with Copy Button */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <span className="font-semibold text-slate-700">Apps Script 完整程式碼：</span>
              <button
                type="button"
                onClick={handleCopy}
                className="px-3 py-1.5 rounded-xl bg-blue-600 text-white font-medium hover:bg-blue-700 active:scale-95 transition flex items-center gap-1 shadow-xs"
              >
                {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                <span>{copied ? '已複製到剪貼簿！' : '複製完整程式碼'}</span>
              </button>
            </div>

            <div className="relative rounded-2xl bg-slate-900 p-3.5 text-[11px] font-mono text-slate-200 overflow-x-auto max-h-56 scrollbar-thin">
              <pre>{RECOMMENDED_GAS_CODE}</pre>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="pt-3 border-t border-slate-100 flex justify-end gap-2 shrink-0">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
          >
            關閉
          </button>
        </div>
      </div>
    </div>
  );
};

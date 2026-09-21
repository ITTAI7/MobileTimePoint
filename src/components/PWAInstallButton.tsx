import React, { useState } from 'react';
import { Download, Share2, PlusSquare, Smartphone, X } from 'lucide-react';
import { usePWAInstall } from '../hooks/usePWAInstall';

interface Props {
  compact?: boolean;
}

export const PWAInstallButton: React.FC<Props> = ({ compact = false }) => {
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showGuide, setShowGuide] = useState(false);

  // If already installed and in standalone mode, show discreet badge or hide
  if (isInstalled) {
    return null;
  }

  const handleAction = async () => {
    if (isInstallable) {
      await install();
    } else {
      setShowGuide(true);
    }
  };

  return (
    <>
      <button
        id="pwa-install-btn"
        onClick={handleAction}
        className={`inline-flex items-center gap-1.5 font-medium transition-all active:scale-95 ${
          compact
            ? 'px-2.5 py-1.5 text-xs rounded-lg bg-blue-600/10 text-blue-700 hover:bg-blue-600/20'
            : 'px-3.5 py-2 text-sm rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 text-white shadow-sm shadow-blue-500/25 hover:opacity-95'
        }`}
        title="安裝為手機應用程式 (PWA)"
      >
        <Download className="w-4 h-4 shrink-0" />
        <span className="whitespace-nowrap">
          {isInstallable ? '安裝 App' : '加入手機主畫面'}
        </span>
      </button>

      {/* Guidance Modal for iOS or manual install */}
      {showGuide && (
        <div
          id="pwa-guide-modal"
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
          onClick={() => setShowGuide(false)}
        >
          <div
            className="w-full max-w-sm rounded-2xl bg-white p-5 shadow-2xl transition-all"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-xl bg-blue-100 flex items-center justify-center text-blue-600">
                  <Smartphone className="w-4 h-4" />
                </div>
                <div>
                  <h3 className="font-semibold text-slate-800 text-base">安裝到手機主畫面</h3>
                  <p className="text-xs text-slate-500">如同原生 App，隨點即開超方便</p>
                </div>
              </div>
              <button
                onClick={() => setShowGuide(false)}
                className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-100"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="mt-4 space-y-3.5 text-sm text-slate-600">
              {isIOS ? (
                <>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">點擊 Safari 底部的「分享」按鈕</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        圖示為方框向上箭頭 <Share2 className="w-3.5 h-3.5 inline text-blue-600" />
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">滑動選單並點選「加入主畫面」</p>
                      <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-1">
                        圖示為 <PlusSquare className="w-3.5 h-3.5 inline text-blue-600" />「加入主畫面」
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                      3
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">點擊右上角「新增」</p>
                      <p className="text-xs text-slate-500 mt-0.5">桌面上就會出現專屬圖示！</p>
                    </div>
                  </div>
                </>
              ) : (
                <>
                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                      1
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">點擊瀏覽器右上角選單 (⋮)</p>
                      <p className="text-xs text-slate-500 mt-0.5">Chrome 或 Edge 瀏覽器</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-3 p-3 rounded-xl bg-slate-50 border border-slate-100">
                    <div className="w-7 h-7 rounded-lg bg-blue-500 text-white flex items-center justify-center shrink-0 font-bold text-xs">
                      2
                    </div>
                    <div>
                      <p className="font-medium text-slate-800">點選「加到主畫面」或「安裝應用程式」</p>
                      <p className="text-xs text-slate-500 mt-0.5">即可一鍵安裝為捷徑</p>
                    </div>
                  </div>
                </>
              )}
            </div>

            <button
              onClick={() => setShowGuide(false)}
              className="mt-5 w-full py-2.5 rounded-xl bg-slate-900 text-white font-medium text-sm hover:bg-slate-800 transition active:scale-98"
            >
              我知道了
            </button>
          </div>
        </div>
      )}
    </>
  );
};

import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, ShieldAlert, Check, Fingerprint } from 'lucide-react';

interface Props {
  /** 驗證交給 App —— 這個元件不需要知道密碼本身 */
  onVerify: (password: string) => Promise<boolean>;
  /** 既沒有本機雜湊、資料也還沒同步，此時無從驗證 */
  isSyncing?: boolean;
  /** 這台裝置已登記指紋時才會傳入；回 true 代表驗證通過 */
  onBiometric?: () => Promise<{ ok: boolean; message?: string }>;
  onSuccess: () => void;
  onClose: () => void;
}

export const ParentPasswordModal: React.FC<Props> = ({
  onVerify,
  isSyncing = false,
  onBiometric,
  onSuccess,
  onClose,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);
  const [checking, setChecking] = useState(false);
  const [bioError, setBioError] = useState<string | null>(null);

  const handleBiometric = async () => {
    if (!onBiometric || checking) return;
    setBioError(null);
    setChecking(true);
    const res = await onBiometric();
    setChecking(false);
    if (res.ok) onSuccess();
    else setBioError(res.message || '指紋驗證失敗');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (isSyncing || checking) return;

    setChecking(true);
    const ok = await onVerify(password);
    setChecking(false);

    if (ok) {
      setError(false);
      onSuccess();
    } else {
      setError(true);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-sm rounded-3xl bg-white p-6 shadow-2xl overflow-hidden transition-all"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-3 border-b border-slate-100">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-2xl bg-amber-100 text-amber-700 flex items-center justify-center">
              <Lock className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">家長權限驗證</h3>
              <p className="text-xs text-slate-500">切換至家長專區</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* 已登記的裝置優先走指紋，密碼退居備援 */}
        {onBiometric && (
          <div className="mt-4 space-y-2">
            <button
              type="button"
              onClick={handleBiometric}
              disabled={checking}
              className="w-full py-3.5 rounded-2xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-sm font-bold shadow-md shadow-orange-500/20 active:scale-98 transition flex items-center justify-center gap-2 disabled:opacity-50 disabled:active:scale-100"
            >
              <Fingerprint className="w-5 h-5" />
              <span>{checking ? '驗證中…' : '用指紋解鎖'}</span>
            </button>

            {bioError && (
              <p className="text-xs text-rose-600 flex items-center gap-1 animate-in fade-in">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                {bioError}
              </p>
            )}

            <div className="flex items-center gap-2 pt-1">
              <div className="flex-1 h-px bg-slate-200" />
              <span className="text-[11px] text-slate-400">或輸入密碼</span>
              <div className="flex-1 h-px bg-slate-200" />
            </div>
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {!onBiometric && (
            <p className="text-xs text-slate-600 leading-relaxed">
              請輸入 Google Sheet「使用者資料」中 ADM 家長密碼，防止小孩自行增加積分或調整項目。
            </p>
          )}

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">家長密碼</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus={!onBiometric}
                placeholder="請輸入密碼"
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (error) setError(false);
                }}
                className={`w-full px-4 py-3 rounded-2xl bg-slate-50 border text-slate-900 text-center text-lg font-mono tracking-widest focus:outline-none focus:ring-2 focus:bg-white transition ${
                  error
                    ? 'border-rose-300 ring-2 ring-rose-500/20 bg-rose-50/30'
                    : 'border-slate-200 focus:ring-amber-500'
                }`}
              />
              <button
                type="button"
                onClick={() => setShowPassword(!showPassword)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 p-1"
              >
                {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
              </button>
            </div>

            {isSyncing && (
              <p className="text-xs text-slate-500 flex items-center gap-1.5 mt-1">
                <span className="w-3 h-3 border-2 border-slate-400 border-t-transparent rounded-full animate-spin shrink-0" />
                正在同步最新資料，稍候即可解鎖
              </p>
            )}

            {error && !isSyncing && (
              <p className="text-xs text-rose-600 flex items-center gap-1 mt-1 animate-in fade-in">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                密碼錯誤，請重新輸入
              </p>
            )}
          </div>

          <div className="pt-2 flex gap-2">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 py-2.5 rounded-xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition"
            >
              取消
            </button>
            <button
              type="submit"
              disabled={isSyncing || checking}
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold shadow-md shadow-orange-500/20 active:scale-95 transition flex items-center justify-center gap-1.5 disabled:opacity-50 disabled:active:scale-100"
            >
              <Check className="w-4 h-4" />
              <span>{isSyncing ? '請稍候…' : '驗證解鎖'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

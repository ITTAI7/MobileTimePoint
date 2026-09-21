import React, { useState } from 'react';
import { Lock, Eye, EyeOff, X, ShieldAlert, Check } from 'lucide-react';

interface Props {
  expectedPassword: string;
  onSuccess: () => void;
  onClose: () => void;
}

export const ParentPasswordModal: React.FC<Props> = ({
  expectedPassword,
  onSuccess,
  onClose,
}) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (password.trim() === expectedPassword.trim()) {
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

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          <p className="text-xs text-slate-600 leading-relaxed">
            請輸入 Google Sheet「使用者資料」中 ADM 家長密碼，防止小孩自行增加積分或調整項目。
          </p>

          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-slate-700">家長密碼</label>
            <div className="relative">
              <input
                type={showPassword ? 'text' : 'password'}
                autoFocus
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

            {error && (
              <p className="text-xs text-rose-600 flex items-center gap-1 mt-1 animate-in fade-in">
                <ShieldAlert className="w-3.5 h-3.5 shrink-0" />
                密碼錯誤，請重新輸入（預設為 77777777）
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
              className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 text-white text-xs font-bold shadow-md shadow-orange-500/20 active:scale-95 transition flex items-center justify-center gap-1.5"
            >
              <Check className="w-4 h-4" />
              <span>驗證解鎖</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
};

import React, { useState } from 'react';
import { KeyRound, X, Check, ShieldAlert, CheckCircle, Loader2 } from 'lucide-react';
import { setParentPassword, updateParentPasswordInGoogleSheet } from '../utils/sheetData';

interface Props {
  currentPassword: string;
  onSuccess: (newPass: string) => void;
  onClose: () => void;
}

export const ChangePasswordModal: React.FC<Props> = ({
  currentPassword,
  onSuccess,
  onClose,
}) => {
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);
  const [isSaving, setIsSaving] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (oldPassword.trim() !== currentPassword.trim()) {
      setError('目前密碼不正確');
      return;
    }
    if (!newPassword.trim()) {
      setError('請輸入新密碼');
      return;
    }
    if (newPassword.trim().length < 4) {
      setError('新密碼長度至少需 4 碼');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('兩次輸入的新密碼不相符');
      return;
    }

    const cleanNewPass = newPassword.trim();
    setIsSaving(true);
    setError(null);

    // 1. Save locally
    setParentPassword(cleanNewPass);

    // 2. Synchronize to Google Sheet
    try {
      await updateParentPasswordInGoogleSheet(cleanNewPass);
    } catch {
      // ignore
    } finally {
      setIsSaving(false);
    }

    setSuccess(true);
    setTimeout(() => {
      onSuccess(cleanNewPass);
    }, 1200);
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
            <div className="w-9 h-9 rounded-2xl bg-orange-100 text-orange-600 flex items-center justify-center">
              <KeyRound className="w-5 h-5" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-base">修改家長密碼</h3>
              <p className="text-xs text-slate-500">更新操作專區存取密碼</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-600 hover:bg-slate-100 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {success ? (
          <div className="py-8 text-center space-y-2">
            <div className="w-12 h-12 rounded-full bg-emerald-100 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle className="w-6 h-6" />
            </div>
            <p className="text-sm font-bold text-slate-800">密碼修改成功！</p>
            <p className="text-xs text-slate-500">新密碼已儲存於本機，之後請使用新密碼登入。</p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="mt-4 space-y-3">
            {error && (
              <div className="p-2.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700 text-xs flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 shrink-0 text-rose-500" />
                <span>{error}</span>
              </div>
            )}

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">目前密碼</label>
              <input
                type="password"
                required
                value={oldPassword}
                onChange={(e) => {
                  setOldPassword(e.target.value);
                  setError(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="請輸入目前密碼"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">設定新密碼</label>
              <input
                type="password"
                required
                value={newPassword}
                onChange={(e) => {
                  setNewPassword(e.target.value);
                  setError(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="至少 4 碼以上"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-slate-700 mb-1">確認新密碼</label>
              <input
                type="password"
                required
                value={confirmPassword}
                onChange={(e) => {
                  setConfirmPassword(e.target.value);
                  setError(null);
                }}
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-50 border border-slate-200 text-slate-900 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-orange-500"
                placeholder="再次輸入新密碼"
              />
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
                disabled={isSaving}
                className="flex-1 py-2.5 rounded-xl bg-gradient-to-r from-orange-500 to-amber-500 hover:opacity-95 text-white text-xs font-bold shadow-md shadow-orange-500/20 active:scale-95 transition flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                {isSaving ? (
                  <>
                    <Loader2 className="w-4 h-4 animate-spin" />
                    <span>同步更新中...</span>
                  </>
                ) : (
                  <>
                    <Check className="w-4 h-4" />
                    <span>儲存並同步至試算表</span>
                  </>
                )}
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};

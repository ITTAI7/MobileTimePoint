import React, { useState } from 'react';
import {
  DEFAULT_GAS_API_URL,
  getStoredApiUrl,
  setStoredApiUrl,
  setParentPassword,
  getParentPassword,
  updateParentPasswordInGoogleSheet,
} from '../utils/sheetData';
import {
  X,
  Settings,
  RefreshCw,
  Database,
  Check,
  AlertCircle,
  Trash2,
  KeyRound,
  ShieldCheck,
  ShieldAlert,
  RotateCcw,
  Loader2,
  Fingerprint,
  Info,
} from 'lucide-react';
import { biometricDiagnostics } from '../utils/biometric';
import { RawSheetResponse, RawUser, TrustedDevice } from '../types';

interface Props {
  onClose: () => void;
  /** 可進入家長區的裝置名單，以及移除的方式 */
  trustedDevices?: TrustedDevice[];
  maxTrustedDevices?: number;
  localCredentialId?: string | null;
  onRemoveDevice?: (credentialId: string, password: string) => Promise<{ ok: boolean; message?: string }>;
  /** 只有「還有名額、這台沒登記過、裝置支援指紋」時 App 才會傳進來 */
  onEnrollDevice?: (label: string) => Promise<{ ok: boolean; message?: string }>;
  /** 這台裝置本身支援不支援指紋（用來解釋為什麼沒有登記按鈕） */
  bioAvailable?: boolean;
  isThisDeviceTrusted?: boolean;
  onRefreshData: () => void;
  onResetLocalData: () => void;
  rawResponse?: RawSheetResponse | null;
  currentPassword?: string;
  onPasswordChanged?: (newPass: string) => void;
}

export const SettingsModal: React.FC<Props> = ({
  onClose,
  trustedDevices = [],
  maxTrustedDevices = 2,
  localCredentialId = null,
  onRemoveDevice,
  onEnrollDevice,
  bioAvailable = false,
  isThisDeviceTrusted = false,
  onRefreshData,
  onResetLocalData,
  rawResponse,
  currentPassword,
  onPasswordChanged,
}) => {
  const [apiUrl, setApiUrl] = useState(getStoredApiUrl());
  const [savedSuccess, setSavedSuccess] = useState(false);

  // Password Management States
  const effectivePass = currentPassword || getParentPassword();
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [passwordError, setPasswordError] = useState<string | null>(null);
  const [passwordSuccess, setPasswordSuccess] = useState(false);
  const [deviceBusy, setDeviceBusy] = useState(false);
  const [deviceError, setDeviceError] = useState<string | null>(null);
  const [enrollLabel, setEnrollLabel] = useState('');
  const [diagnostics, setDiagnostics] = useState<string[] | null>(null);

  const deviceSlotsLeft = Math.max(0, maxTrustedDevices - trustedDevices.length);

  const handleEnroll = async () => {
    if (!onEnrollDevice || deviceBusy) return;
    setDeviceBusy(true);
    setDeviceError(null);
    const res = await onEnrollDevice(enrollLabel.trim() || '家長裝置');
    setDeviceBusy(false);
    if (res.ok) setEnrollLabel('');
    else setDeviceError(res.message || '登記失敗');
  };
  const [isUpdatingPassword, setIsUpdatingPassword] = useState(false);

  const hasCustomPassword = Boolean(localStorage.getItem('weekend_points_parent_password'));

  const handleSaveUrl = (e: React.FormEvent) => {
    e.preventDefault();
    setStoredApiUrl(apiUrl);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onRefreshData();
      onClose();
    }, 800);
  };

  const handleRestoreDefault = () => {
    setApiUrl(DEFAULT_GAS_API_URL);
    setStoredApiUrl(DEFAULT_GAS_API_URL);
    setSavedSuccess(true);
    setTimeout(() => {
      setSavedSuccess(false);
      onRefreshData();
      onClose();
    }, 800);
  };

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPasswordError(null);

    if (oldPassword.trim() !== effectivePass.trim()) {
      setPasswordError('目前密碼不正確');
      return;
    }
    if (!newPassword.trim()) {
      setPasswordError('請輸入新密碼');
      return;
    }
    if (newPassword.trim().length < 4) {
      setPasswordError('新密碼長度至少需 4 碼');
      return;
    }
    if (newPassword !== confirmPassword) {
      setPasswordError('兩次輸入的新密碼不相符');
      return;
    }

    const cleanNewPass = newPassword.trim();
    setIsUpdatingPassword(true);

    // 1. Save locally
    setParentPassword(cleanNewPass);
    if (onPasswordChanged) {
      onPasswordChanged(cleanNewPass);
    }

    // 2. Synchronize to Google Sheet
    try {
      await updateParentPasswordInGoogleSheet(cleanNewPass);
    } catch {
      // ignore
    } finally {
      setIsUpdatingPassword(false);
    }

    setPasswordSuccess(true);
    setOldPassword('');
    setNewPassword('');
    setConfirmPassword('');
    setTimeout(() => {
      setPasswordSuccess(false);
      setIsChangingPassword(false);
    }, 1800);
  };

  /** 試算表裡 ADM 那列目前的密碼；讀不到回 null */
  const sheetAdminPassword = (() => {
    const rows = rawResponse?.['使用者資料與餘額'] as RawUser[] | undefined;
    if (!Array.isArray(rows)) return null;
    const adm = rows.find((u) => String(u.UserID ?? '').trim().toUpperCase() === 'ADM');
    if (!adm) return null;
    const pw = String(adm['密碼'] ?? adm.Password ?? '').trim();
    return pw === '' ? null : pw;
  })();

  /**
   * 「還原試算表原始密碼」＝丟掉本機的自訂密碼，改用試算表現在寫的那組。
   *
   * 這裡**絕對不能回寫試算表**。舊版寫成 getParentPassword() 不帶參數，
   * 在本機 override 剛被清掉的情況下會回傳寫死的預設值，再把那個預設值
   * 寫進試算表 —— 行為與按鈕文案完全相反，會把家長自訂的密碼蓋掉。
   */
  const handleResetPasswordToDefault = () => {
    if (!sheetAdminPassword) {
      setPasswordError('讀不到試算表裡的 ADM 密碼，請先重新整理資料再試');
      return;
    }
    if (!confirm('確定要清除本機自訂密碼，改用試算表「使用者資料與餘額」中 ADM 的密碼嗎？')) {
      return;
    }
    try {
      localStorage.removeItem('weekend_points_parent_password');
    } catch {
      // ignore
    }
    setPasswordError(null);
    if (onPasswordChanged) onPasswordChanged(sheetAdminPassword);
    setPasswordSuccess(true);
    setTimeout(() => {
      setPasswordSuccess(false);
      setIsChangingPassword(false);
    }, 1500);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/60 backdrop-blur-xs p-4 animate-in fade-in duration-200"
      onClick={onClose}
    >
      <div
        className="w-full max-w-lg max-h-[85vh] flex flex-col rounded-3xl bg-white shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-blue-100 text-blue-600 flex items-center justify-center">
              <Settings className="w-4 h-4" />
            </div>
            <div>
              <h3 className="font-bold text-slate-800 text-sm">系統與連線設定</h3>
              <p className="text-[11px] text-slate-500">Google Sheet API 與家長安全管理</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg text-slate-400 hover:text-slate-600 hover:bg-slate-200/60 transition"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Body Content */}
        <div className="p-4 sm:p-5 overflow-y-auto space-y-5 text-sm">
          {/* Section 1: API URL Configuration */}
          <form onSubmit={handleSaveUrl} className="space-y-2.5">
            <div className="flex items-center justify-between">
              <label className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <span>Google Apps Script API 網址</span>
              </label>
              <button
                type="button"
                onClick={handleRestoreDefault}
                className="text-[11px] text-blue-600 hover:underline"
              >
                還原預設網址
              </button>
            </div>

            <div className="space-y-1.5">
              <input
                type="url"
                required
                value={apiUrl}
                onChange={(e) => setApiUrl(e.target.value)}
                placeholder="https://script.google.com/macros/s/.../exec"
                className="w-full px-3 py-2 rounded-xl border border-slate-200 text-xs font-mono text-slate-700 focus:outline-hidden focus:ring-2 focus:ring-blue-500 focus:border-transparent transition"
              />
              <p className="text-[11px] text-slate-400">
                此網址用於讀取與寫入您的 Google 試算表資料。
              </p>
            </div>

            <div className="flex items-center justify-between pt-1">
              <p className="text-[11px] text-slate-400 flex items-center gap-1">
                <Database className="w-3.5 h-3.5 text-slate-500" />
                包含任務配分表、點數存摺與使用者資料
              </p>
              <button
                type="submit"
                className="px-4 py-2 rounded-xl bg-blue-600 text-white font-medium text-xs hover:bg-blue-700 active:scale-95 transition flex items-center gap-1"
              >
                {savedSuccess ? (
                  <>
                    <Check className="w-3.5 h-3.5" /> 已儲存並重新整理
                  </>
                ) : (
                  '儲存並重新載入'
                )}
              </button>
            </div>
          </form>

          {/* Section 2: Parent Password Management (NEW) */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider flex items-center gap-1.5">
                <KeyRound className="w-3.5 h-3.5 text-orange-600" />
                <span>家長操作密碼設定</span>
              </h4>
              {hasCustomPassword && (
                <span className="text-[10px] bg-orange-100 text-orange-700 px-1.5 py-0.5 rounded font-medium">
                  已設定自訂密碼
                </span>
              )}
            </div>

            <div className="p-4 rounded-2xl bg-orange-50/70 border border-orange-200/80 space-y-3">
              <div className="flex items-start justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-800 flex items-center gap-1">
                    <ShieldCheck className="w-4 h-4 text-emerald-600" />
                    <span>家長操作專區存取密碼</span>
                  </p>
                  <p className="text-[11px] text-slate-500 mt-0.5">
                    切換至「家長操作區」登記點數時需輸入此密碼。
                  </p>
                </div>

                {!isChangingPassword && (
                  <button
                    type="button"
                    onClick={() => {
                      setIsChangingPassword(true);
                      setPasswordError(null);
                    }}
                    className="px-3 py-1.5 rounded-xl bg-white border border-orange-300 text-orange-700 hover:bg-orange-100/70 text-xs font-semibold transition shrink-0 shadow-2xs flex items-center gap-1"
                  >
                    <KeyRound className="w-3.5 h-3.5 text-orange-600" />
                    <span>修改密碼</span>
                  </button>
                )}
              </div>

              {/* Password Change Feedback */}
              {passwordSuccess && (
                <div className="p-2.5 rounded-xl bg-emerald-100 text-emerald-800 text-xs flex items-center gap-1.5 font-medium animate-in fade-in">
                  <Check className="w-4 h-4 text-emerald-600 shrink-0" />
                  <span>家長密碼已成功更新並儲存！</span>
                </div>
              )}

              {/* Interactive Password Form */}
              {isChangingPassword && (
                <form onSubmit={handleChangePasswordSubmit} className="pt-2 border-t border-orange-200/60 space-y-2.5">
                  {passwordError && (
                    <div className="p-2 rounded-lg bg-rose-100 text-rose-700 text-xs flex items-center gap-1.5">
                      <ShieldAlert className="w-4 h-4 text-rose-500 shrink-0" />
                      <span>{passwordError}</span>
                    </div>
                  )}

                  <div className="space-y-1">
                    <label className="block text-[11px] font-semibold text-slate-700">目前密碼</label>
                    <input
                      type="password"
                      required
                      value={oldPassword}
                      onChange={(e) => setOldPassword(e.target.value)}
                      placeholder="請輸入原本密碼"
                      className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-2">
                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">新密碼</label>
                      <input
                        type="password"
                        required
                        value={newPassword}
                        onChange={(e) => setNewPassword(e.target.value)}
                        placeholder="至少 4 碼"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-[11px] font-semibold text-slate-700">確認新密碼</label>
                      <input
                        type="password"
                        required
                        value={confirmPassword}
                        onChange={(e) => setConfirmPassword(e.target.value)}
                        placeholder="再次輸入新密碼"
                        className="w-full px-3 py-1.5 rounded-xl border border-slate-200 bg-white text-xs text-slate-800 focus:outline-hidden focus:ring-2 focus:ring-orange-500"
                      />
                    </div>
                  </div>

                  <div className="flex items-center justify-between pt-1">
                    {hasCustomPassword ? (
                      <button
                        type="button"
                        onClick={handleResetPasswordToDefault}
                        className="text-[11px] text-slate-500 hover:text-slate-800 flex items-center gap-1"
                      >
                        <RotateCcw className="w-3 h-3" />
                        <span>還原試算表原始密碼</span>
                      </button>
                    ) : (
                      <span />
                    )}

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setIsChangingPassword(false);
                          setPasswordError(null);
                        }}
                        className="px-3 py-1.5 rounded-xl bg-slate-200 hover:bg-slate-300 text-slate-700 text-xs font-medium transition"
                      >
                        取消
                      </button>
                      <button
                        type="submit"
                        disabled={isUpdatingPassword}
                        className="px-3.5 py-1.5 rounded-xl bg-orange-600 hover:bg-orange-700 text-white text-xs font-bold transition flex items-center gap-1 shadow-xs disabled:opacity-50"
                      >
                        {isUpdatingPassword ? (
                          <>
                            <Loader2 className="w-3.5 h-3.5 animate-spin" />
                            <span>同步中...</span>
                          </>
                        ) : (
                          <>
                            <Check className="w-3.5 h-3.5" />
                            <span>確認修改</span>
                          </>
                        )}
                      </button>
                    </div>
                  </div>
                </form>
              )}
            </div>
          </div>

          {/* 受信任裝置：只有這些裝置能用指紋直接進家長區 */}
          {onRemoveDevice && (
            <div className="pt-4 border-t border-slate-100 space-y-3">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
                  家長裝置（指紋解鎖）
                </h4>
                <span className="text-[11px] text-slate-400 font-mono">
                  {trustedDevices.length} / {maxTrustedDevices}
                </span>
              </div>

              {trustedDevices.length === 0 ? (
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  還沒有登記任何裝置。登記過的手機，點家長區就能直接用指紋進來。
                </p>
              ) : (
                <div className="space-y-2">
                  {trustedDevices.map((d) => {
                    const isThis = d.credentialId === localCredentialId;
                    return (
                      <div
                        key={d.credentialId}
                        className="flex items-center justify-between p-3 rounded-2xl bg-slate-50 border border-slate-200 gap-3"
                      >
                        <div className="min-w-0">
                          <p className="font-medium text-slate-800 text-xs truncate">
                            {d.label}
                            {isThis && (
                              <span className="ml-1.5 text-[10px] bg-emerald-100 text-emerald-700 px-1.5 py-0.5 rounded font-normal">
                                這台
                              </span>
                            )}
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {d.registeredAt ? new Date(d.registeredAt).toLocaleDateString() : ''} 登記
                          </p>
                        </div>
                        <button
                          type="button"
                          disabled={deviceBusy}
                          onClick={async () => {
                            const pass = prompt(`解除「${d.label}」的授權需要家長密碼：`);
                            if (!pass) return;
                            setDeviceBusy(true);
                            setDeviceError(null);
                            const res = await onRemoveDevice(d.credentialId, pass);
                            setDeviceBusy(false);
                            if (!res.ok) setDeviceError(res.message || '解除授權失敗');
                          }}
                          className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-medium transition shrink-0 disabled:opacity-50"
                        >
                          解除授權
                        </button>
                      </div>
                    );
                  })}
                </div>
              )}

              {/* 登記這一台 —— 沒名額、已登記、或裝置不支援時都不顯示按鈕 */}
              {isThisDeviceTrusted ? (
                <p className="text-[11px] text-emerald-700 flex items-start gap-1.5 leading-relaxed">
                  <ShieldCheck className="w-3.5 h-3.5 shrink-0 mt-px" />
                  這台已經授權，點家長區就能直接用指紋。要取消請按上面的「解除授權」。
                </p>
              ) : deviceSlotsLeft === 0 ? (
                <p className="text-[11px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
                  <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                  名額已滿（{maxTrustedDevices} 支）。要換成這一台的話，請先解除上面其中一支的授權。
                </p>
              ) : onEnrollDevice && bioAvailable ? (
                <div className="p-3 rounded-2xl bg-amber-50 border border-amber-200 space-y-2">
                  <p className="text-[11px] text-amber-900 leading-relaxed">
                    把<strong>這一台</strong>設為家長裝置，之後用指紋就能進家長區，不用再打密碼。
                    還剩 <strong>{deviceSlotsLeft}</strong> 個名額。
                  </p>
                  <input
                    type="text"
                    value={enrollLabel}
                    onChange={(e) => setEnrollLabel(e.target.value)}
                    placeholder="幫這台取名，例如：爸爸的手機"
                    maxLength={30}
                    className="w-full px-3 py-2 rounded-xl bg-white border border-amber-200 text-slate-800 text-xs focus:ring-2 focus:ring-amber-500 focus:outline-none"
                  />
                  <button
                    type="button"
                    onClick={handleEnroll}
                    disabled={deviceBusy}
                    className="w-full py-2 rounded-xl bg-amber-600 text-white text-xs font-bold hover:bg-amber-700 active:scale-98 transition disabled:opacity-50 flex items-center justify-center gap-1.5"
                  >
                    <Fingerprint className="w-4 h-4" />
                    {deviceBusy ? '登記中…' : '把這台設為家長裝置'}
                  </button>
                </div>
              ) : (
                <div className="space-y-1.5">
                  <p className="text-[11px] text-slate-500 flex items-start gap-1.5 leading-relaxed">
                    <Info className="w-3.5 h-3.5 shrink-0 mt-px" />
                    {onEnrollDevice
                      ? '這台裝置無法使用指紋登記。'
                      : '要登記這一台，請先用密碼進入家長區。'}
                  </p>
                  {onEnrollDevice && (
                    <button
                      type="button"
                      onClick={async () => setDiagnostics(await biometricDiagnostics())}
                      className="text-[11px] text-blue-600 hover:underline"
                    >
                      看看是哪裡不行
                    </button>
                  )}
                  {diagnostics && (
                    <ul className="text-[11px] text-slate-500 font-mono bg-slate-50 rounded-xl p-2.5 space-y-0.5">
                      {diagnostics.map((line) => (
                        <li key={line}>{line}</li>
                      ))}
                    </ul>
                  )}
                </div>
              )}

              {deviceError && <p className="text-[11px] text-rose-600">{deviceError}</p>}

              <p className="text-[11px] text-slate-400 leading-relaxed">
                只有登記過的裝置能用指紋解鎖。其他裝置仍可用密碼進入 ——
                這是換手機或忘記帶手機時的退路。
              </p>
            </div>
          )}

          {/* Section 3: Data Reset Section */}
          <div className="pt-4 border-t border-slate-100 space-y-3">
            <h4 className="text-xs font-semibold text-slate-700 uppercase tracking-wider">
              本機資料管理
            </h4>
            <div className="flex items-center justify-between p-3.5 rounded-2xl bg-slate-50 border border-slate-200">
              <div>
                <p className="font-medium text-slate-800 text-xs">清除本機紀錄快取</p>
                <p className="text-[11px] text-slate-400">
                  重設在前端新增的臨時點數與存摺紀錄，回到 Google Sheet 初始狀態
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  if (confirm('確定要清除所有本機新增的紀錄嗎？將會重新讀取 Google Sheet 資料。')) {
                    onResetLocalData();
                    onClose();
                  }
                }}
                className="px-3 py-1.5 rounded-xl border border-rose-200 text-rose-600 hover:bg-rose-50 text-xs font-medium transition shrink-0 ml-3 flex items-center gap-1"
              >
                <Trash2 className="w-3.5 h-3.5" /> 清除
              </button>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end">
          <button
            onClick={onClose}
            className="px-4 py-2 rounded-xl bg-slate-800 text-white text-xs font-medium hover:bg-slate-900 transition"
          >
            完成
          </button>
        </div>
      </div>
    </div>
  );
};

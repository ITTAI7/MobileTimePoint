/**
 * 指紋／臉部辨識解鎖（WebAuthn 平台驗證器）
 *
 * 重要的設計限制：
 * WebAuthn 的正規用法需要伺服器出題並驗證簽章。本專案沒有後端可以做這件事，
 * 所以這裡是「本機版」—— 只要瀏覽器回報驗證通過就解鎖，不做密碼學驗證。
 *
 * 這代表懂的人用開發者工具仍可繞過。但**現有的密碼驗證也是在瀏覽器裡跑的**，
 * 安全層級並沒有變差；對「防止小孩自行解鎖」這個實際目的來說，
 * 指紋反而更好 —— 小孩可能看到你輸入 1234，但複製不了你的指紋。
 */

const CREDENTIAL_KEY = 'weekend_points_biometric_credential_v1';

function toBase64Url(buffer: ArrayBuffer): string {
  const bytes = new Uint8Array(buffer);
  let binary = '';
  bytes.forEach((b) => {
    binary += String.fromCharCode(b);
  });
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

// 明確配置 ArrayBuffer，WebAuthn 的 BufferSource 型別才吃得下
function fromBase64Url(value: string): Uint8Array<ArrayBuffer> {
  const padded = value.replace(/-/g, '+').replace(/_/g, '/');
  const binary = atob(padded + '='.repeat((4 - (padded.length % 4)) % 4));
  const bytes = new Uint8Array(new ArrayBuffer(binary.length));
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  const buf = new Uint8Array(new ArrayBuffer(length));
  crypto.getRandomValues(buf);
  return buf;
}

export function getStoredCredentialId(): string | null {
  try {
    return localStorage.getItem(CREDENTIAL_KEY);
  } catch {
    return null;
  }
}

export function clearStoredCredential() {
  try {
    localStorage.removeItem(CREDENTIAL_KEY);
  } catch {
    // ignore
  }
}

/** 這台裝置有沒有可用的指紋／臉部辨識，而且瀏覽器支援 WebAuthn */
export async function isBiometricAvailable(): Promise<boolean> {
  try {
    if (typeof window === 'undefined') return false;
    if (!window.PublicKeyCredential) return false;
    if (!window.isSecureContext) return false; // 必須 HTTPS 或 localhost
    return await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable();
  } catch {
    return false;
  }
}

/** 把 WebAuthn 的例外翻成看得懂的說明 */
function describeError(err: unknown): string {
  const name = (err as { name?: string })?.name || '';
  switch (name) {
    case 'NotAllowedError':
      return '已取消，或驗證逾時';
    case 'InvalidStateError':
      return '這台裝置已經註冊過了';
    case 'NotSupportedError':
      return '這台裝置或瀏覽器不支援';
    case 'SecurityError':
      return '網址不符合安全要求（必須是 HTTPS）';
    case 'AbortError':
      return '驗證被中斷';
    default:
      return (err as { message?: string })?.message || '未知錯誤';
  }
}

export interface BiometricResult {
  ok: boolean;
  message?: string;
}

/** 註冊：在這台裝置上綁定指紋。只需做一次。 */
export async function registerBiometric(label = '家長'): Promise<BiometricResult> {
  try {
    if (!(await isBiometricAvailable())) {
      return { ok: false, message: '這台裝置沒有可用的指紋或臉部辨識' };
    }

    const credential = (await navigator.credentials.create({
      publicKey: {
        // 不指定 rp.id，讓瀏覽器直接用目前網域，避免設錯造成 SecurityError
        rp: { name: '手機時間存摺' },
        user: {
          id: randomBytes(16),
          name: label,
          displayName: label,
        },
        challenge: randomBytes(32),
        pubKeyCredParams: [
          { type: 'public-key', alg: -7 },   // ES256
          { type: 'public-key', alg: -257 }, // RS256
        ],
        authenticatorSelection: {
          authenticatorAttachment: 'platform', // 只用裝置內建的，不要外接金鑰
          userVerification: 'required',        // 一定要真的驗指紋，不能只是「有人在」
        },
        timeout: 60000,
      },
    })) as PublicKeyCredential | null;

    if (!credential) return { ok: false, message: '沒有取得憑證' };

    localStorage.setItem(CREDENTIAL_KEY, toBase64Url(credential.rawId));
    return { ok: true };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}

/** 解鎖：叫出指紋視窗。通過就回 ok。 */
export async function verifyBiometric(): Promise<BiometricResult> {
  try {
    const stored = getStoredCredentialId();
    if (!stored) return { ok: false, message: '這台裝置尚未註冊指紋' };

    const assertion = await navigator.credentials.get({
      publicKey: {
        challenge: randomBytes(32),
        allowCredentials: [{ type: 'public-key', id: fromBase64Url(stored) }],
        userVerification: 'required',
        timeout: 60000,
      },
    });

    return assertion ? { ok: true } : { ok: false, message: '驗證未完成' };
  } catch (err) {
    return { ok: false, message: describeError(err) };
  }
}

/** 診斷資訊，方便在設定畫面顯示為什麼不能用 */
export async function biometricDiagnostics(): Promise<string[]> {
  const lines: string[] = [];
  lines.push(`瀏覽器支援 WebAuthn：${window.PublicKeyCredential ? '是' : '否'}`);
  lines.push(`安全來源（HTTPS）：${window.isSecureContext ? '是' : '否'}`);
  try {
    const available = window.PublicKeyCredential
      ? await PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
      : false;
    lines.push(`裝置有指紋／臉部辨識：${available ? '是' : '否'}`);
  } catch {
    lines.push('裝置有指紋／臉部辨識：查詢失敗');
  }
  lines.push(`已註冊憑證：${getStoredCredentialId() ? '是' : '否'}`);
  return lines;
}

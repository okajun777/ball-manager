/** ログイン用パスワードのハッシュ／検証（Web Crypto PBKDF2） */

const ITERATIONS = 120_000;
const HASH_BYTES = 32;
const SALT_BYTES = 16;

function bytesToB64(bytes: Uint8Array): string {
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

function b64ToBytes(b64: string): Uint8Array {
  const s = atob(b64);
  const out = new Uint8Array(s.length);
  for (let i = 0; i < s.length; i++) out[i] = s.charCodeAt(i);
  return out;
}

async function deriveKey(password: string, salt: Uint8Array): Promise<Uint8Array> {
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations: ITERATIONS,
      hash: "SHA-256",
    },
    keyMaterial,
    HASH_BYTES * 8,
  );
  return new Uint8Array(bits);
}

/** 保存用: pbkdf2$iterations$saltB64$hashB64 */
export async function hashPassword(password: string): Promise<string> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const hash = await deriveKey(password, salt);
  return `pbkdf2$${ITERATIONS}$${bytesToB64(salt)}$${bytesToB64(hash)}`;
}

export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const parts = stored.split("$");
  if (parts.length !== 4 || parts[0] !== "pbkdf2") return false;
  const iterations = Number(parts[1]);
  if (!Number.isFinite(iterations) || iterations < 10_000) return false;
  const salt = b64ToBytes(parts[2]);
  const expected = b64ToBytes(parts[3]);
  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    enc.encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      salt: salt as BufferSource,
      iterations,
      hash: "SHA-256",
    },
    keyMaterial,
    expected.length * 8,
  );
  const actual = new Uint8Array(bits);
  if (actual.length !== expected.length) return false;
  let diff = 0;
  for (let i = 0; i < actual.length; i++) diff |= actual[i]! ^ expected[i]!;
  return diff === 0;
}

/** 表示名から初期ログインIDを作る（重複は呼び出し側で調整） */
export function suggestLoginId(displayName: string): string {
  const raw = displayName.trim().toLowerCase();
  if (!raw) return "";
  // 英数字のみならそのまま、そうでなければローマ字風に残せる文字だけ
  const ascii = raw
    .replace(/[^\p{L}\p{N}._-]+/gu, "")
    .replace(/\s+/g, "")
    .slice(0, 32);
  if (ascii.length >= 2) return ascii;
  // 日本語名など: 淳司 → junji は個別対応、それ以外は mem + 短縮
  if (raw === "淳司" || raw.includes("淳司")) return "junji";
  if (raw === "はるみ" || raw.includes("はるみ")) return "harumi";
  return `user${Math.abs(hashCode(raw) % 100000)}`;
}

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return h;
}

export function normalizeLoginId(loginId: string): string {
  return loginId.trim().toLowerCase();
}

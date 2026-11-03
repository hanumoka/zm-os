import { randomBytes, scrypt, timingSafeEqual } from "node:crypto";
import { ApiError } from "./common.js";

// OWASP Password Storage: scrypt N=2^17, r=8, p=1. No reversible password storage.
const cost = { N: 131072, r: 8, p: 1, maxmem: 256 * 1024 * 1024 };
const commonPasswords = new Set([
  "passwordpassword", "password123456789", "123456789012345", "1234567890123456",
  "qwertyuiopasdfgh", "qwertyuiopasdfghjkl", "letmeinletmeinletmein",
  "iloveyouiloveyou", "correcthorsebatterystaple", "thisisapassword",
]);
export function passwordInput(value: unknown, creating = false): string {
  if (typeof value !== "string") throw new ApiError(400, "PASSWORD_INVALID", "비밀번호를 입력해 주세요.");
  const normalized = value.normalize("NFC");
  const length = [...normalized].length;
  if (length < 1 || length > 128 || (creating && length < 15))
    throw new ApiError(400, "PASSWORD_INVALID", "비밀번호는 15~128자로 입력해 주세요. 공백과 한글도 사용할 수 있습니다.");
  if (creating && (commonPasswords.has(normalized.toLowerCase()) || /^(.)\1+$/u.test(normalized)))
    throw new ApiError(400, "PASSWORD_COMMON", "쉽게 추측할 수 있는 비밀번호입니다. 다른 비밀번호를 사용해 주세요.");
  return normalized;
}
function derive(password: string, salt: Buffer): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(password, salt, 64, cost, (error, key) => error ? reject(error) : resolve(key));
  });
}
export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16);
  const key = await derive(passwordInput(password, true), salt);
  return ["scrypt", cost.N, cost.r, cost.p, salt.toString("base64url"), key.toString("base64url")].join("$");
}
export async function verifyPassword(password: string, encoded: string | null): Promise<boolean> {
  const parts = encoded?.split("$");
  const valid = parts?.length === 6 && parts[0] === "scrypt" && parts[1] === String(cost.N) &&
    parts[2] === String(cost.r) && parts[3] === String(cost.p) &&
    /^[A-Za-z0-9_-]{22}$/.test(parts[4] ?? "") && /^[A-Za-z0-9_-]{86}$/.test(parts[5] ?? "");
  // Missing users perform the same expensive KDF; never shortcut on email existence.
  const salt = valid ? Buffer.from(parts![4]!, "base64url") : Buffer.alloc(16, 71);
  const expected = valid ? Buffer.from(parts![5]!, "base64url") : Buffer.alloc(64);
  const actual = await derive(passwordInput(password), salt);
  return timingSafeEqual(actual, expected) && Boolean(valid);
}

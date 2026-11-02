import { createHash, randomBytes, timingSafeEqual } from "node:crypto";
import type { Request } from "express";
import { z } from "zod";
export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export function ensure(
  value: unknown,
  status: number,
  code: string,
  message = code,
): asserts value {
  if (!value) throw new ApiError(status, code, message);
}
export function secret(): string {
  return randomBytes(32).toString("base64url");
}
export function hash(value: string | Buffer): string {
  return createHash("sha256").update(value).digest("hex");
}
export function equal(a: string, b: string): boolean {
  const x = Buffer.from(a);
  const y = Buffer.from(b);
  return x.length === y.length && timingSafeEqual(x, y);
}
export function cookie(req: Request, name: string): string {
  return (
    (req.headers.cookie ?? "")
      .split(";")
      .map((x) => x.trim())
      .find((x) => x.startsWith(`${name}=`))
      ?.slice(name.length + 1) ?? ""
  );
}
export const idSchema = z.string().uuid();
export const reasonSchema = z.string().trim().min(1).max(2000);
export function camel(row: Record<string, unknown>): Record<string, unknown> {
  return Object.fromEntries(
    Object.entries(row).map(([key, value]) => [
      key.replace(/_([a-z])/g, (_match, letter: string) =>
        letter.toUpperCase(),
      ),
      value,
    ]),
  );
}
export function fingerprint(manifest: {
  permissions: string[];
  apiOrigins: string[];
  privacyNotice: string;
}): string {
  return hash(
    JSON.stringify({
      permissions: [...manifest.permissions].sort(),
      apiOrigins: [...manifest.apiOrigins].sort(),
      privacyNotice: manifest.privacyNotice,
    }),
  );
}

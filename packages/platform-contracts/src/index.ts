import { z } from "zod";
export * from "./workspace.js";

export const appTypeSchema = z.enum(["default", "developer"]);
export type AppType = z.infer<typeof appTypeSchema>;

export const permissions = [
  "local-storage",
  "app-identity",
  "external-api",
  "cloud-storage",
] as const;
export const manifestSchema = z
  .object({
    schemaVersion: z.literal(1),
    appId: z.string().uuid(),
    version: z.string().regex(/^\d+\.\d+\.\d+$/),
    name: z.string().min(1).max(60),
    description: z.string().min(1).max(2000),
    category: z.enum(["productivity", "education", "tools", "games"]),
    entry: z.literal("index.html"),
    permissions: z
      .array(z.enum(permissions))
      .max(4)
      .refine((v) => new Set(v).size === v.length),
    apiOrigins: z.array(z.string().url()).max(5),
    privacyNotice: z.string().min(1).max(2000),
  })
  .strict()
  .superRefine((v, ctx) => {
    if (v.permissions.includes("external-api") !== v.apiOrigins.length > 0)
      ctx.addIssue({
        code: "custom",
        message: "external-api 권한과 apiOrigins를 함께 선언하세요.",
      });
    for (const origin of v.apiOrigins) {
      const url = new URL(origin);
      if (
        url.origin !== origin ||
        url.username ||
        url.password ||
        !["https:", "http:"].includes(url.protocol)
      )
        ctx.addIssue({
          code: "custom",
          message: "apiOrigins에는 경로 없는 HTTP(S) origin만 허용합니다.",
        });
    }
  });
export type AppManifest = z.infer<typeof manifestSchema>;
export type JsonValue =
  | null
  | boolean
  | number
  | string
  | JsonValue[]
  | { [key: string]: JsonValue };
export interface UserView {
  id: string;
  status: "active" | "suspended";
  operator: boolean;
  developer: boolean;
  providers: string[];
  emailAddress?: string;
  csrf: string;
  requiresReauth?: boolean;
}
export interface AppView {
  id: string;
  appType: AppType;
  name: string;
  description: string;
  category: string;
  version: string;
  manifest: AppManifest;
  available?: boolean;
  unavailableReason?: string;
}
export interface AppSessionView {
  id: string;
  appId: string;
  appUserId: string;
  versionId: string;
  expiresAt: string;
  documentUrl: string;
  manifest: AppManifest;
  isPreview?: boolean;
}
export interface AppConsentView {
  appId: string;
  name: string;
  revokedAt: string | null;
  available: boolean;
  unavailableReason?: string;
}
export interface DeveloperProfileView {
  status: "none" | "approved" | "revoked";
  reason: string;
}
export const sdkMethods = [
  "runtime.ready",
  "runtime.close",
  "storage.get",
  "storage.set",
  "storage.remove",
  "cloud.get",
  "cloud.put",
  "cloud.remove",
  "cloud.list",
  "identity.getAppUser",
  "auth.createCode",
] as const;
export const rpcRequestSchema = z
  .object({
    id: z.string().min(1).max(100),
    method: z.enum(sdkMethods),
    params: z.record(z.string(), z.unknown()).default({}),
  })
  .strict();
export type RpcRequest = z.infer<typeof rpcRequestSchema>;
export interface RpcResponse {
  id: string;
  result?: JsonValue;
  error?: { code: string; message: string };
}
export const TEST_LIMITS = {
  zipBytes: 5 * 1024 * 1024,
  expandedBytes: 20 * 1024 * 1024,
  files: 256,
  messageBytes: 65536,
  localBytes: 1048576,
  sessionSeconds: 3600,
  codeSeconds: 60,
  statusLinkSeconds: 86400,
} as const;

/** Trial limits; not production capacity commitments. Deleted keys count until an explicit reset. */
export const CLOUD_LIMITS = { spaceBytes: 5 * 1024 * 1024, recordBytes: 32 * 1024, keys: 500, requestsPerMinute: 120, receipts: 5000 } as const;
const cloudKey = z.string().regex(/^[A-Za-z0-9][A-Za-z0-9._:-]{0,119}$/);
const cloudWrite = {
  key: cloudKey, generation: z.string().uuid(), expectedRevision: z.number().int().min(0).max(2147483646),
  requestId: z.string().uuid(),
};
export const cloudSchemas = {
  "cloud.get": z.object({ key: cloudKey }).strict(),
  "cloud.put": z.object({ ...cloudWrite, value: z.json(), schemaVersion: z.number().int().min(1).max(1000000) }).strict(),
  "cloud.remove": z.object(cloudWrite).strict(),
  "cloud.list": z.object({ cursor: cloudKey.optional(), limit: z.number().int().min(1).max(50).optional() }).strict(),
};
export type CloudMethod = keyof typeof cloudSchemas;
export type CloudPut = Omit<z.infer<typeof cloudSchemas["cloud.put"]>, "key">;
export type CloudRemove = Omit<z.infer<typeof cloudSchemas["cloud.remove"]>, "key">;
export type CloudWriteResult = { generation: string; revision: number; exists: boolean; schemaVersion: number; updatedAt: string | null };
export type CloudRecord = CloudWriteResult & { value: JsonValue };
export type CloudList = { generation: string; keys: string[]; nextCursor: string | null };

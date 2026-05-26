import { z } from 'zod';

// ── 공통 필드 (V1/V2 공유) ──────────────────────────────────────────────────

const ManifestCommonFields = {
  id: z
    .string()
    .min(1)
    .max(128)
    .regex(/^[a-z0-9][a-z0-9._-]*$/, 'id는 소문자 영숫자/./_/-만 허용'),
  name: z.string().min(1).max(100),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'semver MAJOR.MINOR.PATCH'),
  author: z.string().max(100).optional(),
  description: z.string().max(500).optional(),
  entryPoint: z.string().default('index.html'),
  icon: z.string().optional(),
  size: z
    .object({
      defaultWidth: z.number().int().positive().max(4096).default(800),
      defaultHeight: z.number().int().positive().max(4096).default(600),
    })
    .default({ defaultWidth: 800, defaultHeight: 600 }),
  sandbox: z
    .object({
      storage: z.literal('isolated').default('isolated'),
      network: z.enum(['none', 'host-proxy']).default('none'),
      clipboard: z.boolean().default(false),
    })
    .default({ storage: 'isolated', network: 'none', clipboard: false }),
};

// ── V1 스키마 (레거시 — 읽기 전용, 마이그레이션 입력용) ─────────────────────

/** @deprecated v1 — 읽기 전용. 새 앱은 schemaVersion: 2 사용. */
export const AppManifestV1Schema = z.object({
  schemaVersion: z.literal(1),
  ...ManifestCommonFields,
  permissions: z.array(z.enum(['gamepad', 'audio'])).default([]),
});

// ── V2 스키마 (현행) ────────────────────────────────────────────────────────

export const AppManifestV2Schema = z.object({
  schemaVersion: z.literal(2),
  ...ManifestCommonFields,
  capabilities: z.array(z.string()).default([]),
});

// ── 타입 (출력은 항상 V2) ────────────────────────────────────────────────────

export type AppManifest = z.infer<typeof AppManifestV2Schema>;

// ── V1 → V2 마이그레이션 ────────────────────────────────────────────────────

function migrateV1toV2(v1: z.infer<typeof AppManifestV1Schema>): AppManifest {
  const { permissions, schemaVersion: _, ...rest } = v1;
  return { ...rest, schemaVersion: 2, capabilities: [...permissions] };
}

// ── 공개 파서 ────────────────────────────────────────────────────────────────

export function parseManifest(input: unknown): AppManifest {
  const obj = input as Record<string, unknown> | null | undefined;
  if (obj != null && typeof obj === 'object' && obj['schemaVersion'] === 1) {
    return migrateV1toV2(AppManifestV1Schema.parse(input));
  }
  return AppManifestV2Schema.parse(input);
}

export function safeParseManifest(
  input: unknown,
): { success: true; data: AppManifest } | { success: false; error: z.ZodError } {
  const obj = input as Record<string, unknown> | null | undefined;
  if (obj != null && typeof obj === 'object' && obj['schemaVersion'] === 1) {
    const result = AppManifestV1Schema.safeParse(input);
    if (result.success) return { success: true, data: migrateV1toV2(result.data) };
    return { success: false, error: result.error };
  }
  const result = AppManifestV2Schema.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

import { z } from 'zod';

export const AppManifestV1 = z.object({
  schemaVersion: z.literal(1),
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
  permissions: z.array(z.enum(['gamepad', 'audio'])).default([]),
  sandbox: z
    .object({
      storage: z.literal('isolated').default('isolated'),
      network: z.enum(['none', 'host-proxy']).default('none'),
      clipboard: z.boolean().default(false),
    })
    .default({ storage: 'isolated', network: 'none', clipboard: false }),
});

export type AppManifest = z.infer<typeof AppManifestV1>;

export function parseManifest(input: unknown): AppManifest {
  return AppManifestV1.parse(input);
}

export function safeParseManifest(
  input: unknown,
): { success: true; data: AppManifest } | { success: false; error: z.ZodError } {
  const result = AppManifestV1.safeParse(input);
  if (result.success) return { success: true, data: result.data };
  return { success: false, error: result.error };
}

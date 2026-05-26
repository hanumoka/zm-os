import { parseManifest, type AppManifest } from '../manifest';
import type { ValidationError } from './types';

export type ManifestSchemaResult =
  | { ok: true; manifest: AppManifest }
  | ValidationError;

export function validateManifestSchema(manifestJson: string): ManifestSchemaResult {
  try {
    const raw: unknown = JSON.parse(manifestJson);
    const manifest = parseManifest(raw);
    return { ok: true, manifest };
  } catch (err) {
    return {
      ok: false,
      code: 'MANIFEST_INVALID',
      message: `manifest.json 검증 실패: ${String(err)}`,
    };
  }
}

import type JSZip from 'jszip';
import type { ValidationError } from './types';

export const MAX_COMPRESSION_RATIO = 1000;

type JsZipInternalData = {
  compressedSize: number;
  uncompressedSize: number;
};

function isJsZipInternalData(v: unknown): v is JsZipInternalData {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>)['compressedSize'] === 'number' &&
    typeof (v as Record<string, unknown>)['uncompressedSize'] === 'number'
  );
}

function getCompressionRatio(entry: Record<string, unknown>): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: unknown = entry['_data'];
  if (!isJsZipInternalData(raw)) return null;
  if (raw.compressedSize <= 0) return null;
  return raw.uncompressedSize / raw.compressedSize;
}

export function validateZipBomb(zip: JSZip): ValidationError | null {
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    if (entry.dir) continue;
    const ratio = getCompressionRatio(entry as unknown as Record<string, unknown>);
    if (ratio !== null && ratio > MAX_COMPRESSION_RATIO) {
      return {
        ok: false,
        code: 'BOMB',
        message: `ZIP bomb 의심: 파일 "${entryPath}"의 압축 해제 비율이 ${ratio.toFixed(0)}x (최대 허용: ${MAX_COMPRESSION_RATIO}x)`,
      };
    }
  }
  return null;
}

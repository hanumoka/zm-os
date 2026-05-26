import type { ValidationError } from './types';

export const MAX_ZIP_BYTES = 10 * 1024 * 1024;

export function validateZipSize(file: File): ValidationError | null {
  if (file.size > MAX_ZIP_BYTES) {
    return {
      ok: false,
      code: 'ZIP_TOO_LARGE',
      message: `ZIP 파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)} MB). 최대 허용: ${MAX_ZIP_BYTES / 1024 / 1024} MB`,
    };
  }
  return null;
}

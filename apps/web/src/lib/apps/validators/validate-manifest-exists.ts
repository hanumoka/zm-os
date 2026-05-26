import type JSZip from 'jszip';
import type { ValidationError } from './types';

export function validateManifestExists(zip: JSZip): ValidationError | null {
  if (zip.file('manifest.json') === null) {
    return {
      ok: false,
      code: 'NO_MANIFEST',
      message: 'ZIP 루트에 manifest.json 파일이 없습니다',
    };
  }
  return null;
}

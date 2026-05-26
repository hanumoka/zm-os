import type JSZip from 'jszip';
import type { ValidationError } from './types';

export function validateHtmlExists(zip: JSZip): ValidationError | null {
  if (zip.file('index.html') === null) {
    return {
      ok: false,
      code: 'NO_HTML',
      message: 'ZIP 루트에 index.html 파일이 없습니다',
    };
  }
  return null;
}

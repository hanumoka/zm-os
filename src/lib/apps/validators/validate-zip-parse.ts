import JSZip from 'jszip';
import type { ValidationError } from './types';

export type ZipParseResult =
  | { ok: true; zip: JSZip }
  | ValidationError;

export async function validateZipParse(file: File): Promise<ZipParseResult> {
  try {
    const buf = await file.arrayBuffer();
    const zip = await JSZip.loadAsync(buf);
    return { ok: true, zip };
  } catch (err) {
    return {
      ok: false,
      code: 'INVALID_ZIP',
      message: `ZIP 파싱 실패: ${String(err)}`,
    };
  }
}

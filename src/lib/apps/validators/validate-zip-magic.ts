import type { ValidationError } from './types';

const ZIP_MAGIC_SEQUENCES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
];

function isZipMagic(header: Uint8Array): boolean {
  for (const seq of ZIP_MAGIC_SEQUENCES) {
    if (
      header.length >= 4 &&
      header[0] === seq[0] &&
      header[1] === seq[1] &&
      header[2] === seq[2] &&
      header[3] === seq[3]
    ) {
      return true;
    }
  }
  return false;
}

export async function validateZipMagic(file: File): Promise<ValidationError | null> {
  let header: Uint8Array;
  try {
    const headerBuf = await file.slice(0, 4).arrayBuffer();
    header = new Uint8Array(headerBuf);
  } catch {
    return { ok: false, code: 'INVALID_ZIP', message: 'ZIP 헤더를 읽을 수 없습니다' };
  }

  if (!isZipMagic(header)) {
    return {
      ok: false,
      code: 'NOT_ZIP_MAGIC',
      message: 'ZIP 파일 형식이 아닙니다 (magic byte 불일치). .zip 파일을 업로드하세요.',
    };
  }
  return null;
}

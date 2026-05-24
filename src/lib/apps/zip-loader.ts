/**
 * ZIP 업로드 파서 (APP-02 lib layer)
 *
 * 보안 정책 (security.md + architect §4):
 * - P4 임계치: MAX_ZIP_BYTES=10MB, MAX_HTML_BYTES=5MB, MAX_COMPRESSION_RATIO=1000
 * - magic byte 검증: 504B0304 / 504B0506 / 504B0708
 * - path traversal 차단: '..' / 절대경로 / 백슬래시
 * - id 중복 검사: reservedIds Set 인자
 * - ZIP bomb: _data.compressedSize / uncompressedSize 비율 검사
 *
 * JSZip 내부 `_data` 속성 접근:
 *   JSZip@3.10.1 런타임에 compressedSize/uncompressedSize를 포함하는 객체가
 *   _data에 저장된다. 공식 타입 정의에서는 commented-out(private)이지만
 *   ZIP bomb 방어를 위해 불가피하게 접근한다.
 *   타입 안전성은 런타임 typeof 가드로 보장.
 *   eslint-disable 처리.
 *
 * SSR 안전: lib 모듈, 브라우저 File/ArrayBuffer API만 사용 (호출자가 client 컴포넌트에서 사용).
 * 'use client' 미사용.
 */

import JSZip from 'jszip';
import { parseManifest, type AppManifest } from './manifest';

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

/** ZIP에서 파싱 완료된 사용자 앱 (manifest + htmlContent) */
export type ParsedUserApp = {
  manifest: AppManifest;
  htmlContent: string;
};

/** ZIP 로드 실패 원인 코드 */
export type ZipLoadErrorCode =
  | 'INVALID_ZIP'
  | 'NOT_ZIP_MAGIC'
  | 'NO_MANIFEST'
  | 'NO_HTML'
  | 'MANIFEST_INVALID'
  | 'PATH_TRAVERSAL'
  | 'ZIP_TOO_LARGE'
  | 'HTML_TOO_LARGE'
  | 'BOMB'
  | 'DUPLICATE_ID';

/** loadUserAppFromZip 결과 (discriminated union) */
export type ZipLoadResult =
  | { ok: true; app: ParsedUserApp }
  | { ok: false; code: ZipLoadErrorCode; message: string };

// ─── 임계치 상수 (P4 — research-analyst 권장값) ─────────────────────────────

/** ZIP 파일 최대 허용 크기: 10MB */
export const MAX_ZIP_BYTES = 10 * 1024 * 1024;

/** 압축 해제된 HTML 최대 허용 크기: 5MB */
export const MAX_HTML_BYTES = 5 * 1024 * 1024;

/**
 * ZIP bomb 방어 압축비 임계치: 1000x
 * research-analyst 권장값 (architect 초안 100 → 상향 적용)
 */
export const MAX_COMPRESSION_RATIO = 1000;

// ─── ZIP magic byte 시그니처 ─────────────────────────────────────────────────

/**
 * 유효한 ZIP magic byte 시퀀스 (첫 4바이트).
 * 504B0304: Local file header (일반 ZIP)
 * 504B0506: End of central directory (빈 ZIP)
 * 504B0708: Data descriptor (spanned ZIP)
 */
const ZIP_MAGIC_SEQUENCES: ReadonlyArray<readonly [number, number, number, number]> = [
  [0x50, 0x4b, 0x03, 0x04],
  [0x50, 0x4b, 0x05, 0x06],
  [0x50, 0x4b, 0x07, 0x08],
];

// ─── 내부 헬퍼 타입 (JSZip _data 접근용) ─────────────────────────────────────

/** JSZip 내부 _data 객체의 런타임 형태 (공식 타입에서 private, 런타임 가드로 검증) */
type JsZipInternalData = {
  compressedSize: number;
  uncompressedSize: number;
};

/** JSZipObject에 _data가 붙어있는 런타임 형태 */
type JsZipObjectWithData = {
  dir: boolean;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  async: (type: 'string') => Promise<string>;
  _data?: unknown;
};

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

/**
 * File 객체에서 사용자 앱 ZIP을 파싱한다.
 *
 * @param file      업로드된 ZIP File
 * @param reservedIds  이미 사용 중인 앱 id Set (중복 검사)
 * @returns ZipLoadResult — ok: true 시 ParsedUserApp, ok: false 시 에러 코드+메시지
 *
 * SSR 안전: File/ArrayBuffer는 브라우저 전용이므로 호출자는 반드시 브라우저 컨텍스트에서 호출해야 한다.
 */
export async function loadUserAppFromZip(
  file: File,
  reservedIds: ReadonlySet<string>,
): Promise<ZipLoadResult> {
  // ── 1. ZIP 파일 크기 검사 ──────────────────────────────────────────────────
  if (file.size > MAX_ZIP_BYTES) {
    return {
      ok: false,
      code: 'ZIP_TOO_LARGE',
      message: `ZIP 파일이 너무 큽니다 (${(file.size / 1024 / 1024).toFixed(1)} MB). 최대 허용: ${MAX_ZIP_BYTES / 1024 / 1024} MB`,
    };
  }

  // ── 2. magic byte 검사 (첫 4바이트) ──────────────────────────────────────
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

  // ── 3. JSZip 로드 ─────────────────────────────────────────────────────────
  let zip: JSZip;
  try {
    zip = await JSZip.loadAsync(file);
  } catch (err) {
    return {
      ok: false,
      code: 'INVALID_ZIP',
      message: `ZIP 파싱 실패: ${String(err)}`,
    };
  }

  // ── 4. 모든 항목 순회: path traversal + ZIP bomb 압축비 검사 ──────────────
  for (const [entryPath, entry] of Object.entries(zip.files)) {
    // path traversal 검사
    if (hasPathTraversal(entryPath)) {
      return {
        ok: false,
        code: 'PATH_TRAVERSAL',
        message: `위험한 파일 경로가 포함되어 있습니다: "${entryPath}"`,
      };
    }

    // 디렉토리 항목은 압축비 검사 불필요
    if (entry.dir) {
      continue;
    }

    // ZIP bomb 압축비 검사 (_data 내부 접근, eslint-disable)
    const zipRatio = getCompressionRatio(entry as JsZipObjectWithData);
    if (zipRatio !== null && zipRatio > MAX_COMPRESSION_RATIO) {
      return {
        ok: false,
        code: 'BOMB',
        message: `ZIP bomb 의심: 파일 "${entryPath}"의 압축 해제 비율이 ${zipRatio.toFixed(0)}x (최대 허용: ${MAX_COMPRESSION_RATIO}x)`,
      };
    }
  }

  // ── 5. manifest.json + index.html 추출 ───────────────────────────────────
  const manifestFile = zip.file('manifest.json');
  if (manifestFile === null) {
    return {
      ok: false,
      code: 'NO_MANIFEST',
      message: 'ZIP 루트에 manifest.json 파일이 없습니다',
    };
  }

  const htmlFile = zip.file('index.html');
  if (htmlFile === null) {
    return {
      ok: false,
      code: 'NO_HTML',
      message: 'ZIP 루트에 index.html 파일이 없습니다',
    };
  }

  // ── 6. 파일 내용 추출 ────────────────────────────────────────────────────
  let manifestJson: string;
  let htmlContent: string;

  try {
    [manifestJson, htmlContent] = await Promise.all([
      manifestFile.async('string'),
      htmlFile.async('string'),
    ]);
  } catch (err) {
    return {
      ok: false,
      code: 'INVALID_ZIP',
      message: `파일 내용 추출 실패: ${String(err)}`,
    };
  }

  // ── 7. HTML 크기 검사 (압축 해제 후 실제 바이트 수 기준) ─────────────────
  // TextEncoder로 UTF-8 바이트 크기를 측정 (string.length는 char 수)
  const htmlByteLength = new TextEncoder().encode(htmlContent).length;
  if (htmlByteLength > MAX_HTML_BYTES) {
    return {
      ok: false,
      code: 'HTML_TOO_LARGE',
      message: `index.html이 너무 큽니다 (${(htmlByteLength / 1024 / 1024).toFixed(1)} MB). 최대 허용: ${MAX_HTML_BYTES / 1024 / 1024} MB`,
    };
  }

  // ── 8. manifest.json 파싱 (Zod 검증) ─────────────────────────────────────
  let manifest: AppManifest;
  try {
    const raw: unknown = JSON.parse(manifestJson);
    manifest = parseManifest(raw);
  } catch (err) {
    return {
      ok: false,
      code: 'MANIFEST_INVALID',
      message: `manifest.json 검증 실패: ${String(err)}`,
    };
  }

  // ── 9. id 중복 검사 ───────────────────────────────────────────────────────
  if (reservedIds.has(manifest.id)) {
    return {
      ok: false,
      code: 'DUPLICATE_ID',
      message: `앱 ID "${manifest.id}"가 이미 존재합니다. manifest.json의 id를 고유하게 변경하세요.`,
    };
  }

  // ── 성공 ─────────────────────────────────────────────────────────────────
  return {
    ok: true,
    app: { manifest, htmlContent },
  };
}

// ─── 내부 헬퍼 함수 ──────────────────────────────────────────────────────────

/**
 * ZIP magic byte 검증.
 * 첫 4바이트가 유효한 ZIP 시그니처인지 확인한다.
 */
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

/**
 * ZIP path traversal 패턴 검사.
 *
 * 차단 대상:
 * - '..' 포함 (상위 디렉토리 탐색)
 * - '/' 시작 (절대 Unix 경로)
 * - Windows 드라이브 문자 경로 (예: 'C:\' 또는 'C:/')
 * - 백슬래시 포함 (Windows 경로 구분자 — ZIP 표준은 '/'이므로 의심)
 */
function hasPathTraversal(p: string): boolean {
  if (p.includes('..')) return true;
  if (p.startsWith('/')) return true;
  if (/^[a-zA-Z]:[/\\]/.test(p)) return true;
  if (p.includes('\\')) return true;
  return false;
}

/**
 * JSZip 내부 _data에서 압축비를 계산한다.
 *
 * @returns 압축비 (uncompressedSize / compressedSize), 계산 불가 시 null
 *
 * JSZip@3.10.1 런타임: ZipObject._data.compressedSize / uncompressedSize 존재.
 * 공식 타입에서는 private(주석 처리)이므로 런타임 typeof 가드로 안전하게 접근.
 * compressedSize === 0 (STORE 타입 또는 비어있는 파일) 시 null 반환 — divide-by-zero 방지.
 */
function getCompressionRatio(entry: JsZipObjectWithData): number | null {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const raw: unknown = (entry as Record<string, unknown>)['_data'];
  if (!isJsZipInternalData(raw)) {
    return null;
  }
  if (raw.compressedSize <= 0) {
    return null;
  }
  return raw.uncompressedSize / raw.compressedSize;
}

/**
 * 런타임 타입 가드: JsZipInternalData 형태인지 확인.
 */
function isJsZipInternalData(v: unknown): v is JsZipInternalData {
  return (
    typeof v === 'object' &&
    v !== null &&
    typeof (v as Record<string, unknown>)['compressedSize'] === 'number' &&
    typeof (v as Record<string, unknown>)['uncompressedSize'] === 'number'
  );
}

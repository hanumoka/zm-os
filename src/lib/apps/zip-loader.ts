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
 * REFAC-01 H-2: 검증 로직을 9개 개별 validator로 분리 (validators/)
 */

import type { AppManifest } from './manifest';
import { compareSemver, type SemverCompareResult } from './version';
import {
  validateZipSize,
  validateZipMagic,
  validateZipParse,
  validatePathTraversal,
  validateZipBomb,
  validateManifestExists,
  validateHtmlExists,
  validateHtmlSize,
  validateManifestSchema,
  MAX_ZIP_BYTES,
  MAX_HTML_BYTES,
  MAX_COMPRESSION_RATIO,
} from './validators';
import type { ZipLoadErrorCode } from './validators';

// ─── re-export (하위 호환) ───────────────────────────────────────────────────

export { MAX_ZIP_BYTES, MAX_HTML_BYTES, MAX_COMPRESSION_RATIO };
export type { ZipLoadErrorCode };

// ─── 공개 타입 ────────────────────────────────────────────────────────────────

export type ParsedUserApp = {
  manifest: AppManifest;
  htmlContent: string;
};

export type UpdateTarget = {
  existingVersion: string;
  newVersion: string;
  comparison: SemverCompareResult;
};

export type ZipLoadResult =
  | { ok: true; app: ParsedUserApp; updateTarget: UpdateTarget | null }
  | { ok: false; code: ZipLoadErrorCode; message: string };

// ─── 메인 함수 ────────────────────────────────────────────────────────────────

export async function loadUserAppFromZip(
  file: File,
  reservedIds: ReadonlySet<string>,
  existingUserApps?: ReadonlyMap<string, string>,
): Promise<ZipLoadResult> {
  // 1. ZIP 크기
  const sizeErr = validateZipSize(file);
  if (sizeErr !== null) return sizeErr;

  // 2. magic byte
  const magicErr = await validateZipMagic(file);
  if (magicErr !== null) return magicErr;

  // 3. JSZip 파싱
  const parseResult = await validateZipParse(file);
  if (!parseResult.ok) return parseResult;
  const { zip } = parseResult;

  // 4. path traversal
  const pathErr = validatePathTraversal(zip);
  if (pathErr !== null) return pathErr;

  // 5. ZIP bomb
  const bombErr = validateZipBomb(zip);
  if (bombErr !== null) return bombErr;

  // 6. manifest.json 존재
  const manifestExistsErr = validateManifestExists(zip);
  if (manifestExistsErr !== null) return manifestExistsErr;

  // 7. index.html 존재
  const htmlExistsErr = validateHtmlExists(zip);
  if (htmlExistsErr !== null) return htmlExistsErr;

  // 8. 파일 내용 추출
  let manifestJson: string;
  let htmlContent: string;
  try {
    [manifestJson, htmlContent] = await Promise.all([
      zip.file('manifest.json')!.async('string'),
      zip.file('index.html')!.async('string'),
    ]);
  } catch (err) {
    return { ok: false, code: 'INVALID_ZIP', message: `파일 내용 추출 실패: ${String(err)}` };
  }

  // 9-a. HTML 크기
  const htmlSizeErr = validateHtmlSize(htmlContent);
  if (htmlSizeErr !== null) return htmlSizeErr;

  // 9-b. manifest 스키마
  const schemaResult = validateManifestSchema(manifestJson);
  if (!schemaResult.ok) return schemaResult;
  const { manifest } = schemaResult;

  // 10. id 중복 검사
  if (reservedIds.has(manifest.id)) {
    return {
      ok: false,
      code: 'DUPLICATE_ID',
      message: `앱 ID "${manifest.id}"는 시스템 앱과 충돌합니다. manifest.json의 id를 변경하세요.`,
    };
  }

  let updateTarget: UpdateTarget | null = null;
  if (existingUserApps !== undefined) {
    const existingVersion = existingUserApps.get(manifest.id);
    if (existingVersion !== undefined) {
      updateTarget = {
        existingVersion,
        newVersion: manifest.version,
        comparison: compareSemver(manifest.version, existingVersion),
      };
    }
  }

  return { ok: true, app: { manifest, htmlContent }, updateTarget };
}

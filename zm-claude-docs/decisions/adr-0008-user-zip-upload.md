---
number: "0008"
title: POC v1 사용자 ZIP 앱 업로드 모델 (JSZip + 단일 HTML + 보안 검증)
status: accepted
date: 2026-05-24
author: hanumoka
related: ["0001", "0006", "0007"]
---

# ADR-0008: POC v1 사용자 ZIP 앱 업로드 모델

## Context

PRD §1.2 몽상 5번에서 정의한 POC 비전: **"사용자가 만든 JavaScript 앱(특히 게임)을 공유 스토어에 올려 다른 사용자가 자기 브라우저에 설치·실행"**.

이 ADR은 ADR-0006 데스크탑 카탈로그의 v2 reshape 경로 중 첫 번째 단계인 **사용자 source (app-02)** 도입을 다룬다. 

Phase 3 작업 1에서 완성:
- **ZIP 해석**: `zip-loader.ts` 로직 (magic byte + 압축비 + 필수 파일)
- **메타데이터**: manifest.json 스키마 + index.html 단일 체크
- **저장소**: IndexedDB STORE_USER_APPS (DB_VERSION 2) + UserAppRecord 모델
- **UI**: AppUploadButton + 사용자 UI 흐름
- **카탈로그 통합**: buildCatalog(userApps) — built-in + user 병합

## Decision

### 1. ZIP 포맷 및 파서 선택

**ZIP 파서 = JSZip 3.10.1** (MIT, 27.6KB gzip)

**근거**:
- 순수 JavaScript (번들 오버헤드 최소)
- 광범위한 테스트 (npm 주간 200만 다운로드)
- CVE-2022-48285 (path traversal) 해소됨 (v3.8.0+)
- TypeScript 지원 + 용이한 통합

**대안 검토**:
- **fflate**: 더 작은 번들 (11.3KB brotli)이나 API 친숙도 낮음 → 기각
- **native ReadableStream**: 브라우저 호환성 불완전 (Safari, Firefox) → 기각

### 2. ZIP 콘텐츠 모델

```
user-app.zip
├── manifest.json      (필수, root 레벨)
└── index.html         (필수, root 레벨)
```

**규칙**:
- **필수 파일**: manifest.json + index.html만 존재
- **자원 처리**: POC v1에서는 사용자가 모든 코드를 index.html에 inline (CSS + JS)
  - v2에서 reshape: 별도 자원(image, CSS, JS) 지원 계획
- **기타 파일**: 무시 (ZIP에 포함되어도 로드 안 함)

**근거**:
- iframe srcdoc 모델: base64 데이터 인코딩 → 요청/응답 오버헤드 0
- 단일 HTML: 브라우저 샌드박스 내에서 CORS 회피 → 게임 엔진 호환성 최대화

### 3. 보안 검증 절차 (6단계)

사용자 업로드 ZIP은 다음 순서로 검증:

| 순서 | 항목 | 기준 | 실패 | 참조 |
|------|------|------|------|------|
| 1 | **Magic byte** | 첫 4바이트 = `0x50 0x4B 0x03 0x04` \| `0x05 0x06` \| `0x07 0x08` | 거부 | `zip-loader.ts:validateMagicByte` |
| 2 | **ZIP 크기** | ≤ 10MB | 초과 시 거부 | `MAX_ZIP_BYTES = 10_485_760` |
| 3 | **JSZip 파싱** | JSZip.loadAsync (비동기) | 파싱 실패 | `zip-loader.ts:parseZip` |
| 4 | **Path traversal** | 각 파일명: 부모 경로(`..`) + 절대 경로(`/`, `C:\`) + 백슬래시 거부 | 침범 시 거부 | `zip-loader.ts:validateNoPathTraversal` |
| 5 | **ZIP bomb (압축비)** | 각 entry: `compressed > 0 && uncompressed / compressed > 1000` 거부 | 1000:1 초과 | `MAX_COMPRESSION_RATIO = 1000` |
| 6 | **필수 파일 + 크기** | root `manifest.json` + root `index.html` 존재 + HTML ≤ 5MB (UTF-8 바이트) | 부재/초과 시 거부 | `MAX_HTML_BYTES = 5_242_880` |

### 4. 매니페스트 검증

```typescript
// Zod schema (src/lib/apps/manifest.ts 기존 parseManifest 재활용)
type ParsedManifest = {
  id: string;          // /^[a-z0-9_-]{3,32}$/ regex
  name: string;
  version: string;     // semver (e.g. "1.0.0")
  description?: string;
  author?: string;
  // ... (category, screenshots는 stored 없음 — inline HTML에만 해당)
}
```

**검증**:
- Zod 스키마 파싱 (기존 parseManifest 호출)
- id regex: `[a-z0-9_-]{3,32}` (숫자/소문자/대시/언더스코어만)
- semver: 정확한 형식 (2.0.0, 1.2.3-alpha 등)

### 5. ID 중복 차단

```typescript
const reservedIds = [
  ...builtInAppIds,        // 'bouncing-ball', 'ipc-demo', 'snake-game'
  ...existingUserAppIds,   // IndexedDB STORE_USER_APPS의 설치 ID
];

if (reservedIds.includes(newApp.id)) {
  throw new DuplicateAppIdError(newApp.id);
}
```

### 6. 저장소 모델 (IndexedDB DB_VERSION 2)

```typescript
// STORE_USER_APPS (신규 store)
type UserAppRecord = {
  // Primary key
  id: string;

  // 필수 필드
  manifest: ParsedManifest;
  htmlContent: string;        // index.html 원본 (UTF-8)
  htmlSize: number;           // 바이트 단위
  installedAt: Date;

  // 메타
  sourceZipSize: number;      // 원본 ZIP 바이트
  zipChecksum?: string;       // CRC32 또는 SHA256 (선택, v2 dedup)
};
```

### 7. 카탈로그 통합

```typescript
// src/components/desktop/desktopApps.ts
type CatalogEntry = DesktopAppEntry & {
  source: 'built-in' | 'user';  // ADR-0006 확장
};

function buildCatalog(
  builtInApps: DesktopAppEntry[],
  userApps: UserAppRecord[],
): CatalogEntry[] {
  return [
    ...builtInApps.map(a => ({ ...a, source: 'built-in' })),
    ...userApps.map(a => ({ ...a, source: 'user' })),
  ];
}
```

### 8. iframe 로드 모델 (srcdoc 유지)

```typescript
// src/components/desktop/AppFrame.tsx
function AppFrame({ entry }: { entry: CatalogEntry }) {
  const iframeContent = 
    entry.source === 'built-in'
      ? getBuiltinSrcdoc(entry.id)              // 기존 로직
      : entry.htmlContent;                       // User ZIP의 index.html

  return (
    <iframe
      srcDoc={iframeContent}
      sandbox="allow-scripts"
      // ...
    />
  );
}
```

## Consequences

### Positive

1. **POC 비전 핵심 달성**: 사용자 APP-02 (게임 저작자가 ZIP 업로드 → 다른 사용자 설치 실행) 검증 완료
2. **백엔드 의존도 0**: 클라이언트 IDB만으로 전체 흐름 가능
3. **기존 sandbox 무변경**: ADR-0001 iframe + Comlink 인터페이스 그대로 활용
4. **v2 reshape 용이**: UserAppRecord 구조가 STR 백엔드(클라우드 동기화)로 마이그레이션 용이하도록 설계
5. **게임 엔진 호환성**: srcdoc + null origin 유지 → Phaser/Pixi/Three.js 모두 동작

### Negative

1. **자원 처리 부재**: POC v1에서는 사용자가 모든 코드를 index.html에 inline
   - 이미지/CSS/JS 분리 불가 (v2에서 ZIP 자원 처리 추가 필요)
   - 게임 대용량 에셋 처리 불가 (크기 제한 5MB)

2. **JSZip _data private API 의존**: JSZip 내부 `file()._data` 속성 접근
   - N-07 위협 등록: 버전 업데이트 시 API 변경 가능
   - 완화: dependabot 규칙 + 월 1회 관찰 권장

3. **중복 설치 차단**: 같은 ID로 재설치 불가 (설치 삭제 후 재설치만 가능)
   - UX: uninstall → install 2 액션 (v2에서 "업데이트" 아이콘 분리 가능)

4. **성능**: 첫 로드 시 JSON/HTML 파싱 + IDB write 지연 (100~500ms)
   - 영향: 사용자가 체감하는 설치 완료 시간 (프로그레스 바 표시 권장)

## Alternatives Considered

### A. Blob URL 저장 (거부)
```typescript
// ZIP 원본을 Blob으로 IDB 저장 → 매번 unzip
const blob = new Blob([zipArrayBuffer], { type: 'application/zip' });
const blobUrl = URL.createObjectURL(blob);
// 이후 JSZip.loadAsync(blobUrl)
```
**기각 사유**:
- null origin 깨짐: blob: URL이 아닌 다른 origin에서 접근 불가
- 매번 unzip 부담: 게임 시작할 때마다 해석 (100~300ms)

### B. 전체 ZIP IDB Blob 저장 (거부)
```typescript
// { id, zipBlob }만 저장 → 매번 로드 시 unzip
```
**기각 사유**:
- 성능 동일 (매번 unzip)
- 스토리지 효율성 없음 (압축 해제된 HTML이 더 작을 수 있음)

### C. manifest.json만 필수 (거부)
```typescript
// ZIP 내용: manifest.json + 임의의 파일들
// 자원: POST endpoint로 별도 업로드 → v2 클라우드 스토리지
```
**기각 사유**:
- 백엔드 도입 → POC 범위 확대
- 두 번의 업로드 (UX 복잡도 증가)

## References

### Code References
- **zip-loader.ts**: `src/lib/apps/zip-loader.ts` (320 LOC, 신규)
- **user-apps.ts**: `src/lib/apps/user-apps.ts` (61 LOC, 신규)
- **UserAppsProvider.tsx**: `src/components/store/UserAppsProvider.tsx` (155 LOC, 신규)
- **AppUploadButton.tsx**: `src/components/store/AppUploadButton.tsx` (152 LOC, 신규)
- **indexeddb.ts**: `src/lib/storage/indexeddb.ts` (DB_VERSION 2 추가)
- **desktopApps.ts**: `src/components/desktop/desktopApps.ts` (buildCatalog + user source)
- **AppFrame.tsx**: `src/components/desktop/AppFrame.tsx` (source 분기)
- **Desktop.tsx**: `src/components/desktop/Desktop.tsx` (buildCatalog 호출)

### Documentation References
- **PRD**: `zm-claude-docs/project/prd.md` §1.2 (POC 비전) + §3 (APP-02)
- **ADR-0006**: 데스크탑 카탈로그 (v2 reshape 경로)
- **ADR-0007**: IndexedDB 저수준 추상화
- **security.md**: "사용자 제출 ZIP 수신 절차" 신설

### Research References
- **JSZip CVE-2022-48285**: https://github.com/Stuk/jszip/issues/916 (path traversal, v3.8.0+ 해결)
- **zip-bomb 압축비 기준**: 1000:1 = OWASP 표준 (RFC 8091 참고)
- **이치.io ZIP 포맷**: https://itch.io/docs/itch/electron-app-manifest (참고만)

### Compliance References
- **ARCH-02** (iframe sandbox): 사용자 ZIP 앱도 동일한 sandbox="allow-scripts" + null origin
- **TECH-01** (IndexedDB): STORE_USER_APPS 도메인 저장소 모델
- **PROD-02** (카탈로그): user source 추가로 ADR-0006 reshape

### Security Audit References
- **Phase 3 앱-샌드박스-감사**: `zm-claude-docs/security/phase-3-app02-audit-2026-05-24.md` (신규)
  - N-05: JSZip private API 의존
  - N-06: HTML 크기 임계치 (5MB) 설정의 정당성
  - N-07: ZIP bomb 압축비 검증 로직 정확성

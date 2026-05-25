---
paths:
  - "src/lib/apps/**"
  - "src/components/desktop/**"
  - "next.config.ts"
  - "src/app/api/**"
---

# 보안 규칙 (가상 데스크탑 + 사용자 제출 앱 샌드박싱)

## iframe 샌드박스 정책 (도메인 핵심)

- 사용자 제출 앱은 **반드시 sandbox 속성을 가진 iframe** 안에서만 실행
- **허용 sandbox 토큰**: `allow-scripts` (최소 필요)
- **금지 sandbox 토큰**:
  - `allow-same-origin` — host와 origin 격리 깨짐
  - `allow-top-navigation` — 호스트 페이지 탈취 가능
  - `allow-popups-to-escape-sandbox` — sandbox 우회 가능
- iframe `src`는 **blob: URL 또는 srcdoc** 사용 (호스트 origin과 분리)
- iframe은 격리된 origin(null 또는 blob:)에서만 실행됨을 보장

## postMessage 통신 정책

- 호스트-앱 RPC는 `src/lib/apps/ipc/` 의 Comlink 기반 어댑터만 사용
- raw `postMessage` 직접 호출 금지 (Comlink 안에 캡슐화)
- `addEventListener('message', ...)` 핸들러는 **반드시 `event.origin` 검증**
  - 와일드카드 수신 금지
  - 알려진 origin 화이트리스트와 비교
- 수신한 데이터는 신뢰하지 않음 (Zod 등으로 스키마 검증)

## CSP / Permissions-Policy / 헤더

`next.config.ts`의 `headers()`에서 명시:
- **Content-Security-Policy**: 인라인 스크립트 금지, `script-src 'self'` 기본 + 게임 iframe만 blob: 허용
- **Permissions-Policy**: 사용자 앱에 카메라/마이크/지오로케이션/USB 등 차단 (필요 시 명시적 grant 메커니즘)
- **COEP/COOP**는 신중히 도입 — `Cross-Origin-Embedder-Policy: require-corp` + `Cross-Origin-Opener-Policy: same-origin`을 강제하면 SharedArrayBuffer가 활성화되지만, sandbox iframe과 외부 자산 호환성에 영향. 게임 엔진별로 테스트 후 도입.

## 스토리지 격리

- 사용자 제출 앱은 호스트의 IndexedDB/OPFS/localStorage에 접근 불가능해야 함
  - sandbox iframe의 origin이 분리되므로 same-origin policy로 자동 격리
  - 검증: iframe에서 `window.parent.localStorage` 접근이 실패하는지 테스트
- 호스트 측 사용자 데이터(설치 앱 목록, 데스크탑 설정)는 host origin storage에서만 관리

## 리소스 고갈 방어

- 무한 루프 방어: iframe 단위로 **soft timeout** (예: 60초 비활성 시 사용자에게 종료 옵션)
- 메모리 quota: `navigator.storage.estimate()`로 모니터링, 임계치 초과 시 알림
- localStorage 5MB 한도: 사용자 앱은 IndexedDB/OPFS만 사용하도록 가이드

## 사용자 제출 ZIP 수신 절차 (APP-02)

사용자가 `<input type="file">`로 업로드한 ZIP은 다음 순서로 검증:

### 검증 단계 (순차, 모두 통과해야 함)

1. **Magic byte 검증** (첫 4바이트)
   - 허용 값: `0x50 0x4B 0x03 0x04` (local file header)
   - 또는: `0x50 0x4B 0x05 0x06` (central directory end)
   - 또는: `0x50 0x4B 0x07 0x08` (data descriptor)
   - 위반 시: 즉시 거부 ("올바른 ZIP 파일이 아닙니다")

2. **크기 한도**
   - ZIP ≤ 10MB (= `MAX_ZIP_BYTES = 10_485_760`)
   - 초과 시: 거부 ("파일이 너무 큽니다")

3. **JSZip 파싱**
   - `JSZip.loadAsync(file)` 비동기 호출
   - 실패 시: 거부 ("ZIP 파일 읽기 실패")

4. **Path traversal 차단** (각 파일 entry)
   - 파일명에 `..` 포함 → 거부
   - 파일명이 `/`로 시작 (절대 경로) → 거부
   - 파일명에 `\` 포함 (Windows 경로) → 거부
   - 위반 시: 거부 ("보안: 경로 순회 감지")

5. **ZIP bomb 방어 (압축비 검증)**
   - 각 entry마다: `compressed > 0 && uncompressed / compressed > MAX_COMPRESSION_RATIO` 확인
   - `MAX_COMPRESSION_RATIO = 1000` (OWASP 표준)
   - 위반 시: 거부 ("보안: 비정상적인 압축률")

6. **필수 파일 확인**
   - root 레벨에 `manifest.json` 존재 여부
   - root 레벨에 `index.html` 존재 여부
   - 부재 시: 거부 ("필수 파일 누락")

7. **HTML 크기 한도**
   - index.html의 UTF-8 바이트 크기 ≤ 5MB (= `MAX_HTML_BYTES = 5_242_880`)
   - 초과 시: 거부 ("HTML 파일이 너무 큽니다")

8. **매니페스트 Zod 검증**
   - `manifest.json` 콘텐츠를 `parseManifest(content)` 호출
   - 실패 시: 거부 ("매니페스트 형식 오류")

9. **ID 중복 검사 (APP-04 이원화)**
   - `manifest.id`가 `reservedIds` (built-in 앱만) 에 존재하면: 거부 ("시스템 앱과 충돌")
   - `manifest.id`가 `existingUserApps`에 존재하면: 업데이트 감지 (ok: true + updateTarget 반환)
   - 양쪽 모두 없으면: 신규 앱 (ok: true + updateTarget: null)

10. **저장** (위 모든 검증 통과 시)
    - UserAppRecord = { id, manifest, htmlContent, installedAt, sourceZipSize, htmlSize }
    - IndexedDB STORE_USER_APPS에 put

### 임계치 상수 (SSOT: src/lib/apps/zip-loader.ts)

```typescript
const MAX_ZIP_BYTES = 10_485_760;           // 10MB
const MAX_HTML_BYTES = 5_242_880;           // 5MB (UTF-8 바이트)
const MAX_COMPRESSION_RATIO = 1000;         // ZIP bomb 기준 (OWASP)
const MAGIC_BYTES = [
  0x50, 0x4B, 0x03, 0x04,  // Local file header
  0x50, 0x4B, 0x05, 0x06,  // Central directory end
  0x50, 0x4B, 0x07, 0x08,  // Data descriptor
];
```

### 보안 근거

- **Magic byte**: 파일 헤더로 위조 방지
- **크기 한도**: IDB 저장소 quota 관리 + 메모리 오버헤드 제한
- **Path traversal**: ZIP 자원 접근 시 상위 디렉토리 이탈 방지
- **압축비**: ZIP bomb (무한 압축 루프) 방어
- **필수 파일**: POC v1 단일 HTML 모델 강제
- **매니페스트 검증**: id/version/name 형식 일관성

## 추적 대상 CVE + 내부 위협

### CVE
- **CVE-2024-5691** (Firefox): iframe sandbox 우회 가능성
- **CVE-2025-4609** (Chromium): IPC 취약점
- **CVE-2025-54143** (Firefox iOS): 다운로드 권한 우회
- **CVE-2022-48285** (JSZip): Path traversal — v3.8.0+에서 수정됨 (현재 3.10.1 채택)

### 내부 위협 (N-NNN)
- **N-08** (postMessage DoS): ✅ 해결 — rate limiter 도입
  - **현상** (Phase 3 작업 2): sandbox iframe에서 parent로 postMessage 폭주 → host 전부 수신
  - **대응**: `src/lib/apps/ipc/rate-limiter.ts` — 고정 윈도우 카운터 + 벌칙 쿨다운 (60건/초, penalty 2초)
  - **INIT 핸드셰이크 제외** (앱 시작 보장), `onRateLimitExceeded` 콜백으로 확장 가능
  - **ADR**: ADR-0010

신규 CVE는 정기 점검 필요 (브라우저 보안 공지 모니터링). JSZip 의존성 변경 시 CVE 기록 검토 의무.

## 코드 리뷰 체크리스트 (app-sandbox-auditor agent와 연동)

- [ ] iframe sandbox 속성 화이트리스트 (`allow-scripts`만)
- [ ] `allow-same-origin` 사용 0건
- [ ] postMessage 수신자에서 `event.origin` 검증
- [ ] 호스트 origin storage 접근을 사용자 앱이 시도하지 못함
- [ ] CSP 헤더에 unsafe-inline / unsafe-eval 없음
- [ ] 호스트-앱 RPC가 Comlink 어댑터 경유

## 자주 발생하는 위반

- (현재 없음 — 추후 반복 발견 시 여기에 추가)

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

## 추적 대상 CVE

- **CVE-2024-5691** (Firefox): iframe sandbox 우회 가능성
- **CVE-2025-4609** (Chromium): IPC 취약점
- **CVE-2025-54143** (Firefox iOS): 다운로드 권한 우회

신규 CVE는 정기 점검 필요 (브라우저 보안 공지 모니터링).

## 코드 리뷰 체크리스트 (app-sandbox-auditor agent와 연동)

- [ ] iframe sandbox 속성 화이트리스트 (`allow-scripts`만)
- [ ] `allow-same-origin` 사용 0건
- [ ] postMessage 수신자에서 `event.origin` 검증
- [ ] 호스트 origin storage 접근을 사용자 앱이 시도하지 못함
- [ ] CSP 헤더에 unsafe-inline / unsafe-eval 없음
- [ ] 호스트-앱 RPC가 Comlink 어댑터 경유

## 자주 발생하는 위반

- (현재 없음 — 추후 반복 발견 시 여기에 추가)

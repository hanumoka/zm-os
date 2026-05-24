# Product Requirements Document (PRD)

> **Living Document**. 기능 완료 시 즉시 갱신. 버전 bump 필수.

**Version**: 0.1.0
**Last Updated**: 2026-05-24
**Status**: Phase 0 — 초기 셋팅

---

## §1. 비전

### §1.1 한 줄 정의
zm-os는 **브라우저 안에서 동작하는 가상 데스크탑** 으로, 사용자가 직접 만든 JavaScript 앱(특히 게임)을 **공유 스토어** 에 올려 다른 사용자가 자기 브라우저에 설치·실행할 수 있게 한다.

### §1.2 궁극적 비전 (몽상)
1. 브라우저를 가상 데스크탑처럼 사용
2. 가상 데스크탑/가상 OS를 브라우저에서 구현
3. 사용자 계정 + 어디서나 본인 OS 접근
4. Windows Store 식 공유 앱 마켓플레이스 (사용자 제작 앱)
5. **POC 1차 (현재)**: JS 게임 업로드/공유/설치/플레이

---

## §2. POC 1차 스코프 (확정, 2026-05-24)

### In Scope
- ✅ 가상 데스크탑 UI (윈도우 매니저, 데스크탑 영역, 작업표시줄)
- ✅ 앱 스토어 UI (목록, 상세, 설치 버튼)
- ✅ 앱 매니페스트 명세 (이름, 버전, entryPoint, 권한)
- ✅ iframe 샌드박싱 (blob: URL + `sandbox="allow-scripts"`)
- ✅ Comlink 기반 호스트-앱 IPC
- ✅ 클라이언트 스토리지 (IndexedDB 폴백 + OPFS)
- ✅ 첫 샘플 게임 1개 (Phaser 또는 Pixi)
- ✅ 로컬 dev 서버에서 동작 (`npm run dev`)

### Out of Scope (POC 1차)
- ❌ 사용자 인증, 로그인
- ❌ 클라우드 동기화 (서버 측 스토리지)
- ❌ 멀티유저, 공유 스토어 백엔드
- ❌ 결제, 모더레이션, DMCA
- ❌ 모바일 최적화
- ❌ Electron 패키징
- ❌ 프로덕션 배포

---

## §3. 기능 인벤토리 (Feature ID 규칙: DSK / STR / APP / SBX / IPC / STG)

| ID | 이름 | 상태 | 비고 |
|----|------|------|------|
| **DSK-01** | 윈도우 매니저 (드래그/리사이즈/포커스) | ⏳ 계획 | react-rnd or dnd-kit |
| **DSK-02** | 데스크탑 영역 + 아이콘 | ⏳ 계획 | |
| **DSK-03** | 작업표시줄 (실행 중 앱) | ⏳ 계획 | |
| **STR-01** | 앱 카탈로그 UI | ⏳ 계획 | |
| **STR-02** | 앱 상세 페이지 + 설치 | ⏳ 계획 | |
| **APP-01** | 앱 매니페스트 스키마 (Zod) | ⏳ 계획 | |
| **APP-02** | 앱 패키지 포맷 (itch.io식 ZIP) | ⏳ 계획 | |
| **APP-03** | 설치한 앱 목록 관리 | ⏳ 계획 | IndexedDB |
| **SBX-01** | blob: URL iframe 샌드박스 SDK | ⏳ 계획 | sandbox="allow-scripts" |
| **SBX-02** | CSP/Permissions-Policy 헤더 | ⏳ 계획 | |
| **IPC-01** | Comlink 기반 RPC 어댑터 | ⏳ 계획 | postMessage origin 검증 |
| **STG-01** | IndexedDB 추상화 | ⏳ 계획 | |
| **STG-02** | OPFS 어댑터 (Chrome/Edge) | ⏳ 계획 | Safari는 IndexedDB 폴백 |
| **GAME-01** | 첫 샘플 게임 (Phaser 또는 Pixi) | ⏳ 계획 | 시연용 |

---

## §4. v2 후보 (멀티유저 + 클라우드)

- 사용자 인증 (Clerk 또는 Supabase Auth)
- 클라우드 스토리지 (Cloudflare R2 또는 Supabase Storage)
- 데스크탑 상태 클라우드 동기화 (CRDT or last-write-wins)
- 앱 스토어 백엔드 (Postgres + RLS, 업로드 + 모더레이션)
- 멀티디바이스 동기화

상세 후보 스택: [`research/multitenant-stack-options.md`](../research/multitenant-stack-options.md)

---

## §5. v3 후보 (몽상 1~4번 본격)

- 진정한 "가상 OS" (v86/WebVM 식)
- 앱 간 IPC 프레임워크
- 파일 시스템 추상화 (가상 FS or 클라우드 통합)
- 권한 모델 세분화 (camera/mic/geolocation grant flow)

---

## §6. 명시적 비목표 (영구)

- 실제 OS 부팅 (v86은 영감만, 성능 문제로 부적합)
- Cryptocurrency mining 앱 호스팅 (모더레이션 정책)
- Adult content (모더레이션 정책)

---

## §7. 수용 기준 (POC 1차)

POC 완료 = 아래 시나리오가 동작:
1. 사용자가 데스크탑 화면을 본다
2. "스토어"에서 게임 1개를 선택한다
3. 설치 버튼 → 데스크탑에 아이콘 생성
4. 아이콘 클릭 → 윈도우가 열리고 게임이 실행됨
5. 게임이 iframe sandbox 안에서 안전하게 실행됨 (개발자 도구로 검증)
6. 게임 종료 → 윈도우 닫기 → 다시 실행 가능

---

## §8. Change Log

### 0.1.0 (2026-05-24)
- 초기 PRD 작성 (Phase 0 초기 셋팅 단계)
- POC 1차 스코프 확정
- 기능 인벤토리 14개 등재

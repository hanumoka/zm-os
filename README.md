# zm-os

브라우저 안에서 동작하는 **가상 데스크탑 + 공유 앱 스토어** POC.
사용자가 만든 JavaScript 앱(특히 게임)을 스토어에 올려 공유 · 설치 · 실행한다.

> **상태**: POC 종료 · v2 구현 중 (REFAC-02 P3 완료 → 다음 P4). 최종 갱신 2026-08-04
> **궁극 비전**: 사용자 OS · 멀티유저 · 공유 마켓플레이스 (몽상 1~4)
> **POC 1차**: JS 게임 스토어 + 단일 사용자 (몽상 5)

---

## Quick Start

```bash
# 의존성 설치
pnpm install

# 개발 서버 (http://localhost:3000)
pnpm --filter @zm/web dev

# 전체 검증 (타입·테스트·린트)
pnpm turbo type-check test lint

# 프로덕션 빌드
pnpm turbo build
```

---

## 기술 스택

- **풀스택**: Next.js 16 (App Router) + React 19 + Tailwind CSS v4
- **언어**: TypeScript strict
- **클라이언트 스토리지**: IndexedDB + OPFS
- **앱 샌드박싱**: blob: URL iframe + `sandbox="allow-scripts"` + Comlink IPC
- **앱 패키지**: itch.io식 ZIP (`index.html` + 에셋 + Zod 매니페스트)

---

## 디렉토리 구조

pnpm + Turborepo 모노레포다 (SRV-00, 2026-05-26).

```
zm-os/
├── apps/web/             # Next.js 앱 (App Router)
│   ├── src/app/          # 페이지 + route handlers
│   ├── src/components/   # desktop / store / ui
│   ├── src/lib/          # apps(샌드박싱) / storage / security
│   ├── e2e/              # Playwright 진단 스크립트
│   └── public/           # 정적 자산 + 게임 엔진
├── packages/
│   ├── core/             # Port 인터페이스 SSOT + namespace 레지스트리 + capability
│   ├── ipc/              # 호스트-앱 RPC (Comlink 와이어 호환 자체 구현)
│   ├── adapters-local/   # Local 어댑터 (BlobStorage / AppRepository)
│   └── storage/          # deprecation shell — ADR-0020 §D5, P5에서 삭제
├── docs/                 # 번호 기반 문서 (01-architecture ~ 13-troubleshooting)
├── eslint.config.mjs     # 금지 규칙 기계 검사
├── CLAUDE.md             # Claude Code 지침
└── README.md             # 이 파일
```

---

## 문서

- **PRD**: [`docs/04-planning/01-prd.md`](docs/04-planning/01-prd.md)
- **로드맵**: [`docs/04-planning/02-roadmap.md`](docs/04-planning/02-roadmap.md)
- **Feature Map**: [`docs/01-architecture/05-feature-map.md`](docs/01-architecture/05-feature-map.md)
- **ADR 인덱스**: [`docs/02-decisions/index.md`](docs/02-decisions/index.md)
- **외부 리서치**: [`docs/05-analysis/`](docs/05-analysis/) — 브라우저 OS 비교 / 샌드박싱 기법 / 멀티테넌트 백엔드 옵션
- **Claude Code 지침**: [`CLAUDE.md`](CLAUDE.md)

---

## POC 1차 데모 시나리오 (목표)

1. 사용자가 데스크탑 화면을 본다.
2. "스토어"에서 게임 1개를 선택한다.
3. 설치 → 데스크탑에 아이콘 생성.
4. 아이콘 클릭 → 윈도우가 열리고 게임 실행 (iframe sandbox 안에서).
5. 종료 → 다시 실행 가능.

---

## 보안 (도메인 핵심)

사용자 제출 앱은 **반드시 `srcdoc` iframe + `sandbox="allow-scripts"`** 안에서만 실행한다. `allow-same-origin`은 절대 금지.
`blob:` URL은 쓰지 않는다 — 최상위 탭으로 열리면 호스트 origin 권한으로 실행되는 탈출 경로가 있다.
호스트-앱 통신은 **Comlink 와이어 호환 자체 구현**(`packages/ipc`)만 사용한다. raw `postMessage`는 린트가 차단한다.

상세: [`.claude/rules/security.md`](.claude/rules/security.md) | [`docs/05-analysis/02-sandboxing-untrusted-js.md`](docs/05-analysis/02-sandboxing-untrusted-js.md)

---

## 라이선스

미정. 공개 저장소에 라이선스가 없으면 기본값은 전권 유보이며 제3자는 아무 권리도 갖지 못한다.
외부 기여를 한 건이라도 받으면 사후 지정이 어려워지므로 그 전에 정해야 한다.

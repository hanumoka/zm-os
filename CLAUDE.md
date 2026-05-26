@.claude/memory/MEMORY.md

# CLAUDE.md — zm-os 프로젝트 지침서

> **Claude Code를 위한 zm-os 프로젝트 가이드**
> **최종 업데이트**: 2026-05-24

---

## 📋 1. 프로젝트 개요

**zm-os**는 **브라우저 안에서 동작하는 가상 데스크탑** 으로, 사용자가 만든 JavaScript 앱(특히 게임)을 공유 스토어에 올려 다른 사용자가 자기 브라우저에 설치·실행할 수 있게 한다.

**POC 1차 스코프** (몽상 5번):
- 게임 스토어 + 단일 사용자 데스크탑
- blob: URL iframe + `sandbox="allow-scripts"` + Comlink IPC
- IndexedDB / OPFS 클라이언트 스토리지
- 로컬 dev 서버 동작
- 멀티유저는 v2, 가상 OS는 v3

상세: [`docs/04-planning/01-prd.md`](docs/04-planning/01-prd.md) | [`docs/04-planning/02-roadmap.md`](docs/04-planning/02-roadmap.md)

---

## 🛠️ 2. 작업 방식

> Claude Code 자율 개발 → 사용자 리뷰. 커밋은 사용자 요청 시만.

1. **효율성 우선**: 빠른 POC 검증
2. **코드 품질**: TypeScript strict, any 금지, 함수 반환 타입 명시
3. **문서화**: 중요 결정 즉시 ADR/PRD/policy-registry 반영
4. **점진적 개발**: 기능 단위 커밋, 동작 확인 후 다음 진행
5. **정책 질문 의무**: 정책 판단 지점에서 사용자 결정 받기 (work-units.md 참조)

---

## 📊 3. 진행상황 추적

| 문서 | 용도 |
|------|------|
| [docs/10-session/quick-ref.md](docs/10-session/quick-ref.md) | 1페이지 컨텍스트 (세션 시작 시 필독) |
| [docs/10-session/current-phase.md](docs/10-session/current-phase.md) | 현재 Phase 상세 |
| [docs/11-archive/](docs/11-archive/) | 월별 작업 로그 |

### 세션 재시작 자동 프로세스
`session_start.py` 훅이 quick-ref + current-phase + git 상태를 자동 로드.
보완은 `/zm-session` 슬래시 커맨드.

### 진행상황 업데이트 규칙
- 작업 시작: 🔄 진행 중 / 완료: ✅ 완료 / 대기: ⏳ 대기
- 블로커: 즉시 기록 | 중요 결정: 근거 + ADR 번호 명시

---

## 🏗️ 4. 코드 구조

```
zm-os/                                # 모노레포 루트 (ADR-0016)
├── apps/
│   └── web/                          # Next.js 16 풀스택 (@zm/web)
│       ├── src/
│       │   ├── app/                  # 페이지/route handlers
│       │   │   ├── (desktop)/        # 가상 데스크탑 메인
│       │   │   ├── store/            # 앱 스토어
│       │   │   └── api/              # route handlers
│       │   ├── components/
│       │   │   ├── desktop/          # 윈도우 매니저, 아이콘, 작업표시줄
│       │   │   ├── store/            # 스토어 UI
│       │   │   └── ui/               # shadcn/ui 기본 (도입 시)
│       │   └── lib/
│       │       ├── apps/             # zip-loader, validators, sandbox, content-loader
│       │       ├── errors/           # PersistenceErrorContext (React)
│       │       ├── security/         # CSP / Permissions-Policy
│       │       └── storage/          # 도메인 wrapper + use-persistence
│       ├── public/                   # 정적 자산
│       ├── e2e/                      # Playwright e2e
│       ├── next.config.ts
│       ├── package.json
│       └── tsconfig.json
├── packages/
│   ├── core/                         # @zm/core: 순수 타입/유틸 (manifest, version, namespace-registry, errors)
│   ├── storage/                      # @zm/storage: StorageAdapter Strategy (IDB/OPFS/Memory + cloud-adapter v2)
│   └── ipc/                          # @zm/ipc: Comlink wire-compatible RPC
├── docs/                             # 프로젝트 문서 (번호 기반 카테고리 구조)
├── pnpm-workspace.yaml               # pnpm workspaces 설정
├── turbo.json                        # Turborepo 태스크 그래프
├── package.json                      # 루트 (turbo)
└── .claude/                          # Claude Code 셋팅 (agents/skills/rules/memory/hooks)
```

---

## 💻 5. 기술 스택

| 영역 | 핵심 |
|------|------|
| **FE/풀스택** | Next.js 16 (App Router), React 19, Tailwind CSS v4 |
| **언어** | TypeScript strict |
| **클라이언트 스토리지** | IndexedDB (폴백) + OPFS (Chrome/Edge) |
| **앱 샌드박싱** | blob: URL iframe + `sandbox="allow-scripts"` |
| **호스트-앱 IPC** | Comlink (postMessage 추상화) |
| **앱 패키지** | itch.io식 ZIP + Zod 매니페스트 |
| **게임 엔진 타겟** | Phaser, Pixi, Three.js (Godot/Unity는 v2 검토) |
| **배포** | 로컬 dev 서버만 (POC). v2에서 Vercel. |

---

## 🎯 6. 개발 우선순위

> 3대 원칙: **설계 안정성/유연성/확장성** > **보안 / 격리** > **개발 속도**

상세: [`docs/04-planning/02-roadmap.md`](docs/04-planning/02-roadmap.md)
정책 SSOT: [`docs/03-policy/01-policy-registry.md`](docs/03-policy/01-policy-registry.md)

---

## 🔧 7. Git 관리

```
<type>(<scope>): <subject>

<body> (선택)

Co-Authored-By: Claude Opus 4.7 (1M context) <noreply@anthropic.com>
```

**Type**: feat, fix, refactor, docs, test, chore
**Scope**: desktop, store, apps, sandbox, ipc, storage, docs, infra, setup

**SSH**: 개인 계정 (`github-personal` host alias) 사용. 자세히는 글로벌 메모리 참조.
**금지**: main/master force push (mistake_guard.py가 자동 차단), `--amend` (새 커밋 생성), `git add -A` (개별 파일 지정)

---

## 🎨 8. 코딩 스타일

> 상세 규칙 → `.claude/rules/frontend.md`, `.claude/rules/security.md`, `.claude/rules/work-units.md`

- `"strict": true` 필수, **any 금지**
- 함수 반환 타입 명시
- 인라인 스타일 금지 (Tailwind v4 클래스 사용)
- raw fetch 금지 (`src/lib/api/` 경유)
- raw `postMessage` 금지 (`src/lib/apps/ipc/` Comlink 어댑터 경유)
- `'use client'`는 필요한 컴포넌트에만 (서버 컴포넌트 기본)
- `window` / `document` / `localStorage` 접근은 `useEffect` 내부에서만 (SSR 안전)

---

## 🤖 9. 에이전트 (13명 팀, 2단계 검증 파이프라인)

> 상세 위임 규칙 → `.claude/agents/` / 표준 작업 흐름 → `.claude/agents/_workflow.md`

**설계** (3):
- **architect** (opus, 20t): **필수 게이트**. 인터페이스/모듈 경계/확장 포인트/ADR 초안. 모든 작업의 첫 호출.
- **research-analyst** (sonnet, 15t): 외부 사실 확인 전담. 모든 주장에 출처 URL 필수.
- **design-reviewer** (opus, 15t): **필수 게이트**. 구현↔설계 적합성 검증. BLOCK 권한. SOLID/확장성 검증.

**구현** (2):
- **lib-developer** (sonnet, 25t): `src/lib/` 추상화 계층 (apps/storage/api).
- **fe-developer** (sonnet, 25t): `src/app/` + `src/components/` UI.

**1차 검증** (4, 병렬):
- **build-checker** (haiku, 5t): tsc + 변경 파일 신규 에러 우선.
- **code-reviewer** (sonnet, 15t, project memory): TS/SSR/패턴 + **SOLID/확장성** + 학습 누적.
- **app-sandbox-auditor** (sonnet, 15t): iframe/CSP/postMessage/CVE 8 항목 매트릭스.
- **constraint-checker** (haiku, 8t): rules + policy-registry 결정론적 위반 검출.

**2차 검증** (2, 병렬):
- **integration-tester** (sonnet, 15t): e2e/통합 검증. Playwright 스크립트 실행 + 회귀 감지.
- **perf-monitor** (haiku, 8t): 번들/빌드/런타임 성능 회귀 감시. 기준선 대비 임계치 판정.

**메타 검증** (1):
- **self-verifier** (opus, 15t): 작업 종료 직전 마지막 게이트. 2단계 전체 결과 종합. 추측/누락/오판 차단.

**문서** (1):
- **doc-updater** (haiku, 8t): 진행 문서 갱신 + broken link 점검.

9개 스킬:
- `/zm-commit` — 커밋 규칙 적용
- `/zm-unit-done` — 작업 단위 완료 파이프라인 (빌드+문서+로그)
- `/zm-session` — 세션 시작 보고
- `/zm-troubleshoot` — TS-NNN 등록/조회
- `/zm-memory-save` — 메모리 + Work Completion 갱신
- `/zm-work-intake` — 작업 진입 체크리스트
- `/zm-work-completion` — 작업 완료 종합 파이프라인
- `/zm-doc-status` — docs/ 전체 상태 대시보드
- `/zm-roadmap` — 로드맵 조회/갱신

---

## 🚨 10. 핵심 주의사항

> 상세 → `.claude/rules/security.md`, `.claude/memory/tech-gotchas.md`

1. **iframe sandbox 정책 (도메인 핵심)**
   - 사용자 앱 iframe에 `allow-same-origin` **절대 금지** (`allow-scripts`만)
   - blob: URL 또는 srcdoc 사용 (null origin 격리)

2. **postMessage 보안**
   - `event.origin` 검증 필수 (와일드카드 금지)
   - 호스트-앱 RPC는 Comlink 어댑터 경유

3. **CSP / COEP / COOP 헤더 변경 시**
   - `app-sandbox-auditor` 검토 권장
   - SharedArrayBuffer 요구 게임 엔진과 충돌 검토

4. **시크릿/토큰**
   - 응답/로그에 절대 노출 금지
   - 문서/코드/커밋에 포함 금지

5. **문서 우선 확인**
   - 구현 전 `docs/01-architecture/` / `docs/02-decisions/` 검토

---

## 📦 11. 필수 프로토콜 (MANDATORY)

### Auto Memory Protocol
- `.claude/memory/MEMORY.md` "최근 결정사항"에 새 결정 append (최대 10, FIFO)
- 정책 결정 → `docs/03-policy/01-policy-registry.md` 에 SSOT 등재 (ARCH/TECH/PROD/CONST)
- TODO 완료 시 `[x]` 전환

### Work Completion Protocol
작업 완료 시 (`/zm-unit-done` 권장):
- **bugfix** → `docs/13-troubleshooting/entries.md` TS-NNN 추가 + 반복 시 `.claude/rules/known-mistakes.md` M-NNN 제안
- **feature** → `docs/10-session/current-phase.md` + `docs/04-planning/01-prd.md` 동시 갱신
- **docs** → 해당 문서 날짜만 갱신

### Mistake Recording Protocol
사용자 실수 지적 시:
1. `.claude/rules/known-mistakes.md`에 M-NNN 추가
2. [BLOCK] 수준이면 백틱 인용 패턴으로 등록 (mistake_guard.py가 자동 차단)
3. MEMORY.md "최근 결정사항"에 1줄 기록

---

*프로젝트: zm-os 브라우저 가상 데스크탑 POC*
*상태: Phase 3 진행 중 (2026-05-25)*
*작업 모드: Claude Code 자율 개발 + 사용자 리뷰*

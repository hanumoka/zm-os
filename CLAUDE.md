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

상세: [`zm-claude-docs/project/prd.md`](zm-claude-docs/project/prd.md) | [`zm-claude-docs/project/roadmap.md`](zm-claude-docs/project/roadmap.md)

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
| [zm-claude-docs/session/quick-ref.md](zm-claude-docs/session/quick-ref.md) | 1페이지 컨텍스트 (세션 시작 시 필독) |
| [zm-claude-docs/session/current-phase.md](zm-claude-docs/session/current-phase.md) | 현재 Phase 상세 |
| [zm-claude-docs/archive/](zm-claude-docs/archive/) | 월별 작업 로그 |

### 세션 재시작 자동 프로세스
`session_start.py` 훅이 quick-ref + current-phase + git 상태를 자동 로드.
보완은 `/zm-session` 슬래시 커맨드.

### 진행상황 업데이트 규칙
- 작업 시작: 🔄 진행 중 / 완료: ✅ 완료 / 대기: ⏳ 대기
- 블로커: 즉시 기록 | 중요 결정: 근거 + ADR 번호 명시

---

## 🏗️ 4. 코드 구조

```
zm-os/
├── src/                         # Next.js 풀스택 (App Router)
│   ├── app/                     # 페이지/route handlers (BE 대용)
│   │   ├── (desktop)/           # 가상 데스크탑 메인
│   │   ├── store/               # 앱 스토어
│   │   └── api/                 # route handlers
│   ├── components/
│   │   ├── desktop/             # 윈도우 매니저, 아이콘, 작업표시줄
│   │   ├── store/               # 스토어 UI
│   │   └── ui/                  # shadcn/ui 기본 (도입 시)
│   ├── lib/
│   │   ├── apps/                # 매니페스트, 샌드박싱, IPC
│   │   ├── api/                 # 클라이언트 API
│   │   └── storage/             # IndexedDB / OPFS
│   └── types/
├── public/                      # 정적 자산
├── zm-claude-docs/              # 모든 문서 (SSOT 인덱스 + features/decisions/research)
└── .claude/                     # Claude Code 셋팅 (agents/skills/rules/memory/hooks)
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

> 3대 원칙: **POC 빠른 검증** > **보안 / 격리** > **코드 정교함**

상세: [`zm-claude-docs/project/roadmap.md`](zm-claude-docs/project/roadmap.md)
정책 SSOT: [`.claude/memory/policy-registry.md`](.claude/memory/policy-registry.md)

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

## 🤖 9. 에이전트

> 상세 위임 규칙 → `.claude/agents/` 디렉토리

5개 에이전트:
- **fe-developer** (sonnet, 25t): Next.js 페이지/컴포넌트/API route handler 구현
- **code-reviewer** (sonnet, 15t, project memory): TS strict, 샌드박싱, 보안, SSR 안전 리뷰
- **build-checker** (haiku, 5t): `npx tsc --noEmit` 검증
- **doc-updater** (haiku, 8t): current-phase / quick-ref / archive 자동 갱신
- **app-sandbox-auditor** (sonnet, 15t): iframe/CSP/postMessage 보안 감사 (zm-os 신규)

5개 스킬:
- `/zm-commit` — 커밋 규칙 적용
- `/zm-unit-done` — 작업 단위 완료 파이프라인 (빌드+문서+로그)
- `/zm-session` — 세션 시작 보고
- `/zm-troubleshoot` — TS-NNN 등록/조회
- `/zm-memory-save` — 메모리 + Work Completion 갱신

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
   - 구현 전 `zm-claude-docs/features/` / `decisions/` 검토

---

## 📦 11. 필수 프로토콜 (MANDATORY)

### Auto Memory Protocol
- `.claude/memory/MEMORY.md` "최근 결정사항"에 새 결정 append (최대 10, FIFO)
- 정책 결정 → `.claude/memory/policy-registry.md` 에 SSOT 등재 (ARCH/TECH/PROD/CONST)
- TODO 완료 시 `[x]` 전환

### Work Completion Protocol
작업 완료 시 (`/zm-unit-done` 권장):
- **bugfix** → `.claude/memory/troubleshooting-patterns.md` TS-NNN 추가 + 반복 시 `.claude/rules/known-mistakes.md` M-NNN 제안
- **feature** → `zm-claude-docs/session/current-phase.md` + `zm-claude-docs/project/prd.md` 동시 갱신
- **docs** → 해당 문서 날짜만 갱신

### Mistake Recording Protocol
사용자 실수 지적 시:
1. `.claude/rules/known-mistakes.md`에 M-NNN 추가
2. [BLOCK] 수준이면 백틱 인용 패턴으로 등록 (mistake_guard.py가 자동 차단)
3. MEMORY.md "최근 결정사항"에 1줄 기록

---

*프로젝트: zm-os 브라우저 가상 데스크탑 POC*
*상태: Phase 0 — 초기 셋팅 진행 중 (2026-05-24)*
*작업 모드: Claude Code 자율 개발 + 사용자 리뷰*

# Quick Reference

> 1페이지 프로젝트 컨텍스트. 세션 시작 시 필독. 수치 변경 시 즉시 갱신.

## 현재 상태 (2026-05-24)
- **Phase**: Phase 1 — 코어 샌드박싱 + 윈도우 매니저
- **진행률**: 작업 3/7 완료 (약 43%)
- **저장소**: `git@github-personal:hanumoka/zm-os.git`, branch `main`
- **마지막 커밋**: 곧 커밋 예정 (Phase 1 작업 3)
- **빌드**: `npm install` 완료, `npx tsc --noEmit` 통과

## 한 줄 요약
브라우저 가상 데스크탑 + JS 게임 스토어 POC. 단일 사용자, blob: iframe 샌드박싱, IndexedDB/OPFS 스토리지.

## 기술 스택
- Next.js 16 + React 19 + Tailwind v4 (단일 풀스택)
- TypeScript strict, any 금지
- iframe sandbox + Comlink IPC (앱 격리, IPC는 작업 2에서 도입)
- Zod (매니페스트 검증, 4.4.3)
- IndexedDB / OPFS (클라이언트 스토리지, Phase 2에서 도입)

## 핵심 정책
- ARCH-01: 단일 Next.js 풀스택 (모노레포는 v2)
- ARCH-02: blob: iframe + `sandbox="allow-scripts"` + Comlink (`allow-same-origin` 금지)
- TECH-01: IndexedDB+OPFS, 서버 동기화는 v2
- TECH-02: Python hooks (`.claude/hooks/*.py`)
- PROD-01: POC 스코프 = 게임 스토어 + 단일 사용자

상세: [`.claude/memory/policy-registry.md`](../../.claude/memory/policy-registry.md)

## 검증 방법 (사용자 직접 확인 권장)

```bash
npm run dev
# http://localhost:3000          → 기본 페이지
# http://localhost:3000/sandbox-test  → 격리 검증 페이지
```

기대 결과 (`/sandbox-test`):
- Bouncing Ball이 캔버스에서 움직임
- "Messages from sandbox"에 `isolation-check` 메시지가 떠야 함
- `canTouchParentStorage`, `canTouchParentDocument`, `canTouchParentCookies` 모두 `false`
- 게임 안 상태바에 "✅ 격리 OK"

## 에이전트 팀 (10명 — 2026-05-24 재구성)

설계 architect+research-analyst / 구현 lib-developer+fe-developer / 검증 build+code-reviewer+sandbox-auditor+constraint / 메타 self-verifier / 문서 doc-updater. 표준 워크플로: [`.claude/agents/_workflow.md`](../../.claude/agents/_workflow.md)

## 다음 작업 후보 (모두 새 팀 워크플로로 진행)

1. **작업 4 — 윈도우 매니저 (DSK-01)** (`src/components/desktop/WindowManager.tsx`) — react-rnd 기반
2. **작업 5 — 데스크탑 영역 (DSK-02)**
3. **작업 6 — 작업표시줄 (DSK-03)**

## Quick Links
- PRD: [`project/prd.md`](../project/prd.md)
- 로드맵: [`project/roadmap.md`](../project/roadmap.md)
- 현재 Phase 상세: [`current-phase.md`](current-phase.md)
- 보안 규칙: [`.claude/rules/security.md`](../../.claude/rules/security.md)
- 외부 리서치: [`research/`](../research/)

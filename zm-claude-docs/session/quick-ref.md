# Quick Reference

> 1페이지 프로젝트 컨텍스트. 세션 시작 시 필독. 수치 변경 시 즉시 갱신.

## 🚨 재부팅 후 재개 지점 (2026-05-24)
- **Phase 1**: ✅ 완료 (7/7), e2e PASS (TS-003 fix 포함)
- **Phase 2**: 진입 — 작업 1 architect 완료, **fe-developer 호출 직전 중단**
- **재개**: [`../project/phase-2-plan.md`](../project/phase-2-plan.md) §7 → fe-developer 호출
- **확정 결정**: 코어 / STR-01/02 첫 / Phaser 3 / P1=A α i+iii x r1 / Provider 옵션 A
- **마지막 커밋**: `7d3fd32 fix(desktop): TS-003 AppFrame StrictMode`

## 현재 상태 (2026-05-24)
- **저장소**: `git@github-personal:hanumoka/zm-os.git`, branch `main`
- **빌드**: `npm install` 완료, `npx tsc --noEmit` 통과
- **dev 서버**: 백그라운드 실행 중 (재부팅 시 종료)

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

## 다음 Phase 2 (Phase 1 100% 완료 후)

Phase 2 진입 가능. 앱 스토어 + 패키지 포맷 + 첫 게임 시연 (별도 plan 필요)
- STR-01/02: 앱 카탈로그 UI
- APP-02/03: 앱 패키지 포맷 + 설치 관리
- GAME-01: 첫 샘플 게임

## Quick Links
- PRD: [`project/prd.md`](../project/prd.md)
- 로드맵: [`project/roadmap.md`](../project/roadmap.md)
- 현재 Phase 상세: [`current-phase.md`](current-phase.md)
- 보안 규칙: [`.claude/rules/security.md`](../../.claude/rules/security.md)
- 외부 리서치: [`research/`](../research/)

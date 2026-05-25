# Quick Reference

> 1페이지 프로젝트 컨텍스트. 세션 시작 시 필독. 수치 변경 시 즉시 갱신.

## 🚀 Phase 3 진행 중 (2/4, 50%) 🔄
- **Phase 1**: ✅ 완료 (7/7)
- **Phase 2**: ✅ 완료 (4/4, 100%)
- **Phase 3**: ✅ 완료 (4/4, 100%) — 작업 1~4 모두 완료 (2026-05-25)
- **POC 종료 게이트**: ✅ 통과 (보안 14 페네스트 + 번들 임계치 PASS — 데모/시연 가능)
- **마지막 커밋**: `3f896b0 docs(infra): docs/ 내부 링크 경로 갱신`, push 완료
- **POC 1차 완료 (2026-05-25)** — Phase 0~3 전체 완료, M4 마일스톤 달성

### 완료한 작업
**작업 1 ✅ APP-02**: 사용자 ZIP 앱 업로드 (JSZip 3.10.1 + 보안 검증)
- 신규: zip-loader.ts + user-apps.ts + UserAppsProvider.tsx + AppUploadButton.tsx
- 저장소: IndexedDB DB_VERSION 2 STORE_USER_APPS
- 카탈로그: buildCatalog(builtInApps, userApps) 통합
- 검증: ✅ PASS (4명 + self-verifier)
- ADR-0008 신규 + PROD-05 정책

**작업 2 ✅ 안정화**: 번들 측정 + iframe 셀프 페네스트
- 번들: static 1.4MB (raw), gzip ~400-500KB (LCP 내)
- 페네스트: 14/14 항목 ALL PASS (PT-a/b/c/d/e/g/h + ZP-C7/C8 + CSP)
- 코드 변경 0건 (architect 목표)
- 신규 위협: N-08 postMessage DoS (v2 후보)

### 다음 후보 (사용자 우선순위 대기)
1. ~~게임 엔진 호환성 (B)~~ ✅ 완료 — Pixi.js 8 + Three.js r184 ALL PASS
2. ~~데모 영상 (C)~~ ✅ 완료 — Playwright 비디오 녹화 7 Scene
3. **STG-02 OPFS + DSK-04** — OPFS 어댑터 + 윈도우 위치 영속화 (v2 후보)

## 현재 상태 (2026-05-25)
- **저장소**: `git@github-personal:hanumoka/zm-os.git`, branch `main`
- **빌드**: `npm install` 완료, `npx tsc --noEmit` 통과
- **dev 서버**: 백그라운드 실행 중 (재부팅 시 종료)

## 한 줄 요약
브라우저 가상 데스크탑 + JS 게임 스토어 POC. 단일 사용자, blob: iframe 샌드박싱, IndexedDB/OPFS 스토리지.

## 기술 스택
- Next.js 16 + React 19 + Tailwind v4 (단일 풀스택)
- TypeScript strict, any 금지
- iframe sandbox + Comlink IPC (앱 격리)
- Zod (매니페스트 검증, 4.4.3)
- idb (IndexedDB wrapper, 8.0.3)
- jszip (ZIP 파싱 + 보안 검증, 3.10.1)
- Phaser (게임 엔진, 3.90.0)
- IndexedDB / OPFS (클라이언트 스토리지)

## 핵심 정책
- ARCH-01: 단일 Next.js 풀스택 (모노레포는 v2)
- ARCH-02: blob: iframe + `sandbox="allow-scripts"` + Comlink (`allow-same-origin` 금지)
- TECH-01: IndexedDB+OPFS, 서버 동기화는 v2
- TECH-02: Python hooks (`.claude/hooks/*.py`)
- PROD-01: POC 스코프 = 게임 스토어 + 단일 사용자

상세: [`docs/03-policy/01-policy-registry.md`](../03-policy/01-policy-registry.md)

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

## 에이전트 팀 (13명 — 2026-05-25 재편, 2단계 검증)

설계 architect+research-analyst+**design-reviewer** / 구현 lib-developer+fe-developer / 1차검증 build+code-reviewer(+SOLID)+sandbox-auditor+constraint / 2차검증 **integration-tester**+**perf-monitor** / 메타 self-verifier / 문서 doc-updater. architect+design-reviewer = 필수 게이트. 워크플로: [`.claude/agents/_workflow.md`](../../.claude/agents/_workflow.md)

## Phase 3 ✅ 완료 (4/4, 100%) — POC 종료 후 v2 진입

작업 1~4 모두 완료. 에이전트 팀 13명 재편 (설계 안정성/유연성/확장성 중심).
다음 작업 후보: Tier 1 (STG-02/DSK-04/N-08/APP-04/TEST-01/DSK-05)

## Quick Links
- PRD: [`01-prd.md`](../04-planning/01-prd.md)
- 로드맵: [`02-roadmap.md`](../04-planning/02-roadmap.md)
- 현재 Phase 상세: [`current-phase.md`](current-phase.md)
- 보안 규칙: [`.claude/rules/security.md`](../../.claude/rules/security.md)
- 외부 리서치: [`05-analysis/`](../05-analysis/)

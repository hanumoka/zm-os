# Quick Reference

> 1페이지 프로젝트 컨텍스트. 세션 시작 시 필독. 수치 변경 시 즉시 갱신.
> 최종 갱신: 2026-05-27

## ✅ POC 완료 → Post-POC 완료 → v2 설계 단계 완료
- **Phase 1~3**: ✅ 전부 완료 — M4 마일스톤 달성, POC 공식 종료
- **POC 종료 게이트**: ✅ 통과 (보안 14 페네스트 + 번들 임계치 PASS)
- **Post-POC**: APP-04 ✅ + TEST-01 ✅ + DSK-05 ✅ + **REFAC-01 8/8 ✅** + APP-04 확장 ✅
- **v2 설계 단계 ✅ 완료**: SRV-00 모노레포 + **ADR-0016 + ADR-0017~0023 일괄 채택** (Ports & Adapters + Local 어댑터 6건) + **v2 plan v0.3.0** (10 Epic + 58 작업)
- **다음 진입**: **REFAC-02 P1** (lib-developer 위임) — `packages/adapters-local` 신규 패키지 + namespace-registry adapterPolicies reshape

## 현재 상태 (2026-05-27)
- **저장소**: `git@github-personal:hanumoka/zm-os.git`, branch `main`
- **모노레포**: `apps/web` + `packages/{core,storage,ipc}` (pnpm 11 + Turborepo 2.7)
- **빌드**: `pnpm install` + `pnpm turbo type-check` 통과 / vitest 61/61 PASS / next build ✅
- **dev 서버**: `pnpm --filter @zm/web dev` (백그라운드, 재부팅 시 종료)

## ⚠️ 진행 중 방향 전환 (2026-05-26)
사용자 결정: **"로컬 100% + 외부 의존성 0 + 클라우드는 어댑터 옵션"**
- ADR-0013/0014/0015 (Supabase 단일 채택) → 헤더 `accepted (will be superseded by ADR-0017+)` 상태
- v2 plan v0.2.1 (⚠️ reshape 대기) → v0.3.0 재작성 예정 (9 Epic 유지, 작업마다 LocalAdapter 필수 / CloudAdapter 옵션)
- baseline 스냅샷: [`docs/01-architecture/06-current-snapshot-2026-05-26.md`](../01-architecture/06-current-snapshot-2026-05-26.md)

## 한 줄 요약
브라우저 가상 데스크탑 + JS 게임 스토어 POC. 단일 사용자, blob: iframe 샌드박싱, IndexedDB/OPFS 스토리지. v2는 로컬-우선 + 옵션 클라우드 어댑터 모델.

## 기술 스택
- Next.js 16 + React 19 + Tailwind v4 (모노레포 `apps/web/`)
- TypeScript strict, any 금지
- iframe sandbox + Comlink IPC (앱 격리, `apps/web/src/lib/apps/ipc/`)
- Zod (매니페스트 검증, 4.4.3)
- idb (IndexedDB wrapper, 8.0.3) — `packages/storage/`
- jszip (ZIP 파싱 + 보안 검증, 3.10.1)
- Phaser 3.90.0 / Pixi.js 8.18.1 / Three.js r184 (게임 엔진 매트릭스 PASS)
- IndexedDB / OPFS / Memory (StorageAdapter Strategy)
- Vitest 4.1.7 + Playwright (테스트)

## 핵심 정책
- ARCH-01: Next.js 풀스택 + v2 pnpm/Turborepo 모노레포 (reshape 2026-05-26)
- ARCH-02: blob: iframe + `sandbox="allow-scripts"` + Comlink (`allow-same-origin` 금지)
- TECH-01: IndexedDB+OPFS+Memory (StorageAdapter Strategy)
- TECH-02: Python hooks (`.claude/hooks/*.py`)
- TECH-07/08/09: v2 Supabase Auth/DB + LWW Sync (⚠️ reshape 대기, 어댑터로 격하 예정)
- TECH-10: pnpm 11 + Turborepo 2.7 모노레포
- CONST-01/02: RLS 의무 + 서버 시계 권위
- PROD-01: POC 스코프 = 게임 스토어 + 단일 사용자

상세: [`docs/03-policy/01-policy-registry.md`](../03-policy/01-policy-registry.md)

## 검증 방법 (사용자 직접 확인 권장)

```bash
pnpm install
pnpm --filter @zm/web dev
# http://localhost:3000               → 가상 데스크탑
# http://localhost:3000/sandbox-test  → 격리 검증 페이지
# http://localhost:3000/store         → 앱 스토어
```

기대 결과 (`/sandbox-test`):
- Bouncing Ball이 캔버스에서 움직임
- "Messages from sandbox"에 `isolation-check` 메시지가 떠야 함
- `canTouchParentStorage`, `canTouchParentDocument`, `canTouchParentCookies` 모두 `false`
- 게임 안 상태바에 "✅ 격리 OK"

## 에이전트 팀 (13명 — 2단계 검증 파이프라인)

설계 architect+research-analyst+**design-reviewer** / 구현 lib-developer+fe-developer / 1차검증 build+code-reviewer(+SOLID)+sandbox-auditor+constraint / 2차검증 **integration-tester**+**perf-monitor** / 메타 self-verifier / 문서 doc-updater. architect+design-reviewer = 필수 게이트. 워크플로: [`.claude/agents/_workflow.md`](../../.claude/agents/_workflow.md)

## 다음 진입 지점 — REFAC-02 (코드 마이그레이션 5 작업, ~3주)

1. **REFAC-02-P1** (lib-developer) — `packages/adapters-local` 신규 패키지 + `pnpm-workspace.yaml`/`turbo.json` 등록 + `namespace-registry.ts` adapterPolicies 배열 reshape + `system` namespace 5번째 엔트리 추가 (3일)
2. **REFAC-02-P2** — BlobStorage Port + LocalOPFS 어댑터 이전 + AbortSignal + BlobStorageError + `@zm/storage` shell (5일)
3. **REFAC-02-P3** — AppRepository Port + LocalRepo + 4 wrapper 흡수 + cascade remove (5일)
4. **REFAC-02-P4** — AuthProvider + SyncProvider + ModerationProvider 3 어댑터 + patterns.ts (5일)
5. **REFAC-02-P5** — Adapter Resolver + PortsContext + 5 Provider reshape + 회귀 검증 (5일)

**M5 진입 (REFAC-02 완료 후)**: SRV-01~02 + USR-01~04 (인프라 + 로컬 인증 기본)

보류 (CloudAdapter 트랙, ADR-0024+): CloudAuth/CloudRepo/CloudSync/CloudBlob/CloudModeration/Migration/Permission/Hosting/API-Auth/IPC-02

## Quick Links
- PRD: [`01-prd.md`](../04-planning/01-prd.md)
- 로드맵: [`02-roadmap.md`](../04-planning/02-roadmap.md) (v0.10.0)
- v2 plan: [`03-v2-plan.md`](../04-planning/03-v2-plan.md) (v0.3.0 ✅)
- 현재 Phase 상세: [`current-phase.md`](current-phase.md)
- 보안 규칙: [`.claude/rules/security.md`](../../.claude/rules/security.md)
- 외부 리서치: [`05-analysis/`](../05-analysis/)
- baseline 스냅샷: [`06-current-snapshot-2026-05-26.md`](../01-architecture/06-current-snapshot-2026-05-26.md)

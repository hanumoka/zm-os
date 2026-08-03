# Quick Reference

> 1페이지 프로젝트 컨텍스트. 세션 시작 시 필독. 수치 변경 시 즉시 갱신.
> 최종 갱신: 2026-08-04

## ✅ POC → Post-POC → v2 설계 완료 → v2 구현 진행 중
- **Phase 1~3**: ✅ 전부 완료 — M4 마일스톤 달성, POC 공식 종료
- **POC 종료 게이트**: ✅ 통과 (보안 14 페네스트 + 번들 임계치 PASS)
- **Post-POC**: APP-04 ✅ + TEST-01 ✅ + DSK-05 ✅ + **REFAC-01 8/8 ✅** + APP-04 확장 ✅
- **v2 설계 단계 ✅ 완료**: SRV-00 모노레포 + **ADR-0016 + ADR-0017~0023 일괄 채택** (Ports & Adapters + Local 어댑터 6건) + **v2 plan v0.3.0** (10 Epic + 58 작업)
- **REFAC-02**: **P1 ✅ + P2 ✅ + P3 ✅ 완료** — 5 Port SSOT / BlobStorage Port + `@zm/storage` deprecation shell / AppRepository Port + LocalRepo
- **협업 인프라 ✅ 이식 완료** (2026-06-07, commit c368b5e) — sonix_docs 멀티 세션 협업 (WU claim + worktree 격리 + events SSOT + 헌법 3)
- **아키텍처 전면 검토 ✅ 완료** (2026-08-04) — 유연성·확장성·표준성 관점 56건 확정, G0~G3 반영 (아래 참조)
- **다음 진입**: **REFAC-02-P4** — AuthProvider / SyncProvider / ModerationProvider 3 어댑터

## 현재 상태 (2026-08-04)
- **저장소**: `git@github-personal:hanumoka/zm-os.git`, branch `main`
- **모노레포**: `apps/web` + `packages/{core,storage,ipc,adapters-local}` (pnpm 10.33 + Turborepo 2.9)
  — `packages/storage`는 47줄 deprecation shell (ADR-0020 §D5, P5에서 삭제)
- **빌드**: `pnpm turbo type-check test lint` 전부 통과 / **vitest 185** / next build ✅
- **린트**: `pnpm lint` 복구됨 (flat config, error 0 / warning 23). `next lint`는 Next 16에서 제거됨
- **dev 서버**: `pnpm --filter @zm/web dev` (백그라운드, 재부팅 시 종료)

## ✅ 아키텍처 방향 (2026-05-26 결정 → 2026-05-27 반영 완료)
사용자 결정: **"로컬 100% + 외부 의존성 0 + 클라우드는 어댑터 옵션"**
- ADR-0013/0014/0015 (Supabase 단일 채택) → **ADR-0017로 superseded 완료**
- v2 plan → **v0.3.0 재작성 완료** (10 Epic, 작업마다 LocalAdapter 필수 / CloudAdapter 옵션)
- baseline 스냅샷: [`docs/01-architecture/06-current-snapshot-2026-05-26.md`](../01-architecture/06-current-snapshot-2026-05-26.md)

## 한 줄 요약
브라우저 가상 데스크탑 + JS 게임 스토어 POC. 단일 사용자, **srcdoc** iframe 샌드박싱(opaque origin), IndexedDB/OPFS 스토리지. v2는 로컬-우선 + 옵션 클라우드 어댑터 모델.

## 기술 스택
- Next.js 16 + React 19 + Tailwind v4 (모노레포 `apps/web/`)
- TypeScript strict, any 금지
- iframe `srcdoc` + `sandbox="allow-scripts"` + Comlink 와이어 호환 자체 IPC (`packages/ipc/`)
- Zod (매니페스트 검증, 4.4.3)
- idb (IndexedDB wrapper, 8.0.3) — `packages/adapters-local/src/blob-storage/`
- jszip (ZIP 파싱 + 보안 검증, 3.10.1)
- Phaser 3.90.0 / Pixi.js 8.18.1 / Three.js r184 (게임 엔진 매트릭스 PASS)
- IndexedDB / OPFS / Memory (StorageAdapter Strategy)
- Vitest 4.1.7 (+ happy-dom, `packages/ipc`) + Playwright (e2e)
- ESLint 9 flat config (금지 규칙 기계 검사)

## 핵심 정책
- ARCH-01: Next.js 풀스택 + v2 pnpm/Turborepo 모노레포 (reshape 2026-05-26)
- ARCH-02: blob: iframe + `sandbox="allow-scripts"` + Comlink (`allow-same-origin` 금지)
- TECH-01: IndexedDB+OPFS+Memory (StorageAdapter Strategy)
- TECH-02: Python hooks (`.claude/hooks/*.py`)
- TECH-07/08/09: v2 Supabase Auth/DB + LWW Sync — **deprecated** (ADR-0017로 CloudAdapter 옵션 격하)
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

## 에이전트 팀 (14명 — 2단계 검증 파이프라인)

설계 architect+research-analyst+**design-reviewer** / 구현 lib-developer+fe-developer / 1차검증 build+code-reviewer(+SOLID)+sandbox-auditor+constraint / 2차검증 **integration-tester**+**perf-monitor** / 메타 self-verifier+**zm-context-guardian**(정합성 검증) / 문서 doc-updater. architect+design-reviewer = 필수 게이트. 워크플로: [`.claude/agents/_workflow.md`](../../.claude/agents/_workflow.md)

## 2026-08-04 세션 — 아키텍처 검토 반영 (G0~G3)

전면 검토 56건(high 11 / medium 28 / low 17) 확정 후 다음을 반영했다.

**수정한 실제 버그**
- 윈도우 레이아웃 복원 불가 — hydration 경합으로 복원 즉시 자동 닫힘 (DSK-04는 ✅였으나 동작 안 함)
- 데스크탑 설정 상호 삭제 — 배경만 바꿔도 저장된 themeMode가 기본값으로 덮어써짐
- `compareSemver`가 짧은 버전을 "동일"로 판정 → 업데이트 판정 실패
- 레지스트리 어댑터 정책 3값이 2값으로 접혀 `local-memory` 선언이 OPFS 영구 저장으로 뒤집힘
- 스토어 아이콘이 화면 밖 이탈, 아이콘 겹침·화면 밖 배치로 접근 불가

**구조 개선**
- 새 namespace 추가: **4파일 9곳 → 레지스트리 1항목 + NS_ 상수 1줄** (DB_VERSION·스키마·upgrade 전부 파생)
- `lib/storage`에서 표현 로직 분리 → `components/desktop/{icon-grid,wallpaper-presets}.ts`
- `writable` 가드를 `usePersistence`로 일원화 (세 소비자 복제 → 1곳)
- ADR-0040: `contentRef`에 `inline-html` variant + `normalizeAppRecord` 승격 함수 (P5 게이트 해소)

**안전망**
- `pnpm lint` 복구 — 금지 규칙 4개가 주석에서 기계 검사로 (error 0 / warning 23)
- `noUncheckedIndexedAccess` 전 패키지 적용, 테스트도 type-check 대상
- 테스트 **133 → 185** (`host.ts` 보안 게이트 12 / `windowReducer` / CSP / 격자 / AppRecord 승격 13)

**미해결로 남긴 것**
- 잘못된 레코드 1건이 스토어 페이지 전체를 죽인다 (`defaultWidth` 크래시). 레거시 `user-apps.ts` 경로라
  이번 정규화를 타지 않는다 — **P5 배선이 이 크래시를 "건너뛰기"로 바꾼다**
- `system` namespace는 DB_VERSION 5까지 올려 만들었으나 **읽기·쓰기 코드 0건**. LocalAuth(P4)가 유일한 소비자
- 배경 프리셋 버튼에 접근 가능한 이름 없음 (a11y 경고로 잡힘)

## 다음 진입 지점 — REFAC-02 (코드 마이그레이션 5 작업, ~3주)

1. ✅ **REFAC-02-P1 완료 (2026-05-27)** — `packages/adapters-local` 골조 + 5 Port 인터페이스 SSOT + namespace-registry adapterPolicies 배열 reshape + system namespace + indexeddb.ts v5 upgrade. type-check 5/5 + test 5/5 PASS.
2. **REFAC-02-P2 (다음)** — BlobStorage Port + LocalOPFS 어댑터 이전 (`packages/storage` 흡수) + AbortSignal 매 entry 폴링 + `BlobStorageError extends PortError` + `@zm/storage` deprecation shell (5일)
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

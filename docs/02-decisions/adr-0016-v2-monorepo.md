---
number: "0016"
title: v2 모노레포 도구 — pnpm workspaces + Turborepo
status: accepted
date: 2026-05-26
author: hanumoka
related: ["0001"]
supersedes: ["0001 (ARCH-01 reshape)"]
---

# ADR-0016: v2 모노레포 도구 — pnpm workspaces + Turborepo

## Context

- ARCH-01 (ADR-0001): POC v1은 "단일 Next.js 풀스택 + 단일 사용자 + iframe 샌드박싱". v2에서 멀티유저/클라우드 도입 시 reshape 명시.
- v2 plan §5 ADR Candidate "ADR-Monorepo" 진입 시점 — 사용자 확정 (2026-05-26): **v2 진입 전 일괄** 분리.
- v2 plan §6 reshape 표 ARCH-01: "단일 Next.js → packages/ 분리 (modular monolith)". High breaking 위험 명시.
- 분리 동기:
  - `cloud-adapter.ts` (CLD-02) — storage 추상화 확장
  - `ipc` 모듈 — IPC-02 Comlink 직접 통합 시 esbuild 빌드 파이프라인 분리
  - Supabase Edge Functions / Server Action 분리 (v2 후반)
- research-analyst 보고 (2026-05-26):
  - **pnpm 11** + **Turborepo 2.7** 조합이 단독 개발자 + Next.js 16 + Vercel 컨텍스트에 최적
  - Yarn workspaces / Bun workspaces / Nx는 zm-os 스코프에 부적합 (각각 레거시 / 안정성 부족 / 과중)
  - Vercel Remote Cache 무료 (2025-01-31), `transpilePackages` Next.js 13.1+ 공식 지원, Skew Protection 호환은 Turborepo ≥2.4.1

## Decision

**pnpm 11 workspaces + Turborepo 2.7 채택**.

### 모노레포 구조
```
zm-os/
├── apps/
│   └── web/                  # 현재 src/ 이동 (Next.js 16)
│       ├── src/app/
│       ├── src/components/
│       └── next.config.ts
├── packages/
│   ├── core/                 # 공유 타입/순수 유틸 (zod 의존, React 비의존)
│   │   ├── manifest.ts       # AppManifest schema
│   │   ├── namespace-registry.ts
│   │   ├── version.ts        # semver compare
│   │   └── errors/           # persistence-error 등
│   ├── storage/              # StorageAdapter Strategy (ADR-0009) + cloud-adapter (CLD-02)
│   │   ├── storage-adapter.ts
│   │   ├── idb-adapter.ts
│   │   ├── opfs-adapter.ts
│   │   ├── memory-adapter.ts
│   │   ├── cloud-adapter.ts  # 신규 (CLD)
│   │   └── resolve-adapter.ts
│   └── ipc/                  # Comlink wire-compatible RPC (현재) + IPC-02 reshape
│       ├── host.ts
│       ├── app.ts
│       └── runtime-iife.ts
├── pnpm-workspace.yaml
├── turbo.json
└── package.json              # root
```

### 도구 결정
- **패키지 매니저**: pnpm 11 (Node.js 22+ 요구사항 확인 후 사전 업그레이드)
- **빌드 오케스트레이션**: Turborepo 2.7
- **workspace protocol**: `workspace:*` (로컬 패키지 참조)
- **TypeScript Project References**: `composite: true` + `references` (타입 검사 시 빌드 없이 참조)
- **Remote Cache**: Vercel Remote Cache (무료, CI 캐시 공유)

### turbo.json 태스크 그래프
```json
{
  "tasks": {
    "build": { "dependsOn": ["^build"], "outputs": ["dist/**", ".next/**"] },
    "typecheck": { "dependsOn": ["^build"] },
    "test": { "dependsOn": ["^build"] },
    "lint": {}
  }
}
```

### 마이그레이션 시점
- **v2 진입 전 일괄** (사용자 결정 2026-05-26)
- 즉시: ARCH-01 reshape PR로 src/ → apps/web/ 이동 + packages/ 추출 + pnpm + turbo 도입
- 이후 모든 USR/CLD/STR-v2 작업은 packages/ 구조에서 진행

### Vercel 배포 설정
- Root Directory: `apps/web`
- Build Command: `turbo build`
- Output Directory: `apps/web/.next` (자동)
- 환경변수: `turbo.json` `env` 명시 (Skew Protection + 캐시 무효화)

### 명시적 비목표
- `packages/ui/` (shadcn/ui) — v2 후반에 도입 시 추가
- Supabase Edge Functions 별도 패키지화 — SRV Epic 작업 시 결정
- Storybook / Chromatic — 후속 검토

## Consequences

### Positive
- **확장 포인트 명확**: cloud-adapter / Comlink 등 v2 신규 모듈을 별도 패키지로 격리
- **빌드 캐싱**: Turborepo 로컬 + Remote Cache 무료 → 증분 빌드 ~22% 향상 (research 보고)
- **타입 안전성**: TS Project References로 패키지 간 타입 자동 추적
- **Vercel 통합 완벽**: zero-config 배포 (Root Directory 지정만)
- **Lock-in 최저**: pnpm + Turborepo 모두 오픈소스, 이탈 시 npm/yarn으로 fallback 가능
- **단독 개발자 친화**: `npx create-turbo@latest` 한 명령으로 boilerplate 생성

### Negative
- **초기 마이그레이션 비용**: src/ → apps/web/ 이동 + import path 전면 수정 + tsconfig 분리. 1~2일 소요 예상.
- **Node.js 22+ 요구**: 현재 환경 확인 필요 (pnpm 11 요구사항). 18/20이면 Node 업그레이드 또는 pnpm 10.x 유지
- **`turbo.json` 환경변수 누락 위험**: 스테이징 캐시가 프로덕션 혼입 가능 — `NEXT_PUBLIC_*` 외 변수 명시 의무
- **PR 크기**: 단일 큰 PR (작업 사용자 결정 — Epic별 점진 분리 거부)

### 회귀 위험
- **import alias 전면 변경**: `@/lib/storage` → `@zm/storage` 등 패키지 prefix로 reshape. tsc로 자동 검증 가능
- **Vercel 배포 설정 변경**: Root Directory 변경 시 첫 빌드 실패 가능 → preview 환경에서 사전 검증

### 인터페이스 보존 (마이그레이션 원칙)
- React hook 시그니처 (`useInstalledApps`, `useUserApps`, `useWindowManager` 등) 무변경
- StorageAdapter 인터페이스 무변경 (ADR-0009 prefigure)
- AppManifest 타입 무변경 (ADR-0008 + REFAC-01 H-1)
- 변경 검증: tsc + vitest + next build 모두 PASS 시점에 머지

## Alternatives

### pnpm 단독 (Turborepo 없이)
- 장점: 가장 단순, 의존성 최소
- 단점: 빌드 캐시 없음, 전체 빌드 매번 실행, Vercel 통합 수동
- 거부 사유: zm-os v2에서 packages 3+개 분리 시 캐시 부재가 개발 속도 저하

### Nx
- 장점: 코드 제너레이터, boundary enforcement, 대규모 적합
- 단점: 학습 곡선 높음, 솔로 개발자 과중 ("10개 미만 패키지는 Turborepo 우선" 권장 사례)
- 거부 사유: zm-os 스코프(3~5 패키지) 대비 과잉

### Bun workspaces
- 장점: 빠른 install, native runtime
- 단점: workspace link 동작이 pnpm과 미묘하게 다름, 프로덕션 비권장 (research 보고)
- 거부 사유: 안정성 검증 부족

### Yarn workspaces v4 (Berry)
- 거부 사유: 2026 신규 도입 비권장 포지션. 생태계가 pnpm로 이동.

### Moon (Rust 기반)
- 거부 사유: 2024 신규, 생태계 미성숙, 사례 부족

### 단일 Next.js 유지 (v2에서도 분리 안 함)
- 거부 사유: cloud-adapter / IPC reshape / Edge Functions 분리 시 코드 경계 흐려짐. v2 plan §6 reshape 표 ARCH-01 항목에서 분리 결정 확정.

## 정책 등재

- **ARCH-01 reshape** (2026-05-26):
  - 기존: "POC 1차는 단일 Next.js 프로젝트 + route handlers"
  - 변경: **"v2 진입 전 pnpm + Turborepo 모노레포 분리. apps/web + packages/{core,storage,ipc}"**
- **TECH-10** (v2 신규): 모노레포 도구 — pnpm 11 workspaces + Turborepo 2.7
- policy-registry §Active 갱신 + ARCH-01 본문 v2 reshape 명시

## 작업 항목 (v2 plan 추가)

- **SRV-00 (신규)**: ARCH-01 reshape — src/ → apps/web/ + packages 추출 + pnpm + Turborepo 도입
  - 의존성: 없음 (M5 진입 전 선행 작업)
  - 예상: 1~2일
  - 검증: tsc + vitest + next build + Vercel preview 모두 PASS

## 미해결 과제 (SRV-00 진입 시 확정)
- Node.js 버전 (pnpm 11 호환 — 22+ 필요 시 사전 업그레이드)
- shadcn/ui 도입 시점 — `packages/ui/` 추가 (v2.5 후보)
- Supabase Edge Functions 별도 패키지화 여부 (SRV Epic 작업 시 결정)

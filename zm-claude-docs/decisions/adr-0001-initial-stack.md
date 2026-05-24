---
number: "0001"
title: 초기 스택 — Next.js 단일 풀스택 + 단일 사용자 + iframe 샌드박싱
status: accepted
date: 2026-05-24
author: hanumoka
related: []
---

# ADR-0001: 초기 스택 결정

## Context

zm-os POC를 빠르게 검증하기 위해 1차 스코프와 핵심 기술 선택을 결정해야 한다. 후보를 넓게 두면 의사결정 비용이 커지고, 너무 좁히면 v2 확장 경로가 막힌다. 외부 OSS/논문 리서치 결과(아래 참조)와 두 본인 프로젝트(`zm-v3`, `sonix_docs`)의 검증된 패턴을 토대로 결정한다.

**리서치 입력**:
- [`research/browser-os-landscape.md`](../research/browser-os-landscape.md) — Puter/daedalOS/OS.js/v86/WebContainers 비교
- [`research/sandboxing-untrusted-js.md`](../research/sandboxing-untrusted-js.md) — iframe/ShadowRealm/QuickJS-WASM 비교, CVE
- [`research/multitenant-stack-options.md`](../research/multitenant-stack-options.md) — Supabase/Cloudflare/Puter 비교

## Decision

### 1. 코드 구조: **단일 Next.js 풀스택 (App Router)**
- BE는 route handlers로 대용. 별도 NestJS 같은 분리 없음.
- 모노레포(`packages/database`, `packages/shared`)는 v2에서 도입.

### 2. 샌드박싱: **blob: URL iframe + `sandbox="allow-scripts"` + Comlink IPC**
- 게임 엔진 호환성 최상(Phaser/Pixi/Godot/Three.js).
- Figma, itch.io 등에서 검증된 패턴.
- QuickJS-WASM 인터프리터는 게임 성능에 부적합.
- ShadowRealm은 표준 미정착.

### 3. 사용자 모델: **단일 사용자 (POC 1차)**
- 인증/계정/클라우드 동기화 없음.
- 모든 데이터는 클라이언트 IndexedDB + OPFS.
- 멀티유저는 v2 별도 plan (Clerk + Supabase + R2 후보).

### 4. UI: **자작 (React + 윈도우 매니저 라이브러리)**
- Puter 포크 대안 검토했으나 AGPL-3.0 + 학습 비용 + 커스터마이징 부담으로 제외.
- daedalOS UI 패턴 참고하되, 자작이 더 가볍고 통제 가능.
- 라이브러리 후보: react-rnd / dnd-kit / 자작 (ADR-0002에서 확정).

### 5. 앱 패키지: **itch.io 식 ZIP (index.html + 에셋 + manifest.json)**
- 단순, 검증된 포맷.
- 매니페스트 스키마는 Zod로 검증 (`src/lib/apps/manifest.ts`).

### 6. 결과물: **로컬 dev 서버 (`npm run dev`)**
- POC 단계라 배포 불필요.
- Vercel/Cloudflare 배포는 v2.

### 7. 개발 환경: **zm-v3 골격 + sonix_docs 베스트 결합**
- `.claude/`: zm-v3 agents/skills/rules 차용 + sonix Python hooks
- 문서: `zm-claude-docs/` (zm-v3 컨벤션) + ADR frontmatter (sonix 패턴)
- ML-240, file-categories 등 sonix 깊이 패턴은 1인 POC 단계에 과해서 v2 도입.

## Consequences

### Positive
- 빠른 검증 가능 (1-2주 내 POC 시연 가능)
- 검증된 보안 모델(iframe sandbox)로 보안 위험 최소화
- 게임 엔진 호환성 보장
- zm-v3 식 운영 도구로 작업 효율 확보

### Negative
- 멀티유저 도입 시 BE 분리 작업 필요 (v2 reshape 부담)
- iframe sandbox 한계: SharedArrayBuffer 요구 엔진과 충돌 가능 (게임별 매트릭스 작성 필요)
- 단일 사용자라 실제 배포 가치 낮음 (데모 영상으로 보완)

### Mitigation
- v2 reshape: 단일 풀스택 → 모노레포 전환 가이드를 Phase 3에 미리 작성
- 게임 엔진 매트릭스: Phase 3 안정화 작업에 포함
- 데모 영상: Phase 3 마지막 단계로 우선순위 잡음

## Alternatives Considered

| 후보 | 검토 결과 | 사유 |
|------|---------|------|
| Puter 포크 | ❌ | AGPL-3.0 + 학습 비용 + 도메인 매칭 약함 |
| daedalOS UI 풀 복제 | ❌ | Windows 95 미감보다 POC는 미니멀이 적합 |
| Next.js + NestJS 모노레포 (zm-v3 동일) | ❌ | POC에 과함, 단일 사용자라 BE 분리 무의미 |
| QuickJS-WASM 인터프리터 | ❌ | 게임 성능 부적합 (CPU heavy), 게임 엔진 호환성 손실 |
| Service Worker 기반 격리 | ❌ | DOM 접근 불가로 게임 UI 표시 불가능 |
| Electron 패키징 | ❌ | "브라우저에서" 비전과 어긋남 |

## References

- 리서치 보고서 3건 (research/)
- Figma plugin system: https://www.figma.com/blog/how-we-built-the-figma-plugin-system/
- itch.io HTML5 가이드: https://itch.io/docs/creators/html5
- MDN iframe sandbox: https://developer.mozilla.org/en-US/docs/Web/HTML/Element/iframe#sandbox

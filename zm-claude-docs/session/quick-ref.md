# Quick Reference

> 1페이지 프로젝트 컨텍스트. 세션 시작 시 필독. 수치 변경 시 즉시 갱신.

## 현재 상태 (2026-05-24)
- **Phase**: Phase 0 — 초기 셋팅
- **진행률**: Group A/B/C/D 완료 / E(검증·커밋) 진행 중
- **저장소**: `git@github-personal:hanumoka/zm-os.git` (main 브랜치)
- **빌드**: `npm install` 미실행 (다음 단계)

## 한 줄 요약
브라우저 가상 데스크탑 + JS 게임 스토어 POC. 단일 사용자, blob: iframe 샌드박싱, IndexedDB/OPFS 스토리지.

## 기술 스택
- Next.js 16 + React 19 + Tailwind v4 (단일 풀스택)
- TypeScript strict, any 금지
- iframe sandbox + Comlink IPC (앱 격리)
- IndexedDB / OPFS (클라이언트 스토리지)

## 핵심 정책
- ARCH-01: 단일 Next.js 풀스택 (모노레포는 v2)
- ARCH-02: blob: iframe + `sandbox="allow-scripts"` + Comlink
- TECH-01: IndexedDB+OPFS, 서버 동기화는 v2
- TECH-02: Python hooks (`.claude/hooks/*.py`)
- PROD-01: POC 스코프 = 게임 스토어 + 단일 사용자

상세: [`.claude/memory/policy-registry.md`](../../.claude/memory/policy-registry.md)

## 다음 작업 후보
1. **Group E 완료**: `npm install` → `npm run dev` 검증 → 첫 커밋
2. **POC 코드 구현 (별도 plan)**:
   - 윈도우 매니저 (`src/components/desktop/`)
   - 앱 매니페스트 명세 (`src/lib/apps/manifest.ts`)
   - iframe 샌드박싱 SDK (`src/lib/apps/sandbox.ts`)
   - Comlink IPC 어댑터 (`src/lib/apps/ipc/`)
   - 앱 스토어 UI (`src/components/store/`)
   - 첫 샘플 게임 1개 (Phaser 또는 Pixi)

## Quick Links
- PRD: [`project/prd.md`](../project/prd.md)
- 로드맵: [`project/roadmap.md`](../project/roadmap.md)
- 현재 Phase 상세: [`current-phase.md`](current-phase.md)
- 보안 규칙: [`.claude/rules/security.md`](../../.claude/rules/security.md)
- 외부 리서치: [`research/`](../research/)

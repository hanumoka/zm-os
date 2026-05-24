# zm-claude-docs

zm-os 프로젝트 문서 색인.

## 세션 진입 (필독)
- [session/quick-ref.md](session/quick-ref.md) — 1페이지 컨텍스트 (수치/링크/현재 상태)
- [session/current-phase.md](session/current-phase.md) — 현재 Phase 상세

## 프로젝트 (Living)
- [project/prd.md](project/prd.md) — 요구사항 / 기능 인벤토리 / Change Log
- [project/roadmap.md](project/roadmap.md) — 타임라인 / 마일스톤
- [project/feature-map.md](project/feature-map.md) — UI / 스토리지 / 샌드박싱 연결도

## 기능 아키텍처 (features/)
- [features/desktop-window-manager.md](features/desktop-window-manager.md) — 가상 데스크탑 + 윈도우 매니저
- [features/app-store.md](features/app-store.md) — 앱 스토어
- [features/app-sandboxing.md](features/app-sandboxing.md) — iframe 샌드박싱 + Comlink IPC
- [features/app-manifest.md](features/app-manifest.md) — 앱 패키지 매니페스트 명세

## 결정 (ADR)
- [decisions/index.md](decisions/index.md) — ADR 인덱스
- [decisions/adr-0001-initial-stack.md](decisions/adr-0001-initial-stack.md) — 초기 스택
- [decisions/adr-0002-window-manager.md](decisions/adr-0002-window-manager.md) — 윈도우 매니저 라이브러리 (react-rnd)
- [decisions/adr-0003-ipc-surface.md](decisions/adr-0003-ipc-surface.md) — IPC 어댑터 표면
- [decisions/adr-0004-csp-permissions-policy.md](decisions/adr-0004-csp-permissions-policy.md) — CSP/Permissions-Policy 정책
- [decisions/adr-0005-window-state-management.md](decisions/adr-0005-window-state-management.md) — 윈도우 상태 관리 (React Context + useReducer)

## 아카이브
- [archive/](archive/) — 월별 작업 로그

## 외부 리서치
- [research/browser-os-landscape.md](research/browser-os-landscape.md) — Puter/daedalOS/OS.js/WebContainers/v86 비교
- [research/sandboxing-untrusted-js.md](research/sandboxing-untrusted-js.md) — iframe/ShadowRealm/QuickJS-WASM 비교 + CVE
- [research/multitenant-stack-options.md](research/multitenant-stack-options.md) — Supabase/Cloudflare/Puter 비교

## SSOT 매트릭스

| 카테고리 | SSOT 위치 |
|---------|-----------|
| 정책 결정 | `.claude/memory/policy-registry.md` |
| 반복 실수 | `.claude/rules/known-mistakes.md` |
| 트러블슈팅 | `.claude/memory/troubleshooting-patterns.md` |
| 기술 함정 | `.claude/memory/tech-gotchas.md` |
| 보안 규칙 | `.claude/rules/security.md` |
| 요구사항 | `zm-claude-docs/project/prd.md` |
| 로드맵 | `zm-claude-docs/project/roadmap.md` |
| 아키텍처 결정 | `zm-claude-docs/decisions/adr-*.md` |

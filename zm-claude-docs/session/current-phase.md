# Current Phase

## Phase 0 — 초기 셋팅 (진행 중, 2026-05-24)

### 목표
zm-os 저장소에 문서 관리 체계 + Claude Code 셋팅을 구축하여 POC 코드 작성 환경을 준비한다.

### 작업 그룹

| Group | 내용 | 상태 |
|-------|------|------|
| A | Next.js 16 골격 + 루트 설정 (package.json, tsconfig, .gitignore, .gitattributes, .claudeignore, src/app 최소) | ✅ 완료 |
| B | `.claude/` 셋팅 (settings, hooks ×4, agents ×5, skills ×5, rules ×4, memory ×4) | ✅ 완료 |
| C | `zm-claude-docs/` 골격 (README, session, project, features, decisions, archive, research) | 🔄 진행 중 |
| D | CLAUDE.md + README.md 확장 | ⏳ 대기 |
| E | 검증(npm install, npm run dev, tsc) + 첫 커밋 | ⏳ 대기 |

### 최근 변경 (2026-05-24)
- Git remote 연결 (github-personal:hanumoka/zm-os.git) + 첫 push 완료 (README.md 1개)
- Phase 1 외부 리서치 완료 (Explore agent ×3): browser OS landscape / sandboxing / multitenant stack
- 참고 프로젝트 검토 완료: `zm-v3` (메인 참고, 80% 차용), `sonix_docs` (베스트 패턴 부분 차용)
- 사용자 결정: zm-v3+sonix 결합 / 단일 Next.js / `zm-claude-docs/` 별도 폴더
- Plan 승인 완료 (`~/.claude/plans/poc-luminous-cupcake.md`)
- Group A 완료: Next.js 16 + Tailwind v4 + TypeScript strict 골격
- Group B 완료: `.claude/` 전체 구조 + Python hooks

### 블로커
- 없음

### 다음 작업
1. Group C 완료 (현재)
2. Group D: CLAUDE.md (11 섹션) + README.md 확장
3. Group E: `npm install` → `npm run dev` 검증 → mistake-guard 동작 테스트 → broken link 점검 → 첫 커밋 `chore(setup): initial Claude Code config + docs scaffold`
4. (다음 Phase) POC 코드 구현 plan 시작

### 다음 진입 지점 (Phase 1 후보)
- 윈도우 매니저 + 데스크탑 UI 구현
- 앱 매니페스트 명세 + 첫 ADR-0002 (앱 패키지 포맷)
- iframe 샌드박싱 SDK + Comlink IPC 어댑터
- 첫 샘플 게임 1개 (Phaser 시연용)

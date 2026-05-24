# 작업 단위 원칙

## 작업 단위 크기
- 1 단위 = 0.5~1일 분량, 파일 ~10개 이내
- 1 모듈 또는 1 기능 범위 — 모듈 경계를 넘지 않음

## 완료 조건 (모두 충족)
- `npx tsc --noEmit` 에러 0
- `zm-claude-docs/session/current-phase.md` 해당 항목 ✅ 처리
- 월별 작업 로그 (`zm-claude-docs/archive/YYYY-MM.md`) 기록

## 정책 질문 의무
- 구현 전 정책 판단이 필요한 지점에서 반드시 사용자에게 질문
- 선택지 제시 형태로 질문 (A(추천) vs B vs C)
- 질문 없이 임의로 정책 결정 금지
- 사용자 결정 후 → `.claude/memory/policy-registry.md`에 append 또는 갱신

## 자동 검증
- 각 작업 단위 완료 시 `/zm-unit-done` 실행 권장
- 빌드 실패 시 문서/로그 작성 중단 → 수정 후 재검증

## 보안 민감 경로 작업 시
- `src/lib/apps/`, `src/components/desktop/`, `next.config.ts` 변경 포함 시
  → `app-sandbox-auditor` agent 검토 권장

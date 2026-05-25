---
globs: [".claude/memory/**", "docs/03-policy/**"]
---

# Auto Memory Protocol (MANDATORY)

## MEMORY.md 갱신 규칙

다음 상황 발생 시 `.claude/memory/MEMORY.md` 즉시 갱신:

- 아키텍처/설계 결정 확정 → "최근 결정사항" 섹션에 한 줄 추가
- TODO 완료 → `[ ]` → `[x]` 처리
- 프로젝트 수치 변경 → "프로젝트 수치" 섹션 갱신 (LOC, 에이전트 수 등)
- Phase 진행률 변경 → "Project State" 섹션 갱신

## 제약

- "최근 결정사항" 최대 **10건**, FIFO (오래된 항목 제거)
- MEMORY.md 총 **200줄 한도** 초과 방지
- 한 항목당 1~2줄, 날짜 포함 `(YYYY-MM-DD)`

## 정책 레지스트리 동기화

정책 결정 시:
1. `docs/03-policy/01-policy-registry.md` SSOT 등재 (ARCH/TECH/PROD/CONST)
2. `docs/03-policy/_digest.md` 동기화 (요약 1줄 갱신)
3. MEMORY.md "최근 결정사항"에 1줄 기록

## tech-gotchas.md 갱신 시점

- 새 라이브러리 도입 시 → 알려진 함정 추가
- 플랫폼 차이 발견 시 → Windows/macOS/Linux 차이점
- iframe/SSR/CSP 관련 새로운 제약 발견 시

## 소유권

| 대상 | 소유자 | 방식 |
|------|--------|------|
| MEMORY.md 수치 | Auto Memory Protocol | 즉시 Edit |
| MEMORY.md 결정사항 | Auto Memory Protocol | append 전용 |
| policy-registry.md | 사용자 결정 후 기록 | SSOT |
| _digest.md | policy-registry 변경 시 | 동기화 |
| tech-gotchas.md | 발견 즉시 | append |

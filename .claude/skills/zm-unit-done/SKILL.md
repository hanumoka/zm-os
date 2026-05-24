---
name: zm-unit-done
description: 작업 단위 완료 시 빌드 검증 + 문서 갱신 + 작업 로그를 병렬 실행. 코드 변경 작업 완료 후 자동 호출.
disable-model-invocation: false
user-invocable: true
argument-hint: "[작업명]"
---

작업 단위 완료 검증 파이프라인을 실행합니다.

## $ARGUMENTS

작업 단위 이름 (예: "윈도우 매니저 드래그 핸들", "앱 매니페스트 Zod 스키마")
인자가 없으면 git diff에서 추론.

## 실행 순서

### 1단계: 빌드 검증 (필수 — 실패 시 중단)

**build-checker** agent 호출:
- `npx tsc --noEmit` 실행
- 결과: 에러 0이면 PASS, 아니면 FAIL + 에러 목록

### 2단계: 빌드 PASS 시 — 문서 + 로그 (병렬)

**doc-updater** agent:
- `zm-claude-docs/session/current-phase.md` 진행률 갱신
- 완료된 작업 항목 ✅ 처리

**work logging** (직접 또는 work-logger agent):
- `git diff --stat`으로 변경 파일 파악
- `zm-claude-docs/archive/YYYY-MM.md`에 1항목 추가

### 2.5단계: 버그 수정 사후 분석 (조건부)

$ARGUMENTS 또는 git log 최근 메시지에 `fix`/`버그`/`bug`/`수정`/`hotfix`/`error` 키워드가 있으면:
1. `.claude/memory/troubleshooting-patterns.md` 읽기
2. 새 패턴이면 [TS-XXX] 항목 자동 추가 (다음 번호)
3. 중복이면 기존 패턴에 "재발 이력" 1줄 추가
4. 반복 패턴이면 `.claude/rules/known-mistakes.md`에 M-NNN 추가 제안

### 2.7단계: 보안 민감 경로 변경 시 (조건부)

`src/lib/apps/`, `src/components/desktop/`, `next.config.ts` 변경이 포함되면:
- **app-sandbox-auditor** agent 호출 권장 (자동이 아니라 사용자 확인 후)

### 3단계: 결과 종합

```
✅ 빌드: 0 에러
✅ 문서: current-phase.md 진행률 X% → Y%
✅ 로그: zm-claude-docs/archive/YYYY-MM.md 엔트리 추가
✅ 사후 분석: [TS-XXX] 추가 (버그 수정 시에만)
→ 다음 작업: [진행상황 문서에서 자동 추천]
```

## 빌드 실패 시

```
❌ 빌드 실패 — 문서/로그 작성 중단
에러 N개
  - file:line — error message

→ 에러를 수정한 후 다시 /zm-unit-done 실행
```

## 주의사항

- 빌드 실패 시 문서/로그 작성하지 않음 (불완전한 작업 기록 방지)
- 커밋은 수행하지 않음 (사용자 요청 시만 /zm-commit)
- work-logger agent가 없으면 직접 archive/YYYY-MM.md에 append

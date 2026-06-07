# Agent Workflow

> zm-os 에이전트 팀 표준 작업 흐름. 모든 작업 단위는 이 워크플로를 따른다.
> **v2 (2026-05-25)**: 설계 안정성/유연성/확장성 중심 + 2단계 검증 파이프라인.

## 팀 구성 (14명)

### 설계 (3)
- **architect** (opus, 20t) — **필수 게이트**. 인터페이스/모듈 경계/확장 포인트/ADR. 모든 작업의 첫 호출.
- **research-analyst** (sonnet, 15t) — 외부 사실 확인 (모든 주장에 출처 URL)
- **design-reviewer** (opus, 15t) — **필수 게이트**. 구현↔설계 적합성 검증. BLOCK 권한.

### 구현 (2)
- **lib-developer** (sonnet, 25t) — `src/lib/` 추상화 계층
- **fe-developer** (sonnet, 25t) — `src/app/` + `src/components/` UI

### 1차 검증 (4, 병렬)
- **build-checker** (haiku, 5t) — tsc + 변경 파일 grep 우선
- **code-reviewer** (sonnet, 15t, project memory) — TS/SSR/패턴 + **SOLID/확장성** + 학습 누적
- **app-sandbox-auditor** (sonnet, 15t) — iframe/CSP/postMessage/CVE
- **constraint-checker** (haiku, 8t) — 정책/규칙 결정론적 매칭

### 2차 검증 (2, 병렬)
- **integration-tester** (sonnet, 15t) — e2e/통합 검증, Playwright 스크립트 실행, 회귀 감지
- **perf-monitor** (haiku, 8t) — 번들/빌드/런타임 성능 회귀 감시

### 메타 검증 (2)
- **self-verifier** (opus, 15t) — 추측/누락/오판 마지막 게이트. 2단계 전체 결과 종합.
- **zm-context-guardian** (haiku) — 메모리/세션 문서/정책/ADR 인덱스/git 정합성 검증 (읽기전용 보고서). 상태 드리프트 의심 시 또는 대형 변경 후.

### 문서 (1)
- **doc-updater** (haiku, 8t) — 진행 문서 + broken link

## 표준 작업 흐름 (2단계 검증 파이프라인)

```
┌─ 1. architect (필수 게이트) ──────────────────────┐
│  의도 → 인터페이스/모듈/확장 포인트 → ADR           │
│  ※ SKIP 불가 — 모든 작업 반드시 거침               │
└────────────────┬──────────────────────────────────┘
                 │
        ┌────────┴────────┐
        ▼                 ▼
┌─ 2. research-analyst ──┐ (외부 사실 필요 시, 병렬)
│  출처 URL 기반 fact     │
└────────┬───────────────┘
         │
         ▼
┌─ 3. lib-developer ─────────┐   ┌─ 4. fe-developer ─────────┐
│  src/lib/ 구현              │ + │  src/app + components 구현 │ (필요 시 병렬)
└────────────┬────────────────┘   └────────────┬──────────────┘
             └────────────┬────────────────────┘
                          │
                          ▼
             ┌─ 5. design-reviewer (필수 게이트) ─┐
             │  설계↔구현 적합성 검증               │
             │  인터페이스/모듈경계/확장포인트/SOLID │
             │  ※ SKIP 불가 — BLOCK 시 구현 재수정 │
             └────────────┬───────────────────────┘
                          │ (PASS 시에만)
   ┌──────────────────────┴──────────────────────┐
   ▼ (1차 검증: 4명 병렬)                         ▼
┌──────────┐ ┌──────────────┐ ┌────────────────┐ ┌──────────────┐
│ build-   │ │ code-        │ │ app-sandbox-   │ │ constraint-  │
│ checker  │ │ reviewer     │ │ auditor (조건) │ │ checker      │
│          │ │ +SOLID/확장성 │ │                │ │              │
└────┬─────┘ └──────┬───────┘ └───────┬────────┘ └──────┬───────┘
     └──────────────┴─────────┬───────┴─────────────────┘
                              │ (전원 PASS 시)
   ┌──────────────────────────┴──────────────────────────┐
   ▼ (2차 검증: 2명 병렬)                                 ▼
┌──────────────────────┐         ┌───────────────────────┐
│ integration-tester   │         │ perf-monitor          │
│ e2e 통합 + 회귀 검출 │         │ 번들/성능 회귀 감시    │
└──────────┬───────────┘         └───────────┬───────────┘
           └─────────────┬───────────────────┘
                         │ (전원 PASS 시)
                         ▼
                ┌─ 6. self-verifier ──────┐
                │  2단계 전체 결과 종합     │
                │  추측/누락/오판/절차 검증 │
                │  PASS / BLOCK            │
                └────────┬────────────────┘
                         │ (PASS 시에만)
                         ▼
                ┌─ 7. doc-updater ────────┐
                │  진행 문서 갱신          │
                │  broken link 점검        │
                └────────┬────────────────┘
                         ▼
                  (사용자 검토 → /zm-commit)
```

## 단계별 입출력 계약

### 1. architect (필수 게이트)
- **입력**: 작업 의도 (PRD 기능 ID / 사용자 요청 / ADR-NNNN)
- **출력**: 8개 섹션 보고 (의도/기존 자산/인터페이스/모듈 경계/확장 포인트/정책 충돌/ADR 필요 여부/가정)
- **계약**: 코드 작성 안 함. 시그니처만. **SKIP 불가.**
- **확장 포인트**: SOLID 원칙 명시 + 구체적 확장 시나리오 1개 이상

### 2. research-analyst (조건부)
- **입력**: 사실 확인 질문 (라이브러리 비교, CVE, 스펙 등)
- **출력**: 결론 + 근거 URL + 확인 안 된 부분 명시
- **계약**: 출처 없는 주장 금지

### 3. lib-developer
- **입력**: architect 명세 + research-analyst 사실 (해당 시)
- **출력**: `src/lib/*.ts` 코드 + 자가 검증 5단계 결과
- **계약**: architect 명세 시그니처 그대로. 인터페이스 임의 변경 금지.

### 4. fe-developer
- **입력**: architect 명세 + lib-developer export
- **출력**: `src/app/`, `src/components/` 코드 + 자가 검증 5단계 결과
- **계약**: src/lib/ 직접 변경 금지 (lib-developer 영역)

### 5. design-reviewer (필수 게이트)
- **입력**: architect 설계 보고 + 구현 코드 (git diff)
- **출력**: 6항목 적합성 검증 (인터페이스/모듈경계/확장포인트/SOLID/정책/부작용)
- **계약**: 설계-구현 불일치 시 즉시 BLOCK. **SKIP 불가.**
- **BLOCK 시**: 구현 에이전트(lib/fe)가 수정 → design-reviewer 재검증

### 6. 1차 검증 (4명 병렬)

| 에이전트 | 입력 | 핵심 출력 | PASS 조건 |
|---------|------|---------|---------|
| build-checker | 변경 파일 | tsc 결과 + baseline 분리 | 변경 파일 에러 0 |
| code-reviewer | 변경 파일 + MEMORY | Critical/Warning/Info + SOLID + 학습 메모 | Critical 0 |
| app-sandbox-auditor | 보안 민감 경로 변경 | 8 항목 매트릭스 + CVE 매핑 | Critical 0 |
| constraint-checker | 변경 파일 + rules/ | 위반 매트릭스 | Critical 0 |

### 7. 2차 검증 (2명 병렬)

| 에이전트 | 입력 | 핵심 출력 | PASS 조건 |
|---------|------|---------|---------|
| integration-tester | 변경 파일 + e2e 스크립트 | e2e 결과 + 회귀 보고 | 기존 테스트 PASS + 회귀 0 |
| perf-monitor | 변경 파일 + package.json | 번들/빌드 시간 비교 | 차단 임계치 미초과 |

### 8. self-verifier
- **입력**: 위 모든 산출물 + design-reviewer 보고 + 1차/2차 검증 보고서
- **출력**: 5 항목 메타 검증 (사실/가정, 누락, 오판, 추측, 표준 절차)
- **계약**: 의심나면 BLOCK. PASS 시에만 doc-updater 진행 허용.
- **표준 절차 확인**: architect(필수) → design-reviewer(필수) → 1차(4명) → 2차(2명) 전체 경로

### 9. doc-updater
- **입력**: 작업 단위 의도 + 변경 요약 + ADR 초안 (해당 시)
- **출력**: 7개 문서 갱신 + broken link 점검
- **계약**: self-verifier PASS 전 호출 금지

## 작업 단위 크기

- 1 단위 = 0.5~1일 + 파일 ~10개 이내 (`.claude/rules/work-units.md`)
- 초과 시 architect 단계에서 분할

## 정책 결정 게이트

architect 또는 design-reviewer 또는 self-verifier에서 정책 결정이 필요한 지점 발견 시:
- 자동 결정 금지
- 사용자에게 선택지(A/B/C) 제시 후 결정 받기
- 결정 후 → `docs/03-policy/01-policy-registry.md` 에 ARCH/TECH/PROD/CONST 등재

## 실패 시 복구

### 설계 단계 실패
- architect 누락 → 작업 중단, architect 호출 후 재시작

### 구현 후 design-reviewer BLOCK
- 불일치 항목 → 해당 구현 에이전트(lib/fe) 수정 → design-reviewer 재검증
- 인터페이스 불일치 → architect 명세도 갱신 필요할 수 있음 (사용자 확인)

### 1차 검증 실패
- build-checker FAIL → lib-developer / fe-developer 수정 후 재실행
- code-reviewer Critical → 해당 에이전트 (lib/fe) 수정 후 재리뷰
- app-sandbox-auditor Critical → 보안 우선 (lib-developer) 수정 + 사용자 알림
- constraint-checker Critical → 위반 규칙 매핑 확인 후 수정

### 2차 검증 실패
- integration-tester REGRESSION → 회귀 원인 추적 → 구현 수정 → 1차+2차 재검증
- integration-tester FAIL → 구현 수정 → design-reviewer부터 재검증
- perf-monitor OVER THRESHOLD → 원인 분석 → 구현 최적화 또는 사용자 확인

### 메타 검증 실패
- self-verifier BLOCK → 차단 사유 해결 후 재검증 (가장 흔한 경우: 가정 발견 → research-analyst 추가 호출)

## 호출 권장 (사용자 또는 메인 Claude가 결정)

작업 진입 시:
```
"architect로 작업 N 설계 시작"
```

설계 적합성 검증 시:
```
"design-reviewer로 설계 적합성 검증"
```

1차 검증 단계 시:
```
"build-checker / code-reviewer / app-sandbox-auditor / constraint-checker 4명 병렬로 검증"
```

2차 검증 단계 시:
```
"integration-tester / perf-monitor 2명 병렬로 검증"
```

종료 직전:
```
"self-verifier로 마지막 게이트"
```

PASS 후:
```
"doc-updater로 진행 문서 갱신"
```

## POC vs v2 워크플로 차이

| 항목 | POC (v1) | v2 (현재) |
|------|----------|----------|
| 우선순위 | 속도 > 보안 > 품질 | 설계 안정성 > 유연성 > 확장성 |
| architect | 권장 | **필수 게이트** |
| design-reviewer | 없음 | **필수 게이트** |
| 검증 단계 | 1단계 (4명) | 2단계 (4명 + 2명) |
| SOLID 검사 | 없음 | code-reviewer + design-reviewer |
| 통합 검증 | 수동 | integration-tester 자동 |
| 성능 감시 | 수동 | perf-monitor 자동 |
| 팀 규모 | 10명 | 13명 → 14명 (협업 인프라로 zm-context-guardian 추가) |

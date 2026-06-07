# 반복 실수 레지스트리 (Known Mistakes)
> 매 세션 자동 로드 (CLAUDE.md에서 참조). 새 실수 발견 시 M-NNN+1 추가.
> [BLOCK] 항목은 `mistake_guard.py`가 동적 파싱하여 자동 차단합니다.

## 카테고리 A: 코드 패턴
| ID | 심각도 | 실수 | 올바른 방법 | 탐지 |
|----|--------|------|------------|------|
| M-001 | [WARN] | 객체 리터럴 `{ __proto__: true }` 로 멤버십 검사 — own property 아님 (prototype slot 설정으로 해석 부작용) | 배열 + indexOf 또는 `new Set([...])` 사용 | Write/Edit |

## 카테고리 B: 실행 환경
| ID | 심각도 | 실수 | 올바른 방법 | 탐지 |
|----|--------|------|------------|------|
| M-002 | [BLOCK] | `git add -A` 또는 `git add .` — 본 작업 무관/타 세션 변경물 우연 포함 (sonix M-119 이식) | `git add <명시파일>` 개별 지정 (공백 구분) | Bash |
| M-003 | [BLOCK] | `--no-verify` — pre-push secret 스캔(gitleaks/regex) 우회 (sonix M-120 이식) | hook 실패 시 secret 제거 후 재push. hook 자체 문제면 별건으로 수정 | Bash |

## 카테고리 C: 작업 방식
| ID | 심각도 | 실수 | 올바른 방법 | 탐지 |
|----|--------|------|------------|------|
| (등록 없음) |  |  |  |  |

---

## 형식 규칙

- **ID**: M-001, M-002, ... (zm-os 통합 번호)
- **심각도**:
  - `[BLOCK]` — `mistake_guard.py`가 자동 차단 (Bash 탐지 시)
  - `[WARN]` — 경고만
  - `✅ RESOLVED` — 해결됨 (기록 보존)
- **탐지**: `Bash` / `Write/Edit` / `수동`
- **자동 차단을 원하는 [BLOCK] Bash 패턴**: 실수 컬럼에 매칭 키워드를 백틱(`)으로 묶기
  - 예: `` `docker compose restart` `` → 이 문자열이 Bash 명령에 포함되면 차단
  - 공백 포함 패턴은 단어 사이를 자유 공백으로 매칭

## 등록 가이드

새 실수 발견 시:
1. 다음 M-NNN 번호 할당
2. 적절한 카테고리에 행 추가
3. [BLOCK]은 신중하게 — false positive가 많으면 작업에 방해
4. 관련 트러블슈팅이 있으면 `.claude/memory/troubleshooting-patterns.md` 의 TS-NNN과 연결

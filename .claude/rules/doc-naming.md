---
globs: ["docs/**"]
---

# Document Naming Convention (MANDATORY)

`docs/` 하위에 새 파일 생성 시 반드시 아래 규칙을 따른다.

## 공통 규칙

1. **파일명**: 영문 소문자 + 숫자 + 하이픈(`-`). 언더스코어(`_`) 금지 (시스템 파일 제외)
2. **확장자**: `.md`
3. **인덱스**: 폴더 인덱스는 `index.md`
4. **특수 접두사**: `_` 접두사는 시스템 파일만 허용 (`_digest.md`)
5. **번호 발급**: 해당 폴더의 마지막 번호 +1

## 폴더별 패턴

### `01-architecture/` — `NN-kebab-case.md`
- 예: `01-desktop-window-manager.md`
- 순차 2자리 번호. 현재 마지막: **05**

### `02-decisions/` — `adr-NNNN-kebab-case.md`
- 예: `adr-0009-next-topic.md`
- 순차 4자리 번호. 현재 마지막: **0008**

### `03-policy/` — `NN-kebab-case.md` + `_digest.md`
- 예: `01-policy-registry.md`
- `_digest.md`는 정책 요약 (시스템 파일)

### `04-planning/` — `NN-kebab-case.md`
- 예: `01-prd.md`, `02-roadmap.md`

### `05-analysis/` — `NN-kebab-case.md`
- 예: `01-browser-os-landscape.md`

### `06-security/` — `NN-kebab-case-YYYY-MM-DD.md`
- 예: `01-phase-1-audit-2026-05-24.md`

### `07-testing/` — `NN-kebab-case.md`
- 예: `01-e2e-test-strategy.md`

### `10-session/` — 고정 이름 (번호 없음)
- `quick-ref.md`, `current-phase.md`

### `11-archive/` — `YYYY-MM.md`
- 예: `2026-05.md`

### `13-troubleshooting/` — 고정 구조
- `index.md` — TS 인덱스 테이블
- `entries.md` — 상세 엔트리 (최신 선두)

## 결번 (POC 미사용, v2 도입 시 추가)

| 번호 | 용도 | 비고 |
|------|------|------|
| 08 | deployment | POC는 로컬 dev 서버만 |
| 09 | migration | 별도 마이그레이션 불필요 |
| 12 | changelog | roadmap Change Log로 충분 |

## 금지 사항

- [WARN] CamelCase 파일명
- [WARN] 공백 포함 파일명
- [WARN] 한글 파일명 (docs/ 내 MD)
- [WARN] 번호 중복 또는 건너뛰기
- [WARN] 기존 파일 번호 재매김

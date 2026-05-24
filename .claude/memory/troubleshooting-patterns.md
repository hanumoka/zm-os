# 트러블슈팅 패턴 (Troubleshooting Patterns)
> 버그 사후 분석 SSOT. 새 패턴 발견 시 TS-NNN+1 추가.

## TS-NNN 형식

```markdown
### [TS-NNN] 제목

**증상**: 사용자가 본 현상
**원인**: 근본 원인 (현상의 원인이 아닌 진짜 원인)
**해결**: 실제 변경 사항
**관련 파일**: 변경된 파일 경로 (라인 번호 포함)
**날짜**: YYYY-MM-DD
**재발 이력**: (반복 발생 시 날짜 추가)
**관련 M-NNN**: (반복 패턴이면 known-mistakes.md 항목과 연결)
```

## Active Patterns

(현재 0건)

---

## 사용 가이드

- **모호한 기록 금지** — 증상/원인/해결 모두 구체적으로
- **관련 파일 경로**는 프로젝트 루트 기준 상대 경로
- **시크릿/토큰은 마스킹** 처리
- 동일 패턴 3회 이상 → `.claude/rules/known-mistakes.md`에 M-NNN 추가 제안
- [BLOCK] 수준 → `mistake_guard.py`가 파싱할 수 있도록 known-mistakes.md에 백틱 인용 패턴으로 등록

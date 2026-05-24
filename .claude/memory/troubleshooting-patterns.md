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

### [TS-001] React StrictMode useEffect 안 setInterval cleanup 누락

**증상**: useEffect 안에서 `const pollId = setInterval(...)`로 만든 interval이 cleanup에서 `clearInterval` 안 됨. React StrictMode unmount/remount 시 stale interval 누수.
**원인**: `pollId`가 fetch().then() 콜백 안에서 생성되어 effect scope의 cleanup에서 참조 불가.
**해결**: `pollId`를 effect-scope `let`로 선언(`let pollId: ReturnType<typeof setInterval> | null = null`), then 콜백에서 할당, cleanup에서 `if (pollId !== null) clearInterval(pollId)` 명시.
**관련 파일**: `src/app/sandbox-test/page.tsx:88-164`
**날짜**: 2026-05-24
**관련 M-NNN**: (없음 — 1회 발생, 3회 누적 시 known-mistakes 등재)

### [TS-002] 호스트→앱 RPC 권한 게이트의 `length > 0` 부울 결함

**증상**: `!_grantedMethods.includes(method) && _appMethods.length > 0` 게이트에서 `_appMethods=[]` (앱이 INIT에서 메서드 미announce) 시 게이트가 우회되어 임의 호출 통과.
**원인**: AND 조건의 두 번째 가드(`length > 0`)가 의도와 반대로 게이트를 무력화.
**해결**: 다음 작업 단위에서 `_appMethods.length > 0` 조건 제거 또는 `_grantedMethods.includes(method)` 단독 사용.
**관련 파일**: `src/lib/apps/ipc/host.ts:279`
**날짜**: 2026-05-24 (발견)
**상태**: 다음 작업 단위 우선 처리 예정
**관련 M-NNN**: (없음 — 1회 발생)

---

## 사용 가이드

- **모호한 기록 금지** — 증상/원인/해결 모두 구체적으로
- **관련 파일 경로**는 프로젝트 루트 기준 상대 경로
- **시크릿/토큰은 마스킹** 처리
- 동일 패턴 3회 이상 → `.claude/rules/known-mistakes.md`에 M-NNN 추가 제안
- [BLOCK] 수준 → `mistake_guard.py`가 파싱할 수 있도록 known-mistakes.md에 백틱 인용 패턴으로 등록

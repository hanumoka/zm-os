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
**해결**: `_appMethods.length > 0` 조건 제거. `_status === 'ready' && !_grantedMethods.includes(method)` 단일 조건으로 변경. 앱이 메서드를 announce 안 한 경우 `_grantedMethods=[]` → 모든 호출이 `denied`로 정상 거부됨.
**관련 파일**: `src/lib/apps/ipc/host.ts:279-289`
**날짜**: 2026-05-24 (발견 + 해소 모두 같은 날)
**상태**: ✅ 해소 (작업 2.5에서 즉시 수정 — code-reviewer PASS)
**관련 M-NNN**: (없음 — 1회 발생)

### [TS-003] AppFrame StrictMode `useRef` guard 가 두 번째 mount 차단 (e2e 검증 발견)

**증상**: 메인 페이지 `/` 의 두 윈도우 (Bouncing Ball, IPC Demo) 본문이 모두 비어 있음. iframe 이 mount 되지 않음. 사용자 e2e 검증에서 발견.

**원인**: `AppFrame.tsx` useEffect 안에 `const initRef = useRef(false); if (initRef.current) return; initRef.current = true;` guard 적용. React 19 StrictMode 의 mount → unmount → remount 사이클에서, 1차 mount 가 `initRef.current = true` 로 마킹하고 fetch 시작 → StrictMode unmount cleanup 이 `destroyed = true` 만 설정 (handle 은 아직 null) → 2차 mount effect 가 `if (initRef.current) return;` 에서 차단되어 fetch+createSandboxedFrame 미실행. 결과 iframe 없음, 화면 빈 본문.

**해결**: `initRef` guard 완전 제거. cleanup 의 `let destroyed = false;` flag 만으로 race 처리.
- 1차 mount fetch 의 .then 콜백이 cleanup 후 도착하면 `if (destroyed) return;` 으로 skip
- 2차 mount 는 새 useEffect 클로저 + 새 destroyed=false 로 자유롭게 실행 → 정상 iframe mount

**관련 파일**: `src/components/desktop/AppFrame.tsx`
**날짜**: 2026-05-24 (발견 + 해소 같은 날, 사용자 e2e 스크린샷 검증 ✅)
**상태**: ✅ 해소
**관련 M-NNN**: M-001 (W-01 useRef guard 누락) 과 짝 — frontend.md 보강으로 적용 조건 정밀화

**적용 조건 정밀화**:
- `useRef` guard 적용 OK: **동기적 1회 부작용** (예: `manager.open()` 등록, 전역 리스너 등록)
- `useRef` guard 적용 부적합: **비동기 fetch + DOM mount** (cleanup 의 destroyed flag 가 더 적절)
- 핵심: StrictMode unmount→remount 시 1차의 `initRef.current=true` 가 2차 mount effect 진입을 차단

---

## 사용 가이드

- **모호한 기록 금지** — 증상/원인/해결 모두 구체적으로
- **관련 파일 경로**는 프로젝트 루트 기준 상대 경로
- **시크릿/토큰은 마스킹** 처리
- 동일 패턴 3회 이상 → `.claude/rules/known-mistakes.md`에 M-NNN 추가 제안
- [BLOCK] 수준 → `mistake_guard.py`가 파싱할 수 있도록 known-mistakes.md에 백틱 인용 패턴으로 등록

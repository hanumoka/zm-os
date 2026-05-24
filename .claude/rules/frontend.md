---
paths:
  - "src/**/*.tsx"
  - "src/**/*.ts"
---

# Frontend (Next.js 16 + React 19) 규칙

## 기본
- Tailwind CSS v4 클래스 사용 (인라인 스타일 금지)
- `'use client'` 디렉티브는 필요한 컴포넌트에만 (서버 컴포넌트 기본)
- 외부 fetch는 `src/lib/api/` 클라이언트 사용 (raw fetch 금지)
- 클라이언트 스토리지는 `src/lib/storage/` 헬퍼 경유
- TypeScript strict, any 금지, 함수 반환 타입 명시

## 디렉토리 컨벤션
- 가상 데스크탑 UI: `src/components/desktop/`
- 앱 스토어 UI: `src/components/store/`
- 공용 UI primitives: `src/components/ui/` (shadcn/ui 도입 시)
- 앱 매니페스트/샌드박싱/IPC: `src/lib/apps/`
- API 클라이언트: `src/lib/api/`
- 클라이언트 스토리지: `src/lib/storage/` (IndexedDB/OPFS 추상화)
- API route handlers: `src/app/api/`

## SSR 안전 규칙
- `window` / `document` / `localStorage` 접근은 `useEffect` 내부에서만
- StrictMode double-execute: API 호출 useEffect에 `useRef` guard 필수

## App Router 주의
- route group `(group)`은 URL 세그먼트 미생성 — `app/(auth)/login/page.tsx` → URL은 `/login`
- Next.js 16에서 localhost 이미지 최적화: `dangerouslyAllowLocalIP: true` 필요 시 `next.config.ts`에 명시 (기본값 false)
- route handler 응답: `Response` 또는 `NextResponse` 사용

## React 19 권장 패턴
- `forwardRef` 불필요 — ref가 일반 prop처럼 작동
- form 상태는 `useFormStatus` / `useActionState` 활용
- Promise는 `use()` hook + Suspense

## 자주 발생하는 위반 (code-reviewer 누적)

- **StrictMode useRef guard — 적용 조건 정밀화** (2026-05-24, code-reviewer W-01 + e2e TS-003):
  `useEffect(fn, [])` 안 부작용 처리 시 use case 에 따라 두 패턴을 구분.

  **(a) `useRef` guard 적용 OK — 동기적 1회 부작용**
  예: `store.open()` / `manager.open()` 호출, 전역 리스너 등록 등 race 가 없는 즉시 종료 작업.
  ```ts
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    // 동기 부작용 호출 (1회 보장)
  }, []);
  ```
  reducer/store 자체에 중복 guard 가 있어도 dev StrictMode 노이즈 차단용으로 권장.

  **(b) `useRef` guard 부적합 — 비동기 fetch + DOM mount/destroy**
  예: `AppFrame` 의 fetch → createSandboxedFrame → handle.destroy() 같은 비동기 + lifecycle 작업.
  StrictMode 의 mount→unmount→remount 에서 1차의 `initRef.current=true` 가 2차 mount 의 effect 를
  차단해 fetch+iframe 생성이 누락됨 (TS-003 e2e 검증). cleanup 의 `destroyed` flag 로 race 처리:
  ```ts
  useEffect(() => {
    let destroyed = false;
    const handleRef = { current: null as Handle | null };
    fetch(url).then(html => {
      if (destroyed) return; // 1차 cleanup 후 도착한 응답은 skip
      handleRef.current = createSandboxedFrame(...);
    });
    return () => {
      destroyed = true;
      handleRef.current?.destroy();
    };
  }, []);
  ```
  2차 mount 는 새 클로저 + 새 destroyed=false 로 자유롭게 실행. 1차 cleanup 이 destroyed=true 설정으로 1차의 잔여 .then 만 차단.

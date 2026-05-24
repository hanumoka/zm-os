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

- **StrictMode useRef guard 누락** (2026-05-24, code-reviewer W-01 발견):
  `useEffect(fn, [])` 안에서 mount 시 1회만 실행되어야 하는 부작용 (예: store.open(), API 등록) 호출 시 `useRef` guard 필수.
  ```ts
  const initRef = useRef(false);
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;
    // 부작용 호출
  }, []);
  ```
  reducer/store 자체에 중복 guard가 있어도 dev StrictMode 노이즈를 막기 위해 명시적 권장.

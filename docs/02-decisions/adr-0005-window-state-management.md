---
number: "0005"
title: 윈도우 상태 관리 방식 — React Context + useReducer (POC v1)
status: accepted
date: 2026-05-24
author: hanumoka
related: ["0001", "0002"]
---

# ADR-0005: 윈도우 상태 관리 방식 — React Context + useReducer (POC v1)

## Context

zm-os POC 1차 작업 4(DSK-01)에서 가상 데스크탑의 다중 윈도우 상태(열기/닫기/최소화/최대화/포커스/위치/크기)를 관리할 클라이언트 상태 저장소가 필요하다.

후보 세 가지를 architect가 비교했다:
- **A. React Context + useReducer** — 외부 의존성 0, React 19 표준 API
- **B. Zustand** — 경량 글로벌 스토어, 선택적 구독 지원
- **C. URL 상태(searchParams)** — 공유/북마크 가능

상태 범위: 윈도우 목록(id/title/contentId/state/zIndex/position/size), POC 단계 동시 열린 윈도우 5-10개 가정.

## Decision

**P1=A 채택: React Context + useReducer**

`WindowManagerProvider`가 `useReducer`로 윈도우 배열 상태를 관리하고, `WindowManagerContext`를 통해 `useWindowManager()` 훅으로 노출한다.

### 채택 사유
1. **외부 의존성 0**: Zustand 등 추가 패키지 불필요. react-rnd 외 상태 라이브러리를 더하지 않는다.
2. **React 19 표준**: `useReducer` + `createContext` + `useCallback`으로 구성 — 프레임워크 표준 범위 안.
3. **POC 단순성 우선**: 5-10개 윈도우 규모에서 Provider 재렌더링 비용이 실질적 문제가 되지 않는다(가정 A4).
4. **인터페이스 안정성**: `WindowManager` 타입(§3.2)을 변경하지 않으므로 v2 reshape 시 내부 구현만 교체 가능.
5. **테스트 용이성**: React Testing Library로 `renderWithProvider` 패턴 적용 가능, 모킹 불필요.

## Consequences

### Positive
- **의존성 없음**: 추가 번들 크기 0. tree-shaking 불필요.
- **표준 React API**: 팀 온보딩 비용 최소.
- **타입 안전**: TypeScript strict 모드, `WindowAction` 유니온 타입으로 exhaustive 처리.
- **인터페이스 동결**: `WindowManager` (§3.2) 시그니처가 고정되어 있으므로 fe-developer, 테스트 코드가 안정적으로 의존 가능.

### Negative
- **Provider 재렌더링 비용**: `windows` 배열이 변경될 때마다 Context 구독 컴포넌트 전체 재렌더링. 윈도우 수가 20개 이상으로 증가하면 병목 가능.
- **persist 직접 구현 필요**: Zustand의 `persist` 미들웨어처럼 자동 직렬화가 없으므로, 세션 복원이 필요할 경우 `useEffect` + `localStorage` 직접 구현 필요.
- **선택적 구독 미지원**: 특정 윈도우 상태만 구독하려면 `use-context-selector` 도입 또는 Context 분리 필요.

### v2 reshape 경로
- `WindowManager` 인터페이스(§3.2)가 동일하므로 Zustand로 전환 시 `WindowManagerProvider` 내부만 교체.
- `use-context-selector` 도입으로 선택적 구독 적용도 인터페이스 변경 없이 가능.
- reshape 트리거: 동시 열린 윈도우 20개 이상, 또는 persist/undo 요구사항 추가 시.

## Alternatives Considered

### B. Zustand
- 선택적 구독(`useStore(selector)`)으로 불필요한 재렌더링 차단 가능.
- `persist` 미들웨어로 세션 복원 용이.
- **기각 사유**: 외부 의존성 추가(번들 ~3kB gzip), POC 5-10개 윈도우 규모에서 과함. 인터페이스(§3.2) 동일하므로 v2에서 언제든 전환 가능.

### C. URL 상태(searchParams)
- 페이지 새로고침 후 윈도우 배열 복원, 공유 링크 가능.
- **기각 사유**: position/size/zIndex 등 다중 윈도우 직렬화가 URL 길이 한계에 걸림. 드래그 중 URL 변경이 비실용적. 데스크탑 UX 패턴과 맞지 않음.

## 모듈 구조

```
src/components/desktop/
├── types.ts                  — 공유 타입 (WindowProps, WindowManager, WindowState, ...)
├── windowReducer.ts          — 순수 reducer (WindowAction, windowReducer)
├── WindowManagerProvider.tsx — Context Provider + useWindowManagerContext()
├── useWindowManager.ts       — 공개 훅 (WindowManagerProvider 내부에서만 호출)
└── Window.tsx                — react-rnd 래퍼 컴포넌트 (controlled/uncontrolled 양면)
```

## 의존성 그래프 (순환 없음)

```
types ← windowReducer ← WindowManagerProvider ← useWindowManager
types ← Window
```

`Window`는 `useWindowManager`를 import하지 않는다(controlled 패턴, architect §4).

## References

- ADR-0001: 초기 스택 (Next.js 단일 풀스택)
- ADR-0002: 윈도우 매니저 라이브러리 — react-rnd 채택
- architect §3 인터페이스 명세 (WindowProps, WindowManager, WindowState, WindowOpenInit)
- architect §7 ADR-0005 초안
- architect §8 가정 A4 (다중 윈도우 5-10개 POC 단계 허용), A8 (z-index base=10, step=1)

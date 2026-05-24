# Feature: Desktop + Window Manager (DSK-01~03)

**Status**: 계획 (Phase 1)
**Owner**: TBD
**Related PRD**: §3 DSK-01, DSK-02, DSK-03

## 개요

브라우저 화면을 가상 데스크탑처럼 사용. 사용자 앱(게임)이 윈도우 단위로 떠서 드래그/리사이즈/포커스 가능.

## 설계 (작업 1~6 완료, 2026-05-24)

- 컴포넌트 위치: `src/components/desktop/`
  - `Window.tsx` — react-rnd 래퍼 (dragHandleClassName='window-titlebar' 하드코딩)
  - `useWindowManager.ts` + `WindowManagerProvider.tsx` — Context + useReducer
  - `windowReducer.ts` — open/close/minimize/maximize/restore/focus/setPosition/setSize
  - `types.ts` — WindowProps, WindowState, WindowManager 등
  - `Desktop.tsx` (작업 5) — 데스크탑 컨테이너 + bounds="parent" 레이아웃
  - `DesktopIcon.tsx` (작업 5) — 아이콘 (a11y role/tabIndex/aria)
  - `Taskbar.tsx` (작업 6) — 작업표시줄
  - `TaskbarButton.tsx` (작업 6)
  - `Clock.tsx` (작업 6) — SSR 안전 시계
  - `AppFrame.tsx` (작업 5) — sandbox iframe lifecycle wrapper
  - `desktopApps.ts` (작업 5) — 카탈로그 (Bouncing Ball + IPC Demo, ADR-0006)
- 결정: react-rnd (ADR-0002) + Context+useReducer (ADR-0005) + 하드코딩 카탈로그 (ADR-0006)
- 통합: `src/app/page.tsx` 가 Desktop으로 메인 페이지 전환 (작업 5)
- 미결정 항목 (v2 reshape):
  - 키보드 접근성 (현재 react-rnd 미지원)
  - IndexedDB persist (아이콘/윈도우 위치)

## 의존성

- 윈도우 매니저 라이브러리 선택 (react-rnd vs dnd-kit vs 자작)
- 데스크탑 상태 관리 (Zustand 또는 React 19 useReducer)

## 미결정

- 윈도우 매니저 라이브러리 (ADR 필요)
- 데스크탑 배경/아이콘 디자인 (POC는 미니멀)

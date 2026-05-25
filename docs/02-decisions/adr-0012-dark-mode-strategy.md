---
number: "0012"
title: "다크 모드 CSS 전략 — Tailwind v4 class 기반 dark variant"
status: "accepted"
date: "2026-05-25"
author: "architect + hanumoka"
related: ["TECH-06", "DSK-05"]
---

# ADR-0012: 다크 모드 CSS 전략

## Context

DSK-05 데스크탑 커스터마이징에서 라이트/다크/시스템 테마를 지원해야 한다.
Tailwind v4는 기본적으로 `@media (prefers-color-scheme: dark)` 기반 dark variant를 제공하지만,
사용자가 수동으로 라이트/다크를 토글하려면 class 기반 전략이 필요하다.

## Decision

1. **Tailwind v4 dark variant**: `@custom-variant dark (&:where(.dark, .dark *))` 를 `globals.css`에 선언.
   - `class` 기반 전략으로 `<html class="dark">` 토글.
   - `:where()` 사용으로 specificity 충돌 방지.

2. **Hydration mismatch 방어**:
   - `layout.tsx`의 `<html>`에 초기 className 없이 렌더.
   - `DesktopSettingsProvider`의 `useEffect`에서 mount 후 `document.documentElement.classList` 조작.
   - 초기 로드 시 flash (FOUT) 허용 — POC 단계에서는 복잡도 최소화 우선.

3. **system 모드**: `matchMedia('(prefers-color-scheme: dark)')` 리스너로 실시간 추종.

4. **영속화**: StorageAdapter `desktop-settings` namespace.

## Consequences

- (+) 사용자 수동 토글 + 시스템 팔로우 동시 지원
- (+) Tailwind v4 dark: variant로 기존 컴포넌트에 `dark:` 접두사만 추가
- (-) 초기 로드 시 라이트→다크 flash 가능 (POC 허용)
- v2: 인라인 blocking 스크립트 또는 cookie 기반 SSR 힌트로 flash 제거

## Alternatives

1. **media 전략만**: 수동 토글 불가 → 요구사항 불충족
2. **CSS variables 기반 테마 엔진**: 완전한 커스텀 테마 가능하나 POC 과다
3. **next-themes 라이브러리**: 검증된 솔루션이나 의존성 추가. POC에서는 직접 구현 선호

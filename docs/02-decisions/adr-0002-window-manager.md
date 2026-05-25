---
number: "0002"
title: 윈도우 매니저 라이브러리 — react-rnd 채택 (POC v1)
status: accepted
date: 2026-05-24
author: hanumoka
related: ["0001"]
---

# ADR-0002: 윈도우 매니저 라이브러리 — react-rnd 채택 (POC v1)

## Context

zm-os POC 1차에 가상 데스크탑(다중 윈도우 드래그/리사이즈/포커스/z-index/최소화/최대화)이 필요하다 (PRD §3 DSK-01~03). 각 윈도우는 격리된 iframe(sandbox)를 호스팅하므로 윈도우 매니저는 iframe과 충돌하지 않게 드래그 핸들을 타이틀바로 제한할 수 있어야 한다.

후보 3가지를 research-analyst가 1차 자료로 비교했다 (출처는 본 ADR 하단 References):
- **react-rnd** — 드래그 + 리사이즈 + z-index + bounds + grid snap 통합 라이브러리
- **@dnd-kit/core + 리사이즈 자작** — 드래그 + 접근성 우수, 리사이즈 미지원
- **자작** — Pointer Events + React Hooks 직접 구현

## Decision

**`react-rnd` v10.5.3을 POC v1 윈도우 매니저로 채택한다.**

### 채택 사유
1. **기능 완성도**: 드래그/리사이즈/z-index/bounds/grid snap 통합 제공. POC 도메인 요구사항을 추가 구현 없이 충족.
2. **유지보수 상태**: 2026-03-10 v10.5.3 릴리스 (활발). dnd-kit 6.3.1은 1년 이상 정체.
3. **React 19 호환성**: 16.3.0+ 지원으로 React 19 안정 동작. dnd-kit는 "use client" 지시자 미지원으로 server component 사용 시 제약.
4. **TypeScript 품질**: 90.9% TS 코드베이스로 번들 타입 제공. 별도 @types 불필요.
5. **검증된 사용 사례**: daedalOS(브라우저 데스크탑 환경)가 동일 도메인에서 react-rnd 채택.
6. **POC 속도**: `<Rnd default={{x, y, width, height}}>` 형태로 즉시 사용 가능. 학습 곡선 낮음.
7. **라이선스**: MIT (zm-os 사용에 제약 없음).

### v2 reshape 경로
- POC 검증 후 키보드 접근성(ARIA, Tab navigation)이 우선순위가 되면 dnd-kit 또는 자작으로 이주 검토. 본 ADR 채택은 v1 한정으로 v2 reshape를 막지 않는다.
- 윈도우 매니저 API 표면은 `src/components/desktop/` 안에 wrapper 컴포넌트(`<Window>`)로 캡슐화 — 라이브러리 교체 시 wrapper만 다시 작성.

## Consequences

### Positive
- POC 1차 작업 4 (DSK-01 윈도우 매니저) 구현 시간 단축 (자작 대비 약 2-3주 절감 — research-analyst 추정).
- 검증된 의존성 — react-draggable + re-resizable 조합으로 엣지 케이스 사전 처리.
- 향후 작업표시줄 동기화, 풀스크린/최대화는 wrapper에서 상태 관리.

### Negative
- 키보드 접근성(Tab navigation) 부재. POC 1차 비목표지만 v2 도입 시 한계.
- 번들 추가 (정확한 gzip 크기는 미확인, 추정 ~40-50kB). POC 단계에서는 무시 가능.
- 외부 의존성 추가 — Snyk CVE 추적 대상에 react-rnd / react-draggable / re-resizable 포함 필요.

### 후속 작업
- 작업 4 (DSK-01) 진입 시 `npm install react-rnd`
- `src/components/desktop/Window.tsx` 에서 react-rnd `<Rnd>`를 래핑한 `<Window>` 컴포넌트 작성
- 드래그 핸들을 타이틀바 클래스(`dragHandleClassName="window-titlebar"`)로 제한 — iframe 클릭 가로채기 방지

## Alternatives Considered

### B. @dnd-kit/core + 리사이즈 자작
- 드래그 + 키보드 접근성(ARIA) 우수
- 리사이즈 미지원 → 8방향 핸들 자작 약 1-2주 추가
- 1년 이상 정체된 유지보수 → 신규 도입에 부적합
- React 19 "use client" 지시자 이슈 진행 중 (#1654)
- **기각**

### C. 자작 (Vanilla Pointer Events + React Hooks)
- 의존성 0, 완전 통제, 학습 가치
- 드래그+리사이즈+z-index+최소화/최대화 = ~300-500 LOC 추정 (research-analyst)
- 구현/테스트/엣지 케이스 대응 약 3-4주 — POC 1차 속도 목표와 충돌
- 리플로우/repaint 최적화, transform/will-change 튜닝 등 별도 작업 필요
- **기각** (POC v1 단계엔 과함. v2 reshape 후보로 유지)

## References

- react-rnd: https://github.com/bokuweb/react-rnd
- @dnd-kit/core: https://github.com/clauderic/dnd-kit
- daedalOS (참고 사례): https://github.com/DustinBrett/daedalOS
- dnd-kit 리사이즈 미지원 확인: https://github.com/clauderic/dnd-kit/discussions/1605
- dnd-kit React 19 호환성 이슈: https://github.com/clauderic/dnd-kit/issues/1654
- research-analyst 보고 (본 세션 컨텍스트 + zm-claude-docs/research/ 보관 후보)

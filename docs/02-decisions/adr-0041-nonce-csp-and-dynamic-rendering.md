---
number: "0041"
title: 요청별 nonce CSP + 동적 렌더링 — 정적 헤더 모델 대체
status: accepted
date: 2026-09-03
author: hanumoka
related: ["0004", "0001"]
implementation: done
measured_at: bbaede7 (2026-09-03)
---

# ADR-0041: 요청별 nonce CSP + 동적 렌더링 — 정적 헤더 모델 대체

> **이 ADR은 소급 기록이다.** 결정과 구현은 2026-08-15에 이루어졌고 상위 근거는 `zm-docs`의
> `DEC-0009`에 있다. **이 저장소에는 그 구현 결정의 ADR이 없었다** — 그래서 `ADR-0004`가
> "정적 헤더 모델"을 `accepted`로 선언한 채 코드와 정반대로 남아 있었다.

## Context

`ADR-0004`는 POC 1차에 **정적 문자열 CSP**를 채택했다. 기각 사유는 *"nonce는 요청마다 새 값을
생성해야 하므로 Next.js middleware 없이는 구현 불가"* 였다.

2026-08-15 프로덕션 빌드 실측이 그 모델의 결과를 드러냈다.

| 사실 | 귀결 |
|---|---|
| prod CSP가 `script-src 'self'`이고 nonce도 hash도 없다 | 어떤 inline script도 실행되지 않는다 |
| Next.js prerender 산출물에 nonce 없는 inline `<script>` 6개 | RSC 페이로드가 전달되지 않아 **호스트 셸이 hydration되지 않았다** |
| 화면에는 SSR된 데스크탑이 그대로 보인다 | **정상 동작으로 오독하기 쉬웠다.** 시계가 `--:--`에 멈춘 것이 유일한 육안 단서 |

즉 기각한 대안이 아니라 **채택한 모델이 셸을 죽이고 있었다.**

## Decision

**1. 요청별 nonce를 발급하고 CSP를 그때 만든다.** 정본은 `apps/web/src/proxy.ts`이며
`next.config.ts`는 CSP를 싣지 않는다(나머지 헤더만 싣는다).

**2. 문서 라우트를 동적 렌더링으로 고정한다.** `app/layout.tsx`의 `dynamic = 'force-dynamic'`.
Next.js는 요청 헤더의 CSP를 근거로 **SSR 중에만** nonce를 주입하므로 정적 페이지에는 주입되지 않는다.

**3. 두 가지를 CSP에 넣지 않는다.** 이것이 이 결정의 핵심이다.

| 금지 | 이유 |
|---|---|
| `script-src`에 `'strict-dynamic'` | 있으면 `'self'` 같은 host allowlist가 **무시된다.** 호스트 CSP는 srcdoc 자식에 상속되고 앱 문서에는 nonce가 없으므로 **앱의 절대경로 external script가 전부 차단된다** |
| `style-src`에 nonce | CSP는 지시어에 nonce가 있으면 그 지시어의 `'unsafe-inline'`을 무시한다. `style-src`는 Tailwind v4 아티팩트 때문에 `'unsafe-inline'`이 필요하다 |

**4. 앱 로직과 IPC 런타임을 절대경로 external로 뺀다.** 앱 문서에는 nonce가 없으므로 inline은
차단되지만 `'self'`가 호스트 origin을 매칭하므로 external은 통과한다. IPC 런타임은
`/ipc-runtime.js` 라우트 핸들러가 `packages/ipc`의 문자열 상수를 직접 서빙한다 —
빌드 시 `public/`으로 복사하지 않는 이유는 **복사본이 상수와 갈라져도 아무도 모르기 때문**이다.

## Consequences

성립하는 상태 — **셸만 살리고 앱 격리는 그대로 둔다**:

| 대상 | 결과 | 이유 |
|---|---|---|
| 호스트 inline | 실행됨 | nonce |
| 호스트 external | 실행됨 | `'self'` |
| **앱 inline** | **차단됨** | 앱 문서에 nonce가 없다 |
| 앱 external (절대경로) | 통과 | `'self'` |

**강제 수단이 셋 붙어 있다.**

- 두 금지를 `apps/web/src/lib/security/__tests__/csp.test.ts`가 mode × nonce 4조합 전수로 검사한다
- `dynamic = 'force-dynamic'`을 지우면 **빌드가 실패한다** — `apps/web/package.json`의 `build`가
  `scripts/verify-dynamic-rendering.mjs`를 물고 있고, 그것이 소스가 아니라 **빌드 산출물**을 본다
- CI(`.github/workflows/ci.yml`)가 push·PR마다 `build`까지 돌려 그 검사에 도달한다

**앱 자산은 절대 경로로만 참조한다.** srcdoc 문서는 base URI가 부모 문서라 상대 경로가 앱
디렉터리가 아니라 호스트 루트를 기준으로 해석된다.

## Alternatives

- **정적 헤더 유지**(`ADR-0004`) — 셸이 hydration되지 않는다. 실측으로 기각됐다
- **`'unsafe-inline'` 추가** — 앱 inline까지 함께 살아나 격리의 실질이 사라진다
- **`'strict-dynamic'` 추가**(Next.js 공식 예시) — 위 표의 이유로 앱 external이 전부 죽는다

## 상위 근거

`zm-docs`의 `DEC-0009`(nonce 기반 CSP와 동적 렌더링 채택)와
`docs/projects/zm-os/architecture.md`의 「CSP 설계 — 두 가지 금지」가 정본이다.
이 ADR은 그 결정의 **구현 형태**를 이 저장소에 기록한다.

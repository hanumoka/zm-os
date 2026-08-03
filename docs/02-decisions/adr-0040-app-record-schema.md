---
number: "0040"
title: AppRecord 콘텐츠 표현과 레거시 레코드 승격
status: accepted
date: 2026-08-04
author: hanumoka
related: ["0008", "0017", "0019", "0023"]
---

# ADR-0040: AppRecord 콘텐츠 표현과 레거시 레코드 승격

## Context

REFAC-02-P5(Composition Root)를 시작할 수 없는 상태였다. 코드에서 확인한 두 사실이 동시에 성립하지 않았다.

**읽기 충돌.** `apps/web/src/lib/storage/user-apps.ts`는 `user-apps` namespace에
`{ manifest, htmlContent, installedAt }`를 저장한다. 같은 namespace·같은 키를
`packages/adapters-local/src/app-repository/local-app-repository.ts`가
`AppRecord = { manifest, source, installedAt, contentRef }`로 **런타임 검증 없이 캐스트**해 읽는다.
기존 사용자 레코드는 `source`가 `undefined`가 되고, `upsert`의
`if (record.source !== 'user') throw` 가드에 전부 걸린다.

**쓰기 표현 불능.** ADR-0019 D7이 정한 v2.0 모델은 "htmlContent를 동일 record에 inline 보존"인데,
`AppRecord.contentRef`는 `built-in-url | blob-ref` 둘뿐이라 htmlContent를 담을 자리가 없다.
즉 **ADR이 지정한 데이터 모양을 Port 타입으로 표현할 수 없었다.**

레코드에 버전 필드도 마이그레이션 코드도 없어 legacy를 판별할 수단조차 없었다.
이 상태로 P5를 진행하면 기존 사용자 업로드 앱이 목록에서 사라진다.

## Decision

### D1. `contentRef`에 `inline-html` variant 추가

```ts
export type AppContentRef =
  | { readonly kind: 'built-in-url'; readonly url: string }
  | { readonly kind: 'blob-ref'; readonly blobKey: string }
  | { readonly kind: 'inline-html'; readonly html: string };
```

ADR-0019 D7의 v2.0 모델이 그제서야 타입으로 표현된다.
ADR-0033 §D3의 "`PortName` 5개 유니언 불변"은 건드리지 않는다.
v2.1에서 콘텐츠를 BlobStorage로 옮길 때 이 variant 하나를 없애면 끝난다.

**지금이 가장 싼 시점이다.** variant 추가는 이를 소비하는 switch를 exhaustive check에서 깨뜨리는데,
현재 `contentRef`를 실제로 분기하는 코드가 0건이다.

### D2. 읽기 경로에 정규화 순수 함수

`normalizeAppRecord(value: unknown): AppRecord | null`을 `@zm/core`에 둔다.

- `source`가 없으면 `'user'` — built-in은 IDB에 저장하지 않으므로 안전한 기본값이다
- 최상위 `htmlContent`가 있으면 `{ kind: 'inline-html', html }`로 승격
- `installedAt`이 없으면 `0` — 레코드를 버리는 것보다 낫다
- 판별 불가능하면 `null`

**lazy migration이다.** 저장된 값을 건드리지 않고 읽을 때만 승격하며,
다음 쓰기에서 자연스럽게 새 형태로 저장된다. 일괄 마이그레이션 스크립트가 필요 없고,
실패해도 원본이 남는다.

### D3. 판별 불가능한 레코드는 삭제하지 않고 건너뛴다

`list()`는 `null`을 필터링해 제외할 뿐 저장소에서 지우지 않는다.
**읽지 못한 것과 없는 것은 다르다.** 스키마가 다시 바뀌거나 정규화에 버그가 있을 때
사용자 업로드 앱이 복구 불가능하게 사라지는 것을 막는다.

## Consequences

### 긍정적

- P5의 데이터 모델 블로커가 해소된다. Composition Root가 `AppRepository`를 실제로 배선할 수 있다
- 검증 없는 캐스트가 사라진다 — 어댑터가 저장소의 실제 내용을 신뢰하지 않고 확인한다
- 정규화가 순수 함수라 계약 테스트로 덮인다 (`packages/core/src/__tests__/app-record.test.ts`, 13 케이스)

### 비용과 제약

- `contentRef`를 분기하는 코드가 생기면 세 갈래를 모두 처리해야 한다
- `inline-html`은 레코드 크기를 키운다. HTML 5MB 상한(ADR-0008)이 그대로 IDB 레코드 크기가 된다.
  v2.1에서 `blob-ref`로 옮기는 이유가 이것이다
- 레코드에 `schemaVersion`은 여전히 없다. 정규화 함수가 형태로 판별하는 방식이라
  형태가 모호해지면 한계에 부딪힌다. 그 시점에 버전 필드를 도입한다

### 후속

- v2.1: `inline-html` → `blob-ref` 이전, variant 제거
- 나머지 3종 레코드(`DesktopLayoutRecord`, `DesktopSettingsRecord`, `DesktopIconsRecord`)에도
  같은 문제가 있으나, 검증 실패를 어떻게 다룰지(기본값 폴백 vs hydrationFailed)가
  소유자 정책 결정이라 이번 범위에 넣지 않았다

## Alternatives

**(A) `AppRecord`를 레거시 형태로 되돌린다** — Port 타입이 저장 형태에 종속되어
Cloud 어댑터가 같은 모양을 강요받는다. Ports & Adapters의 목적에 반한다.

**(B) 일괄 마이그레이션 스크립트** — 실행 시점에 실패하면 복구 수단이 없고,
1인 프로젝트에서 마이그레이션 실패를 감지·롤백할 장치를 갖추기 어렵다.
lazy migration은 실패해도 원본이 남는다.

**(C) `schemaVersion` 필드를 지금 도입** — 기존 레코드에는 그 필드가 없어
어차피 형태 판별이 먼저 필요하다. 순서가 뒤바뀐다.

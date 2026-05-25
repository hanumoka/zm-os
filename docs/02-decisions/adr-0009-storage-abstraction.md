---
number: "0009"
title: 스토리지 추상화 계층 — StorageAdapter Strategy 패턴 + OPFS 어댑터
status: accepted
date: 2026-05-25
author: hanumoka
related: ["0007"]
---

# ADR-0009: 스토리지 추상화 계층 (StorageAdapter + OPFS)

## Context

- TECH-01에서 "IndexedDB + OPFS" 클라이언트 스토리지를 확정했으나, ADR-0007에서는 IndexedDB만 구현 (STG-01).
- STG-02 (OPFS 어댑터)와 DSK-04 (윈도우 레이아웃 영속화) 진입 시 두 스토리지 백엔드를 통합하는 추상화 계층이 필요.
- 기존 idbGet/idbPut 함수형 API는 IndexedDB 전용이므로 OPFS를 동일 인터페이스로 사용하려면 어댑터 패턴이 필요.
- v2 클라우드 동기화 시 3번째 어댑터(cloud) 추가 예상.

## Decision

### StorageAdapter 인터페이스 (Strategy 패턴)

- 5개 비동기 메서드: get/put/delete/list/clear
- namespace + key 체계 (IDB store name = namespace, OPFS directory = namespace)
- 3개 구현체: IndexedDBAdapter, OPFSAdapter, MemoryAdapter
- 팩토리: resolveStorageAdapter() (OPFS > IDB > Memory 우선순위)
- namespace별 어댑터 오버라이드: resolveAdapterFor() (desktop-layout → 항상 IDB)

### OPFS API 접근 방식

- 방식 A: createWritable() (비동기, 메인 스레드)
- Worker + FileSystemSyncAccessHandle은 v2로 이관
- Safari 18.x createWritable 미지원 → isOPFSAvailable() 런타임 감지 + IDB 폴백

### 기존 코드 호환성

- installed-apps.ts, user-apps.ts는 기존 indexeddb.ts 직접 호출 유지 (마이그레이션 불필요)
- desktop-layout.ts만 StorageAdapter 인터페이스 사용 (신규 도메인)
- 향후 installed-apps/user-apps도 점진적 마이그레이션 가능 (인터페이스 동일)

### 윈도우 레이아웃 영속화

- 스키마: PersistedWindowLayout (contentId, position, size, state)
- 비영속화: zIndex (세션 간 무의미), title/contentId (카탈로그 SSOT)
- 타이밍: geometry 변경 500ms debounce + 구조 변경 즉시 + visibilitychange flush
- beforeunload 미사용 (MDN: 비동기 쓰기 보장 안 됨)
- 패턴: fire-and-forget (PROD-04 동일)

## Consequences

### Positive
- OPFS/IDB/Memory 3개 백엔드 교체 가능 (Strategy)
- v2 클라우드 어댑터 추가 시 인터페이스 무변경
- 기존 코드 무파괴 (installed-apps/user-apps 그대로)
- 윈도우 레이아웃 새로고침 후 복원
- 번들 영향 최소 (신규 의존성 0, 번들 1.28MB로 감소)

### Negative
- 추상화 계층 추가 (파일 6개) — 각 파일 50~100 LOC 이하
- OPFS 브라우저 지원 불균일 (Safari 18.x 미지원) — 런타임 감지 + 폴백
- DB_VERSION 3 bump (IDB 마이그레이션)

## Alternatives

| 후보 | 기각 사유 |
|------|---------|
| OPFS 없이 IDB만 확장 | TECH-01 미이행, v2 대용량 에셋 한계 |
| idbGet/idbPut 내부 if-else 분기 | SRP 위반, indexeddb.ts 비대화 |
| Repository 패턴 (도메인별 interface) | YAGNI (ADR-0007에서도 기각) |

## References

- [MDN — StorageManager: getDirectory()](https://developer.mozilla.org/en-US/docs/Web/API/StorageManager/getDirectory)
- [web.dev — The origin private file system](https://web.dev/articles/origin-private-file-system)
- [WebKit Blog — Safari 26 beta](https://webkit.org/blog/16993/news-from-wwdc25-web-technology-coming-this-fall-in-safari-26-beta/)
- [MDN — beforeunload event](https://developer.mozilla.org/en-US/docs/Web/API/Window/beforeunload_event)

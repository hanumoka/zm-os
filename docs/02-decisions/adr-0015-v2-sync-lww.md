---
number: "0015"
title: v2 데스크탑 상태 동기화 — LWW + 서버 권위 시계
status: accepted
date: 2026-05-26
author: hanumoka
related: ["0013", "0014", "0009"]
---

# ADR-0015: v2 데스크탑 상태 동기화 — LWW + 서버 권위 시계

## Context

- v2에서 사용자 데스크탑 상태를 멀티디바이스 동기화 필요 (PRD §1.2 비전 3번).
- 동기화 대상 데이터 (단순 구조):
  - 설치 앱 Set<string> (~100개 미만)
  - 윈도우 레이아웃 Array of 5 fields (~20개 윈도우)
  - 데스크탑 설정 (~10 key-value: wallpaper, themeMode)
  - 사용자 업로드 ZIP은 별도 객체 스토리지 (sync 대상 아님)
- 시나리오: **단일 사용자 멀티디바이스** (실시간 협업 아님)
- v2 plan §5 ADR Candidate 1순위 (병렬 3건). CLD Epic 전제.
- research-analyst 보고 (2026-05-26):
  - **LWW 자체 구현**: 번들 0KB, sync 서버 불필요, Linear 사례 — 데스크탑 상태 같은 단순 데이터에 최적
  - **Yjs**: 실시간 협업 시점에 권장, 단일사용자 멀티디바이스 시나리오는 과잉
  - **Automerge 3.0** (2025-08): 메모리 10x 개선했으나 WASM overhead
  - **Replicache**: 2026 시점 maintenance mode (Zero로 이전 중)
  - **Triplit**: Supabase 인수 (2025-10) → 방향 불투명

## Decision

**LWW (Last-Write-Wins) 자체 구현 + 서버 권위 시계 채택**.

### 핵심 결정

#### 동기화 단위
각 동기화 대상은 다음 envelope으로 감싼다:
```ts
type SyncEnvelope<T> = {
  data: T;
  /** 서버 측 ISO8601 timestamp (UTC). 클라이언트 시계 hint와 별도. */
  serverSavedAt: string;
  /** 클라이언트가 액션을 트리거한 시점 (UI 표시용 hint만 사용). */
  clientSavedAt: string;
  /** 멱등성 키 (오프라인 큐 재시도 시 중복 방지). */
  idempotencyKey: string;
};
```

#### 충돌 해결 규칙
- 서버는 `serverSavedAt` 최신 우선 정책 (LWW)
- 클라이언트 시계는 hint로만 사용 (조작/드리프트 방지)
- 동시 요청 시 멱등성 키로 중복 제거

#### 오프라인 큐
- 클라이언트 IDB에 `sync-queue` namespace 신설 (StorageAdapter Strategy 확장, ADR-0009)
- 네트워크 단절 시 액션 append → 재연결 시 순차 flush
- retry/backoff: 지수 백오프 (1s → 30s 최대)
- 멱등성 키로 부분 실패 안전

#### 충돌 표시 UX
- LWW 자체는 자동 해결 → 사용자에게 표시 안 됨
- 다만 "마지막 저장: A 디바이스 / 2분 전" 등 sync 상태 표시 (CLD-08)
- 사용자 데이터 분실 시나리오는 MIG-03 90일 백업으로 롤백 가능

#### 서버 측 구현
- Supabase Edge Function 또는 Server Action에서 `serverSavedAt = now()` 설정
- Postgres 컬럼: `server_saved_at TIMESTAMPTZ DEFAULT NOW()`
- 클라이언트 sync 시 서버가 timestamp 부여 (클라이언트 timestamp 무시)

### 사유
- **데이터 단순성**: Set/Array/key-value만 → CRDT 메타데이터 폭증 가치 없음
- **0KB 번들 영향**: 라이브러리 미도입 (POC 1.4MB raw 유지)
- **시간 드리프트 방어**: 서버 권위 시계 → 클라이언트 시스템 시계 조작 무력화
- **인터페이스 보존**: cloud-adapter.ts가 기존 StorageAdapter 인터페이스 확장 (ADR-0009 prefigure)
- **단계적 진입**: 향후 실시간 협업 도입 시 Yjs 부분 도입 가능 (envelope 내부 data만 CRDT 전환)

### 명시적 비목표
- **실시간 협업**: 동일 사용자가 두 디바이스에서 동시 편집 → 자동 머지 안 함 (LWW 자동 해결)
- **버전 히스토리**: v2.5 후보 (MIG-03 90일 백업으로 부분 대응)

## Consequences

### Positive
- 0KB 번들 영향 (라이브러리 의존성 0)
- 구현 단순 (~200줄 cloud-adapter.ts)
- Supabase Realtime 또는 polling 양쪽 가능 (인프라 결정 유연)
- 서버 권위 시계로 클라이언트 시계 조작 위협 차단
- CRDT 학습 곡선 회피 (단독 개발자 친화적)

### Negative
- 충돌 자동 머지 안 됨 (예: 디바이스 A에서 윈도우 이동 중 B에서 동일 윈도우 닫기 → B 후행 시 A 변경 손실)
- 사용자 데이터 분실 가능 → MIG-03 90일 백업 + CLD-08 sync 상태 UI로 완화
- 실시간 협업 도입 시 envelope 내부 data를 CRDT로 reshape 필요 (v3 reshape 가능)

### 회귀 위험
- v3에서 앱 간 IPC 시 CRDT 필요할 수 있음 → envelope 패턴이 reshape 경로 보존
- POC v1 IDB 데이터는 envelope 없음 → MIG-01 마이그레이션 시 wrap 처리

## Alternatives

### Yjs (CRDT)
- 장점: 실시간 협업 가능, Y.Map/Y.Array 단순 사용
- 단점: 메타데이터 폭증 (작은 데이터 비효율), 학습 곡선
- 거부 사유: v2 스코프(단일사용자 멀티디바이스)에 과잉

### Automerge 3.0
- 장점: 메모리 10x 개선
- 단점: WASM overhead, gzip 사이즈 미확인, 학습 곡선
- 거부 사유: Yjs와 동일 (과잉) + WASM 번들 영향

### Replicache
- 거부 사유: 2026 maintenance mode (Zero 후속), 풀스택 백엔드 필요

### Triplit
- 거부 사유: Supabase 인수 후 standalone 지원 불투명

## 정책 등재

- **TECH-09** (v2 신규): 동기화 전략 — LWW + 서버 권위 시계
- **CONST-02** (v2 신규): 클라이언트 시계는 hint, 서버 시계가 권위
- policy-registry §Active에 등재 (2026-05-26)

## 미해결 과제 (CLD Epic 진입 시 확정)

- 멱등성 키 생성 알고리즘 (UUIDv4 vs Hash) — CLD-04 작업 시 결정
- sync 트리거 빈도 (debounce 500ms vs 즉시) — CLD-04 작업 시 결정
- Supabase Realtime 사용 여부 (subscribe 모델) vs polling — CLD-04 spike 결정

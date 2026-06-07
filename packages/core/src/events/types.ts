/**
 * System Event 계약 (ADR-0033 로드맵) — 예약.
 *
 * 런타임 시스템 이벤트. `PersistenceErrorContext`(UI 영속화 에러)와는 별개 레이어.
 *
 * ⚠️ **예약 단계**: F0는 타입만 둔다. 실제 EventBus 구현 + IPC `event` 채널 라우팅은 F3.
 * 이 유니언은 F1~F3에서 확장/조정될 수 있다(현재 토픽은 최소 seed). 토픽 스키마를
 * 지금 과도하게 고정하지 않는다(잘못 잡으면 rework 비용 큼 — 미니멀 유지).
 *
 * @see docs/01-architecture/07-os-subsystem-architecture.md
 * @module events/types
 */

export type SystemEvent =
  | { readonly topic: 'app:started'; readonly appId: string }
  | { readonly topic: 'app:stopped'; readonly appId: string; readonly reason: 'user' | 'crashed' | 'evicted' }
  | { readonly topic: 'storage:quota'; readonly usage: number; readonly quota: number; readonly level: 'warning' | 'critical' }
  | { readonly topic: 'sync:status'; readonly status: string }
  | { readonly topic: 'auth:session'; readonly authenticated: boolean }
  | { readonly topic: 'capability:granted'; readonly appId: string; readonly capabilityId: string };

export type SystemEventTopic = SystemEvent['topic'];

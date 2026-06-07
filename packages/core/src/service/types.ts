/**
 * System Service 계약 (ADR-0035) — 확장 슬롯 예약.
 *
 * 커널 시스템 서비스(파일/알림/클립보드/창제어 등)를 descriptor로 기술한다.
 * 새 서비스 추가 = `ServiceDescriptor` 1개 + (구현은 F1+) registry 등록.
 *
 * F0: **타입만**. 동적 service registry runtime(register/discover)은 F1+에서
 * REFAC-02-P5 Composition Root(`createLocalPorts`) 위에 정적 슬롯으로 구현한다.
 * (동적 plugin 등록은 plugin 생태계 신호 발생 시 — 과설계 회피.)
 *
 * @see docs/02-decisions/adr-0035-system-service-registry.md (예약)
 * @module service/types
 */

import type { CapabilityId } from '../capability/types';

/** 서비스 식별자 (예: 'system.notify' | 'system.clipboard' | 'system.window'). */
export type ServiceId = string;

export type ServiceDescriptor = {
  readonly id: ServiceId;
  /** semver — 디스커버리 version range 매칭용. */
  readonly version: string;
  /** 이 서비스 호출에 필요한 capability(들). capability catalog와 교차검증. */
  readonly requiredCapabilities: ReadonlyArray<CapabilityId>;
  /** IPC로 노출되는 메서드 이름. */
  readonly methods: ReadonlyArray<string>;
};

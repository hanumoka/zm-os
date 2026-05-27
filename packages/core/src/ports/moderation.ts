/**
 * ModerationProvider Port (ADR-0017 §D1.6)
 *
 * 콘텐츠 검열 추상화 인터페이스.
 * LocalStaticModeration(ADR-0022) / Cloud 어댑터(ADR-0024+)가 이 인터페이스를 구현한다.
 *
 * Fail policy (ADR-0017 Q5 = fail-closed): Cloud 어댑터 타임아웃/PROVIDER_UNAVAILABLE 시
 * 어댑터가 blocked verdict 반환. Local 어댑터는 항상 동기 동작이므로 무관.
 */

import type { AppManifest } from '../manifest';
import type { AdapterDescriptor, PortCallOptions } from './common';

export type ModerationVerdict =
  | { readonly status: 'allowed' }
  | { readonly status: 'flagged'; readonly reasons: ReadonlyArray<string> } // 경고 + 사용자 확인
  | { readonly status: 'blocked'; readonly reasons: ReadonlyArray<string> }; // 강제 차단

export type ModerationInput = {
  readonly manifest: AppManifest;
  readonly htmlContent: string;
  readonly contentHash?: string; // 어댑터별 캐시 키 (SHA-256 hex)
};

export interface ModerationProvider {
  readonly descriptor: AdapterDescriptor;
  scan(input: ModerationInput, opts?: PortCallOptions): Promise<ModerationVerdict>;
}

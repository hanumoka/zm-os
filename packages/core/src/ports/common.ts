/**
 * Port 공통 타입 (ADR-0017 §D1.1)
 *
 * - PortName: 5 Port 식별자
 * - PortError: 5 Port 통합 에러 클래스
 * - PortCallOptions: AbortSignal 전달 컨테이너
 * - AdapterDescriptor: 어댑터 메타 정보
 */

export type PortName = 'auth' | 'app-repository' | 'blob-storage' | 'sync' | 'moderation';

export class PortError extends Error {
  constructor(
    message: string,
    public readonly port: PortName,
    public readonly code: string, // 'NOT_FOUND' | 'UNAUTHORIZED' | 'QUOTA_EXCEEDED' | ...
    public readonly cause?: unknown,
    public readonly retryable: boolean = false,
  ) {
    super(`[${port}:${code}] ${message}`);
    this.name = 'PortError';
  }
}

export type PortCallOptions = { readonly signal?: AbortSignal };

export type AdapterDescriptor = {
  readonly portName: PortName;
  readonly adapterName: string; // 'local-idb' | 'cloud-supabase' | ...
  readonly version: string;
  readonly capabilities: ReadonlyArray<string>; // 'realtime-sync' | 'oauth' | ...
};

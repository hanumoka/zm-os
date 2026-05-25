/**
 * 영속화 에러 이벤트 타입 + 기본 핸들러.
 * Provider에서 fire-and-forget 영속화 실패 시 구조화된 에러 전달.
 */

export type PersistenceErrorSource =
  | 'installed-apps'
  | 'user-apps'
  | 'window-layout'
  | 'desktop-settings';

export type PersistenceErrorOperation = 'hydrate' | 'persist' | 'delete';

export type PersistenceErrorEvent = {
  source: PersistenceErrorSource;
  operation: PersistenceErrorOperation;
  cause: unknown;
  timestamp: number;
};

export type PersistenceErrorHandler = (event: PersistenceErrorEvent) => void;

export function createPersistenceError(
  source: PersistenceErrorSource,
  operation: PersistenceErrorOperation,
  cause: unknown,
): PersistenceErrorEvent {
  return { source, operation, cause, timestamp: Date.now() };
}

export const defaultPersistenceErrorHandler: PersistenceErrorHandler = (event) => {
  console.error(`[${event.source}] ${event.operation} failed:`, event.cause);
};

/**
 * IPC 모듈 — 호스트 측 barrel export
 *
 * 호스트 애플리케이션(Next.js 페이지 등)에서 import할 공개 인터페이스만 export.
 * app.ts / runtime-iife.ts는 sandbox.ts가 내부적으로 사용하므로 여기서 미노출.
 *
 * @module ipc
 */

// 타입
export type {
  IpcStatus,
  IpcErrorCode,
  IpcPermissionGrant,
  AppApi,
  HostApi,
  HostEndpoint,
  HostEndpointOptions,
  AppClient,
  AppClientOptions,
} from './types';

export { IpcError } from './types';

// 호스트 엔드포인트 생성 함수
export { createHostEndpoint } from './host';

// 런타임 IIFE 주입 (sandbox.ts가 iframe srcdoc에 삽입)
export {
  injectIpcRuntime,
  buildIpcScriptTag,
  // 호스트가 `/ipc-runtime.js` 라우트에서 이 문자열을 그대로 서빙한다.
  // 빌드 단계로 파일을 복사하지 않으므로 상수와 서빙본이 갈라질 수 없다.
  IPC_RUNTIME_IIFE,
  IPC_RUNTIME_URL,
} from './runtime-iife';

// 프로토콜 상수 (외부에서 메시지 타입을 참조해야 할 경우용)
export { IPC_PROTOCOL_VERSION, MSG_TYPE } from './protocol';

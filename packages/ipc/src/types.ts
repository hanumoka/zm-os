/**
 * IPC 타입 정의 — 호스트-앱 통신 표면
 *
 * @module ipc/types
 */

// ─── 상태 코드 ────────────────────────────────────────────────────────────────

/** IPC 연결 상태 */
export type IpcStatus = 'idle' | 'connecting' | 'ready' | 'closed' | 'error';

/** IPC 에러 코드 */
export type IpcErrorCode =
  | 'timeout'
  | 'peer_down'
  | 'denied'
  | 'invalid_origin'
  | 'protocol'
  | 'rate_limited'
  /**
   * 권한은 있으나 호스트에 아직 구현이 없다.
   *
   * `denied`와 구분하는 이유는 앱이 보일 메시지가 다르기 때문이다 — 전자는
   * "권한을 요청하라", 후자는 "이 호스트 버전에는 없다". 계약이 `planned` 상태의
   * capability를 허용하므로 실제로 도달 가능한 상태다.
   */
  | 'unimplemented'
  | 'unknown';

// ─── 에러 클래스 ──────────────────────────────────────────────────────────────

/** IPC 에러 */
export class IpcError extends Error {
  readonly code: IpcErrorCode;

  constructor(code: IpcErrorCode, message: string) {
    super(message);
    this.name = 'IpcError';
    this.code = code;
  }
}

// ─── 권한 ─────────────────────────────────────────────────────────────────────

/** 호스트가 앱에게 허용하는 메서드 권한 목록 (v1: 화이트리스트) */
export interface IpcPermissionGrant {
  readonly allowedMethods: ReadonlyArray<string>;
}

// ─── API 표면 ─────────────────────────────────────────────────────────────────

/**
 * 앱(iframe) 측에서 호스트로 노출하는 API.
 * Record 값은 임의 인자를 받고 Promise 또는 값을 반환하는 함수.
 */
export type AppApi = Record<string, (...args: unknown[]) => unknown>;

/**
 * 호스트가 앱(iframe)으로 노출하는 API.
 *
 * `M`은 노출할 메서드 이름의 유한 집합이다. 예전에는 `Record<string, ...>` free-form이라
 * 오타가 조용히 "메서드 없음"이 됐고, 계약 문서와 구현이 어긋나도 컴파일이 통과했다.
 *
 * **`@zm/ipc`는 그 집합이 무엇인지 모른다.** 값 도메인은 `@zm/core`의 호스트 API 계약이
 * 소유하고, 이 패키지는 트랜스포트만 담당한다 — 그래야 MessagePort로 갈아탈 때 계약을
 * 건드리지 않는다.
 */
export type HostApi<M extends string = string> = {
  readonly [K in M]: (...args: never[]) => unknown;
};

// ─── 호스트 엔드포인트 ────────────────────────────────────────────────────────

/** 호스트 측 IPC 핸들 */
export interface HostEndpoint {
  /** 현재 연결 상태 */
  readonly status: IpcStatus;

  /**
   * 앱(iframe)의 메서드를 RPC 호출한다.
   * @param method 앱이 expose한 메서드 이름
   * @param args 전달할 인자 배열
   * @param timeoutMs 개별 호출 타임아웃 (ms). 미지정 시 defaultTimeoutMs 사용.
   */
  call(method: string, args?: unknown[], timeoutMs?: number): Promise<unknown>;

  /** IPC 연결을 닫고 리소스를 해제한다. */
  close(): void;
}

// ─── 앱 클라이언트 (srcdoc 내부 런타임용) ────────────────────────────────────

/** 앱(iframe) 측 IPC 클라이언트 (connectToHost 반환값) */
export interface AppClient {
  /** 현재 연결 상태 */
  readonly status: IpcStatus;

  /**
   * 앱 측 메서드를 호스트에게 노출한다.
   * @param api 노출할 메서드 맵
   */
  expose(api: AppApi): void;

  /** IPC 연결을 닫는다. */
  close(): void;
}

// ─── 옵션 ─────────────────────────────────────────────────────────────────────

/** createHostEndpoint 옵션 */
export interface HostEndpointOptions {
  /** 통신 대상 iframe 엘리먼트 */
  iframe: HTMLIFrameElement;
  /**
   * **앱 → 호스트** 방향. 앱이 부를 수 있는 호스트 메서드 화이트리스트.
   * 빈 배열이면 모든 호출 거부.
   */
  allowedMethods: ReadonlyArray<string>;
  /**
   * **호스트 → 앱** 방향. 호스트가 부를 수 있는 앱 메서드 화이트리스트.
   *
   * 예전에는 이 목적에도 `allowedMethods`를 썼다. 두 방향의 이름 공간이 다른데
   * 목록 하나를 공유했으므로, 호스트 메서드 이름이 `demo.ping` 같은 형태가 되는 순간
   * 앱이 announce한 이름(`flushNow` 등)과의 교집합이 **영구히 빈 배열**이 되어
   * 호스트→앱 호출이 구조적으로 불가능해진다.
   *
   * 지금 이것이 드러나지 않는 이유는 샘플 앱이 `expose()`를 부르지 않아 그 방향이
   * 쓰이지 않기 때문이다. 그래서 어떤 테스트도 잡지 못한다.
   *
   * 미지정 시 `allowedMethods`로 폴백한다 — 기존 호출자의 동작이 바뀌지 않는다.
   */
  callableAppMethods?: ReadonlyArray<string>;
  /**
   * RPC 호출 기본 타임아웃 (ms). 기본값: 5000
   */
  defaultTimeoutMs?: number;
  /**
   * 호스트에서 앱으로 노출할 API (앱이 RPC 호출 가능).
   * 미지정 시 빈 API.
   */
  expose?: HostApi;
  /**
   * `allowedMethods`에는 있으나 `expose`에 구현이 없는 메서드를 만났을 때,
   * `denied` 대신 `unimplemented`로 회신할지 여부.
   *
   * 계약이 `planned` capability(타입만 동결, 핸들러 없음)를 허용하므로 필요하다.
   * 미지정 시 종전대로 `denied` — 기존 동작이 바뀌지 않는다.
   */
  reportUnimplemented?: boolean;
  /**
   * (ADR-0034, F0 seam) capability 강제 미들웨어.
   * CALL 수신 시 allowedMethods 통과 후 추가 검증한다. `false` 반환 시 'denied' 응답.
   * 미지정 시 검증 생략 → allowedMethods-only 동작(현행과 byte-identical). F1 broker가 주입.
   */
  authorize?: (method: string, args: ReadonlyArray<unknown>) => boolean;
  /**
   * 앱→호스트 메시지 rate limit 설정 (N-08 DoS 방어).
   * 미지정 시 기본값: { maxMessages: 60, windowMs: 1000, penaltyMs: 2000 }
   * false로 설정 시 rate limit 비활성화.
   */
  rateLimit?: Partial<import('./rate-limiter').RateLimitConfig> | false;
  /**
   * Rate limit 초과 시 호출되는 콜백.
   * UI 알림/앱 강제 종료 등 호출자가 결정.
   */
  onRateLimitExceeded?: (status: import('./rate-limiter').RateLimitStatus) => void;
}

/** connectToHost 옵션 (앱 측 런타임에서 사용) */
export interface AppClientOptions {
  /**
   * 핸드셰이크 타임아웃 (ms). 기본값: 5000
   */
  handshakeTimeoutMs?: number;
}

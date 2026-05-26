/**
 * 호스트 측 IPC 엔드포인트 구현
 *
 * 책임:
 * - iframe과의 핸드셰이크 (INIT → READY)
 * - origin 검증 (event.origin === SANDBOX_ORIGIN + event.source === iframe.contentWindow)
 * - 권한 화이트리스트 검증 (allowedMethods)
 * - 앱 메서드 RPC 호출 (call)
 * - 호스트 API 노출 (expose → 앱이 CALL 메시지로 호출 가능)
 *
 * 보안 주의:
 * - raw postMessage 호출은 이 파일 내부에서만 사용
 * - event.origin 및 event.source 검증 필수
 *
 * @module ipc/host
 */

import type { HostEndpoint, HostEndpointOptions, HostApi } from './types';
import { IpcError } from './types';
import {
  IPC_PROTOCOL_VERSION,
  MSG_TYPE,
  parseIpcMsg,
  type InitMsg,
  type CallMsg,
  type ResultMsg,
  type ErrorMsg,
} from './protocol';
import type { IpcStatus } from './types';
import { createRateLimiter, type MessageRateLimiter } from './rate-limiter';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5000;
const HANDSHAKE_TIMEOUT_MS = 5000;

/**
 * srcdoc/blob iframe의 event.origin 값 ("null" 문자열).
 *
 * (작업 7 audit 권고) `sandbox.ts` 의 SANDBOX_ORIGIN 과 동일 값.
 * `sandbox.ts → host.ts` 가 이미 존재하므로 역방향 import 시 순환 위험 →
 * inline 정의로 SSOT 일관성 + 순환 회피를 모두 만족.
 *
 * v2 reshape: `src/lib/apps/ipc/constants.ts` 분리 권고.
 */
const SANDBOX_ORIGIN = 'null' as const;

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

let _callIdCounter = 0;

function newCallId(): string {
  return `h_${Date.now()}_${++_callIdCounter}`;
}

// ─── 구현 ─────────────────────────────────────────────────────────────────────

/**
 * 호스트 IPC 엔드포인트를 생성한다.
 *
 * @param options HostEndpointOptions
 * @returns HostEndpoint
 *
 * @example
 * ```ts
 * const endpoint = createHostEndpoint({
 *   iframe,
 *   allowedMethods: ['ping', 'getScore'],
 *   expose: { alert: (msg) => console.log('[host]', msg) },
 * });
 * const result = await endpoint.call('ping');
 * ```
 */
export function createHostEndpoint(options: HostEndpointOptions): HostEndpoint {
  // env guard: window는 브라우저에서만 존재
  if (typeof window === 'undefined') {
    throw new IpcError('unknown', 'createHostEndpoint는 브라우저 환경에서만 사용 가능합니다');
  }

  const { iframe, allowedMethods, expose = {} } = options;

  // ─── Rate Limiter (N-08 DoS 방어) ─────────────────────────────────────────
  let _rateLimiter: MessageRateLimiter | null = null;
  if (options.rateLimit !== false) {
    _rateLimiter = createRateLimiter(
      options.rateLimit === undefined ? undefined : options.rateLimit,
    );
  }
  const defaultTimeoutMs = options.defaultTimeoutMs ?? DEFAULT_TIMEOUT_MS;

  let _status: IpcStatus = 'idle';
  // 앱 expose 메서드 목록 (핸드셰이크 후 설정)
  let _appMethods: ReadonlyArray<string> = [];
  // 앱으로부터 실제 허가된 메서드 (INIT에서 announce한 것 중 allowedMethods 교집합)
  let _grantedMethods: ReadonlyArray<string> = [];

  // 진행 중인 RPC 호출 맵: callId → { resolve, reject, timerId }
  type PendingCall = {
    resolve: (value: unknown) => void;
    reject: (reason: IpcError) => void;
    timerId: ReturnType<typeof setTimeout>;
  };
  const _pending = new Map<string, PendingCall>();

  // 핸드셰이크 Promise
  let _handshakeResolve: (() => void) | null = null;
  let _handshakeReject: ((err: IpcError) => void) | null = null;
  let _handshakeTimerId: ReturnType<typeof setTimeout> | null = null;

  // ─── 내부 메서드 ───────────────────────────────────────────────────────────

  function _setStatus(s: IpcStatus): void {
    _status = s;
  }

  /** iframe에 메시지를 전송한다. targetOrigin은 항상 '*' (null origin iframe 필수) */
  function _postToApp(msg: object): void {
    const win = iframe.contentWindow;
    if (win === null) return;
    win.postMessage(msg, '*');
  }

  /** 호스트 측에서 실행할 HostApi 메서드 핸들러 */
  async function _handleAppCall(msg: CallMsg): Promise<void> {
    const { callId, method, args } = msg;

    // 권한 게이트 1: allowedMethods 화이트리스트
    //   = 호스트가 앱에게 노출 허용한 호스트 메서드 목록 (HostEndpointOptions.allowedMethods).
    // _grantedMethods 는 'INIT 단계 앱이 announce 한 앱 메서드 ∩ allowedMethods' 로,
    // 호스트→앱 호출 가능 메서드 추적용. 앱→호스트 호출 게이트에는 부적합 →
    // allowedMethods 를 직접 사용한다 (앱 announce 와 무관하게 호스트 정책으로만 결정).
    if (!allowedMethods.includes(method)) {
      _postToApp({
        type: MSG_TYPE.ERROR,
        v: IPC_PROTOCOL_VERSION,
        callId,
        code: 'denied',
        message: `메서드 '${method}'는 허용되지 않습니다`,
      });
      return;
    }

    // 권한 게이트 2: expose 객체에 실제 함수 존재
    const handler = (expose as HostApi)[method];
    if (typeof handler !== 'function') {
      _postToApp({
        type: MSG_TYPE.ERROR,
        v: IPC_PROTOCOL_VERSION,
        callId,
        code: 'denied',
        message: `호스트 메서드 '${method}'가 존재하지 않습니다`,
      });
      return;
    }

    try {
      const result = await Promise.resolve(handler(...(args ?? [])));
      _postToApp({
        type: MSG_TYPE.RESULT,
        v: IPC_PROTOCOL_VERSION,
        callId,
        result,
      });
    } catch (err) {
      _postToApp({
        type: MSG_TYPE.ERROR,
        v: IPC_PROTOCOL_VERSION,
        callId,
        code: 'unknown',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  // ─── 메시지 리스너 ────────────────────────────────────────────────────────

  const _listener = (event: MessageEvent): void => {
    // 보안 검증 1: 메시지 출처가 우리 iframe인지 확인
    if (event.source !== iframe.contentWindow) return;

    // 보안 검증 2: srcdoc/blob iframe의 origin은 반드시 "null" (문자열)
    // (작업 7 audit 권고) sandbox.ts SANDBOX_ORIGIN 과 동일 값.
    // 순환 import 회피 위해 inline 정의. v2 에서 src/lib/apps/ipc/constants.ts 로 분리 권고.
    if (event.origin !== SANDBOX_ORIGIN) return;

    const msg = parseIpcMsg(event.data);
    if (msg === null) return;

    // Rate limit 체크 (N-08 DoS 방어) — 핸드셰이크(INIT)는 제외
    if (_rateLimiter !== null && msg.type !== MSG_TYPE.INIT) {
      const verdict = _rateLimiter.check();
      if (verdict !== 'allow') {
        options.onRateLimitExceeded?.(_rateLimiter.status());
        return;
      }
    }

    switch (msg.type) {
      case MSG_TYPE.INIT: {
        _handleInit(msg);
        break;
      }
      case MSG_TYPE.CALL: {
        void _handleAppCall(msg);
        break;
      }
      case MSG_TYPE.RESULT: {
        _handleResult(msg);
        break;
      }
      case MSG_TYPE.ERROR: {
        _handleError(msg);
        break;
      }
      // READY는 호스트가 보내는 것 — 수신 무시
      default:
        break;
    }
  };

  // ─── 핸드셰이크 처리 ──────────────────────────────────────────────────────

  function _handleInit(msg: InitMsg): void {
    if (_status !== 'connecting') return; // 이미 ready or closed

    _appMethods = msg.methods;
    // allowedMethods 교집합 계산
    _grantedMethods = msg.methods.filter((m) => allowedMethods.includes(m));

    // READY 응답 전송
    const hostOrigin = window.location.origin;
    _postToApp({
      type: MSG_TYPE.READY,
      v: IPC_PROTOCOL_VERSION,
      hostOrigin,
      grantedMethods: [..._grantedMethods],
    });

    // 핸드셰이크 완료
    if (_handshakeTimerId !== null) {
      clearTimeout(_handshakeTimerId);
      _handshakeTimerId = null;
    }
    _setStatus('ready');
    _handshakeResolve?.();
    _handshakeResolve = null;
    _handshakeReject = null;
  }

  function _handleResult(msg: ResultMsg): void {
    const pending = _pending.get(msg.callId);
    if (!pending) return;
    clearTimeout(pending.timerId);
    _pending.delete(msg.callId);
    pending.resolve(msg.result);
  }

  function _handleError(msg: ErrorMsg): void {
    if (msg.callId !== undefined) {
      const pending = _pending.get(msg.callId);
      if (pending) {
        clearTimeout(pending.timerId);
        _pending.delete(msg.callId);
        pending.reject(new IpcError(msg.code, msg.message));
      }
    }
  }

  // ─── 핸드셰이크 시작 ──────────────────────────────────────────────────────

  function _startHandshake(): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      _setStatus('connecting');
      _handshakeResolve = resolve;
      _handshakeReject = reject;
      _handshakeTimerId = setTimeout(() => {
        _handshakeTimerId = null;
        if (_status === 'connecting') {
          _setStatus('error');
          reject(new IpcError('timeout', '핸드셰이크 타임아웃'));
          _handshakeResolve = null;
          _handshakeReject = null;
        }
      }, HANDSHAKE_TIMEOUT_MS);
    });
  }

  // 리스너 등록 및 핸드셰이크 시작 (비동기, 결과는 내부 상태로 반영)
  window.addEventListener('message', _listener);
  _startHandshake().catch(() => {
    // 핸드셰이크 실패는 status 'error'로 반영됨 — 외부에서 status로 확인
  });

  // ─── 공개 인터페이스 ──────────────────────────────────────────────────────

  const endpoint: HostEndpoint = {
    get status(): IpcStatus {
      return _status;
    },

    call(method: string, args: unknown[] = [], timeoutMs?: number): Promise<unknown> {
      if (_status === 'closed') {
        return Promise.reject(new IpcError('peer_down', 'IPC 연결이 닫혔습니다'));
      }
      if (_status === 'error') {
        return Promise.reject(new IpcError('peer_down', 'IPC 연결이 에러 상태입니다'));
      }

      // 권한 검증: 호스트가 앱 메서드를 호출할 때
      // ready 상태에서 _grantedMethods 화이트리스트에 없으면 거부.
      // 앱이 INIT 에서 메서드를 announce 안 한 경우 _grantedMethods=[] → 모든 호출 거부 (의도된 동작).
      // connecting 상태에서는 메시지를 전송하고 타임아웃으로 자연 차단 (큐잉은 v2).
      // 이전 구현은 `_appMethods.length > 0` 보조 조건으로 게이트가 우회되는 결함이 있었음
      // (TS-002 참조).
      if (_status === 'ready' && !_grantedMethods.includes(method)) {
        return Promise.reject(
          new IpcError('denied', `메서드 '${method}'는 허용되지 않습니다`),
        );
      }

      const callId = newCallId();
      const effectiveTimeout = timeoutMs ?? defaultTimeoutMs;

      return new Promise<unknown>((resolve, reject) => {
        const timerId = setTimeout(() => {
          _pending.delete(callId);
          reject(new IpcError('timeout', `RPC 타임아웃: ${method} (${effectiveTimeout}ms)`));
        }, effectiveTimeout);

        _pending.set(callId, { resolve, reject, timerId });

        _postToApp({
          type: MSG_TYPE.CALL,
          v: IPC_PROTOCOL_VERSION,
          callId,
          method,
          args: args ?? [],
        });
      });
    },

    close(): void {
      if (_status === 'closed') return;

      // 진행 중 RPC 모두 reject
      for (const [, pending] of _pending) {
        clearTimeout(pending.timerId);
        pending.reject(new IpcError('peer_down', 'IPC 연결이 닫혔습니다'));
      }
      _pending.clear();

      if (_handshakeTimerId !== null) {
        clearTimeout(_handshakeTimerId);
        _handshakeTimerId = null;
      }
      _handshakeReject?.(new IpcError('peer_down', 'IPC 연결이 닫혔습니다'));
      _handshakeResolve = null;
      _handshakeReject = null;

      window.removeEventListener('message', _listener);
      _setStatus('closed');
    },
  };

  return endpoint;
}

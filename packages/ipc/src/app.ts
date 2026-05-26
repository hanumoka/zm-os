/**
 * 앱(iframe) 측 IPC 클라이언트 — TypeScript 직접 사용 경로
 *
 * srcdoc에 TypeScript를 직접 번들할 수 없는 환경에서는
 * runtime-iife.ts의 IIFE 문자열을 inject한다.
 *
 * 이 파일은 Next.js 프로젝트 내에서 TypeScript 단위 테스트나
 * Worker 컨텍스트에서 IPC를 직접 사용할 때 유용하다.
 *
 * 프로토콜:
 *   앱 → INIT (expose 메서드 목록)
 *   호스트 → READY (hostOrigin, grantedMethods)
 *   이후 양방향 CALL / RESULT / ERROR
 *
 * 보안:
 *   - event.source === window.parent 검증
 *   - READY 수신 후 hostOrigin 저장 → 이후 메시지 origin 검증
 *
 * @module ipc/app
 */

import type { AppClient, AppClientOptions, AppApi } from './types';
import { IpcError } from './types';
import {
  IPC_PROTOCOL_VERSION,
  MSG_TYPE,
  parseIpcMsg,
  type ReadyMsg,
  type CallMsg,
  type ResultMsg,
} from './protocol';
import type { IpcStatus } from './types';

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const DEFAULT_TIMEOUT_MS = 5000;
const HANDSHAKE_TIMEOUT_MS = 5000;

// ─── 유틸 ─────────────────────────────────────────────────────────────────────

let _callIdCounter = 0;

function newCallId(): string {
  return `a_${Date.now()}_${++_callIdCounter}`;
}

// ─── 구현 ─────────────────────────────────────────────────────────────────────

/**
 * 앱(iframe) 측 IPC 클라이언트를 생성하고 호스트와의 핸드셰이크를 시작한다.
 *
 * 이 함수는 iframe 내부의 JavaScript 컨텍스트에서 호출되어야 한다.
 * 브라우저 srcdoc 환경에서는 runtime-iife.ts의 IIFE inject 방식을 권장한다.
 *
 * @param options AppClientOptions
 * @returns AppClient
 *
 * @example
 * ```ts
 * const client = connectToHost();
 * client.expose({ ping: () => 'pong' });
 * const result = await client.call('hostMethod');
 * ```
 */
export function connectToHost(options: AppClientOptions = {}): AppClient {
  // env guard: window/parent는 브라우저 iframe에서만 존재
  if (typeof window === 'undefined') {
    throw new IpcError('unknown', 'connectToHost는 브라우저 iframe 환경에서만 사용 가능합니다');
  }

  const handshakeTimeoutMs = options.handshakeTimeoutMs ?? HANDSHAKE_TIMEOUT_MS;

  let _status: IpcStatus = 'connecting';
  let _hostOrigin: string | null = null;
  let _exposedApi: AppApi = {};
  let _grantedMethods: ReadonlyArray<string> = [];

  type PendingCall = {
    resolve: (value: unknown) => void;
    reject: (reason: IpcError) => void;
    timerId: ReturnType<typeof setTimeout>;
  };
  const _pending = new Map<string, PendingCall>();

  let _handshakeTimerId: ReturnType<typeof setTimeout> | null = null;

  // ─── 내부 메서드 ───────────────────────────────────────────────────────────

  function _postToHost(msg: object): void {
    if (window.parent && window.parent !== (window as Window)) {
      window.parent.postMessage(msg, '*');
    }
  }

  function _handleReady(msg: ReadyMsg): void {
    if (_status !== 'connecting') return;
    _hostOrigin = msg.hostOrigin;
    _grantedMethods = msg.grantedMethods;
    _status = 'ready';
    if (_handshakeTimerId !== null) {
      clearTimeout(_handshakeTimerId);
      _handshakeTimerId = null;
    }
  }

  async function _handleCall(msg: CallMsg): Promise<void> {
    const { callId, method, args } = msg;

    if (!_grantedMethods.includes(method)) {
      _postToHost({
        type: MSG_TYPE.ERROR,
        v: IPC_PROTOCOL_VERSION,
        callId,
        code: 'denied',
        message: `Method not granted: ${method}`,
      });
      return;
    }

    const fn = _exposedApi[method];
    if (typeof fn !== 'function') {
      _postToHost({
        type: MSG_TYPE.ERROR,
        v: IPC_PROTOCOL_VERSION,
        callId,
        code: 'denied',
        message: `Method not found: ${method}`,
      });
      return;
    }

    try {
      const result = await Promise.resolve(fn(...(args ?? [])));
      _postToHost({
        type: MSG_TYPE.RESULT,
        v: IPC_PROTOCOL_VERSION,
        callId,
        result,
      });
    } catch (err) {
      _postToHost({
        type: MSG_TYPE.ERROR,
        v: IPC_PROTOCOL_VERSION,
        callId,
        code: 'unknown',
        message: err instanceof Error ? err.message : String(err),
      });
    }
  }

  function _handleResult(msg: ResultMsg): void {
    const pending = _pending.get(msg.callId);
    if (!pending) return;
    clearTimeout(pending.timerId);
    _pending.delete(msg.callId);
    pending.resolve(msg.result);
  }

  // ─── 메시지 리스너 ────────────────────────────────────────────────────────

  const _listener = (event: MessageEvent): void => {
    // 보안: 발신자가 부모 창인지 확인
    if (event.source !== window.parent) return;

    // 보안: READY 수신 전에는 hostOrigin 미상이라 origin 검증 불가
    //   (READY 메시지 자체가 hostOrigin을 알려준다).
    // event.source === window.parent 만으로 충분한 근거:
    //   호스트가 iframe에 sandbox="allow-scripts" 만 부여(allow-same-origin 미부여)하므로
    //   window.parent는 cross-origin이라 동일 origin의 다른 프레임이 위조할 수 없다.
    //   만약 향후 allow-same-origin이 추가되면 이 가정이 깨지므로 본 검증을 강화해야 한다.
    //   (참고: src/lib/apps/sandbox.ts ALLOWED_SANDBOX_TOKENS, .claude/rules/security.md)
    if (_hostOrigin !== null && event.origin !== _hostOrigin) return;

    const msg = parseIpcMsg(event.data);
    if (msg === null) return;

    switch (msg.type) {
      case MSG_TYPE.READY:
        _handleReady(msg);
        break;
      case MSG_TYPE.CALL:
        void _handleCall(msg);
        break;
      case MSG_TYPE.RESULT:
        _handleResult(msg);
        break;
      case MSG_TYPE.ERROR: {
        if (msg.callId !== undefined) {
          const pending = _pending.get(msg.callId);
          if (pending) {
            clearTimeout(pending.timerId);
            _pending.delete(msg.callId);
            pending.reject(new IpcError(msg.code, msg.message));
          }
        }
        break;
      }
      // INIT은 앱이 보내는 것 — 수신 무시
      default:
        break;
    }
  };

  // ─── 핸드셰이크 시작 ──────────────────────────────────────────────────────

  window.addEventListener('message', _listener);

  function _sendInit(): void {
    const methods = Object.keys(_exposedApi);
    _postToHost({
      type: MSG_TYPE.INIT,
      v: IPC_PROTOCOL_VERSION,
      methods,
    });

    _handshakeTimerId = setTimeout(() => {
      if (_status === 'connecting') {
        _status = 'error';
      }
      _handshakeTimerId = null;
    }, handshakeTimeoutMs);
  }

  // DOMContentLoaded 후 INIT 전송
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', _sendInit);
  } else {
    _sendInit();
  }

  // ─── 공개 인터페이스 ──────────────────────────────────────────────────────

  const client: AppClient = {
    get status(): IpcStatus {
      return _status;
    },

    expose(api: AppApi): void {
      _exposedApi = { ..._exposedApi, ...api };
    },

    close(): void {
      if (_status === 'closed') return;
      _status = 'closed';

      for (const [, pending] of _pending) {
        clearTimeout(pending.timerId);
        pending.reject(new IpcError('peer_down', 'IPC 연결이 닫혔습니다'));
      }
      _pending.clear();

      if (_handshakeTimerId !== null) {
        clearTimeout(_handshakeTimerId);
        _handshakeTimerId = null;
      }

      window.removeEventListener('message', _listener);
    },
  };

  return client;
}

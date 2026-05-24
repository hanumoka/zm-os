/**
 * 앱(iframe) 측 IPC 런타임 — srcdoc에 인라인 주입되는 IIFE JS 문자열
 *
 * 이 파일은 브라우저 JS 문자열을 정의한다. TypeScript 코드가 아닌
 * "srcdoc에 inject할 plain JS" 를 string 상수로 export한다.
 *
 * 런타임은 globalThis.__zmosIpc 로 노출된다.
 * 사용자 앱은 window.__zmosIpc.expose({...}) / window.__zmosIpc.call(...) 로 접근.
 *
 * 프로토콜:
 *   앱 → INIT  (메서드 목록)
 *   호스트 → READY (hostOrigin, grantedMethods)
 *   이후 양방향 CALL / RESULT / ERROR
 *
 * 보안:
 *   - 호스트 메시지 수신 시 event.source === window.parent 검증
 *   - READY 수신 후 hostOrigin 저장 → 이후 메시지에서 origin 검증
 *
 * @module ipc/runtime-iife
 */

export const IPC_RUNTIME_IIFE: string = /* js */ `
(function () {
  'use strict';

  var PROTO_VERSION = 1;
  var MSG = {
    INIT:   'zm_ipc_init',
    READY:  'zm_ipc_ready',
    CALL:   'zm_ipc_call',
    RESULT: 'zm_ipc_result',
    ERROR:  'zm_ipc_error',
  };

  // ── 상태 ──────────────────────────────────────────────────────────────────
  var _status        = 'idle';       // idle | connecting | ready | closed | error
  var _hostOrigin    = null;         // READY 수신 후 설정
  var _exposedApi    = {};           // expose() 로 등록된 메서드 맵
  var _grantedMethods = [];          // 호스트가 허가한 메서드 목록
  var _pendingCalls  = {};           // callId → { resolve, reject, timerId }
  var _callIdCounter = 0;
  var HANDSHAKE_TIMEOUT_MS = 5000;
  var DEFAULT_TIMEOUT_MS   = 5000;
  var _handshakeTimer = null;
  var _pendingExpose  = null;        // expose()가 핸드셰이크 전 호출되면 대기

  // ── 유틸 ──────────────────────────────────────────────────────────────────
  function newCallId() {
    return 'a_' + Date.now() + '_' + (++_callIdCounter);
  }

  function postToHost(msg) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(msg, '*');
    }
  }

  // prototype pollution 방어: 위험 키 포함 객체 거부.
  // (H-1, 작업 7 audit) 객체 리터럴 { __proto__: true } 는 own property 가 아닌
  // prototype slot 설정으로 해석되어 Object.prototype 모든 메서드 키가 우연히
  // truthy 가 되는 부작용이 있다. 배열 + indexOf 패턴으로 정확한 멤버십 검사.
  var DANGEROUS_KEYS_LIST = ['__proto__', 'constructor', 'prototype'];
  function hasDangerousKey(obj) {
    if (obj === null || typeof obj !== 'object') return false;
    var keys = Object.keys(obj);
    for (var i = 0; i < keys.length; i++) {
      if (DANGEROUS_KEYS_LIST.indexOf(keys[i]) !== -1) return true;
    }
    return false;
  }

  function isValidIpcMsg(data) {
    if (data === null || typeof data !== 'object') return false;
    if (typeof data.type !== 'string') return false;
    if (typeof data.v !== 'number' || data.v !== PROTO_VERSION) return false;
    if (!data.type.startsWith('zm_ipc_')) return false;
    if (hasDangerousKey(data)) return false;
    return true;
  }

  // ── 수신 처리 ─────────────────────────────────────────────────────────────
  function handleReady(msg) {
    if (_status !== 'connecting') return;
    if (typeof msg.hostOrigin !== 'string') return;

    _hostOrigin     = msg.hostOrigin;
    _grantedMethods = Array.isArray(msg.grantedMethods) ? msg.grantedMethods : [];
    _status         = 'ready';

    if (_handshakeTimer !== null) {
      clearTimeout(_handshakeTimer);
      _handshakeTimer = null;
    }

    // 핸드셰이크 전에 expose()가 호출되었으면 지금 처리
    if (_pendingExpose !== null) {
      _exposedApi   = _pendingExpose;
      _pendingExpose = null;
    }
  }

  function handleCall(msg) {
    if (_status !== 'ready') return;
    var callId = msg.callId;
    var method = msg.method;
    var args   = Array.isArray(msg.args) ? msg.args : [];

    // 호스트가 앱 메서드를 호출하는 경우 grantedMethods 검증
    if (_grantedMethods.indexOf(method) === -1) {
      postToHost({ type: MSG.ERROR, v: PROTO_VERSION, callId: callId, code: 'denied', message: 'Method not granted: ' + method });
      return;
    }

    var fn = _exposedApi[method];
    if (typeof fn !== 'function') {
      postToHost({ type: MSG.ERROR, v: PROTO_VERSION, callId: callId, code: 'denied', message: 'Method not found: ' + method });
      return;
    }

    try {
      var ret = fn.apply(null, args);
      Promise.resolve(ret).then(function (result) {
        postToHost({ type: MSG.RESULT, v: PROTO_VERSION, callId: callId, result: result });
      }).catch(function (err) {
        postToHost({ type: MSG.ERROR, v: PROTO_VERSION, callId: callId, code: 'unknown', message: String(err) });
      });
    } catch (e) {
      postToHost({ type: MSG.ERROR, v: PROTO_VERSION, callId: callId, code: 'unknown', message: String(e) });
    }
  }

  function handleResult(msg) {
    var pending = _pendingCalls[msg.callId];
    if (!pending) return;
    clearTimeout(pending.timerId);
    delete _pendingCalls[msg.callId];
    pending.resolve(msg.result);
  }

  function handleError(msg) {
    if (msg.callId === undefined || msg.callId === null) return;
    var pending = _pendingCalls[msg.callId];
    if (!pending) return;
    clearTimeout(pending.timerId);
    delete _pendingCalls[msg.callId];
    pending.reject({ code: msg.code, message: msg.message });
  }

  // ── 글로벌 메시지 리스너 ──────────────────────────────────────────────────
  window.addEventListener('message', function (event) {
    // 보안: 발신자가 부모 창인지 확인
    if (event.source !== window.parent) return;

    // 보안: READY 수신 전에는 hostOrigin 미상이라 origin 검증 불가
    //   (READY 자체가 hostOrigin을 알려줌).
    // event.source === window.parent 만으로 충분한 근거:
    //   호스트가 iframe에 sandbox="allow-scripts" 만 부여(allow-same-origin 미부여)하므로
    //   window.parent는 cross-origin이라 동일 origin의 다른 프레임이 위조할 수 없음.
    //   향후 allow-same-origin 추가 시 즉시 취약 → 본 가드 강화 필요.
    // READY 수신 후에는 저장된 hostOrigin과 비교
    if (_hostOrigin !== null && event.origin !== _hostOrigin) return;

    var data = event.data;
    if (!isValidIpcMsg(data)) return;

    switch (data.type) {
      case MSG.READY:  handleReady(data);  break;
      case MSG.CALL:   handleCall(data);   break;
      case MSG.RESULT: handleResult(data); break;
      case MSG.ERROR:  handleError(data);  break;
      default: break;
    }
  });

  // ── 공개 API ─────────────────────────────────────────────────────────────
  var ipc = {
    /** 현재 연결 상태 */
    get status() { return _status; },

    /**
     * 앱 메서드를 호스트에게 노출한다.
     * 핸드셰이크 전/후 모두 호출 가능.
     * @param {Record<string, Function>} api
     */
    expose: function (api) {
      if (typeof api !== 'object' || api === null) return;
      if (_status === 'ready') {
        _exposedApi = api;
      } else {
        _pendingExpose = api;
      }
    },

    /**
     * 호스트의 메서드를 RPC 호출한다.
     * @param {string} method
     * @param {unknown[]} [args]
     * @param {number} [timeoutMs]
     * @returns {Promise<unknown>}
     */
    call: function (method, args, timeoutMs) {
      if (_status === 'closed' || _status === 'error') {
        return Promise.reject({ code: 'peer_down', message: 'IPC is not active' });
      }
      var callId   = newCallId();
      var timeout  = typeof timeoutMs === 'number' ? timeoutMs : DEFAULT_TIMEOUT_MS;
      return new Promise(function (resolve, reject) {
        var timerId = setTimeout(function () {
          delete _pendingCalls[callId];
          reject({ code: 'timeout', message: 'RPC timeout: ' + method });
        }, timeout);
        _pendingCalls[callId] = { resolve: resolve, reject: reject, timerId: timerId };
        postToHost({ type: MSG.CALL, v: PROTO_VERSION, callId: callId, method: method, args: args || [] });
      });
    },

    /** IPC 연결을 닫는다. */
    close: function () {
      _status = 'closed';
      var ids = Object.keys(_pendingCalls);
      for (var i = 0; i < ids.length; i++) {
        var p = _pendingCalls[ids[i]];
        clearTimeout(p.timerId);
        p.reject({ code: 'peer_down', message: 'IPC closed' });
      }
      _pendingCalls = {};
    },
  };

  // ── 핸드셰이크 시작 ───────────────────────────────────────────────────────
  _status = 'connecting';

  // expose된 메서드를 INIT으로 알리는 함수 (expose 이후 즉시 / 또는 DOMContentLoaded)
  function sendInit() {
    var methods = _pendingExpose !== null ? Object.keys(_pendingExpose) : Object.keys(_exposedApi);
    postToHost({ type: MSG.INIT, v: PROTO_VERSION, methods: methods });
    _handshakeTimer = setTimeout(function () {
      if (_status === 'connecting') {
        _status = 'error';
      }
    }, HANDSHAKE_TIMEOUT_MS);
  }

  // DOMContentLoaded 후 INIT 전송 (앱 코드가 expose 등록 후 자동 핸드셰이크)
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', sendInit);
  } else {
    sendInit();
  }

  // ── 글로벌 노출 ───────────────────────────────────────────────────────────
  globalThis.__zmosIpc = ipc;
})();
`;

/**
 * IPC 런타임을 srcdoc에 주입하기 위한 script 태그 문자열.
 * IPC_RUNTIME_IIFE 자체가 이미 (function(){...})()  IIFE 이므로
 * 추가로 감싸지 않는다 (이중 IIFE 회피).
 */
export function buildIpcScriptTag(): string {
  return `<script>${IPC_RUNTIME_IIFE}</script>`;
}

/**
 * HTML 문자열의 <head> 태그 직후에 IPC 런타임 script를 삽입한다.
 * <head>가 없으면 <html> 직후에 삽입.
 * 그것도 없으면 문서 맨 앞에 prepend.
 */
export function injectIpcRuntime(html: string): string {
  const scriptTag = `<script>${IPC_RUNTIME_IIFE}</script>`;

  if (html.includes('</head>')) {
    return html.replace('</head>', `${scriptTag}</head>`);
  }
  if (html.includes('<html')) {
    return html.replace(/(<html[^>]*>)/i, `$1${scriptTag}`);
  }
  return scriptTag + html;
}

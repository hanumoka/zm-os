import { createHostEndpoint } from './ipc/host';
import { injectIpcRuntime } from './ipc/runtime-iife';
import type { HostEndpoint, HostApi } from './ipc/types';

const ALLOWED_SANDBOX_TOKENS = ['allow-scripts'] as const;

export const SANDBOX_ORIGIN = 'null' as const;

// ─── IPC 옵션 타입 ────────────────────────────────────────────────────────────

/**
 * 샌드박스 IPC 설정.
 * SandboxOptions.ipc 필드로 전달한다.
 */
export type SandboxIpcOptions = {
  /**
   * 앱(iframe)이 호출할 수 있는 호스트 메서드 화이트리스트 (v1 권한 모델).
   * 미지정 시 빈 배열 → 모든 앱 → 호스트 호출 거부.
   */
  allowedMethods: ReadonlyArray<string>;
  /**
   * 호스트에서 앱으로 노출할 메서드 맵.
   * 앱은 window.__zmosIpc.call(method) 로 호출한다.
   */
  expose?: HostApi;
  /**
   * RPC 호출 기본 타임아웃 (ms). 기본값: 5000
   */
  defaultTimeoutMs?: number;
};

// ─── SandboxOptions ───────────────────────────────────────────────────────────

export type SandboxOptions = {
  html: string;
  width?: number;
  height?: number;
  /**
   * @deprecated onMessage는 레거시 단방향 메시지 수신 콜백.
   * 새 코드에서는 `ipc` 옵션을 사용할 것.
   * 기존 동작 보존을 위해 ipc와 병행 동작 가능.
   */
  onMessage?: (data: unknown) => void;
  /**
   * Comlink-style RPC IPC 설정.
   * 지정하면 srcdoc에 IPC 런타임이 자동 주입되고
   * SandboxHandle.ipc 를 통해 앱 메서드를 RPC 호출할 수 있다.
   */
  ipc?: SandboxIpcOptions;
};

// ─── SandboxHandle ────────────────────────────────────────────────────────────

export type SandboxHandle = {
  iframe: HTMLIFrameElement;
  destroy: () => void;
  /**
   * IPC 엔드포인트.
   * SandboxOptions.ipc 를 지정한 경우에만 존재.
   */
  ipc?: HostEndpoint;
};

// ─── createSandboxedFrame ─────────────────────────────────────────────────────

export function createSandboxedFrame(
  container: HTMLElement,
  opts: SandboxOptions,
): SandboxHandle {
  // env guard: document는 브라우저에서만 존재
  if (typeof document === 'undefined') {
    throw new Error('createSandboxedFrame는 브라우저 환경에서만 사용 가능합니다');
  }

  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', ALLOWED_SANDBOX_TOKENS.join(' '));
  iframe.referrerPolicy = 'no-referrer';
  iframe.width = String(opts.width ?? 800);
  iframe.height = String(opts.height ?? 600);
  iframe.style.border = '1px solid #d4d4d4';
  iframe.style.background = '#ffffff';

  // IPC 옵션이 있으면 srcdoc에 런타임 주입
  const finalHtml = opts.ipc !== undefined ? injectIpcRuntime(opts.html) : opts.html;
  iframe.srcdoc = finalHtml;

  // 레거시 onMessage 리스너 (deprecated, 하위 호환 유지)
  let legacyListener: ((e: MessageEvent) => void) | null = null;
  if (opts.onMessage) {
    const handler = opts.onMessage;
    legacyListener = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      if (event.origin !== SANDBOX_ORIGIN) return;
      handler(event.data);
    };
    window.addEventListener('message', legacyListener);
  }

  // IPC 엔드포인트 생성 (브라우저 환경 보장 — 위 env guard 통과 후)
  let ipcEndpoint: HostEndpoint | undefined;
  if (opts.ipc !== undefined) {
    const ipcOpts = opts.ipc;
    // iframe이 DOM에 추가된 후 contentWindow가 생기므로 먼저 append 후 생성
    container.appendChild(iframe);
    ipcEndpoint = createHostEndpoint({
      iframe,
      allowedMethods: ipcOpts.allowedMethods,
      expose: ipcOpts.expose,
      defaultTimeoutMs: ipcOpts.defaultTimeoutMs,
    });
  } else {
    container.appendChild(iframe);
  }

  return {
    iframe,
    ipc: ipcEndpoint,
    destroy: () => {
      if (legacyListener) window.removeEventListener('message', legacyListener);
      ipcEndpoint?.close();
      iframe.remove();
    },
  };
}

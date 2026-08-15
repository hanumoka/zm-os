import { createHostEndpoint, injectIpcRuntime } from '@zm/ipc';
import type { HostEndpoint } from '@zm/ipc';
import { resolveHostApi, type HostApiContext } from './host-api';

const ALLOWED_SANDBOX_TOKENS = ['allow-scripts'] as const;

export const SANDBOX_ORIGIN = 'null' as const;

// ─── IPC 옵션 타입 ────────────────────────────────────────────────────────────

/**
 * 샌드박스 IPC 설정.
 * SandboxOptions.ipc 필드로 전달한다.
 *
 * **허용 메서드 목록과 핸들러 구현을 여기서 받지 않는다.** 둘 다 `capabilities`에서
 * 파생되며 그 파생은 `host-api/`의 합성 루트 한 곳에서만 일어난다. 예전에는 이 자리에
 * `allowedMethods`와 `expose`가 있었고, 그 결과 두 호출자가 같은 배열을 각각 하드코딩한
 * 채 capability 시스템은 아무도 부르지 않는 상태로 남아 있었다.
 */
export type SandboxIpcOptions = {
  /**
   * 앱 매니페스트가 선언한 capability 토큰.
   * 카탈로그에 없는 토큰은 무시된다(fail-closed).
   */
  capabilities: ReadonlyArray<string>;
  /**
   * 호스트 API가 부수 효과를 낼 창구. 대상 창은 여기서 이미 고정되어 있다.
   */
  context: HostApiContext;
  /**
   * RPC 호출 기본 타임아웃 (ms). 기본값: 5000
   */
  defaultTimeoutMs?: number;
  /**
   * 호출별 인가 훅. allowedMethods 화이트리스트를 통과한 뒤 한 번 더 묻는다.
   * `@zm/ipc`는 이미 이 훅을 소비한다 — 여기서 넘기지 않으면 패키지 경계에서 끊겨
   * capability broker를 붙일 때 이 경로의 파일들을 다시 열어야 한다.
   * 미지정 시 동작은 이전과 동일하다.
   */
  authorize?: (method: string, args: ReadonlyArray<unknown>) => boolean;
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
  // width/height 속성은 내재 크기(fallback)로만 남긴다. 컨테이너가 크기를 갖지
  // 못하는 예외적인 경우에도 프레임이 0으로 접히지 않게 하기 위해서다.
  iframe.width = String(opts.width ?? 800);
  iframe.height = String(opts.height ?? 600);

  // 실제 크기는 컨테이너를 따라간다.
  //
  // 예전에는 위 속성이 곧 표시 크기였다. 그래서 창을 리사이즈해도 앱은 매니페스트의
  // defaultWidth/defaultHeight에 고정된 채 남고, 창의 나머지 영역이 빈 배경으로
  // 드러났다. 창 크기와 앱 크기가 어긋나 보이는 원인이 이것이다.
  //
  // 두 호출자(AppFrame, sandbox-test) 모두 `w-full h-full` 컨테이너를 크기가 확정된
  // Window 안에 두므로 100%가 안전하게 해석된다.
  iframe.style.display = 'block';
  iframe.style.width = '100%';
  iframe.style.height = '100%';
  // border가 100% 위에 더해져 넘치지 않도록 한다.
  iframe.style.boxSizing = 'border-box';
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
    const resolved = resolveHostApi(ipcOpts.capabilities, ipcOpts.context);
    if (resolved.unknownCapabilities.length > 0) {
      // 조용히 버리면 오타가 "권한 없음"으로만 나타나 원인을 찾을 수 없다.
      console.warn(
        '[zm-os] 알 수 없는 capability 토큰을 무시했습니다:',
        resolved.unknownCapabilities,
      );
    }
    ipcEndpoint = createHostEndpoint({
      iframe,
      allowedMethods: resolved.allowedMethods,
      expose: resolved.expose,
      // 호스트→앱 방향은 앱의 이름 공간이다. 지금 호스트가 앱을 호출하는 경로가 없으므로
      // 닫아 둔다. 여는 것은 그 경로를 실제로 만들 때다.
      callableAppMethods: [],
      reportUnimplemented: resolved.hasPlanned,
      defaultTimeoutMs: ipcOpts.defaultTimeoutMs,
      authorize: ipcOpts.authorize,
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

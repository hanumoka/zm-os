const ALLOWED_SANDBOX_TOKENS = ['allow-scripts'] as const;

export const SANDBOX_ORIGIN = 'null' as const;

export type SandboxOptions = {
  html: string;
  width?: number;
  height?: number;
  onMessage?: (data: unknown) => void;
};

export type SandboxHandle = {
  iframe: HTMLIFrameElement;
  destroy: () => void;
};

export function createSandboxedFrame(
  container: HTMLElement,
  opts: SandboxOptions,
): SandboxHandle {
  const iframe = document.createElement('iframe');
  iframe.setAttribute('sandbox', ALLOWED_SANDBOX_TOKENS.join(' '));
  iframe.referrerPolicy = 'no-referrer';
  iframe.width = String(opts.width ?? 800);
  iframe.height = String(opts.height ?? 600);
  iframe.style.border = '1px solid #d4d4d4';
  iframe.style.background = '#ffffff';
  iframe.srcdoc = opts.html;

  let listener: ((e: MessageEvent) => void) | null = null;
  if (opts.onMessage) {
    const handler = opts.onMessage;
    listener = (event: MessageEvent) => {
      if (event.source !== iframe.contentWindow) return;
      if (event.origin !== SANDBOX_ORIGIN) return;
      handler(event.data);
    };
    window.addEventListener('message', listener);
  }

  container.appendChild(iframe);

  return {
    iframe,
    destroy: () => {
      if (listener) window.removeEventListener('message', listener);
      iframe.remove();
    },
  };
}

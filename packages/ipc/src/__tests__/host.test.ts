import { beforeEach, describe, expect, it } from 'vitest';
import { createHostEndpoint } from '../host';
import { MSG_TYPE, IPC_PROTOCOL_VERSION } from '../protocol';

/**
 * host.ts의 보안 게이트 회귀 테스트.
 *
 * 이 파일이 지키는 것은 네 가지다.
 *   1. event.source가 대상 iframe이 아니면 무시
 *   2. event.origin이 샌드박스 origin이 아니면 무시
 *   3. 호스트→앱 호출은 앱이 INIT에서 announce한 것 ∩ allowedMethods 안에서만
 *   4. authorize 훅이 거부하면 앱→호스트 호출도 거부
 *
 * 특히 3번은 과거에 우회 가능한 결함이 있었다고 코드 주석(TS-002)이 기록하는데
 * 그 수정을 고정하는 테스트가 없었다. 실제 iframe 없이 스텁 contentWindow와
 * 위조 MessageEvent만으로 전 경로를 검사한다.
 */

const SANDBOX_ORIGIN = 'null';

type Sent = { data: unknown; targetOrigin: string };

/** iframe.contentWindow 스텁 — postMessage를 기록만 한다. */
function makeIframe(): { iframe: HTMLIFrameElement; sent: Sent[] } {
  const sent: Sent[] = [];
  const contentWindow = {
    postMessage(data: unknown, targetOrigin: string): void {
      sent.push({ data, targetOrigin });
    },
  };
  const iframe = document.createElement('iframe');
  Object.defineProperty(iframe, 'contentWindow', {
    value: contentWindow,
    writable: false,
  });
  return { iframe, sent };
}

/** 앱이 보낸 것처럼 위조한 메시지를 window에 전달한다. */
function deliver(
  data: unknown,
  opts: { source?: unknown; origin?: string } = {},
  iframe?: HTMLIFrameElement,
): void {
  const event = new MessageEvent('message', {
    data,
    origin: opts.origin ?? SANDBOX_ORIGIN,
  });
  Object.defineProperty(event, 'source', {
    value: 'source' in opts ? opts.source : iframe?.contentWindow,
    writable: false,
  });
  window.dispatchEvent(event);
}

// 스키마가 .strict()라 여기 없는 필드를 하나라도 붙이면 통째로 거부된다.
const initMsg = (methods: ReadonlyArray<string>) => ({
  type: MSG_TYPE.INIT,
  v: IPC_PROTOCOL_VERSION,
  methods,
});

describe('출처 검증', () => {
  let iframe: HTMLIFrameElement;
  let sent: Sent[];

  beforeEach(() => {
    ({ iframe, sent } = makeIframe());
  });

  it('다른 창이 보낸 메시지는 무시한다', () => {
    const ep = createHostEndpoint({ iframe, allowedMethods: ['ping'] });
    deliver(initMsg(['ping']), { source: { other: true } }, iframe);
    // READY 응답이 나가지 않았다 = INIT이 처리되지 않았다
    expect(sent).toHaveLength(0);
    expect(ep.status).not.toBe('ready');
  });

  it('origin이 샌드박스 origin이 아니면 무시한다', () => {
    const ep = createHostEndpoint({ iframe, allowedMethods: ['ping'] });
    deliver(initMsg(['ping']), { origin: 'https://evil.example' }, iframe);
    expect(sent).toHaveLength(0);
    expect(ep.status).not.toBe('ready');
  });

  it('출처가 맞으면 INIT을 처리하고 READY를 보낸다', () => {
    const ep = createHostEndpoint({ iframe, allowedMethods: ['ping'] });
    deliver(initMsg(['ping']), {}, iframe);
    expect(ep.status).toBe('ready');
    const ready = sent.find(
      (s) => (s.data as { type?: string }).type === MSG_TYPE.READY,
    );
    expect(ready).toBeDefined();
    expect(ready?.targetOrigin).toBe('*');
  });
});

describe('호스트 → 앱 호출 게이트 (TS-002 회귀 잠금)', () => {
  it('INIT 전 호출은 ready가 아니므로 화이트리스트 검사를 우회하지 못한다', async () => {
    const { iframe } = makeIframe();
    const ep = createHostEndpoint({ iframe, allowedMethods: ['ping'] });
    // connecting 상태에서는 전송 후 타임아웃으로 차단된다 — 성공하지 않는다.
    await expect(ep.call('ping', [], 30)).rejects.toThrow();
  });

  it('앱이 announce하지 않은 메서드는 거부된다', async () => {
    const { iframe } = makeIframe();
    const ep = createHostEndpoint({ iframe, allowedMethods: ['ping', 'pong'] });
    deliver(initMsg(['ping']), {}, iframe); // pong은 announce 안 함
    expect(ep.status).toBe('ready');
    await expect(ep.call('pong')).rejects.toMatchObject({ code: 'denied' });
  });

  it('announce했지만 allowedMethods 밖이면 거부된다', async () => {
    const { iframe } = makeIframe();
    const ep = createHostEndpoint({ iframe, allowedMethods: ['ping'] });
    deliver(initMsg(['ping', 'danger']), {}, iframe);
    await expect(ep.call('danger')).rejects.toMatchObject({ code: 'denied' });
  });

  it('아무것도 announce하지 않으면 모든 호출이 거부된다', async () => {
    const { iframe } = makeIframe();
    const ep = createHostEndpoint({ iframe, allowedMethods: ['ping'] });
    deliver(initMsg([]), {}, iframe);
    await expect(ep.call('ping')).rejects.toMatchObject({ code: 'denied' });
  });

  it('교집합 안의 메서드는 실제로 전송된다', () => {
    const { iframe, sent } = makeIframe();
    const ep = createHostEndpoint({ iframe, allowedMethods: ['ping'] });
    deliver(initMsg(['ping']), {}, iframe);
    void ep.call('ping', [], 30).catch(() => undefined);
    const call = sent.find((s) => (s.data as { type?: string }).type === MSG_TYPE.CALL);
    expect(call).toBeDefined();
  });
});

describe('앱 → 호스트 호출 인가', () => {
  const callMsg = (method: string, args: ReadonlyArray<unknown> = []) => ({
    type: MSG_TYPE.CALL,
    v: IPC_PROTOCOL_VERSION,
    callId: 'c1',
    method,
    args,
  });

  const errorOf = (sent: Sent[]): { code?: string } | undefined =>
    sent
      .map((s) => s.data as { type?: string; code?: string })
      .find((d) => d.type === MSG_TYPE.ERROR);

  it('allowedMethods 밖 메서드는 denied로 응답한다', () => {
    const { iframe, sent } = makeIframe();
    createHostEndpoint({
      iframe,
      allowedMethods: ['safe'],
      expose: { safe: () => 1, unsafe: () => 2 },
    });
    deliver(initMsg(['x']), {}, iframe);
    deliver(callMsg('unsafe'), {}, iframe);
    expect(errorOf(sent)?.code).toBe('denied');
  });

  it('authorize가 false를 반환하면 화이트리스트를 통과해도 거부한다', () => {
    const { iframe, sent } = makeIframe();
    createHostEndpoint({
      iframe,
      allowedMethods: ['safe'],
      expose: { safe: () => 1 },
      authorize: () => false,
    });
    deliver(initMsg(['x']), {}, iframe);
    deliver(callMsg('safe'), {}, iframe);
    expect(errorOf(sent)?.code).toBe('denied');
  });

  it('authorize 미지정이면 화이트리스트만으로 판단한다 (기존 동작 유지)', () => {
    const { iframe, sent } = makeIframe();
    createHostEndpoint({
      iframe,
      allowedMethods: ['safe'],
      expose: { safe: () => 42 },
    });
    deliver(initMsg(['x']), {}, iframe);
    deliver(callMsg('safe'), {}, iframe);
    expect(errorOf(sent)).toBeUndefined();
  });

  it('authorize는 메서드명과 인자를 함께 받는다', () => {
    const seen: Array<{ method: string; args: ReadonlyArray<unknown> }> = [];
    const { iframe } = makeIframe();
    createHostEndpoint({
      iframe,
      allowedMethods: ['safe'],
      expose: { safe: () => 1 },
      authorize: (method, args) => {
        seen.push({ method, args });
        return true;
      },
    });
    deliver(initMsg(['x']), {}, iframe);
    deliver(callMsg('safe', [1, 'two']), {}, iframe);
    expect(seen).toEqual([{ method: 'safe', args: [1, 'two'] }]);
  });
});

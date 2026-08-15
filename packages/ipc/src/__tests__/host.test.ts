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

describe('두 방향의 화이트리스트 분리', () => {
  /**
   * 예전에는 `allowedMethods` 하나가 양방향에 쓰였다. 두 방향은 이름 공간이 다르므로
   * 호스트 메서드 이름이 `demo.ping` 같은 형태가 되는 순간, 앱이 announce한 이름과의
   * 교집합이 **영구히 빈 배열**이 되어 호스트→앱 호출이 구조적으로 불가능해진다.
   *
   * 그때 이것이 드러나지 않는 이유는 샘플 앱이 `expose()`를 부르지 않아 그 방향이
   * 쓰이지 않기 때문이다. 즉 **아무 테스트도 잡지 못하는 잠복 결함**이 된다.
   * 아래가 그 자리를 메운다.
   */

  it('호스트 메서드 이름이 FQN이어도 호스트→앱 호출이 살아 있다', () => {
    const { iframe, sent } = makeIframe();
    const ep = createHostEndpoint({
      iframe,
      allowedMethods: ['demo.ping', 'shell.setTitle'], // 앱→호스트 (호스트 이름 공간)
      callableAppMethods: ['flushNow'], // 호스트→앱 (앱 이름 공간)
    });
    deliver(initMsg(['flushNow']), {}, iframe);
    expect(ep.status).toBe('ready');

    void ep.call('flushNow', [], 30).catch(() => undefined);
    const call = sent.find((s) => (s.data as { type?: string }).type === MSG_TYPE.CALL);
    expect(call).toBeDefined();
  });

  it('두 목록을 공유하면 교집합이 비어 호출이 죽는다 — 분리의 근거', async () => {
    const { iframe } = makeIframe();
    // callableAppMethods를 주지 않으면 allowedMethods로 폴백한다(하위호환).
    // 그 폴백이 FQN 이름과 만나면 이렇게 된다.
    const ep = createHostEndpoint({ iframe, allowedMethods: ['demo.ping'] });
    deliver(initMsg(['flushNow']), {}, iframe);
    await expect(ep.call('flushNow')).rejects.toMatchObject({ code: 'denied' });
  });

  it('앱→호스트 게이트는 callableAppMethods의 영향을 받지 않는다', () => {
    const { iframe, sent } = makeIframe();
    createHostEndpoint({
      iframe,
      allowedMethods: ['demo.ping'],
      callableAppMethods: [], // 호스트→앱을 완전히 닫아도
      expose: { 'demo.ping': () => 'pong' },
    });
    deliver(initMsg([]), {}, iframe);
    deliver(callMsg('demo.ping'), {}, iframe);
    // 앱→호스트는 정상 동작해야 한다.
    expect(errorOf(sent)).toBeUndefined();
  });
});

describe('구현 부재와 권한 부재의 구분', () => {
  it('reportUnimplemented면 unimplemented로 회신한다', () => {
    const { iframe, sent } = makeIframe();
    createHostEndpoint({
      iframe,
      allowedMethods: ['notes.list'], // 권한은 있고
      expose: {}, // 핸들러는 없다 (계약의 planned 상태)
      reportUnimplemented: true,
    });
    deliver(initMsg([]), {}, iframe);
    deliver(callMsg('notes.list'), {}, iframe);
    expect(errorOf(sent)).toMatchObject({ code: 'unimplemented' });
  });

  it('기본값은 종전대로 denied다', () => {
    const { iframe, sent } = makeIframe();
    createHostEndpoint({ iframe, allowedMethods: ['notes.list'], expose: {} });
    deliver(initMsg([]), {}, iframe);
    deliver(callMsg('notes.list'), {}, iframe);
    expect(errorOf(sent)).toMatchObject({ code: 'denied' });
  });

  it('권한이 없으면 구현 여부와 무관하게 denied다', () => {
    const { iframe, sent } = makeIframe();
    createHostEndpoint({
      iframe,
      allowedMethods: [],
      expose: { 'notes.list': () => [] },
      reportUnimplemented: true,
    });
    deliver(initMsg([]), {}, iframe);
    deliver(callMsg('notes.list'), {}, iframe);
    expect(errorOf(sent)).toMatchObject({ code: 'denied' });
  });
});

describe('리스너가 예외로 죽지 않는다', () => {
  /**
   * `_dispatch`에서 예외가 새면 그 메시지 처리만이 아니라 **호스트 리스너 전체**가
   * uncaught error를 낸다. 앱이 보낸 값과 호출자가 준 콜백이 모두 여기서 실행되므로
   * 둘 다 신뢰할 수 없다.
   */

  const tick = (): Promise<void> => new Promise((r) => setTimeout(r, 0));

  it('호출자 콜백(onRateLimitExceeded)이 던져도 리스너가 살아 있다', async () => {
    const { iframe, sent } = makeIframe();
    createHostEndpoint({
      iframe,
      allowedMethods: ['ok'],
      expose: { ok: () => 1 },
      rateLimit: { maxMessages: 1, windowMs: 10_000, penaltyMs: 10_000 },
      onRateLimitExceeded: () => {
        throw new Error('호출자 콜백 폭발');
      },
    });
    deliver(initMsg([]), {}, iframe);
    deliver(callMsg('ok'), {}, iframe); // 1건 소진
    deliver(callMsg('ok'), {}, iframe); // 상한 초과 → 콜백이 던진다

    sent.length = 0;
    // rate limit이 풀리지 않아도 리스너 자체는 살아 있어야 한다.
    // 살아 있음의 증거로 INIT 재처리가 예외 없이 지나가는지 본다.
    expect(() => deliver(initMsg([]), {}, iframe)).not.toThrow();
    await tick();
  });

  it('핸들러가 던져도 다음 호출이 정상 처리된다', async () => {
    const { iframe, sent } = makeIframe();
    createHostEndpoint({
      iframe,
      allowedMethods: ['boom', 'ok'],
      expose: {
        boom: () => {
          throw new Error('핸들러 폭발');
        },
        ok: () => 1,
      },
    });
    deliver(initMsg([]), {}, iframe);
    deliver(callMsg('boom'), {}, iframe);
    await tick();

    sent.length = 0;
    deliver(callMsg('ok'), {}, iframe);
    await tick(); // RESULT는 await 뒤에 나간다
    expect(sent.some((s) => (s.data as { type?: string }).type === MSG_TYPE.RESULT)).toBe(true);
  });
});

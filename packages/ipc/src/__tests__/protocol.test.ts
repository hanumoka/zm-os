import { describe, it, expect } from 'vitest';
import { parseIpcMsg, MSG_TYPE, IPC_PROTOCOL_VERSION } from '../protocol';

const V = IPC_PROTOCOL_VERSION;

describe('parseIpcMsg', () => {
  it('parses valid INIT message', () => {
    const msg = parseIpcMsg({ type: MSG_TYPE.INIT, v: V, methods: ['ping'] });
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(MSG_TYPE.INIT);
  });

  it('parses valid READY message', () => {
    const msg = parseIpcMsg({
      type: MSG_TYPE.READY,
      v: V,
      hostOrigin: 'http://localhost:3000',
      grantedMethods: ['ping'],
    });
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(MSG_TYPE.READY);
  });

  it('parses READY with optional grantedCapabilities (additive, ADR-0034)', () => {
    const msg = parseIpcMsg({
      type: MSG_TYPE.READY,
      v: V,
      hostOrigin: 'http://localhost:3000',
      grantedMethods: ['ping'],
      grantedCapabilities: ['demo.basic'],
    });
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(MSG_TYPE.READY);
  });

  it('parses valid CALL message', () => {
    const msg = parseIpcMsg({
      type: MSG_TYPE.CALL,
      v: V,
      callId: 'c1',
      method: 'ping',
      args: [],
    });
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(MSG_TYPE.CALL);
  });

  it('parses valid RESULT message', () => {
    const msg = parseIpcMsg({
      type: MSG_TYPE.RESULT,
      v: V,
      callId: 'c1',
      result: 'pong',
    });
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(MSG_TYPE.RESULT);
  });

  it('parses valid ERROR message', () => {
    const msg = parseIpcMsg({
      type: MSG_TYPE.ERROR,
      v: V,
      callId: 'c1',
      code: 'timeout',
      message: 'timed out',
    });
    expect(msg).not.toBeNull();
    expect(msg!.type).toBe(MSG_TYPE.ERROR);
  });

  it('parses ERROR with rate_limited code', () => {
    const msg = parseIpcMsg({
      type: MSG_TYPE.ERROR,
      v: V,
      code: 'rate_limited',
      message: 'too many messages',
    });
    expect(msg).not.toBeNull();
  });

  it('returns null for non-object input', () => {
    expect(parseIpcMsg(null)).toBeNull();
    expect(parseIpcMsg('string')).toBeNull();
    expect(parseIpcMsg(42)).toBeNull();
    expect(parseIpcMsg(undefined)).toBeNull();
  });

  it('returns null for missing type field', () => {
    expect(parseIpcMsg({ v: V, methods: ['ping'] })).toBeNull();
  });

  it('returns null for non-zm_ipc_ prefix', () => {
    expect(parseIpcMsg({ type: 'other_msg', v: V })).toBeNull();
  });

  it('returns null for wrong protocol version', () => {
    expect(parseIpcMsg({ type: MSG_TYPE.INIT, v: 999, methods: ['ping'] })).toBeNull();
  });

  it('returns null for dangerous key (constructor)', () => {
    const obj = Object.create(null) as Record<string, unknown>;
    obj['type'] = MSG_TYPE.INIT;
    obj['v'] = V;
    obj['methods'] = ['ping'];
    obj['constructor'] = true;
    expect(parseIpcMsg(obj)).toBeNull();
  });

  it('returns null for extra fields (strict mode)', () => {
    expect(parseIpcMsg({
      type: MSG_TYPE.INIT,
      v: V,
      methods: ['ping'],
      extraField: true,
    })).toBeNull();
  });
});

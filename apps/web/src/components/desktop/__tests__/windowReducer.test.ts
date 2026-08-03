import { describe, expect, it } from 'vitest';
import { windowReducer } from '../windowReducer';
import type { WindowState } from '../types';

const open = (id: string, extra: Partial<WindowState> = {}): WindowState => ({
  id,
  title: id,
  contentId: id,
  state: 'open',
  zIndex: 11,
  position: { x: 80, y: 80 },
  size: { width: 640, height: 480 },
  ...extra,
});

describe('OPEN', () => {
  it('새 윈도우를 추가하고 z를 올린다', () => {
    const next = windowReducer([], { type: 'OPEN', payload: { id: 'a', title: 'A', contentId: 'a' } });
    expect(next).toHaveLength(1);
    expect(next[0]?.id).toBe('a');
    expect(next[0]?.state).toBe('open');
  });

  it('이미 열린 id는 추가하지 않고 포커스만 올린다', () => {
    const state = [open('a'), open('b', { zIndex: 12 })];
    const next = windowReducer(state, { type: 'OPEN', payload: { id: 'a', title: 'A', contentId: 'a' } });
    expect(next).toHaveLength(2);
    const a = next.find((w) => w.id === 'a');
    const b = next.find((w) => w.id === 'b');
    expect(a?.zIndex).toBeGreaterThan(b?.zIndex ?? 0);
  });

  it('cascade 위치는 기존 윈도우 수에 따라 어긋난다', () => {
    let state: WindowState[] = [];
    state = windowReducer(state, { type: 'OPEN', payload: { id: 'a', title: 'A', contentId: 'a' } });
    state = windowReducer(state, { type: 'OPEN', payload: { id: 'b', title: 'B', contentId: 'b' } });
    expect(state[0]?.position).not.toEqual(state[1]?.position);
  });

  it('initialPosition/Size가 있으면 그대로 쓴다', () => {
    const next = windowReducer([], {
      type: 'OPEN',
      payload: {
        id: 'a',
        title: 'A',
        contentId: 'a',
        initialPosition: { x: 5, y: 7 },
        initialSize: { width: 100, height: 200 },
      },
    });
    expect(next[0]?.position).toEqual({ x: 5, y: 7 });
    expect(next[0]?.size).toEqual({ width: 100, height: 200 });
  });
});

describe('상태 전이', () => {
  it('CLOSE는 해당 윈도우만 제거한다', () => {
    const next = windowReducer([open('a'), open('b')], { type: 'CLOSE', payload: { id: 'a' } });
    expect(next.map((w) => w.id)).toEqual(['b']);
  });

  it('MINIMIZE / MAXIMIZE / RESTORE가 state만 바꾼다', () => {
    let s = [open('a')];
    s = windowReducer(s, { type: 'MINIMIZE', payload: { id: 'a' } });
    expect(s[0]?.state).toBe('minimized');
    s = windowReducer(s, { type: 'MAXIMIZE', payload: { id: 'a' } });
    expect(s[0]?.state).toBe('maximized');
    s = windowReducer(s, { type: 'RESTORE', payload: { id: 'a' } });
    expect(s[0]?.state).toBe('open');
    // 위치·크기는 상태 전이로 바뀌지 않는다
    expect(s[0]?.position).toEqual({ x: 80, y: 80 });
  });

  it('SET_POSITION / SET_SIZE는 대상만 바꾼다', () => {
    const s = windowReducer([open('a'), open('b')], {
      type: 'SET_POSITION',
      payload: { id: 'a', x: 11, y: 22 },
    });
    expect(s.find((w) => w.id === 'a')?.position).toEqual({ x: 11, y: 22 });
    expect(s.find((w) => w.id === 'b')?.position).toEqual({ x: 80, y: 80 });
  });

  it('존재하지 않는 id에 대한 액션은 아무것도 바꾸지 않는다', () => {
    const state = [open('a')];
    for (const action of [
      { type: 'CLOSE' as const, payload: { id: 'zzz' } },
      { type: 'MINIMIZE' as const, payload: { id: 'zzz' } },
      { type: 'SET_SIZE' as const, payload: { id: 'zzz', width: 1, height: 1 } },
    ]) {
      expect(windowReducer(state, action)).toEqual(state);
    }
  });
});

describe('RESTORE_LAYOUT', () => {
  it('기존 상태를 통째로 교체한다', () => {
    const restored = [open('x'), open('y')];
    const next = windowReducer([open('a')], {
      type: 'RESTORE_LAYOUT',
      payload: { windows: restored },
    });
    expect(next.map((w) => w.id)).toEqual(['x', 'y']);
  });

  it('빈 배열로도 교체된다', () => {
    expect(windowReducer([open('a')], { type: 'RESTORE_LAYOUT', payload: { windows: [] } })).toEqual([]);
  });
});

describe('불변성', () => {
  it('입력 배열을 제자리 변경하지 않는다', () => {
    const state = [open('a')];
    const snapshot = JSON.parse(JSON.stringify(state));
    windowReducer(state, { type: 'SET_POSITION', payload: { id: 'a', x: 1, y: 2 } });
    windowReducer(state, { type: 'CLOSE', payload: { id: 'a' } });
    expect(state).toEqual(snapshot);
  });
});

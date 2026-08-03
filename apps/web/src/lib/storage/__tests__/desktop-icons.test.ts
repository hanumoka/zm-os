import { describe, expect, it } from 'vitest';
import {
  ICON_GRID,
  ICON_SIZE,
  arrangeInGrid,
  cellKey,
  clampPositions,
  clampToArea,
  findFreeCell,
  resolveDropPosition,
  snapToGrid,
} from '../desktop-icons';

describe('snapToGrid', () => {
  it('격자 위 좌표는 그대로 둔다', () => {
    expect(snapToGrid({ x: 30, y: 30 })).toEqual({ x: 30, y: 30 });
    expect(snapToGrid({ x: 30, y: 130 })).toEqual({ x: 30, y: 130 });
    expect(snapToGrid({ x: 130, y: 230 })).toEqual({ x: 130, y: 230 });
  });

  it('desktopApps.ts의 기존 하드코딩 좌표는 이미 격자 위에 있다', () => {
    for (const y of [30, 130, 230, 330, 430]) {
      expect(snapToGrid({ x: 30, y })).toEqual({ x: 30, y });
    }
  });

  it('가장 가까운 셀로 반올림한다', () => {
    expect(snapToGrid({ x: 74, y: 30 })).toEqual({ x: 30, y: 30 });
    expect(snapToGrid({ x: 81, y: 30 })).toEqual({ x: 130, y: 30 });
    expect(snapToGrid({ x: 30, y: 179 })).toEqual({ x: 30, y: 130 });
    expect(snapToGrid({ x: 30, y: 181 })).toEqual({ x: 30, y: 230 });
  });

  it('origin보다 작은 좌표는 첫 셀로 모은다 (음수 셀 금지)', () => {
    expect(snapToGrid({ x: -500, y: -500 })).toEqual({ x: 30, y: 30 });
    expect(snapToGrid({ x: 0, y: 0 })).toEqual({ x: 30, y: 30 });
  });
});

describe('clampToArea', () => {
  it('아이콘 크기를 고려해 우측·하단을 가둔다', () => {
    expect(clampToArea({ x: 5000, y: 5000 }, 1000, 600)).toEqual({
      x: 1000 - ICON_SIZE,
      y: 600 - ICON_SIZE,
    });
  });

  it('음수를 0으로 가둔다', () => {
    expect(clampToArea({ x: -20, y: -99 }, 1000, 600)).toEqual({ x: 0, y: 0 });
  });

  it('영역이 아이콘보다 작아도 음수를 만들지 않는다', () => {
    expect(clampToArea({ x: 50, y: 50 }, 40, 40)).toEqual({ x: 0, y: 0 });
  });
});

describe('resolveDropPosition', () => {
  it('영역 안 드롭은 격자로 스냅한다', () => {
    expect(resolveDropPosition({ x: 138, y: 126 }, 1000, 600)).toEqual({ x: 130, y: 130 });
  });

  it('스냅 결과가 영역을 벗어나면 다시 가둔다', () => {
    const result = resolveDropPosition({ x: 980, y: 580 }, 1000, 600);
    expect(result.x).toBeLessThanOrEqual(1000 - ICON_SIZE);
    expect(result.y).toBeLessThanOrEqual(600 - ICON_SIZE);
  });

  it('결과는 항상 음수가 아니다', () => {
    const result = resolveDropPosition({ x: -300, y: -300 }, 1000, 600);
    expect(result.x).toBeGreaterThanOrEqual(0);
    expect(result.y).toBeGreaterThanOrEqual(0);
  });
});

describe('겹침 방지 (findFreeCell / resolveDropPosition occupied)', () => {
  it('빈 셀이면 그대로 둔다', () => {
    const occupied = new Set([cellKey({ x: 30, y: 130 })]);
    expect(resolveDropPosition({ x: 30, y: 230 }, 1000, 600, occupied)).toEqual({ x: 30, y: 230 });
  });

  it('점유된 셀에 놓으면 인접한 빈 셀로 밀어낸다', () => {
    // 30,230의 아이콘을 위로 끌어 30,130(IPC Demo 자리)에 놓는 상황
    const occupied = new Set([cellKey({ x: 30, y: 130 })]);
    const result = resolveDropPosition({ x: 30, y: 170 }, 1000, 600, occupied);
    expect(result).not.toEqual({ x: 30, y: 130 });
    expect(occupied.has(cellKey(result))).toBe(false);
    // 인접 셀이어야 한다 (한 칸 거리)
    const dx = Math.abs(result.x - 30) / ICON_GRID.cellWidth;
    const dy = Math.abs(result.y - 130) / ICON_GRID.cellHeight;
    expect(Math.max(dx, dy)).toBe(1);
  });

  it('여러 셀이 막혀 있어도 빈 셀을 찾는다', () => {
    const occupied = new Set(
      [30, 130, 230].flatMap((x) => [30, 130, 230].map((y) => cellKey({ x, y }))),
    );
    const result = resolveDropPosition({ x: 130, y: 130 }, 1000, 600, occupied);
    expect(occupied.has(cellKey(result))).toBe(false);
  });

  it('영역 밖으로는 밀어내지 않는다', () => {
    const occupied = new Set([cellKey({ x: 30, y: 30 })]);
    const result = findFreeCell({ x: 30, y: 30 }, occupied, 200, 200);
    expect(result.x).toBeLessThanOrEqual(200 - ICON_SIZE);
    expect(result.y).toBeLessThanOrEqual(200 - ICON_SIZE);
    expect(result.x).toBeGreaterThanOrEqual(0);
  });

  it('occupied를 주지 않으면 겹침 검사를 하지 않는다 (하위호환)', () => {
    expect(resolveDropPosition({ x: 30, y: 170 }, 1000, 600)).toEqual({ x: 30, y: 130 });
  });
});

describe('clampPositions', () => {
  it('영역이 줄면 밖으로 나간 좌표를 안으로 끌어들인다', () => {
    const result = clampPositions({ a: { x: 1630, y: 30 } }, 1280, 600);
    expect(result.a.x).toBe(1280 - ICON_SIZE);
  });

  it('영역 크기를 모르면(0) 좌표를 건드리지 않는다', () => {
    const input = { a: { x: 1630, y: 900 } };
    expect(clampPositions(input, 0, 0)).toEqual(input);
  });

  it('영역 안 좌표는 그대로 둔다', () => {
    const input = { a: { x: 30, y: 130 } };
    expect(clampPositions(input, 1280, 600)).toEqual(input);
  });
});

describe('arrangeInGrid', () => {
  it('위에서 아래로 채우고 열이 차면 다음 열로 넘어간다', () => {
    // 높이 430 → usable 400 → 4행
    const result = arrangeInGrid(['a', 'b', 'c', 'd', 'e'], 430);
    expect(result.a).toEqual({ x: 30, y: 30 });
    expect(result.b).toEqual({ x: 30, y: 130 });
    expect(result.c).toEqual({ x: 30, y: 230 });
    expect(result.d).toEqual({ x: 30, y: 330 });
    expect(result.e).toEqual({ x: 130, y: 30 });
  });

  it('영역이 아주 낮아도 최소 1행은 보장한다', () => {
    const result = arrangeInGrid(['a', 'b'], 10);
    expect(result.a).toEqual({ x: 30, y: 30 });
    expect(result.b).toEqual({ x: 30 + ICON_GRID.cellWidth, y: 30 });
  });

  it('빈 목록은 빈 결과를 만든다', () => {
    expect(arrangeInGrid([], 600)).toEqual({});
  });

  it('모든 결과 좌표는 격자 위에 있다', () => {
    const ids = Array.from({ length: 12 }, (_, i) => `app-${i}`);
    const result = arrangeInGrid(ids, 600);
    for (const point of Object.values(result)) {
      expect(snapToGrid(point)).toEqual(point);
    }
  });

  it('폭을 주면 좁은 창에서도 영역 밖으로 나가지 않는다', () => {
    // 500×300 영역 → rows=2, cols=4 → 용량 8개인데 13개를 배치
    const ids = Array.from({ length: 13 }, (_, i) => `app-${i}`);
    const result = arrangeInGrid(ids, 300, 500);
    for (const point of Object.values(result)) {
      expect(point.x).toBeLessThanOrEqual(500 - ICON_SIZE);
      expect(point.y).toBeLessThanOrEqual(300 - ICON_SIZE);
      expect(point.x).toBeGreaterThanOrEqual(0);
      expect(point.y).toBeGreaterThanOrEqual(0);
    }
  });

  it('폭을 주지 않으면 기존처럼 열을 무제한으로 늘린다 (하위호환)', () => {
    const result = arrangeInGrid(['a', 'b', 'c'], 130);
    expect(result.a).toEqual({ x: 30, y: 30 });
    expect(result.b).toEqual({ x: 130, y: 30 });
    expect(result.c).toEqual({ x: 230, y: 30 });
  });
});

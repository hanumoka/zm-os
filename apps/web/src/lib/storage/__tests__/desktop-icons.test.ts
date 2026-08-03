import { describe, expect, it } from 'vitest';
import {
  ICON_GRID,
  ICON_SIZE,
  arrangeInGrid,
  clampToArea,
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
});

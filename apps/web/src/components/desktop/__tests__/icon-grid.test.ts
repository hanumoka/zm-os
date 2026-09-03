import { describe, it, expect } from 'vitest';
import { ICON_GRID, findFreeCell, placeIcons, resolveDropPosition } from '../icon-grid';

const AREA = { width: 1440, height: 852 };
const { originX, originY, cellWidth, cellHeight } = ICON_GRID;

/** 좌측 열 n번째 칸 */
const leftCell = (row: number): { x: number; y: number } => ({
  x: originX,
  y: originY + row * cellHeight,
});

describe('placeIcons — 화면에 있는 것만 자리를 차지한다', () => {
  it('설치되지 않아 목록에 없는 앱은 자기 기본 자리를 예약하지 않는다', () => {
    // 회귀: 예전에는 카탈로그 전체로 점유를 계산해 설치도 안 된 built-in 앱이
    // 좌측 열 위 다섯 칸을 영구히 막았다. 스토어를 좌상단에 놓을 수 없었던 원인이다.
    const placed = placeIcons(
      [{ id: '__system_store__' }],
      { __system_store__: leftCell(0) },
      AREA.width,
      AREA.height,
    );
    expect(placed['__system_store__']).toEqual(leftCell(0));
  });

  it('사용자가 정한 좌표가 기본 자리보다 우선한다', () => {
    const placed = placeIcons(
      [{ id: 'snake', defaultPosition: leftCell(2) }],
      { snake: leftCell(5) },
      AREA.width,
      AREA.height,
    );
    expect(placed['snake']).toEqual(leftCell(5));
  });

  it('기본 자리가 이미 차 있으면 빈 칸으로 밀어낸다', () => {
    // 설치는 id만 저장하고 좌표는 저장하지 않는다. 그래서 사용자가 그 자리에
    // 다른 아이콘을 옮겨 둔 뒤 앱을 설치하면 겹칠 수 있다 — 겹치면 아래 아이콘이
    // 완전히 가려져 클릭도 드래그도 되지 않는다.
    const placed = placeIcons(
      [
        { id: '__system_store__' },
        { id: 'bouncing-ball', defaultPosition: leftCell(0) },
      ],
      { __system_store__: leftCell(0) },
      AREA.width,
      AREA.height,
    );
    expect(placed['__system_store__']).toEqual(leftCell(0));
    expect(placed['bouncing-ball']).not.toEqual(leftCell(0));
    expect(placed['bouncing-ball']).toEqual({ x: originX + cellWidth, y: originY });
  });

  it('기본 자리도 저장된 좌표도 없으면 결과에 넣지 않는다', () => {
    const placed = placeIcons([{ id: 'no-coords' }], {}, AREA.width, AREA.height);
    expect(placed['no-coords']).toBeUndefined();
  });

  it('먼저 넘긴 아이콘이 기본 자리를 먼저 잡는다', () => {
    // 스토어를 앞에 두어 좌상단을 잡게 하고, 앱은 자기 기본 자리로 흐르게 한다.
    const placed = placeIcons(
      [
        { id: '__system_store__', defaultPosition: leftCell(0) },
        { id: 'bouncing-ball', defaultPosition: leftCell(1) },
      ],
      {},
      AREA.width,
      AREA.height,
    );
    expect(placed['__system_store__']).toEqual(leftCell(0));
    expect(placed['bouncing-ball']).toEqual(leftCell(1));
  });

  it('저장된 좌표가 영역 밖이면 안으로 가둔다', () => {
    const placed = placeIcons(
      [{ id: 'snake', defaultPosition: leftCell(0) }],
      { snake: { x: 99999, y: 99999 } },
      AREA.width,
      AREA.height,
    );
    expect(placed['snake']?.x).toBeLessThanOrEqual(AREA.width);
    expect(placed['snake']?.y).toBeLessThanOrEqual(AREA.height);
  });

  it('아이콘 둘이 같은 칸을 쓰지 않는다', () => {
    const placed = placeIcons(
      [
        { id: 'a', defaultPosition: leftCell(0) },
        { id: 'b', defaultPosition: leftCell(0) },
        { id: 'c', defaultPosition: leftCell(0) },
      ],
      {},
      AREA.width,
      AREA.height,
    );
    const keys = Object.values(placed).map((p) => `${p.x},${p.y}`);
    expect(new Set(keys).size).toBe(keys.length);
  });
});

describe('resolveDropPosition — 빈 좌상단에는 그대로 놓인다', () => {
  it('점유 셀이 없으면 좌상단 근처 드롭이 좌상단에 스냅된다', () => {
    const dropped = resolveDropPosition({ x: 28, y: 28 }, AREA.width, AREA.height, new Set());
    expect(dropped).toEqual(leftCell(0));
  });

  it('좌상단이 차 있으면 오른쪽 칸으로 밀린다', () => {
    const occupied = new Set([`${originX},${originY}`]);
    const dropped = resolveDropPosition({ x: 28, y: 28 }, AREA.width, AREA.height, occupied);
    expect(dropped).toEqual({ x: originX + cellWidth, y: originY });
  });
});

describe('findFreeCell — 영역 밖으로 밀어내지 않는다', () => {
  it('위·왼쪽이 영역 밖이면 그쪽 후보를 버린다', () => {
    const occupied = new Set([`${originX},${originY}`]);
    const found = findFreeCell(leftCell(0), occupied, AREA.width, AREA.height);
    expect(found.x).toBeGreaterThanOrEqual(0);
    expect(found.y).toBeGreaterThanOrEqual(0);
  });
});

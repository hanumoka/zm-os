/**
 * 데스크탑 아이콘 격자 — 순수 기하 (DSK-06)
 *
 * 렌더 크기·격자·드래그 임계값·좌표 계산. 저장과 무관한 표현 계층 로직이므로
 * 저장 계층(`lib/storage`)이 아니라 데스크탑 컴포넌트 곁에 둔다.
 * 격자 상수는 `desktopApps.ts`의 기존 좌표 컨벤션과 값이 일치해야 한다.
 */

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type IconPoint = { x: number; y: number };

/** DesktopIcon의 렌더 크기 (w-20 h-20) */
export const ICON_SIZE = 80;

/** 격자. origin은 desktopApps.ts의 좌측 column 시작점과 동일하다. */
export const ICON_GRID = {
  originX: 30,
  originY: 30,
  cellWidth: 100,
  cellHeight: 100,
} as const;

/** 드래그로 인정하기까지의 최소 이동 거리(px). 클릭·더블클릭과 구분한다. */
export const DRAG_THRESHOLD = 4;

// ─── 순수 계산 ────────────────────────────────────────────────────────────────

/** 좌표를 격자에 스냅한다. */
export function snapToGrid(point: IconPoint): IconPoint {
  const { originX, originY, cellWidth, cellHeight } = ICON_GRID;
  const col = Math.round((point.x - originX) / cellWidth);
  const row = Math.round((point.y - originY) / cellHeight);
  return {
    x: originX + Math.max(0, col) * cellWidth,
    y: originY + Math.max(0, row) * cellHeight,
  };
}

/** 아이콘이 데스크탑 영역 밖으로 나가지 않도록 좌표를 가둔다. */
export function clampToArea(
  point: IconPoint,
  areaWidth: number,
  areaHeight: number,
): IconPoint {
  const maxX = Math.max(0, areaWidth - ICON_SIZE);
  const maxY = Math.max(0, areaHeight - ICON_SIZE);
  return {
    x: Math.min(Math.max(0, point.x), maxX),
    y: Math.min(Math.max(0, point.y), maxY),
  };
}

/** 좌표를 점유 집합 키로 만든다. */
export function cellKey(point: IconPoint): string {
  return `${point.x},${point.y}`;
}

/** 좌표들이 영역 밖으로 나가 있으면 안으로 끌어들인다. 영역 크기를 모르면(0) 그대로 둔다. */
export function clampPositions(
  positions: Readonly<Record<string, IconPoint>>,
  areaWidth: number,
  areaHeight: number,
): Record<string, IconPoint> {
  const result: Record<string, IconPoint> = {};
  const known = areaWidth > 0 && areaHeight > 0;
  for (const [id, point] of Object.entries(positions)) {
    result[id] = known ? clampToArea(point, areaWidth, areaHeight) : point;
  }
  return result;
}

/**
 * 드롭 지점을 최종 좌표로 확정한다.
 * 영역 안으로 가둔 뒤 스냅하고, 스냅이 영역을 벗어나게 했으면 다시 가둔다.
 *
 * `occupied`를 주면 이미 다른 아이콘이 있는 셀을 피해 가장 가까운 빈 셀로 밀어낸다.
 * 두 아이콘이 같은 80×80 셀에 겹치면 아래 아이콘이 완전히 가려져 클릭도 드래그도
 * 불가능해지므로, 겹침은 허용하지 않는다.
 */
export function resolveDropPosition(
  point: IconPoint,
  areaWidth: number,
  areaHeight: number,
  occupied?: ReadonlySet<string>,
): IconPoint {
  const snapped = clampToArea(
    snapToGrid(clampToArea(point, areaWidth, areaHeight)),
    areaWidth,
    areaHeight,
  );
  if (occupied === undefined || !occupied.has(cellKey(snapped))) return snapped;
  return findFreeCell(snapped, occupied, areaWidth, areaHeight);
}

/**
 * 목표 셀이 점유돼 있으면 주변으로 고리를 넓혀가며 빈 셀을 찾는다.
 * 영역 안에서 찾지 못하면 목표 셀을 그대로 돌려준다(겹치더라도 드롭 자체는 성립시킨다).
 */
export function findFreeCell(
  target: IconPoint,
  occupied: ReadonlySet<string>,
  areaWidth: number,
  areaHeight: number,
): IconPoint {
  const { cellWidth, cellHeight } = ICON_GRID;
  const MAX_RING = 20;

  for (let ring = 1; ring <= MAX_RING; ring += 1) {
    for (let dy = -ring; dy <= ring; dy += 1) {
      for (let dx = -ring; dx <= ring; dx += 1) {
        // 고리 둘레만 검사 (안쪽은 이전 고리에서 이미 봤다)
        if (Math.max(Math.abs(dx), Math.abs(dy)) !== ring) continue;
        const candidate = {
          x: target.x + dx * cellWidth,
          y: target.y + dy * cellHeight,
        };
        if (candidate.x < 0 || candidate.y < 0) continue;
        if (areaWidth > 0 && candidate.x > areaWidth - ICON_SIZE) continue;
        if (areaHeight > 0 && candidate.y > areaHeight - ICON_SIZE) continue;
        if (!occupied.has(cellKey(candidate))) return candidate;
      }
    }
  }
  return target;
}

/**
 * 화면에 있는 아이콘들의 최종 좌표를 한 번에 정한다.
 *
 * 두 단계다.
 * 1. **사용자가 정한 좌표가 우선이다.** 영역 안으로 가둔 뒤 그대로 쓴다.
 * 2. 좌표가 없는 아이콘은 기본 자리에 둔다. 그 자리가 이미 차 있으면 가장
 *    가까운 빈 칸으로 밀어낸다.
 *
 * ★ 인자로 받는 `icons`는 **화면에 실제로 그려지는 아이콘만** 담아야 한다.
 * 설치되지 않아 렌더되지 않는 앱까지 넣으면 그 앱의 기본 자리가 영구히 예약되어
 * 아무도 그 칸을 쓸 수 없게 된다 — 좌측 열 위쪽이 통째로 막혔던 원인이 그것이다.
 *
 * 기본 자리도 저장된 좌표도 없는 아이콘은 결과에 넣지 않는다. 그런 아이콘은
 * 부모가 흐름 배치로 다룬다.
 */
export function placeIcons(
  icons: ReadonlyArray<{ id: string; defaultPosition?: IconPoint }>,
  stored: Readonly<Record<string, IconPoint>>,
  areaWidth: number,
  areaHeight: number,
): Record<string, IconPoint> {
  const clamped = clampPositions(stored, areaWidth, areaHeight);
  const placed: Record<string, IconPoint> = {};
  const occupied = new Set<string>();

  const take = (id: string, point: IconPoint): void => {
    placed[id] = point;
    occupied.add(cellKey(point));
  };

  for (const icon of icons) {
    const point = clamped[icon.id];
    if (point !== undefined) take(icon.id, point);
  }

  for (const icon of icons) {
    if (placed[icon.id] !== undefined) continue;
    const base = icon.defaultPosition;
    if (base === undefined) continue;
    take(
      icon.id,
      occupied.has(cellKey(base))
        ? findFreeCell(base, occupied, areaWidth, areaHeight)
        : base,
    );
  }

  return placed;
}

/**
 * 아이콘들을 격자에 자동 정렬한다.
 * Windows와 같이 위에서 아래로 채우고, 한 열이 차면 다음 열로 넘어간다.
 *
 * 폭도 함께 받아 열 수를 제한한다. 높이만 보고 열을 무한히 늘리면
 * 좁은 창에서 마지막 아이콘들이 영역 밖으로 나가 잡히지 않게 된다.
 * 셀이 모자라면 마지막 유효 셀에 겹쳐 두되, 최소한 화면 안에는 남긴다.
 */
export function arrangeInGrid(
  ids: ReadonlyArray<string>,
  areaHeight: number,
  areaWidth = 0,
): Record<string, IconPoint> {
  const { originX, originY, cellWidth, cellHeight } = ICON_GRID;
  const rows = Math.max(1, Math.floor(Math.max(0, areaHeight - originY) / cellHeight));
  const cols =
    areaWidth > 0
      ? Math.max(1, Math.floor(Math.max(0, areaWidth - originX) / cellWidth))
      : Number.POSITIVE_INFINITY;
  const capacity = rows * cols;

  const positions: Record<string, IconPoint> = {};
  ids.forEach((id, index) => {
    const slot = Number.isFinite(capacity) ? Math.min(index, capacity - 1) : index;
    const col = Math.floor(slot / rows);
    const row = slot % rows;
    const point = {
      x: originX + col * cellWidth,
      y: originY + row * cellHeight,
    };
    positions[id] =
      areaWidth > 0 && areaHeight > 0 ? clampToArea(point, areaWidth, areaHeight) : point;
  });
  return positions;
}

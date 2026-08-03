/**
 * 데스크탑 아이콘 배치 영속화 + 그리드 계산 (DSK-06)
 *
 * 영속화 대상: 앱 id → 아이콘 좌표. 저장된 좌표가 없으면 카탈로그의 iconPosition으로 폴백한다.
 * 네임스페이스는 `desktop-layout`을 재사용하고 키만 분리한다 —
 * 아이콘 배치도 데스크탑 레이아웃이며, 새 namespace를 추가하면 IDB 버전 승격이 필요하다.
 *
 * 그리드 상수는 desktopApps.ts의 기존 좌표 컨벤션({ x: 30, y: 30/130/230/... })과
 * 정확히 일치시킨다. 따라서 기존 하드코딩 좌표는 이미 격자 위에 있고,
 * 스냅이 기존 배치를 흔들지 않는다.
 */

import { resolveAdapterFor } from '@zm/storage';
import { NS_DESKTOP_LAYOUT } from '@zm/core';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type IconPoint = { x: number; y: number };

export type DesktopIconsRecord = {
  savedAt: number;
  positions: Readonly<Record<string, IconPoint>>;
};

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const NAMESPACE = NS_DESKTOP_LAYOUT;
const ICONS_KEY = 'icons';

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

// ─── 영속화 (desktop-layout.ts 패턴 복제) ─────────────────────────────────────

export async function loadDesktopIcons(): Promise<DesktopIconsRecord | undefined> {
  const adapter = resolveAdapterFor(NAMESPACE);
  return adapter.get<DesktopIconsRecord>(NAMESPACE, ICONS_KEY);
}

export async function saveDesktopIcons(record: DesktopIconsRecord): Promise<void> {
  const adapter = resolveAdapterFor(NAMESPACE);
  await adapter.put(NAMESPACE, ICONS_KEY, record);
}

export async function clearDesktopIcons(): Promise<void> {
  const adapter = resolveAdapterFor(NAMESPACE);
  await adapter.delete(NAMESPACE, ICONS_KEY);
}

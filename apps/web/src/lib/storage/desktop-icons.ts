/**
 * 데스크탑 아이콘 배치 영속화 (DSK-06)
 *
 * 좌표 계산은 `components/desktop/icon-grid.ts`에 있다 — 여기에는 저장만 둔다.
 * 네임스페이스는 `desktop-layout`을 재사용하고 키만 분리한다.
 */

import { resolveAdapterFor } from '@zm/storage';
import { NS_DESKTOP_LAYOUT } from '@zm/core';
import type { IconPoint } from '@/components/desktop/icon-grid';

export type DesktopIconsRecord = {
  savedAt: number;
  positions: Readonly<Record<string, IconPoint>>;
};

const NAMESPACE = NS_DESKTOP_LAYOUT;
const ICONS_KEY = 'icons';

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

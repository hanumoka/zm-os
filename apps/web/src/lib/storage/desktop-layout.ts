/**
 * 윈도우 레이아웃 영속화 도메인 래퍼 (DSK-04)
 *
 * 영속화 대상: contentId, position, size, state
 * 비영속화: zIndex (세션 간 무의미), title (카탈로그 SSOT), id (contentId 기반 복원)
 * 패턴: fire-and-forget (PROD-04 동일)
 */

import { resolveAdapterFor } from '@zm/storage';
import { NS_DESKTOP_LAYOUT } from '@zm/core';

const NAMESPACE = NS_DESKTOP_LAYOUT;
const LAYOUT_KEY = 'current';

export type PersistedWindowLayout = {
  contentId: string;
  position: { x: number; y: number };
  size: { width: number; height: number };
  state: 'open' | 'minimized' | 'maximized';
};

export type DesktopLayoutRecord = {
  savedAt: number;
  windows: ReadonlyArray<PersistedWindowLayout>;
};

export async function loadDesktopLayout(): Promise<DesktopLayoutRecord | undefined> {
  const adapter = resolveAdapterFor(NAMESPACE);
  return adapter.get<DesktopLayoutRecord>(NAMESPACE, LAYOUT_KEY);
}

export async function saveDesktopLayout(record: DesktopLayoutRecord): Promise<void> {
  const adapter = resolveAdapterFor(NAMESPACE);
  await adapter.put(NAMESPACE, LAYOUT_KEY, record);
}

export async function clearDesktopLayout(): Promise<void> {
  const adapter = resolveAdapterFor(NAMESPACE);
  await adapter.delete(NAMESPACE, LAYOUT_KEY);
}

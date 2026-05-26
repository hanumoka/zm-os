/**
 * 데스크탑 설정 영속화 도메인 래퍼 (DSK-05)
 *
 * 영속화 대상: 배경화면(wallpaper), 테마 모드(themeMode)
 * 패턴: desktop-layout.ts 패턴 복제 (resolveAdapterFor 경유)
 */

import { resolveAdapterFor } from '@zm/storage';
import { NS_DESKTOP_SETTINGS } from '@zm/core';

// ─── 타입 ─────────────────────────────────────────────────────────────────────

export type WallpaperPreset =
  | 'gradient-sky'
  | 'gradient-sunset'
  | 'gradient-forest'
  | 'gradient-purple'
  | 'gradient-ocean'
  | 'solid-slate'
  | 'solid-zinc'
  | 'solid-neutral';

export type WallpaperConfig =
  | { kind: 'preset'; preset: WallpaperPreset }
  | { kind: 'url'; url: string };

export type ThemeMode = 'light' | 'dark' | 'system';

export type ResolvedTheme = 'light' | 'dark';

export type DesktopSettingsRecord = {
  wallpaper: WallpaperConfig;
  themeMode: ThemeMode;
  savedAt: number;
};

// ─── 상수 ─────────────────────────────────────────────────────────────────────

const NAMESPACE = NS_DESKTOP_SETTINGS;
const KEY = 'settings';

// 기본값
export const DEFAULT_SETTINGS: DesktopSettingsRecord = {
  wallpaper: { kind: 'preset', preset: 'gradient-sky' },
  themeMode: 'system',
  savedAt: 0,
};

// 프리셋 → Tailwind 클래스 매핑
export const WALLPAPER_CLASSES: Record<WallpaperPreset, string> = {
  'gradient-sky': 'bg-gradient-to-br from-sky-100 to-indigo-200',
  'gradient-sunset': 'bg-gradient-to-br from-orange-200 to-rose-300',
  'gradient-forest': 'bg-gradient-to-br from-emerald-200 to-teal-300',
  'gradient-purple': 'bg-gradient-to-br from-violet-200 to-purple-300',
  'gradient-ocean': 'bg-gradient-to-br from-cyan-200 to-blue-300',
  'solid-slate': 'bg-slate-700',
  'solid-zinc': 'bg-zinc-800',
  'solid-neutral': 'bg-neutral-900',
};

// 프리셋 라벨 (설정 UI용)
export const WALLPAPER_LABELS: Record<WallpaperPreset, string> = {
  'gradient-sky': '하늘',
  'gradient-sunset': '석양',
  'gradient-forest': '숲',
  'gradient-purple': '보라',
  'gradient-ocean': '바다',
  'solid-slate': '슬레이트',
  'solid-zinc': '아연',
  'solid-neutral': '뉴트럴',
};

// ─── 영속화 함수 (desktop-layout.ts 패턴 복제) ────────────────────────────────

export async function loadDesktopSettings(): Promise<DesktopSettingsRecord | undefined> {
  try {
    const adapter = resolveAdapterFor(NAMESPACE);
    return await adapter.get<DesktopSettingsRecord>(NAMESPACE, KEY);
  } catch (err) {
    console.error('[desktop-settings] load failed:', err);
    return undefined;
  }
}

export async function saveDesktopSettings(record: DesktopSettingsRecord): Promise<void> {
  const adapter = resolveAdapterFor(NAMESPACE);
  await adapter.put<DesktopSettingsRecord>(NAMESPACE, KEY, record);
}

export async function clearDesktopSettings(): Promise<void> {
  const adapter = resolveAdapterFor(NAMESPACE);
  await adapter.delete(NAMESPACE, KEY);
}

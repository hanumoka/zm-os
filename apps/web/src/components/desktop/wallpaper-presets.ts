/**
 * 배경화면 프리셋의 표현 매핑 — Tailwind 클래스와 UI 라벨.
 *
 * 저장 계층에 두면 배경 색 하나 바꾸는 데 저장 모듈을 열어야 하고,
 * UI 컴포넌트가 `lib/storage`를 import하는 역방향 의존이 생긴다.
 */

import type { WallpaperPreset } from '@/lib/storage/desktop-settings';

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

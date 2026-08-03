import { describe, expect, it } from 'vitest';
import { desktopSettingsReducer } from '../DesktopSettingsProvider';
import type { DesktopSettingsRecord } from '@/lib/storage/desktop-settings';

const BASE = {
  wallpaper: { kind: 'preset', preset: 'gradient-sunset' },
  themeMode: 'dark',
} as const;

describe('desktopSettingsReducer', () => {
  it('PATCH는 지정하지 않은 필드를 보존한다', () => {
    const next = desktopSettingsReducer(BASE, {
      type: 'PATCH',
      patch: { wallpaper: { kind: 'preset', preset: 'gradient-ocean' } },
    });
    expect(next.wallpaper).toEqual({ kind: 'preset', preset: 'gradient-ocean' });
    // 유실 방지의 핵심: 건드리지 않은 themeMode가 그대로다
    expect(next.themeMode).toBe('dark');
  });

  it('반대 방향도 마찬가지다', () => {
    const next = desktopSettingsReducer(BASE, {
      type: 'PATCH',
      patch: { themeMode: 'light' },
    });
    expect(next.themeMode).toBe('light');
    expect(next.wallpaper).toEqual(BASE.wallpaper);
  });

  it('빈 patch는 상태를 바꾸지 않는다', () => {
    expect(desktopSettingsReducer(BASE, { type: 'PATCH', patch: {} })).toEqual(BASE);
  });

  it('여러 필드를 한 번에 갱신할 수 있다', () => {
    const next = desktopSettingsReducer(BASE, {
      type: 'PATCH',
      patch: { themeMode: 'system', wallpaper: { kind: 'url', url: 'https://x/y.png' } },
    });
    expect(next).toEqual({
      themeMode: 'system',
      wallpaper: { kind: 'url', url: 'https://x/y.png' },
    });
  });

  it('HYDRATE는 레코드의 상태 필드만 취하고 savedAt 같은 메타는 버린다', () => {
    const record: DesktopSettingsRecord = {
      wallpaper: { kind: 'preset', preset: 'solid-slate' },
      themeMode: 'light',
      savedAt: 12345,
    };
    const next = desktopSettingsReducer(BASE, { type: 'HYDRATE', settings: record });
    expect(next).toEqual({
      wallpaper: { kind: 'preset', preset: 'solid-slate' },
      themeMode: 'light',
    });
    expect(next).not.toHaveProperty('savedAt');
  });
});

import type { DesktopAppEntry } from './desktopApps';
import type { WindowManager, WindowState } from './types';

/**
 * 앱을 실행한다 — 이미 열려 있으면 그 창을 앞으로 가져온다.
 *
 * 데스크탑 아이콘과 시작 메뉴가 같은 동작을 해야 하므로 여기 한 곳에 둔다.
 * 각자 구현하면 "이미 열린 창을 다시 열면 어떻게 되는가"가 두 경로에서 갈린다.
 */
export function launchApp(manager: WindowManager, entry: DesktopAppEntry): void {
  const existing: WindowState | undefined = manager.windows.find(
    (w) => w.id === entry.id,
  );

  if (existing !== undefined) {
    if (existing.state === 'minimized') {
      manager.restore(entry.id);
    }
    manager.focus(entry.id);
    return;
  }

  manager.open({
    id: entry.id,
    title: entry.name,
    contentId: entry.id,
    initialPosition: entry.windowDefaults?.position,
    initialSize: entry.windowDefaults?.size,
  });
}

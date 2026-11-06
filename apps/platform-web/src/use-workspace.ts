import { useEffect, useMemo, useSyncExternalStore } from "react";
import { defaultWorkspace, desktopPositionsSchema, wallpaperSchema, type WorkspaceData, type WorkspaceView } from "@zm/platform-contracts";
import { api } from "./api";
import { WorkspaceSync } from "./workspace-sync";

function legacy(userKey: string): WorkspaceData | null {
  try {
    const value = JSON.parse(localStorage.getItem("zm-os:desktop:v1:" + userKey) ?? "null") as { wallpaper?: unknown; positions?: unknown } | null;
    const wallpaper = wallpaperSchema.safeParse(value?.wallpaper);
    const positions = desktopPositionsSchema.safeParse(value?.positions);
    return wallpaper.success && positions.success ? { ...defaultWorkspace(), wallpaper: wallpaper.data, positions: positions.data } : null;
  } catch { return null; }
}
export function useWorkspace(userId: string | null, enabled: boolean): { sync: WorkspaceSync; snapshot: ReturnType<WorkspaceSync["getSnapshot"]> } {
  const sync = useMemo(() => {
    const key = "zm-os:workspace:draft:v1:" + userId;
    return new WorkspaceSync(userId, {
      read: () => api<WorkspaceView>("/me/workspace?expectedUserId=" + encodeURIComponent(userId ?? "")),
      write: request => api<WorkspaceView>("/me/workspace", "PUT", request),
    }, {
      legacy: enabled ? legacy(userId ?? "guest") : null,
      readDraft: () => sessionStorage.getItem(key),
      writeDraft: value => value === null ? sessionStorage.removeItem(key) : sessionStorage.setItem(key, value),
      writeGuest: value => localStorage.setItem("zm-os:desktop:v1:guest", JSON.stringify({ wallpaper: value.wallpaper, positions: value.positions })),
    });
  }, [userId, enabled]);
  const snapshot = useSyncExternalStore(sync.subscribe, sync.getSnapshot);
  useEffect(() => {
    if (!enabled) return;
    void sync.start();
    const refresh = (): void => { if (!document.hidden) void sync.refresh(); };
    const timer = setInterval(refresh, 15000);
    window.addEventListener("focus", refresh); window.addEventListener("online", refresh); document.addEventListener("visibilitychange", refresh);
    return (): void => {
      clearInterval(timer); sync.stop();
      window.removeEventListener("focus", refresh); window.removeEventListener("online", refresh); document.removeEventListener("visibilitychange", refresh);
    };
  }, [sync, enabled]);
  return { sync, snapshot };
}

import type { AppSessionView, WindowLayout } from "@zm/platform-contracts";

export type SystemApp = "store" | "mine" | "account" | "workspace" | "developer" | "operator";
export interface Rect { x: number; y: number; width: number; height: number }
export interface DesktopWindow {
  id: string;
  title: string;
  kind: "system" | "app";
  system?: SystemApp;
  session?: AppSessionView;
  rect: Rect;
  minimized: boolean;
  maximized: boolean;
  snap: "left" | "right" | null;
  restoreKey?: string;
  order: number;
}
export interface DesktopState { windows: DesktopWindow[]; active: string | null; order: number }
export const emptyDesktop: DesktopState = { windows: [], active: null, order: 0 };
export type DesktopAction =
  | { type: "open"; window: Pick<DesktopWindow, "id" | "title" | "kind" | "system" | "session" | "restoreKey">; layout?: WindowLayout }
  | { type: "focus" | "minimize" | "maximize" | "close"; id: string }
  | { type: "rect"; id: string; rect: Rect }
  | { type: "snap"; id: string; side: "left" | "right" }
  | { type: "clear-private" }
  | { type: "desktop" };

function top(windows: DesktopWindow[]): string | null {
  return windows.filter(w => !w.minimized).sort((a, b) => b.order - a.order)[0]?.id ?? null;
}
export function desktopReducer(state: DesktopState, action: DesktopAction): DesktopState {
  if (action.type === "clear-private") return emptyDesktop;
  if (action.type === "desktop") return { ...state, active: null, windows: state.windows.map(w => ({ ...w, minimized: true })) };
  if (action.type === "open") {
    if (state.windows.some(w => w.id === action.window.id)) {
      const focused = desktopReducer(state, { type: "focus", id: action.window.id });
      if (!action.layout) return focused;
      const windows = focused.windows.map(w => w.id === action.window.id ? { ...w, ...action.layout, restoreKey: action.window.restoreKey ?? w.restoreKey } : w);
      return { ...focused, windows, active: action.layout.minimized ? top(windows) : focused.active };
    }
    const offset = state.windows.length % 6;
    const window: DesktopWindow = { ...action.window, rect: { x: 140 + offset * 28, y: 42 + offset * 24, width: 1020, height: 690 }, minimized: false, maximized: false, snap: null, ...action.layout, order: state.order + 1 };
    return { windows: [...state.windows, window], active: window.minimized ? state.active : window.id, order: window.order };
  }
  if (action.type === "close") {
    const windows = state.windows.filter(w => w.id !== action.id);
    return { ...state, windows, active: state.active === action.id ? top(windows) : state.active };
  }
  if (!state.windows.some(w => w.id === action.id)) return state;
  if (action.type === "rect") return { ...state, windows: state.windows.map(w => w.id === action.id ? { ...w, rect: action.rect, snap: null, maximized: false } : w) };
  if (action.type === "snap") return { ...state, active: action.id, order: state.order + 1, windows: state.windows.map(w => w.id === action.id ? { ...w, snap: action.side, maximized: false, minimized: false, order: state.order + 1 } : w) };
  if (action.type === "minimize") {
    const windows = state.windows.map(w => w.id === action.id ? { ...w, minimized: true } : w);
    return { ...state, windows, active: state.active === action.id ? top(windows) : state.active };
  }
  return { ...state, order: state.order + 1, active: action.id, windows: state.windows.map(w => w.id === action.id ? { ...w, minimized: false, maximized: action.type === "maximize" ? !w.maximized : w.maximized, order: state.order + 1 } : w) };
}

export function fitRect(rect: Rect, width: number, height: number): Rect {
  const w = Math.min(Math.max(320, rect.width), Math.max(1, width));
  const h = Math.min(Math.max(240, rect.height), Math.max(1, height));
  return { width: w, height: h, x: Math.max(0, Math.min(rect.x, width - w)), y: Math.max(0, Math.min(rect.y, height - h)) };
}

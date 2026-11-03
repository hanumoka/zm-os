import { useEffect, useRef, useState, type Dispatch, type ReactNode } from "react";
import type { UserView } from "@zm/platform-contracts";
import { fitRect, type DesktopAction, type DesktopState, type DesktopWindow, type Rect, type SystemApp } from "./desktop-state";
import "./desktop.css";

export const systemTitles: Record<SystemApp, string> = {
  store: "Store", mine: "내 앱", account: "내 계정", developer: "개발자 공간", operator: "운영 관리",
};
const navigationTitles: Record<SystemApp, string> = { ...systemTitles, store: "앱 둘러보기" };
function AppIcon({ app }: { app: SystemApp | "app" }): React.JSX.Element {
  const paths = {
    store: <><path d="M6 9h20l-2 19H8L6 9Z"/><path d="M11 10V7a5 5 0 0 1 10 0v3"/></>,
    mine: <><rect x="5" y="5" width="9" height="9" rx="2"/><rect x="19" y="5" width="9" height="9" rx="2"/><rect x="5" y="19" width="9" height="9" rx="2"/><rect x="19" y="19" width="9" height="9" rx="2"/></>,
    account: <><circle cx="16" cy="10" r="5"/><path d="M5 28v-3a11 11 0 0 1 22 0v3"/></>,
    developer: <><rect x="3" y="5" width="26" height="23" rx="3"/><path d="m8 12 5 5-5 5m9 0h7"/></>,
    operator: <><path d="m16 3 11 5v8c0 7-11 13-11 13S5 23 5 16V8l11-5Z"/><path d="m10 16 4 4 8-9"/></>,
    app: <><rect x="4" y="4" width="24" height="24" rx="5"/><path d="M10 10h12M10 16h12M10 22h7"/></>,
  };
  return <span className={`os-app-icon icon-${app}`} aria-hidden="true"><svg viewBox="0 0 32 32" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">{paths[app]}</svg></span>;
}

interface Props {
  state: DesktopState;
  dispatch: Dispatch<DesktopAction>;
  user: UserView | null;
  ready: boolean;
  busy: boolean;
  testMode: boolean;
  onOpen: (app: SystemApp) => void;
  onClose: (window: DesktopWindow) => void;
  renderWindow: (window: DesktopWindow) => ReactNode;
  onLogout: () => void;
  notifications: ReactNode;
}

export function Desktop({ state, dispatch, user, ready, busy, testMode, onOpen, onClose, renderWindow, onLogout, notifications }: Props): React.JSX.Element {
  const workspace = useRef<HTMLDivElement>(null);
  const dragging = useRef<{ element: HTMLElement; finish: () => void } | null>(null);
  const [bounds, setBounds] = useState({ width: window.innerWidth, height: window.innerHeight - 52 });
  const [interacting, setInteracting] = useState(false);
  const [menu, setMenu] = useState(false);
  const [now, setNow] = useState(() => new Date());
  const apps: SystemApp[] = ["store", "mine", "account", "developer", ...(user?.operator ? ["operator" as const] : [])];
  const compact = bounds.width < 720;
  useEffect(() => () => dragging.current?.finish(), []);
  useEffect(() => {
    if (dragging.current && (!dragging.current.element.isConnected || compact)) dragging.current.finish();
  }, [state.windows, compact]);
  useEffect(() => {
    const element = workspace.current;
    if (!element) return;
    const observer = new ResizeObserver(([entry]) => {
      if (entry) setBounds({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 30000);
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    if (!menu) return;
    const close = (event: KeyboardEvent): void => { if (event.key === "Escape") setMenu(false); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [menu]);
  const title = (app: SystemApp): string => app === "account" && !user ? "로그인" : systemTitles[app];
  const open = (app: SystemApp): void => { setMenu(false); onOpen(app); };
  const activate = (id: string): void => { setMenu(false); dispatch({ type: "focus", id }); };
  const position = (win: DesktopWindow): Rect => compact || win.maximized
    ? { x: 0, y: 0, width: bounds.width, height: bounds.height }
    : fitRect(win.rect, bounds.width, bounds.height);
  const gesture = (event: React.PointerEvent<HTMLElement>, win: DesktopWindow, resizing: boolean): void => {
    if (compact || win.maximized || event.button !== 0) return;
    if (!resizing && (event.target as HTMLElement).closest("button")) return;
    dragging.current?.finish();
    event.preventDefault();
    activate(win.id);
    const element = event.currentTarget;
    element.setPointerCapture(event.pointerId);
    const initial = position(win), startX = event.clientX, startY = event.clientY;
    setInteracting(true);
    const move = (next: PointerEvent): void => {
      const dx = next.clientX - startX, dy = next.clientY - startY;
      const proposed = resizing
        ? { ...initial, width: initial.width + dx, height: initial.height + dy }
        : { ...initial, x: initial.x + dx, y: initial.y + dy };
      dispatch({ type: "rect", id: win.id, rect: fitRect(proposed, bounds.width, bounds.height) });
    };
    const finish = (): void => {
      element.removeEventListener("pointermove", move);
      element.removeEventListener("pointerup", finish);
      element.removeEventListener("pointercancel", finish);
      element.removeEventListener("lostpointercapture", finish);
      setInteracting(false);
      dragging.current = null;
    };
    dragging.current = { element, finish };
    element.addEventListener("pointermove", move);
    element.addEventListener("pointerup", finish);
    element.addEventListener("pointercancel", finish);
    element.addEventListener("lostpointercapture", finish);
  };
  const keyboardGeometry = (event: React.KeyboardEvent, win: DesktopWindow, resize: boolean): void => {
    if (compact || win.maximized || (!resize && !event.altKey)) return;
    const delta = { ArrowLeft: [-12, 0], ArrowRight: [12, 0], ArrowUp: [0, -12], ArrowDown: [0, 12] }[event.key];
    if (!delta) return;
    event.preventDefault();
    const current = position(win);
    const rect = resize ? { ...current, width: current.width + delta[0]!, height: current.height + delta[1]! }
      : { ...current, x: current.x + delta[0]!, y: current.y + delta[1]! };
    dispatch({ type: "rect", id: win.id, rect: fitRect(rect, bounds.width, bounds.height) });
  };

  return <main className={`os-desktop${interacting ? " os-interacting" : ""}`} aria-label="zm-os 데스크톱">
    <h1 className="sr-only">zm-os 데스크톱</h1>
    <div className="os-workspace" ref={workspace}>
      <div className="os-wallpaper" onClick={() => setMenu(false)} aria-hidden="true" />
      <nav className="os-desktop-icons" aria-label="시스템 앱">
        {apps.map(app => <button key={app} className="os-desktop-icon" disabled={!ready} onClick={() => open(app)} aria-label={`${title(app)} 열기`}>
          <AppIcon app={app} /><span>{title(app)}</span>
        </button>)}
      </nav>
      {testMode && <p className="os-environment">zm-os <span>로컬 시험 환경</span></p>}
      {!ready && <p className="os-connecting" role="status">서비스에 연결하고 있습니다…</p>}
      <div className="os-window-layer">
        {state.windows.map(win => {
          const rect = position(win), active = state.active === win.id;
          return <section key={win.id} className={`os-window${active ? " is-active" : ""}${win.maximized || compact ? " is-maximized" : ""}`} data-window-id={win.id} data-kind={win.kind} data-active={active} aria-label={`${win.title} 창`}
            hidden={win.minimized} style={{ left: rect.x, top: rect.y, width: rect.width, height: rect.height, zIndex: win.order }}
            onPointerDownCapture={() => { if (!active) activate(win.id); }} onFocusCapture={() => { if (!active) activate(win.id); }}>
            <header className="os-window-titlebar" tabIndex={0} aria-label={`${win.title} 창 이동`} onPointerDown={event => gesture(event, win, false)} onKeyDown={event => keyboardGeometry(event, win, false)} onDoubleClick={event => { if (!(event.target as HTMLElement).closest("button")) dispatch({ type: "maximize", id: win.id }); }}>
              <AppIcon app={win.system ?? "app"}/><strong>{win.title}</strong>
              <div className="os-window-controls">
                <button aria-label={`${win.title} 최소화`} title="최소화" onClick={() => dispatch({ type: "minimize", id: win.id })}><span aria-hidden="true">—</span></button>
                {!compact && <button aria-label={`${win.title} ${win.maximized ? "이전 크기로" : "최대화"}`} title={win.maximized ? "이전 크기로" : "최대화"} onClick={() => dispatch({ type: "maximize", id: win.id })}><span aria-hidden="true">{win.maximized ? "❐" : "□"}</span></button>}
                <button className="os-window-close" aria-label={win.kind === "app" ? "앱 종료" : `${win.title} 창 닫기`} title="닫기" disabled={busy && win.kind === "system"} onClick={() => onClose(win)}><span aria-hidden="true">×</span></button>
              </div>
            </header>
            <div className={win.kind === "app" ? "os-runtime-content" : "os-system-content"}>{renderWindow(win)}
              {win.kind === "app" && !active && <button className="os-activate-frame" aria-label={`${win.title} 창 활성화`} onClick={() => activate(win.id)} />}
            </div>
            {!compact && !win.maximized && <button className="os-resize" aria-label={`${win.title} 창 크기 조절`} title="드래그 또는 방향키로 크기 조절" onPointerDown={event => gesture(event, win, true)} onKeyDown={event => keyboardGeometry(event, win, true)} />}
          </section>;
        })}
      </div>
      <div className="os-notifications">{notifications}</div>
    </div>
    {menu && <div className="os-menu-scrim" onClick={() => setMenu(false)} aria-hidden="true" />}
    {menu && <nav className="os-start-menu" aria-label="시작 메뉴 앱">
      <header><strong>zm-os</strong><span>{user ? user.operator ? "운영자" : "사용자" : "방문자"}</span></header>
      {apps.map(app => <button key={app} onClick={() => open(app)}><AppIcon app={app}/><span>{title(app)}</span></button>)}
      {user && <button className="os-menu-logout" disabled={busy} onClick={() => { setMenu(false); onLogout(); }}>로그아웃</button>}
    </nav>}
    <footer className="os-taskbar" aria-label="작업표시줄">
      <button className="os-start" aria-label="시작 메뉴" aria-expanded={menu} onClick={() => setMenu(value => !value)}><span aria-hidden="true">⊞</span><span className="os-start-label">zm-os</span></button>
      <nav className="os-pinned" aria-label="시스템 앱 바로가기">{apps.map(app => <button key={app} disabled={!ready} aria-label={app === "account" && !user ? "로그인" : navigationTitles[app]} title={title(app)} onClick={() => open(app)}><AppIcon app={app}/></button>)}</nav>
      <nav className="os-running" aria-label="열린 창">{state.windows.map(win => <button key={win.id} className={state.active === win.id && !win.minimized ? "is-active" : ""} aria-label={`${win.title} 창 전환`} aria-pressed={state.active === win.id && !win.minimized} title={win.title} onClick={() => win.id === state.active && !win.minimized ? dispatch({ type: "minimize", id: win.id }) : activate(win.id)}><AppIcon app={win.system ?? "app"}/><span>{win.title}</span></button>)}</nav>
      <div className="os-tray">{busy && <span className="os-busy" role="status">처리 중…</span>}<time dateTime={now.toISOString()}><span>{now.toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit", hour12: false })}</span><span>{now.toLocaleDateString("ko-KR", { month: "2-digit", day: "2-digit" })}</span></time><button className="os-show-desktop" aria-label="바탕화면 보기" title="바탕화면 보기" onClick={() => dispatch({ type: "desktop" })}/></div>
    </footer>
  </main>;
}

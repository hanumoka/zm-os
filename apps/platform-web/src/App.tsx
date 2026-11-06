import { useCallback, useEffect, useReducer, useRef, useState } from "react";
import type { AppSessionView, UserView, WindowLayout, SavedWindow } from "@zm/platform-contracts";
import { api, ApiError, errorMessage, setCsrf } from "./api";
import { Store } from "./Store";
import { Developer } from "./Developer";
import { Operator } from "./Operator";
import { Account, Enrollment, WithdrawalStatus } from "./Account";
import { AppRunner } from "./AppRunner";
import { EmailComplete } from "./EmailAccount";
import { Desktop, systemTitles } from "./Desktop";
import { desktopReducer, emptyDesktop, type DesktopWindow, type SystemApp } from "./desktop-state";
import type { RunAction } from "./types";
import { useWorkspace } from "./use-workspace";
import { WorkspaceSettings } from "./WorkspaceSettings";

export function App(): React.JSX.Element {
  const [user, setUser] = useState<UserView | null>(null);
  const currentUser = useRef<UserView | null>(null);
  const refreshSequence = useRef(0);
  const busyRef = useRef(false);
  const [ready, setReady] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [mailboxUrl,setMailboxUrl] = useState<string>();
  const [emailAction,setEmailAction] = useState<{purpose:string;token:string}|null>(null);
  const [desktop, dispatch] = useReducer(desktopReducer, emptyDesktop);
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [lookupSecret, setLookupSecret] = useState("");
  const [enrollment, setEnrollment] = useState(false);
  const { sync, snapshot } = useWorkspace(user?.id ?? null, ready && (!user || (user.status === "active" && !user.requiresReauth)));
  const acceptUser = useCallback((next: UserView | null): void => {
    const previous = currentUser.current;
    if (previous?.id !== next?.id ||
        (previous?.status !== "suspended" && next?.status === "suspended") ||
        (!previous?.requiresReauth && next?.requiresReauth)) {
      dispatch({ type: "clear-private" });
    } else if (previous?.operator && !next?.operator) {
      dispatch({ type: "close", id: "system:operator" });
    }
    currentUser.current = next;
    setCsrf(next?.csrf ?? "");
    setUser(next);
  }, []);
  const refreshUser = useCallback(async (): Promise<void> => {
    const sequence = ++refreshSequence.current;
    try {
      const next = await api<UserView>("/me");
      if (sequence === refreshSequence.current) acceptUser(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        if (sequence === refreshSequence.current) acceptUser(null);
      } else throw e;
    }
  }, [acceptUser]);
  useEffect(() => {
    let active = true;
    const readHash = ():void => {
      const hash = new URLSearchParams(window.location.hash.slice(1));
      if(hash.has("email") && hash.has("token")) {
        setEmailAction({purpose:hash.get("email") ?? "",token:hash.get("token") ?? ""});
        history.replaceState(null,"",location.pathname);
      }
    };
    readHash();
    window.addEventListener("hashchange",readHash);
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (new URLSearchParams(window.location.search).get("enrollment") === "required") setEnrollment(true);
    if (hash.has("withdrawal")) {
      setLookupSecret(hash.get("withdrawal") ?? "");
      history.replaceState(null, "", location.pathname);
    }
    void Promise.all([
      refreshUser(),
      api<{ mode: string; testAuth?: boolean; mailboxUrl?: string }>("/health").then(result => {
        if (active) setTestMode(result.mode === "local-test" && result.testAuth === true);
        if (active && result.mode==="local-test") setMailboxUrl(result.mailboxUrl);
      }),
    ]).catch(e => { if (active) setError(errorMessage(e)); })
      .finally(() => { if (active) setReady(true); });
    const checkIdentity = (): void => { if (!document.hidden) void refreshUser().catch(() => undefined); };
    window.addEventListener("focus", checkIdentity);
    document.addEventListener("visibilitychange", checkIdentity);
    return (): void => {
      active = false;
      window.removeEventListener("hashchange",readHash);
      window.removeEventListener("focus", checkIdentity);
      document.removeEventListener("visibilitychange", checkIdentity);
    };
  }, [refreshUser]);
  const run: RunAction = async (action, success): Promise<void> => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true); setError(""); setMessage("");
    try {
      await action();
      await refreshUser();
      setRevision(value => value + 1);
      if (success) setMessage(success);
    } catch (e) {
      setError(errorMessage(e));
      try { await refreshUser(); setRevision(value => value + 1); } catch { /* Preserve the original action error. */ }
    } finally { busyRef.current = false; setBusy(false); }
  };
  const openSystem = (app: SystemApp): void => {
    if (!ready || (app === "operator" && !user?.operator)) return;
    dispatch({ type: "open", window: { id: "system:" + app, kind: "system", system: app,
      title: app === "account" && !user ? "로그인" : systemTitles[app] } });
  };
  const attachSession = async (session: AppSessionView, layout?: WindowLayout, restoreKey?: string): Promise<void> => {
    // Recheck cookie identity before attaching a bridge to account-local storage.
    // A sibling tab may have changed it while session creation was in flight.
      try {
        const identity = await api<UserView>("/me");
        if (!user || identity.id !== user.id || currentUser.current?.id !== user.id) {
          await api("/app-sessions/" + session.id, "DELETE").catch(() => undefined);
          throw new Error("로그인 계정이 바뀌어 앱을 열지 않았습니다.");
        }
        dispatch({ type: "open", window: { id: "app:" + session.id, kind: "app", session, restoreKey,
          title: session.manifest.name + (session.isPreview ? " · 검수" : "") }, layout });
      } catch (e) {
        await api("/app-sessions/" + session.id, "DELETE").catch(() => undefined);
        throw e;
      }
  };
  const launch = (session: AppSessionView): void => { void attachSession(session).catch(e=>setError(errorMessage(e))); };
  const saveable = desktop.windows.filter(win => win.system !== "workspace" && !win.session?.isPreview);
  const saveLayout = (): void => {
    if (!user || !sync.canEdit() || saveable.length>24) return;
    const windows: SavedWindow[] = saveable.flatMap<SavedWindow>(win => {
      const key = win.restoreKey ?? crypto.randomUUID();
      const layout: WindowLayout = { rect: win.rect, minimized: win.minimized, maximized: win.maximized, snap: win.snap };
      if (win.system) return [{ key, kind: "system" as const, system: win.system, layout }];
      if (win.session) return [{ key, kind: "app" as const, appId: win.session.appId, name: win.session.manifest.name, layout }];
      return [];
    });
    sync.edit(current=>({ ...current, windows }));
  };
  const restoreLayout = (): void => {
    if (!user || snapshot.phase !== "ready") return;
    const userId = user.id, saved = snapshot.data.windows;
    void run(async () => {
      const reused = new Set<string>(), failures: string[] = [];
      let restored = 0;
      for (const [index, entry] of saved.entries()) {
        if (currentUser.current?.id !== userId) throw new Error("로그인 계정이 바뀌어 복원을 중단했습니다.");
        try {
          const identity = await api<UserView>("/me");
          if (identity.id !== userId || identity.status !== "active" || identity.requiresReauth) throw new Error("현재 계정으로 복원할 수 없습니다.");
          if (entry.kind === "system") {
            if (entry.system === "operator" && !identity.operator) throw new Error("운영 권한이 없습니다.");
            dispatch({ type: "open", window: { id: "system:"+entry.system, kind: "system", system: entry.system, title: systemTitles[entry.system], restoreKey: entry.key }, layout: entry.layout });
          } else {
            const existing = desktop.windows.find(win => !reused.has(win.id) && !win.session?.isPreview && win.session?.appId === entry.appId);
            if (existing?.session) {
              await api("/app-sessions/"+existing.session.id);
              reused.add(existing.id);
              dispatch({ type: "open", window: { ...existing, restoreKey: entry.key }, layout: entry.layout });
            } else {
              const session = await api<AppSessionView>("/app-sessions", "POST", { appId: entry.appId, expectedUserId: userId });
              await attachSession(session, entry.layout, entry.key);
            }
          }
          restored++;
        } catch (e) {
          failures.push((entry.kind==="system" ? systemTitles[entry.system] : entry.name ?? `인앱 ${index+1}`)+": "+errorMessage(e));
        }
      }
      setMessage(`${restored}개 창을 복원했습니다.`);
      if (failures.length) setError("복원하지 못한 창 — "+failures.join(" / ")+" 앱 동의와 공개 상태는 Store에서 확인하세요.");
    });
  };
  const closeWindow = (win: DesktopWindow): void => {
    dispatch({ type: "close", id: win.id });
    if (win.session) void api("/app-sessions/" + win.session.id, "DELETE").then(() => {
      setMessage("앱을 종료했습니다.");
    }).catch(() => {
      setError("기기에서 앱을 닫았습니다. 서버의 종료 확인을 받지 못했습니다.");
    });
  };
  const logout = (): void => {
    void run(async () => { await api("/logout", "POST", {}); acceptUser(null); }, "로그아웃했습니다.");
  };
  useEffect(() => {
    const back = (): void => {
      const active = desktop.windows.find(win => win.id === desktop.active);
      if (active?.kind === "system") dispatch({ type: "close", id: active.id });
    };
    window.addEventListener("zm-host-back", back);
    return () => window.removeEventListener("zm-host-back", back);
  }, [desktop.active, desktop.windows]);
  if (lookupSecret) return <main className="standalone"><WithdrawalStatus secret={lookupSecret} onExit={() => setLookupSecret("")} /></main>;
  if (emailAction) return <main className="standalone">
    {error && <p className="notice error" role="alert">{error}</p>}
    <EmailComplete {...emailAction} busy={busy} run={run} onComplete={()=>{setEmailAction(null);setError("");}}/>
  </main>;
  if (enrollment) return <main className="standalone"><Enrollment onComplete={() => {
    setEnrollment(false); history.replaceState(null, "", location.pathname); void refreshUser();
  }} /></main>;
  const renderWindow = (win: DesktopWindow): React.JSX.Element | null => {
    if (win.session && user) return <AppRunner session={win.session} user={user} windowed
      active={desktop.active === win.id && !win.minimized} authorizationRevision={revision}
      onClose={reason => { dispatch({ type: "close", id: win.id }); setMessage(reason); }} />;
    const common = { user, revision, busy, run };
    switch (win.system) {
      case "store": case "mine": return <Store {...common} mine={win.system === "mine"} onLaunch={launch} onLogin={() => openSystem("account")} />;
      case "developer": return <Developer {...common} onLogin={() => openSystem("account")} onLaunch={launch} />;
      case "operator": return user?.operator ? <Operator {...common} user={user} onLaunch={launch} /> : null;
      case "workspace": return <WorkspaceSettings user={user} sync={sync} snapshot={snapshot} busy={busy} openWindowCount={saveable.length}
        onSaveLayout={saveLayout} onRestoreLayout={restoreLayout} onLogin={()=>openSystem("account")}/>;
      case "account": return <Account {...common} testMode={testMode} mailboxUrl={mailboxUrl} onWithdraw={secret => {
        acceptUser(null); if (secret) setLookupSecret(secret);
      }} />;
      default: return null;
    }
  };
  return <Desktop state={desktop} dispatch={dispatch} user={user} ready={ready} busy={busy} testMode={testMode}
    sync={sync} preferences={snapshot}
    onOpen={openSystem} onClose={closeWindow} renderWindow={renderWindow} onLogout={logout}
    notifications={<>
      {error && <div className="notice error" role="alert"><span>{error}</span><button aria-label="오류 안내 닫기" onClick={() => setError("")}>닫기</button></div>}
      {message && <div className="notice success" role="status"><span>{message}</span><button aria-label="안내 닫기" onClick={() => setMessage("")}>닫기</button></div>}
      {user?.status === "suspended" && <div className="notice error" role="alert">계정 이용이 정지되었습니다. 계정 안내와 탈퇴만 이용할 수 있습니다.</div>}
      {user?.requiresReauth && <div className="notice error" role="alert">계속 이용하려면 내 계정에서 재인증해 주세요. 이용 정지가 해제되어도 이전 실행 권한은 복구되지 않습니다.</div>}
    </>} />;
}

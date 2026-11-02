import { useCallback, useEffect, useState } from "react";
import type { AppSessionView, UserView } from "@zm/platform-contracts";
import { api, ApiError, errorMessage, setCsrf } from "./api";
import { Store } from "./Store";
import { Developer } from "./Developer";
import { Operator } from "./Operator";
import { Account, Enrollment, WithdrawalStatus } from "./Account";
import { AppRunner } from "./AppRunner";
import type { RunAction } from "./types";
type Page = "store" | "mine" | "developer" | "operator" | "account";

export function App(): React.JSX.Element {
  const [user, setUser] = useState<UserView | null>(null);
  const [ready, setReady] = useState(false);
  const [testMode, setTestMode] = useState(false);
  const [page, setPage] = useState<Page>("store");
  const [revision, setRevision] = useState(0);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [session, setSession] = useState<AppSessionView | null>(null);
  const [lookupSecret, setLookupSecret] = useState("");
  const [enrollment, setEnrollment] = useState(false);
  const refreshUser = useCallback(async (): Promise<void> => {
    try {
      const next = await api<UserView>("/me");
      setCsrf(next.csrf);
      setUser(next);
    } catch (e) {
      if (e instanceof ApiError && e.status === 401) {
        setUser(null);
        setCsrf("");
      } else throw e;
    }
  }, []);
  useEffect(() => {
    let active = true;
    const hash = new URLSearchParams(window.location.hash.slice(1));
    if (
      new URLSearchParams(window.location.search).get("enrollment") ===
      "required"
    )
      setEnrollment(true);
    if (hash.has("withdrawal")) {
      setLookupSecret(hash.get("withdrawal") ?? "");
      history.replaceState(null, "", location.pathname);
    }
    void Promise.all([
      refreshUser(),
      api<{ mode: string; testAuth?: boolean }>("/health").then((result) => {
        if (active)
          setTestMode(result.mode === "local-test" && result.testAuth === true);
      }),
    ])
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setReady(true);
      });
    return (): void => {
      active = false;
    };
  }, [refreshUser]);
  const run: RunAction = async (action, success): Promise<void> => {
    if (busy) return;
    setBusy(true);
    setError("");
    setMessage("");
    try {
      await action();
      await refreshUser();
      setRevision((v) => v + 1);
      if (success) setMessage(success);
    } catch (e) {
      setError(errorMessage(e));
      // A sibling tab may have changed the cookie identity. Keep the original
      // action error, but discard stale account-bound forms and data.
      try {
        await refreshUser();
        setRevision((v) => v + 1);
      } catch {
        // A failed refresh must not turn an uncertain mutation into success.
      }
    } finally {
      setBusy(false);
    }
  };
  const logout = (): void => {
    void run(async () => {
      await api("/logout", "POST", {});
      setSession(null);
      setPage("store");
    }, "로그아웃했습니다.");
  };
  useEffect(() => {
    const goHome = (): void => {
      if (!session) setPage("store");
    };
    window.addEventListener("zm-host-back", goHome);
    return (): void => window.removeEventListener("zm-host-back", goHome);
  }, [session]);
  if (lookupSecret)
    return (
      <main className="standalone">
        <WithdrawalStatus
          secret={lookupSecret}
          onExit={() => setLookupSecret("")}
        />
      </main>
    );
  if (enrollment)
    return (
      <main className="standalone">
        <Enrollment
          onComplete={() => {
            setEnrollment(false);
            history.replaceState(null, "", location.pathname);
            void refreshUser();
          }}
        />
      </main>
    );
  if (session && user)
    return (
      <AppRunner
        key={session.id}
        session={session}
        user={user}
        onClose={(reason) => {
          setSession(null);
          setMessage(reason);
        }}
      />
    );
  return (
    <div className="shell">
      <a className="skip-link" href="#main-content">
        본문으로 이동
      </a>
      <aside className="sidebar">
        <button
          className="wordmark"
          onClick={() => setPage("store")}
          aria-label="zm-os Store로 이동"
        >
          zm<span>·</span>os
        </button>
        <p className="brand-caption">나에게 필요한 앱</p>
        <nav aria-label="주 메뉴">
          <button
            className={page === "store" ? "nav-active" : ""}
            onClick={() => setPage("store")}
            aria-current={page === "store" ? "page" : undefined}
          >
            앱 둘러보기
          </button>
          <button
            className={page === "mine" ? "nav-active" : ""}
            onClick={() => setPage("mine")}
            aria-current={page === "mine" ? "page" : undefined}
          >
            내 앱
          </button>
          <button
            className={page === "developer" ? "nav-active" : ""}
            onClick={() => setPage("developer")}
            aria-current={page === "developer" ? "page" : undefined}
          >
            개발자 공간
          </button>
          {user?.operator && (
            <button
              className={page === "operator" ? "nav-active" : ""}
              onClick={() => setPage("operator")}
              aria-current={page === "operator" ? "page" : undefined}
            >
              운영 관리
            </button>
          )}
        </nav>
        <div className="sidebar-bottom">
          {testMode && <span className="test-badge">로컬 시험 환경</span>}
          <button
            className={page === "account" ? "nav-active" : ""}
            onClick={() => setPage("account")}
          >
            {user ? "내 계정" : "로그인"}
          </button>
          {user && (
            <button className="quiet" onClick={logout} disabled={busy}>
              로그아웃
            </button>
          )}
        </div>
      </aside>
      <main id="main-content" className="main-content">
        <div className="topline">
          <span>
            {user
              ? user.operator
                ? "운영자 계정"
                : user.developer
                  ? "개발자 계정"
                  : "사용자 계정"
              : "방문자"}
          </span>
          <span>
            {user
              ? `${user.providers.join(" · ")} 연결`
              : "둘러보기는 로그인 없이"}
          </span>
        </div>
        {error && (
          <div className="notice error" role="alert">
            <span>{error}</span>
            <button aria-label="오류 안내 닫기" onClick={() => setError("")}>
              닫기
            </button>
          </div>
        )}
        {message && (
          <div className="notice success" role="status">
            <span>{message}</span>
            <button aria-label="안내 닫기" onClick={() => setMessage("")}>
              닫기
            </button>
          </div>
        )}
        {!ready ? (
          <p role="status">서비스에 연결하고 있습니다…</p>
        ) : (
          <>
            {user?.status === "suspended" && (
              <div className="notice error" role="alert">
                계정 이용이 정지되었습니다. 계정 안내와 탈퇴만 이용할 수
                있습니다.
              </div>
            )}
            {user && "requiresReauth" in user && user.requiresReauth && (
              <div className="notice error" role="alert">
                계속 이용하려면 내 계정에서 재인증해 주세요. 이용 정지가
                해제되어도 이전 실행 권한은 복구되지 않습니다.
              </div>
            )}
            {(page === "store" || page === "mine") && (
              <Store
                key={`${user?.id ?? "guest"}:${page}`}
                mine={page === "mine"}
                user={user}
                revision={revision}
                busy={busy}
                run={run}
                onLaunch={setSession}
                onLogin={() => setPage("account")}
              />
            )}
            {page === "developer" && (
              <Developer
                key={user?.id ?? "guest"}
                user={user}
                revision={revision}
                busy={busy}
                run={run}
                onLogin={() => setPage("account")}
                onLaunch={setSession}
              />
            )}
            {page === "operator" && user?.operator && (
              <Operator
                user={user}
                revision={revision}
                busy={busy}
                run={run}
                onLaunch={setSession}
              />
            )}
            {page === "account" && (
              <Account
                key={user?.id ?? "guest"}
                user={user}
                revision={revision}
                testMode={testMode}
                busy={busy}
                run={run}
                onWithdraw={(secret) => {
                  setUser(null);
                  setCsrf("");
                  if (secret) setLookupSecret(secret);
                }}
              />
            )}
          </>
        )}
        <footer className="footer">
          앱 데이터는 개발자가 안내한 범위에서 처리합니다.
        </footer>
      </main>
      {busy && (
        <div className="working" role="status">
          처리 중…
        </div>
      )}
    </div>
  );
}

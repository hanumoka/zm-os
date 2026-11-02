import { useLayoutEffect, useRef, useState } from "react";
import type { AppSessionView, UserView } from "@zm/platform-contracts";
import { attachHostBridge } from "@zm/host-bridge";
import { api } from "./api";
export function AppRunner({
  session,
  user,
  onClose,
}: {
  session: AppSessionView;
  user: UserView;
  onClose: (reason: string) => void;
}): React.JSX.Element {
  const frame = useRef<HTMLIFrameElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  const [closing, setClosing] = useState(false);
  const [offline, setOffline] = useState(false);
  useLayoutEffect(() => {
    if (!frame.current) return;
    const iframe = frame.current;
    let active = true;
    let checkRunning = false;
    const checkSession = async (): Promise<AppSessionView> => {
      const latest = await api<AppSessionView>(`/app-sessions/${session.id}`);
      if (active) setOffline(false);
      return latest;
    };
    const host = attachHostBridge({
      iframe,
      session,
      userId: user.id,
      authorize: async () => {
        await checkSession();
      },
      createCode: (challenge: string) =>
        api(`/app-sessions/${session.id}/authorization-codes`, "POST", {
          challenge,
        }),
      onClose: (reason?: string) => {
        if (active) {
          void api(`/app-sessions/${session.id}`, "DELETE").catch(
            () => undefined,
          );
          closeRef.current(reason ?? "앱을 종료했습니다.");
        }
      },
    });
    const check = async (): Promise<void> => {
      if (checkRunning) return;
      checkRunning = true;
      try {
        await checkSession();
      } catch (e) {
        if (!active) return;
        if (
          typeof e === "object" &&
          e !== null &&
          "status" in e &&
          [401, 403, 404, 410].includes(Number(e.status))
        )
          closeRef.current("앱 실행 권한이 종료되어 앱을 닫았습니다.");
        else setOffline(true);
      } finally {
        checkRunning = false;
      }
    };
    const timer = setInterval(() => {
      void check();
    }, 5000);
    const onVisibility = (): void => {
      if (!document.hidden) void check();
    };
    document.addEventListener("visibilitychange", onVisibility);
    window.addEventListener("online", onVisibility);
    const onHostBack = (): void => {
      void api(`/app-sessions/${session.id}`, "DELETE")
        .then(() => {
          if (active) closeRef.current("앱을 종료했습니다.");
        })
        .catch(() => {
          if (active)
            closeRef.current(
              "앱을 닫았습니다. 서버의 종료 확인은 받지 못했습니다.",
            );
        });
    };
    window.addEventListener("zm-host-back", onHostBack);
    return (): void => {
      active = false;
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onVisibility);
      window.removeEventListener("online", onVisibility);
      window.removeEventListener("zm-host-back", onHostBack);
      host.dispose();
      // React removes the frame on unmount. Effect cleanup must not navigate a
      // still-mounted frame to about:blank during StrictMode's setup replay.
    };
  }, [session, user.id]);
  const close = async (): Promise<void> => {
    setClosing(true);
    try {
      await api(`/app-sessions/${session.id}`, "DELETE");
      closeRef.current("앱을 종료했습니다.");
    } catch {
      closeRef.current(
        "기기에서 앱을 닫았습니다. 서버 연결이 없어 종료 확인을 받지 못했습니다. 실행 세션은 만료 후 차단됩니다.",
      );
    }
  };
  return (
    <main className="runner">
      <header className="runner-header">
        <strong>{session.manifest.name}</strong>
        <span>
          버전 {session.manifest.version}
          {session.isPreview ? " · 비공개 검수" : ""}
        </span>
        <button
          onClick={() => {
            void close();
          }}
          disabled={closing}
        >
          앱 종료
        </button>
      </header>
      {session.isPreview && (
        <p className="preview-notice">
          검수용 실행입니다. 저장 데이터와 앱 사용자 식별자는 일반 실행과
          분리됩니다.
        </p>
      )}
      {offline && (
        <p className="offline-notice" role="alert">
          연결을 확인하고 있습니다. 권한 확인이 필요한 기능은 연결이 복구된 뒤
          사용할 수 있습니다.
        </p>
      )}
      <iframe
        ref={frame}
        src={session.documentUrl}
        title={session.manifest.name}
        sandbox="allow-scripts"
        referrerPolicy="no-referrer"
        allow="camera 'none'; microphone 'none'; geolocation 'none'; payment 'none'; clipboard-read 'none'; clipboard-write 'none'"
      />
    </main>
  );
}

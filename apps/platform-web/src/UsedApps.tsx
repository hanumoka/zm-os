import { useEffect, useState } from "react";
import { clearAppStorage } from "@zm/host-bridge";
import type { AppConsentView, UserView } from "@zm/platform-contracts";
import { api, assertCurrentUser, errorMessage } from "./api";
import { FormSection } from "./components";
import type { RunAction } from "./types";

export function UsedApps({
  user,
  revision,
  busy,
  run,
}: {
  user: UserView;
  revision: number;
  busy: boolean;
  run: RunAction;
}): React.JSX.Element {
  const [apps, setApps] = useState<AppConsentView[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [reload, setReload] = useState(0);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void api<AppConsentView[]>("/me/app-consents")
      .then((items) => {
        if (active) setApps(items);
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [user.id, revision, reload]);
  return (
    <FormSection title="이용 앱 관리">
      <p>
        내 앱에서 제거했거나 공개가 끝난 앱도 이용 동의와 기기 데이터를 관리할
        수 있습니다.
      </p>
      <p className="muted">
        동의 철회는 실행 권한을 차단합니다. 기기·zm-os 서버·개발자의 외부 서버
        데이터는 자동으로 삭제되지 않습니다. 삭제할 저장 위치를 따로 선택하세요.
      </p>
      <button
        disabled={loading || busy}
        onClick={() => setReload((value) => value + 1)}
      >
        이용 앱 목록 새로고침
      </button>
      {loading && <p role="status">이용 앱을 확인하고 있습니다…</p>}
      {error && (
        <p className="error-text" role="alert">
          {error}
        </p>
      )}
      {!loading && !error && apps.length === 0 && (
        <p className="muted">이용에 동의한 앱이 없습니다.</p>
      )}
      {!error && (
        <ul className="record-list">
          {apps.map((app) => (
            <li key={app.appId}>
              <h3>{app.name}</h3>
              <p>
                {app.revokedAt ? "동의 철회됨" : "이용 동의 중"}
                {!app.available ? " · 현재 실행할 수 없음" : ""}
              </p>
              {app.unavailableReason && (
                <p className="muted">{app.unavailableReason}</p>
              )}
              <div className="actions">
                <button className="danger" disabled={busy} onClick={() => {
                  if (window.confirm("zm-os 서버에 저장된 이 앱의 개인 데이터를 모두 삭제할까요? 같은 계정의 모든 기기에 적용되고 실행 중인 앱은 종료됩니다. 이 기기의 로컬 메모와 개발자 외부 서버 데이터는 남습니다."))
                    void run(() => api(`/me/apps/${app.appId}/cloud-clear`, "POST", { confirmed: true, expectedUserId: user.id }), "zm-os 서버의 앱 데이터를 삭제했습니다. 로컬·외부 서버 데이터는 유지됩니다.");
                }}>서버의 앱 데이터 전체 삭제</button>
                <button
                  disabled={busy || !!app.revokedAt}
                  onClick={() => {
                    if (
                      window.confirm(
                        "이 앱의 이용 동의를 철회할까요? 실행 중인 앱의 권한도 차단됩니다.",
                      )
                    )
                      void run(
                        () => api(`/me/app-consents/${app.appId}`, "DELETE"),
                        "이용 동의를 철회했습니다.",
                      );
                  }}
                >
                  동의 철회
                </button>
                <button
                  className="danger"
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "현재 기기에 저장된 이 앱의 데이터를 삭제할까요? 삭제한 데이터는 복구할 수 없습니다. 외부 서버 데이터는 삭제되지 않습니다.",
                      )
                    )
                      void run(async () => {
                        await assertCurrentUser(user.id);
                        await clearAppStorage(user.id, app.appId);
                      }, "현재 기기의 이 앱 데이터를 삭제했습니다.");
                  }}
                >
                  이 기기의 앱 데이터 삭제
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}
    </FormSection>
  );
}

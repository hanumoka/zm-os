import { useEffect, useState } from "react";
import type {
  AppManifest,
  AppSessionView,
  AppView,
  UserView,
} from "@zm/platform-contracts";
import { clearAppStorage } from "@zm/host-bridge";
import { api, assertCurrentUser, errorMessage } from "./api";
import { Empty, Field, Modal, SectionTitle } from "./components";
import { categories, appTypes, type RunAction } from "./types";
interface Consent {
  fingerprint: string;
  manifest: AppManifest;
  accepted: boolean;
}
type AvailableApp = AppView & {
  available?: boolean;
  unavailableReason?: string;
};
interface Props {
  mine: boolean;
  user: UserView | null;
  revision: number;
  busy: boolean;
  run: RunAction;
  onLaunch: (session: AppSessionView) => void;
  onLogin: () => void;
}
const permissionLabels = {
  "local-storage": "이 기기에 앱 데이터 저장",
  "cloud-storage": "zm-os 서버에 개인 데이터 저장 · 같은 계정의 다른 기기에서 조회",
  "app-identity": "이 앱 전용 사용자 식별자",
  "external-api": "개발자의 외부 서버 이용",
};

export function Store({
  mine,
  user,
  revision,
  busy,
  run,
  onLaunch,
  onLogin: requestLogin,
}: Props): React.JSX.Element {
  const [apps, setApps] = useState<AvailableApp[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
  const [appType, setAppType] = useState("");
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState("");
  const [selected, setSelected] = useState<AvailableApp | null>(null);
  const [consent, setConsent] = useState<Consent | null>(null);
  const [reportReason, setReportReason] = useState("");
  const userId = user?.id;
  useEffect(() => {
    let active = true;
    setLoading(true);
    setLoadError("");
    if (mine && !userId) {
      setApps([]);
      setLoading(false);
      return;
    }
    const timer = setTimeout(() => {
      const path = `${mine ? "/me/apps" : "/store/apps"}?${new URLSearchParams({ q, category, appType })}`;
      void api<AvailableApp[]>(path)
        .then((result) => {
          if (active) setApps(result);
        })
        .catch((e) => {
          if (active) setLoadError(errorMessage(e));
        })
        .finally(() => {
          if (active) setLoading(false);
        });
    }, 180);
    return (): void => {
      active = false;
      clearTimeout(timer);
    };
  }, [mine, q, category, appType, revision, userId]);
  const prepareLaunch = (app: AvailableApp): void => {
    if (app.available === false || user?.requiresReauth) return;
    if (!user) {
      onLogin();
      return;
    }
    void run(async () => {
      const requirement = await api<Consent>(`/apps/${app.id}/consent`);
      setSelected(app);
      if (requirement.accepted)
        finishLaunch(
          await api<AppSessionView>("/app-sessions", "POST", { appId: app.id }),
        );
      else setConsent(requirement);
    });
  };
  const finishLaunch = (session: AppSessionView): void => {
    setSelected(null);
    setConsent(null);
    onLaunch(session);
  };
  const onLogin = (): void => {
    setSelected(null);
    setConsent(null);
    requestLogin();
  };
  return (
    <>
      <SectionTitle
        title={mine ? "내 앱" : "오늘, 어떤 앱이 필요한가요?"}
        description={
          mine
            ? "zm-os의 기본앱과 내가 추가한 개발자 앱입니다. 목록은 같은 계정에서 함께 사용하며, 앱별 데이터 저장 방식은 상세에서 확인하세요."
            : "zm-os가 제공하는 기본앱과 개발자가 만든 앱을 찾아 작업공간에 추가하세요."
        }
      />
      {(!mine || user) && (
        <form className="search-bar" onSubmit={(e) => e.preventDefault()}>
          <label className="search-input">
            <span className="sr-only">앱 검색</span>
            <input
              type="search"
              placeholder="앱 이름 또는 설명 검색"
              value={q}
              onChange={(e) => setQ(e.target.value)}
            />
          </label>
          <label>
            <span className="sr-only">앱 구분</span>
            <select value={appType} onChange={(e) => setAppType(e.target.value)}>
              <option value="">모든 앱 구분</option>
              {Object.entries(appTypes).map(([key, name]) => <option key={key} value={key}>{name}</option>)}
            </select>
          </label>
          <label>
            <span className="sr-only">카테고리</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">모든 카테고리</option>
              {Object.entries(categories).map(([key, name]) => (
                <option key={key} value={key}>
                  {name}
                </option>
              ))}
            </select>
          </label>
        </form>
      )}
      {mine && !user ? (
        <Empty>
          <button onClick={onLogin}>로그인하고 내 앱 보기</button>
        </Empty>
      ) : loading ? (
        <p role="status">앱을 불러오고 있습니다…</p>
      ) : loadError ? (
        <p role="alert" className="error-text">
          {loadError}
        </p>
      ) : apps.length === 0 ? (
        <Empty>
          {mine
            ? (q || category || appType ? "조건에 맞는 내 앱이 없습니다." : "표시할 앱이 없습니다. 앱 둘러보기에서 앱을 추가하거나 숨긴 기본앱을 다시 표시하세요.")
            : "조건에 맞는 공개 앱이 없습니다."}
        </Empty>
      ) : (
        <div className="app-groups">
        {(["default", "developer"] as const).map((type) => apps.some(app => app.appType === type) ? (
          <section className="app-group" key={type} aria-label={appTypes[type]}>
          <h2 className="app-group-title">{appTypes[type]} <span>{apps.filter(app => app.appType === type).length}</span></h2>
          <div className="app-grid">
          {apps.filter(app => app.appType === type).map((app) => (
            <article className="app-card" key={app.id}>
              <button
                className="app-detail-button"
                onClick={() => {
                  setSelected(app);
                  setConsent(null);
                }}
                aria-label={`${app.name} 상세 보기`}
              >
                <span
                  className={`app-icon icon-${app.category}`}
                  aria-hidden="true"
                >
                  {app.name.slice(0, 1)}
                </span>
                <span className="app-category">
                  {categories[app.category] ?? app.category}
                </span>
                <h3>{app.name}</h3>
                <p>{app.description}</p>
              </button>
              <div className="card-bottom">
                <span>{app.available === false ? "실행 중단" : "무료"}</span>
                <button
                  className="primary small"
                  onClick={() => prepareLaunch(app)}
                  disabled={
                    busy ||
                    user?.status === "suspended" ||
                    user?.requiresReauth ||
                    app.available === false
                  }
                >
                  앱 열기
                </button>
              </div>
            </article>
          ))}
          </div>
          </section>
        ) : null)}
        </div>
      )}
      {selected && (
        <Modal
          onClose={() => {
            if (busy) return;
            setSelected(null);
            setConsent(null);
          }}
        >
          <div className="dialog-heading">
            <span className="app-category">
              {categories[selected.category]}
            </span>
            <button
              disabled={busy}
              onClick={() => {
                setSelected(null);
                setConsent(null);
              }}
              aria-label="앱 상세 닫기"
            >
              닫기
            </button>
          </div>
          <h2 id="app-detail-title">{selected.name}</h2>
          <p className="app-type-label">{appTypes[selected.appType]}{selected.appType === "default" ? " · zm-os에서 기본 제공" : ""}</p>
          <p>{selected.description}</p>
          <p className="muted">버전 {selected.version} · 무료</p>
          {selected.available === false && (
            <p className="notice">
              {selected.unavailableReason ??
                "지금은 새로 실행할 수 없습니다. 목록과 기기 데이터는 유지됩니다."}
            </p>
          )}
          {consent ? (
            <section className="consent-panel">
              <h3>처음 실행하기 전에 확인해 주세요</h3>
              <p>
                이 앱에 아래 기능을 허용합니다. 이름과 이메일, 로그인 제공자
                정보는 전달하지 않습니다.
              </p>
              <ul>
                {consent.manifest.permissions.map((permission) => (
                  <li key={permission}>{permissionLabels[permission]}</li>
                ))}
              </ul>
              <p className="privacy-notice">{consent.manifest.privacyNotice}</p>
              {consent.manifest.apiOrigins.length > 0 && (
                <>
                  <h4>연결하는 외부 서버</h4>
                  <ul>
                    {consent.manifest.apiOrigins.map((origin) => (
                      <li key={origin}>{origin}</li>
                    ))}
                  </ul>
                </>
              )}
              <div className="actions">
                <button
                  className="primary"
                  disabled={busy}
                  onClick={() => {
                    void run(async () => {
                      await api(`/me/app-consents/${selected.id}`, "PUT", {
                        fingerprint: consent.fingerprint,
                      });
                      finishLaunch(
                        await api<AppSessionView>("/app-sessions", "POST", {
                          appId: selected.id,
                        }),
                      );
                    });
                  }}
                >
                  동의하고 실행
                </button>
                <button disabled={busy} onClick={() => setConsent(null)}>
                  취소
                </button>
              </div>
              {busy && (
                <p role="status">
                  동의와 실행 요청을 처리하고 있습니다. 결과가 표시될 때까지
                  기다려 주세요.
                </p>
              )}
            </section>
          ) : (
            <div className="actions">
              <button
                className="primary"
                disabled={
                  busy ||
                  user?.status === "suspended" ||
                  user?.requiresReauth ||
                  selected.available === false
                }
                onClick={() => prepareLaunch(selected)}
              >
                앱 열기
              </button>
              <button
                disabled={busy}
                onClick={() => {
                  if (!user) return onLogin();
                  void run(
                    () =>
                      api(
                        `/me/apps/${selected.id}`,
                        mine ? "DELETE" : "PUT",
                        {},
                      ),
                    mine
                      ? selected.appType === "default" ? "기본앱을 숨겼습니다. 저장 데이터는 유지되며 Store에서 다시 표시할 수 있습니다." : "내 앱 목록에서 제거했습니다. 저장 데이터는 유지됩니다."
                      : "내 앱에 추가했습니다.",
                  );
                }}
              >
                {selected.appType === "default" ? mine ? "내 앱에서 숨기기" : "내 앱에 표시" : mine ? "내 앱에서 제거" : "내 앱에 추가"}
              </button>
            </div>
          )}
          {user && (
            <details>
              <summary>이용 동의와 데이터 관리</summary>
              <p>
                동의를 철회하면 실행 권한이 차단됩니다. 저장 데이터 삭제는
                별도입니다.
              </p>
              <div className="actions">
                <button
                  disabled={busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        "이 앱의 이용 동의를 철회할까요? 실행 중인 앱의 권한도 차단됩니다.",
                      )
                    )
                      void run(
                        () => api(`/me/app-consents/${selected.id}`, "DELETE"),
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
                        await clearAppStorage(user.id, selected.id);
                      }, "현재 기기의 이 앱 데이터를 삭제했습니다.");
                  }}
                >
                  이 기기의 앱 데이터 삭제
                </button>
              </div>
            </details>
          )}
          <details>
            <summary>앱 신고</summary>
            <p>
              신고 내용은 운영자에게만 전달됩니다. 신고만으로 앱이 자동
              중지되지는 않습니다.
            </p>
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!user) return onLogin();
                void run(async () => {
                  await api(`/apps/${selected.id}/reports`, "POST", {
                    reason: reportReason,
                  });
                  setReportReason("");
                }, "신고를 접수했습니다.");
              }}
            >
              <Field label="신고 사유">
                <textarea
                  required
                  minLength={3}
                  maxLength={2000}
                  value={reportReason}
                  onChange={(e) => setReportReason(e.target.value)}
                />
              </Field>
              <button disabled={busy} type="submit">
                비공개 신고 접수
              </button>
            </form>
          </details>
        </Modal>
      )}
    </>
  );
}

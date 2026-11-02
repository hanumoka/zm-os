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
import { categories, type RunAction } from "./types";
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
  onLogin,
}: Props): React.JSX.Element {
  const [apps, setApps] = useState<AvailableApp[]>([]);
  const [q, setQ] = useState("");
  const [category, setCategory] = useState("");
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
      const path = mine
        ? "/me/apps"
        : `/store/apps?${new URLSearchParams({ q, category })}`;
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
  }, [mine, q, category, revision, userId]);
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
        onLaunch(
          await api<AppSessionView>("/app-sessions", "POST", { appId: app.id }),
        );
      else setConsent(requirement);
    });
  };
  return (
    <>
      <SectionTitle
        title={mine ? "내 앱" : "오늘, 어떤 앱이 필요한가요?"}
        description={
          mine
            ? "같은 계정으로 로그인한 웹에서 내 앱 목록을 함께 사용합니다. 앱 내부의 기기 데이터는 동기화하지 않습니다."
            : "설치 부담 없이 시작하는 작은 도구들. 앱의 기능과 이용 범위를 확인하고 열어 보세요."
        }
      />
      {!mine && (
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
            <span className="sr-only">분류</span>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value)}
            >
              <option value="">모든 분류</option>
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
            ? "아직 추가한 앱이 없습니다. 앱 둘러보기에서 마음에 드는 앱을 추가해 보세요."
            : "조건에 맞는 공개 앱이 없습니다."}
        </Empty>
      ) : (
        <div className="app-grid">
          {apps.map((app) => (
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
                <h2>{app.name}</h2>
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
                      onLaunch(
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
                      ? "내 앱 목록에서 제거했습니다. 저장 데이터는 유지됩니다."
                      : "내 앱에 추가했습니다.",
                  );
                }}
              >
                {mine ? "내 앱에서 제거" : "내 앱에 추가"}
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

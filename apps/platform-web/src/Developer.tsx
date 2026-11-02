import { useEffect, useState } from "react";
import type {
  AppSessionView,
  DeveloperProfileView,
  UserView,
} from "@zm/platform-contracts";
import { api, errorMessage } from "./api";
import { Empty, Field, FormSection, SectionTitle, Status } from "./components";
import type {
  AppVersion,
  DeletionRequest,
  DeveloperApplication,
  ManagedApp,
  RunAction,
} from "./types";
import { VersionPreview } from "./VersionPreview";
interface Props {
  user: UserView | null;
  revision: number;
  busy: boolean;
  run: RunAction;
  onLogin: () => void;
  onLaunch: (session: AppSessionView) => void;
}
export function Developer({
  user,
  revision,
  busy,
  run,
  onLogin,
  onLaunch,
}: Props): React.JSX.Element {
  const [application, setApplication] = useState<DeveloperApplication | null>(
    null,
  );
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [profile, setProfile] = useState<DeveloperProfileView | null>(null);
  const [deletions, setDeletions] = useState<DeletionRequest[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [loadError, setLoadError] = useState("");
  const userId = user?.id;
  const userStatus = user?.status;
  useEffect(() => {
    if (!userId || userStatus !== "active") return;
    let active = true;
    setLoadError("");
    void Promise.all([
      api<DeveloperApplication | null>("/developer/application"),
      api<ManagedApp[]>("/developer/apps"),
      api<DeletionRequest[]>("/developer/deletion-requests"),
      api<DeveloperProfileView>("/developer/profile"),
    ])
      .then(
        ([applicationResult, appResults, deletionResults, profileResult]) => {
          if (!active) return;
          setApplication(applicationResult);
          setApps(appResults);
          setDeletions(deletionResults);
          setProfile(profileResult);
        },
      )
      .catch((e) => {
        if (active) setLoadError(errorMessage(e));
      });
    return (): void => {
      active = false;
    };
  }, [userId, userStatus, revision]);
  const selected = apps.find((item) => item.id === selectedId);
  return (
    <>
      <SectionTitle
        title="개발자 공간"
        description="앱을 만들고, 검수를 거쳐 사용자에게 공개하세요. 서버가 필요한 앱은 개발자가 직접 운영합니다."
      />
      {!user ? (
        <Empty>
          <button onClick={onLogin}>로그인하고 개발자 신청하기</button>
        </Empty>
      ) : user.status !== "active" ? (
        <p>이용이 정지된 계정은 개발자 공간을 사용할 수 없습니다.</p>
      ) : (
        <>
          {loadError && (
            <p role="alert" className="error-text">
              {loadError}
            </p>
          )}
          {profile && (
            <FormSection title="현재 개발자 자격">
              <p>
                {profile.status === "approved"
                  ? "개발자 자격이 승인되어 있습니다."
                  : profile.status === "revoked"
                    ? "개발자 자격이 취소되었습니다."
                    : "아직 개발자 자격이 없습니다."}
              </p>
              {profile.reason && <p>자격 안내: {profile.reason}</p>}
              {profile.status === "revoked" && (
                <p>
                  신규 앱 등록·버전 제출·공개가 제한됩니다. 아래에서 다시 신청할
                  수 있으며 재승인되어도 앱별 중지 상태는 자동 해제되지
                  않습니다.
                </p>
              )}
            </FormSection>
          )}
          {!user.developer && (
            <FormSection title="개발자 승인 신청">
              {application && (
                <div className="notice">
                  <p>최근 신청의 심사 결과</p>
                  <Status value={application.status} />
                  <p>
                    {application.reason ??
                      "운영자의 심사 결과를 확인해 주세요."}
                  </p>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = new FormData(e.currentTarget);
                  void run(
                    () =>
                      api("/developer/applications", "POST", {
                        displayName: form.get("displayName"),
                        email: form.get("email"),
                        description: form.get("description"),
                      }),
                    "개발자 신청을 제출했습니다.",
                  );
                }}
              >
                <Field label="개발자 표시명">
                  <input
                    name="displayName"
                    required
                    maxLength={60}
                    defaultValue={application?.displayName}
                  />
                </Field>
                <Field
                  label="연락용 이메일"
                  hint="본인과 운영자만 확인하며 이용자에게 자동 공개하지 않습니다."
                >
                  <input
                    name="email"
                    type="email"
                    required
                    maxLength={254}
                    defaultValue={application?.email}
                  />
                </Field>
                <Field label="만들 앱의 설명">
                  <textarea
                    name="description"
                    required
                    maxLength={2000}
                    defaultValue={application?.description}
                  />
                </Field>
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || application?.status === "pending"}
                >
                  {application ? "수정하여 다시 신청" : "승인 신청"}
                </button>
              </form>
            </FormSection>
          )}
          {user.developer && (
            <FormSection title="새 앱 등록">
              <form
                className="inline-form"
                onSubmit={(e) => {
                  e.preventDefault();
                  const form = e.currentTarget;
                  const value = new FormData(form).get("name");
                  void run(async () => {
                    const app = await api<ManagedApp>(
                      "/developer/apps",
                      "POST",
                      { name: value },
                    );
                    setSelectedId(app.id);
                    form.reset();
                  }, "앱을 등록했습니다. 이 앱 ID로 번들을 만들어 제출하세요.");
                }}
              >
                <Field label="앱 이름">
                  <input
                    name="name"
                    required
                    maxLength={60}
                    placeholder="예: 하루 기록"
                  />
                </Field>
                <button type="submit" className="primary" disabled={busy}>
                  앱 등록
                </button>
              </form>
            </FormSection>
          )}
          {apps.length > 0 && (
            <section className="managed-apps">
              <h2>내가 만든 앱</h2>
              <div className="app-selector">
                {apps.map((app) => (
                  <button
                    className={app.id === selectedId ? "selected" : ""}
                    key={app.id}
                    onClick={() => setSelectedId(app.id)}
                  >
                    <strong>{app.name}</strong>
                    <span>
                      {app.closed
                        ? "종료됨"
                        : app.published
                          ? "공개 중"
                          : "미공개"}
                    </span>
                  </button>
                ))}
              </div>
            </section>
          )}
          {selected && (
            <ManagedAppEditor
              key={selected.id}
              app={selected}
              canDevelop={user.developer}
              revision={revision}
              busy={busy}
              run={run}
              onLaunch={onLaunch}
            />
          )}
          <FormSection title="외부 서버 데이터 삭제 요청">
            <p>
              앱의 외부 서버에 저장한 데이터를 직접 삭제하고 결과를 등록하세요.
              완료 등록은 개발자의 보고로 표시됩니다.
            </p>
            {deletions.length === 0 ? (
              <p className="muted">접수된 요청이 없습니다.</p>
            ) : (
              <ul className="record-list">
                {deletions.map((request) => (
                  <li key={request.id}>
                    <Status value={request.status} />
                    <dl>
                      <div>
                        <dt>앱</dt>
                        <dd>
                          {apps.find((item) => item.id === request.appId)
                            ?.name ?? request.appId}
                        </dd>
                      </div>
                      <div>
                        <dt>앱별 사용자 식별자</dt>
                        <dd>
                          <code>{request.appUserId}</code>
                        </dd>
                      </div>
                    </dl>
                    {request.note && <p>{request.note}</p>}
                    <form
                      key={`${request.id}:${request.status}:${request.note ?? ""}`}
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        void run(
                          () =>
                            api(
                              `/developer/deletion-requests/${request.id}/results`,
                              "POST",
                              {
                                status: form.get("status"),
                                note: form.get("note"),
                              },
                            ),
                          "삭제 처리 결과를 등록했습니다.",
                        );
                      }}
                    >
                      <Field label="처리 결과">
                        <select
                          name="status"
                          defaultValue={
                            request.status === "pending"
                              ? "processing"
                              : request.status
                          }
                        >
                          <option value="processing">처리 중</option>
                          <option value="developer_reported_completed">
                            개발자 완료 보고
                          </option>
                          <option value="needs_attention">확인 필요</option>
                        </select>
                      </Field>
                      <Field label="처리 안내">
                        <textarea
                          name="note"
                          required
                          maxLength={2000}
                          defaultValue={request.note}
                        />
                      </Field>
                      <button type="submit" disabled={busy}>
                        결과 등록
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            )}
          </FormSection>
        </>
      )}
    </>
  );
}
function ManagedAppEditor({
  app,
  canDevelop,
  revision,
  busy,
  run,
  onLaunch,
}: {
  app: ManagedApp;
  canDevelop: boolean;
  revision: number;
  busy: boolean;
  run: RunAction;
  onLaunch: (session: AppSessionView) => void;
}): React.JSX.Element {
  const [versions, setVersions] = useState<AppVersion[]>([]);
  const [loadError, setLoadError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [credential, setCredential] = useState<Record<string, string> | null>(
    null,
  );
  useEffect(() => {
    let active = true;
    const refresh = async (): Promise<void> => {
      try {
        const result = await api<AppVersion[]>(
          `/developer/apps/${app.id}/versions`,
        );
        if (active) {
          setVersions(result);
          setLoadError("");
        }
      } catch (e) {
        if (active) setLoadError(errorMessage(e));
      }
    };
    void refresh();
    const timer = setInterval(() => {
      void refresh();
    }, 5000);
    return (): void => {
      active = false;
      clearInterval(timer);
    };
  }, [app.id, revision]);
  return (
    <FormSection title={app.name}>
      <dl>
        <div>
          <dt>앱 ID</dt>
          <dd>
            <code>{app.id}</code>
          </dd>
        </div>
        <div>
          <dt>운영 상태</dt>
          <dd>
            <Status value={app.availability} />
          </dd>
        </div>
        <div>
          <dt>공개 상태</dt>
          <dd>
            {app.closed ? "종료됨" : app.published ? "공개 중" : "미공개"}
          </dd>
        </div>
      </dl>
      {loadError && (
        <p role="alert" className="error-text">
          {loadError}
        </p>
      )}
      <div className="actions">
        <button
          disabled={
            busy ||
            (!canDevelop && !app.published) ||
            app.closed ||
            (!app.published && app.availability !== "allowed")
          }
          onClick={() => {
            void run(
              () =>
                api(`/developer/apps/${app.id}/publication`, "PUT", {
                  published: !app.published,
                  revision: app.revision,
                }),
              app.published
                ? "공개를 중단했습니다. 기존 실행은 유지됩니다."
                : "앱을 다시 공개했습니다.",
            );
          }}
        >
          {app.published ? "공개 중단" : "다시 공개"}
        </button>
      </div>
      <h3>새 버전 제출</h3>
      <p>
        앱 ID가 같은 웹 번들 ZIP을 올립니다. 검사 통과 후 검수를 요청하고,
        승인된 버전을 직접 공개하세요.
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!file) return;
          void run(async () => {
            await api(`/developer/apps/${app.id}/versions`, "POST", file);
            setFile(null);
          }, "번들을 업로드했습니다. 검사 결과를 확인해 주세요.");
        }}
      >
        <Field label="웹 번들 ZIP">
          <input
            type="file"
            accept=".zip,application/zip"
            required
            onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            disabled={!canDevelop || app.closed}
          />
        </Field>
        <button
          disabled={busy || !file || !canDevelop || app.closed}
          type="submit"
        >
          번들 업로드
        </button>
      </form>
      <h3>등록한 버전</h3>
      {versions.length ? (
        <ul className="record-list versions">
          {versions.map((version) => (
            <li key={version.id}>
              <div className="record-heading">
                <strong>{version.manifest?.version ?? version.id}</strong>
                <Status value={version.validationStatus} />
                <Status value={version.reviewStatus} />
              </div>
              {version.validationError && (
                <p className="error-text">{version.validationError}</p>
              )}
              {version.reason && <p>검수 안내: {version.reason}</p>}
              <div className="actions">
                <VersionPreview
                  version={version}
                  busy={busy}
                  run={run}
                  onLaunch={onLaunch}
                />
                <button
                  disabled={
                    busy ||
                    !canDevelop ||
                    app.closed ||
                    version.validationStatus !== "passed" ||
                    ["in_review", "approved"].includes(version.reviewStatus)
                  }
                  onClick={() => {
                    void run(
                      () =>
                        api(
                          `/developer/versions/${version.id}/submit`,
                          "POST",
                          {},
                        ),
                      "검수를 요청했습니다.",
                    );
                  }}
                >
                  검수 요청
                </button>
                <button
                  className="primary"
                  disabled={
                    busy ||
                    !canDevelop ||
                    app.closed ||
                    version.reviewStatus !== "approved" ||
                    app.availability !== "allowed"
                  }
                  onClick={() => {
                    void run(
                      () =>
                        api(`/developer/apps/${app.id}/releases`, "POST", {
                          versionId: version.id,
                          revision: app.revision,
                        }),
                      "승인된 버전을 공개했습니다.",
                    );
                  }}
                >
                  이 버전 공개
                </button>
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <p className="muted">등록된 버전이 없습니다.</p>
      )}
      <details>
        <summary>외부 서버 인증 자격</summary>
        <p>
          서버가 있는 앱에서만 사용합니다. 발급한 비밀 값은 클라이언트 번들에
          넣지 말고 외부 서버에 보관하세요. 새로 발급하면 이전 자격은 더 이상
          사용할 수 없습니다.
        </p>
        <button
          disabled={busy || !canDevelop || app.closed}
          onClick={() => {
            if (
              window.confirm(
                "서버 자격을 새로 발급할까요? 기존 자격은 무효화됩니다.",
              )
            )
              void run(async () =>
                setCredential(
                  await api<Record<string, string>>(
                    `/developer/apps/${app.id}/credentials`,
                    "POST",
                    {},
                  ),
                ),
              );
          }}
        >
          새 자격 발급
        </button>
        {credential && (
          <div className="credential">
            <p>이 화면을 닫으면 다시 표시하지 않습니다.</p>
            <pre>{JSON.stringify(credential, null, 2)}</pre>
            <button onClick={() => setCredential(null)}>보관 후 숨기기</button>
          </div>
        )}
      </details>
      <details>
        <summary>앱 종료</summary>
        <p>
          계정 탈퇴 전에 소유 앱의 종료를 요청하고 운영자의 확인을 받아야
          합니다. 공개 중단만으로 앱 종료가 완료되지는 않습니다.
        </p>
        <button
          className="danger"
          disabled={busy || app.closed || app.closureRequested}
          onClick={() => {
            if (window.confirm("운영자에게 앱 종료를 요청할까요?"))
              void run(
                () =>
                  api(`/developer/apps/${app.id}/closure-requests`, "POST", {}),
                "앱 종료 확인을 요청했습니다.",
              );
          }}
        >
          {app.closed
            ? "종료 완료"
            : app.closureRequested
              ? "종료 확인 대기"
              : "앱 종료 요청"}
        </button>
      </details>
    </FormSection>
  );
}

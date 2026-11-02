import { useEffect, useState } from "react";
import type { AppSessionView, UserView } from "@zm/platform-contracts";
import { api, errorMessage } from "./api";
import { Empty, Field, SectionTitle, Status } from "./components";
import type {
  AppVersion,
  DeveloperApplication,
  ManagedApp,
  OperatorUser,
  Report,
  RunAction,
} from "./types";
import { VersionPreview } from "./VersionPreview";
interface Props {
  user: UserView;
  revision: number;
  busy: boolean;
  run: RunAction;
  onLaunch: (session: AppSessionView) => void;
}
type Tab = "applications" | "reviews" | "apps" | "users" | "reports";
export function Operator({
  user,
  revision,
  busy,
  run,
  onLaunch,
}: Props): React.JSX.Element {
  const [tab, setTab] = useState<Tab>("applications");
  const [applications, setApplications] = useState<DeveloperApplication[]>([]);
  const [reviews, setReviews] = useState<AppVersion[]>([]);
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [users, setUsers] = useState<OperatorUser[]>([]);
  const [reports, setReports] = useState<Report[]>([]);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  useEffect(() => {
    let active = true;
    setLoading(true);
    setError("");
    void Promise.all([
      api<DeveloperApplication[]>("/operator/developer-applications"),
      api<AppVersion[]>("/operator/reviews"),
      api<ManagedApp[]>("/operator/apps"),
      api<OperatorUser[]>("/operator/users"),
      api<Report[]>("/operator/reports"),
    ])
      .then(([a, r, ap, u, re]) => {
        if (active) {
          setApplications(a);
          setReviews(r);
          setApps(ap);
          setUsers(u);
          setReports(re);
        }
      })
      .catch((e) => {
        if (active) setError(errorMessage(e));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return (): void => {
      active = false;
    };
  }, [revision, user.id]);
  const tabNames: Record<Tab, string> = {
    applications: "개발자 신청",
    reviews: "앱 검수",
    apps: "앱 운영",
    users: "사용자",
    reports: "신고",
  };
  return (
    <>
      <SectionTitle
        title="운영 관리"
        description="검수와 이용 상태를 관리합니다. 앱 수정과 공개는 소유 개발자가 직접 진행합니다."
      />
      <nav className="tabs" aria-label="운영 메뉴">
        {Object.entries(tabNames).map(([key, name]) => (
          <button
            key={key}
            className={tab === key ? "selected" : ""}
            aria-current={tab === key ? "page" : undefined}
            onClick={() => setTab(key as Tab)}
          >
            {name}
          </button>
        ))}
      </nav>
      {tab === "reviews" && (
        <section className="form-section" aria-labelledby="review-guide-title">
          <h2 id="review-guide-title">앱 버전 검수 기준</h2>
          <p>파일 검사 통과 후에도 제출된 앱의 기능과 이용 안내를 확인해야 합니다.</p>
          <details>
            <summary>검수 순서와 첫 버전 제외 기능 확인</summary>
            <ol>
              <li>제출 버전의 매니페스트·원본 ZIP·미리보기를 대조합니다. 외부 서버 사용과 저장 범위가 이용 안내와 일치하는지 확인합니다.</li>
              <li>광고 SDK·광고 수익화·유료 결제, 공개 게시물·댓글·채팅, 기기 기능이나 실시간 지속 연결에 의존하는 앱은 첫 버전 승인 대상에서 제외합니다.</li>
              <li>본인만 보는 개인 메모는 공개 콘텐츠와 구분합니다. 외부 서버를 사용한다는 이유만으로 제외하지 않습니다.</li>
              <li>확인한 기능과 보완·반려 사유를 아래 심사 사유에 기록합니다. 본인 소유 앱에도 같은 기준을 적용합니다.</li>
            </ol>
            <p className="muted">승인 후 공개는 소유 개발자가 진행합니다. 파일 자동 검사는 기능 검수를 대신하지 않습니다.</p>
          </details>
        </section>
      )}
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {loading ? (
        <p role="status">운영 정보를 불러오고 있습니다…</p>
      ) : (
        <>
          {tab === "applications" &&
            (applications.length === 0 ? (
              <Empty>심사할 개발자 신청이 없습니다.</Empty>
            ) : (
              <ul className="record-list">
                {applications.map((application) => (
                  <li key={application.id}>
                    <div className="record-heading">
                      <h2>{application.displayName}</h2>
                      <Status value={application.status} />
                    </div>
                    <p>{application.description}</p>
                    <p>연락 이메일: {application.email}</p>
                    {application.reason && (
                      <p>이전 안내: {application.reason}</p>
                    )}
                    <DecisionForm
                      busy={busy || application.status !== "pending"}
                      onSubmit={(decision, reason) =>
                        run(
                          () =>
                            api(
                              `/operator/developer-applications/${application.id}/decisions`,
                              "POST",
                              { decision, reason },
                            ),
                          "개발자 신청 심사 결과를 기록했습니다.",
                        )
                      }
                    />
                  </li>
                ))}
              </ul>
            ))}
          {tab === "reviews" &&
            (reviews.length === 0 ? (
              <Empty>검수 요청이 없습니다.</Empty>
            ) : (
              <ul className="record-list">
                {reviews.map((version) => {
                  const app = apps.find((item) => item.id === version.appId);
                  return (
                    <li key={version.id}>
                      <div className="record-heading">
                        <h2>
                          {version.manifest?.name ?? app?.name ?? "제출 버전"}
                        </h2>
                        <span>{version.manifest?.version}</span>
                        <Status value={version.reviewStatus} />
                      </div>
                      <p>{version.manifest?.description}</p>
                      {app?.ownerId === user.id && (
                        <p className="notice">
                          본인 소유 앱입니다. 동일한 검증 절차를 적용하고 자기
                          검수 이력을 남깁니다.
                        </p>
                      )}
                      <details>
                        <summary>제출된 매니페스트와 검증 결과</summary>
                        <Status value={version.validationStatus} />
                        <pre>{JSON.stringify(version.manifest, null, 2)}</pre>
                        {version.validationError && (
                          <p>{version.validationError}</p>
                        )}
                      </details>
                      <VersionPreview
                        version={version}
                        busy={busy}
                        run={run}
                        onLaunch={onLaunch}
                      />
                      <DecisionForm
                        busy={
                          busy ||
                          version.reviewStatus !== "in_review" ||
                          version.validationStatus !== "passed"
                        }
                        onSubmit={(decision, reason) =>
                          run(
                            () =>
                              api(
                                `/operator/versions/${version.id}/decisions`,
                                "POST",
                                { decision, reason },
                              ),
                            decision === "approved"
                              ? "앱 버전 검수 결과를 기록했습니다. 개발자가 직접 공개할 수 있습니다."
                              : "앱 버전 검수 결과를 기록했습니다. 개발자가 사유를 확인하고 수정한 버전을 다시 제출해야 합니다.",
                          )
                        }
                      />
                    </li>
                  );
                })}
              </ul>
            ))}
          {tab === "apps" &&
            (apps.length === 0 ? (
              <Empty>등록된 앱이 없습니다.</Empty>
            ) : (
              <ul className="record-list">
                {apps.map((app) => (
                  <li key={app.id}>
                    <div className="record-heading">
                      <h2>{app.name}</h2>
                      <Status value={app.availability} />
                      <span>
                        {app.closed
                          ? "종료됨"
                          : app.published
                            ? "개발자 공개 중"
                            : "개발자 미공개"}
                      </span>
                    </div>
                    <p className="muted">{app.id}</p>
                    <p>
                      일반 중지는 새 실행을 막습니다. 긴급 중지는 기존 실행
                      권한도 차단합니다.
                    </p>
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        void run(
                          () =>
                            api(
                              `/operator/apps/${app.id}/availability`,
                              "PUT",
                              {
                                status: form.get("status"),
                                reason: form.get("reason"),
                                revision: app.revision,
                              },
                            ),
                          "앱 운영 상태를 변경했습니다.",
                        );
                      }}
                    >
                      <div className="form-pair">
                        <Field label="운영 상태">
                          <select name="status" defaultValue={app.availability}>
                            <option value="allowed">허용</option>
                            <option value="normal_suspended">일반 중지</option>
                            <option value="emergency_suspended">
                              긴급 중지
                            </option>
                          </select>
                        </Field>
                        <Field label="변경 사유">
                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={2000}
                          />
                        </Field>
                      </div>
                      <button type="submit" disabled={busy || app.closed}>
                        운영 상태 변경
                      </button>
                    </form>
                    {app.closureRequested && !app.closed && (
                      <form
                        className="closure-form"
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = new FormData(e.currentTarget);
                          if (
                            window.confirm(
                              "소유자가 요청한 앱 종료를 확인할까요?",
                            )
                          )
                            void run(
                              () =>
                                api(
                                  `/operator/apps/${app.id}/closure-confirmations`,
                                  "POST",
                                  { reason: form.get("reason") },
                                ),
                              "앱 종료를 확인했습니다.",
                            );
                        }}
                      >
                        <Field label="앱 종료 확인 사유">
                          <input
                            name="reason"
                            required
                            minLength={3}
                            maxLength={2000}
                          />
                        </Field>
                        <button
                          className="danger"
                          type="submit"
                          disabled={busy}
                        >
                          소유자 요청 앱 종료 확인
                        </button>
                      </form>
                    )}
                  </li>
                ))}
              </ul>
            ))}
          {tab === "users" && (
            <ul className="record-list">
              {users.map((account) => (
                <li key={account.id}>
                  <div className="record-heading">
                    <h2>
                      {account.operator
                        ? "운영자"
                        : account.developer
                          ? "개발자"
                          : "사용자"}
                    </h2>
                    <Status value={account.status} />
                    {account.id === user.id && <span>현재 계정</span>}
                  </div>
                  <p className="muted">{account.id}</p>
                  <p>
                    계정 이용 정지는 이 사용자의 서비스 접근을 막습니다. 소유한
                    앱들은 자동 중지하지 않습니다.
                  </p>
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const form = new FormData(e.currentTarget);
                      void run(
                        () =>
                          api(
                            `/operator/users/${account.id}/availability`,
                            "PUT",
                            {
                              status:
                                account.status === "active"
                                  ? "suspended"
                                  : "active",
                              reason: form.get("reason"),
                            },
                          ),
                        "사용자 이용 상태를 변경했습니다.",
                      );
                    }}
                  >
                    <Field label="변경 사유">
                      <input
                        name="reason"
                        required
                        minLength={3}
                        maxLength={2000}
                      />
                    </Field>
                    <button
                      className={account.status === "active" ? "danger" : ""}
                      type="submit"
                      disabled={busy || account.status === "withdrawn"}
                    >
                      {account.status === "active"
                        ? "계정 이용 정지"
                        : "계정 이용 정지 해제"}
                    </button>
                  </form>
                  {account.developer && (
                    <details>
                      <summary>개발자 승인 취소</summary>
                      <p>
                        신규 앱 등록·버전 제출·공개를 막습니다. 기존 앱 중지는
                        앱별로 처리합니다.
                      </p>
                      <form
                        onSubmit={(e) => {
                          e.preventDefault();
                          const form = new FormData(e.currentTarget);
                          void run(
                            () =>
                              api(
                                `/operator/developers/${account.id}/revoke`,
                                "POST",
                                { reason: form.get("reason") },
                              ),
                            "개발자 승인을 취소했습니다.",
                          );
                        }}
                      >
                        <Field label="승인 취소 사유">
                          <textarea
                            name="reason"
                            required
                            minLength={3}
                            maxLength={2000}
                          />
                        </Field>
                        <button
                          className="danger"
                          disabled={busy}
                          type="submit"
                        >
                          개발자 승인 취소
                        </button>
                      </form>
                    </details>
                  )}
                </li>
              ))}
            </ul>
          )}
          {tab === "reports" &&
            (reports.length === 0 ? (
              <Empty>접수된 신고가 없습니다.</Empty>
            ) : (
              <ul className="record-list">
                {reports.map((report) => (
                  <li key={report.id}>
                    <div className="record-heading">
                      <h2>
                        {apps.find((item) => item.id === report.appId)?.name ??
                          report.appId}
                      </h2>
                      <Status value={report.status} />
                    </div>
                    <p className="preserve-lines">{report.reason}</p>
                    {report.resolution && <p>처리 안내: {report.resolution}</p>}
                    <form
                      onSubmit={(e) => {
                        e.preventDefault();
                        const form = new FormData(e.currentTarget);
                        void run(
                          () =>
                            api(
                              `/operator/reports/${report.id}/decisions`,
                              "POST",
                              {
                                status: form.get("status"),
                                reason: form.get("reason"),
                              },
                            ),
                          "신고 처리 결과를 기록했습니다.",
                        );
                      }}
                    >
                      <Field label="처리 결과">
                        <select name="status">
                          <option value="resolved">조치 후 처리 완료</option>
                          <option value="dismissed">추가 조치 없이 종결</option>
                        </select>
                      </Field>
                      <Field label="처리 사유">
                        <textarea
                          name="reason"
                          required
                          minLength={3}
                          maxLength={2000}
                        />
                      </Field>
                      <button disabled={busy} type="submit">
                        신고 처리 기록
                      </button>
                    </form>
                  </li>
                ))}
              </ul>
            ))}
        </>
      )}
    </>
  );
}
function DecisionForm({
  busy,
  onSubmit,
}: {
  busy: boolean;
  onSubmit: (decision: string, reason: string) => Promise<void>;
}): React.JSX.Element {
  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        const form = new FormData(e.currentTarget);
        void onSubmit(String(form.get("decision")), String(form.get("reason")));
      }}
    >
      <div className="form-pair">
        <Field label="심사 결과">
          <select name="decision">
            <option value="approved">승인</option>
            <option value="changes_requested">보완 요청</option>
            <option value="rejected">반려</option>
          </select>
        </Field>
        <Field label="심사 사유">
          <textarea required name="reason" minLength={3} maxLength={2000} />
        </Field>
      </div>
      <button className="primary" type="submit" disabled={busy}>
        심사 결과 기록
      </button>
    </form>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import type { UserView } from "@zm/platform-contracts";
import { api, errorMessage } from "./api";
import { Field, FormSection, SectionTitle, Status } from "./components";
import { label, type Report, type RunAction } from "./types";
import { UsedApps } from "./UsedApps";
import { EmailSignIn, EmailCredentials } from "./EmailAccount";
interface Props {
  user: UserView | null;
  revision: number;
  testMode: boolean;
  mailboxUrl?: string;
  busy: boolean;
  run: RunAction;
  onWithdraw: (secret?: string) => void;
}
export function Enrollment({
  onComplete,
}: {
  onComplete: () => void;
}): React.JSX.Element {
  const [proof, setProof] = useState<{
    required: boolean;
    provider: string;
  } | null>(null);
  const [error, setError] = useState("");
  const [age, setAge] = useState(false);
  const [busy, setBusy] = useState(false);
  useEffect(() => {
    void api<{ required: boolean; provider: string }>("/enrollment")
      .then(setProof)
      .catch((e) => setError(errorMessage(e)));
  }, []);
  const submit = async (): Promise<void> => {
    setBusy(true);
    setError("");
    try {
      const result = await api<{ ok: boolean; redirectUrl?: string }>(
        "/enrollment",
        "POST",
        { ageConfirmed: age },
      );
      if (result.redirectUrl) {
        const url = new URL(result.redirectUrl);
        if (
          url.protocol !== "zmos:" ||
          url.hostname !== "auth" ||
          (url.pathname !== "" && url.pathname !== "/")
        )
          throw new Error("허용되지 않은 인증 복귀 주소입니다.");
        window.location.assign(url.toString());
      } else onComplete();
    } catch (e) {
      setError(errorMessage(e));
    } finally {
      setBusy(false);
    }
  };
  return (
    <>
      <SectionTitle
        title="가입 조건을 확인해 주세요"
        description="zm-os는 만 19세 이상 이용자를 대상으로 합니다."
      />
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {proof ? (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            void submit();
          }}
        >
          <p>
            {proof.provider} 인증을 확인했습니다. 생년월일이나 실명은 추가로
            수집하지 않습니다.
          </p>
          <label className="check">
            <input
              type="checkbox"
              required
              checked={age}
              onChange={(e) => setAge(e.target.checked)}
            />
            만 19세 이상임을 직접 확인합니다.
          </label>
          <p className="muted">
            본인의 자가 확인이며, 실제 나이가 검증되었다는 뜻은 아닙니다.
          </p>
          <button type="submit" className="primary" disabled={busy || !age}>
            확인하고 가입
          </button>
        </form>
      ) : (
        !error && <p role="status">인증 상태를 확인하고 있습니다…</p>
      )}
    </>
  );
}
export function Account({
  user,
  revision,
  testMode,
  busy,
  run,
  onWithdraw,
  mailboxUrl,
}: Props): React.JSX.Element {
  const [subject, setSubject] = useState("alice");
  const [provider, setProvider] = useState("google");
  const [age, setAge] = useState(false);
  const [withdrawConfirmed, setWithdrawConfirmed] = useState(false);
  const [withdrawReceipt, setWithdrawReceipt] = useState<{
    receiptId: string;
    lookupSecret: string;
  } | null>(null);
  const [receiptSaved, setReceiptSaved] = useState(false);
  const [reports, setReports] = useState<Report[]>([]);
  const [notice, setNotice] = useState("");
  useEffect(() => {
    if (user?.status === "active")
      void api<Report[]>("/me/reports")
        .then(setReports)
        .catch((e) => setNotice(errorMessage(e)));
  }, [user?.id, user?.status]);
  return (
    <>
      <SectionTitle
        title={user ? "내 계정" : "로그인"}
        description={
          user
            ? "로그인 연결과 이용 기록을 관리합니다."
            : "앱을 실행하고 내 앱을 저장하려면 로그인하세요."
        }
      />
      {notice && (
        <p role="status" className="notice">
          {notice}
        </p>
      )}
      {!user ? (
        <div className="account-layout">
          <EmailSignIn busy={busy} run={run} mailboxUrl={mailboxUrl}/>
          <FormSection title="Google 또는 GitHub로 시작">
            <p>
              처음 가입할 때 만 19세 이상 이용 조건을 확인합니다. 이름과
              이메일은 인앱에 전달하지 않습니다.
            </p>
            <div className="stack">
              <a className="button" href="/v1/auth/google/start">
                Google로 로그인
              </a>
              <a className="button" href="/v1/auth/github/start">
                GitHub로 로그인
              </a>
            </div>
          </FormSection>
          {testMode && (
            <FormSection title="모의 로그인">
              <p className="muted">
                로컬 시험용 계정입니다. 실제 Google·GitHub 인증을 수행하지
                않습니다.
              </p>
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void run(
                    () =>
                      api("/test/login", "POST", {
                        subject,
                        provider,
                        ageConfirmed: age,
                      }),
                    "시험 계정으로 로그인했습니다.",
                  );
                }}
              >
                <Field label="시험 사용자">
                  <select
                    value={subject}
                    onChange={(e) => setSubject(e.target.value)}
                  >
                    <option value="alice">alice · 일반 사용자</option>
                    <option value="bob">bob · 별도 사용자</option>
                    <option value="owner">owner · 운영자</option>
                  </select>
                </Field>
                <Field label="모의 로그인 제공자">
                  <select
                    value={provider}
                    onChange={(e) => setProvider(e.target.value)}
                  >
                    <option value="google">모의 Google</option>
                    <option value="github">모의 GitHub</option>
                  </select>
                </Field>
                <label className="check">
                  <input
                    required
                    type="checkbox"
                    checked={age}
                    onChange={(e) => setAge(e.target.checked)}
                  />
                  만 19세 이상임을 직접 확인합니다.
                </label>
                <button
                  className="primary"
                  type="submit"
                  disabled={busy || !age}
                >
                  모의 로그인
                </button>
              </form>
            </FormSection>
          )}
        </div>
      ) : (
        <>
          <EmailCredentials user={user} busy={busy} run={run} mailboxUrl={mailboxUrl}/>
          <FormSection title="로그인 연결">
            <p>
              재인증 후 연결을 변경할 수 있습니다. 마지막 로그인 수단은 해제할
              수 없습니다.
            </p>
            <ul className="identity-list">
              {user.providers.map((item) => (
                <li key={item}>
                  <strong>{item === "email" ? "이메일" : item === "google" ? "Google" : "GitHub"}</strong>
                  <span>연결됨</span>
                  {item !== "email" && <a href={`/v1/auth/${item}/start?intent=reauth`}>재인증</a>}
                  {testMode && item !== "email" && (
                    <button
                      disabled={busy}
                      onClick={() => {
                        void run(
                          () => api("/test/reauth", "POST", { provider: item }),
                          "모의 재인증을 완료했습니다.",
                        );
                      }}
                    >
                      모의 재인증
                    </button>
                  )}
                  <button
                    className="danger"
                    disabled={busy || user.providers.length < 2}
                    onClick={() => {
                      if (
                        window.confirm(
                          `${item} 로그인 연결을 해제할까요? 다른 로그인 수단의 재인증이 먼저 필요합니다.`,
                        )
                      )
                        void run(
                          () => api(`/me/login-identities/${item}`, "DELETE"),
                          "로그인 연결을 해제했습니다.",
                        );
                    }}
                  >
                    연결 해제
                  </button>
                </li>
              ))}
            </ul>
            {["google", "github"]
              .filter((item) => !user.providers.includes(item))
              .map((item) => (
                <div className="actions" key={item}>
                  <a
                    className="button"
                    href={`/v1/auth/${item}/start?intent=link`}
                  >
                    {item === "google" ? "Google" : "GitHub"} 연결
                  </a>
                  {testMode && (
                    <form
                      className="inline-form"
                      onSubmit={(e) => {
                        e.preventDefault();
                        void run(
                          () =>
                            api("/test/link", "POST", {
                              provider: item,
                              subject,
                            }),
                          "모의 제공자를 연결했습니다.",
                        );
                      }}
                    >
                      <label>
                        <span className="sr-only">
                          연결할 모의 제공자 사용자
                        </span>
                        <select
                          value={subject}
                          onChange={(e) => setSubject(e.target.value)}
                        >
                          <option value="alice">alice</option>
                          <option value="bob">bob</option>
                          <option value="owner">owner</option>
                        </select>
                      </label>
                      <button disabled={busy}>모의 {item} 연결</button>
                    </form>
                  )}
                </div>
              ))}
          </FormSection>
          <UsedApps user={user} revision={revision} busy={busy} run={run} />
          <FormSection title="내 신고">
            <p>신고 내용은 공개되지 않습니다.</p>
            {reports.length ? (
              <ul className="record-list">
                {reports.map((report) => (
                  <li key={report.id}>
                    <Status value={report.status} />
                    <p>{report.reason}</p>
                    {report.resolution && <p>처리 안내: {report.resolution}</p>}
                  </li>
                ))}
              </ul>
            ) : (
              <p className="muted">접수한 신고가 없습니다.</p>
            )}
          </FormSection>
          <FormSection title="계정 탈퇴">
            <p>
              최근 로그인 수단으로 재인증한 뒤 탈퇴합니다. 탈퇴 즉시 이용이
              종료되며 계정을 복구할 수 없습니다. 앱을 소유한 경우 운영자와 앱
              종료를 먼저 처리해야 합니다.
            </p>
            <p>
              외부 앱 서버의 데이터는 개발자가 삭제합니다. 탈퇴 후 응답을 받지
              못하더라도 처리 상태를 확인할 수 있도록 조회 링크부터 보관하세요.
            </p>
            {!withdrawReceipt ? (
              <button
                disabled={busy}
                onClick={() => {
                  void run(async () => {
                    setWithdrawReceipt(
                      await api<{ receiptId: string; lookupSecret: string }>(
                        "/me/withdrawal/prepare",
                        "POST",
                        {},
                      ),
                    );
                    setReceiptSaved(false);
                  }, "조회 링크를 준비했습니다. 아직 탈퇴하지 않았습니다.");
                }}
              >
                재인증 후 조회 링크 준비
              </button>
            ) : (
              <div className="receipt">
                <p>
                  조회 링크는 본인만 보관하세요. 링크를 가진 사람은 삭제 처리
                  상태를 확인할 수 있습니다. 이 링크를 준비하는 것만으로 탈퇴가
                  처리되지는 않습니다.
                </p>
                <Field label="탈퇴 후 데이터 삭제 조회 링크">
                  <input
                    readOnly
                    value={`${location.origin}/#withdrawal=${encodeURIComponent(withdrawReceipt.lookupSecret)}`}
                    onFocus={(e) => e.currentTarget.select()}
                  />
                </Field>
                <button
                  disabled={busy}
                  onClick={() => {
                    void navigator.clipboard
                      .writeText(
                        `${location.origin}/#withdrawal=${encodeURIComponent(withdrawReceipt.lookupSecret)}`,
                      )
                      .then(() =>
                        setNotice(
                          "조회 링크를 복사했습니다. 안전한 곳에 보관해 주세요.",
                        ),
                      )
                      .catch(() =>
                        setNotice(
                          "위 조회 링크를 직접 선택하여 복사해 주세요.",
                        ),
                      );
                  }}
                >
                  조회 링크 복사
                </button>
                <label className="check">
                  <input
                    type="checkbox"
                    checked={receiptSaved}
                    onChange={(e) => setReceiptSaved(e.target.checked)}
                  />
                  조회 링크를 보관했습니다.
                </label>
              </div>
            )}
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!withdrawReceipt || !receiptSaved) return;
                void run(async () => {
                  const result = await api<{ status: string }>(
                    "/me/withdrawal",
                    "POST",
                    {
                      confirmed: withdrawConfirmed,
                      receiptId: withdrawReceipt.receiptId,
                    },
                  );
                  if (result.status === "withdrawn")
                    onWithdraw(withdrawReceipt.lookupSecret);
                  else
                    setNotice(
                      [
                        "pending",
                        "closure_required",
                        "owner_closure_required",
                      ].includes(result.status)
                        ? "소유 앱의 종료 확인이 필요합니다. 개발자 공간에서 앱 종료를 요청해 주세요."
                        : `탈퇴 처리: ${label(result.status)}`,
                    );
                });
              }}
            >
              <label className="check">
                <input
                  type="checkbox"
                  required
                  checked={withdrawConfirmed}
                  onChange={(e) => setWithdrawConfirmed(e.target.checked)}
                />
                계정 복구가 불가능함을 확인했습니다.
              </label>
              <button
                className="danger"
                type="submit"
                disabled={
                  busy ||
                  !withdrawConfirmed ||
                  !withdrawReceipt ||
                  !receiptSaved
                }
              >
                탈퇴 확정
              </button>
            </form>
          </FormSection>
        </>
      )}
    </>
  );
}
interface WithdrawalView {
  status?: string;
  platform?: unknown;
  external?: unknown;
  tasks?: unknown;
  requests?: unknown;
  [key: string]: unknown;
}
function explain(value: unknown): React.ReactNode {
  if (typeof value === "string") return label(value);
  if (value === null || value === undefined) return "미확인";
  if (typeof value === "boolean" || typeof value === "number")
    return String(value);
  if (Array.isArray(value))
    return value.length ? (
      <ul>
        {value.map((item, index) => (
          <li key={index}>{explain(item)}</li>
        ))}
      </ul>
    ) : (
      "해당 없음"
    );
  const names: Record<string, string> = {
    status: "상태",
    appId: "앱",
    appName: "앱",
    appUserId: "앱별 식별자",
    platform: "플랫폼",
    external: "외부 앱",
    note: "처리 안내",
    id: "요청 번호",
    createdAt: "접수 시각",
    updatedAt: "갱신 시각",
    platformStatus: "플랫폼 처리",
    localStatus: "기기 데이터",
    backupStatus: "백업 데이터",
    localDevice: "현재 기기",
    otherDevices: "다른 기기",
    backups: "운영 백업",
  };
  const fields = value as Record<string, unknown>;
  const hasAppName =
    typeof fields.appName === "string" && fields.appName.trim().length > 0;
  return (
    <dl>
      {Object.entries(fields)
        .filter(([key]) => key !== "appId" || !hasAppName)
        .map(([key, item]) => (
          <div key={key}>
            <dt>{names[key] ?? key}</dt>
            <dd>
              {key === "appName" && typeof item === "string"
                ? item
                : explain(item)}
            </dd>
          </div>
        ))}
    </dl>
  );
}
export function WithdrawalStatus({
  secret,
  onExit,
}: {
  secret: string;
  onExit: () => void;
}): React.JSX.Element {
  const [data, setData] = useState<WithdrawalView | null>(null);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [loading, setLoading] = useState(false);
  const requestId = useRef(0);
  const cancelPending = useCallback((): void => {
    requestId.current++;
  }, []);
  const refresh = useCallback(async (): Promise<void> => {
    const currentRequest = ++requestId.current;
    setLoading(true);
    setData(null);
    setError("");
    try {
      const next = await api<WithdrawalView>(
        "/withdrawal-status",
        "GET",
        undefined,
        secret,
      );
      if (requestId.current === currentRequest) setData(next);
    } catch (e) {
      if (requestId.current === currentRequest) setError(errorMessage(e));
    } finally {
      if (requestId.current === currentRequest) setLoading(false);
    }
  }, [secret]);
  useEffect(() => {
    void refresh();
    return cancelPending;
  }, [refresh, cancelPending]);
  const copyLink = async (): Promise<void> => {
    try {
      await navigator.clipboard.writeText(
        `${location.origin}/#withdrawal=${encodeURIComponent(secret)}`,
      );
      setCopied(true);
    } catch {
      setError(
        "클립보드를 사용할 수 없습니다. 아래 조회 링크를 직접 복사해 주세요.",
      );
    }
  };
  return (
    <>
      <SectionTitle
        title="데이터 삭제 처리 상태"
        description="이 링크는 삭제 처리 상태만 조회합니다. 계정 복구나 앱 실행에 사용할 수 없습니다."
      />
      <div className="notice">
        본인만 보관해 주세요. 링크를 가진 사람은 처리 상태를 조회할 수 있습니다.
      </div>
      <div className="actions">
        <button
          onClick={() => {
            void copyLink();
          }}
        >
          {copied ? "조회 링크 복사됨" : "조회 링크 복사"}
        </button>
        <button
          disabled={loading}
          onClick={() => {
            void refresh();
          }}
        >
          상태 새로고침
        </button>
        <button onClick={onExit}>Store로 돌아가기</button>
      </div>
      <details>
        <summary>조회 링크 직접 복사</summary>
        <input
          readOnly
          aria-label="본인용 조회 링크"
          value={`${location.origin}/#withdrawal=${encodeURIComponent(secret)}`}
          onFocus={(e) => e.currentTarget.select()}
        />
      </details>
      {error && (
        <p role="alert" className="error-text">
          {error}
        </p>
      )}
      {data ? (
        <div className="deletion-status">
          <p>
            플랫폼 처리 완료는 로그인 정보·프로필 정리를 뜻합니다. 감사·외부
            삭제 요청 이력은 남습니다.
          </p>
          {explain(data)}
        </div>
      ) : (
        !error && <p role="status">처리 상태를 불러오고 있습니다…</p>
      )}
      <p className="muted">
        개발자 완료 보고는 외부 서버의 실제 삭제를 플랫폼이 직접 검증했다는 뜻이
        아닙니다. 다른 기기와 백업의 삭제 상태는 별도로 확인합니다.
      </p>
    </>
  );
}

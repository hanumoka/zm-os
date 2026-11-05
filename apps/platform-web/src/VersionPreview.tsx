import { useState } from "react";
import type { AppSessionView } from "@zm/platform-contracts";
import { api } from "./api";
import { Modal } from "./components";
import type { AppVersion, RunAction } from "./types";
const permissionNames = {
  "local-storage": "검수용 로컬 데이터 저장",
  "cloud-storage": "검수용 개인 데이터 서버 저장 · 일반 이용 데이터와 분리",
  "app-identity": "검수용 앱 사용자 식별자",
  "external-api": "개발자의 외부 서버 이용",
};
export function VersionPreview({
  version,
  busy,
  run,
  onLaunch,
}: {
  version: AppVersion;
  busy: boolean;
  run: RunAction;
  onLaunch: (session: AppSessionView) => void;
}): React.JSX.Element {
  const [open, setOpen] = useState(false);
  const [confirmed, setConfirmed] = useState(false);
  return (
    <>
      <button
        disabled={busy || version.validationStatus !== "passed"}
        onClick={() => {
          setOpen(true);
          setConfirmed(false);
        }}
      >
        검수용 실행
      </button>
      {open && (
        <Modal
          titleId="preview-title"
          onClose={() => {
            if (!busy) setOpen(false);
          }}
        >
          <div className="dialog-heading">
            <span className="app-category">비공개 검수</span>
            <button
              disabled={busy}
              aria-label="검수 안내 닫기"
              onClick={() => setOpen(false)}
            >
              닫기
            </button>
          </div>
          <h2 id="preview-title">{version.manifest.name} 검수용 실행</h2>
          <p>
            버전 {version.manifest.version}의 내용을 확인합니다. 검수용 저장
            데이터와 사용자 식별자는 일반 이용자의 앱 실행과 분리됩니다.
          </p>
          <h3>허용하는 기능</h3>
          <ul>
            {version.manifest.permissions.map((permission) => (
              <li key={permission}>{permissionNames[permission]}</li>
            ))}
          </ul>
          <p className="privacy-notice">{version.manifest.privacyNotice}</p>
          {version.manifest.apiOrigins.length > 0 && (
            <>
              <h3>연결하는 외부 서버</h3>
              <ul>
                {version.manifest.apiOrigins.map((origin) => (
                  <li key={origin}>{origin}</li>
                ))}
              </ul>
            </>
          )}
          <label className="check">
            <input
              type="checkbox"
              disabled={busy}
              checked={confirmed}
              onChange={(e) => setConfirmed(e.target.checked)}
            />
            위 내용을 확인하고 검수용 실행에 동의합니다.
          </label>
          <button
            className="primary"
            disabled={busy || !confirmed}
            onClick={() => {
              void run(async () => {
                const session = await api<AppSessionView>(
                  "/preview-sessions",
                  "POST",
                  { versionId: version.id, confirmed },
                );
                setOpen(false);
                onLaunch(session);
              });
            }}
          >
            동의하고 검수 시작
          </button>
          {busy && (
            <p role="status">
              검수 실행 요청을 처리하고 있습니다. 결과가 표시될 때까지 기다려
              주세요.
            </p>
          )}
        </Modal>
      )}
    </>
  );
}

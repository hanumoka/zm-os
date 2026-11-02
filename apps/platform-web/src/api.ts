import type { UserView } from "@zm/platform-contracts";

let csrf = "";
const userMessages: Record<string, string> = {
  LOGIN_REQUIRED: "로그인이 필요합니다.",
  ACCOUNT_SUSPENDED: "이용이 정지된 계정입니다.",
  REAUTH_REQUIRED:
    "내 계정에서 로그인 수단으로 본인 확인을 다시 진행해 주세요.",
  CSRF_INVALID:
    "로그인 상태가 바뀌었습니다. 화면을 새로고침한 뒤 다시 시도해 주세요.",
  IDENTITY_IN_USE:
    "다른 계정에 연결된 로그인 수단입니다. 계정 합병은 지원하지 않습니다.",
  PROVIDER_ALREADY_LINKED: "이미 연결된 로그인 수단입니다.",
  DEVELOPER_REQUIRED: "개발자 승인을 받은 후 이용할 수 있습니다.",
  OWNER_REQUIRED: "앱 소유자만 처리할 수 있습니다.",
  CONSENT_REQUIRED: "앱의 이용 범위를 확인하고 다시 동의해 주세요.",
  APP_UNAVAILABLE: "지금은 이 앱을 실행할 수 없습니다.",
  NEW_LAUNCH_BLOCKED: "앱의 새 실행이 중지되었습니다.",
  SESSION_INACTIVE: "앱 실행 권한이 종료되었습니다.",
  REVISION_CONFLICT:
    "다른 작업으로 상태가 바뀌었습니다. 화면을 새로고침하여 현재 상태를 확인해 주세요.",
  VERSION_NOT_APPROVED: "검수에서 승인된 버전만 공개할 수 있습니다.",
  VERSION_NOT_READY: "아직 번들 검사가 끝나지 않았습니다.",
  PUBLICATION_BLOCKED: "앱 운영 상태를 확인한 후 공개할 수 있습니다.",
  OAUTH_NOT_CONFIGURED:
    "이 환경에는 실제 로그인 제공자 설정이 아직 준비되지 않았습니다.",
};
export function setCsrf(value: string): void {
  csrf = value;
}
/** Recheck cookie identity immediately before touching this device's data. */
export async function assertCurrentUser(expectedUserId: string): Promise<void> {
  const current = await api<UserView>("/me");
  if (current.id !== expectedUserId)
    throw new ApiError(
      409,
      "CURRENT_ACCOUNT_CHANGED",
      "로그인 계정이 바뀌어 삭제하지 않았습니다. 현재 계정의 화면을 확인해 주세요.",
    );
  if (current.status !== "active")
    throw new ApiError(403, "ACCOUNT_SUSPENDED", "이용이 정지된 계정입니다.");
  if (current.requiresReauth)
    throw new ApiError(
      403,
      "REAUTH_REQUIRED",
      "내 계정에서 로그인 수단으로 본인 확인을 다시 진행해 주세요.",
    );
}
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly code: string,
    message: string,
  ) {
    super(message);
  }
}
export async function api<T>(
  path: string,
  method = "GET",
  body?: unknown,
  secret?: string,
): Promise<T> {
  const headers: Record<string, string> = { Accept: "application/json" };
  if (csrf && method !== "GET") headers["X-CSRF-Token"] = csrf;
  if (secret) headers.Authorization = `Bearer ${secret}`;
  if (body !== undefined)
    headers["Content-Type"] =
      body instanceof File ? "application/zip" : "application/json";
  const response = await fetch(`/v1${path}`, {
    method,
    headers,
    credentials: "same-origin",
    body:
      body === undefined
        ? undefined
        : body instanceof File
          ? body
          : JSON.stringify(body),
    signal: AbortSignal.timeout(15000),
  });
  const data: unknown = await response.json().catch(() => null);
  if (!response.ok) {
    const error = data as { code?: string; message?: string } | null;
    throw new ApiError(
      response.status,
      error?.code ?? "REQUEST_FAILED",
      userMessages[error?.code ?? ""] ??
        (typeof error?.message === "string"
          ? error.message
          : `요청을 처리하지 못했습니다 (${response.status}).`),
    );
  }
  return data as T;
}
export function errorMessage(error: unknown): string {
  if (
    error instanceof TypeError ||
    (error instanceof Error &&
      ["AbortError", "TimeoutError"].includes(error.name))
  )
    return "서버의 응답을 확인하지 못했습니다. 연결과 처리 상태를 확인한 뒤 다시 시도해 주세요.";
  return error instanceof Error
    ? error.message
    : "요청을 처리하지 못했습니다. 다시 시도해 주세요.";
}

export type NavigationDecision =
  | "allow"
  | "deny"
  | "missing-frame"
  | "auth-menu"
  | "auth-start"
  | "auth-failed";
export interface NavigationContext {
  origin: string;
  assetOrigin: string;
  nonce?: string;
  preparing: boolean;
}
export function navigationDecision(
  urlValue: string,
  isTopFrame: unknown,
  context: NavigationContext,
): NavigationDecision {
  if (typeof isTopFrame !== "boolean") return "missing-frame";
  let url: URL;
  try {
    url = new URL(urlValue);
  } catch {
    return "deny";
  }
  if (!isTopFrame)
    return url.origin === context.assetOrigin || url.href === "about:blank"
      ? "allow"
      : "deny";
  if (url.href === "about:blank") return "allow";
  if (url.origin !== context.origin) return "deny";
  const matchesAttempt =
    context.preparing &&
    context.nonce !== undefined &&
    url.hash === `#native=${context.nonce}`;
  if (matchesAttempt && url.pathname === "/native-auth-failed")
    return "auth-failed";
  if (
    matchesAttempt &&
    url.pathname === "/v1/auth/native/start" &&
    /^[A-Za-z0-9_-]{20,200}$/.test(url.searchParams.get("ticket") ?? "")
  )
    return "auth-start";
  if (
    /^\/v1\/auth\/(google|github)\/start$/.test(url.pathname) ||
    ["/v1/auth/native/start", "/native-auth-failed"].includes(url.pathname)
  )
    return "auth-menu";
  return "allow";
}

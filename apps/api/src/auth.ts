import { randomUUID, createHash } from "node:crypto";
import type { PoolClient } from "pg";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Config } from "./config.js";
import { one, audit } from "./db.js";
import { ensure, hash, secret, cookie, equal } from "./common.js";

export interface Actor {
  id: string;
  status: string;
  operator: boolean;
  developer: boolean;
  sessionHash: string;
  csrf: string;
  reauthAt: Date;
  reauthProvider: string;
  restricted: boolean;
}
export async function revokePendingIdentityProofs(db:PoolClient,userId:string):Promise<void>{
  await db.query('DELETE FROM native_starts WHERE user_id=$1',[userId]);
  await db.query('DELETE FROM native_codes WHERE user_id=$1',[userId]);
  await db.query('DELETE FROM native_bootstraps WHERE user_id=$1',[userId]);
  await db.query('DELETE FROM oauth_states WHERE user_id=$1',[userId]);
}
export async function actor(
  db: PoolClient,
  req: Request,
  allowSuspended = false,
): Promise<Actor> {
  const sessionHash = hash(cookie(req, "zm_session"));
  const result = await actorByHash(db, sessionHash, allowSuspended);
  if (!["GET", "HEAD", "OPTIONS"].includes(req.method))
    ensure(
      equal(String(req.headers["x-csrf-token"] ?? ""), result.csrf),
      403,
      "CSRF_INVALID",
    );
  return result;
}
export async function actorByHash(
  db: PoolClient,
  sessionHash: string,
  allowSuspended = false,
): Promise<Actor> {
  const row = await one<{
    id: string;
    status: string;
    operator: boolean;
    csrf: string;
    reauth_at: Date;
    reauth_provider: string;
    developer: boolean;
    restricted: boolean;
  }>(
    db,
    "SELECT u.id,u.status,u.operator,s.csrf,s.reauth_at,s.reauth_provider,s.restricted,COALESCE(d.status='approved',false) AS developer FROM web_sessions s JOIN users u ON u.id=s.user_id LEFT JOIN developers d ON d.user_id=u.id WHERE s.hash=$1 AND s.expires_at>now()",
    [sessionHash],
  );
  ensure(
    row && row.status !== "withdrawn",
    401,
    "LOGIN_REQUIRED",
    "로그인이 필요합니다.",
  );
  ensure(
    row.status === "active" || allowSuspended,
    403,
    "ACCOUNT_SUSPENDED",
    "이용이 정지된 계정입니다.",
  );
  ensure(
    !row.restricted || allowSuspended,
    403,
    "REAUTH_REQUIRED",
    "다시 로그인해야 합니다.",
  );
  return {
    id: row.id,
    status: row.status,
    operator: row.operator,
    developer: row.developer,
    csrf: row.csrf,
    sessionHash,
    reauthAt: row.reauth_at,
    reauthProvider: row.reauth_provider,
    restricted: row.restricted,
  };
}
export async function userView(db: PoolClient, a: Actor): Promise<object> {
  const providers = (
    await db.query<{ provider: string }>(
      "SELECT provider FROM identities WHERE user_id=$1 ORDER BY provider",
      [a.id],
    )
  ).rows.map((r) => r.provider);
  return {
    id: a.id,
    status: a.status,
    operator: a.operator,
    developer: a.developer,
    providers,
    csrf: a.csrf,
    requiresReauth: a.restricted,
  };
}
export async function issueSession(
  db: PoolClient,
  userId: string,
  provider: string,
  res: Response,
  cfg: Config,
  previousHash?: string,
): Promise<void> {
  const user = await one<{ status: string }>(
    db,
    "SELECT status FROM users WHERE id=$1",
    [userId],
  );
  ensure(user && user.status !== "withdrawn", 401, "ACCOUNT_UNAVAILABLE");
  ensure(
    await one(db, "SELECT 1 FROM identities WHERE user_id=$1 AND provider=$2", [
      userId,
      provider,
    ]),
    401,
    "IDENTITY_UNAVAILABLE",
  );
  if (previousHash) {
    await db.query(
      "UPDATE app_sessions SET status='revoked' WHERE web_hash=$1",
      [previousHash],
    );
    await db.query("DELETE FROM web_sessions WHERE hash=$1", [previousHash]);
  }
  const token = secret();
  await db.query(
    "INSERT INTO web_sessions(hash,user_id,csrf,expires_at,reauth_provider,restricted) VALUES($1,$2,$3,now()+$4*interval '1 second',$5,$6)",
    [
      hash(token),
      userId,
      secret(),
      cfg.sessionSeconds,
      provider,
      user.status !== "active",
    ],
  );
  res.cookie("zm_session", token, {
    httpOnly: true,
    sameSite: "lax",
    secure: cfg.webOrigin.startsWith("https:"),
    maxAge: cfg.sessionSeconds * 1000,
    path: "/",
  });
}
export async function resolveIdentity(
  db: PoolClient,
  provider: string,
  subject: string,
  ageConfirmed: boolean,
  operator = false,
): Promise<string> {
  const identity = await one<{ user_id: string; status: string }>(
    db,
    "SELECT i.user_id,u.status FROM identities i JOIN users u ON u.id=i.user_id WHERE i.provider=$1 AND i.subject=$2",
    [provider, subject],
  );
  if (identity && identity.status !== "withdrawn") return identity.user_id;
  ensure(
    ageConfirmed,
    409,
    "ENROLLMENT_REQUIRED",
    "만 19세 이상 자가 확인이 필요합니다.",
  );
  if (identity)
    await db.query("DELETE FROM identities WHERE provider=$1 AND subject=$2", [
      provider,
      subject,
    ]);
  const id = randomUUID();
  await db.query(
    "INSERT INTO users(id,status,operator) VALUES($1,'active',$2)",
    [id, operator],
  );
  await db.query(
    "INSERT INTO identities(provider,subject,user_id) VALUES($1,$2,$3)",
    [provider, subject, id],
  );
  await audit(db, id, "user.enrolled", id, { provider, ageAttested: true });
  return id;
}
export function recentAuth(a: Actor): void {
  ensure(
    Date.now() - a.reauthAt.getTime() < 5 * 60_000,
    403,
    "REAUTH_REQUIRED",
    "최근 인증이 필요합니다.",
  );
}
export async function linkIdentity(
  db: PoolClient,
  a: Actor,
  provider: string,
  subject: string,
): Promise<void> {
  recentAuth(a);
  const existing = await one<{ user_id: string }>(
    db,
    "SELECT user_id FROM identities WHERE provider=$1 AND subject=$2",
    [provider, subject],
  );
  ensure(
    !existing || existing.user_id === a.id,
    409,
    "IDENTITY_IN_USE",
    "다른 계정에 연결되어 있어 합병하지 않습니다.",
  );
  const own = await one<{ subject: string }>(
    db,
    "SELECT subject FROM identities WHERE provider=$1 AND user_id=$2",
    [provider, a.id],
  );
  ensure(!own || own.subject === subject, 409, "PROVIDER_ALREADY_LINKED");
  await db.query(
    "INSERT INTO identities(provider,subject,user_id) VALUES($1,$2,$3) ON CONFLICT DO NOTHING",
    [provider, subject, a.id],
  );
  await audit(db, a.id, "identity.linked", a.id, { provider });
}
export const testLoginSchema = z
  .object({
    subject: z.enum(["owner", "alice", "bob"]),
    provider: z.enum(["google", "github"]),
    ageConfirmed: z.boolean(),
  })
  .strict();
export interface OAuthState {
  provider: string;
  intent: string;
  user_id: string | null;
  session_hash: string | null;
  verifier: string;
  native_challenge: string | null;
}
export async function nativeReturn(
  db: PoolClient,
  userId: string,
  provider: string,
  challengeValue: string,
  sourceSession?: string,
): Promise<string> {
  const identity = await one<{ subject: string }>(
    db,
    "SELECT subject FROM identities WHERE user_id=$1 AND provider=$2",
    [userId, provider],
  );
  ensure(identity, 401, "IDENTITY_UNAVAILABLE");
  const code = secret();
  await db.query(
    "INSERT INTO native_codes(hash,user_id,provider,challenge,provider_subject,source_session,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '60 seconds')",
    [
      hash(code),
      userId,
      provider,
      challengeValue,
      identity.subject,
      sourceSession ?? null,
    ],
  );
  return `zmos://auth?code=${encodeURIComponent(code)}`;
}
export async function nativeBinding(
  db: PoolClient,
  entry: {
    user_id: string;
    provider: string;
    provider_subject: string | null;
    source_session: string | null;
  },
): Promise<void> {
  ensure(
    await one(
      db,
      "SELECT 1 FROM identities WHERE user_id=$1 AND provider=$2 AND subject=$3",
      [entry.user_id, entry.provider, entry.provider_subject],
    ),
    401,
    "IDENTITY_UNAVAILABLE",
  );
  if (entry.source_session) {
    const original = await actorByHash(db, entry.source_session, true);
    ensure(original.id === entry.user_id, 401, "NATIVE_SESSION_CHANGED");
  }
}
export function providerConfig(
  provider: string,
  cfg: Config,
): {
  clientId: string;
  clientSecret: string;
  callback: string;
  authorize: string;
  token: string;
} {
  ensure(["google", "github"].includes(provider), 404, "NOT_FOUND");
  const clientId = process.env[`${provider.toUpperCase()}_CLIENT_ID`];
  const clientSecret = process.env[`${provider.toUpperCase()}_CLIENT_SECRET`];
  ensure(
    clientId && clientSecret,
    503,
    "OAUTH_NOT_CONFIGURED",
    "실제 인증 제공자 설정이 아직 없습니다. 모의 시험과 구분합니다.",
  );
  return {
    clientId,
    clientSecret,
    callback: `${cfg.webOrigin}/v1/auth/${provider}/callback`,
    authorize:
      provider === "google"
        ? "https://accounts.google.com/o/oauth2/v2/auth"
        : "https://github.com/login/oauth/authorize",
    token:
      provider === "google"
        ? "https://oauth2.googleapis.com/token"
        : "https://github.com/login/oauth/access_token",
  };
}
export async function oauthSubject(
  provider: string,
  code: string,
  verifier: string,
  cfg: Config,
): Promise<string> {
  const p = providerConfig(provider, cfg);
  const response = await fetch(p.token, {
    method: "POST",
    headers: {
      accept: "application/json",
      "content-type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      client_id: p.clientId,
      client_secret: p.clientSecret,
      code,
      code_verifier: verifier,
      redirect_uri: p.callback,
      grant_type: "authorization_code",
    }),
    signal: AbortSignal.timeout(10_000),
  });
  ensure(response.ok, 502, "PROVIDER_FAILED");
  const data = z
    .object({ access_token: z.string().min(1) })
    .parse(await response.json());
  const identity = await fetch(
    provider === "google"
      ? "https://openidconnect.googleapis.com/v1/userinfo"
      : "https://api.github.com/user",
    {
      headers: {
        Authorization: `Bearer ${data.access_token}`,
        Accept: "application/json",
        "User-Agent": "zm-os-local-trial",
      },
      signal: AbortSignal.timeout(10_000),
    },
  );
  ensure(identity.ok, 502, "PROVIDER_FAILED");
  const value: unknown = await identity.json();
  return provider === "google"
    ? z.object({ sub: z.string().min(1) }).parse(value).sub
    : String(z.object({ id: z.number().int().positive() }).parse(value).id);
}
export function challenge(verifier: string): string {
  return createHash("sha256").update(verifier).digest("base64url");
}

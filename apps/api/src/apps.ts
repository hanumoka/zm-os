import { randomUUID, createHmac } from "node:crypto";
import type { PoolClient } from "pg";
import type { Request } from "express";
import type {
  AppManifest,
  AppSessionView,
  AppView,
} from "@zm/platform-contracts";
import { z } from "zod";
import { audit, one } from "./db.js";
import { ensure, hash, secret, equal } from "./common.js";
import { challenge, type Actor } from "./auth.js";
import type { Config } from "./config.js";

export interface AppRow {
  id: string;
  owner_id: string;
  name: string;
  published: boolean;
  availability: string;
  current_version_id: string | null;
  revision: number;
  closure: string;
}
export interface VersionRow {
  id: string;
  app_id: string;
  manifest: AppManifest;
  consent_hash: string;
  validation_status: string;
  review_status: string;
}
export interface SessionRow {
  id: string;
  user_id: string;
  app_id: string;
  app_user_id: string;
  version_id: string;
  fingerprint: string;
  status: string;
  expires_at: Date;
  manifest: AppManifest;
  is_preview: boolean;
}
export async function requireApp(db: PoolClient, id: string): Promise<AppRow> {
  const app = await one<AppRow>(
    db,
    "SELECT * FROM apps WHERE id=$1 FOR UPDATE",
    [id],
  );
  ensure(app, 404, "APP_NOT_FOUND");
  return app;
}
export async function owned(
  db: PoolClient,
  id: string,
  a: Actor,
  requireDeveloper = true,
): Promise<AppRow> {
  const app = await requireApp(db, id);
  ensure(app.owner_id === a.id, 403, "OWNER_REQUIRED");
  if (requireDeveloper) ensure(a.developer, 403, "DEVELOPER_REQUIRED");
  return app;
}
export async function currentVersion(
  db: PoolClient,
  app: AppRow,
  launch = false,
): Promise<VersionRow> {
  ensure(
    app.current_version_id && app.closure !== "closed",
    404,
    "APP_UNAVAILABLE",
  );
  if (launch)
    ensure(
      app.published && app.availability === "allowed",
      403,
      "NEW_LAUNCH_BLOCKED",
    );
  const version = await one<VersionRow>(
    db,
    "SELECT * FROM versions WHERE id=$1 AND app_id=$2",
    [app.current_version_id, app.id],
  );
  ensure(
    version?.validation_status === "passed" &&
      version.review_status === "approved",
    404,
    "RELEASE_NOT_READY",
  );
  return version;
}
export async function store(
  db: PoolClient,
  q = "",
  category = "",
  userId?: string,
  appId?: string,
): Promise<AppView[]> {
  const available =
    "(a.published AND a.availability='allowed' AND a.closure<>'closed' AND v.validation_status='passed' AND v.review_status='approved')";
  const rows = (
    await db.query<{ id: string; manifest: AppManifest; available: boolean }>(
      `SELECT a.id,v.manifest,${available} AS available FROM apps a JOIN versions v ON v.id=a.current_version_id WHERE ($3::uuid IS NOT NULL OR ${available}) AND ($1='' OR strpos(lower(v.manifest->>'name'),lower($1))>0 OR strpos(lower(v.manifest->>'description'),lower($1))>0) AND ($2='' OR v.manifest->>'category'=$2) AND ($3::uuid IS NULL OR EXISTS(SELECT 1 FROM my_apps m WHERE m.app_id=a.id AND m.user_id=$3)) AND ($4::uuid IS NULL OR a.id=$4) ORDER BY v.manifest->>'name' LIMIT 200`,
      [q.slice(0, 100), category, userId ?? null, appId ?? null],
    )
  ).rows;
  return rows.map((r) => ({
    id: r.id,
    name: r.manifest.name,
    description: r.manifest.description,
    category: r.manifest.category,
    version: r.manifest.version,
    manifest: r.manifest,
    available: r.available,
    ...(!r.available
      ? { unavailableReason: "현재 새 실행을 할 수 없는 앱입니다." }
      : {}),
  }));
}
export async function validSession(
  db: PoolClient,
  id: string,
  userId?: string,
): Promise<SessionRow> {
  const session = await one<SessionRow>(
    db,
    `SELECT s.*,v.manifest FROM app_sessions s JOIN versions v ON v.id=s.version_id JOIN users u ON u.id=s.user_id JOIN apps a ON a.id=s.app_id LEFT JOIN consents c ON c.user_id=s.user_id AND c.app_id=s.app_id JOIN web_sessions w ON w.hash=s.web_hash WHERE s.id=$1 AND s.status='active' AND s.expires_at>now() AND w.expires_at>now() AND NOT w.restricted AND u.status='active' AND a.availability<>'emergency_suspended' AND a.closure<>'closed' AND ((NOT s.is_preview AND c.revoked_at IS NULL AND c.fingerprint=s.fingerprint) OR (s.is_preview AND (u.operator OR a.owner_id=u.id)))`,
    [id],
  );
  ensure(
    session && (!userId || session.user_id === userId),
    403,
    "SESSION_INACTIVE",
    "실행 권한이 종료되었습니다.",
  );
  return session;
}
export function documentGrant(session: SessionRow, cfg: Config): string {
  const expires = Math.floor(session.expires_at.getTime() / 1000);
  const payload = `${session.id}:${session.version_id}:${expires}`;
  return `${expires}.${createHmac("sha256", cfg.assetSecret).update(payload).digest("base64url")}`;
}
export function sessionView(session: SessionRow, cfg: Config): AppSessionView {
  return {
    id: session.id,
    appId: session.app_id,
    appUserId: session.app_user_id,
    versionId: session.version_id,
    expiresAt: session.expires_at.toISOString(),
    manifest: session.manifest,
    isPreview: session.is_preview,
    documentUrl: `${cfg.assetOrigin}/apps/${session.id}/${session.version_id}/${documentGrant(session, cfg)}/index.html?instance=${session.id}`,
  };
}
export async function launch(
  db: PoolClient,
  a: Actor,
  appId: string,
  cfg: Config,
): Promise<AppSessionView> {
  const app = await requireApp(db, appId);
  const version = await currentVersion(db, app, true);
  const consent = await one(
    db,
    "SELECT 1 FROM consents WHERE user_id=$1 AND app_id=$2 AND fingerprint=$3 AND revoked_at IS NULL",
    [a.id, appId, version.consent_hash],
  );
  ensure(consent, 409, "CONSENT_REQUIRED");
  await db.query(
    "INSERT INTO app_users(id,user_id,app_id) VALUES($1,$2,$3) ON CONFLICT(user_id,app_id,is_preview) DO NOTHING",
    [randomUUID(), a.id, appId],
  );
  const appUser = await one<{ id: string }>(
    db,
    "SELECT id FROM app_users WHERE user_id=$1 AND app_id=$2 AND NOT is_preview",
    [a.id, appId],
  );
  ensure(appUser, 500, "APP_USER_MISSING");
  const id = randomUUID();
  await db.query(
    "INSERT INTO app_sessions(id,user_id,web_hash,app_id,app_user_id,version_id,fingerprint,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+$8*interval '1 second')",
    [
      id,
      a.id,
      a.sessionHash,
      appId,
      appUser.id,
      version.id,
      version.consent_hash,
      cfg.sessionSeconds,
    ],
  );
  await audit(db, a.id, "app.launched", appId, {
    sessionId: id,
    versionId: version.id,
  });
  return sessionView(await validSession(db, id, a.id), cfg);
}
export async function preview(
  db: PoolClient,
  a: Actor,
  versionId: string,
  cfg: Config,
): Promise<AppSessionView> {
  const version = await one<VersionRow>(
    db,
    "SELECT * FROM versions WHERE id=$1",
    [versionId],
  );
  ensure(version, 404, "VERSION_NOT_FOUND");
  const app = await requireApp(db, version.app_id);
  ensure(a.operator || a.id === app.owner_id, 404, "VERSION_NOT_FOUND");
  ensure(version.validation_status === "passed", 409, "VERSION_NOT_READY");
  ensure(
    app.availability !== "emergency_suspended" && app.closure !== "closed",
    409,
    "PREVIEW_BLOCKED",
  );
  await db.query(
    "INSERT INTO app_users(id,user_id,app_id,is_preview) VALUES($1,$2,$3,true) ON CONFLICT(user_id,app_id,is_preview) DO NOTHING",
    [randomUUID(), a.id, app.id],
  );
  const appUser = await one<{ id: string }>(
    db,
    "SELECT id FROM app_users WHERE user_id=$1 AND app_id=$2 AND is_preview",
    [a.id, app.id],
  );
  ensure(appUser, 500, "APP_USER_MISSING");
  const id = randomUUID();
  await db.query(
    "INSERT INTO app_sessions(id,user_id,web_hash,app_id,app_user_id,version_id,fingerprint,expires_at,is_preview) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '15 minutes',true)",
    [
      id,
      a.id,
      a.sessionHash,
      app.id,
      appUser.id,
      version.id,
      version.consent_hash,
    ],
  );
  await audit(db, a.id, "version.previewed", version.id, {
    permissions: version.manifest.permissions,
    notice: version.consent_hash,
  });
  return sessionView(await validSession(db, id, a.id), cfg);
}
export async function appCredential(
  db: PoolClient,
  req: Request,
): Promise<string> {
  const header = req.headers.authorization ?? "";
  ensure(header.startsWith("Basic "), 401, "APP_CREDENTIAL_REQUIRED");
  const decoded = Buffer.from(header.slice(6), "base64").toString("utf8");
  const colon = decoded.indexOf(":");
  ensure(colon > 0, 401, "APP_CREDENTIAL_INVALID");
  const id = z.string().uuid().safeParse(decoded.slice(0, colon));
  ensure(id.success, 401, "APP_CREDENTIAL_INVALID");
  const value = await one<{ hash: string }>(
    db,
    "SELECT hash FROM app_credentials WHERE app_id=$1",
    [id.data],
  );
  ensure(
    value && equal(value.hash, hash(decoded.slice(colon + 1))),
    401,
    "APP_CREDENTIAL_INVALID",
  );
  return id.data;
}
export async function exchange(
  db: PoolClient,
  req: Request,
  cfg: Config,
): Promise<object> {
  const appId = await appCredential(db, req);
  const data = z
    .object({
      code: z.string().min(20).max(200),
      verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
    })
    .strict()
    .parse(req.body);
  const code = await one<{ session_id: string; challenge: string }>(
    db,
    "SELECT session_id,challenge FROM auth_codes WHERE hash=$1 AND expires_at>now() FOR UPDATE",
    [hash(data.code)],
  );
  ensure(
    code && equal(code.challenge, challenge(data.verifier)),
    401,
    "CODE_INVALID",
  );
  const session = await validSession(db, code.session_id);
  ensure(session.app_id === appId, 401, "CODE_INVALID");
  await db.query("DELETE FROM auth_codes WHERE hash=$1", [hash(data.code)]);
  const token = secret();
  const expiresAt = new Date(
    Math.min(
      session.expires_at.getTime(),
      Date.now() + cfg.sessionSeconds * 1000,
    ),
  );
  await db.query(
    "INSERT INTO app_tokens(hash,session_id,expires_at) VALUES($1,$2,$3)",
    [hash(token), session.id, expiresAt],
  );
  return {
    token,
    appUserId: session.app_user_id,
    expiresAt: expiresAt.toISOString(),
    isPreview: session.is_preview,
  };
}
export async function introspect(
  db: PoolClient,
  req: Request,
): Promise<object> {
  const appId = await appCredential(db, req);
  const data = z
    .object({ token: z.string().max(200) })
    .strict()
    .parse(req.body);
  const token = await one<{ session_id: string }>(
    db,
    "SELECT t.session_id FROM app_tokens t JOIN app_sessions s ON s.id=t.session_id WHERE t.hash=$1 AND t.expires_at>now() AND s.app_id=$2",
    [hash(data.token), appId],
  );
  if (!token) return { active: false };
  try {
    const session = await validSession(db, token.session_id);
    return {
      active: true,
      appUserId: session.app_user_id,
      isPreview: session.is_preview,
    };
  } catch {
    return { active: false };
  }
}

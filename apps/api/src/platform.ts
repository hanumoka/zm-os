import { randomUUID } from "node:crypto";
import { mkdir, writeFile, unlink, readFile } from "node:fs/promises";
import { join } from "node:path";
import type { PoolClient } from "pg";
import type { Request, Response } from "express";
import { z } from "zod";
import { validateZip } from "@zm/cli";
import { TEST_LIMITS } from "@zm/platform-contracts";
import { Database, one, audit } from "./db.js";
import type { Config } from "./config.js";
import {
  ApiError,
  ensure,
  hash,
  secret,
  cookie,
  equal,
  idSchema,
  reasonSchema,
  camel,
  fingerprint,
} from "./common.js";
import {
  actor,
  actorByHash,
  userView,
  issueSession,
  resolveIdentity,
  linkIdentity,
  recentAuth,
  testLoginSchema,
  providerConfig,
  oauthSubject,
  challenge,
  nativeReturn,
  nativeBinding,
  revokePendingIdentityProofs,
  type OAuthState,
} from "./auth.js";
import {
  store,
  requireApp,
  owned,
  currentVersion,
  launch,
  preview,
  validSession,
  sessionView,
  exchange,
  introspect,
} from "./apps.js";

const reviewSchema = z
  .object({
    decision: z.enum(["approved", "changes_requested", "rejected"]),
    reason: reasonSchema,
  })
  .strict();
const applicationSchema = z
  .object({
    displayName: z.string().trim().min(1).max(60),
    email: z.string().email().max(200),
    description: reasonSchema,
  })
  .strict();
const revisionSchema = z.number().int().nonnegative();
export class Platform {
  constructor(
    readonly db: Database,
    readonly cfg: Config,
  ) {}
  async handle(req: Request, res: Response): Promise<unknown> {
    const path = req.path.replace(/^\/v1/, "").replace(/\/$/, "") || "/";
    const files: string[] = [];
    try {
      return await this.db.transaction(async (db) =>
        this.route(db, req, res, path, files),
      );
    } catch (error) {
      for (const file of files) await unlink(file).catch(() => undefined);
      throw error;
    }
  }
  private async route(
    db: PoolClient,
    req: Request,
    res: Response,
    path: string,
    files: string[],
  ): Promise<unknown> {
    const method = req.method;
    const body: unknown = req.body;
    const segments = path.split("/").filter(Boolean);
    const redirect = (url: string, status = 302): void => {
      res.locals.redirect = url;
      res.locals.redirectStatus = status;
    };
    const setSession = (userId: string, provider: string): Promise<void> =>
      issueSession(
        db,
        userId,
        provider,
        res,
        this.cfg,
        hash(cookie(req, "zm_session")),
      );
    const at = (n: number): string => idSchema.parse(segments[n]);
    if (method === "GET" && path === "/health")
      return { ok: true, mode: "local-test", testAuth: this.cfg.testAuth };
    if (method === "POST" && path === "/auth/native/exchange") {
      const data = z
        .object({
          code: z.string().max(200),
          verifier: z.string().regex(/^[A-Za-z0-9._~-]{43,128}$/),
        })
        .strict()
        .parse(body);
      const entry = await one<{
        user_id: string;
        provider: string;
        challenge: string;
        provider_subject: string | null;
        source_session: string | null;
      }>(
        db,
        "SELECT * FROM native_codes WHERE hash=$1 AND expires_at>now() FOR UPDATE",
        [hash(data.code)],
      );
      ensure(
        entry && equal(entry.challenge, challenge(data.verifier)),
        401,
        "NATIVE_CODE_INVALID",
      );
      await nativeBinding(db, entry);
      await db.query("DELETE FROM native_codes WHERE hash=$1", [
        hash(data.code),
      ]);
      const ticket = secret();
      await db.query(
        "INSERT INTO native_bootstraps(hash,user_id,provider,provider_subject,source_session,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '60 seconds')",
        [
          hash(ticket),
          entry.user_id,
          entry.provider,
          entry.provider_subject,
          entry.source_session,
        ],
      );
      return { bootstrapTicket: ticket };
    }
    if (method === "POST" && path === "/auth/native/bootstrap") {
      const data = z
        .object({ ticket: z.string().max(200) })
        .strict()
        .parse(body);
      const entry = await one<{
        user_id: string;
        provider: string;
        provider_subject: string | null;
        source_session: string | null;
      }>(
        db,
        "DELETE FROM native_bootstraps WHERE hash=$1 AND expires_at>now() RETURNING *",
        [hash(data.ticket)],
      );
      ensure(entry, 401, "BOOTSTRAP_INVALID");
      await nativeBinding(db, entry);
      const user = await one<{ status: string }>(
        db,
        "SELECT status FROM users WHERE id=$1",
        [entry.user_id],
      );
      ensure(user && user.status !== "withdrawn", 401, "ACCOUNT_UNAVAILABLE");
      await setSession(entry.user_id, entry.provider);
      redirect(this.cfg.webOrigin, 303);
      return undefined;
    }
    if (path.startsWith("/test/")) {
      ensure(this.cfg.testAuth, 404, "NOT_FOUND");
      ensure(
        !req.headers.origin || req.headers.origin === this.cfg.webOrigin,
        403,
        "ORIGIN_DENIED",
      );
      if (method === "POST" && path === "/test/login") {
        const data = testLoginSchema.parse(body);
        const id = await resolveIdentity(
          db,
          data.provider,
          `trial:${data.subject}`,
          data.ageConfirmed,
          data.subject === "owner",
        );
        const user = await one<{ status: string }>(
          db,
          "SELECT status FROM users WHERE id=$1",
          [id],
        );
        ensure(user?.status === "active", 403, "ACCOUNT_SUSPENDED");
        await setSession(id, data.provider);
        return { ok: true };
      }
    }
    if (method === "GET" && path === "/auth/native/start") {
      const ticket = z.string().min(20).max(200).parse(req.query.ticket);
      const entry = await one<{
        user_id: string;
        session_hash: string;
        provider: string;
        intent: string;
        challenge: string;
      }>(
        db,
        "DELETE FROM native_starts WHERE hash=$1 AND expires_at>now() RETURNING *",
        [hash(ticket)],
      );
      ensure(entry, 401, "NATIVE_START_INVALID");
      const a = await actorByHash(
        db,
        entry.session_hash,
        entry.intent === "reauth",
      );
      ensure(a.id === entry.user_id, 401, "NATIVE_START_INVALID");
      const providerCfg = providerConfig(entry.provider, this.cfg),
        state = secret(),
        verifier = secret();
      await db.query(
        "INSERT INTO oauth_states(hash,provider,intent,user_id,session_hash,verifier,native_challenge,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes')",
        [
          hash(state),
          entry.provider,
          entry.intent,
          a.id,
          a.sessionHash,
          verifier,
          entry.challenge,
        ],
      );
      res.cookie("zm_oauth", state, {
        httpOnly: true,
        sameSite: "lax",
        secure: this.cfg.webOrigin.startsWith("https:"),
        maxAge: 300000,
        path: "/v1/auth",
      });
      const url = new URL(providerCfg.authorize);
      url.search = new URLSearchParams({
        client_id: providerCfg.clientId,
        redirect_uri: providerCfg.callback,
        response_type: "code",
        scope: entry.provider === "google" ? "openid" : "read:user",
        state,
        code_challenge: challenge(verifier),
        code_challenge_method: "S256",
        ...(entry.intent === "reauth" && entry.provider === "google"
          ? { prompt: "select_account" }
          : {}),
      }).toString();
      redirect(url.toString());
      return undefined;
    }
    if (method === "GET" && segments[0] === "auth") {
      const provider = z.enum(["google", "github"]).parse(segments[1]);
      const providerCfg = providerConfig(provider, this.cfg);
      if (segments[2] === "start") {
        const intent = z
          .enum(["signin", "link", "reauth"])
          .parse(req.query.intent ?? "signin");
        const nativeChallenge =
          req.query.platform === "android"
            ? z
                .string()
                .regex(/^[A-Za-z0-9_-]{43}$/)
                .parse(req.query.challenge)
            : null;
        if (nativeChallenge) {
          ensure(
            req.query.redirectUri === "zmos://auth",
            400,
            "REDIRECT_NOT_ALLOWED",
          );
          ensure(intent === "signin", 409, "NATIVE_LINK_NOT_READY");
        }
        const a =
          intent !== "signin"
            ? await actor(db, req, intent === "reauth")
            : null;
        const state = secret(),
          verifier = secret();
        await db.query(
          "INSERT INTO oauth_states(hash,provider,intent,user_id,session_hash,verifier,native_challenge,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,now()+interval '5 minutes')",
          [
            hash(state),
            provider,
            intent,
            a?.id ?? null,
            a?.sessionHash ?? null,
            verifier,
            nativeChallenge,
          ],
        );
        res.cookie("zm_oauth", state, {
          httpOnly: true,
          sameSite: "lax",
          secure: this.cfg.webOrigin.startsWith("https:"),
          maxAge: 300000,
          path: "/v1/auth",
        });
        const url = new URL(providerCfg.authorize);
        url.search = new URLSearchParams({
          client_id: providerCfg.clientId,
          redirect_uri: providerCfg.callback,
          response_type: "code",
          scope: provider === "google" ? "openid" : "read:user",
          state,
          code_challenge: challenge(verifier),
          code_challenge_method: "S256",
          ...(intent === "reauth" && provider === "google"
            ? { prompt: "select_account" }
            : {}),
        }).toString();
        redirect(url.toString());
        return undefined;
      }
      if (segments[2] === "callback") {
        const state = z.string().min(20).max(200).parse(req.query.state);
        ensure(
          equal(cookie(req, "zm_oauth"), state),
          401,
          "OAUTH_STATE_INVALID",
        );
        const entry = await one<OAuthState>(
          db,
          "DELETE FROM oauth_states WHERE hash=$1 AND provider=$2 AND expires_at>now() RETURNING *",
          [hash(state), provider],
        );
        ensure(entry, 401, "OAUTH_STATE_INVALID");
        const subject = await oauthSubject(
          provider,
          z.string().max(2048).parse(req.query.code),
          entry.verifier,
          this.cfg,
        );
        res.clearCookie("zm_oauth", { path: "/v1/auth" });
        if (entry.intent !== "signin") {
          const a = entry.native_challenge
            ? await actorByHash(
                db,
                entry.session_hash ?? "",
                entry.intent === "reauth",
              )
            : await actor(db, req, entry.intent === "reauth");
          ensure(
            a.id === entry.user_id && a.sessionHash === entry.session_hash,
            401,
            "OAUTH_SESSION_CHANGED",
          );
          if (entry.intent === "link")
            await linkIdentity(db, a, provider, subject);
          else {
            const identity = await one(
              db,
              "SELECT 1 FROM identities WHERE provider=$1 AND subject=$2 AND user_id=$3",
              [provider, subject, a.id],
            );
            ensure(identity, 403, "REAUTH_IDENTITY_MISMATCH");
            await db.query(
              "UPDATE web_sessions SET reauth_at=now(),reauth_provider=$1 WHERE hash=$2",
              [provider, a.sessionHash],
            );
            if (
              a.restricted &&
              a.status === "active" &&
              !entry.native_challenge
            )
              await setSession(a.id, provider);
          }
          redirect(
            entry.native_challenge
              ? await nativeReturn(
                  db,
                  a.id,
                  provider,
                  entry.native_challenge,
                  a.sessionHash,
                )
              : `${this.cfg.webOrigin}/?auth=complete`,
          );
          return undefined;
        }
        const identity = await one<{ user_id: string; status: string }>(
          db,
          "SELECT i.user_id,u.status FROM identities i JOIN users u ON u.id=i.user_id WHERE provider=$1 AND subject=$2",
          [provider, subject],
        );
        if (!identity || identity.status === "withdrawn") {
          const proof = secret();
          await db.query(
            "INSERT INTO enrollment_proofs(hash,provider,subject,native_challenge,expires_at) VALUES($1,$2,$3,$4,now()+interval '5 minutes')",
            [hash(proof), provider, subject, entry.native_challenge],
          );
          res.cookie("zm_enrollment", proof, {
            httpOnly: true,
            sameSite: "strict",
            secure: this.cfg.webOrigin.startsWith("https:"),
            maxAge: 300000,
            path: "/v1/enrollment",
          });
          redirect(`${this.cfg.webOrigin}/?enrollment=required`);
          return undefined;
        }
        if (entry.native_challenge)
          redirect(
            await nativeReturn(
              db,
              identity.user_id,
              provider,
              entry.native_challenge,
            ),
          );
        else {
          await setSession(identity.user_id, provider);
          redirect(this.cfg.webOrigin);
        }
        return undefined;
      }
    }
    if (path === "/enrollment") {
      ensure(
        !req.headers.origin || req.headers.origin === this.cfg.webOrigin,
        403,
        "ORIGIN_DENIED",
      );
      const proof = await one<{
        provider: string;
        subject: string;
        native_challenge: string | null;
      }>(
        db,
        "SELECT provider,subject,native_challenge FROM enrollment_proofs WHERE hash=$1 AND expires_at>now()",
        [hash(cookie(req, "zm_enrollment"))],
      );
      ensure(proof, 401, "ENROLLMENT_PROOF_REQUIRED");
      if (method === "GET") return { required: true, provider: proof.provider };
      if (method === "POST") {
        z.object({ ageConfirmed: z.literal(true) })
          .strict()
          .parse(body);
        const id = await resolveIdentity(
          db,
          proof.provider,
          proof.subject,
          true,
        );
        await db.query("DELETE FROM enrollment_proofs WHERE hash=$1", [
          hash(cookie(req, "zm_enrollment")),
        ]);
        res.clearCookie("zm_enrollment", { path: "/v1/enrollment" });
        if (proof.native_challenge)
          return {
            ok: true,
            redirectUrl: await nativeReturn(
              db,
              id,
              proof.provider,
              proof.native_challenge,
            ),
          };
        await setSession(id, proof.provider);
        return { ok: true };
      }
    }
    if (method === "GET" && path === "/store/apps")
      return store(
        db,
        String(req.query.q ?? ""),
        String(req.query.category ?? ""),
      );
    if (
      method === "GET" &&
      segments[0] === "store" &&
      segments[1] === "apps" &&
      segments.length === 3
    ) {
      const id = at(2);
      const app = (await store(db, "", "", undefined, id))[0];
      ensure(app, 404, "APP_NOT_FOUND");
      return app;
    }
    if (method === "POST" && path === "/app-auth/exchange")
      return exchange(db, req, this.cfg);
    if (method === "POST" && path === "/app-auth/introspect")
      return introspect(db, req);
    if (method === "GET" && path === "/withdrawal-status") {
      const token = req.headers.authorization?.replace(/^Bearer /, "") ?? "";
      const row = await one<{ id: string; platform_status: string }>(
        db,
        "SELECT id,platform_status FROM withdrawals WHERE secret_hash=$1 AND expires_at>now()",
        [hash(token)],
      );
      if (!row) {
        ensure(
          await one(
            db,
            "SELECT 1 FROM withdrawal_receipts r WHERE r.secret_hash=$1 AND r.expires_at>now() AND NOT EXISTS(SELECT 1 FROM withdrawals w WHERE w.secret_hash=r.secret_hash)",
            [hash(token)],
          ),
          404,
          "STATUS_UNAVAILABLE",
          "조회할 수 없는 링크입니다.",
        );
        return { platformStatus: "not_requested", external: [] };
      }
      const external = (
        await db.query(
          `SELECT d.app_id,d.status,used.app_name FROM deletion_requests d
           LEFT JOIN LATERAL (
             SELECT v.manifest->>'name' AS app_name FROM app_sessions s
             JOIN versions v ON v.id=s.version_id
             WHERE s.app_user_id=d.app_user_id AND s.app_id=d.app_id
             ORDER BY v.created_at DESC,v.id DESC LIMIT 1
           ) used ON true WHERE d.withdrawal_id=$1 ORDER BY d.app_id,d.id`,
          [row.id],
        )
      ).rows.map(camel);
      return {
        platformStatus: row.platform_status,
        external,
        localDevice: "not_verified",
        otherDevices: "not_verified",
        backups: "not_applicable_in_trial",
      };
    }
    const restrictedAllowed =
      path === "/me" ||
      path === "/logout" ||
      path === "/me/withdrawal" ||
      path === "/me/withdrawal/prepare" ||
      path === "/test/reauth" ||
      (path === "/auth/native/prepare" &&
        z.object({ intent: z.literal("reauth") }).safeParse(body).success);
    const a = await actor(db, req, restrictedAllowed);
    if (method === "GET" && path === "/me") return userView(db, a);
    if (method === "POST" && path === "/auth/native/prepare") {
      const data = z
        .object({
          provider: z.enum(["google", "github"]),
          intent: z.enum(["link", "reauth"]),
          challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/),
        })
        .strict()
        .parse(body);
      providerConfig(data.provider, this.cfg);
      if (data.intent === "link") recentAuth(a);
      const ticket = secret();
      await db.query(
        "INSERT INTO native_starts(hash,user_id,session_hash,provider,intent,challenge,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '60 seconds')",
        [
          hash(ticket),
          a.id,
          a.sessionHash,
          data.provider,
          data.intent,
          data.challenge,
        ],
      );
      return {
        startUrl: `${this.cfg.webOrigin}/v1/auth/native/start?ticket=${encodeURIComponent(ticket)}`,
      };
    }
    if (method === "POST" && path === "/logout") {
      await db.query(
        "UPDATE app_sessions SET status='revoked' WHERE web_hash=$1",
        [a.sessionHash],
      );
      await db.query("DELETE FROM web_sessions WHERE hash=$1", [a.sessionHash]);
      res.clearCookie("zm_session", { path: "/" });
      return { ok: true };
    }
    if (method === "POST" && path === "/test/reauth") {
      ensure(this.cfg.testAuth, 404, "NOT_FOUND");
      const data = z
        .object({ provider: z.enum(["google", "github"]) })
        .strict()
        .parse(body);
      ensure(
        await one(
          db,
          "SELECT 1 FROM identities WHERE user_id=$1 AND provider=$2",
          [a.id, data.provider],
        ),
        403,
        "IDENTITY_MISSING",
      );
      await db.query(
        "UPDATE web_sessions SET reauth_at=now(),reauth_provider=$1 WHERE hash=$2",
        [data.provider, a.sessionHash],
      );
      if (a.restricted && a.status === "active")
        await setSession(a.id, data.provider);
      return { ok: true };
    }
    if (method === "POST" && path === "/test/link") {
      ensure(this.cfg.testAuth, 404, "NOT_FOUND");
      const data = z
        .object({
          provider: z.enum(["google", "github"]),
          subject: z.enum(["owner", "alice", "bob"]),
        })
        .strict()
        .parse(body);
      await linkIdentity(db, a, data.provider, `trial:${data.subject}`);
      return { ok: true };
    }
    if (
      method === "DELETE" &&
      segments[0] === "me" &&
      segments[1] === "login-identities"
    ) {
      const provider = z.enum(["google", "github"]).parse(segments[2]);
      recentAuth(a);
      ensure(a.reauthProvider !== provider, 403, "REAUTH_RETAINED_PROVIDER");
      const providers = (
        await db.query("SELECT provider FROM identities WHERE user_id=$1", [
          a.id,
        ])
      ).rows;
      ensure(providers.length > 1, 409, "LAST_LOGIN_METHOD");
      await db.query(
        "DELETE FROM identities WHERE user_id=$1 AND provider=$2",
        [a.id, provider],
      );
      await db.query(
        "UPDATE app_sessions SET status='revoked' WHERE user_id=$1 AND web_hash<>$2",
        [a.id, a.sessionHash],
      );
      await db.query("DELETE FROM web_sessions WHERE user_id=$1 AND hash<>$2", [
        a.id,
        a.sessionHash,
      ]);
      await revokePendingIdentityProofs(db,a.id);
      await audit(db, a.id, "identity.unlinked", a.id, { provider });
      return { ok: true };
    }
    if (method === "GET" && path === "/me/app-consents") {
      const rows = await db.query<{
        app_id: string; name: string; revoked_at: Date | null; available: boolean;
      }>(
        `SELECT c.app_id,COALESCE(v.manifest->>'name',app.name) AS name,c.revoked_at,
          COALESCE(app.published AND app.availability='allowed' AND app.closure<>'closed'
            AND v.validation_status='passed' AND v.review_status='approved',false) AS available
          FROM consents c JOIN apps app ON app.id=c.app_id
          LEFT JOIN versions v ON v.id=app.current_version_id
          WHERE c.user_id=$1 ORDER BY name,c.app_id`,
        [a.id],
      );
      return rows.rows.map((row) => ({
        appId: row.app_id,
        name: row.name,
        revokedAt: row.revoked_at?.toISOString() ?? null,
        available: row.available,
        ...(!row.available ? { unavailableReason: "현재 새 실행을 할 수 없는 앱입니다." } : {}),
      }));
    }
    if (method === "GET" && path === "/me/apps") return store(db, "", "", a.id);
    if (
      segments[0] === "me" &&
      segments[1] === "apps" &&
      segments.length === 3
    ) {
      const appId = at(2);
      if (method === "PUT") {
        await currentVersion(db, await requireApp(db, appId), true);
        await db.query(
          "INSERT INTO my_apps(user_id,app_id) VALUES($1,$2) ON CONFLICT DO NOTHING",
          [a.id, appId],
        );
        return { ok: true };
      }
      if (method === "DELETE") {
        await db.query("DELETE FROM my_apps WHERE user_id=$1 AND app_id=$2", [
          a.id,
          appId,
        ]);
        return { ok: true };
      }
    }
    if (
      method === "GET" &&
      segments[0] === "apps" &&
      segments[2] === "consent"
    ) {
      const appId = at(1);
      const version = await currentVersion(
        db,
        await requireApp(db, appId),
        true,
      );
      const accepted = Boolean(
        await one(
          db,
          "SELECT 1 FROM consents WHERE user_id=$1 AND app_id=$2 AND fingerprint=$3 AND revoked_at IS NULL",
          [a.id, appId, version.consent_hash],
        ),
      );
      return {
        fingerprint: version.consent_hash,
        manifest: version.manifest,
        accepted,
      };
    }
    if (segments[0] === "me" && segments[1] === "app-consents") {
      const appId = at(2);
      if (method === "PUT") {
        const data = z
          .object({ fingerprint: z.string().length(64) })
          .strict()
          .parse(body);
        const version = await currentVersion(
          db,
          await requireApp(db, appId),
          true,
        );
        ensure(
          data.fingerprint === version.consent_hash,
          409,
          "CONSENT_CHANGED",
        );
        await db.query(
          "UPDATE app_sessions SET status='revoked' WHERE user_id=$1 AND app_id=$2 AND fingerprint<>$3",
          [a.id, appId, data.fingerprint],
        );
        await db.query(
          "INSERT INTO consents(user_id,app_id,fingerprint) VALUES($1,$2,$3) ON CONFLICT(user_id,app_id) DO UPDATE SET fingerprint=$3,revoked_at=NULL",
          [a.id, appId, data.fingerprint],
        );
        await audit(db, a.id, "consent.accepted", appId, {
          fingerprint: data.fingerprint,
        });
        return { ok: true };
      }
      if (method === "DELETE") {
        await db.query(
          "UPDATE consents SET revoked_at=now() WHERE user_id=$1 AND app_id=$2",
          [a.id, appId],
        );
        await db.query(
          "UPDATE app_sessions SET status='revoked' WHERE user_id=$1 AND app_id=$2",
          [a.id, appId],
        );
        await audit(db, a.id, "consent.revoked", appId);
        return { ok: true };
      }
    }
    if (method === "POST" && path === "/app-sessions")
      return launch(
        db,
        a,
        z.object({ appId: idSchema }).strict().parse(body).appId,
        this.cfg,
      );
    if (method === "POST" && path === "/preview-sessions") {
      const data = z
        .object({ versionId: idSchema, confirmed: z.literal(true) })
        .strict()
        .parse(body);
      return preview(db, a, data.versionId, this.cfg);
    }
    if (
      method === "GET" &&
      segments[0] === "versions" &&
      segments[2] === "bundle"
    ) {
      const version = await one<{ app_id: string }>(
        db,
        "SELECT app_id FROM versions WHERE id=$1",
        [at(1)],
      );
      ensure(version, 404, "NOT_FOUND");
      const app = await requireApp(db, version.app_id);
      ensure(a.operator || app.owner_id === a.id, 404, "NOT_FOUND");
      res.set("Content-Disposition", `attachment; filename="${at(1)}.zip"`);
      return readFile(join(this.cfg.files, "uploads", `${at(1)}.zip`));
    }
    if (segments[0] === "app-sessions" && segments.length >= 2) {
      const sid = at(1);
      if (method === "DELETE" && segments.length === 2) {
        await db.query(
          "UPDATE app_sessions SET status='closed' WHERE id=$1 AND user_id=$2",
          [sid, a.id],
        );
        return { ok: true };
      }
      const session = await validSession(db, sid, a.id);
      if (method === "GET" && segments.length === 2)
        return sessionView(session, this.cfg);
      if (method === "POST" && segments[2] === "authorization-codes") {
        ensure(
          session.manifest.permissions.includes("external-api"),
          403,
          "PERMISSION_DENIED",
        );
        const data = z
          .object({ challenge: z.string().regex(/^[A-Za-z0-9_-]{43}$/) })
          .strict()
          .parse(body);
        const code = secret(),
          expiresAt = new Date(Date.now() + this.cfg.codeSeconds * 1000);
        await db.query(
          "INSERT INTO auth_codes(hash,session_id,challenge,expires_at) VALUES($1,$2,$3,$4)",
          [hash(code), sid, data.challenge, expiresAt],
        );
        return { code, expiresAt: expiresAt.toISOString() };
      }
    }
    if (method === "GET" && path === "/developer/profile") {
      return (await one<{status: string; reason: string}>(db,
        "SELECT status,reason FROM developers WHERE user_id=$1", [a.id]))
        ?? { status: "none", reason: "" };
    }
    if (method === "GET" && path === "/developer/application") {
      const row = await one(
        db,
        "SELECT * FROM developer_applications WHERE user_id=$1 ORDER BY created_at DESC LIMIT 1",
        [a.id],
      );
      return row ? camel(row) : null;
    }
    if (method === "POST" && path === "/developer/applications") {
      ensure(!a.developer, 409, "ALREADY_DEVELOPER");
      const data = applicationSchema.parse(body);
      const id = randomUUID();
      await db.query(
        "INSERT INTO developer_applications(id,user_id,display_name,email,description,status) VALUES($1,$2,$3,$4,$5,'pending')",
        [id, a.id, data.displayName, data.email, data.description],
      );
      await audit(db, a.id, "developer.applied", id);
      return camel(
        (await one(db, "SELECT * FROM developer_applications WHERE id=$1", [
          id,
        ]))!,
      );
    }
    if (segments[0] === "operator")
      ensure(a.operator, 403, "OPERATOR_REQUIRED");
    if (method === "GET" && path === "/operator/developer-applications")
      return (
        await db.query(
          "SELECT * FROM developer_applications ORDER BY created_at DESC",
        )
      ).rows.map(camel);
    if (
      method === "POST" &&
      segments[0] === "operator" &&
      segments[1] === "developer-applications" &&
      segments[3] === "decisions"
    ) {
      const id = at(2),
        data = reviewSchema.parse(body);
      const application = await one<{ user_id: string; status: string }>(
        db,
        "SELECT user_id,status FROM developer_applications WHERE id=$1",
        [id],
      );
      ensure(application, 404, "NOT_FOUND");
      ensure(application.status === "pending", 409, "REVIEW_NOT_PENDING");
      await db.query(
        "UPDATE developer_applications SET status=$1,reason=$2 WHERE id=$3",
        [data.decision, data.reason, id],
      );
      if (data.decision === "approved")
        await db.query(
          "INSERT INTO developers(user_id,status,reason) VALUES($1,'approved','') ON CONFLICT(user_id) DO UPDATE SET status='approved',reason=''",
          [application.user_id],
        );
      await audit(db, a.id, "developer.reviewed", id, data);
      return { ok: true };
    }
    if (
      method === "POST" &&
      segments[0] === "operator" &&
      segments[1] === "developers" &&
      segments[3] === "revoke"
    ) {
      const data = z.object({ reason: reasonSchema }).strict().parse(body);
      const revoked = await db.query(
        "UPDATE developers SET status='revoked',reason=$2 WHERE user_id=$1 RETURNING user_id",
        [at(2), data.reason],
      );
      ensure(revoked.rowCount === 1, 404, "DEVELOPER_NOT_FOUND");
      await audit(db, a.id, "developer.revoked", at(2), data);
      return { ok: true };
    }
    if (method === "GET" && path === "/developer/apps")
      return (
        await db.query(
          "SELECT *,closure='requested' AS closure_requested,closure='closed' AS closed FROM apps WHERE owner_id=$1 ORDER BY name",
          [a.id],
        )
      ).rows.map(camel);
    if (method === "POST" && path === "/developer/apps") {
      ensure(a.developer, 403, "DEVELOPER_REQUIRED");
      const data = z
        .object({ name: z.string().trim().min(1).max(60) })
        .strict()
        .parse(body);
      const id = randomUUID();
      await db.query("INSERT INTO apps(id,owner_id,name) VALUES($1,$2,$3)", [
        id,
        a.id,
        data.name,
      ]);
      await audit(db, a.id, "app.created", id);
      return camel((await one(db, "SELECT * FROM apps WHERE id=$1", [id]))!);
    }
    if (
      segments[0] === "developer" &&
      segments[1] === "apps" &&
      segments.length >= 4
    ) {
      const app = await owned(db, at(2), a, false);
      if (segments[3] === "versions") {
        if (method === "GET")
          return (
            await db.query(
              "SELECT * FROM versions WHERE app_id=$1 ORDER BY created_at DESC",
              [app.id],
            )
          ).rows.map(camel);
        if (method === "POST") {
          ensure(a.developer, 403, "DEVELOPER_REQUIRED");
          ensure(app.closure === "open", 409, "APP_CLOSING");
          ensure(
            Buffer.isBuffer(body) && body.length <= TEST_LIMITS.zipBytes,
            413,
            "ZIP_REQUIRED",
          );
          const bundle = await validateZip(body, {
            expectedAppId: app.id,
            allowLocalHttp: true,
          }).catch((error: unknown) => {
            throw new ApiError(
              400,
              "BUNDLE_INVALID",
              error instanceof Error ? error.message : "번들 검사 실패",
            );
          });
          const versionId = randomUUID();
          ensure(
            !(await one(
              db,
              "SELECT 1 FROM versions WHERE app_id=$1 AND version=$2",
              [app.id, bundle.manifest.version],
            )),
            409,
            "DUPLICATE_VERSION",
          );
          await mkdir(join(this.cfg.files, "uploads"), { recursive: true });
          const file = join(this.cfg.files, "uploads", `${versionId}.zip`);
          files.push(file);
          await writeFile(file, body, { flag: "wx" });
          await db.query(
            "INSERT INTO versions(id,app_id,version,manifest,hash,consent_hash) VALUES($1,$2,$3,$4,$5,$6)",
            [
              versionId,
              app.id,
              bundle.manifest.version,
              bundle.manifest,
              hash(body),
              fingerprint(bundle.manifest),
            ],
          );
          await db.query(
            "INSERT INTO bundle_jobs(id,version_id) VALUES($1,$2)",
            [randomUUID(), versionId],
          );
          await audit(db, a.id, "version.uploaded", versionId, {
            hash: hash(body),
          });
          return camel(
            (await one(db, "SELECT * FROM versions WHERE id=$1", [versionId]))!,
          );
        }
      }
      if (method === "POST" && segments[3] === "releases") {
        ensure(a.developer, 403, "DEVELOPER_REQUIRED");
        const data = z
          .object({ versionId: idSchema, revision: revisionSchema })
          .strict()
          .parse(body);
        ensure(
          app.availability === "allowed" && app.closure === "open",
          409,
          "PUBLICATION_BLOCKED",
        );
        const key = z
          .string()
          .min(8)
          .max(100)
          .optional()
          .parse(req.headers["idempotency-key"]);
        const signature = hash(JSON.stringify({ path, body: data }));
        if (key) {
          const previous = await one<{ signature: string; result: unknown }>(
            db,
            "SELECT signature,result FROM idempotency_results WHERE user_id=$1 AND key=$2",
            [a.id, key],
          );
          if (previous) {
            ensure(
              previous.signature === signature,
              409,
              "IDEMPOTENCY_CONFLICT",
            );
            return previous.result;
          }
        }
        ensure(app.revision === data.revision, 409, "REVISION_CONFLICT");
        const version = await one(
          db,
          "SELECT 1 FROM versions WHERE id=$1 AND app_id=$2 AND validation_status='passed' AND review_status='approved'",
          [data.versionId, app.id],
        );
        ensure(version, 409, "VERSION_NOT_APPROVED");
        await db.query(
          "UPDATE apps SET current_version_id=$1,published=true,revision=revision+1 WHERE id=$2",
          [data.versionId, app.id],
        );
        await audit(db, a.id, "app.released", app.id, {
          versionId: data.versionId,
        });
        if (key)
          await db.query(
            "INSERT INTO idempotency_results(user_id,key,signature,result) VALUES($1,$2,$3,$4)",
            [a.id, key, signature, { ok: true }],
          );
        return { ok: true };
      }
      if (method === "PUT" && segments[3] === "publication") {
        const data = z
          .object({ published: z.boolean(), revision: revisionSchema })
          .strict()
          .parse(body);
        ensure(app.revision === data.revision, 409, "REVISION_CONFLICT");
        if (data.published) {
          ensure(a.developer, 403, "DEVELOPER_REQUIRED");
          ensure(
            app.availability === "allowed" && app.closure === "open",
            409,
            "PUBLICATION_BLOCKED",
          );
          await currentVersion(db, app);
        }
        await db.query(
          "UPDATE apps SET published=$1,revision=revision+1 WHERE id=$2",
          [data.published, app.id],
        );
        await audit(db, a.id, "app.publication", app.id, data);
        return { ok: true };
      }
      if (method === "POST" && segments[3] === "closure-requests") {
        ensure(app.closure !== "closed", 409, "ALREADY_CLOSED");
        await db.query(
          "UPDATE apps SET closure='requested',revision=revision+1 WHERE id=$1",
          [app.id],
        );
        await audit(db, a.id, "app.closure_requested", app.id);
        return { ok: true };
      }
      if (method === "POST" && segments[3] === "credentials") {
        ensure(a.developer, 403, "DEVELOPER_REQUIRED");
        ensure(app.closure === "open", 409, "APP_CLOSING");
        const value = secret();
        await db.query(
          "INSERT INTO app_credentials(app_id,hash) VALUES($1,$2) ON CONFLICT(app_id) DO UPDATE SET hash=$2",
          [app.id, hash(value)],
        );
        await db.query(
          "DELETE FROM app_tokens WHERE session_id IN(SELECT id FROM app_sessions WHERE app_id=$1)",
          [app.id],
        );
        await audit(db, a.id, "app.credential_rotated", app.id);
        return { appId: app.id, secret: value };
      }
    }
    if (
      method === "POST" &&
      segments[0] === "developer" &&
      segments[1] === "versions" &&
      segments[3] === "submit"
    ) {
      const id = at(2);
      const version = await one<{
        app_id: string;
        validation_status: string;
        review_status: string;
      }>(db, "SELECT * FROM versions WHERE id=$1", [id]);
      ensure(version, 404, "NOT_FOUND");
      await owned(db, version.app_id, a);
      ensure(
        version.validation_status === "passed" &&
          ["not_submitted", "changes_requested", "rejected"].includes(
            version.review_status,
          ),
        409,
        "VERSION_NOT_SUBMITTABLE",
      );
      await db.query(
        "UPDATE versions SET review_status='in_review',reason='' WHERE id=$1",
        [id],
      );
      await audit(db, a.id, "version.submitted", id);
      return { ok: true };
    }
    if (method === "GET" && path === "/operator/reviews")
      return (
        await db.query(
          "SELECT * FROM versions WHERE review_status='in_review' ORDER BY created_at",
        )
      ).rows.map(camel);
    if (
      method === "POST" &&
      segments[0] === "operator" &&
      segments[1] === "versions" &&
      segments[3] === "decisions"
    ) {
      const data = reviewSchema.parse(body),
        id = at(2);
      const version = await one<{
        app_id: string;
        review_status: string;
        validation_status: string;
      }>(db, "SELECT * FROM versions WHERE id=$1", [id]);
      ensure(
        version?.review_status === "in_review" &&
          version.validation_status === "passed",
        409,
        "REVIEW_NOT_PENDING",
      );
      const app = await requireApp(db, version.app_id);
      await db.query(
        "UPDATE versions SET review_status=$1,reason=$2 WHERE id=$3",
        [data.decision, data.reason, id],
      );
      await audit(db, a.id, "version.reviewed", id, {
        ...data,
        selfReview: app.owner_id === a.id,
      });
      return { ok: true };
    }
    if (method === "GET" && path === "/operator/apps")
      return (
        await db.query(
          "SELECT *,closure='requested' AS closure_requested,closure='closed' AS closed FROM apps ORDER BY name",
        )
      ).rows.map(camel);
    if (
      method === "PUT" &&
      segments[0] === "operator" &&
      segments[1] === "apps" &&
      segments[3] === "availability"
    ) {
      const data = z
        .object({
          status: z.enum([
            "allowed",
            "normal_suspended",
            "emergency_suspended",
          ]),
          reason: reasonSchema,
          revision: revisionSchema,
        })
        .strict()
        .parse(body);
      const app = await requireApp(db, at(2));
      ensure(
        app.revision === data.revision && app.closure !== "closed",
        409,
        "REVISION_CONFLICT",
      );
      await db.query(
        "UPDATE apps SET availability=$1,revision=revision+1 WHERE id=$2",
        [data.status, app.id],
      );
      if (data.status === "emergency_suspended")
        await db.query(
          "UPDATE app_sessions SET status='revoked' WHERE app_id=$1",
          [app.id],
        );
      await audit(db, a.id, "app.availability", app.id, data);
      return { ok: true };
    }
    if (
      method === "POST" &&
      segments[0] === "operator" &&
      segments[1] === "apps" &&
      segments[3] === "closure-confirmations"
    ) {
      const data = z.object({ reason: reasonSchema }).strict().parse(body);
      const app = await requireApp(db, at(2));
      ensure(app.closure === "requested", 409, "OWNER_CLOSURE_REQUIRED");
      await db.query(
        "UPDATE apps SET closure='closed',published=false,revision=revision+1 WHERE id=$1",
        [app.id],
      );
      await db.query(
        "UPDATE app_sessions SET status='revoked' WHERE app_id=$1",
        [app.id],
      );
      await audit(db, a.id, "app.closure_confirmed", app.id, data);
      return { ok: true };
    }
    if (method === "GET" && path === "/operator/users")
      return (
        await db.query(
          "SELECT u.id,u.status,u.operator,COALESCE(d.status='approved',false) AS developer FROM users u LEFT JOIN developers d ON d.user_id=u.id WHERE u.status<>'withdrawn'",
        )
      ).rows;
    if (
      method === "PUT" &&
      segments[0] === "operator" &&
      segments[1] === "users" &&
      segments[3] === "availability"
    ) {
      const data = z
          .object({
            status: z.enum(["active", "suspended"]),
            reason: reasonSchema,
          })
          .strict()
          .parse(body),
        id = at(2);
      const target = await one<{ operator: boolean; status: string }>(
        db,
        "SELECT operator,status FROM users WHERE id=$1",
        [id],
      );
      ensure(target && target.status !== "withdrawn", 404, "NOT_FOUND");
      if (target.operator && data.status === "suspended") {
        const count = await one<{ count: string }>(
          db,
          "SELECT count(*) FROM users WHERE operator AND status='active'",
        );
        ensure(Number(count?.count) > 1, 409, "LAST_OPERATOR");
      }
      await db.query("UPDATE users SET status=$1 WHERE id=$2", [
        data.status,
        id,
      ]);
      if (data.status === "suspended") {
        await revokePendingIdentityProofs(db,id);
        await db.query(
          "UPDATE app_sessions SET status='revoked' WHERE user_id=$1",
          [id],
        );
        await db.query(
          "UPDATE web_sessions SET restricted=true WHERE user_id=$1",
          [id],
        );
      }
      await audit(db, a.id, "user.availability", id, data);
      return { ok: true };
    }
    if (
      method === "POST" &&
      segments[0] === "apps" &&
      segments[2] === "reports"
    ) {
      const data = z.object({ reason: reasonSchema }).strict().parse(body),
        appId = at(1);
      await currentVersion(db, await requireApp(db, appId), true);
      await db.query(
        "INSERT INTO reports(id,user_id,app_id,reason) VALUES($1,$2,$3,$4)",
        [randomUUID(), a.id, appId, data.reason],
      );
      return { ok: true };
    }
    if (method === "GET" && path === "/me/reports")
      return (
        await db.query(
          "SELECT id,app_id,reason,status,resolution FROM reports WHERE user_id=$1",
          [a.id],
        )
      ).rows.map(camel);
    if (method === "GET" && path === "/operator/reports")
      return (await db.query("SELECT * FROM reports")).rows.map(camel);
    if (
      method === "POST" &&
      segments[0] === "operator" &&
      segments[1] === "reports" &&
      segments[3] === "decisions"
    ) {
      const data = z
        .object({
          status: z.enum(["resolved", "dismissed"]),
          reason: reasonSchema,
        })
        .strict()
        .parse(body);
      const result = await db.query(
        "UPDATE reports SET status=$1,resolution=$2 WHERE id=$3",
        [data.status, data.reason, at(2)],
      );
      ensure(result.rowCount, 404, "NOT_FOUND");
      await audit(db, a.id, "report.resolved", at(2), data);
      return { ok: true };
    }
    if (method === "POST" && path === "/me/withdrawal/prepare") {
      z.object({}).strict().parse(body);
      recentAuth(a);
      const id = randomUUID(),
        lookupSecret = secret();
      await db.query(
        "INSERT INTO withdrawal_receipts(id,user_id,secret_hash,expires_at) VALUES($1,$2,$3,now()+$4*interval '1 second')",
        [id, a.id, hash(lookupSecret), this.cfg.statusSeconds],
      );
      return { receiptId: id, lookupSecret };
    }
    if (method === "POST" && path === "/me/withdrawal") {
      const data = z
        .object({ confirmed: z.literal(true), receiptId: idSchema })
        .strict()
        .parse(body);
      recentAuth(a);
      ensure(
        !a.operator,
        409,
        "OPERATOR_TRANSFER_REQUIRED",
        "운영자 역할을 먼저 정리해야 합니다.",
      );
      const app = await one(
        db,
        "SELECT 1 FROM apps WHERE owner_id=$1 AND closure<>'closed'",
        [a.id],
      );
      if (app) return { status: "owner_closure_required" };
      const receipt = await one<{ secret_hash: string; expires_at: Date }>(
        db,
        "SELECT secret_hash,expires_at FROM withdrawal_receipts WHERE id=$1 AND user_id=$2 AND expires_at>now()",
        [data.receiptId, a.id],
      );
      ensure(receipt, 409, "WITHDRAWAL_RECEIPT_REQUIRED");
      const id = randomUUID();
      await db.query(
        "INSERT INTO withdrawals(id,user_id,secret_hash,expires_at) VALUES($1,$2,$3,$4)",
        [id, a.id, receipt.secret_hash, receipt.expires_at],
      );
      await db.query(
        "INSERT INTO deletion_requests(id,withdrawal_id,app_id,app_user_id) SELECT gen_random_uuid(),$1,au.app_id,au.id FROM app_users au WHERE au.user_id=$2 AND EXISTS(SELECT 1 FROM app_sessions s JOIN versions v ON v.id=s.version_id WHERE s.app_user_id=au.id AND v.manifest->'permissions' ? 'external-api')",
        [id, a.id],
      );
      await db.query("UPDATE users SET status='withdrawn' WHERE id=$1", [a.id]);
      await db.query(
        "UPDATE app_sessions SET status='revoked' WHERE user_id=$1",
        [a.id],
      );
      await db.query("DELETE FROM web_sessions WHERE user_id=$1", [a.id]);
      await audit(db, a.id, "user.withdrawn", id);
      res.clearCookie("zm_session", { path: "/" });
      return { status: "withdrawn" };
    }
    if (method === "GET" && path === "/developer/deletion-requests")
      return (
        await db.query(
          "SELECT d.id,d.app_id,d.app_user_id,d.status,d.note FROM deletion_requests d JOIN apps a ON a.id=d.app_id WHERE a.owner_id=$1",
          [a.id],
        )
      ).rows.map(camel);
    if (
      method === "POST" &&
      segments[0] === "developer" &&
      segments[1] === "deletion-requests" &&
      segments[3] === "results"
    ) {
      const data = z
        .object({
          status: z.enum([
            "processing",
            "developer_reported_completed",
            "needs_attention",
          ]),
          note: reasonSchema,
        })
        .strict()
        .parse(body);
      const request = await one<{ app_id: string }>(
        db,
        "SELECT app_id FROM deletion_requests WHERE id=$1",
        [at(2)],
      );
      ensure(request, 404, "NOT_FOUND");
      await owned(db, request.app_id, a, false);
      await db.query(
        "UPDATE deletion_requests SET status=$1,note=$2 WHERE id=$3",
        [data.status, data.note, at(2)],
      );
      await audit(db, a.id, "deletion.developer_report", at(2), {
        status: data.status,
      });
      return { ok: true };
    }
    throw new ApiError(404, "NOT_FOUND", "지원하지 않는 경로입니다.");
  }
}

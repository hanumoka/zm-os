import { unlink } from "node:fs/promises";
import type { PoolClient } from "pg";
import type { Request, Response } from "express";
import { z } from "zod";
import type { Config } from "./config.js";
import { Database, one, audit } from "./db.js";
import { actor, issueSession, recentAuth, resolveIdentity, revokePendingIdentityProofs, type Actor } from "./auth.js";
import { ensure, hash, secret, cookie } from "./common.js";
import { hashPassword, passwordInput, verifyPassword } from "./password.js";
import { captureMail } from "./mail.js";

const address = z.string().trim().max(254).email().transform(value => value.toLowerCase());
const proof = z.string().regex(/^[A-Za-z0-9_-]{43}$/);
const requestResult = { message: "처리 가능한 이메일 주소라면 안내 메일을 보냈습니다. 메일함을 확인해 주세요." };
interface Credential { user_id: string; password_hash: string; status: string }
interface Challenge { hash: string; email: string; purpose: string; user_id: string | null; source_session: string | null }
const routes = new Set([
  "/auth/email/signup", "/auth/email/login", "/auth/email/reset/request", "/auth/email/complete",
  "/me/email/link", "/me/email/reauth", "/me/email/password",
]);
export function isEmailRoute(path: string): boolean { return routes.has(path); }
export class EmailAuth {
  constructor(readonly db: Database, readonly cfg: Config) {}
  private async rate(req: Request, scope: string, target: string, limit: number): Promise<void> {
    // This transaction commits even when the following authentication fails.
    const allowed = await this.db.transaction(async db => {
      await db.query("DELETE FROM auth_rate_limits WHERE expires_at<now()");
      let pass = true;
      for (const [key, maximum] of [
        [hash("email-ip:" + (req.socket.remoteAddress ?? "unknown")), 100],
        [hash(scope + ":" + target), limit],
      ] as const) {
        const row = await one<{ attempts: number }>(db,
          "INSERT INTO auth_rate_limits(key,attempts,expires_at) VALUES($1,1,now()+interval '15 minutes') ON CONFLICT(key) DO UPDATE SET attempts=auth_rate_limits.attempts+1 RETURNING attempts", [key]);
        if ((row?.attempts ?? Infinity) > maximum) pass = false;
      }
      return pass;
    });
    ensure(allowed, 429, "AUTH_RATE_LIMIT", "요청이 너무 많습니다. 15분 뒤 다시 시도해 주세요.");
  }
  private async credential(db: PoolClient, email?: string, userId?: string): Promise<Credential | undefined> {
    return one<Credential>(db,
      "SELECT c.user_id,c.password_hash,u.status FROM email_credentials c JOIN users u ON u.id=c.user_id JOIN identities i ON i.user_id=c.user_id AND i.provider='email' WHERE ($1::text IS NULL OR i.subject=$1) AND ($2::uuid IS NULL OR c.user_id=$2) AND u.status<>'withdrawn'",
      [email ?? null, userId ?? null]);
  }
  private async invalidate(db: PoolClient, userId: string): Promise<void> {
    await db.query("UPDATE app_sessions SET status='revoked' WHERE user_id=$1", [userId]);
    await db.query("DELETE FROM web_sessions WHERE user_id=$1", [userId]);
    await revokePendingIdentityProofs(db, userId);
  }
  private async challenge(db: PoolClient, purpose: string, email: string, files: string[], a?: Actor, resetUserId?: string): Promise<void> {
    await db.query("DELETE FROM email_challenges WHERE expires_at<now() OR (email=$1 AND purpose=$2 AND user_id IS NOT DISTINCT FROM $3)", [email,purpose,a?.id ?? resetUserId ?? null]);
    const token = secret();
    await db.query("INSERT INTO email_challenges(hash,purpose,email,user_id,source_session,expires_at) VALUES($1,$2,$3,$4,$5,now()+interval '15 minutes')",
      [hash(token),purpose,email,a?.id ?? resetUserId ?? null,a?.sessionHash ?? null]);
    await captureMail(this.cfg, email, purpose, token, files);
  }
  async handle(req: Request, res: Response, path: string): Promise<unknown> {
    ensure(req.method === "POST", 404, "NOT_FOUND");
    ensure(req.headers.origin === this.cfg.webOrigin, 403, "ORIGIN_DENIED");
    const files: string[] = [];
    try {
      if (path === "/auth/email/signup" || path === "/auth/email/reset/request" || path === "/me/email/link") {
        const input = (path === "/auth/email/signup"
          ? z.object({ email: address, ageConfirmed: z.literal(true) }).strict()
          : z.object({ email: address }).strict()).parse(req.body);
        await this.rate(req, path, input.email, 5);
        return await this.db.transaction(async db => {
          let a: Actor | undefined;
          if (path === "/me/email/link") {
            a = await actor(db, req);recentAuth(a);
            ensure(!await one(db, "SELECT 1 FROM identities WHERE user_id=$1 AND provider='email'", [a.id]), 409, "PROVIDER_ALREADY_LINKED");
          }
          const existing = await one<{ user_id: string; status: string }>(db,
            "SELECT i.user_id,u.status FROM identities i JOIN users u ON u.id=i.user_id WHERE i.provider='email' AND i.subject=$1", [input.email]);
          if (path === "/auth/email/reset/request") {
            if (existing && existing.status !== "withdrawn") await this.challenge(db,"reset",input.email,files,undefined,existing.user_id);
          } else if (!existing || existing.status === "withdrawn") {
            await this.challenge(db,a ? "link" : "signup",input.email,files,a);
          }
          return requestResult;
        });
      }
      if (path === "/auth/email/complete") {
        const data = z.object({ purpose:z.enum(["signup","link","reset"]), token:proof, password:z.string() }).strict().parse(req.body);
        const password = passwordInput(data.password,true);
        // Token guessing and repeated password work are limited independently of the user row.
        await this.rate(req,path,hash(data.token),10);
        const passwordHash = await hashPassword(password);
        return await this.db.transaction(async db => {
          const entry = await one<Challenge>(db,"SELECT * FROM email_challenges WHERE hash=$1 AND purpose=$2 AND expires_at>now() FOR UPDATE",[hash(data.token),data.purpose]);
          ensure(entry,400,"EMAIL_PROOF_INVALID","인증 링크가 만료되었거나 이미 사용되었습니다. 메일을 다시 요청해 주세요.");
          const identity = await one<{ user_id:string; status:string }>(db,"SELECT i.user_id,u.status FROM identities i JOIN users u ON u.id=i.user_id WHERE i.provider='email' AND i.subject=$1",[entry.email]);
          let userId: string;
          if (entry.purpose === "reset") {
            ensure(identity && identity.user_id===entry.user_id && identity.status!=="withdrawn",400,"EMAIL_PROOF_INVALID");
            userId = identity.user_id;
            const changed = await db.query("UPDATE email_credentials SET password_hash=$1,changed_at=now() WHERE user_id=$2",[passwordHash,userId]);
            ensure(changed.rowCount===1,400,"EMAIL_PROOF_INVALID");
            const current = await one<{user_id:string}>(db,"SELECT user_id FROM web_sessions WHERE hash=$1",[hash(cookie(req,"zm_session"))]);
            await this.invalidate(db,userId);
            if(current?.user_id===userId) res.clearCookie("zm_session",{path:"/"});
            await audit(db,userId,"password.reset",userId);
          } else {
            ensure(!identity || identity.status==="withdrawn",409,"IDENTITY_IN_USE","이미 다른 계정에 연결된 이메일입니다. 자동으로 합치지 않습니다.");
            if (identity) await db.query("DELETE FROM identities WHERE provider='email' AND subject=$1",[entry.email]);
            if(entry.purpose==="link") {
              const a = await actor(db,req);recentAuth(a);
              ensure(a.id===entry.user_id && a.sessionHash===entry.source_session,403,"EMAIL_LINK_SESSION_CHANGED","연결을 요청한 계정과 브라우저에서 다시 인증해 주세요.");
              ensure(!await one(db,"SELECT 1 FROM identities WHERE user_id=$1 AND provider='email'",[a.id]),409,"PROVIDER_ALREADY_LINKED");
              userId = a.id;
              await db.query("INSERT INTO identities(provider,subject,user_id) VALUES('email',$1,$2)",[entry.email,userId]);
            } else userId = await resolveIdentity(db,"email",entry.email,true);
            await db.query("INSERT INTO email_credentials(user_id,password_hash) VALUES($1,$2)",[userId,passwordHash]);
            await audit(db,userId,entry.purpose==="link" ? "identity.linked" : "email.verified",userId,{provider:"email"});
          }
          await db.query("DELETE FROM email_challenges WHERE hash=$1 OR (email=$2 AND purpose IN ('signup','link'))",[hash(data.token),entry.email]);
          return { ok:true, purpose:entry.purpose };
        });
      }
      if (path === "/auth/email/login") {
        const data = z.object({email:address,password:z.string()}).strict().parse(req.body);
        const password = passwordInput(data.password);
        await this.rate(req,path,data.email,12);
        const snapshot = await this.db.transaction(db=>this.credential(db,data.email));
        const correct = await verifyPassword(password,snapshot?.password_hash ?? null);
        ensure(correct && snapshot,401,"EMAIL_LOGIN_INVALID","이메일 또는 비밀번호를 확인해 주세요. 가입하려면 이메일 인증을 먼저 완료해야 합니다.");
        return await this.db.transaction(async db=>{
          const latest = await this.credential(db,data.email);
          ensure(latest && latest.password_hash===snapshot.password_hash,401,"EMAIL_LOGIN_INVALID","이메일 또는 비밀번호를 확인해 주세요.");
          await issueSession(db,latest.user_id,"email",res,this.cfg,hash(cookie(req,"zm_session")));
          await audit(db,latest.user_id,"email.login",latest.user_id);
          return {ok:true};
        });
      }
      const data = (path==="/me/email/password"
        ? z.object({password:z.string(),newPassword:z.string()}).strict()
        : z.object({password:z.string()}).strict()).parse(req.body);
      const password = passwordInput(data.password);
      await this.rate(req,path,hash(cookie(req,"zm_session")),10);
      const snapshot = await this.db.transaction(async db=>{
        const a = await actor(db,req,true);
        return {a,credential:await this.credential(db,undefined,a.id)};
      });
      ensure(await verifyPassword(password,snapshot.credential?.password_hash ?? null),401,"PASSWORD_INCORRECT","현재 비밀번호를 확인해 주세요.");
      const changedHash = "newPassword" in data ? await hashPassword(passwordInput(data.newPassword,true)) : undefined;
      return await this.db.transaction(async db=>{
        const a = await actor(db,req,true), latest = await this.credential(db,undefined,a.id);
        ensure(a.id===snapshot.a.id && latest?.password_hash===snapshot.credential?.password_hash,401,"PASSWORD_INCORRECT");
        if(changedHash) {
          await db.query("UPDATE email_credentials SET password_hash=$1,changed_at=now() WHERE user_id=$2",[changedHash,a.id]);
          await this.invalidate(db,a.id);res.clearCookie("zm_session",{path:"/"});
          await audit(db,a.id,"password.changed",a.id);
        } else {
          await db.query("UPDATE web_sessions SET reauth_at=now(),reauth_provider='email' WHERE hash=$1",[a.sessionHash]);
          if(a.restricted && a.status==="active") await issueSession(db,a.id,"email",res,this.cfg,a.sessionHash);
        }
        return {ok:true};
      });
    } catch (error) {
      for(const path of files) await unlink(path).catch(()=>undefined);
      throw error;
    }
  }
}

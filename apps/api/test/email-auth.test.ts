import test from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve, dirname } from "node:path";
import { randomBytes, randomUUID } from "node:crypto";
import { spawn } from "node:child_process";
import { request as httpRequest } from "node:http";
import pg from "pg";
import { Database } from "../src/db.js";
import { secret, hash } from "../src/common.js";
import { readTrialMail } from "../src/mail.js";
import type { Config } from "../src/config.js";
import type { UserView } from "@zm/platform-contracts";

class Client {
  cookie="";csrf="";
  constructor(readonly base:string){}
  async call(path:string, data:unknown={}, method="POST", origin="http://localhost:4300") {
    const response=await fetch(this.base+path,{method,headers:{
      Origin:origin,"Content-Type":"application/json",...(this.cookie?{Cookie:this.cookie}:{}),...(this.csrf?{"X-CSRF-Token":this.csrf}:{})
    },...(method==="GET"?{}:{body:JSON.stringify(data)})});
    for(const cookie of response.headers.getSetCookie()) if(cookie.startsWith("zm_session=")) this.cookie=cookie.split(";")[0]!;
    return {status:response.status,data:await response.json() as Record<string,unknown>};
  }
  async ok(path:string,data:unknown={},method="POST") {
    const result=await this.call(path,data,method);assert.equal(result.status,200,path);return result.data;
  }
  async me():Promise<UserView>{const result=await this.ok("/me",{},"GET") as unknown as UserView;this.csrf=result.csrf;return result;}
}
test("이메일 인증·비밀번호·명시 연결·철회·탈퇴 경계 (독립 DB)",{timeout:180000},async t=>{
  const local=JSON.parse(await readFile(new URL("../../../.trial/config.json",import.meta.url),"utf8")) as Record<string,string>;
  const admin=new pg.Pool({connectionString:local.DATABASE_URL});
  const name="zmemail_"+randomBytes(6).toString("hex"), url=new URL(local.DATABASE_URL!);url.pathname="/"+name;
  await admin.query("CREATE DATABASE "+name);
  const files=await mkdtemp(join(tmpdir(),"zm-os-email-"));
  const cfg:Config={databaseUrl:url.toString(),files,port:14510,assetPort:14511,webOrigin:"http://localhost:4300",assetOrigin:"http://127.0.0.1:14511",testAuth:true,sessionSeconds:3600,codeSeconds:60,statusSeconds:86400,assetSecret:secret()};
  const db=new Database(cfg.databaseUrl);await db.migrate();await db.migrate();
  const child=spawn(process.execPath,["--import","tsx","src/main.ts"],{cwd:new URL("..",import.meta.url),env:{...process.env,ZM_MODE:"local-test",ZM_TEST_AUTH:"1",DATABASE_URL:cfg.databaseUrl,ZM_FILES:files,PORT:String(cfg.port),ASSET_PORT:String(cfg.assetPort),WEB_ORIGIN:cfg.webOrigin,ASSET_ORIGIN:cfg.assetOrigin,ZM_ASSET_SECRET:cfg.assetSecret},stdio:["ignore","pipe","pipe"],windowsHide:true});
  child.stdout.resume();child.stderr.resume();
  const base="http://127.0.0.1:14510/v1", guest=new Client(base), account=new Client(base), second=new Client(base), social=new Client(base);
  const email="person@example.test", pass="아침 산책을 마치고 마시는 커피 42", next="저녁에는 새 책을 읽고 쉽니다 43";
  let firstId="";
  const mail=async(address:string,purpose:string)=>{
    const found=(await readTrialMail(cfg)).find(item=>item.to===address && new URLSearchParams(new URL(item.url).hash.slice(1)).get("email")===purpose);
    assert.ok(found,"발송 대역에 메일 존재");return new URLSearchParams(new URL(found.url).hash.slice(1)).get("token")!;
  };
  const signup=async(address:string,password=pass)=>{
    await guest.ok("/auth/email/signup",{email:address,ageConfirmed:true});
    const token=await mail(address,"signup");
    await guest.ok("/auth/email/complete",{purpose:"signup",token,password});return token;
  };
  try{
    let ready=false;for(let n=0;n<80;n++){try{if((await guest.call("/health",{},"GET")).status===200){ready=true;break;}}catch{/* owned startup */}await new Promise(r=>setTimeout(r,150));}assert.ok(ready);
    await t.test("연령 확인·Origin 검증·인증 전 계정과 세션 발급 금지",async()=>{
      assert.equal((await guest.call("/auth/email/signup",{email,ageConfirmed:false})).status,400);
      assert.equal((await guest.call("/auth/email/signup",{email,ageConfirmed:true},"POST","https://foreign.example")).status,403);
      const response=await guest.ok("/auth/email/signup",{email:" Person@Example.Test ",ageConfirmed:true});
      assert.deepEqual(Object.keys(response),["message"]);
      assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM users")).rows[0].n,0);
      assert.equal((await guest.call("/auth/email/login",{email,password:pass})).status,401);
      assert.equal((await guest.call("/me",{},"GET")).status,401);
      const token=await mail(email,"signup");
      assert.equal((await db.pool.query("SELECT hash FROM email_challenges")).rows[0].hash,hash(token));
      await guest.ok("/auth/email/complete",{purpose:"signup",token,password:pass});
      assert.equal((await guest.call("/me",{},"GET")).status,401);
      assert.equal((await guest.call("/auth/email/complete",{purpose:"signup",token,password:pass})).status,400);
    });
    await t.test("이메일 정규화·로그인 실패·솔트 해시 저장·마지막 수단 보호",async()=>{
      assert.equal((await guest.call("/auth/email/login",{email,password:"wrong"})).status,401);
      await account.ok("/auth/email/login",{email:"PERSON@example.test",password:pass});
      const user=await account.me();firstId=user.id;assert.deepEqual(user.providers,["email"]);assert.equal(user.emailAddress,email);
      const stored=(await db.pool.query("SELECT password_hash FROM email_credentials WHERE user_id=$1",[user.id])).rows[0].password_hash;
      assert.match(stored,/^scrypt\$131072\$8\$1\$/);assert.equal(stored.includes(pass),false);
      assert.notEqual((await account.call("/me/login-identities/email",{},"DELETE")).status,200);
      const known=await guest.ok("/auth/email/reset/request",{email}), unknown=await guest.ok("/auth/email/reset/request",{email:"absent@example.test"});
      assert.deepEqual(known,unknown);
    });
    await t.test("재발급·만료·목적 불일치·재사용 차단과 모든 웹 세션 철회",async()=>{
      const old=await mail(email,"reset");
      await guest.ok("/auth/email/reset/request",{email});
      const token=await mail(email,"reset");
      assert.notEqual(old,token);
      assert.equal((await guest.call("/auth/email/complete",{purpose:"reset",token:old,password:next})).status,400);
      assert.equal((await guest.call("/auth/email/complete",{purpose:"signup",token,password:next})).status,400);
      await second.ok("/auth/email/login",{email,password:pass});await second.me();
      // Two pre-existing executions belong to different browser sessions. Reset must revoke both.
      const app=randomUUID(),version=randomUUID(),appUser=randomUUID(),sessions=[randomUUID(),randomUUID()];
      await db.pool.query("INSERT INTO apps(id,owner_id,name) VALUES($1,$2,'reset fixture')",[app,firstId]);
      await db.pool.query("INSERT INTO versions(id,app_id,version,manifest,hash,consent_hash) VALUES($1,$2,'1.0.0','{}','fixture','fixture')",[version,app]);
      await db.pool.query("INSERT INTO app_users(id,user_id,app_id) VALUES($1,$2,$3)",[appUser,firstId,app]);
      for(const [i,client] of [account,second].entries())await db.pool.query("INSERT INTO app_sessions(id,user_id,web_hash,app_id,app_user_id,version_id,fingerprint,expires_at) VALUES($1,$2,$3,$4,$5,$6,'fixture',now()+interval '1 hour')",[sessions[i],firstId,hash(client.cookie.slice('zm_session='.length)),app,appUser,version]);
      await guest.ok("/auth/email/complete",{purpose:"reset",token,password:next});
      assert.deepEqual((await db.pool.query("SELECT status FROM app_sessions WHERE id=ANY($1::uuid[])",[sessions])).rows.map(row=>row.status),['revoked','revoked']);
      assert.equal((await account.call("/me",{},"GET")).status,401);assert.equal((await second.call("/me",{},"GET")).status,401);
      assert.equal((await guest.call("/auth/email/login",{email,password:pass})).status,401);
      await account.ok("/auth/email/login",{email,password:next});await account.me();
      await guest.ok("/auth/email/reset/request",{email});
      const expired=await mail(email,"reset");await db.pool.query("UPDATE email_challenges SET expires_at=now()-interval '1 second' WHERE hash=$1",[hash(expired)]);
      assert.equal((await guest.call("/auth/email/complete",{purpose:"reset",token:expired,password:pass})).status,400);
    });
    await t.test("소셜 계정에 명시 연결·다른 브라우저의 증명 사용 거부·계정 합병 금지",async()=>{
      await social.ok("/test/login",{subject:"alice",provider:"google",ageConfirmed:true});const user=await social.me();assert.notEqual(user.id,firstId);
      await social.ok("/me/email/link",{email:"linked@example.test"});const token=await mail("linked@example.test","link");
      assert.notEqual((await account.call("/auth/email/complete",{purpose:"link",token,password:pass})).status,200);
      await social.ok("/auth/email/complete",{purpose:"link",token,password:pass});
      assert.deepEqual((await social.me()).providers,["email","google"]);
      await social.ok("/me/email/reauth",{password:pass});
      await social.ok("/me/login-identities/google",{},"DELETE");
      assert.deepEqual((await social.me()).providers,["email"]);
      assert.notEqual((await social.call("/me/login-identities/email",{},"DELETE")).status,200);
      await guest.ok("/auth/email/signup",{email:"linked@example.test",ageConfirmed:true});
      assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM identities WHERE provider='email' AND subject='linked@example.test'")).rows[0].n,1);
    });
    await t.test("비밀번호 변경의 본인 확인·재설정 증명 폐기·이메일 연결 해제",async()=>{
      assert.equal((await account.call("/me/email/password",{password:"wrong",newPassword:pass})).status,401);
      await guest.ok("/auth/email/reset/request",{email});const token=await mail(email,"reset");
      await account.ok("/me/email/password",{password:next,newPassword:pass});
      assert.equal((await account.call("/me",{},"GET")).status,401);
      assert.equal((await guest.call("/auth/email/complete",{purpose:"reset",token,password:next})).status,400);
      await account.ok("/auth/email/login",{email,password:pass});await account.me();
      await account.ok("/test/link",{subject:"bob",provider:"github"});
      await account.ok("/test/reauth",{provider:"github"});
      await account.ok("/me/login-identities/email",{},"DELETE");
      assert.deepEqual((await account.me()).providers,["github"]);
      assert.equal((await guest.call("/auth/email/login",{email,password:pass})).status,401);
      assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM email_credentials WHERE user_id=$1",[firstId])).rows[0].n,0);
    });
    await t.test("탈퇴 시 비밀번호·증명 제거, 같은 이메일 새 가입은 새 사용자",async()=>{
      const address="leave@example.test";await signup(address);const leaving=new Client(base);
      await leaving.ok("/auth/email/login",{email:address,password:pass});const original=await leaving.me();
      await guest.ok("/auth/email/reset/request",{email:address});const token=await mail(address,"reset");
      const receipt=await leaving.ok("/me/withdrawal/prepare");
      await leaving.ok("/me/withdrawal",{confirmed:true,receiptId:receipt.receiptId});
      assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM email_credentials WHERE user_id=$1",[original.id])).rows[0].n,0);
      assert.equal((await guest.call("/auth/email/complete",{purpose:"reset",token,password:next})).status,400);
      await signup(address);await leaving.ok("/auth/email/login",{email:address,password:pass});assert.notEqual((await leaving.me()).id,original.id);
    });
    await t.test("실패해도 제한 횟수가 누적되고 개발 메일함은 다른 origin에서 읽지 못함",async()=>{
      for(let n=0;n<12;n++) assert.equal((await guest.call("/auth/email/login",{email:"rate@example.test",password:pass})).status,401);
      assert.equal((await guest.call("/auth/email/login",{email:"rate@example.test",password:pass})).status,429);
      assert.equal((await fetch("http://127.0.0.1:14512/",{headers:{Origin:"https://foreign.example"}})).status,403);
      const rebound=await new Promise<number|undefined>((resolve,reject)=>{const request=httpRequest("http://127.0.0.1:14512/",{headers:{Host:"rebind.example"}},response=>{response.resume();resolve(response.statusCode);});request.on("error",reject);request.end();});
      assert.equal(rebound,403);
      assert.equal((await fetch("http://127.0.0.1:14512/")).status,200);
    });
  }finally{
    child.kill("SIGTERM");await new Promise<void>(done=>{if(child.exitCode!==null)done();else child.once("exit",()=>done());});
    await db.close();assert.match(name,/^zmemail_[a-f0-9]{12}$/);await admin.query("DROP DATABASE "+name+" WITH (FORCE)");await admin.end();
    assert.equal(dirname(resolve(files)),resolve(tmpdir()));assert.ok(files.startsWith(join(tmpdir(),"zm-os-email-")));await rm(files,{recursive:true,force:true});
  }
});

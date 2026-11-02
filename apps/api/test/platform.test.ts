import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { readFile,mkdtemp,rm,readdir,writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawn } from 'node:child_process';
import pg,{type PoolClient} from 'pg';
import { createZip } from '@zm/cli';
import type { AppManifest,AppSessionView,UserView } from '@zm/platform-contracts';
import { Database } from '../src/db.js';
import { workOnce } from '../src/worker.js';
import { hash,secret } from '../src/common.js';
import type { Config } from '../src/config.js';

interface Result {status:number;data:Record<string,unknown>;response:Response;}
class Client {
  cookie='';csrf='';
  constructor(readonly base:string){}
  async call(path:string,method='GET',body?:unknown,headers:Record<string,string>={}):Promise<Result>{
    const result=await fetch(`${this.base}${path}`,{method,headers:{...(this.cookie?{cookie:this.cookie}:{}),...(this.csrf?{'x-csrf-token':this.csrf}:{}),...(body!==undefined?{'content-type':Buffer.isBuffer(body)?'application/zip':'application/json'}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?new Uint8Array(body):JSON.stringify(body),redirect:'manual'});
    for(const set of result.headers.getSetCookie()){if(set.startsWith('zm_session='))this.cookie=set.split(';')[0]??'';}
    const data:unknown=await result.json().catch(()=>({}));return {status:result.status,data:data as Record<string,unknown>,response:result};
  }
  async ok<T=Record<string,unknown>>(path:string,method='GET',body?:unknown,headers:Record<string,string>={}):Promise<T>{const result=await this.call(path,method,body,headers);assert.equal(result.status,200,`${method} ${path}: ${JSON.stringify(result.data)}`);return result.data as T;}
  async login(subject:'owner'|'alice'|'bob',provider='google'):Promise<UserView>{await this.ok('/test/login','POST',{subject,provider,ageConfirmed:true});const me=await this.ok<UserView>('/me');this.csrf=me.csrf;return me;}
}

test('PostgreSQL + 실제 HTTP 정책 및 실패 경계 (실제 OAuth 네트워크·Android 기기 시험 아님)', {timeout:180000}, async t=>{
  const local:Record<string,string>=JSON.parse(await readFile(new URL('../../../.trial/config.json',import.meta.url),'utf8'));
  const admin=new pg.Pool({connectionString:local.DATABASE_URL});const databaseName=`zmtest_${randomBytes(5).toString('hex')}`;
  await admin.query(`CREATE DATABASE ${databaseName}`);const url=new URL(local.DATABASE_URL!);url.pathname=`/${databaseName}`;
  const files=await mkdtemp(join(tmpdir(),'zm-os-api-test-'));
  const cfg:Config={databaseUrl:url.toString(),files,port:14410,assetPort:14411,webOrigin:'http://localhost:4300',assetOrigin:'http://127.0.0.1:14411',testAuth:true,sessionSeconds:3600,codeSeconds:60,statusSeconds:86400,assetSecret:secret()};
  const db=new Database(cfg.databaseUrl);await db.migrate();
  const child=spawn(process.execPath,['--import','tsx','src/main.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,ZM_MODE:'local-test',ZM_TEST_AUTH:'1',DATABASE_URL:cfg.databaseUrl,ZM_FILES:files,PORT:String(cfg.port),ASSET_PORT:String(cfg.assetPort),WEB_ORIGIN:cfg.webOrigin,ASSET_ORIGIN:cfg.assetOrigin,ZM_ASSET_SECRET:cfg.assetSecret,GOOGLE_CLIENT_ID:'test-only-'+secret(),GOOGLE_CLIENT_SECRET:secret(),GITHUB_CLIENT_ID:'test-only-'+secret(),GITHUB_CLIENT_SECRET:secret()},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let logs='';child.stdout.on('data',b=>{logs+=String(b);});child.stderr.on('data',b=>{logs+=String(b);});
  const base=`http://127.0.0.1:${cfg.port}/v1`;const guest=new Client(base),owner=new Client(base),alice=new Client(base),bob=new Client(base);
  try{
    let ready=false;for(let n=0;n<60;n++){try{if((await guest.call('/health')).status===200){ready=true;break;}}catch{/* The owned HTTP process is still starting. */}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs);
    const ownerUser=await owner.login('owner'),aliceUser=await alice.login('alice'),bobUser=await bob.login('bob');
    await t.test('로컬 운영자 CLI의 조회·권한 부여·회수와 마지막 운영자 보호',async()=>{
      const runAdmin=async(action:string,id?:string):Promise<{exitCode:number|null;stdout:string;stderr:string}>=>{
        const command=spawn(process.execPath,['--import','tsx','src/admin.ts',action,...(id?[id]:[])],{cwd:new URL('..',import.meta.url),env:{...process.env,ZM_MODE:'local-test',ZM_TEST_AUTH:'1',DATABASE_URL:cfg.databaseUrl,ZM_FILES:files,PORT:String(cfg.port),ASSET_PORT:String(cfg.assetPort),WEB_ORIGIN:cfg.webOrigin,ASSET_ORIGIN:cfg.assetOrigin,ZM_ASSET_SECRET:cfg.assetSecret},stdio:['ignore','pipe','pipe'],windowsHide:true});
        let stdout='',stderr='';command.stdout.on('data',chunk=>{stdout+=String(chunk);});command.stderr.on('data',chunk=>{stderr+=String(chunk);});
        return new Promise((resolve,reject)=>{command.once('error',reject);command.once('close',exitCode=>resolve({exitCode,stdout,stderr}));});
      };
      const listed=await runAdmin('list');assert.equal(listed.exitCode,0,listed.stderr);const accounts=JSON.parse(listed.stdout) as Array<{id:string;operator:boolean}>;
      assert.deepEqual(accounts.map(account=>account.id).sort(),[ownerUser.id,aliceUser.id,bobUser.id].sort());assert.equal(accounts.find(account=>account.id===ownerUser.id)?.operator,true);
      const last=await runAdmin('revoke',ownerUser.id);assert.equal(last.exitCode,1);assert.match(last.stderr,/LAST_OPERATOR/);assert.equal((await owner.ok<UserView>('/me')).operator,true);
      const grant=await runAdmin('grant',bobUser.id);assert.equal(grant.exitCode,0,grant.stderr);assert.equal((await bob.ok<UserView>('/me')).operator,true);assert.equal((await bob.call('/operator/users')).status,200);
      const revoke=await runAdmin('revoke',bobUser.id);assert.equal(revoke.exitCode,0,revoke.stderr);assert.equal((await bob.ok<UserView>('/me')).operator,false);assert.equal((await bob.call('/operator/users')).status,403);
      const audit=(await db.pool.query<{action:string}>('SELECT action FROM audit_events WHERE target_id=$1 AND action LIKE \'operator.local_%\' ORDER BY created_at',[bobUser.id])).rows;assert.deepEqual(audit.map(row=>row.action),['operator.local_grant','operator.local_revoke']);
    });
    await t.test('자가 확인·CSRF·공개 Store/비공개 계정·운영자 경계',async()=>{
      assert.equal((await guest.call('/me')).status,401);assert.equal((await guest.call('/store/apps')).status,200);
      assert.equal((await guest.call('/test/login','POST',{subject:'bob',provider:'github',ageConfirmed:false})).status,409);
      assert.equal((await alice.call('/operator/users')).status,403);
      assert.equal((await alice.call('/developer/apps','POST',{name:'unauthorized'},{'x-csrf-token':'wrong'})).status,403);
      assert.equal((await guest.call('/test/login','POST',{subject:'owner',provider:'google',ageConfirmed:true},{origin:'null'})).status,403);
    });
    await t.test('개발자 신청·사유·보완·재신청·승인',async()=>{
      const first=await alice.ok<{id:string}>('/developer/applications','POST',{displayName:'테스트 개발자',email:'developer@example.test',description:'개인 메모 앱'});
      assert.equal((await alice.call('/developer/applications','POST',{displayName:'중복',email:'developer@example.test',description:'중복 신청'})).status,409);
      await owner.ok(`/operator/developer-applications/${first.id}/decisions`,'POST',{decision:'changes_requested',reason:'앱 설명 보완'});
      const second=await alice.ok<{id:string}>('/developer/applications','POST',{displayName:'테스트 개발자',email:'developer@example.test',description:'로컬과 외부 API 예제 앱'});
      await owner.ok(`/operator/developer-applications/${second.id}/decisions`,'POST',{decision:'approved',reason:'범위 확인'});
      assert.equal((await alice.ok<UserView>('/me')).developer,true);
    });
    const memo=await alice.ok<{id:string}>('/developer/apps','POST',{name:'로컬 메모'}),external=await alice.ok<{id:string}>('/developer/apps','POST',{name:'외부 메모'});
    async function bundle(appId:string,externalApi=false,version='1.0.0'):Promise<Buffer>{
      const manifest:AppManifest={schemaVersion:1,appId,version,name:externalApi?'외부 메모':'로컬 메모',description:'시험 번들',category:'tools',entry:'index.html',permissions:externalApi?['local-storage','app-identity','external-api']:['local-storage'],apiOrigins:externalApi?['http://localhost:4320']:[],privacyNotice:'시험 범위 내에 저장합니다.'};
      return createZip([{path:'manifest.json',data:Buffer.from(JSON.stringify(manifest))},{path:'index.html',data:Buffer.from('<!doctype html><title>시험</title><p>앱 자원</p>')},{path:'한글 폴더/시험 파일.JS',data:Buffer.from('globalThis.assetBoundary = "encoded-path";')}]);
    }
    async function publish(appId:string,externalApi=false,version='1.0.0'):Promise<string>{
      const zip=await bundle(appId,externalApi,version);
      const result=await alice.ok<{id:string}>(`/developer/apps/${appId}/versions`,'POST',zip);assert.equal((await bob.call(`/developer/versions/${result.id}/submit`,'POST',{})).status,403);
      assert.equal((await alice.call(`/developer/apps/${appId}/releases`,'POST',{versionId:result.id,revision:0})).status,409);
      assert.ok(await workOnce(db,cfg));await alice.ok(`/developer/versions/${result.id}/submit`,'POST',{});
      await owner.ok(`/operator/versions/${result.id}/decisions`,'POST',{decision:'approved',reason:'시험 번들 확인'});
      const apps=await alice.ok<Array<{id:string;revision:number}>>('/developer/apps');const current=apps.find(a=>a.id===appId)!;
      assert.equal((await owner.call(`/developer/apps/${appId}/releases`,'POST',{versionId:result.id,revision:current.revision})).status,403);
      await alice.ok(`/developer/apps/${appId}/releases`,'POST',{versionId:result.id,revision:current.revision},{'idempotency-key':`release-${result.id}`});
      const count=(await readdir(join(files,'uploads'))).length;assert.equal((await alice.call(`/developer/apps/${appId}/versions`,'POST',zip)).status,409);assert.equal((await readdir(join(files,'uploads'))).length,count);
      return result.id;
    }
    let memoVersion='';
    await t.test('불변 번들 검사→검수→소유자 공개·중복 업로드 파일 누수 없음',async()=>{memoVersion=await publish(memo.id);await publish(external.id,true);assert.equal((await guest.ok<unknown[]>('/store/apps')).length,2);});
    await t.test('파일 기록 뒤 DB INSERT 실패 시 업로드 원문과 행을 함께 정리',async()=>{
      const before=(await readdir(join(files,'uploads'))).sort();
      await db.pool.query("CREATE FUNCTION reject_trial_version() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN IF NEW.version='9.9.9' THEN PERFORM pg_sleep(1); RAISE EXCEPTION 'injected version insert failure'; END IF; RETURN NEW; END $$");
      await db.pool.query('CREATE TRIGGER reject_trial_version BEFORE INSERT ON versions FOR EACH ROW EXECUTE FUNCTION reject_trial_version()');
      try{
        const response=alice.call(`/developer/apps/${memo.id}/versions`,'POST',await bundle(memo.id,false,'9.9.9'));
        let observedFile=false;
        for(let n=0;n<100;n++){if((await readdir(join(files,'uploads'))).some(name=>!before.includes(name))){observedFile=true;break;}await new Promise(resolve=>setTimeout(resolve,20));}
        assert.equal(observedFile,true,'DB 실패 전에 실제 업로드 파일 기록을 관찰해야 한다');
        assert.equal((await response).status,500);assert.deepEqual((await readdir(join(files,'uploads'))).sort(),before);
        assert.equal((await db.pool.query("SELECT count(*)::int AS count FROM versions WHERE version='9.9.9'")).rows[0]?.count,0);
      }finally{await db.pool.query('DROP TRIGGER reject_trial_version ON versions');await db.pool.query('DROP FUNCTION reject_trial_version()');}
    });
    await t.test('파일 준비 뒤 멈춘 worker의 lease 만료·재시도와 이전 revision 결과 차단',async()=>{
      const version=await alice.ok<{id:string}>(`/developer/apps/${memo.id}/versions`,'POST',await bundle(memo.id,false,'2.0.0'));
      let reachedCommit:()=>void=()=>undefined,resumeCommit:()=>void=()=>undefined;
      const reached=new Promise<void>(resolve=>{reachedCommit=resolve;});const resume=new Promise<void>(resolve=>{resumeCommit=resolve;});
      class PausedDatabase extends Database {
        calls=0;
        override async transaction<T>(fn:(client:PoolClient)=>Promise<T>):Promise<T>{if(++this.calls===2){reachedCommit();await resume;}return super.transaction(fn);}
      }
      const delayed=new PausedDatabase(cfg.databaseUrl);const oldWorker=workOnce(delayed,cfg);
      try{
        await Promise.race([reached,new Promise<never>((_,reject)=>setTimeout(()=>reject(new Error('worker did not prepare files')),10000).unref())]);
        assert.ok((await readdir(join(files,'prepared',`${version.id}-1`))).includes('index.html'));
        assert.equal((await db.pool.query('SELECT asset_revision FROM versions WHERE id=$1',[version.id])).rows[0]?.asset_revision,null);
        await db.pool.query("UPDATE bundle_jobs SET lease_until=now()-interval '1 second' WHERE version_id=$1",[version.id]);
        assert.equal(await workOnce(db,cfg),true);
        const prepared=await db.pool.query('SELECT validation_status,asset_revision FROM versions WHERE id=$1',[version.id]);assert.equal(prepared.rows[0]?.validation_status,'passed');assert.equal(prepared.rows[0]?.asset_revision,2);
        // An obsolete worker's files can differ, but it must never select its old directory after losing the lease.
        await writeFile(join(files,'prepared',`${version.id}-1`,'index.html'),'obsolete worker output');resumeCommit();await oldWorker;
        assert.equal((await db.pool.query('SELECT asset_revision FROM versions WHERE id=$1',[version.id])).rows[0]?.asset_revision,2);
        assert.notEqual(await readFile(join(files,'prepared',`${version.id}-2`,'index.html'),'utf8'),'obsolete worker output');
        assert.equal((await db.pool.query('SELECT current_version_id FROM apps WHERE id=$1',[memo.id])).rows[0]?.current_version_id,memoVersion);
      }finally{resumeCommit();await oldWorker;await delayed.close();}
    });
    let externalPreviewUserId='',externalLiveUserId='';
    await t.test('비공개 미리보기는 소유자·운영자와 검사 통과 판에 한정',async()=>{
      const draft=await alice.ok<{id:string}>('/developer/apps','POST',{name:'비공개 미리보기 시험'});
      const version=await alice.ok<{id:string}>(`/developer/apps/${draft.id}/versions`,'POST',await bundle(draft.id));
      assert.equal((await alice.call('/preview-sessions','POST',{versionId:version.id,confirmed:true})).status,409);
      assert.equal((await bob.call('/preview-sessions','POST',{versionId:version.id,confirmed:true})).status,404);
      await workOnce(db,cfg);
      assert.equal((await guest.call(`/store/apps/${draft.id}`)).status,404);
      const preview=await alice.ok<AppSessionView>('/preview-sessions','POST',{versionId:version.id,confirmed:true});assert.equal(preview.isPreview,true);assert.equal(preview.versionId,version.id);
      assert.equal((await owner.ok<AppSessionView>('/preview-sessions','POST',{versionId:version.id,confirmed:true})).isPreview,true);
      assert.equal((await bob.call(`/app-sessions/${preview.id}`)).status,403);assert.equal((await fetch(preview.documentUrl)).status,200);
      const record=(await db.pool.query('SELECT review_status FROM versions WHERE id=$1',[version.id])).rows[0];assert.equal(record?.review_status,'not_submitted');assert.equal((await guest.call(`/store/apps/${draft.id}`)).status,404);
      await consent(alice,memo.id);const published=await alice.ok<AppSessionView>('/app-sessions','POST',{appId:memo.id});const sameAppPreview=await alice.ok<AppSessionView>('/preview-sessions','POST',{versionId:memoVersion,confirmed:true});assert.notEqual(sameAppPreview.appUserId,published.appUserId);
      await consent(alice,external.id);const externalLive=await alice.ok<AppSessionView>('/app-sessions','POST',{appId:external.id});
      const externalVersion=(await db.pool.query('SELECT current_version_id FROM apps WHERE id=$1',[external.id])).rows[0]?.current_version_id as string;
      const externalPreview=await alice.ok<AppSessionView>('/preview-sessions','POST',{versionId:externalVersion,confirmed:true});externalLiveUserId=externalLive.appUserId;externalPreviewUserId=externalPreview.appUserId;assert.notEqual(externalPreviewUserId,externalLiveUserId);
      await alice.ok(`/developer/apps/${draft.id}/closure-requests`,'POST',{});await owner.ok(`/operator/apps/${draft.id}/closure-confirmations`,'POST',{reason:'미리보기 시험 정리'});assert.equal((await alice.call(`/app-sessions/${preview.id}`)).status,403);
    });
    async function consent(client:Client,id:string):Promise<void>{const info=await client.ok<{fingerprint:string}>(`/apps/${id}/consent`);await client.ok(`/me/app-consents/${id}`,'PUT',{fingerprint:info.fingerprint});}
    let memoSession:AppSessionView,externalSession:AppSessionView;
    await t.test('동의 전 실행 거부·실행별 자원·계정 격리',async()=>{
      assert.equal((await bob.call('/app-sessions','POST',{appId:memo.id})).status,409);await consent(bob,memo.id);await consent(bob,external.id);
      memoSession=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:memo.id});externalSession=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:external.id});
      assert.notEqual(memoSession.appUserId,externalSession.appUserId);assert.notEqual(memoSession.appUserId,bobUser.id);
      assert.equal((await alice.call(`/app-sessions/${memoSession.id}`)).status,403);
      const asset=await fetch(memoSession.documentUrl);assert.equal(asset.status,200);assert.match(asset.headers.get('content-security-policy')??'',/sandbox allow-scripts/);
      const encodedAsset=new URL('./'+encodeURIComponent('한글 폴더')+'/'+encodeURIComponent('시험 파일.JS'),memoSession.documentUrl);const script=await fetch(encodedAsset);assert.equal(script.status,200);assert.match(script.headers.get('content-type')??'',/^text\/javascript/);assert.equal(await script.text(),'globalThis.assetBoundary = "encoded-path";');
      assert.equal((await fetch(memoSession.documentUrl.replace(/\/\d+\.[A-Za-z0-9_-]+\//,'/bad/'))).status,403);
      await bob.ok(`/me/apps/${memo.id}`,'PUT',{});
    });
    let serverSecret='';
    await t.test('서버 자격·PKCE·단회 코드·다른 앱 권한 거부',async()=>{
      const credentials=await alice.ok<{secret:string}>(`/developer/apps/${external.id}/credentials`,'POST',{});serverSecret=credentials.secret;
      const verifier=secret(),challenge=createHash('sha256').update(verifier).digest('base64url');const code=await bob.ok<{code:string}>(`/app-sessions/${externalSession!.id}/authorization-codes`,'POST',{challenge});
      const basic={Authorization:`Basic ${Buffer.from(`${external.id}:${serverSecret}`).toString('base64')}`};
      assert.equal((await guest.call('/app-auth/exchange','POST',{code:code.code,verifier:secret()},basic)).status,401);
      const token=await guest.ok<{token:string;appUserId:string}>('/app-auth/exchange','POST',{code:code.code,verifier},basic);assert.equal(token.appUserId,externalSession!.appUserId);
      assert.equal((await guest.call('/app-auth/exchange','POST',{code:code.code,verifier},basic)).status,401);
      assert.equal((await guest.ok<{active:boolean}>('/app-auth/introspect','POST',{token:token.token},basic)).active,true);
      await bob.ok(`/me/app-consents/${external.id}`,'DELETE');assert.equal((await guest.ok<{active:boolean}>('/app-auth/introspect','POST',{token:token.token},basic)).active,false);
      await consent(bob,external.id);assert.equal((await bob.call(`/app-sessions/${externalSession!.id}`)).status,403);
      externalSession=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:external.id});
    });
    async function appState(appId:string,status:string):Promise<void>{const all=await owner.ok<Array<{id:string;revision:number}>>('/operator/apps');await owner.ok(`/operator/apps/${appId}/availability`,'PUT',{status,reason:'정책 시험',revision:all.find(a=>a.id===appId)!.revision});}
    await t.test('일반 중지/긴급 중지·내 앱 목록 유지·이전 실행 복구 금지',async()=>{
      await appState(memo.id,'normal_suspended');await bob.ok(`/app-sessions/${memoSession!.id}`);assert.equal((await bob.call('/app-sessions','POST',{appId:memo.id})).status,403);
      const mine=await bob.ok<Array<{id:string;available:boolean}>>('/me/apps');assert.equal(mine.find(a=>a.id===memo.id)?.available,false);
      await appState(memo.id,'emergency_suspended');assert.equal((await bob.call(`/app-sessions/${memoSession!.id}`)).status,403);assert.equal((await fetch(memoSession!.documentUrl)).status,403);
      await appState(memo.id,'allowed');assert.equal((await bob.call(`/app-sessions/${memoSession!.id}`)).status,403);
    });
    await t.test('사용자 정지와 앱 소유자 정지 분리·이전 로그인 부활 방지',async()=>{
      await owner.ok(`/operator/users/${aliceUser.id}/availability`,'PUT',{status:'suspended',reason:'계정 정지 시험'});await bob.ok(`/app-sessions/${externalSession!.id}`);
      assert.equal((await alice.call('/developer/apps')).status,403);await owner.ok(`/operator/users/${aliceUser.id}/availability`,'PUT',{status:'active',reason:'해제'});
      assert.equal((await alice.call('/developer/apps')).status,403);await alice.login('alice');await alice.ok('/developer/apps');
      await owner.ok(`/operator/users/${bobUser.id}/availability`,'PUT',{status:'suspended',reason:'사용자 정지'});assert.equal((await bob.call(`/app-sessions/${externalSession!.id}`)).status,403);
      await owner.ok(`/operator/users/${bobUser.id}/availability`,'PUT',{status:'active',reason:'해제'});await bob.login('bob');assert.equal((await bob.call(`/app-sessions/${externalSession!.id}`)).status,403);
      assert.equal((await owner.call(`/operator/users/${ownerUser.id}/availability`,'PUT',{status:'suspended',reason:'마지막 운영자'})).status,409);
    });
    await t.test('공개 요청 재전송은 이후 공개 중단을 취소하지 않음',async()=>{
      const apps=await alice.ok<Array<{id:string;revision:number}>>('/developer/apps');const revision=apps.find(a=>a.id===memo.id)!.revision;
      await alice.ok(`/developer/apps/${memo.id}/releases`,'POST',{versionId:memoVersion,revision},{'idempotency-key':'retry-release-once'});
      await alice.ok(`/developer/apps/${memo.id}/publication`,'PUT',{published:false,revision:revision+1});
      await alice.ok(`/developer/apps/${memo.id}/releases`,'POST',{versionId:memoVersion,revision},{'idempotency-key':'retry-release-once'});
      assert.equal((await alice.ok<Array<{id:string;published:boolean}>>('/developer/apps')).find(a=>a.id===memo.id)?.published,false);
    });
    await t.test('서로 다른 계정 합병 금지·마지막 로그인 해제 금지',async()=>{
      await alice.ok('/test/link','POST',{provider:'github',subject:'alice'});
      assert.equal((await bob.call('/test/link','POST',{provider:'github',subject:'alice'})).status,409);
      await alice.ok('/me/login-identities/github','DELETE');assert.equal((await alice.call('/me/login-identities/google','DELETE')).status,403);
    });
    await t.test('두 로그인 수단의 동시 해제에서 하나의 수단과 성공 세션을 보존',async()=>{
      await alice.ok('/test/link','POST',{provider:'github',subject:'alice'});
      const google=new Client(base),github=new Client(base);assert.equal((await google.login('alice','google')).id,aliceUser.id);assert.equal((await github.login('alice','github')).id,aliceUser.id);
      const outcomes=await Promise.all([google.call('/me/login-identities/github','DELETE'),github.call('/me/login-identities/google','DELETE')]);
      assert.equal(outcomes.filter(result=>result.status===200).length,1);assert.equal(outcomes.filter(result=>result.status===401||result.status===403).length,1);
      const identities=(await db.pool.query<{provider:string}>('SELECT provider FROM identities WHERE user_id=$1',[aliceUser.id])).rows;assert.equal(identities.length,1);
      assert.equal((await alice.login('alice',identities[0]!.provider)).id,aliceUser.id);
    });
    await t.test('공개와 운영 중지가 같은 revision으로 경합하면 한 요청만 반영',async()=>{
      const before=(await alice.ok<Array<{id:string;revision:number}>>('/developer/apps')).find(app=>app.id===memo.id)!;
      const outcomes=await Promise.all([alice.call(`/developer/apps/${memo.id}/releases`,'POST',{versionId:memoVersion,revision:before.revision}),owner.call(`/operator/apps/${memo.id}/availability`,'PUT',{status:'normal_suspended',reason:'공개와 중지 경합',revision:before.revision})]);
      assert.deepEqual(outcomes.map(result=>result.status).sort(),[200,409]);
      const after=(await owner.ok<Array<{id:string;revision:number;availability:string;published:boolean}>>('/operator/apps')).find(app=>app.id===memo.id)!;assert.equal(after.revision,before.revision+1);
      if(outcomes[0]!.status===200){assert.equal(after.published,true);assert.equal(after.availability,'allowed');}else assert.equal(after.availability,'normal_suspended');
      await appState(memo.id,'allowed');
    });
    await t.test('신고 비공개·신고만으로 중지되지 않음',async()=>{
      await bob.ok(`/apps/${external.id}/reports`,'POST',{reason:'시험 신고'});const list=await bob.ok<Array<{id:string}>>('/me/reports');assert.equal(list.length,1);assert.equal((await alice.ok<unknown[]>('/me/reports')).length,0);
      await owner.ok(`/operator/reports/${list[0]!.id}/decisions`,'POST',{status:'resolved',reason:'검토 완료'});assert.equal((await guest.call(`/store/apps/${external.id}`)).status,200);
    });
    let lookupSecret='';
    await t.test('탈퇴·외부 삭제 처리·조회 전용 자격·새 계정 격리',async()=>{
      const ownerReceipt=await alice.ok<{receiptId:string;lookupSecret:string}>('/me/withdrawal/prepare','POST',{});
      const ownerWithdrawal=await alice.ok<{status:string}>('/me/withdrawal','POST',{confirmed:true,receiptId:ownerReceipt.receiptId});assert.equal(ownerWithdrawal.status,'owner_closure_required');
      externalSession=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:external.id});
      assert.equal((await bob.call('/me/withdrawal','POST',{confirmed:true,receiptId:ownerReceipt.receiptId})).status,409);
      const receipt=await bob.ok<{receiptId:string;lookupSecret:string}>('/me/withdrawal/prepare','POST',{});lookupSecret=receipt.lookupSecret;
      assert.equal((await guest.ok<{platformStatus:string}>('/withdrawal-status','GET',undefined,{Authorization:`Bearer ${lookupSecret}`})).platformStatus,'not_requested');
      // Deliberately discard the final response body: the lookup credential was safely obtained before withdrawal.
      const finalResponse=await fetch(base+'/me/withdrawal',{method:'POST',headers:{cookie:bob.cookie,'x-csrf-token':bob.csrf,'content-type':'application/json'},body:JSON.stringify({confirmed:true,receiptId:receipt.receiptId})});assert.equal(finalResponse.status,200);await finalResponse.body?.cancel();
      assert.equal((await bob.call('/me')).status,401);assert.equal((await guest.call('/me','GET',undefined,{Authorization:`Bearer ${lookupSecret}`})).status,401);
      await workOnce(db,cfg);const status=await guest.ok<{platformStatus:string;external:unknown[]}>('/withdrawal-status','GET',undefined,{Authorization:`Bearer ${lookupSecret}`});assert.equal(status.platformStatus,'completed');assert.equal(status.external.length,1);
      const requests=await alice.ok<Array<{id:string;appUserId:string}>>('/developer/deletion-requests');assert.equal(requests[0]!.appUserId,externalSession.appUserId);
      await alice.ok(`/developer/deletion-requests/${requests[0]!.id}/results`,'POST',{status:'developer_reported_completed',note:'시험 데이터 삭제 결과 등록'});
      const next=await bob.login('bob');assert.notEqual(next.id,bobUser.id);await consent(bob,external.id);const nextSession=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:external.id});assert.notEqual(nextSession.appUserId,externalSession.appUserId);
      assert.equal((await alice.ok<Array<{appUserId:string}>>('/developer/deletion-requests'))[0]!.appUserId,externalSession.appUserId);
    });
    await t.test('승인 취소 후 공개 중단·종료 요청 허용, 새 개발·재공개 차단',async()=>{
      await owner.ok(`/operator/developers/${aliceUser.id}/revoke`,'POST',{reason:'시험 취소'});assert.equal((await alice.call('/developer/apps','POST',{name:'불가'})).status,403);
      const list=await alice.ok<Array<{id:string;revision:number}>>('/developer/apps');const current=list.find(a=>a.id===external.id)!;
      await alice.ok(`/developer/apps/${external.id}/publication`,'PUT',{published:false,revision:current.revision});assert.equal((await alice.call(`/developer/apps/${external.id}/publication`,'PUT',{published:true,revision:current.revision+1})).status,403);
      await alice.ok(`/developer/apps/${external.id}/closure-requests`,'POST',{});await owner.ok(`/operator/apps/${external.id}/closure-confirmations`,'POST',{reason:'소유자 요청 확인'});
      await alice.ok(`/developer/apps/${memo.id}/closure-requests`,'POST',{});await owner.ok(`/operator/apps/${memo.id}/closure-confirmations`,'POST',{reason:'소유자 요청 확인'});
      const receipt=await alice.ok<{receiptId:string;lookupSecret:string}>('/me/withdrawal/prepare','POST',{});const result=await alice.ok<{status:string;lookupSecret?:string}>('/me/withdrawal','POST',{confirmed:true,receiptId:receipt.receiptId});assert.equal(result.status,'withdrawn');assert.equal(result.lookupSecret,undefined);
      const deletionIds=(await db.pool.query<{app_user_id:string}>('SELECT d.app_user_id FROM deletion_requests d JOIN withdrawals w ON w.id=d.withdrawal_id WHERE w.user_id=$1 AND d.app_id=$2',[aliceUser.id,external.id])).rows.map(r=>r.app_user_id).sort();assert.deepEqual(deletionIds,[externalLiveUserId,externalPreviewUserId].sort());
    });
    await t.test('만료된 삭제 조회 자격·소진된 worker lease 처리',async()=>{
      await db.pool.query("UPDATE withdrawals SET expires_at=now()-interval '1 second' WHERE secret_hash=$1",[hash(lookupSecret)]);assert.equal((await guest.call('/withdrawal-status','GET',undefined,{Authorization:`Bearer ${lookupSecret}`})).status,404);
      await db.pool.query("UPDATE bundle_jobs SET status='running',attempts=3,lease_until=now()-interval '1 second' WHERE version_id=$1",[memoVersion]);await workOnce(db,cfg);
      assert.equal((await db.pool.query('SELECT status FROM bundle_jobs WHERE version_id=$1',[memoVersion])).rows[0]?.status,'failed');
    });
    await t.test('네이티브 단회 코드·PKCE·bootstrap 재사용 차단',async()=>{
      const me=await bob.ok<UserView>('/me'),verifier=secret(),code=secret();await db.pool.query("INSERT INTO native_codes(hash,user_id,provider,provider_subject,challenge,expires_at) VALUES($1,$2,'google','trial:bob',$3,now()+interval '1 minute')",[hash(code),me.id,createHash('sha256').update(verifier).digest('base64url')]);
      assert.equal((await guest.call('/auth/native/exchange','POST',{code,verifier:secret()})).status,401);
      const value=await guest.ok<{bootstrapTicket:string}>('/auth/native/exchange','POST',{code,verifier});assert.equal((await guest.call('/auth/native/exchange','POST',{code,verifier})).status,401);
      assert.equal((await guest.call('/auth/native/bootstrap','POST',{ticket:value.bootstrapTicket})).status,303);assert.equal((await guest.call('/auth/native/bootstrap','POST',{ticket:value.bootstrapTicket})).status,401);
    });
    async function nativeCode(client:Client,provider='google',bindSource=true):Promise<{code:string;verifier:string}>{
      const me=await client.ok<UserView>('/me');const identity=(await db.pool.query<{subject:string}>('SELECT subject FROM identities WHERE user_id=$1 AND provider=$2',[me.id,provider])).rows[0]!;
      const verifier=secret(),code=secret(),source=bindSource?hash(client.cookie.slice('zm_session='.length)):null;
      await db.pool.query("INSERT INTO native_codes(hash,user_id,provider,provider_subject,source_session,challenge,expires_at) VALUES($1,$2,$3,$4,$5,$6,now()+interval '1 minute')",[hash(code),me.id,provider,identity.subject,source,createHash('sha256').update(verifier).digest('base64url')]);return {code,verifier};
    }
    await t.test('제공자 해제 후 네이티브 코드·미사용 bootstrap으로 로그인하지 못함',async()=>{
      await bob.ok('/test/link','POST',{provider:'github',subject:'bob'});
      const oldCode=await nativeCode(bob,'github'),toExchange=await nativeCode(bob,'github');
      const ticket=await guest.ok<{bootstrapTicket:string}>('/auth/native/exchange','POST',toExchange);
      await bob.ok('/me/login-identities/github','DELETE');
      assert.equal((await guest.call('/auth/native/exchange','POST',oldCode)).status,401);
      assert.equal((await guest.call('/auth/native/bootstrap','POST',{ticket:ticket.bootstrapTicket})).status,401);
      await bob.ok('/test/link','POST',{provider:'github',subject:'bob'});
      try{
        assert.equal((await guest.call('/auth/native/exchange','POST',oldCode)).status,401,'같은 제공자를 다시 연결해도 해제 전 코드를 복구하지 않는다');
        assert.equal((await guest.call('/auth/native/bootstrap','POST',{ticket:ticket.bootstrapTicket})).status,401,'다시 연결해도 해제 전 bootstrap을 복구하지 않는다');
      }finally{await bob.ok('/me/login-identities/github','DELETE');}
    });
    await t.test('원본 웹 세션 로그아웃 후 네이티브 연결 코드·bootstrap 거부',async()=>{
      await bob.login('bob');const oldCode=await nativeCode(bob),toExchange=await nativeCode(bob);
      const ticket=await guest.ok<{bootstrapTicket:string}>('/auth/native/exchange','POST',toExchange);
      await bob.ok('/logout','POST',{});
      assert.equal((await guest.call('/auth/native/exchange','POST',oldCode)).status,401);
      assert.equal((await guest.call('/auth/native/bootstrap','POST',{ticket:ticket.bootstrapTicket})).status,401);
      await bob.login('bob');
    });
    await t.test('정지 중 생성한 네이티브 세션은 해제 뒤에도 재인증 전 제한 유지',async()=>{
      const me=await bob.ok<UserView>('/me');const nativeBrowser=new Client(base);
      await owner.ok(`/operator/users/${me.id}/availability`,'PUT',{status:'suspended',reason:'네이티브 정지 경계 시험'});
      // Model a fresh provider proof received while suspended, not an old credential issued before suspension.
      const code=await nativeCode(bob,'google',false);const ticket=await guest.ok<{bootstrapTicket:string}>('/auth/native/exchange','POST',code);
      assert.equal((await nativeBrowser.call('/auth/native/bootstrap','POST',{ticket:ticket.bootstrapTicket})).status,303);
      const suspended=await nativeBrowser.ok<UserView>('/me');nativeBrowser.csrf=suspended.csrf;assert.equal(suspended.status,'suspended');assert.equal(suspended.requiresReauth,true);
      assert.equal((await nativeBrowser.call('/me/apps')).status,403);
      await owner.ok(`/operator/users/${me.id}/availability`,'PUT',{status:'active',reason:'네이티브 정지 해제 시험'});
      assert.equal((await nativeBrowser.ok<UserView>('/me')).requiresReauth,true);assert.equal((await nativeBrowser.call('/me/apps')).status,403);
      await nativeBrowser.ok('/test/reauth','POST',{provider:'google'});const reauthenticated=await nativeBrowser.ok<UserView>('/me');assert.equal(reauthenticated.requiresReauth,false);
      await bob.login('bob');
    });
    await t.test('정지 전에 발급한 미사용 네이티브 코드·티켓은 정지 해제로 부활하지 않음',async()=>{
      const me=await bob.ok<UserView>('/me');const oldCode=await nativeCode(bob),oldSigninCode=await nativeCode(bob,'google',false),toExchange=await nativeCode(bob);
      const ticket=await guest.ok<{bootstrapTicket:string}>('/auth/native/exchange','POST',toExchange);
      await owner.ok(`/operator/users/${me.id}/availability`,'PUT',{status:'suspended',reason:'미사용 네이티브 인증 철회 시험'});
      await owner.ok(`/operator/users/${me.id}/availability`,'PUT',{status:'active',reason:'정지 해제 후 새 인증 필요'});
      try{
        assert.equal((await guest.call('/auth/native/exchange','POST',oldCode)).status,401);
        assert.equal((await guest.call('/auth/native/exchange','POST',oldSigninCode)).status,401);
        assert.equal((await guest.call('/auth/native/bootstrap','POST',{ticket:ticket.bootstrapTicket})).status,401);
      }finally{await bob.login('bob');}
    });
    await t.test('네이티브 연결 시작 표의 단회 소비·원본 세션 결합 (제공자 URL은 따라가지 않음)',async()=>{
      const challenge=createHash('sha256').update(secret()).digest('base64url');
      const prepared=await bob.ok<{startUrl:string}>('/auth/native/prepare','POST',{provider:'google',intent:'reauth',challenge});
      const url=new URL(prepared.startUrl),route=url.pathname.replace(/^\/v1/,'')+url.search;
      const start=await guest.call(route);assert.equal(start.status,302);assert.equal(new URL(start.response.headers.get('location')!).origin,'https://accounts.google.com');
      assert.equal((await guest.call(route)).status,401);
      const pending=await bob.ok<{startUrl:string}>('/auth/native/prepare','POST',{provider:'google',intent:'reauth',challenge});const pendingUrl=new URL(pending.startUrl);
      await bob.ok('/logout','POST',{});assert.equal((await guest.call(pendingUrl.pathname.replace(/^\/v1/,'')+pendingUrl.search)).status,401);
      const invalidRedirect=new URLSearchParams({platform:'android',challenge,redirectUri:'https://untrusted.example.invalid/return'});
      assert.equal((await guest.call('/auth/google/start?'+invalidRedirect)).status,400);
    });
  }finally{
    child.kill('SIGTERM');await new Promise<void>(resolve=>{if(child.exitCode!==null)resolve();else{child.once('exit',()=>resolve());setTimeout(()=>{child.kill('SIGKILL');resolve();},3000).unref();}});
    await db.close();await admin.query(`DROP DATABASE ${databaseName} WITH (FORCE)`);await admin.end();await rm(files,{recursive:true,force:true});
  }
});

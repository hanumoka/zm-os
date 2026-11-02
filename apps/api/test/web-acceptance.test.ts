import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes,createHash } from 'node:crypto';
import { readFile,mkdtemp,rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join,resolve,dirname } from 'node:path';
import { spawn } from 'node:child_process';
import pg from 'pg';
import { createZip } from '@zm/cli';
import type { AppManifest,AppSessionView,AppConsentView,DeveloperProfileView,UserView } from '@zm/platform-contracts';
import { Database } from '../src/db.js';
import { workOnce } from '../src/worker.js';
import { secret } from '../src/common.js';
import type { Config } from '../src/config.js';

class Client {
  cookie='';csrf='';
  constructor(readonly base:string){}
  async call(path:string,method='GET',body?:unknown,headers:Record<string,string>={}){
    const response=await fetch(this.base+path,{method,headers:{...(this.cookie?{cookie:this.cookie}:{}),...(this.csrf?{'x-csrf-token':this.csrf}:{}),...(body!==undefined?{'content-type':Buffer.isBuffer(body)?'application/zip':'application/json'}:{}),...headers},body:body===undefined?undefined:Buffer.isBuffer(body)?new Uint8Array(body):JSON.stringify(body),redirect:'manual'});
    for(const cookie of response.headers.getSetCookie())if(cookie.startsWith('zm_session='))this.cookie=cookie.split(';')[0]!;
    const data:unknown=await response.json().catch(()=>({}));return {status:response.status,data};
  }
  async ok<T=Record<string,unknown>>(path:string,method='GET',body?:unknown,headers:Record<string,string>={}):Promise<T>{const result=await this.call(path,method,body,headers);assert.equal(result.status,200,`${method} ${path}: ${JSON.stringify(result.data)}`);return result.data as T;}
  async login(subject:'owner'|'alice'|'bob'){await this.ok('/test/login','POST',{subject,provider:'google',ageConfirmed:true});const user=await this.ok<UserView>('/me');this.csrf=user.csrf;return user;}
}

test('웹 인수 조건의 권한·동의 이력·공개·재승인 경계 (모의 로그인, 별도 DB)',{timeout:180000},async t=>{
  const local:Record<string,string>=JSON.parse(await readFile(new URL('../../../.trial/config.json',import.meta.url),'utf8'));
  const admin=new pg.Pool({connectionString:local.DATABASE_URL});
  const name=`zmwebtest_${randomBytes(6).toString('hex')}`;
  await admin.query(`CREATE DATABASE ${name}`);
  const url=new URL(local.DATABASE_URL!);url.pathname='/'+name;
  const files=await mkdtemp(join(tmpdir(),'zm-os-web-api-'));
  const cfg:Config={databaseUrl:url.toString(),files,port:14420,assetPort:14421,webOrigin:'http://localhost:4300',assetOrigin:'http://127.0.0.1:14421',testAuth:true,sessionSeconds:3600,codeSeconds:60,statusSeconds:86400,assetSecret:secret()};
  const db=new Database(cfg.databaseUrl);await db.migrate();
  const child=spawn(process.execPath,['--import','tsx','src/main.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,ZM_MODE:'local-test',ZM_TEST_AUTH:'1',DATABASE_URL:cfg.databaseUrl,ZM_FILES:files,PORT:String(cfg.port),ASSET_PORT:String(cfg.assetPort),WEB_ORIGIN:cfg.webOrigin,ASSET_ORIGIN:cfg.assetOrigin,ZM_ASSET_SECRET:cfg.assetSecret},stdio:['ignore','pipe','pipe'],windowsHide:true});
  let logs='';child.stdout.on('data',b=>{logs+=String(b);});child.stderr.on('data',b=>{logs+=String(b);});
  const base=`http://127.0.0.1:${cfg.port}/v1`,guest=new Client(base),owner=new Client(base),alice=new Client(base),bob=new Client(base);
  try{
    let ready=false;for(let n=0;n<60;n++){try{if((await guest.call('/health')).status===200){ready=true;break;}}catch{/* Owned API starting. */}await new Promise(r=>setTimeout(r,200));}assert.ok(ready,logs);
    const ownerUser=await owner.login('owner'),aliceUser=await alice.login('alice');await bob.login('bob');
    await t.test('유효 CSRF의 미승인 사용자 등록 거부·연락 이메일 비공개',async()=>{
      assert.deepEqual(await alice.ok('/developer/profile'),{status:'none',reason:''});
      assert.equal((await alice.call('/developer/apps','POST',{name:'승인 전 등록'})).status,403);
      assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM apps')).rows[0].n,0);
      const pending=await alice.ok<{id:string}>('/developer/applications','POST',{displayName:'웹 시험 개발자',email:'private-contact@example.test',description:'권한·동의 시험'});
      assert.equal((await guest.call('/developer/application')).status,401);
      assert.equal((await bob.call('/operator/developer-applications')).status,403);
      assert.ok(!JSON.stringify(await bob.ok('/developer/application')).includes('private-contact@example.test'));
      await owner.ok(`/operator/developer-applications/${pending.id}/decisions`,'POST',{decision:'approved',reason:'개인 도구 범위 확인'});
      const second=await bob.ok<{id:string}>('/developer/applications','POST',{displayName:'다른 개발자',email:'other@example.test',description:'다른 소유자 권한 시험'});
      await owner.ok(`/operator/developer-applications/${second.id}/decisions`,'POST',{decision:'approved',reason:'범위 확인'});
    });
    const app=await alice.ok<{id:string}>('/developer/apps','POST',{name:'웹 인수 메모'});
    const other=await alice.ok<{id:string}>('/developer/apps','POST',{name:'별도 외부 앱'});
    async function bundle(id:string,version:string,notice='개인 메모 저장'):Promise<Buffer>{
      const manifest:AppManifest={schemaVersion:1,appId:id,version,name:id===app.id?'웹 인수 메모':'별도 외부 앱',description:'인수 시험',category:'tools',entry:'index.html',permissions:['local-storage','app-identity','external-api'],apiOrigins:['http://localhost:4320'],privacyNotice:notice};
      return createZip([{path:'manifest.json',data:Buffer.from(JSON.stringify(manifest))},{path:'index.html',data:Buffer.from('<!doctype html><title>인수 시험</title><p>'+version+'</p>')}]);
    }
    async function upload(id:string,version:string,notice?:string){const v=await alice.ok<{id:string}>(`/developer/apps/${id}/versions`,'POST',await bundle(id,version,notice));assert.equal(await workOnce(db,cfg),true);return v.id;}
    async function approve(version:string){await alice.ok(`/developer/versions/${version}/submit`,'POST',{});await owner.ok(`/operator/versions/${version}/decisions`,'POST',{decision:'approved',reason:'인수 시험'});}
    async function state(id=app.id){return (await db.pool.query<{revision:number;published:boolean;current_version_id:string|null;availability:string}>('SELECT revision,published,current_version_id,availability FROM apps WHERE id=$1',[id])).rows[0]!;}
    async function release(id:string,version:string){await alice.ok(`/developer/apps/${id}/releases`,'POST',{versionId:version,revision:(await state(id)).revision});}
    async function consent(client:Client,id=app.id){const info=await client.ok<{fingerprint:string}>(`/apps/${id}/consent`);await client.ok(`/me/app-consents/${id}`,'PUT',{fingerprint:info.fingerprint});return info.fingerprint;}
    async function availability(status:string){await owner.ok(`/operator/apps/${app.id}/availability`,'PUT',{status,revision:(await state()).revision,reason:'인수 상태 시험'});}
    const v1=await upload(app.id,'1.0.0');
    await t.test('소유권 고정·승인된 다른 개발자와 운영자의 대리 변경 거부',async()=>{
      assert.equal((await db.pool.query('SELECT owner_id FROM apps WHERE id=$1',[app.id])).rows[0].owner_id,aliceUser.id);
      assert.equal((await alice.call('/developer/apps','POST',{name:'소유권 위조',ownerId:ownerUser.id})).status,400);
      for(const client of [bob,owner]){
        assert.equal((await client.call(`/developer/apps/${app.id}/versions`,'POST',await bundle(app.id,'9.0.0'))).status,403);
        assert.equal((await client.call(`/developer/versions/${v1}/submit`,'POST',{})).status,403);
        assert.equal((await client.call(`/developer/apps/${app.id}/releases`,'POST',{versionId:v1,revision:0})).status,403);
      }
      assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM versions WHERE app_id=$1',[app.id])).rows[0].n,1);
    });
    await t.test('검수 전 공개 거부·승인 자체는 공개하지 않음·소유자 공개 뒤 방문자 제한',async()=>{
      assert.equal((await alice.call(`/developer/apps/${app.id}/releases`,'POST',{versionId:v1,revision:0})).status,409);
      await approve(v1);
      assert.equal((await state()).current_version_id,null);assert.equal((await state()).published,false);
      assert.equal((await guest.call(`/store/apps/${app.id}`)).status,404);
      assert.notEqual((await bob.call('/app-sessions','POST',{appId:app.id})).status,200);
      await release(app.id,v1);
      assert.equal((await guest.call(`/store/apps/${app.id}`)).status,200);
      assert.ok(!JSON.stringify(await guest.ok('/store/apps')).includes('private-contact@example.test'));
      for(const path of ['/me/apps','/me/app-consents'])assert.equal((await guest.call(path)).status,401);
      assert.equal((await guest.call('/app-sessions','POST',{appId:app.id})).status,401);
      assert.equal((await guest.call(`/me/apps/${app.id}`,'PUT',{})).status,401);
      assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM app_sessions')).rows[0].n,0);
      assert.equal((await db.pool.query('SELECT count(*)::int AS n FROM my_apps')).rows[0].n,0);
    });
    let running:AppSessionView;
    await t.test('공개 중단·내 앱 제거 뒤에도 본인 이용 이력과 철회 경로 유지',async()=>{
      await consent(bob);running=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:app.id});
      await bob.ok(`/me/apps/${app.id}`,'PUT',{});await bob.ok(`/me/apps/${app.id}`,'DELETE');
      assert.deepEqual(await alice.ok('/me/app-consents'),[]);
      await alice.ok(`/developer/apps/${app.id}/publication`,'PUT',{published:false,revision:(await state()).revision});
      assert.equal((await guest.call(`/store/apps/${app.id}`)).status,404);assert.deepEqual(await bob.ok('/me/apps'),[]);
      const history=await bob.ok<AppConsentView[]>('/me/app-consents');assert.equal(history.length,1);assert.equal(history[0]!.available,false);assert.equal(history[0]!.revokedAt,null);
      assert.deepEqual(Object.keys(history[0]!).sort(),['appId','available','name','revokedAt','unavailableReason']);
      await bob.ok(`/app-sessions/${running.id}`);assert.equal((await bob.call('/app-sessions','POST',{appId:app.id})).status,403);assert.equal((await state()).availability,'allowed');
      await bob.ok(`/me/app-consents/${app.id}`,'DELETE');assert.equal((await bob.call(`/app-sessions/${running.id}`)).status,403);
      assert.ok((await bob.ok<AppConsentView[]>('/me/app-consents'))[0]!.revokedAt);
      await alice.ok(`/developer/apps/${app.id}/publication`,'PUT',{published:true,revision:(await state()).revision});
      assert.equal((await bob.call('/app-sessions','POST',{appId:app.id})).status,409);
    });
    await t.test('동의 범위 변경 재동의·새 실행 버전·기존 실행 버전 고정',async()=>{
      const fingerprint=await consent(bob);running=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:app.id});
      const v2=await upload(app.id,'2.0.0');await approve(v2);assert.equal((await state()).current_version_id,v1);await release(app.id,v2);
      assert.equal((await bob.ok<AppSessionView>(`/app-sessions/${running.id}`)).versionId,v1);
      assert.equal((await bob.ok<AppSessionView>('/app-sessions','POST',{appId:app.id})).versionId,v2);
      const v3=await upload(app.id,'3.0.0','개인 메모와 새 이용 범위 안내');await approve(v3);await release(app.id,v3);
      assert.equal((await bob.call('/app-sessions','POST',{appId:app.id})).status,409);
      assert.equal((await bob.call(`/me/app-consents/${app.id}`,'PUT',{fingerprint})).status,409);
      assert.notEqual(await consent(bob),fingerprint);assert.equal((await bob.call(`/app-sessions/${running.id}`)).status,403);
      running=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:app.id});assert.equal(running.versionId,v3);
    });
    await t.test('다른 앱 자격의 코드 교환·권한 조회 거부와 긴급 중지 권한 소멸',async()=>{
      const otherVersion=await upload(other.id,'1.0.0');await approve(otherVersion);await release(other.id,otherVersion);await consent(bob,other.id);
      const secondRun=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:other.id});assert.notEqual(secondRun.appUserId,running.appUserId);
      const headers=async(id:string)=>{const credential=await alice.ok<{secret:string}>(`/developer/apps/${id}/credentials`,'POST',{});return {Authorization:'Basic '+Buffer.from(id+':'+credential.secret).toString('base64')};};
      const firstAuth=await headers(app.id),otherAuth=await headers(other.id);
      const verifier=secret(),challenge=createHash('sha256').update(verifier).digest('base64url');
      const code=await bob.ok<{code:string}>(`/app-sessions/${running.id}/authorization-codes`,'POST',{challenge});
      assert.equal((await guest.call('/app-auth/exchange','POST',{code:code.code,verifier},otherAuth)).status,401);
      const token=await guest.ok<{token:string;appUserId:string}>('/app-auth/exchange','POST',{code:code.code,verifier},firstAuth);
      assert.equal(token.appUserId,running.appUserId);
      for(const field of ['userId','name','email','provider','providers'])assert.equal(Object.hasOwn(token,field),false);
      assert.equal((await guest.ok<{active:boolean}>('/app-auth/introspect','POST',{token:token.token},otherAuth)).active,false);
      assert.equal((await guest.ok<{active:boolean}>('/app-auth/introspect','POST',{token:token.token},firstAuth)).active,true);
      await availability('emergency_suspended');assert.equal((await guest.ok<{active:boolean}>('/app-auth/introspect','POST',{token:token.token},firstAuth)).active,false);
      assert.equal((await alice.call(`/developer/apps/${app.id}/publication`,'PUT',{published:true,revision:(await state()).revision})).status,409);
      assert.equal((await state()).availability,'emergency_suspended');await availability('allowed');
    });
    await t.test('승인 취소 사유·기존 앱 유지·재신청 중 제한·재승인과 앱 중지는 독립',async()=>{
      running=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:app.id});
      const draft=await upload(app.id,'4.0.0');
      await owner.ok(`/operator/developers/${aliceUser.id}/revoke`,'POST',{reason:'연락 정보 보완'});
      assert.deepEqual(await alice.ok<DeveloperProfileView>('/developer/profile'),{status:'revoked',reason:'연락 정보 보완'});
      assert.equal((await alice.ok<UserView>('/me')).developer,false);assert.equal((await state()).published,true);
      await bob.ok(`/app-sessions/${running.id}`);await bob.ok('/app-sessions','POST',{appId:app.id});
      assert.equal((await alice.call('/developer/apps','POST',{name:'취소 뒤 등록'})).status,403);
      assert.equal((await alice.call(`/developer/apps/${app.id}/versions`,'POST',await bundle(app.id,'5.0.0'))).status,403);
      assert.equal((await alice.call(`/developer/versions/${draft}/submit`,'POST',{})).status,403);
      await alice.ok(`/developer/apps/${other.id}/publication`,'PUT',{published:false,revision:(await state(other.id)).revision});
      assert.equal((await alice.call(`/developer/apps/${other.id}/publication`,'PUT',{published:true,revision:(await state(other.id)).revision})).status,403);
      await availability('normal_suspended');
      const application=await alice.ok<{id:string}>('/developer/applications','POST',{displayName:'웹 시험 개발자',email:'new-contact@example.test',description:'연락 정보 수정'});
      assert.equal((await alice.ok<DeveloperProfileView>('/developer/profile')).status,'revoked');
      await owner.ok(`/operator/developer-applications/${application.id}/decisions`,'POST',{decision:'approved',reason:'연락 정보 재확인'});
      assert.deepEqual(await alice.ok('/developer/profile'),{status:'approved',reason:''});
      assert.equal((await state()).availability,'normal_suspended');assert.equal((await bob.call('/app-sessions','POST',{appId:app.id})).status,403);
      await bob.ok(`/app-sessions/${running.id}`);
    });
    await t.test('기존 취소 사유 마이그레이션·반복 실행과 재승인 사유 초기화',async()=>{
      await owner.ok(`/operator/developers/${aliceUser.id}/revoke`,'POST',{reason:'이전 스키마 취소 기록'});
      await db.pool.query('ALTER TABLE developers ALTER COLUMN reason DROP NOT NULL');await db.pool.query('UPDATE developers SET reason=NULL WHERE user_id=$1',[aliceUser.id]);
      await db.migrate();await db.migrate();
      assert.equal((await alice.ok<DeveloperProfileView>('/developer/profile')).reason,'이전 스키마 취소 기록');
      assert.deepEqual(await bob.ok('/developer/profile'),{status:'approved',reason:''});
      assert.equal((await guest.call('/developer/profile')).status,401);
      assert.equal((await owner.call(`/operator/developers/${ownerUser.id}/revoke`,'POST',{reason:'미등록 개발자'})).status,404);
    });
    await t.test('계정 정지 해제로 개발자 취소·앱 중지·철회 상태가 복구되지 않음',async()=>{
      await availability('allowed');await consent(alice);
      await alice.ok(`/me/app-consents/${app.id}`,'DELETE');await availability('normal_suspended');
      await owner.ok(`/operator/users/${aliceUser.id}/availability`,'PUT',{status:'suspended',reason:'독립 상태 확인'});
      await owner.ok(`/operator/users/${aliceUser.id}/availability`,'PUT',{status:'active',reason:'계정만 해제'});
      assert.equal((await alice.call('/developer/profile')).status,403);
      await alice.login('alice');assert.equal((await alice.ok<DeveloperProfileView>('/developer/profile')).status,'revoked');
      assert.equal((await state()).availability,'normal_suspended');
      assert.ok((await alice.ok<AppConsentView[]>('/me/app-consents')).find(item=>item.appId===app.id)?.revokedAt);
      assert.equal((await db.pool.query("SELECT count(*)::int AS n FROM consents WHERE user_id=$1 AND app_id=$2 AND revoked_at IS NULL",[aliceUser.id,app.id])).rows[0].n,0);
      assert.equal((await alice.call('/app-sessions','POST',{appId:app.id})).status,403);
    });
    await t.test('운영자 자기 앱도 같은 검수 절차·자기 검수 이력·승인만으로 공개하지 않음',async()=>{
      const application=await owner.ok<{id:string}>('/developer/applications','POST',{displayName:'운영자 개발자',email:'operator@example.test',description:'자기 검수 절차 시험'});
      await owner.ok(`/operator/developer-applications/${application.id}/decisions`,'POST',{decision:'approved',reason:'개인 도구 범위'});
      const own=await owner.ok<{id:string}>('/developer/apps','POST',{name:'운영자 자기 앱'});
      const version=await owner.ok<{id:string}>(`/developer/apps/${own.id}/versions`,'POST',await bundle(own.id,'1.0.0'));
      assert.equal((await owner.call(`/developer/versions/${version.id}/submit`,'POST',{})).status,409);
      await workOnce(db,cfg);await owner.ok(`/developer/versions/${version.id}/submit`,'POST',{});
      await owner.ok(`/operator/versions/${version.id}/decisions`,'POST',{decision:'approved',reason:'자기 앱 동일 검수'});
      assert.equal((await db.pool.query("SELECT detail->>'selfReview' AS self FROM audit_events WHERE action='version.reviewed' AND target_id=$1",[version.id])).rows[0].self,'true');
      assert.equal((await state(own.id)).published,false);assert.equal((await state(own.id)).current_version_id,null);
      assert.equal((await guest.call(`/store/apps/${own.id}`)).status,404);
    });
    await t.test('삭제 worker 전 재가입·새 계정 데이터 보존·외부 삭제 결과의 소유자 경계',async()=>{
      await availability('allowed');
      const oldUser=await bob.ok<UserView>('/me'),oldRun=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:app.id});
      await db.pool.query("UPDATE web_sessions SET reauth_at=now()-interval '10 minutes' WHERE user_id=$1",[oldUser.id]);
      assert.equal((await bob.call('/me/withdrawal/prepare','POST',{})).status,403);
      await bob.ok('/test/reauth','POST',{provider:'google'});
      const receipt=await bob.ok<{receiptId:string;lookupSecret:string}>('/me/withdrawal/prepare','POST',{});
      await bob.ok('/me/withdrawal','POST',{confirmed:true,receiptId:receipt.receiptId});
      const statusHeaders={Authorization:'Bearer '+receipt.lookupSecret};
      assert.equal((await guest.ok<{platformStatus:string}>('/withdrawal-status','GET',undefined,statusHeaders)).platformStatus,'queued');
      const next=await bob.login('bob');assert.notEqual(next.id,oldUser.id);
      await consent(bob);await bob.ok(`/me/apps/${app.id}`,'PUT',{});
      const nextRun=await bob.ok<AppSessionView>('/app-sessions','POST',{appId:app.id});assert.notEqual(nextRun.appUserId,oldRun.appUserId);
      assert.equal(await workOnce(db,cfg),true);assert.equal(await workOnce(db,cfg),false);
      assert.equal((await bob.ok<UserView>('/me')).id,next.id);
      assert.equal((await bob.ok<Array<{id:string}>>('/me/apps'))[0]!.id,app.id);
      assert.equal((await bob.ok<AppConsentView[]>('/me/app-consents'))[0]!.revokedAt,null);
      assert.equal((await bob.ok<AppSessionView>(`/app-sessions/${nextRun.id}`)).appUserId,nextRun.appUserId);
      const requests=await alice.ok<Array<{id:string;appId:string;appUserId:string;status:string}>>('/developer/deletion-requests');
      const request=requests.find(item=>item.appId===app.id)!;assert.equal(request.appUserId,oldRun.appUserId);assert.equal(request.status,'pending');
      for(const client of [bob,owner])assert.equal((await client.call(`/developer/deletion-requests/${request.id}/results`,'POST',{status:'developer_reported_completed',note:'대리 처리 시도'})).status,403);
      await alice.ok(`/developer/deletion-requests/${request.id}/results`,'POST',{status:'developer_reported_completed',note:'외부 삭제 결과 보고'});
      const status=await guest.ok<{platformStatus:string;external:Array<{status:string}>}>('/withdrawal-status','GET',undefined,statusHeaders);
      assert.equal(status.platformStatus,'completed');assert.ok(status.external.some(item=>item.status==='developer_reported_completed'));
      assert.equal((await guest.call('/me','GET',undefined,statusHeaders)).status,401);
      assert.equal((await guest.call('/withdrawal-status','GET',undefined,{Authorization:'Bearer '+secret()})).status,404);
    });
  }finally{
    child.kill('SIGTERM');await new Promise<void>(done=>{if(child.exitCode!==null)done();else{child.once('exit',()=>done());setTimeout(()=>{child.kill('SIGKILL');done();},3000).unref();}});
    await db.close();await admin.query(`DROP DATABASE ${name} WITH (FORCE)`);await admin.end();
    assert.equal(dirname(resolve(files)),resolve(tmpdir()));assert.ok(files.startsWith(join(tmpdir(),'zm-os-web-api-')));await rm(files,{recursive:true,force:true});
  }
});

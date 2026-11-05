import test from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, dirname, resolve } from 'node:path';
import { spawn, type ChildProcess } from 'node:child_process';
import pg from 'pg';
import { CLOUD_LIMITS, type AppManifest, type AppSessionView, type CloudRecord, type CloudWriteResult, type UserView } from '@zm/platform-contracts';
import { Database } from '../src/db.js';
import { fingerprint, secret } from '../src/common.js';
import { workOnce } from '../src/worker.js';
import type { Config } from '../src/config.js';

class Client {
  cookie='';csrf=''; userId='';
  constructor(readonly base:string){}
  async call(path:string,body?:unknown,method=body===undefined?'GET':'POST') {
    const response=await fetch(this.base+path,{method,headers:{cookie:this.cookie,'x-csrf-token':this.csrf,...(body!==undefined?{'content-type':'application/json'}:{})},body:body===undefined?undefined:JSON.stringify(body)});
    for(const value of response.headers.getSetCookie())if(value.startsWith('zm_session='))this.cookie=value.split(';')[0]!;
    return {status:response.status,data:await response.json() as Record<string,unknown>};
  }
  async ok<T=Record<string,unknown>>(path:string,body?:unknown,method?:string):Promise<T>{const r=await this.call(path,body,method);assert.equal(r.status,200,JSON.stringify(r.data));return r.data as T;}
  async login(subject:string){await this.ok('/test/login',{subject,provider:'google',ageConfirmed:true});const me=await this.ok<UserView>('/me');this.csrf=me.csrf;this.userId=me.id;return me;}
  cloud<T=CloudRecord>(session:AppSessionView,method:string,params:unknown){return this.ok<T>('/app-sessions/'+session.id+'/cloud',{method,params});}
}
test('개인 서버 저장: 실제 PostgreSQL·HTTP의 계정 격리·영속성·충돌·삭제', {timeout:180000}, async t=>{
  const local=JSON.parse(await readFile(new URL('../../../.trial/config.json',import.meta.url),'utf8')) as Record<string,string>;
  const admin=new pg.Pool({connectionString:local.DATABASE_URL}),name='zmcloud_'+randomBytes(6).toString('hex');
  await admin.query('CREATE DATABASE '+name);const url=new URL(local.DATABASE_URL!);url.pathname='/'+name;
  const files=await mkdtemp(join(tmpdir(),'zm-cloud-test-'));
  const cfg:Config={databaseUrl:url.toString(),files,port:14710,assetPort:14711,webOrigin:'http://localhost:4300',assetOrigin:'http://127.0.0.1:14711',testAuth:true,sessionSeconds:3600,codeSeconds:60,statusSeconds:86400,assetSecret:secret()};
  const db=new Database(cfg.databaseUrl);await db.migrate();let child:ChildProcess|undefined;
  const base='http://127.0.0.1:14710/v1',a=new Client(base),b=new Client(base),other=new Client(base),owner=new Client(base);
  async function stop(){if(child&&child.exitCode===null){const stopped=new Promise<void>(done=>child!.once('close',()=>done()));child.kill();await stopped;}}
  async function start(){
    child=spawn(process.execPath,['--import','tsx','src/main.ts'],{cwd:new URL('..',import.meta.url),env:{...process.env,ZM_MODE:'local-test',ZM_TEST_AUTH:'1',DATABASE_URL:cfg.databaseUrl,ZM_FILES:files,PORT:'14710',ASSET_PORT:'14711',WEB_ORIGIN:cfg.webOrigin,ASSET_ORIGIN:cfg.assetOrigin,ZM_ASSET_SECRET:cfg.assetSecret},stdio:'ignore',windowsHide:true});
    for(let i=0;i<80;i++){try{if((await fetch(base+'/health')).ok)return;}catch{/* own process starting */}await new Promise(r=>setTimeout(r,100));}throw Error('cloud test API startup timeout');
  }
  async function app(permission=true){
    const id=randomUUID(),version=randomUUID();
    const manifest:AppManifest={schemaVersion:1,appId:id,version:'1.0.0',name:'저장 시험',description:'시험',entry:'index.html',category:'tools',permissions:permission?['cloud-storage']:[],apiOrigins:[],privacyNotice:'시험 전용'};
    await db.transaction(async tx=>{
      await tx.query("INSERT INTO apps(id,owner_id,name,published,current_version_id) VALUES($1,$2,'시험',true,$3)",[id,owner.userId,version]);
      await tx.query("INSERT INTO versions(id,app_id,version,manifest,hash,consent_hash,validation_status,review_status,asset_revision) VALUES($1,$2,'1.0.0',$3,$4,$5,'passed','approved',1)",[version,id,manifest,'a'.repeat(64),fingerprint(manifest)]);
    });return {id,version};
  }
  async function launch(client:Client,id:string){const consent=await client.ok<{fingerprint:string}>('/apps/'+id+'/consent');await client.ok('/me/app-consents/'+id,{fingerprint:consent.fingerprint},'PUT');return client.ok<AppSessionView>('/app-sessions',{appId:id});}
  const put=(r:CloudRecord,value:unknown)=>({key:'note',generation:r.generation,expectedRevision:r.revision,requestId:randomUUID(),value,schemaVersion:1});
  try{
    await start();await a.login('alice');await b.login('alice');await other.login('bob');await owner.login('owner');
    const main=await app(),second=await app(),denied=await app(false);
    let sa=await launch(a,main.id),sb=await launch(b,main.id);
    const so=await launch(other,main.id),s2=await launch(a,second.id),no=await launch(a,denied.id);
    let first:CloudRecord;
    await t.test('다른 로그인 세션에서 같은 메모 조회·서버 프로세스 재실행 후 유지',async()=>{
      first=await a.cloud(sa,'cloud.get',{key:'note'});assert.equal(first.exists,false);
      await a.cloud(sa,'cloud.put',put(first,{text:'영속 메모'}));
      assert.deepEqual((await b.cloud(sb,'cloud.get',{key:'note'})).value,{text:'영속 메모'});
      await stop();await start();assert.deepEqual((await b.cloud(sb,'cloud.get',{key:'note'})).value,{text:'영속 메모'});
    });
    await t.test('계정·앱·검수 영역 및 매니페스트·CSRF·임의 인자 접근 분리',async()=>{
      assert.equal((await other.cloud(so,'cloud.get',{key:'note'})).exists,false);
      assert.equal((await a.cloud(s2,'cloud.get',{key:'note'})).exists,false);
      assert.equal((await other.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.get',params:{key:'note'}})).status,403);
      assert.equal((await a.call('/app-sessions/'+no.id+'/cloud',{method:'cloud.get',params:{key:'note'}})).status,403);
      const csrf=a.csrf;a.csrf='';assert.equal((await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.get',params:{key:'note'}})).status,403);a.csrf=csrf;
      assert.equal((await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.get',params:{key:'note',appUserId:so.appUserId}})).status,400);
      const preview=await owner.ok<AppSessionView>('/preview-sessions',{versionId:main.version,confirmed:true});
      assert.equal((await owner.cloud(preview,'cloud.get',{key:'note'})).exists,false);
      await owner.cloud(preview,'cloud.put',put(await owner.cloud(preview,'cloud.get',{key:'note'}),{text:'검수 메모'}));
      assert.deepEqual((await a.cloud(sa,'cloud.get',{key:'note'})).value,{text:'영속 메모'});
    });
    await t.test('동시 수정은 한 건만 성공하고 오래된 수정·중복 ID의 다른 내용은 거부',async()=>{
      const old=await a.cloud(sa,'cloud.get',{key:'note'}),data=put(old,{text:'한 번만'});
      const result=await a.cloud<CloudWriteResult>(sa,'cloud.put',data);
      assert.deepEqual(await a.cloud(sa,'cloud.put',data),result);
      const reused=await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.put',params:{...data,value:{text:'다른 값'}}});assert.equal(reused.data.code,'CLOUD_REQUEST_REUSED');
      const stale=await b.call('/app-sessions/'+sb.id+'/cloud',{method:'cloud.put',params:put(old,{text:'늦음'})});assert.equal(stale.data.code,'CLOUD_REVISION_CONFLICT');
      const now=await a.cloud(sa,'cloud.get',{key:'note'});
      const both=await Promise.all([a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.put',params:put(now,{text:'A'})}),b.call('/app-sessions/'+sb.id+'/cloud',{method:'cloud.put',params:put(now,{text:'B'})})]);
      assert.deepEqual(both.map(r=>r.status).sort(),[200,409]);
    });
    await t.test('본문·전체 용량·잘못된 문자열 제한은 기존 값을 보존',async()=>{
      const now=await a.cloud(sa,'cloud.get',{key:'note'});
      const big=await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.put',params:put(now,'x'.repeat(CLOUD_LIMITS.recordBytes))});assert.equal(big.status,413);
      const nul=await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.put',params:put(now,'\u0000')});assert.equal(nul.status,400);
      await db.pool.query("UPDATE cloud_spaces SET used_bytes=$2 WHERE app_user_id=$1",[sa.appUserId,CLOUD_LIMITS.spaceBytes]);
      assert.equal((await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.put',params:{...put(now,'extra'),key:'new-key',expectedRevision:0}})).status,413);
      await db.pool.query("UPDATE cloud_spaces SET used_bytes=(SELECT COALESCE(sum(bytes),0) FROM cloud_records WHERE app_user_id=$1) WHERE app_user_id=$1",[sa.appUserId]);
      assert.deepEqual((await a.cloud(sa,'cloud.get',{key:'note'})).value,now.value);
    });
    await t.test('키 삭제는 과거 쓰기를 차단하며 본문을 재시도 기록에 남기지 않음',async()=>{
      const now=await a.cloud(sa,'cloud.get',{key:'note'}),data={key:'note',generation:now.generation,expectedRevision:now.revision,requestId:randomUUID()};
      const removed=await a.cloud<CloudWriteResult>(sa,'cloud.remove',data);assert.equal(removed.exists,false);
      assert.deepEqual(await a.cloud(sa,'cloud.remove',data),removed);
      const read=await a.cloud(sa,'cloud.get',{key:'note'});assert.equal(read.value,null);assert.equal(read.revision,now.revision+1);
      assert.equal((await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.put',params:put(now,{text:'과거 값'})})).status,409);
      const rows=(await db.pool.query('SELECT result FROM cloud_receipts WHERE app_user_id=$1',[sa.appUserId])).rows;
      assert.ok(rows.every(row=>!Object.hasOwn(row.result,'value')));
    });
    await t.test('키 목록 페이지는 본인 데이터만 반환·삭제한 키 제외',async()=>{
      const record=await a.cloud(sa,'cloud.get',{key:'note'});
      for(const key of ['a-key','b-key','c-key'])await a.cloud(sa,'cloud.put',{...put(record,'value'),key,expectedRevision:0});
      const list=await a.cloud<{keys:string[];nextCursor:string}>(sa,'cloud.list',{limit:2});assert.deepEqual(list.keys,['a-key','b-key']);
      assert.deepEqual((await a.cloud<{keys:string[]}>(sa,'cloud.list',{cursor:list.nextCursor})).keys,['c-key']);
    });
    await t.test('일반 중지의 기존 실행은 유지·동의 철회는 재시도도 차단·목록 제거는 보존',async()=>{
      await db.pool.query("UPDATE apps SET availability='normal_suspended' WHERE id=$1",[main.id]);
      assert.ok(await a.cloud(sa,'cloud.get',{key:'a-key'}));
      await db.pool.query("UPDATE apps SET availability='allowed' WHERE id=$1",[main.id]);
      await a.ok('/me/apps/'+main.id,undefined,'DELETE');assert.ok((await a.cloud(sa,'cloud.get',{key:'a-key'})).exists);
      await a.ok('/me/app-consents/'+main.id,undefined,'DELETE');
      assert.equal((await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.get',params:{key:'a-key'}})).status,403);
      sa=await launch(a,main.id);sb=await launch(b,main.id);
    });
    await t.test('전체 삭제는 다른 세션을 종료하고 새 실행에서도 과거 세대 쓰기를 거부',async()=>{
      const before=await a.cloud(sa,'cloud.get',{key:'note'});
      assert.equal((await a.call('/me/apps/'+main.id+'/cloud-clear',{confirmed:true,expectedUserId:other.userId})).status,409);
      await a.ok('/me/apps/'+main.id+'/cloud-clear',{confirmed:true,expectedUserId:a.userId});
      assert.equal((await b.call('/app-sessions/'+sb.id+'/cloud',{method:'cloud.get',params:{key:'note'}})).status,403);
      sa=await launch(a,main.id);sb=await launch(b,main.id);
      const after=await a.cloud(sa,'cloud.get',{key:'note'});assert.notEqual(after.generation,before.generation);assert.equal(after.exists,false);
      const old=await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.put',params:put(before,{text:'되살리지 않음'})});assert.equal(old.data.code,'CLOUD_STALE_GENERATION');
    });
    await t.test('요청 제한 및 검수 영역 전체 삭제는 일반 영역에 영향 없음',async()=>{
      await db.pool.query('UPDATE cloud_spaces SET requests=$2 WHERE app_user_id=$1',[sa.appUserId,CLOUD_LIMITS.requestsPerMinute]);
      assert.equal((await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.get',params:{key:'note'}})).status,429);
      await db.pool.query('UPDATE cloud_spaces SET requests=0 WHERE app_user_id=$1',[sa.appUserId]);
      await a.cloud(sa,'cloud.put',put(await a.cloud(sa,'cloud.get',{key:'note'}),{text:'유지'}));
      await owner.ok('/me/apps/'+main.id+'/cloud-clear',{confirmed:true,expectedUserId:owner.userId,isPreview:true});
      assert.deepEqual((await a.cloud(sa,'cloud.get',{key:'note'})).value,{text:'유지'});
    });
    await t.test('긴급 중지와 계정 정지는 저장 차단·탈퇴 작업은 본문·결과 기록을 삭제',async()=>{
      await db.pool.query("UPDATE apps SET availability='emergency_suspended' WHERE id=$1",[main.id]);
      assert.equal((await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.get',params:{key:'note'}})).status,403);
      await db.pool.query("UPDATE apps SET availability='allowed' WHERE id=$1",[main.id]);
      await db.pool.query("UPDATE users SET status='suspended' WHERE id=$1",[a.userId]);
      assert.equal((await a.call('/app-sessions/'+sa.id+'/cloud',{method:'cloud.get',params:{key:'note'}})).status,403);
      await db.pool.query("UPDATE users SET status='withdrawn' WHERE id=$1",[a.userId]);
      await db.pool.query("INSERT INTO withdrawals(id,user_id,secret_hash,expires_at) VALUES($1,$2,$3,now()+interval '1 day')",[randomUUID(),a.userId,secret()]);
      await workOnce(db,cfg);
      assert.equal((await db.pool.query('SELECT 1 FROM cloud_spaces WHERE app_user_id IN (SELECT id FROM app_users WHERE user_id=$1)',[a.userId])).rowCount,0);
      assert.equal((await db.pool.query('SELECT 1 FROM cloud_records WHERE app_user_id=$1',[sa.appUserId])).rowCount,0);
      assert.equal((await db.pool.query('SELECT 1 FROM cloud_receipts WHERE app_user_id=$1',[sa.appUserId])).rowCount,0);
    });
  }finally{
    await stop();await db.close();assert.match(name,/^zmcloud_[a-f0-9]{12}$/);await admin.query('DROP DATABASE '+name+' WITH (FORCE)');await admin.end();
    assert.equal(dirname(resolve(files)),resolve(tmpdir()));assert.ok(files.startsWith(join(tmpdir(),'zm-cloud-test-')));await rm(files,{recursive:true,force:true});
  }
});

// Owned, disposable web-check database only. No real user credentials or notes are read.
import assert from 'node:assert/strict';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

const root=fileURLToPath(new URL('../../../',import.meta.url));
const requireApi=createRequire(join(root,'apps/api/package.json'));
const {register}=await import(pathToFileURL(requireApi.resolve('tsx/esm/api')).href);register();
const {buildProject}=await import('../../../packages/cli/src/project.ts');
const {createZip,collectDirectory}=await import('../../../packages/cli/src/bundle.ts');
const origin=process.env.ZM_WEB_URL;assert.equal(origin,'http://localhost:14600');
assert.match(new URL(process.env.ZM_TEST_DATABASE_URL).pathname,/^\/zmwebui_[a-f0-9]{12}$/);
const out=join(root,'apps/platform-web/e2e-out','cloud-'+Date.now());await mkdir(out,{recursive:true});
const checks=[],errors=[];let completed=false,step='setup',failure='';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',headless:true});
const contexts=[];
async function client(subject){
  const context=await browser.newContext({baseURL:origin,viewport:{width:1440,height:1000}});contexts.push(context);
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',()=>errors.push('script error'));
  await context.request.post('/v1/test/login',{data:{subject,provider:'google',ageConfirmed:true},headers:{Origin:origin}});
  const me=await (await context.request.get('/v1/me')).json();
  async function request(path,method='GET',data,zip=false){
    const response=await context.request.fetch('/v1'+path,{method,headers:{Origin:origin,'x-csrf-token':me.csrf,...(zip?{'content-type':'application/zip'}:{})},...(data===undefined?{}:{data})});
    assert.equal(response.status(),200,method+' '+path);return response.json();
  }
  return {context,page,me,request};
}
const pass=text=>{checks.push(text);console.info('PASS '+text);};
async function expectNote(client,value){for(let i=0;i<100;i++){if(await client.frame.locator('#note').inputValue()===value)return;await new Promise(r=>setTimeout(r,100));}assert.equal(await client.frame.locator('#note').inputValue(),value);}
try{
  const owner=await client('owner'),a=await client('alice'),b=await client('alice'),other=await client('bob');
  if(!owner.me.developer){const app=await owner.request('/developer/applications','POST',{displayName:'서버 메모 검증',email:'cloud@example.test',description:'영속성 시험'});await owner.request('/operator/developer-applications/'+app.id+'/decisions','POST',{decision:'approved',reason:'독립 시험'});}
  const app=await owner.request('/developer/apps','POST',{name:'나의 메모'});
  const dist=await buildProject(join(root,'examples/local-notes'));
  const files=await collectDirectory(dist);const manifest=JSON.parse(await readFile(join(dist,'manifest.json'),'utf8'));manifest.appId=app.id;
  files.find(f=>f.path==='manifest.json').data=Buffer.from(JSON.stringify(manifest));
  const version=await owner.request('/developer/apps/'+app.id+'/versions','POST',await createZip(files),true);
  let validated=false;
  for(let i=0;i<100;i++){const versions=await owner.request('/developer/apps/'+app.id+'/versions');if(versions.find(v=>v.id===version.id)?.validationStatus==='passed'){validated=true;break;}await new Promise(r=>setTimeout(r,100));}
  assert.ok(validated);await owner.request('/developer/versions/'+version.id+'/submit','POST',{});
  await owner.request('/operator/versions/'+version.id+'/decisions','POST',{decision:'approved',reason:'서버 저장 메모 동작 확인'});
  const apps=await owner.request('/developer/apps');await owner.request('/developer/apps/'+app.id+'/releases','POST',{versionId:version.id,revision:apps.find(x=>x.id===app.id).revision});
  step='default-app';
  await owner.page.goto(origin);await owner.page.getByRole('button',{name:'운영 관리',exact:true}).click();
  await owner.page.getByRole('button',{name:'앱 운영',exact:true}).click();
  const record=owner.page.locator('.record-list > li').filter({has:owner.page.getByText(app.id,{exact:true})});
  await record.getByRole('combobox',{name:'앱 구분',exact:true}).selectOption('default');
  await record.getByLabel('앱 구분 변경 사유',{exact:true}).fill('메모장을 모든 계정에 기본 제공');
  await record.getByRole('button',{name:'앱 구분 변경',exact:true}).click();
  await owner.page.getByText('앱 구분을 변경했습니다. 이용자의 데이터와 앱 소유권은 유지됩니다.',{exact:true}).waitFor();
  for(const c of [a,b,other]){
    const mine=await c.request('/me/apps');assert.equal(mine.find(x=>x.id===app.id)?.appType,'default');
    assert.ok(!(await c.request('/me/app-consents')).some(x=>x.appId===app.id));
  }
  pass('운영 화면에서 기본앱 지정·별도 추가 없이 모든 계정에 표시·자동 동의 없음');
  async function open(c,checkConsent=false){
    await c.page.goto(origin);await c.page.getByRole('button',{name:'앱 둘러보기',exact:true}).click();
    await c.page.locator('.app-card').filter({has:c.page.getByRole('heading',{name:'나의 메모',exact:true})}).getByRole('button',{name:'앱 열기',exact:true}).click();
    const win=c.page.locator('[data-kind="app"]').filter({has:c.page.locator('iframe[title="나의 메모"]')});
    const consentHeading=c.page.getByRole('heading',{name:'처음 실행하기 전에 확인해 주세요'});
    await consentHeading.or(win).first().waitFor();
    if(await consentHeading.isVisible()){
      if(checkConsent)await c.page.getByText('zm-os 서버에 개인 데이터 저장 · 같은 계정의 다른 기기에서 조회',{exact:true}).waitFor();
      await c.page.getByRole('button',{name:'동의하고 실행',exact:true}).click();
    }
    await win.waitFor();const frame=win.frameLocator('iframe');await frame.locator('#note').waitFor();
    await assert.doesNotReject(async()=>{for(let i=0;i<80;i++){if(await frame.locator('#note').isEnabled())return;await new Promise(r=>setTimeout(r,100));}throw Error('메모 연결 시간 초과');});
    c.frame=frame;c.win=win;return frame;
  }
  step='consent';await open(a,true);pass('새 서버 저장 권한을 안내·동의한 뒤 실제 iframe·SDK·BE 연결');
  step='save-first';await a.frame.locator('#note').fill('첫 번째 기기의 메모');await a.frame.locator('#save').click();
  await a.frame.locator('#status').filter({hasText:'서버에 저장했습니다.'}).waitFor();
  step='read-second';await open(b);await expectNote(b,'첫 번째 기기의 메모');
  await open(other);await expectNote(other,'');
  pass('독립 브라우저의 같은 계정은 서버 메모 공유·다른 계정은 빈 메모');
  step='default-hide-restore';
  await a.page.goto(origin);await a.page.getByRole('button',{name:'내 앱',exact:true}).click();
  const defaultGroup=a.page.getByRole('region',{name:'기본앱',exact:true});
  await defaultGroup.getByRole('heading',{name:'나의 메모',exact:true}).waitFor();
  await a.page.getByRole('combobox',{name:'카테고리',exact:true}).selectOption('games');
  await defaultGroup.waitFor({state:'detached'});
  await a.page.getByRole('combobox',{name:'카테고리',exact:true}).selectOption('productivity');
  await a.page.getByRole('combobox',{name:'앱 구분',exact:true}).selectOption('default');
  await defaultGroup.getByRole('button',{name:'나의 메모 상세 보기',exact:true}).click();
  await a.page.getByRole('button',{name:'내 앱에서 숨기기',exact:true}).click();
  await a.page.getByText('기본앱을 숨겼습니다. 저장 데이터는 유지되며 Store에서 다시 표시할 수 있습니다.',{exact:true}).waitFor();
  assert.ok(!(await b.request('/me/apps')).some(x=>x.id===app.id));
  assert.ok((await other.request('/me/apps')).some(x=>x.id===app.id));
  await a.page.goto(origin);await a.page.getByRole('button',{name:'앱 둘러보기',exact:true}).click();
  await a.page.getByRole('button',{name:'나의 메모 상세 보기',exact:true}).click();
  await a.page.getByRole('button',{name:'내 앱에 표시',exact:true}).click();
  assert.ok((await b.request('/me/apps')).some(x=>x.id===app.id));
  await a.page.goto(origin);await a.page.getByRole('button',{name:'내 앱',exact:true}).click();
  await a.page.getByRole('region',{name:'기본앱',exact:true}).waitFor();
  await a.page.setViewportSize({width:390,height:844});
  await a.page.screenshot({path:join(out,'default-apps-mobile.png')});
  assert.equal(await a.page.locator('.search-bar').evaluate(el=>el.scrollWidth>el.clientWidth),false);
  await a.page.setViewportSize({width:1440,height:1000});
  await a.page.screenshot({path:join(out,'default-apps-desktop.png')});
  await open(a);await expectNote(a,'첫 번째 기기의 메모');
  pass('기본앱·카테고리 결합 필터·계정별 숨김과 복원·기존 메모 보존·390px 필터 배치');
  step='conflict';
  await b.frame.locator('#note').fill('B가 작성 중인 내용');
  await a.frame.locator('#note').fill('A의 새 수정');await a.frame.locator('#save').click();
  await a.frame.locator('#status').filter({hasText:'서버에 저장했습니다.'}).waitFor();
  await b.frame.locator('#save').click();await b.frame.locator('#conflict').waitFor();
  await expectNote(b,'B가 작성 중인 내용');assert.equal(await b.frame.locator('#server-note').textContent(),'A의 새 수정');
  await b.frame.locator('#note').fill('직접 합친 메모');await b.frame.locator('#merge').click();
  await b.frame.locator('#status').filter({hasText:'서버에 저장했습니다.'}).waitFor();
  await a.frame.locator('#reload').click();await a.frame.locator('#status').filter({hasText:'불러왔습니다.'}).waitFor();
  await expectNote(a,'직접 합친 메모');
  pass('동시 수정 충돌에서 양쪽 내용 보존·사용자가 합친 내용 저장');
  step='lost-response';
  await a.context.route('**/v1/app-sessions/*/cloud',async route=>{
    const data=route.request().postDataJSON();
    if(data.method==='cloud.put'){await route.fetch();await route.abort('failed');}else await route.continue();
  });
  await a.frame.locator('#note').fill('응답이 끊겨도 한 번만 저장');await a.frame.locator('#save').click();await a.frame.locator('#status').filter({hasText:'저장 결과를 확인하지 못했습니다.'}).waitFor();
  await a.context.unroute('**/v1/app-sessions/*/cloud');await a.frame.locator('#retry').click();
  await a.frame.locator('#status').filter({hasText:'서버에 저장했습니다.'}).waitFor();
  await b.frame.locator('#reload').click();await b.frame.locator('#status').filter({hasText:'불러왔습니다.'}).waitFor();
  await expectNote(b,'응답이 끊겨도 한 번만 저장');
  pass('DB 저장 뒤 응답 소실을 재현하고 동일 요청 재시도로 결과 확인');
  step='quota';await a.frame.locator('#note').fill('가'.repeat(12000));await a.frame.locator('#save').click();
  await a.frame.locator('#status').filter({hasText:'32 KiB'}).waitFor();assert.equal(await a.page.locator('[data-kind="app"]').count(),1);
  await a.frame.locator('#note').fill('다시 정상 메모');await a.frame.locator('#save').click();await a.frame.locator('#status').filter({hasText:'서버에 저장했습니다.'}).waitFor();
  pass('큰 메모 입력은 창을 종료하지 않고 안내·입력 유지');
  step='migration';
  await a.page.evaluate(async({userId,appId})=>{
    const db=await new Promise((resolve,reject)=>{const r=indexedDB.open('zm-platform-app-storage-v1');r.onsuccess=()=>resolve(r.result);r.onerror=()=>reject(r.error);});
    await new Promise((resolve,reject)=>{const tx=db.transaction('entries','readwrite');tx.objectStore('entries').put({userId,appId,key:'note',value:'기존 로컬 메모',bytes:100});tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error);});db.close();
  },{userId:a.me.id,appId:app.id});
  await open(a);await expectNote(a,'다시 정상 메모');
  await a.frame.locator('#migration summary').click();await a.frame.locator('#import-local').click();
  await expectNote(a,'기존 로컬 메모');await a.frame.locator('#save').click();await a.frame.locator('#status').filter({hasText:'서버에 저장했습니다.'}).waitFor();
  await b.frame.locator('#reload').click();await b.frame.locator('#status').filter({hasText:'불러왔습니다.'}).waitFor();await expectNote(b,'기존 로컬 메모');
  pass('기존 로컬 메모를 자동 덮어쓰지 않고 선택·저장 후 다른 브라우저에서 조회');
  step='draft';await a.frame.locator('#note').fill('저장하지 않은 초안');await a.page.waitForTimeout(700);
  await open(a);await a.frame.locator('#draft-recovery').waitFor();await expectNote(a,'기존 로컬 메모');
  await a.frame.locator('#restore-draft').click();await expectNote(a,'저장하지 않은 초안');
  pass('브라우저 새로고침 후 미저장 로컬 초안의 명시적 복원');
  step='delete';await b.frame.locator('#remove').click();await b.frame.locator('#confirm-delete').click();await b.frame.locator('#status').filter({hasText:'서버 메모를 삭제했습니다.'}).waitFor();
  await open(a);await expectNote(a,'');
  await a.page.setViewportSize({width:390,height:844});await a.page.screenshot({path:join(out,'mobile.png')});
  const overflow=await a.frame.locator('body').evaluate(el=>el.scrollWidth>innerWidth);assert.equal(overflow,false);
  pass('서버 메모 삭제는 다음 실행에 반영·390px 화면의 본문 가로 넘침 없음');
  await a.page.setViewportSize({width:1440,height:1000});await a.page.screenshot({path:join(out,'desktop.png')});
  assert.deepEqual(errors,[]);completed=true;
} catch(error) { failure=error.stack;console.error('실패 단계: '+step);process.exitCode=1;console.error(error.message.split('\n').slice(0,3).join('\n'));for(let i=0;i<contexts.length;i++)for(const page of contexts[i].pages()){await page.screenshot({path:join(out,'failure-'+i+'.png')}).catch(()=>{});await writeFile(join(out,'failure-'+i+'.txt'),await page.locator('body').innerText().catch(()=>''));} }
finally {await writeFile(join(out,'result.json'),JSON.stringify({completed,step,checks,errors,failure},null,2));for(const context of contexts)await context.close();await browser.close();}

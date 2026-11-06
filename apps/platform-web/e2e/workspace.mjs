// 소유자: zm-os. 검토: 2026-11-06. 도구가 만든 독립 DB만 사용한다.
import assert from 'node:assert/strict';
import {mkdir,readFile,writeFile} from 'node:fs/promises';
import {createRequire} from 'node:module';
import {join} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {chromium} from 'playwright';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const requireApi=createRequire(join(root,'apps/api/package.json'));
const {register}=await import(pathToFileURL(requireApi.resolve('tsx/esm/api')).href);register();
const {buildProject}=await import('../../../packages/cli/src/project.ts');
const {createZip,collectDirectory}=await import('../../../packages/cli/src/bundle.ts');
const {default:pg}=await import(pathToFileURL(requireApi.resolve('pg')).href);
const origin=process.env.ZM_WEB_URL;assert.equal(origin,'http://localhost:14600');
assert.match(new URL(process.env.ZM_TEST_DATABASE_URL).pathname,/^\/zmwebui_[a-f0-9]{12}$/);
const db=new pg.Pool({connectionString:process.env.ZM_TEST_DATABASE_URL});
const out=join(root,'apps/platform-web/e2e-out','workspace-'+Date.now());await mkdir(out,{recursive:true});
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',headless:true});
const contexts=[],checks=[],errors=[];let completed=false,step='setup',failure='';
const pass=text=>{checks.push(text);console.info('PASS '+text);};
async function client(subject){
  const context=await browser.newContext({baseURL:origin,viewport:{width:1440,height:1000}});contexts.push(context);
  const page=await context.newPage();page.setDefaultTimeout(15000);page.on('pageerror',e=>errors.push(e.message));
  await context.request.post('/v1/test/login',{headers:{Origin:origin},data:{subject,provider:'google',ageConfirmed:true}});
  const me=await(await context.request.get('/v1/me')).json();
  const request=async(path,method='GET',data,zip=false)=>{
    const response=await context.request.fetch('/v1'+path,{method,headers:{Origin:origin,'x-csrf-token':me.csrf,...(zip?{'content-type':'application/zip'}:{})},...(data===undefined?{}:{data})});
    assert.equal(response.status(),200,method+' '+path);return response.json();
  };
  return {context,page,me,request,workspace:()=>request('/me/workspace?expectedUserId='+me.id)};
}
async function until(check){for(let i=0;i<120;i++){if(await check())return;await new Promise(r=>setTimeout(r,100));}assert.ok(await check(),'상태 확인 시간 초과');}
async function settings(c){await c.page.getByRole('button',{name:'작업공간',exact:true}).click();await c.page.getByRole('heading',{name:'작업공간',exact:true}).waitFor();}
async function wallpaper(c,value){await c.page.waitForFunction(value=>document.querySelector('.os-desktop')?.dataset.wallpaper===value,value);}
async function saved(c){await until(async()=>await c.page.getByRole('region',{name:'작업공간 동기화'}).getByText('서버에 저장됨',{exact:true}).count()>0);}
try{
  const owner=await client('owner'),a=await client('alice'),b=await client('alice'),other=await client('bob');
  // Reset only workspace rows for these synthetic accounts in the disposable database.
  await db.query('DELETE FROM workspaces WHERE user_id=ANY($1::uuid[])',[[a.me.id,other.me.id]]);
  await a.context.addInitScript(({id})=>{if(window===window.top)localStorage.setItem('zm-os:desktop:v1:'+id,JSON.stringify({wallpaper:'sand',positions:{store:{column:2,row:2}}}));},{id:a.me.id});
  await b.context.addInitScript(({id})=>{if(window===window.top)localStorage.setItem('zm-os:desktop:v1:'+id,JSON.stringify({wallpaper:'night',positions:{store:{column:0,row:0}}}));},{id:b.me.id});
  await a.page.goto(origin);await until(async()=>(await a.workspace()).revision===1);
  await wallpaper(a,'sand');await b.page.goto(origin);await wallpaper(b,'sand');
  await other.page.goto(origin);await wallpaper(other,'sky');assert.equal((await other.workspace()).revision,0);
  assert.equal(await b.page.locator('[data-icon="store"]').evaluate(el=>el.style.left),'224px');
  pass('기존 로컬 배경·아이콘의 최초 이전·서버 설정 우선·같은 계정 공유·다른 계정 분리');

  step='sync';await settings(a);await a.page.getByRole('button',{name:'밤',exact:true}).click();await saved(a);
  await b.page.evaluate(()=>window.dispatchEvent(new Event('focus')));await wallpaper(b,'night');
  await a.page.getByRole('button',{name:'작업공간 창 닫기',exact:true}).click();
  await a.page.locator('[data-icon="store"]').focus();await a.page.keyboard.press('Alt+ArrowRight');
  await until(async()=>(await a.workspace()).workspace.positions.store.column===3);
  await b.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await b.page.waitForFunction(()=>document.querySelector('[data-icon="store"]').style.left==='328px');
  pass('배경과 아이콘 변경 저장·별도 브라우저에서 포커스 복귀 시 반영');

  step='conflict';await settings(a);await settings(b);const stale=await b.workspace();
  await b.context.route('**/v1/me/workspace?**',route=>route.fulfill({json:stale}));
  await a.page.getByRole('button',{name:'모래',exact:true}).click();await saved(a);
  await b.page.getByRole('button',{name:'하늘',exact:true}).click();
  await b.page.getByRole('button',{name:'현재 브라우저 설정 저장',exact:true}).waitFor();
  await b.page.screenshot({path:join(out,'conflict.png')});
  assert.equal((await a.workspace()).workspace.wallpaper,'sand');
  await b.context.unroute('**/v1/me/workspace?**');
  await b.page.getByRole('button',{name:'현재 브라우저 설정 저장',exact:true}).click();await saved(b);
  assert.equal((await a.workspace()).workspace.wallpaper,'sky');
  pass('동시 변경 충돌 안내·미저장 설정 보존·명시적 선택 후 저장');

  step='lost-response';const before=(await b.workspace()).revision;
  await b.context.route('**/v1/me/workspace',async route=>{if(route.request().method()==='PUT'){await route.fetch();await route.abort('failed');}else await route.continue();});
  await b.page.getByRole('button',{name:'밤',exact:true}).click();
  await b.page.getByRole('button',{name:'작업공간 다시 시도',exact:true}).waitFor();
  await b.context.unroute('**/v1/me/workspace');await b.page.reload();await settings(b);await saved(b);
  assert.equal((await b.workspace()).revision,before+1);await wallpaper(b,'night');
  pass('서버 저장 뒤 응답 소실·새로고침 뒤 동일 결과 확인·중복 수정 없음');

  step='publish';
  if(!owner.me.developer){const application=await owner.request('/developer/applications','POST',{displayName:'작업공간 시험',email:'workspace@example.test',description:'창 복원 검증'});await owner.request('/operator/developer-applications/'+application.id+'/decisions','POST',{decision:'approved',reason:'독립 시험'});}
  const app=await owner.request('/developer/apps','POST',{name:'작업공간 메모'});
  const dist=await buildProject(join(root,'examples/local-notes')),files=await collectDirectory(dist);
  const manifest=JSON.parse(await readFile(join(dist,'manifest.json'),'utf8'));manifest.appId=app.id;manifest.name='작업공간 메모';
  files.find(f=>f.path==='manifest.json').data=Buffer.from(JSON.stringify(manifest));
  const version=await owner.request('/developer/apps/'+app.id+'/versions','POST',await createZip(files),true);
  await until(async()=>(await owner.request('/developer/apps/'+app.id+'/versions')).find(v=>v.id===version.id)?.validationStatus==='passed');
  await owner.request('/developer/versions/'+version.id+'/submit','POST',{});
  await owner.request('/operator/versions/'+version.id+'/decisions','POST',{decision:'approved',reason:'창 복원용 메모'});
  const appState=async()=>(await owner.request('/operator/apps')).find(x=>x.id===app.id);
  await owner.request('/developer/apps/'+app.id+'/releases','POST',{versionId:version.id,revision:(await appState()).revision});
  step='layout';await a.page.goto(origin);await a.page.getByRole('button',{name:'앱 둘러보기',exact:true}).click();
  await a.page.locator('.app-card').filter({has:a.page.getByRole('heading',{name:'작업공간 메모',exact:true})}).getByRole('button',{name:'앱 열기',exact:true}).click();
  await a.page.getByRole('button',{name:'동의하고 실행',exact:true}).click();
  const appWindow=a.page.locator('[data-kind="app"]');await appWindow.frameLocator('iframe').locator('#note').waitFor();
  await until(()=>appWindow.frameLocator('iframe').locator('#note').isEnabled());
  await appWindow.frameLocator('iframe').locator('#note').fill('아직 저장하지 않은 입력');
  const originalId=await appWindow.getAttribute('data-window-id');
  await a.page.getByRole('button',{name:'Store 왼쪽 정렬',exact:true}).click();
  await a.page.getByRole('button',{name:'작업공간 메모 오른쪽 정렬',exact:true}).click();
  await settings(a);await a.page.getByRole('button',{name:'현재 창 배치 저장',exact:true}).click();await saved(a);
  const layout=await a.workspace();assert.equal(layout.workspace.windows.length,2);
  await a.page.screenshot({path:join(out,'settings.png')});
  assert.ok(!JSON.stringify(layout.workspace).includes('documentUrl'));assert.ok(!JSON.stringify(layout.workspace).includes(originalId.slice(4)));
  await a.page.getByRole('button',{name:'저장한 창 복원',exact:true}).click();
  await a.page.getByText('2개 창을 복원했습니다.',{exact:true}).waitFor();
  assert.equal(await appWindow.count(),1);assert.equal(await appWindow.getAttribute('data-window-id'),originalId);
  assert.equal(await appWindow.frameLocator('iframe').locator('#note').inputValue(),'아직 저장하지 않은 입력');
  pass('창 좌우 정렬·배치 저장·기존 창을 닫거나 중복 실행하지 않고 복원');

  step='restore';await b.page.reload();assert.equal(await b.page.locator('[data-kind="app"]').count(),0);
  await settings(b);await b.page.getByRole('button',{name:'저장한 창 복원',exact:true}).click();
  await b.page.getByText('2개 창을 복원했습니다.',{exact:true}).waitFor();
  const restored=b.page.locator('[data-kind="app"]');await restored.frameLocator('iframe').locator('#note').waitFor();
  await until(()=>restored.frameLocator('iframe').locator('#note').isEnabled());
  await b.page.locator('[data-window-id="system:store"]').getByRole('heading',{name:'작업공간 메모',exact:true}).waitFor();
  assert.notEqual(await restored.getAttribute('data-window-id'),originalId);
  assert.equal(await b.page.locator('[data-window-id="system:store"]').evaluate(el=>Math.round(el.getBoundingClientRect().x)),0);
  assert.equal(await restored.evaluate(el=>Math.round(el.getBoundingClientRect().x)),724);
  await b.page.getByRole('button',{name:'작업공간 창 전환',exact:true}).click();
  await b.page.getByRole('button',{name:'작업공간 창 닫기',exact:true}).click();
  await b.page.screenshot({path:join(out,'desktop.png')});
  await b.page.setViewportSize({width:390,height:844});
  await b.page.waitForFunction(()=>document.querySelector('[data-kind="app"]').getBoundingClientRect().width===390);
  assert.equal((await b.workspace()).revision,layout.revision);
  await b.page.screenshot({path:join(out,'mobile.png')});
  await b.page.setViewportSize({width:1440,height:1000});
  pass('다른 브라우저의 명시적 복원·새 실행 세션·390px 표시 조정은 서버 배치를 바꾸지 않음');

  step='blocked';await owner.request('/operator/apps/'+app.id+'/availability','PUT',{status:'normal_suspended',reason:'복원 중지 경계 시험',revision:(await appState()).revision});
  await b.page.reload();await settings(b);await b.page.getByRole('button',{name:'저장한 창 복원',exact:true}).click();
  await b.page.getByText('1개 창을 복원했습니다.',{exact:true}).waitFor();assert.equal(await b.page.locator('[data-kind="app"]').count(),0);
  await owner.request('/operator/apps/'+app.id+'/availability','PUT',{status:'allowed',reason:'동의 철회 시험 준비',revision:(await appState()).revision});
  await a.request('/me/app-consents/'+app.id,'DELETE');
  await b.page.reload();await settings(b);await b.page.getByRole('button',{name:'저장한 창 복원',exact:true}).click();
  await b.page.getByText('1개 창을 복원했습니다.',{exact:true}).waitFor();assert.equal(await b.page.locator('[data-kind="app"]').count(),0);
  pass('앱 중지·동의 철회를 창 복원으로 우회하지 않으며 실패 항목 안내');

  step='identity';await a.page.goto(origin);await settings(a);
  await a.context.route('**/v1/me/workspace',route=>route.abort('failed'));
  await a.page.getByRole('button',{name:'모래',exact:true}).click();await a.page.getByRole('button',{name:'작업공간 다시 시도',exact:true}).waitFor();
  await a.context.request.post('/v1/test/login',{headers:{Origin:origin},data:{subject:'bob',provider:'google',ageConfirmed:true}});
  await a.context.unroute('**/v1/me/workspace');await a.page.evaluate(()=>window.dispatchEvent(new Event('focus')));
  await wallpaper(a,'sky');assert.equal((await other.workspace()).revision,0);
  assert.deepEqual(errors,[]);completed=true;
  pass('미저장 변경이 있는 상태에서 계정 변경 시 이전 설정을 새 계정에 적용하지 않음');
}catch(error){
  failure=error.stack;console.error('실패 단계: '+step);console.error(error.message.split('\n').slice(0,3).join('\n'));process.exitCode=1;
  for(let i=0;i<contexts.length;i++)for(const page of contexts[i].pages()){await page.screenshot({path:join(out,'failure-'+i+'.png')}).catch(()=>{});await writeFile(join(out,'failure-'+i+'.txt'),await page.locator('body').innerText().catch(()=>''));}
}finally{
  await writeFile(join(out,'result.json'),JSON.stringify({completed,step,checks,errors,failure},null,2));
  for(const context of contexts)await context.close();await browser.close();await db.end();
}

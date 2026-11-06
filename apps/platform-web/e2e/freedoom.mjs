// Normal developer submission and actual Wasm gameplay, in the disposable web-check DB.
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';
const root=fileURLToPath(new URL('../../../',import.meta.url));
const requireApi=createRequire(join(root,'apps/api/package.json'));
const {register}=await import(pathToFileURL(requireApi.resolve('tsx/esm/api')).href);register();
const {buildProject}=await import('../../../packages/cli/src/project.ts');
const {createZip,collectDirectory,validateZip}=await import('../../../packages/cli/src/bundle.ts');
const origin=process.env.ZM_WEB_URL;assert.equal(origin,'http://localhost:14600');
assert.match(new URL(process.env.ZM_TEST_DATABASE_URL).pathname,/^\/zmwebui_[a-f0-9]{12}$/);
const out=join(root,'apps/platform-web/e2e-out','freedoom-'+Date.now());await mkdir(out,{recursive:true});
const checks=[],errors=[],contexts=[];let completed=false,step='setup',failure='';
const browser=await chromium.launch({channel:process.env.PLAYWRIGHT_CHANNEL??'msedge',headless:true});
const pass=text=>{checks.push(text);console.info('PASS '+text);};
async function client(subject){
  const context=await browser.newContext({baseURL:origin,viewport:{width:1440,height:1050}});contexts.push(context);
  const page=await context.newPage();page.setDefaultTimeout(20000);page.on('pageerror',e=>errors.push(e.message));
  const login=await context.request.post('/v1/test/login',{data:{subject,provider:'google',ageConfirmed:true},headers:{Origin:origin}});assert.equal(login.status(),200);
  const me=await (await context.request.get('/v1/me')).json();
  const request=async(path,method='GET',data,zip=false)=>{
    const response=await context.request.fetch('/v1'+path,{method,headers:{Origin:origin,'x-csrf-token':me.csrf,...(zip?{'content-type':'application/zip'}:{})},...(data===undefined?{}:{data})});
    assert.equal(response.status(),200,method+' '+path);return response.json();
  };return {context,page,me,request};
}
try{
  const operator=await client('owner'),developer=await client('alice'),user=await client('bob');
  step='developer-approval';
  const application=await developer.request('/developer/applications','POST',{displayName:'게임 예제 개발자',email:'game@example.test',description:'웹 게임의 일반 배포 흐름 검증'});
  await operator.request('/operator/developer-applications/'+application.id+'/decisions','POST',{decision:'approved',reason:'격리 시험의 일반 개발자 승인'});
  const app=await developer.request('/developer/apps','POST',{name:'Freedoom · DOOM 엔진 체험'});
  const dist=await buildProject(join(root,'examples/freedoom'));
  const files=await collectDirectory(dist);const manifest=JSON.parse(await readFile(join(dist,'manifest.json'),'utf8'));manifest.appId=app.id;
  files.find(file=>file.path==='manifest.json').data=Buffer.from(JSON.stringify(manifest));
  // Run from a real asset, not DevTools evaluation (which can bypass eval CSP).
  files.find(file=>file.path==='index.html').data=Buffer.from(files.find(file=>file.path==='index.html').data.toString().replace('</body>','<script src="./security-probe.js"></script></body>'));
  files.push({path:'security-probe.js',data:Buffer.from(`(async()=>{const result={};try{eval('1+1');result.eval=false;}catch{result.eval=true;}try{new Function('return 1')();result.function=false;}catch{result.function=true;}try{void parent.document.body;result.parent=false;}catch{result.parent=true;}try{await fetch('https://invalid.example/blocked');result.network=false;}catch{result.network=true;}document.body.dataset.security=JSON.stringify(result);})();`)});
  const zip=await createZip(files);const checked=await validateZip(zip);assert.ok(zip.length<=5*1024*1024);assert.deepEqual(checked.manifest.permissions,[]);
  const version=await developer.request('/developer/apps/'+app.id+'/versions','POST',zip,true);
  step='validation';let validated=false;
  for(let i=0;i<150;i++){const versions=await developer.request('/developer/apps/'+app.id+'/versions');const row=versions.find(v=>v.id===version.id);if(row?.validationStatus==='passed'){validated=true;break;}assert.notEqual(row?.validationStatus,'failed');await new Promise(r=>setTimeout(r,100));}
  assert.ok(validated);
  await developer.request('/developer/versions/'+version.id+'/submit','POST',{});
  await operator.request('/operator/versions/'+version.id+'/decisions','POST',{decision:'approved',reason:'Freedoom 라이선스·격리·단일 레벨 체험판 검수'});
  const apps=await developer.request('/developer/apps');
  await developer.request('/developer/apps/'+app.id+'/releases','POST',{versionId:version.id,revision:apps.find(item=>item.id===app.id).revision});
  pass('일반 개발자 신청→별도 운영자 승인→ZIP 검증→버전 검수→개발자 공개 ('+zip.length+' bytes)');
  step='store-launch';const page=user.page;
  await page.goto(origin);await page.getByRole('button',{name:'앱 둘러보기',exact:true}).click();
  await page.locator('.app-card').filter({has:page.getByRole('heading',{name:manifest.name,exact:true})}).getByRole('button',{name:'앱 열기',exact:true}).click();
  await page.getByRole('button',{name:'동의하고 실행',exact:true}).click();
  const win=page.locator('[data-kind="app"]').filter({has:page.locator('iframe[title="'+manifest.name+'"]')});
  const frame=win.frameLocator('iframe');
  assert.equal(await win.locator('iframe').getAttribute('sandbox'),'allow-scripts');
  await frame.getByRole('button',{name:'게임 시작',exact:true}).click();
  await frame.locator('#status').filter({hasText:'플레이 중'}).waitFor();
  const canvas=frame.locator('#game');
  const hash=async(x=0,y=0,w=320,h=200)=>createHash('sha256').update(Buffer.from(await canvas.evaluate((element,region)=>Array.from(element.getContext('2d').getImageData(...region).data),[x,y,w,h]))).digest('hex');
  await page.waitForTimeout(600);
  const colors=await canvas.evaluate(element=>new Set(new Uint32Array(element.getContext('2d').getImageData(0,0,320,200).data.buffer)).size);
  assert.ok(colors>50,'actual rendered level');
  const before=await hash();
  await canvas.press('ArrowRight',{delay:600});await canvas.press('ArrowUp',{delay:650});await page.waitForTimeout(100);
  assert.notEqual(await hash(),before);
  pass('일반 사용자가 Store 동의 후 실제 Wasm 레벨 실행·회전·이동');
  step='fire';const ammo=await hash(0,170,45,30);
  await canvas.press('ControlLeft',{delay:650});await page.waitForTimeout(300);
  assert.notEqual(await hash(0,170,45,30),ammo,'shots consume HUD ammo');
  pass('발사 입력으로 게임 화면의 탄약 수치 변경');
  step='pause';await frame.locator('#pause').click();await frame.getByRole('button',{name:'이어서 플레이',exact:true}).waitFor();
  const paused=await hash();await page.waitForTimeout(400);assert.equal(await hash(),paused);
  await frame.getByRole('button',{name:'이어서 플레이',exact:true}).click();await canvas.press('ArrowLeft',{delay:350});
  assert.notEqual(await hash(),paused);
  await page.getByRole('button',{name:manifest.name+' 최소화',exact:true}).click();
  await page.waitForTimeout(100);
  // Desktop taskbar reopens the same app window, rather than creating a second engine.
  await page.getByRole('button',{name:manifest.name+' 창 전환',exact:true}).click();
  await frame.getByRole('button',{name:'이어서 플레이',exact:true}).waitFor();
  pass('일시 정지 동안 렌더링 정지·재개·창 최소화 후 자동 정지');
  step='security';
  const security=await frame.locator('body').evaluate(body=>JSON.parse(body.dataset.security));
  assert.deepEqual(security,{eval:true,function:true,parent:true,network:true});
  pass('Wasm 허용 후에도 JavaScript eval·Function·부모 DOM·외부 통신 차단');
  step='sources';await frame.locator('#about summary').click();await frame.locator('#load-source').click();
  const select=frame.locator('#source-file');await select.waitFor();
  assert.ok(await select.locator('option').count()>200);
  await select.selectOption('doomgeneric/LICENSE');assert.match(await frame.locator('#source-text').inputValue(),/GNU GENERAL PUBLIC LICENSE/);
  await select.selectOption('engine/doomgeneric_zm.c');assert.match(await frame.locator('#source-text').inputValue(),/emscripten_set_main_loop/);
  await select.selectOption('freedoom/COPYING.txt');assert.match(await frame.locator('#source-text').inputValue(),/Redistribution and use/);
  pass('제출한 앱 안에 엔진 대응 소스·빌드 명령·GPL·Freedoom BSD 고지 포함');
  await frame.locator('#about summary').click();await frame.getByRole('button',{name:'이어서 플레이',exact:true}).click();await page.waitForTimeout(200);
  await frame.locator('body').evaluate(()=>scrollTo(0,0));
  await page.screenshot({path:join(out,'desktop.png')});
  await page.setViewportSize({width:390,height:844});await page.screenshot({path:join(out,'mobile.png')});
  assert.equal(await frame.locator('body').evaluate(body=>body.scrollWidth>innerWidth),false);
  pass('390px 웹 화면에서 게임과 조작 안내의 가로 넘침 없음');
  assert.deepEqual(errors,[]);completed=true;
}catch(error){failure=error.stack;console.error('실패 단계: '+step);console.error(error.message.split('\n').slice(0,4).join('\n'));process.exitCode=1;for(let i=0;i<contexts.length;i++)for(const page of contexts[i].pages()){await page.screenshot({path:join(out,'failure-'+i+'.png')}).catch(()=>{});await writeFile(join(out,'failure-'+i+'.txt'),await page.locator('body').innerText().catch(()=>''));}}
finally{await writeFile(join(out,'result.json'),JSON.stringify({completed,step,checks,errors,failure},null,2));for(const context of contexts)await context.close();await browser.close();}

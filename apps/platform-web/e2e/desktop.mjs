// 소유자: zm-os. 검토: 2026-11-03. 독립 시험 DB에서만 창 수명과 권한 경계를 검증한다.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

async function main() {
  const root = fileURLToPath(new URL('../../../', import.meta.url));
  const req = createRequire(join(root, 'apps/api/package.json'));
  const { register } = await import(pathToFileURL(req.resolve('tsx/esm/api')).href);
  register();
  const { createZip } = await import('../../../packages/cli/src/bundle.ts');
  const cliRequire = createRequire(join(root, 'packages/cli/package.json'));
  const sdk = await cliRequire('esbuild').build({
    entryPoints:[join(root,'packages/sdk/src/index.ts')],bundle:true,write:false,format:'esm',platform:'browser',
  });
  const sdkSource = sdk.outputFiles[0].text;
  const origin = process.env.ZM_WEB_URL;
  assert.equal(origin, 'http://localhost:14600');
  assert.match(new URL(process.env.ZM_TEST_DATABASE_URL).pathname, /^\/zmwebui_[a-f0-9]{12}$/);
  const output = join(root, 'apps/platform-web/e2e-out', 'desktop-' + Date.now());
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({headless:true, channel:process.env.PLAYWRIGHT_CHANNEL ?? 'msedge'});
  const context = await browser.newContext({baseURL:origin, viewport:{width:1440,height:1000}});
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const checks = [], errors = [];
  let step = 'desktop', completed = false;
  page.on('pageerror', () => errors.push('브라우저 스크립트 오류'));
  const pass = text => { checks.push(text); console.info('PASS ' + text); };
  const button = name => page.getByRole('button', {name, exact:true});
  const system = name => page.locator('[data-window-id="system:' + name + '"]');
  async function request(route, method='GET', data, expected=200, zip=false) {
    const me = method === 'GET' ? null : await (await page.request.get('/v1/me')).json();
    const response = await page.request.fetch('/v1' + route, {
      method, headers:{Origin:origin, ...(me ? {'x-csrf-token':me.csrf} : {}), ...(zip ? {'content-type':'application/zip'} : {})},
      ...(data === undefined ? {} : {data}),
    });
    assert.equal(response.status(), expected, method + ' ' + route);
    return response.json();
  }
  async function launch(app) {
    await button('앱 둘러보기').click();
    const card = system('store').locator('.app-card').filter({has:page.getByRole('heading',{name:app.name,exact:true})});
    await card.getByRole('button',{name:'앱 열기',exact:true}).click();
    const win = page.locator('[data-kind="app"]').filter({has:page.locator('iframe[title="' + app.name + '"]')});
    await win.locator('iframe').waitFor();
    await win.frameLocator('iframe').getByRole('heading',{name:app.name,exact:true}).waitFor();
    return win;
  }
  try {
    await page.goto(origin);
    await button('앱 둘러보기').waitFor();
    assert.equal(await page.locator('.os-window').count(), 0);
    await page.screenshot({path:join(output,'desktop.png')});
    await button('앱 둘러보기').click();
    await system('store').getByRole('heading',{name:'오늘, 어떤 앱이 필요한가요?',exact:true}).waitFor();
    const initial = await system('store').boundingBox();
    const title = system('store').locator('.os-window-titlebar');
    const box = await title.boundingBox();
    await page.mouse.move(box.x + 180, box.y + 20); await page.mouse.down();
    await page.mouse.move(box.x + 225, box.y + 55, {steps:6}); await page.mouse.up();
    const moved = await system('store').boundingBox();
    assert.ok(moved.x > initial.x + 30 && moved.y > initial.y + 20);
    const resize = await system('store').getByRole('button',{name:'Store 창 크기 조절'}).boundingBox();
    await page.mouse.move(resize.x+8,resize.y+8); await page.mouse.down();
    await page.mouse.move(resize.x-100,resize.y-90,{steps:5}); await page.mouse.up();
    const resized = await system('store').boundingBox();
    assert.ok(resized.width < moved.width - 70 && resized.height < moved.height - 60);
    await button('Store 최대화').click();
    assert.equal(Math.round((await system('store').boundingBox()).width),1440);
    await button('Store 이전 크기로').click();
    assert.equal(Math.round((await system('store').boundingBox()).width),Math.round(resized.width));
    await button('Store 최소화').click();
    assert.equal(await system('store').isVisible(),false);
    await button('Store 창 전환').click();
    assert.equal(await system('store').isVisible(),true);
    pass('첫 화면은 바탕화면, 시스템 앱 창 이동·크기 조절·최대화·최소화·복원');

    step = 'login';
    await button('로그인').click();
    await page.getByRole('combobox',{name:'시험 사용자',exact:true}).selectOption('owner');
    await page.getByRole('combobox',{name:'모의 로그인 제공자',exact:true}).selectOption('google');
    await page.getByRole('checkbox').check();
    await button('모의 로그인').click();
    await page.getByText('시험 계정으로 로그인했습니다.',{exact:true}).waitFor();
    await button('안내 닫기').click();
    assert.equal(await page.locator('.os-window').count(),0);
    const user = await request('/me');
    if (!user.developer) {
      const application = await request('/developer/applications','POST',{displayName:'창 검증 개발자',email:'desktop@example.test',description:'다중 창 검증'});
      await request('/operator/developer-applications/' + application.id + '/decisions','POST',{decision:'approved',reason:'다중 창 시험'});
    }
    const apps = [];
    for (const name of ['창 시험 A','창 시험 B']) {
      step = 'publish-' + name;
      const app = await request('/developer/apps','POST',{name});
      const manifest = {schemaVersion:1,appId:app.id,version:'1.0.0',name,description:'다중 창 수명 검증',category:'tools',entry:'index.html',permissions:['local-storage','app-identity'],apiOrigins:[],privacyNotice:'시험 입력을 앱별 기기 저장소에 저장하며 외부로 보내지 않습니다.'};
      const bundle = await createZip([
        {path:'manifest.json',data:Buffer.from(JSON.stringify(manifest))},
        {path:'sdk.js',data:Buffer.from(sdkSource)},
        {path:'index.html',data:Buffer.from('<!doctype html><html lang="ko"><meta charset="utf-8"><title>'+name+'</title><h1>'+name+'</h1><label>입력 <input aria-label="입력"></label><script type="module">import {zm} from "./sdk.js";window.sdk=zm;window.documentMarker=crypto.randomUUID();window.sdkReady=zm.runtime.ready();</script></html>')},
      ]);
      const version = await request('/developer/apps/' + app.id + '/versions','POST',bundle,200,true);
      let valid = false;
      for(let i=0;i<100;i++) {
        const versions = await request('/developer/apps/' + app.id + '/versions');
        if (versions.find(v=>v.id===version.id)?.validationStatus==='passed') {valid=true;break;}
        await new Promise(done=>setTimeout(done,150));
      }
      assert.ok(valid,'번들 검사 완료');
      await request('/developer/versions/' + version.id + '/submit','POST',{});
      await request('/operator/versions/' + version.id + '/decisions','POST',{decision:'approved',reason:'자기 앱 다중 창 시험'});
      const currentApp = (await request('/developer/apps')).find(item=>item.id===app.id);
      await request('/developer/apps/' + app.id + '/releases','POST',{versionId:version.id,revision:currentApp.revision});
      const consent = await request('/apps/' + app.id + '/consent');
      await request('/me/app-consents/' + app.id,'PUT',{fingerprint:consent.fingerprint});
      apps.push({...app,name});
    }
    step = 'multiple-windows';
    const a = await launch(apps[0]);
    const aframe = await a.locator('iframe').elementHandle();
    const adoc = await aframe.contentFrame();
    const marker = await adoc.evaluate(()=>window.documentMarker);
    assert.equal(typeof marker,'string');
    await adoc.getByRole('textbox',{name:'입력'}).fill('창을 바꿔도 유지');
    const b = await launch(apps[1]);
    const bdoc = await (await b.locator('iframe').elementHandle()).contentFrame();
    await Promise.all([adoc.evaluate(()=>window.sdkReady),bdoc.evaluate(()=>window.sdkReady)]);
    await adoc.evaluate(()=>window.sdk.storage.set('same-key','A에만 저장'));
    await bdoc.evaluate(()=>window.sdk.storage.set('same-key','B에만 저장'));
    assert.equal(await adoc.evaluate(()=>window.sdk.storage.get('same-key')),'A에만 저장');
    assert.equal(await bdoc.evaluate(()=>window.sdk.storage.get('same-key')),'B에만 저장');
    const appUserA = await adoc.evaluate(()=>window.sdk.identity.getAppUser());
    const appUserB = await bdoc.evaluate(()=>window.sdk.identity.getAppUser());
    assert.notEqual(appUserA.appUserId,appUserB.appUserId);
    pass('실제 SDK 동시 연결에서 같은 키의 저장 값과 앱 사용자 식별자 분리');
    assert.equal(await page.locator('iframe').count(),2);
    const aid = (await a.getAttribute('data-window-id')).slice(4);
    const bid = (await b.getAttribute('data-window-id')).slice(4);
    await button('창 시험 A 창 전환').click();
    await button('창 시험 A 최소화').click();
    assert.equal(await a.isVisible(),false);
    assert.equal(await page.locator('iframe').count(),2);
    await button('창 시험 A 창 전환').click();
    assert.equal(await adoc.evaluate(()=>window.documentMarker),marker);
    assert.equal(await adoc.getByRole('textbox',{name:'입력'}).inputValue(),'창을 바꿔도 유지');
    assert.equal(await aframe.evaluate(el=>el.isConnected),true);
    await button('창 시험 A 최대화').click(); await button('창 시험 A 이전 크기로').click();
    assert.equal(await adoc.evaluate(()=>window.documentMarker),marker);
    await page.screenshot({path:join(output,'multiple-windows.png')});
    pass('두 일반 앱 동시 실행, 창 전환·최소화·최대화 후 iframe 문서와 입력 유지');
    step = 'close-one';
    await a.getByRole('button',{name:'앱 종료',exact:true}).click();
    await a.waitFor({state:'detached'});
    await request('/app-sessions/' + bid);
    for(let i=0;i<30;i++) {
      const result = await page.request.get('/v1/app-sessions/' + aid);
      if(result.status()!==200)break;
      await new Promise(done=>setTimeout(done,100));
    }
    assert.notEqual((await page.request.get('/v1/app-sessions/' + aid)).status(),200);
    assert.equal(await b.locator('iframe').count(),1);
    assert.equal(await bdoc.evaluate(()=>window.sdk.storage.get('same-key')),'B에만 저장');
    pass('창 하나를 닫으면 그 실행 세션만 종료되고 다른 앱은 유지');
    step = 'revoke-minimized';
    const again = await launch(apps[0]);
    await button('창 시험 A 최소화').click();
    await request('/me/app-consents/' + apps[0].id,'DELETE');
    await again.waitFor({state:'detached'});
    await request('/app-sessions/' + bid);
    pass('최소화한 앱도 동의 철회를 감지해 종료, 다른 앱 실행 권한 유지');
    step = 'compact';
    await page.setViewportSize({width:390,height:844});
    await button('창 시험 B 창 전환').click();
    await page.waitForFunction(()=>document.querySelector('[data-active="true"]').getBoundingClientRect().width===390);
    const compact = await b.boundingBox();
    assert.equal(compact.x,0);assert.equal(compact.y,0);assert.equal(compact.width,390);
    assert.ok(compact.height<=792);
    await button('내 계정').click();
    await system('account').waitFor();
    await page.screenshot({path:join(output,'compact.png')});
    await button('창 시험 B 창 전환').click();
    assert.equal(await b.getAttribute('data-active'),'true');
    pass('좁은 웹 화면에서 창이 작업영역에 맞고 작업표시줄로 전환');
    step = 'account-change';
    const switched = await page.request.post('/v1/test/login',{
      headers:{Origin:origin},data:{subject:'bob',provider:'google',ageConfirmed:true},
    });
    assert.equal(switched.status(),200);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));
    await page.locator('.os-window').first().waitFor({state:'detached'});
    assert.equal(await page.locator('iframe').count(),0);
    assert.equal(await button('운영 관리').count(),0);
    pass('다른 탭의 계정 변경을 감지하면 이전 계정의 모든 창·브리지 제거');
    await button('내 계정').click();
    await system('account').waitFor();
    step = 'logout';
    await button('시작 메뉴').click();await button('로그아웃').click();
    await page.getByText('로그아웃했습니다.',{exact:true}).waitFor();
    assert.equal(await page.locator('.os-window').count(),0);
    assert.equal(await page.locator('iframe').count(),0);
    assert.equal(await button('운영 관리').count(),0);
    pass('로그아웃 시 모든 실행·개인 시스템 창 제거, 운영자 진입 제거');
    assert.deepEqual(errors,[]);
    completed = true;
  } finally {
    await writeFile(join(output,'result.json'),JSON.stringify({completed,step,checks,errors},null,2));
    await context.close();await browser.close();
    console.info('Desktop artifacts: ' + output);
  }
}
main().catch(error=>{console.error(error.message);process.exitCode=1;});

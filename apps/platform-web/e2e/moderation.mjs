// 검수 안내·표본 검수 연결 시험. 반드시 platform-web-check의 독립 환경에서 실행한다.
import assert from 'node:assert/strict';
import { mkdir, writeFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { chromium } from 'playwright';

async function main() {
const root = fileURLToPath(new URL('../../../', import.meta.url));
const requireApi = createRequire(join(root, 'apps/api/package.json'));
const { register } = await import(pathToFileURL(requireApi.resolve('tsx/esm/api')).href);register();
const { createZip } = await import('../../../packages/cli/src/bundle.ts');
const { default: pg } = await import(pathToFileURL(requireApi.resolve('pg')).href);
const origin = process.env.ZM_WEB_URL;
const url = new URL(process.env.ZM_TEST_DATABASE_URL ?? 'http://missing.invalid');
assert.equal(origin, 'http://localhost:14600');
assert.match(url.pathname, /^\/zmwebui_[a-f0-9]{12}$/);
assert.equal(url.hostname, '127.0.0.1');
const db = new pg.Pool({ connectionString: url.toString() });
const output = join(root, 'apps/platform-web/e2e-out', `moderation-${Date.now()}`);
await mkdir(output, { recursive: true });
const checks = [], errors = [];
const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? 'msedge' });
const context = await browser.newContext({ baseURL: origin, viewport: { width: 1440, height: 1000 } });
const page = await context.newPage();page.setDefaultTimeout(15000);
page.on('pageerror', () => errors.push('브라우저 스크립트 오류'));
const pass = message => { checks.push(message);console.info('PASS '+message); };
let completed = false;
async function request(path, method='GET', data, expected=200, zip=false) {
  const me = method==='GET' ? null : await (await page.request.get('/v1/me')).json();
  const response = await page.request.fetch('/v1'+path, {
    method, headers: { Origin: origin, ...(me?{'x-csrf-token':me.csrf}:{}), ...(zip?{'content-type':'application/zip'}:{}) },
    ...(data===undefined?{}:{data}),
  });
  assert.equal(response.status(), expected, `${method} ${path}`);
  return response.json();
}
async function reviews() {
  await page.reload();
  await page.getByRole('button', { name:'운영 관리', exact:true }).click();
  await page.getByRole('button', { name:'앱 검수', exact:true }).click();
  await page.getByRole('heading',{name:'앱 버전 검수 기준',exact:true}).waitFor();
}
try {
  await page.goto(origin);
  await page.getByRole('button',{name:'로그인',exact:true}).click();
  await page.getByRole('combobox',{name:'시험 사용자',exact:true}).selectOption('owner');
  await page.getByRole('combobox',{name:'모의 로그인 제공자',exact:true}).selectOption('google');
  await page.getByRole('checkbox').check();
  await page.getByRole('button',{name:'모의 로그인',exact:true}).click();
  await page.getByText('시험 계정으로 로그인했습니다.',{exact:true}).waitFor();
  const user = await request('/me');
  if (!user.developer) {
    const application = await request('/developer/applications','POST',{displayName:'검수 표본 개발자',email:'review@example.test',description:'검수 절차 확인용 표본'});
    await request(`/operator/developer-applications/${application.id}/decisions`,'POST',{decision:'approved',reason:'검수 절차 시험'});
  }
  await reviews();
  await page.getByText('검수 순서와 첫 버전 제외 기능 확인',{exact:true}).click();
  await page.getByText('파일 자동 검사는 기능 검수를 대신하지 않습니다.',{exact:false}).waitFor();
  await page.screenshot({path:join(output,'review-guide.png'),fullPage:true});
  pass('운영자 화면에 제출 판 확인·첫 버전 제외 기능·개인 메모 구분·사유 기록 안내');
  const fixtures = [
    {name:'광고·결제 표시 표본',content:'광고 수익화 및 유료 결제를 제공하는 앱으로 제출한 검수 연습용 표본입니다.',decision:'rejected',reason:'첫 버전에서 광고 수익화·유료 결제를 제외하므로 반려합니다.'},
    {name:'공개 댓글 표시 표본',content:'다른 사용자에게 공개되는 게시물과 댓글을 제공하는 앱으로 제출한 검수 연습용 표본입니다.',decision:'rejected',reason:'첫 버전에서 공개 게시물·댓글을 제외하므로 반려합니다.'},
    {name:'기기·실시간 연결 표시 표본',content:'카메라와 실시간 지속 연결이 필요한 앱으로 제출한 검수 연습용 표본입니다.',decision:'rejected',reason:'첫 버전에서 기기 기능과 실시간 지속 연결을 제외하므로 반려합니다.'},
    {name:'본인용 개인 메모 표본',content:'본인만 보는 개인 메모이며 다른 사용자에게 내용을 공개하지 않습니다.',decision:'approved',reason:'개인 메모로 확인했습니다. 공개 콘텐츠와 구분해 승인합니다.'},
  ];
  for (const [index, fixture] of fixtures.entries()) {
    const app = await request('/developer/apps','POST',{name:fixture.name});
    const manifest = {schemaVersion:1,appId:app.id,version:'1.0.0',name:fixture.name,description:fixture.content,category:'tools',entry:'index.html',permissions:[],apiOrigins:[],privacyNotice:'실제 광고·결제·기기 접근·외부 통신을 실행하지 않는 검수 연습용 표본입니다.'};
    const zip = await createZip([
      {path:'manifest.json',data:Buffer.from(JSON.stringify(manifest))},
      {path:'index.html',data:Buffer.from(`<!doctype html><html lang="ko"><meta charset="utf-8"><title>${fixture.name}</title><h1>${fixture.name}</h1><p>${fixture.content}</p><p>검수 연습용 표본: 실제 외부 기능은 실행하지 않습니다.</p></html>`)},
    ]);
    const version = await request(`/developer/apps/${app.id}/versions`,'POST',zip,200,true);
    await assert.doesNotReject(async()=>{
      for(let i=0;i<80;i++) {
        const list = await request(`/developer/apps/${app.id}/versions`);
        if(list.find(item=>item.id===version.id)?.validationStatus==='passed')return;
        await new Promise(done=>setTimeout(done,150));
      }
      throw new Error('worker 검사 대기 시간 초과');
    });
    await request(`/developer/versions/${version.id}/submit`,'POST',{});
    await reviews();
    const row = page.locator('.record-list > li').filter({has:page.getByRole('heading',{name:fixture.name,exact:true})});
    await row.getByText('제출된 매니페스트와 검증 결과',{exact:true}).click();
    assert.ok((await row.locator('pre').innerText()).includes(fixture.content));
    await row.getByRole('button',{name:'검수용 실행',exact:true}).click();
    await page.getByRole('dialog').getByRole('checkbox').check();
    await page.getByRole('button',{name:'동의하고 검수 시작',exact:true}).click();
    await page.frameLocator('iframe').getByRole('heading',{name:fixture.name,exact:true}).waitFor();
    await page.screenshot({path:join(output,`fixture-${index+1}.png`),fullPage:true});
    await page.getByRole('button',{name:'앱 종료',exact:true}).click();
    await reviews();
    const current = page.locator('.record-list > li').filter({has:page.getByRole('heading',{name:fixture.name,exact:true})});
    await current.getByRole('combobox',{name:'심사 결과',exact:true}).selectOption(fixture.decision);
    await current.getByRole('textbox',{name:'심사 사유',exact:true}).fill(fixture.reason);
    await current.locator('button[type="submit"]').click();
    await page.getByText(fixture.decision==='approved'
      ? '앱 버전 검수 결과를 기록했습니다. 개발자가 직접 공개할 수 있습니다.'
      : '앱 버전 검수 결과를 기록했습니다. 개발자가 사유를 확인하고 수정한 버전을 다시 제출해야 합니다.',{exact:true}).waitFor();
    const stored = await db.query('SELECT review_status,reason FROM versions WHERE id=$1',[version.id]);
    assert.equal(stored.rows[0].review_status,fixture.decision);assert.equal(stored.rows[0].reason,fixture.reason);
    const audit = await db.query("SELECT detail->>'selfReview' AS self FROM audit_events WHERE action='version.reviewed' AND target_id=$1",[version.id]);
    assert.equal(audit.rows[0].self,'true');
    const apps = await request('/developer/apps'), currentApp=apps.find(item=>item.id===app.id);
    assert.equal(currentApp.published,false);assert.equal(currentApp.currentVersionId,null);
    if (fixture.decision==='rejected') await request(`/developer/apps/${app.id}/releases`,'POST',{versionId:version.id,revision:currentApp.revision},409);
    else await request(`/developer/apps/${app.id}/releases`,'POST',{versionId:version.id,revision:currentApp.revision});
    pass(`${fixture.name}: 미리보기 확인→${fixture.decision==='approved'?'승인 뒤 소유자 별도 공개':'사유 있는 반려·공개 거부'}`);
  }
  assert.deepEqual(errors,[]);completed=true;
} catch(error) {
  await page.screenshot({path:join(output,'failure.png'),fullPage:true}).catch(()=>{});
  throw error;
} finally {
  await db.end();await browser.close();
  await writeFile(join(output,'result.json'),JSON.stringify({completed,mockOAuthOnly:true,syntheticReviewFixtures:true,checks,errors,limitations:['실제 광고·결제·기기·외부 통신은 실행하지 않는 기능 표시 표본','자동 악성 행위 탐지나 운영 앱의 검수 완료를 증명하지 않음']},null,2));
  console.info('검수 표본 보고서: '+join(dirname(output),output.split(/[\\/]/).at(-1),'result.json'));
}
}
try { await main(); }
catch { console.error('검수 표본 웹 시험에 실패했습니다. 비밀 값이 포함될 수 있는 오류 원문은 출력하지 않습니다.'); process.exitCode = 1; }

// 소유자: zm-os. 검토: 2026-11-03. 실제 브라우저와 로컬 메일함, 외부 메일 발송 없음.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from 'playwright';
async function main(){
  const origin=process.env.ZM_WEB_URL;assert.equal(origin,'http://localhost:14600');
  const out=fileURLToPath(new URL('../e2e-out/email-'+Date.now()+'/',import.meta.url));await mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL ?? 'msedge'});
  const context=await browser.newContext({baseURL:origin,viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.setDefaultTimeout(15000);
  const email='browser@example.test',password='브라우저에서 인증한 첫 비밀번호 42',next='브라우저에서 새로 정한 비밀번호 43';
  const checks=[],errors=[];let step='signup',completed=false;page.on('pageerror',()=>errors.push('script error'));
  const button=name=>page.getByRole('button',{name,exact:true});
  const pass=text=>{checks.push(text);console.info('PASS '+text);};
  async function openAccount(){await button((await page.request.get('/v1/me')).status()===200?'내 계정':'로그인').click();}
  async function login(value){await openAccount();await page.getByLabel('이메일 주소',{exact:true}).fill(email);await page.getByLabel('비밀번호',{exact:true}).fill(value);await button('이메일 로그인').click();await page.getByText('이메일 계정으로 로그인했습니다.',{exact:true}).waitFor();await button('안내 닫기').click();}
  async function complete(value){
    // Follow the exact captured link without logging it or putting it in an artifact.
    const mailbox=await context.newPage();await mailbox.goto('http://localhost:14612');
    const item=mailbox.locator('article').filter({hasText:email}).first();await item.waitFor();
    const link=await item.getByRole('link',{name:'인증 화면 열기'}).getAttribute('href');await mailbox.close();
    await page.goto(link);await page.getByLabel('설정할 비밀번호',{exact:true}).fill(value);
    assert.equal(new URL(page.url()).hash,'');
    await page.getByLabel('설정할 비밀번호 확인',{exact:true}).fill('different');
    const submit=page.getByRole('button',{name:/^(인증하고 비밀번호 설정|새 비밀번호 저장)$/});
    await submit.click();await page.getByText('비밀번호와 확인 값이 다릅니다.',{exact:true}).waitFor();
    await page.getByLabel('설정할 비밀번호 확인',{exact:true}).fill(value);await submit.click();
    await page.getByLabel('설정할 비밀번호',{exact:true}).waitFor({state:'detached'});
  }
  try{
    await page.goto(origin);await openAccount();await button('이메일 회원가입').click();
    await page.getByLabel('이메일 주소',{exact:true}).fill(email);
    assert.equal(await button('가입 인증 메일 받기').isDisabled(),true);
    await page.locator('form').filter({has:button('가입 인증 메일 받기')}).getByRole('checkbox').check();
    await button('가입 인증 메일 받기').click();
    await page.getByText('처리 가능한 이메일 주소라면 안내 메일을 보냈습니다. 메일함을 확인해 주세요.',{exact:true}).waitFor();
    assert.equal((await page.request.get('/v1/me')).status(),401);
    const popupPromise=page.waitForEvent('popup');await page.getByRole('link',{name:'개발용 메일함 열기'}).click();
    const popup=await popupPromise;await popup.getByRole('heading',{name:'개발용 메일함',exact:true}).waitFor();await popup.close();
    await page.screenshot({path:join(out,'signup.png')});
    await complete(password);assert.equal((await page.request.get('/v1/me')).status(),401);
    pass('가입 연령 확인·개발 메일함 열기·인증 전 이용 차단·확인 값 검증·자동 로그인 없음');
    step='login';await login(password);await openAccount();
    await page.getByRole('heading',{name:'이메일 비밀번호 관리',exact:true}).waitFor();
    await page.getByLabel('현재 비밀번호',{exact:true}).fill(password);await button('비밀번호로 재인증').click();
    await page.getByText('비밀번호로 재인증했습니다.',{exact:true}).waitFor();await button('안내 닫기').click();
    await page.screenshot({path:join(out,'email-account.png')});
    pass('이메일 로그인·계정 관리·비밀번호 재인증');
    step='change';await button('비밀번호 변경하기').click();await page.getByLabel('현재 비밀번호',{exact:true}).fill(password);
    await page.getByLabel('새 비밀번호',{exact:true}).fill(next);await page.getByLabel('새 비밀번호 확인',{exact:true}).fill(next);
    await button('비밀번호 변경').click();await button('로그인').waitFor();assert.equal((await page.request.get('/v1/me')).status(),401);
    await button('안내 닫기').click();await login(next);
    pass('비밀번호 변경 후 기존 로그인 종료 및 새 비밀번호 로그인');
    step='reset';await button('시작 메뉴').click();await button('로그아웃').click();await button('로그인').waitFor();await button('안내 닫기').click();
    await openAccount();await button('비밀번호 찾기').click();await page.getByLabel('이메일 주소',{exact:true}).fill(email);
    await button('재설정 메일 받기').click();await page.getByText('처리 가능한 이메일 주소라면 안내 메일을 보냈습니다. 메일함을 확인해 주세요.',{exact:true}).waitFor();
    await complete(password);assert.equal((await page.request.get('/v1/me')).status(),401);await button('안내 닫기').click();await login(password);
    pass('비밀번호 찾기→개발 메일함→재설정→재로그인');
    assert.deepEqual(errors,[]);completed=true;
  }finally{await writeFile(join(out,'result.json'),JSON.stringify({completed,step,checks,errors},null,2));await context.close();await browser.close();console.info('Email artifacts: '+out);}
}
main().catch(()=>{console.error('이메일 브라우저 시험 실패. result.json의 단계를 확인하세요.');process.exitCode=1;});

// 소유자: zm-os. 검토: 2026-11-03. 브라우저 입력과 저장된 배치의 동작을 확인한다.
import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import {join} from 'node:path';
import {chromium} from 'playwright';
async function main(){
  const origin=process.env.ZM_WEB_URL;assert.equal(origin,'http://localhost:14600');
  const out=fileURLToPath(new URL('../e2e-out/icons-'+Date.now()+'/',import.meta.url));await mkdir(out,{recursive:true});
  const browser=await chromium.launch({headless:true,channel:process.env.PLAYWRIGHT_CHANNEL ?? 'msedge'});
  const context=await browser.newContext({baseURL:origin,viewport:{width:1440,height:1000}}),page=await context.newPage();
  page.setDefaultTimeout(15000);
  const checks=[],errors=[];let step='drag',completed=false;page.on('pageerror',()=>errors.push('script error'));
  const icon=id=>page.locator('[data-icon="'+id+'"]');
  const button=name=>page.getByRole('button',{name,exact:true});
  const point=async id=>icon(id).evaluate(el=>({x:parseFloat(el.style.left),y:parseFloat(el.style.top)}));
  const pass=text=>{checks.push(text);console.info('PASS '+text);};
  async function menu(){await page.locator('.os-desktop-icons').click({button:'right',position:{x:1000,y:300}});}
  try{
    await page.goto(origin);await button('앱 둘러보기').waitFor();
    const initial=await point('store'),box=await icon('store').boundingBox();
    await page.mouse.move(box.x+40,box.y+40);await page.mouse.down();
    await page.mouse.move(box.x+248,box.y+144,{steps:10});await page.mouse.up();
    const moved=await point('store');assert.deepEqual(moved,{x:initial.x+208,y:initial.y+104});
    assert.equal(await page.locator('.os-window').count(),0);
    await page.reload();await button('앱 둘러보기').waitFor();assert.deepEqual(await point('store'),moved);
    pass('아이콘 실제 드래그는 창을 열지 않고 격자에 배치하며 새로고침 후 유지');
    step='collision';
    const mine=await point('mine'),drag=await icon('store').boundingBox();
    await page.mouse.move(drag.x+40,drag.y+40);await page.mouse.down();
    await page.mouse.move(drag.x+40+mine.x-moved.x,drag.y+40+mine.y-moved.y,{steps:10});await page.mouse.up();
    assert.deepEqual(await point('store'),mine);assert.deepEqual(await point('mine'),moved);
    await icon('store').focus();await page.keyboard.press('Alt+ArrowRight');
    assert.deepEqual(await point('store'),{x:mine.x+104,y:mine.y});
    await page.keyboard.press('Enter');await page.locator('[data-window-id="system:store"]').waitFor();
    await button('Store 창 닫기').click();
    await icon('mine').dblclick();await page.locator('[data-window-id="system:mine"]').waitFor();
    await button('내 앱 창 닫기').click();
    pass('겹치는 아이콘 위치 교환, Alt+방향키 이동, Enter와 더블클릭 실행');
    step='menu';await icon('store').focus();await page.keyboard.press('Shift+F10');
    await page.getByRole('navigation',{name:'바탕화면 메뉴'}).waitFor();await page.keyboard.press('Escape');
    assert.equal(await page.getByRole('navigation',{name:'바탕화면 메뉴'}).count(),0);
    await menu();await button('밤').click();await page.reload();await button('앱 둘러보기').waitFor();
    assert.equal(await page.locator('.os-desktop').getAttribute('data-wallpaper'),'night');
    await menu();await page.screenshot({path:join(out,'desktop-menu.png')});
    await button('아이콘 이름순 정렬').click();
    const sorted=await Promise.all(['store','mine','account','developer'].map(point));
    assert.equal(new Set(sorted.map(v=>JSON.stringify(v))).size,4);
    await menu();await button('아이콘 배치 초기화').click();assert.deepEqual(await point('store'),initial);
    pass('키보드·우클릭 메뉴, 배경 저장, 이름 정렬과 배치 초기화');
    step='identity';await icon('store').focus();await page.keyboard.press('Alt+ArrowRight');
    const guest=await point('store');
    assert.equal((await page.request.post('/v1/test/login',{headers:{Origin:origin},data:{subject:'alice',provider:'google',ageConfirmed:true}})).status(),200);
    await page.evaluate(()=>window.dispatchEvent(new Event('focus')));await button('내 계정').waitFor();
    assert.deepEqual(await point('store'),initial);assert.equal(await page.locator('.os-desktop').getAttribute('data-wallpaper'),'sky');
    await icon('store').focus();await page.keyboard.press('Alt+ArrowDown');
    await page.setViewportSize({width:390,height:844});
    await page.waitForFunction(()=>document.querySelector('[data-icon="store"]').getBoundingClientRect().right<=390);
    await page.setViewportSize({width:1440,height:1000});
    await button('시작 메뉴').click();await button('로그아웃').click();await button('로그인').waitFor();
    assert.deepEqual(await point('store'),guest);assert.equal(await page.locator('.os-desktop').getAttribute('data-wallpaper'),'night');
    pass('사용자별 배치·배경 분리, 좁은 화면 접근, 로그아웃 시 방문자 설정 복원');
    assert.deepEqual(errors,[]);completed=true;
  }finally{await writeFile(join(out,'result.json'),JSON.stringify({completed,step,checks,errors},null,2));await context.close();await browser.close();console.info('Icon artifacts: '+out);}
}
main().catch(()=>{console.error('바탕화면 아이콘 시험 실패. result.json의 단계를 확인하세요.');process.exitCode=1;});

import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';

// The repository already owns Playwright in @zm/web. This executable check uses that installed tool.
const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const { chromium } = requireWeb('playwright');
const temporary = await mkdtemp(path.join(tmpdir(), 'zm-os-devtools-e2e-'));
const app = path.join(temporary, 'notes');
const cli = path.join(root, 'packages/cli/dist/cli.js');
const output = path.join(here, '../e2e-out');
await mkdir(output, { recursive: true });
const run = async (...args) => {
  const child = spawn(process.execPath, [cli, ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let diagnostics = '';
  child.stdout.on('data', chunk => { diagnostics += chunk; }); child.stderr.on('data', chunk => { diagnostics += chunk; });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(diagnostics))); });
};
let server; let browser;
const errors = [];
async function cleanTemporary() {
  const resolved = path.resolve(temporary);
  if (path.dirname(resolved) !== path.resolve(tmpdir()) || !path.basename(resolved).startsWith('zm-os-devtools-e2e-')) throw new Error('시험 디렉터리 정리 범위를 벗어났습니다.');
  await rm(resolved, { recursive: true, force: true });
}
try {
  await run('init', app, '--app-id', '00000000-0000-4000-8000-000000000001', '--json');
  await run('build', app, '--json'); await run('validate', app, '--json'); await run('pack', app, '--out', path.join(temporary, 'app.zip'), '--json');
  server = spawn(process.execPath, [cli, 'dev', app], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let log = ''; server.stderr.on('data', chunk => { log += chunk; });
  const deadline = Date.now() + 15000;
  while (true) {
    try { const response = await fetch('http://127.0.0.1:4321'); if (response.ok) break; } catch { /* startup is bounded by the deadline below */ }
    if (server.exitCode !== null || Date.now() > deadline) throw new Error('시험 호스트 준비 실패: ' + log);
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const page = await browser.newPage({ viewport: { width: 1100, height: 850 } });
  page.on('pageerror', error => errors.push(error.message));
  page.on('dialog', dialog => { void dialog.accept(); });
  await page.goto('http://127.0.0.1:4321');
  const frame = () => page.frameLocator('iframe');
  await frame().locator('#user').filter({ hasText: 'test-app-user' }).waitFor();
  await frame().locator('#note').fill('Alice private'); await frame().locator('#save').click();
  await frame().locator('#status').filter({ hasText: '저장했습니다' }).waitFor();
  const isolation = await frame().locator('body').evaluate(() => {
    let parentDocument = false; let parentStorage = false;
    try { void window.parent.document.body; parentDocument = true; } catch { /* expected sandbox rejection */ }
    try { void window.parent.localStorage.length; parentStorage = true; } catch { /* expected sandbox rejection */ }
    return { parentDocument, parentStorage, origin: location.origin };
  });
  assert.deepEqual({ parentDocument: isolation.parentDocument, parentStorage: isolation.parentStorage }, { parentDocument: false, parentStorage: false });
  await page.locator('#user').selectOption('bob'); await page.locator('#start').click();
  await frame().locator('#user').filter({ hasText: ':bob' }).waitFor(); assert.equal(await frame().locator('#note').inputValue(), '');
  await page.locator('#user').selectOption('alice'); await page.locator('#start').click();
  await frame().locator('#user').filter({ hasText: ':alice' }).waitFor();
  await frame().locator('#note').filter({ visible: true }).waitFor();
  await page.waitForFunction(() => document.querySelector('iframe') !== null);
  // The user label precedes the asynchronous storage read. Wait for the saved value explicitly.
  const until = Date.now() + 5000;
  while (await frame().locator('#note').inputValue() !== 'Alice private') { if (Date.now() > until) throw new Error('Alice 메모 복원 실패'); await page.waitForTimeout(50); }
  await page.locator('#normal').click(); await frame().locator('#note').fill('Existing execution'); await frame().locator('#save').click();
  await frame().locator('#status').filter({ hasText: '저장했습니다' }).waitFor();
  await page.locator('#start').click(); assert.match(await page.locator('#status').innerText(), /새 실행이 차단/); assert.equal(await page.locator('iframe').count(), 1);
  await page.locator('#network').click(); await frame().locator('#save').click(); await frame().locator('#status').filter({ hasText: '네트워크' }).waitFor();
  await page.locator('#network').click(); await page.locator('#normal').click(); await page.locator('#emergency').click(); assert.equal(await page.locator('iframe').count(), 0);
  await page.locator('#start').click(); await frame().locator('#user').filter({ hasText: ':alice' }).waitFor();
  await page.locator('#clear').click(); assert.equal(await page.locator('iframe').count(), 0);
  await page.locator('#start').click(); await frame().locator('#user').filter({ hasText: ':alice' }).waitFor(); assert.equal(await frame().locator('#note').inputValue(), '');
  await page.screenshot({ path: path.join(output, 'dev-host.png'), fullPage: true });
  assert.deepEqual(errors, []);
  await writeFile(path.join(output, 'result.json'), JSON.stringify({ passed: true, checks: ['external-project-build-pack', 'iframe-parent-isolation', 'user-storage-isolation', 'same-user-restoration', 'normal-stop-existing-session', 'offline-fail-closed', 'emergency-close', 'confirmed-local-delete'], isolation, pageErrors: errors }, null, 2));
  process.stdout.write('PASS: CLI independent project and browser boundaries (8 checks)\n');
} finally {
  await browser?.close(); server?.kill();
  if (server && server.exitCode === null) await new Promise(resolve => { server.once('exit', resolve); setTimeout(resolve, 3000); });
  await cleanTemporary();
}

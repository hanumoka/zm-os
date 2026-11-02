import { createRequire } from 'node:module';
import { spawn } from 'node:child_process';
import { cp, mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import assert from 'node:assert/strict';
import { createExampleServer } from '../../../examples/api-server/server.ts';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '../../..');
const requireWeb = createRequire(path.join(root, 'apps/web/package.json'));
const { chromium, request } = requireWeb('playwright');
const web = process.env.TRIAL_WEB_ORIGIN ?? 'http://localhost:4300';
const apiOrigin = process.env.TRIAL_API_ORIGIN ?? 'http://127.0.0.1:4310';
const temporary = await mkdtemp(path.join(tmpdir(), 'zm-os-external-e2e-'));
const project = path.join(temporary, 'client');
const output = path.join(here, '../e2e-out');
await mkdir(output, { recursive: true });
const name = '외부 API 경계시험 ' + Date.now();
let owner; let browser; let external; let appId; let published = false;
const pageErrors = [];
const runCli = async (...args) => {
  const child = spawn(process.execPath, [path.join(root, 'packages/cli/dist/cli.js'), ...args], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true });
  let messages = ''; child.stdout.on('data', chunk => { messages += chunk; }); child.stderr.on('data', chunk => { messages += chunk; });
  await new Promise((resolve, reject) => { child.once('error', reject); child.once('exit', code => code === 0 ? resolve() : reject(new Error(messages))); });
};
async function actor(context, subject) {
  let csrf = '';
  async function call(route, method = 'GET', data, expected = 200) {
    const response = await context.fetch(web + '/v1' + route, { method, headers: { origin: web, ...(csrf ? { 'x-csrf-token': csrf } : {}), ...(data instanceof Buffer ? { 'content-type': 'application/zip' } : {}) }, ...(data === undefined ? {} : { data }) });
    const result = await response.json();
    assert.equal(response.status(), expected, `${method} ${route}: ${response.status()} ${result.code ?? ''}`);
    return result;
  }
  await call('/test/login', 'POST', { subject, provider: 'google', ageConfirmed: true });
  const me = await call('/me'); csrf = me.csrf;
  return { call, me, refresh: async () => { const fresh = await call('/me'); csrf = fresh.csrf; return fresh; } };
}
async function cleanupTemporary() {
  const target = path.resolve(temporary);
  if (path.dirname(target) !== path.resolve(tmpdir()) || !path.basename(target).startsWith('zm-os-external-e2e-')) throw new Error('잘못된 시험 정리 경로');
  await rm(target, { recursive: true, force: true });
}
try {
  owner = await request.newContext(); const admin = await actor(owner, 'owner');
  if (!admin.me.developer) {
    const application = await admin.call('/developer/applications', 'POST', { displayName: '외부 API 시험 개발자', email: 'trial@example.invalid', description: '로컬 외부 서버 인증 경계 시험' });
    await admin.call(`/operator/developer-applications/${application.id}/decisions`, 'POST', { decision: 'approved', reason: '로컬 시험 승인' });
    await admin.refresh();
  }
  const app = await admin.call('/developer/apps', 'POST', { name }); appId = app.id;
  await cp(path.join(root, 'examples/api-client'), project, { recursive: true, filter: source => !['dist', '.zm-output.json'].includes(path.basename(source)) });
  const manifest = JSON.parse(await readFile(path.join(project, 'manifest.json'), 'utf8')); manifest.appId = appId; manifest.name = name;
  await writeFile(path.join(project, 'manifest.json'), JSON.stringify(manifest, null, 2));
  await runCli('build', project, '--json'); await runCli('pack', project, '--out', path.join(temporary, 'app.zip'), '--local-test', '--json');
  const version = await admin.call(`/developer/apps/${appId}/versions`, 'POST', await readFile(path.join(temporary, 'app.zip')));
  const deadline = Date.now() + 30000;
  while (true) {
    const versions = await admin.call(`/developer/apps/${appId}/versions`); const current = versions.find(item => item.id === version.id);
    if (current.validationStatus === 'passed') break;
    if (current.validationStatus === 'failed' || Date.now() > deadline) throw new Error('번들 worker 검사 실패: ' + current.validationStatus);
    await new Promise(resolve => setTimeout(resolve, 300));
  }
  await admin.call(`/developer/versions/${version.id}/submit`, 'POST', {});
  await admin.call(`/operator/versions/${version.id}/decisions`, 'POST', { decision: 'approved', reason: '외부 인증 브라우저 시험' });
  await admin.call(`/developer/apps/${appId}/releases`, 'POST', { versionId: version.id, revision: app.revision }); published = true;
  const credential = await admin.call(`/developer/apps/${appId}/credentials`, 'POST', {});
  external = createExampleServer({ apiBase: apiOrigin, appId, appSecret: credential.secret, databasePath: path.join(temporary, 'notes.sqlite') });
  await new Promise((resolve, reject) => { external.once('error', reject); external.listen(4320, '127.0.0.1', resolve); });
  browser = await chromium.launch({ channel: 'chrome', headless: true });
  const aliceContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const bobContext = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const alice = await actor(aliceContext.request, 'alice'); const bob = await actor(bobContext.request, 'bob');
  async function openApp(context) {
    const page = await context.newPage(); page.on('pageerror', error => pageErrors.push(error.message));
    await page.goto(web); await page.getByRole('button', { name: name + ' 상세 보기', exact: true }).click();
    await page.getByRole('dialog').getByRole('button', { name: '앱 열기', exact: true }).click();
    const consent = page.getByRole('button', { name: '동의하고 실행', exact: true });
    await consent.waitFor({ state: 'visible' }); await consent.click();
    const frame = page.frameLocator('iframe');
    const completedAuth = page.waitForResponse(response => response.url() === 'http://127.0.0.1:4320/auth/complete' && response.status() === 200);
    await frame.getByRole('button', { name: '서버 연결', exact: true }).click();
    const authResponse = await completedAuth;
    const { sessionToken } = await authResponse.json();
    await frame.locator('#status').filter({ hasText: '서버에서 읽었습니다' }).waitFor();
    return { page, frame, sessionToken };
  }
  const first = await openApp(aliceContext);
  await first.frame.locator('#note').fill('Alice external private ' + appId);
  await first.frame.getByRole('button', { name: '서버에 저장', exact: true }).click();
  await first.frame.locator('#status').filter({ hasText: '서버에 저장했습니다' }).waitFor();
  const second = await openApp(bobContext);
  assert.equal(await second.frame.locator('#note').inputValue(), '');
  const aliceAppUser = await first.frame.locator('#user').innerText(); const bobAppUser = await second.frame.locator('#user').innerText();
  assert.notEqual(aliceAppUser, bobAppUser); assert.ok(!aliceAppUser.includes(alice.me.id)); assert.ok(!bobAppUser.includes(bob.me.id));
  await first.frame.getByRole('button', { name: '불러오기', exact: true }).click();
  assert.equal(await first.frame.locator('#note').inputValue(), 'Alice external private ' + appId);
  await first.page.screenshot({ path: path.join(output, 'platform-external.png'), fullPage: true });
  const beforeStop = (await admin.call('/developer/apps')).find(item => item.id === appId);
  await admin.call(`/operator/apps/${appId}/availability`, 'PUT', { status: 'normal_suspended', reason: '일반 중지 경계 시험', revision: beforeStop.revision });
  await first.frame.getByRole('button', { name: '불러오기', exact: true }).click();
  await first.frame.locator('#status').filter({ hasText: '서버에서 읽었습니다' }).waitFor();
  await alice.call('/app-sessions', 'POST', { appId }, 403);
  // Keep the existing Bob frame momentarily to observe a real external server rejection before the host's next poll closes it.
  const bobFrame = second.page.frames().find(frame => frame.url().includes('/apps/'));
  assert.ok(bobFrame);
  const requestBeforeRevocation = await bobFrame.evaluate(async () => {
    const button = document.querySelector('#load'); button.click();
    await new Promise(resolve => setTimeout(resolve, 100));
    return document.querySelector('#status').textContent;
  });
  assert.match(requestBeforeRevocation, /서버에서 읽었습니다/);
  const beforeRevocation = await fetch('http://127.0.0.1:4320/note', { headers: { authorization: 'Bearer ' + second.sessionToken } });
  assert.equal(beforeRevocation.status, 200);
  const admitted = await beforeRevocation.json();
  await bob.call(`/me/app-consents/${appId}`, 'DELETE');
  const afterRevocation = await fetch('http://127.0.0.1:4320/note', { headers: { authorization: 'Bearer ' + second.sessionToken } });
  assert.equal(afterRevocation.status, 403);
  let externalRejected = false;
  try {
    await second.frame.getByRole('button', { name: '불러오기', exact: true }).click({ timeout: 1000 });
    await second.frame.locator('#status').filter({ hasText: '권한을 확인하지 못했습니다' }).waitFor({ timeout: 1000 }); externalRejected = true;
  } catch { /* Host polling can close the frame first; independent API checks below still verify revocation. */ }
  await second.page.locator('iframe').waitFor({ state: 'detached', timeout: 10000 });
  const normal = (await admin.call('/developer/apps')).find(item => item.id === appId);
  await admin.call(`/operator/apps/${appId}/availability`, 'PUT', { status: 'emergency_suspended', reason: '긴급 중지 경계 시험', revision: normal.revision });
  await first.page.locator('iframe').waitFor({ state: 'detached', timeout: 10000 });
  assert.deepEqual(pageErrors, []);
  await writeFile(path.join(output, 'platform-external-result.json'), JSON.stringify({ passed: true, appId, versionId: version.id, checks: ['upload-worker-review-publish', 'prior-consent-and-browser-sdk', 'external-pkce-exchange', 'app-user-identity-isolation', 'separate-server-database', 'normal-stop-existing-request', 'normal-stop-denies-new-session', 'external-request-before-revocation-200', 'external-request-after-revocation-403', 'consent-revoke-closes-host', 'emergency-stop-closes-host'], admittedBeforeRevocationAt: admitted.admittedAt, externalRejectionObservedInFrame: externalRejected, pageErrors }, null, 2));
  process.stdout.write('PASS: platform and developer-operated external API browser flow\n');
} catch (error) {
  if (browser) {
    let index = 0;
    for (const context of browser.contexts()) for (const page of context.pages()) {
      await page.screenshot({ path: path.join(output, `platform-external-failure-${index}.png`), fullPage: true }).catch(() => undefined);
      await writeFile(path.join(output, `platform-external-failure-${index++}.txt`), await page.locator('body').innerText().catch(() => 'page unavailable'));
    }
  }
  throw error;
} finally {
  await browser?.close();
  if (external?.listening) await new Promise(resolve => external.close(resolve));
  // Preserve the reviewed test artifact but remove it from the public trial catalog.
  if (owner && appId && published) {
    try {
      const meResponse = await owner.get(web + '/v1/me'); const me = await meResponse.json();
      const appsResponse = await owner.get(web + '/v1/developer/apps'); const app = (await appsResponse.json()).find(item => item.id === appId);
      await owner.put(web + `/v1/developer/apps/${appId}/publication`, { headers: { origin: web, 'x-csrf-token': me.csrf }, data: { published: false, revision: app.revision } });
    } catch { /* Do not mask the original verification error. The test app name identifies cleanup scope. */ }
  }
  await owner?.dispose(); await cleanupTemporary();
}

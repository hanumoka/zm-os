/**
 * 호스트 API 계약 회귀 검증 (zm-docs `contracts.md` §3)
 *
 * 이 스크립트가 생긴 이유는 IPC 왕복을 검증하는 e2e가 **0건**이었기 때문이다.
 * 계약 배선은 세 조각(매니페스트 capability → 허용 메서드 → 핸들러)이 전부 맞아야
 * 동작하는데, 한 조각만 어긋나면 앱 화면에 `denied`가 뜰 뿐 자동으로 감지되지 않는다.
 * 메서드 이름을 FQN으로 바꾸는 변경이 정확히 그런 형태였다.
 *
 * 지키는 것:
 *   1. 매니페스트가 선언한 capability의 메서드가 실제로 실행된다
 *   2. 선언하지 않은 capability의 메서드는 거부된다 (1:1이 런타임에서도 성립)
 *   3. 부수 효과가 있는 메서드(`shell.setTitle`)가 호스트 상태를 바꾼다
 *
 * 실행: 프로덕션 서버(localhost:3000)를 띄운 뒤 `node e2e/e2e-ipc-contract.mjs`
 */

import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { join } from 'path';

const BASE = process.env.ZMOS_BASE_URL ?? 'http://localhost:3000';
const OUT_DIR = './e2e-out';
mkdirSync(OUT_DIR, { recursive: true });

const log = (m) => console.log(`[${new Date().toISOString().substring(11, 23)}] ${m}`);

const results = [];
const step = async (name, fn) => {
  try {
    log(`▶ ${name}`);
    const r = await fn();
    results.push({ step: name, ok: true, detail: r ?? '' });
    log(`✅ ${name}${r ? ' :: ' + r : ''}`);
  } catch (e) {
    results.push({ step: name, ok: false, detail: String(e) });
    log(`❌ ${name}: ${e.message}`);
  }
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));

/** IPC Demo 앱을 설치하고 창을 연다. */
async function openIpcDemo() {
  await page.goto(`${BASE}/store`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('text=IPC Demo').first().click({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page
    .locator('button')
    .filter({ hasText: /^설치$|^Install$/ })
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(500);

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  await page.locator('#desktop-icon-ipc-demo').dblclick({ timeout: 10000 });
  await page.waitForTimeout(1500);
}

/** 앱 iframe(opaque origin)을 찾는다. */
function appFrame() {
  const frames = page.frames().filter((f) => f !== page.mainFrame());
  if (frames.length === 0) throw new Error('앱 iframe이 없다');
  return frames[0];
}

/** 앱 안에서 호스트 RPC를 직접 호출하고 결과/에러를 돌려받는다. */
async function rpc(method, args = []) {
  return appFrame().evaluate(
    ([m, a]) =>
      window.__zmosIpc
        .call(m, a)
        .then((result) => ({ ok: true, result }))
        .catch((err) => ({ ok: false, code: err?.code ?? null, message: String(err?.message ?? err) })),
    [method, args],
  );
}

// ── 1. 부팅과 핸드셰이크 ─────────────────────────────────────────────────────
await step('1. IPC Demo가 열리고 핸드셰이크가 끝난다', async () => {
  await openIpcDemo();
  const status = await appFrame().locator('#status-label').innerText();
  // 앱이 표시하는 문구는 한국어다. 상태 판정은 `__zmosIpc` 존재로 한다 — 문구는 바뀔 수 있다.
  const hasRuntime = await appFrame().evaluate(() => typeof window.__zmosIpc);
  if (hasRuntime !== 'object') throw new Error(`IPC 런타임 미주입 (status=${status})`);
  return `status=${status}`;
});

// ── 2. 선언한 capability의 메서드가 실행된다 ─────────────────────────────────
await step('2. demo.ping이 실행된다', async () => {
  const r = await rpc('demo.ping');
  if (!r.ok || r.result !== 'pong') throw new Error(JSON.stringify(r));
  return `→ ${r.result}`;
});

await step('3. demo.getTime이 epoch ms를 돌려준다', async () => {
  const r = await rpc('demo.getTime');
  if (!r.ok) throw new Error(JSON.stringify(r));
  // 계약 §1이 "Date가 아니라 epoch 밀리초 number"를 요구한다. ISO 문자열이면 실패해야 한다.
  if (typeof r.result !== 'number') throw new Error(`number가 아니다: ${JSON.stringify(r.result)}`);
  if (r.result < 1_600_000_000_000) throw new Error(`epoch ms로 보이지 않는다: ${r.result}`);
  return `→ ${r.result} (number)`;
});

await step('4. demo.echo가 인자를 왕복시킨다', async () => {
  const r = await rpc('demo.echo', ['ping-from-e2e']);
  if (!r.ok || !String(r.result).includes('ping-from-e2e')) throw new Error(JSON.stringify(r));
  return `→ ${r.result}`;
});

// ── 5. 옛 평면 이름은 더 이상 통하지 않는다 ──────────────────────────────────
await step('5. 옛 평면 이름(ping)은 거부된다', async () => {
  const r = await rpc('ping');
  if (r.ok) throw new Error('평면 이름이 아직 통한다 — 이름 공간이 좁혀지지 않았다');
  return `denied (code=${r.code})`;
});

// ── 6. 선언하지 않은 capability는 거부된다 ───────────────────────────────────
await step('6. 선언하지 않은 notes.list는 거부된다', async () => {
  // IPC Demo의 매니페스트는 demo.basic·shell.window만 선언한다.
  const r = await rpc('notes.list');
  if (r.ok) throw new Error('선언하지 않은 capability의 메서드가 실행됐다');
  return `denied (code=${r.code})`;
});

// ── 7. 부수 효과가 실제로 호스트에 반영된다 ──────────────────────────────────
await step('7. shell.setTitle이 창 제목을 바꾼다', async () => {
  const marker = `E2E-${Date.now()}`;
  const r = await rpc('shell.setTitle', [marker]);
  if (!r.ok) throw new Error(JSON.stringify(r));
  await page.waitForTimeout(400);
  const shown = await page.locator('body').innerText();
  if (!shown.includes(marker)) throw new Error('창 제목에 반영되지 않았다');
  await page.screenshot({ path: join(OUT_DIR, 'ipc-contract-title.png'), fullPage: true });
  return `제목에 '${marker}' 반영됨`;
});

// ── 8. 창 닫기 ───────────────────────────────────────────────────────────────
await step('8. shell.close가 창을 닫는다', async () => {
  const before = page.frames().length;
  // 응답을 기다리지 않는다. 성공하면 창과 함께 iframe이 사라져 회신을 받을 상대가 없다 —
  // `await`하면 "Frame was detached"가 되고, 그것은 실패가 아니라 성공의 증상이다.
  void appFrame()
    .evaluate(() => window.__zmosIpc.call('shell.close', []))
    .catch(() => undefined);
  await page.waitForTimeout(800);
  const after = page.frames().length;
  if (after >= before) throw new Error(`프레임 수가 줄지 않았다: ${before} → ${after}`);
  return `프레임 ${before} → ${after}`;
});

// ── 요약 ─────────────────────────────────────────────────────────────────────
log('--- SUMMARY ---');
for (const r of results) log(`${r.ok ? '✅' : '❌'} ${r.step}${r.detail ? ' :: ' + r.detail : ''}`);
log(`pageErrors: ${pageErrors.length}`);
for (const e of pageErrors) log(`  ⚠ ${e}`);

await browser.close();
process.exit(results.every((r) => r.ok) && pageErrors.length === 0 ? 0 : 1);

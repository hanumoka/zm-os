import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT_DIR = './e2e-out';
mkdirSync(OUT_DIR, { recursive: true });

const log = (msg) => {
  const t = new Date().toISOString().substring(11, 23);
  console.log(`[${t}] ${msg}`);
};

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const consoleLogs = [];
const pageErrors = [];
const networkLog = [];
const phaserRequest = { status: null, url: null };

page.on('console', (msg) => {
  const entry = `[${msg.type()}] ${msg.text()}`;
  consoleLogs.push(entry);
});
page.on('pageerror', (err) => pageErrors.push(err.message));
page.on('response', (resp) => {
  const url = resp.url();
  const status = resp.status();
  networkLog.push(`${status} ${url}`);
  if (url.includes('phaser.min.js')) {
    phaserRequest.status = status;
    phaserRequest.url = url;
  }
});

const results = [];
const step = async (name, fn) => {
  try {
    log(`▶ ${name}`);
    const r = await fn();
    results.push({ step: name, ok: true, detail: r ?? '' });
    log(`✅ ${name}`);
  } catch (e) {
    results.push({ step: name, ok: false, detail: String(e) });
    log(`❌ ${name}: ${e.message}`);
  }
};

await step('1. Open / (Desktop)', async () => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, '01-desktop-initial.png'), fullPage: true });
  const storeIcon = await page.locator('#desktop-icon-__system_store__').count();
  const appIcons = await page.locator('[id^="desktop-icon-"]').count();
  return `store icon: ${storeIcon}, total desktop icons: ${appIcons}`;
});

await step('2. Click Store icon → /store', async () => {
  await page.locator('#desktop-icon-__system_store__').click({ timeout: 10000 });
  await page.waitForURL('**/store', { timeout: 5000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, '02-store-page.png'), fullPage: true });
  const cards = await page.locator('text=Snake').count();
  return `Snake text occurrences: ${cards}`;
});

await step('3. Click Snake card → detail panel', async () => {
  const card = page.locator('text=Snake').first();
  await card.click({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, '03-snake-detail.png'), fullPage: true });
  const longDesc = await page.locator('text=화살표 키').count();
  return `longDescription visible: ${longDesc > 0}`;
});

await step('4. Click Install button', async () => {
  const installBtn = page
    .locator('button')
    .filter({ hasText: /^설치$|^Install$/ })
    .first();
  const cnt = await installBtn.count();
  if (cnt === 0) throw new Error('Install button not found');
  await installBtn.click({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, '04-after-install.png'), fullPage: true });
});

await step('5. Navigate back to / (client nav)', async () => {
  const homeLink = page.locator('a[href="/"]').first();
  await homeLink.click({ timeout: 10000 });
  await page.waitForURL('http://localhost:3000/', { timeout: 5000 });
  await page.waitForLoadState('networkidle');
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, '05-desktop-with-snake.png'), fullPage: true });
  const snakeIcon = await page.locator('#desktop-icon-snake-game').count();
  return `Snake icon on desktop: ${snakeIcon}`;
});

await step('6. Double-click Snake icon → window opens', async () => {
  const icon = page.locator('#desktop-icon-snake-game').first();
  await icon.dblclick({ timeout: 10000 });
  await page.waitForTimeout(1500);
  await page.screenshot({ path: join(OUT_DIR, '06-snake-window-loading.png'), fullPage: true });
  const iframeCount = await page.locator('iframe').count();
  return `iframes on page: ${iframeCount}`;
});

await step('7. Wait for iframe + Phaser canvas inside', async () => {
  await page.waitForTimeout(2500);
  await page.screenshot({ path: join(OUT_DIR, '07-snake-window-loaded.png'), fullPage: true });
  const frames = page.frames();
  const frameInfo = frames.map((f) => ({ url: f.url(), name: f.name() }));
  let canvasOk = false;
  let phaserOk = false;
  let hudText = '';
  for (const f of frames) {
    if (f === page.mainFrame()) continue;
    try {
      const cnt = await f.locator('canvas').count();
      if (cnt > 0) canvasOk = true;
      const phaser = await f.evaluate(() => typeof window.Phaser !== 'undefined').catch(() => false);
      if (phaser) phaserOk = true;
      const hud = await f.locator('.hud, #score').first().textContent().catch(() => null);
      if (hud) hudText = hud;
    } catch {}
  }
  return `frames: ${frames.length}, canvas: ${canvasOk}, Phaser: ${phaserOk}, hud: "${hudText}"`;
});

await step('8. /phaser.min.js network status', async () => {
  return `status: ${phaserRequest.status}, url: ${phaserRequest.url}`;
});

await step('9a. Pre-input state — should be paused (no game-over)', async () => {
  const iframeEl = page.locator('iframe').first();
  if ((await iframeEl.count()) === 0) throw new Error('No iframe present');
  await iframeEl.click({ timeout: 5000 });
  await page.waitForTimeout(500);
  let overlayVisible = null;
  let hudHint = '';
  let score = '';
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    overlayVisible = await f
      .locator('#overlay.visible')
      .count()
      .catch(() => -1);
    hudHint = (await f.locator('#hud-hint').textContent().catch(() => '')) || '';
    score = (await f.locator('#score-display').textContent().catch(() => '')) || '';
  }
  await page.screenshot({ path: join(OUT_DIR, '08a-pre-input.png'), fullPage: true });
  return `overlay.visible: ${overlayVisible}, hudHint: "${hudHint}", score: "${score}"`;
});

await step('9b. Press ArrowRight + wait 3s — should be moving, no game-over', async () => {
  await page.keyboard.press('ArrowRight');
  await page.waitForTimeout(3000);
  let overlayVisible = null;
  let hudHint = '';
  let score = '';
  let snakeLen = null;
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    overlayVisible = await f.locator('#overlay.visible').count().catch(() => -1);
    hudHint = (await f.locator('#hud-hint').textContent().catch(() => '')) || '';
    score = (await f.locator('#score-display').textContent().catch(() => '')) || '';
    snakeLen = await f
      .evaluate(() => {
        const phaserGame = window.Phaser?.GAMES?.[0] || null;
        const scene = phaserGame?.scene?.getScene('SnakeScene');
        return scene?.snake?.length ?? null;
      })
      .catch(() => null);
  }
  await page.screenshot({ path: join(OUT_DIR, '08b-after-arrow-right.png'), fullPage: true });
  return `overlay.visible: ${overlayVisible}, hudHint: "${hudHint}", score: "${score}", snakeLen: ${snakeLen}`;
});

await step('9c. Game-over check + Space restart', async () => {
  // Try to maneuver into a wall on purpose to verify game over flow
  // ArrowRight x ~30 ticks → hits wall (COLS=30, started at x=15)
  for (let i = 0; i < 30; i++) {
    await page.keyboard.press('ArrowRight');
    await page.waitForTimeout(50);
  }
  await page.waitForTimeout(1000);
  let overlayVisibleAfterWall = null;
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    overlayVisibleAfterWall = await f.locator('#overlay.visible').count().catch(() => -1);
  }
  await page.screenshot({ path: join(OUT_DIR, '08c-after-wall-crash.png'), fullPage: true });
  // Press Space to restart
  await page.keyboard.press('Space');
  await page.waitForTimeout(800);
  let overlayAfterRestart = null;
  for (const f of page.frames()) {
    if (f === page.mainFrame()) continue;
    overlayAfterRestart = await f.locator('#overlay.visible').count().catch(() => -1);
  }
  await page.screenshot({ path: join(OUT_DIR, '08d-after-space-restart.png'), fullPage: true });
  return `wall→overlay.visible: ${overlayVisibleAfterWall}, restart→overlay.visible: ${overlayAfterRestart}`;
});

await step('10. Final screenshot', async () => {
  await page.screenshot({ path: join(OUT_DIR, '09-final.png'), fullPage: true });
});

await browser.close();

const report = {
  timestamp: new Date().toISOString(),
  results,
  phaserRequest,
  pageErrors,
  consoleLogs: consoleLogs.slice(-50),
  networkLog: networkLog.filter((l) =>
    /phaser|sample-game|store|api|favicon/.test(l) || !l.startsWith('200'),
  ),
};
writeFileSync(join(OUT_DIR, 'report.json'), JSON.stringify(report, null, 2));

log('--- SUMMARY ---');
results.forEach((r) => log(`${r.ok ? '✅' : '❌'} ${r.step} :: ${r.detail}`));
log(`pageErrors: ${pageErrors.length}`);
log(`/phaser.min.js: ${phaserRequest.status}`);

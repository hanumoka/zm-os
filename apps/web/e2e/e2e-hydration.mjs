import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';

const OUT_DIR = './e2e-out';
mkdirSync(OUT_DIR, { recursive: true });

const log = (m) => console.log(`[${new Date().toISOString().substring(11, 23)}] ${m}`);

const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
const idbErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') idbErrors.push(m.text());
});

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

async function readDesktopState() {
  const storeIcon = await page.locator('#desktop-icon-__system_store__').count();
  const allIcons = await page.locator('[id^="desktop-icon-"]').count();
  const snakeIcon = await page.locator('#desktop-icon-snake-game').count();
  return { storeIcon, allIcons, snakeIcon };
}

// ── Phase A: 초기 상태 (빈 IDB) ─────────────────────────
await step('A1. Fresh load — empty desktop (no snake)', async () => {
  await page.goto('http://localhost:3000', { waitUntil: 'networkidle' });
  await page.waitForTimeout(800); // hydration 대기
  await page.screenshot({ path: join(OUT_DIR, 'h01-fresh.png'), fullPage: true });
  const s = await readDesktopState();
  return `store: ${s.storeIcon}, all: ${s.allIcons}, snake: ${s.snakeIcon} (snake expected 0)`;
});

// ── Phase B: 설치 흐름 ────────────────────────────────
await step('B1. Navigate to /store + install Snake', async () => {
  await page.locator('#desktop-icon-__system_store__').click({ timeout: 10000 });
  await page.waitForURL('**/store', { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.locator('text=Snake').first().click({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page
    .locator('button')
    .filter({ hasText: /^설치$|^Install$/ })
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(500); // fire-and-forget persist 완료 대기
  await page.screenshot({ path: join(OUT_DIR, 'h02-installed.png'), fullPage: true });
});

await step('B2. Back to / → snake icon visible', async () => {
  await page.locator('a[href="/"]').first().click({ timeout: 10000 });
  await page.waitForURL('http://localhost:3000/', { timeout: 5000 });
  await page.waitForTimeout(500);
  const s = await readDesktopState();
  return `snake: ${s.snakeIcon} (expected 1)`;
});

// ── Phase C: 영속화 검증 (full page reload) ───────────
await step('C1. Full page reload — IDB hydration expected', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000); // hydration useEffect + dispatch + render 대기
  await page.screenshot({ path: join(OUT_DIR, 'h03-after-reload.png'), fullPage: true });
  const s = await readDesktopState();
  return `snake: ${s.snakeIcon} (expected 1 — hydration from IDB)`;
});

// ── Phase D: Uninstall 영속화 ─────────────────────────
await step('D1. Navigate to /store + uninstall Snake', async () => {
  await page.locator('#desktop-icon-__system_store__').click({ timeout: 10000 });
  await page.waitForURL('**/store', { timeout: 5000 });
  await page.waitForTimeout(300);
  await page.locator('text=Snake').first().click({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page
    .locator('button')
    .filter({ hasText: /^제거$|^삭제$|^Uninstall$|^Remove$/ })
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, 'h04-uninstalled.png'), fullPage: true });
});

await step('D2. Back to / → snake icon removed', async () => {
  await page.locator('a[href="/"]').first().click({ timeout: 10000 });
  await page.waitForURL('http://localhost:3000/', { timeout: 5000 });
  await page.waitForTimeout(500);
  const s = await readDesktopState();
  return `snake: ${s.snakeIcon} (expected 0)`;
});

await step('D3. Reload — IDB persistence of uninstall', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await page.screenshot({ path: join(OUT_DIR, 'h05-after-reload-uninstall.png'), fullPage: true });
  const s = await readDesktopState();
  return `snake: ${s.snakeIcon} (expected 0 — uninstall persisted)`;
});

// ── Phase E: IDB direct inspection ────────────────────
await step('E1. Inspect IndexedDB content via DevTools API', async () => {
  const idbState = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open('zm-os', 1);
      req.onsuccess = () => {
        const db = req.result;
        const tx = db.transaction('installed-apps', 'readonly');
        const store = tx.objectStore('installed-apps');
        const keyReq = store.getAllKeys();
        keyReq.onsuccess = () => {
          resolve({ keys: keyReq.result, dbName: db.name, version: db.version });
        };
        keyReq.onerror = () => resolve({ error: 'getAllKeys failed' });
      };
      req.onerror = () => resolve({ error: 'open failed' });
    });
  });
  return JSON.stringify(idbState);
});

await browser.close();

writeFileSync(
  join(OUT_DIR, 'hydration-report.json'),
  JSON.stringify({ results, pageErrors, idbErrors: idbErrors.slice(-20) }, null, 2),
);

log('--- SUMMARY ---');
results.forEach((r) => log(`${r.ok ? '✅' : '❌'} ${r.step} :: ${r.detail}`));
log(`pageErrors: ${pageErrors.length}, idbErrors: ${idbErrors.length}`);

import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';

const OUT_DIR = './e2e-out';
mkdirSync(OUT_DIR, { recursive: true });

const log = (m) => console.log(`[${new Date().toISOString().substring(11, 23)}] ${m}`);

// ── 테스트 ZIP 생성 헬퍼 ──────────────────────────────
async function makeUserAppZip({ id = 'com.test.uploadapp', name = 'TestApp', version = '1.0.0', html, extraFiles = {} } = {}) {
  const zip = new JSZip();
  const manifest = {
    schemaVersion: 1,
    id,
    name,
    version,
    author: 'e2e-test',
    description: 'e2e 테스트용 사용자 ZIP 앱',
    entryPoint: 'index.html',
    size: { defaultWidth: 320, defaultHeight: 240 },
  };
  zip.file('manifest.json', JSON.stringify(manifest, null, 2));
  zip.file(
    'index.html',
    html ??
      `<!DOCTYPE html><html><body style="font-family:sans-serif;padding:20px;background:#0f172a;color:#e2e8f0;">
<h1 id="title">${name}</h1>
<p id="msg">e2e 테스트 사용자 앱 정상 실행 ✅</p>
<script>document.title='${name}';document.getElementById('msg').textContent+=' (script ran)';</script>
</body></html>`,
  );
  for (const [path, content] of Object.entries(extraFiles)) {
    zip.file(path, content);
  }
  const blob = await zip.generateAsync({ type: 'nodebuffer' });
  return blob;
}

async function makeBadZip(kind) {
  const zip = new JSZip();
  if (kind === 'no-manifest') {
    zip.file('index.html', '<html></html>');
    return zip.generateAsync({ type: 'nodebuffer' });
  }
  if (kind === 'no-html') {
    zip.file('manifest.json', '{"schemaVersion":1,"id":"x","name":"X","version":"1.0.0","entryPoint":"index.html","size":{"defaultWidth":320,"defaultHeight":240}}');
    return zip.generateAsync({ type: 'nodebuffer' });
  }
  if (kind === 'path-traversal') {
    zip.file('../evil.html', '<html></html>');
    zip.file('manifest.json', '{"schemaVersion":1,"id":"x","name":"X","version":"1.0.0","entryPoint":"index.html","size":{"defaultWidth":320,"defaultHeight":240}}');
    zip.file('index.html', '<html></html>');
    return zip.generateAsync({ type: 'nodebuffer' });
  }
  if (kind === 'manifest-invalid') {
    zip.file('manifest.json', '{"schemaVersion":1}'); // 필수 필드 누락
    zip.file('index.html', '<html></html>');
    return zip.generateAsync({ type: 'nodebuffer' });
  }
  if (kind === 'not-zip-magic') {
    // ZIP magic byte 없는 가짜 zip 파일 (텍스트)
    return Buffer.from('not a zip file just text');
  }
  throw new Error('unknown bad zip kind: ' + kind);
}

// ── Playwright 실행 ───────────────────────────────────
const browser = await chromium.launch({ headless: true });
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

const pageErrors = [];
const consoleErrors = [];
page.on('pageerror', (e) => pageErrors.push(e.message));
page.on('console', (m) => {
  if (m.type() === 'error') consoleErrors.push(m.text());
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

async function uploadFile(buffer, filename) {
  const fileInput = await page.locator('input[type="file"][accept*=".zip"]');
  await fileInput.setInputFiles({
    name: filename,
    mimeType: 'application/zip',
    buffer,
  });
}

async function getUploadButtonText() {
  return (await page.locator('button:has-text("ZIP"), button:has-text("완료"), button:has-text("다시"), button:has-text("검증"), button:has-text("저장")').first().textContent()) ?? '';
}

async function getErrorMessage() {
  const errEl = page.locator('[role="alert"]').first();
  if (await errEl.count() === 0) return '';
  return (await errEl.textContent()) ?? '';
}

// ── Phase A: 정상 ZIP 업로드 ──────────────────────────
await step('A1. /store 진입', async () => {
  await page.goto('http://localhost:3000/store', { waitUntil: 'networkidle' });
  await page.waitForTimeout(500);
  await page.screenshot({ path: join(OUT_DIR, 'zu01-store.png'), fullPage: true });
});

await step('A2. 정상 ZIP 업로드 → catalog 추가', async () => {
  const validZip = await makeUserAppZip({ id: 'com.e2e.basicapp', name: 'E2E BasicApp' });
  await uploadFile(validZip, 'basicapp.zip');
  await page.waitForTimeout(1500);
  const btnText = await getUploadButtonText();
  await page.screenshot({ path: join(OUT_DIR, 'zu02-uploaded.png'), fullPage: true });
  const userAppCard = await page.locator('text=E2E BasicApp').count();
  return `btn: "${btnText.trim()}", card: ${userAppCard}`;
});

await step('A3. user app 설치 → 데스크탑 진입 → iframe 실행', async () => {
  // 카드 클릭 → 상세 → 설치
  await page.locator('text=E2E BasicApp').first().click({ timeout: 5000 });
  await page.waitForTimeout(400);
  await page.locator('button').filter({ hasText: /^설치$|^Install$/ }).first().click({ timeout: 5000 });
  await page.waitForTimeout(500);
  await page.locator('a[href="/"]').first().click({ timeout: 5000 });
  await page.waitForURL('http://localhost:3000/', { timeout: 5000 });
  await page.waitForTimeout(800);
  const desktopIcon = await page.locator('#desktop-icon-com\\.e2e\\.basicapp').count();
  await page.screenshot({ path: join(OUT_DIR, 'zu03-desktop.png'), fullPage: true });
  return `desktop icon: ${desktopIcon}`;
});

await step('A4. user app iframe 실행', async () => {
  await page.locator('#desktop-icon-com\\.e2e\\.basicapp').first().dblclick({ timeout: 5000 });
  await page.waitForTimeout(2500);
  const iframes = page.frames();
  let titleSeen = '';
  let scriptRan = false;
  for (const f of iframes) {
    if (f === page.mainFrame()) continue;
    const t = await f.locator('#title').textContent().catch(() => null);
    if (t) titleSeen = t;
    const msg = await f.locator('#msg').textContent().catch(() => null);
    if (msg?.includes('script ran')) scriptRan = true;
  }
  await page.screenshot({ path: join(OUT_DIR, 'zu04-running.png'), fullPage: true });
  return `frames: ${iframes.length}, title: "${titleSeen}", scriptRan: ${scriptRan}`;
});

// ── Phase B: 영속화 ───────────────────────────────────
await step('B1. Reload → user app hydration', async () => {
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const desktopIcon = await page.locator('#desktop-icon-com\\.e2e\\.basicapp').count();
  await page.screenshot({ path: join(OUT_DIR, 'zu05-after-reload.png'), fullPage: true });
  return `icon after reload: ${desktopIcon}`;
});

// ── Phase C: 거부 케이스 ──────────────────────────────
async function gotoStoreFresh() {
  await page.goto('http://localhost:3000/store', { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
}

await step('C1. ZIP magic byte 없는 파일 → NOT_ZIP_MAGIC', async () => {
  await gotoStoreFresh();
  const bad = await makeBadZip('not-zip-magic');
  await uploadFile(bad, 'fake.zip');
  await page.waitForTimeout(800);
  const err = await getErrorMessage();
  return `err: "${err.slice(0, 80)}"`;
});

await step('C2. manifest 누락 → NO_MANIFEST', async () => {
  await gotoStoreFresh();
  const bad = await makeBadZip('no-manifest');
  await uploadFile(bad, 'no-manifest.zip');
  await page.waitForTimeout(800);
  const err = await getErrorMessage();
  return `err: "${err.slice(0, 80)}"`;
});

await step('C3. index.html 누락 → NO_HTML', async () => {
  await gotoStoreFresh();
  const bad = await makeBadZip('no-html');
  await uploadFile(bad, 'no-html.zip');
  await page.waitForTimeout(800);
  const err = await getErrorMessage();
  return `err: "${err.slice(0, 80)}"`;
});

await step('C4. Path traversal (../) → PATH_TRAVERSAL', async () => {
  await gotoStoreFresh();
  const bad = await makeBadZip('path-traversal');
  await uploadFile(bad, 'traversal.zip');
  await page.waitForTimeout(800);
  const err = await getErrorMessage();
  return `err: "${err.slice(0, 80)}"`;
});

await step('C5. Manifest invalid (Zod) → MANIFEST_INVALID', async () => {
  await gotoStoreFresh();
  const bad = await makeBadZip('manifest-invalid');
  await uploadFile(bad, 'manifest-bad.zip');
  await page.waitForTimeout(800);
  const err = await getErrorMessage();
  return `err: "${err.slice(0, 80)}"`;
});

await step('C6. Duplicate id (built-in) → DUPLICATE_ID', async () => {
  await gotoStoreFresh();
  const dup = await makeUserAppZip({ id: 'com.zmos.sample.snake-game', name: 'DupSnake' });
  await uploadFile(dup, 'dup.zip');
  await page.waitForTimeout(800);
  const err = await getErrorMessage();
  return `err: "${err.slice(0, 80)}"`;
});

// ── Phase D: IDB 직접 확인 ────────────────────────────
await step('D1. IDB user-apps store 확인', async () => {
  const idbState = await page.evaluate(async () => {
    return new Promise((resolve) => {
      const req = indexedDB.open('zm-os', 2);
      req.onsuccess = () => {
        const db = req.result;
        if (!db.objectStoreNames.contains('user-apps')) {
          resolve({ error: 'user-apps store missing', version: db.version });
          return;
        }
        const tx = db.transaction('user-apps', 'readonly');
        const store = tx.objectStore('user-apps');
        const keyReq = store.getAllKeys();
        keyReq.onsuccess = () => resolve({ keys: keyReq.result, version: db.version });
        keyReq.onerror = () => resolve({ error: 'getAllKeys failed', version: db.version });
      };
      req.onerror = () => resolve({ error: 'open failed' });
    });
  });
  return JSON.stringify(idbState);
});

await browser.close();

writeFileSync(
  join(OUT_DIR, 'zip-upload-report.json'),
  JSON.stringify({ results, pageErrors, consoleErrors: consoleErrors.slice(-20) }, null, 2),
);

log('--- SUMMARY ---');
results.forEach((r) => log(`${r.ok ? '✅' : '❌'} ${r.step} :: ${r.detail}`));
log(`pageErrors: ${pageErrors.length}, consoleErrors: ${consoleErrors.length}`);

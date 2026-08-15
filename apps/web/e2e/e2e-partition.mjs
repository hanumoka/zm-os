/**
 * 파티션 스코프 키 회귀 검증 (zm-docs `contracts.md` §2)
 *
 * 단위 테스트는 Node의 메모리 폴백 위에서 돈다. 실제 IndexedDB에서 접두사가 붙는지,
 * 접두사 이전에 쓰인 레코드가 흡수되는지는 브라우저에서만 확인할 수 있다.
 *
 * 이 스크립트가 지키는 것은 두 가지다.
 *   1. 저장 키가 `{ownerId}:{key}` 형태로 들어간다
 *   2. 접두사 없이 심어둔 레코드가 부팅 시 흡수되어 화면에 다시 나타난다
 *
 * 2번이 중요하다 — 흡수가 없으면 소유자의 설치 목록과 아이콘 배치가 조용히 사라진다.
 *
 * 실행: 프로덕션 서버(localhost:3000)를 띄운 뒤 `node e2e/e2e-partition.mjs`
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

/** 페이지 컨텍스트에서 zm-os IDB store 하나를 통째로 읽는다. */
async function dumpStore(store) {
  return page.evaluate(
    (storeName) =>
      new Promise((resolve) => {
        const req = indexedDB.open('zm-os');
        req.onerror = () => resolve({ error: 'open failed' });
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(storeName)) return resolve({ keys: [], values: [] });
          const tx = db.transaction(storeName, 'readonly');
          const os = tx.objectStore(storeName);
          const kq = os.getAllKeys();
          const vq = os.getAll();
          tx.oncomplete = () => resolve({ keys: kq.result, values: vq.result });
          tx.onerror = () => resolve({ error: 'tx failed' });
        };
      }),
    store,
  );
}

/** 접두사 없는 평문 키로 레코드를 심는다 — 접두사 도입 전 상태를 재현한다. */
async function seedLegacy(store, key, value) {
  return page.evaluate(
    ([storeName, k, v]) =>
      new Promise((resolve, reject) => {
        const req = indexedDB.open('zm-os');
        req.onerror = () => reject(new Error('open failed'));
        req.onsuccess = () => {
          const db = req.result;
          const tx = db.transaction(storeName, 'readwrite');
          tx.objectStore(storeName).put(v, k);
          tx.oncomplete = () => resolve(true);
          tx.onerror = () => reject(new Error('tx failed'));
        };
      }),
    [store, key, value],
  );
}

const UUID_PREFIX = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}:/;

// ── 1. 소유자 ID 부트스트랩 ──────────────────────────────────────────────────
await step('1. 첫 부팅에서 소유자 ID가 system에 만들어진다', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const sys = await dumpStore('system');
  const idx = (sys.keys ?? []).indexOf('owner-id');
  if (idx < 0) throw new Error(`system에 owner-id가 없다: ${JSON.stringify(sys.keys)}`);
  const owner = sys.values[idx];
  if (typeof owner !== 'string' || owner.includes(':')) {
    throw new Error(`소유자 ID 형식이 잘못됐다: ${JSON.stringify(owner)}`);
  }
  if (owner === 'local') throw new Error("리터럴 'local'이 쓰였다");
  return `ownerId 길이 ${owner.length}, 구분자 없음`;
});

// ── 2. 설치가 접두사 붙은 키로 저장된다 ──────────────────────────────────────
await step('2. 설치 레코드가 {ownerId}:{key} 형태로 저장된다', async () => {
  await page.goto(`${BASE}/store`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(400);
  await page.locator('text=Snake').first().click({ timeout: 10000 });
  await page.waitForTimeout(300);
  await page
    .locator('button')
    .filter({ hasText: /^설치$|^Install$/ })
    .first()
    .click({ timeout: 10000 });
  await page.waitForTimeout(800);

  const installed = await dumpStore('installed-apps');
  const keys = installed.keys ?? [];
  if (keys.length === 0) throw new Error('installed-apps가 비어 있다');
  const bare = keys.filter((k) => !UUID_PREFIX.test(k));
  if (bare.length > 0) throw new Error(`접두사 없는 키가 있다: ${JSON.stringify(bare)}`);
  return `키 ${keys.length}개 전부 접두사 있음: ${JSON.stringify(keys)}`;
});

// ── 3. 접두사 붙은 데이터로 정상 복원된다 ────────────────────────────────────
await step('3. 새로고침 후 접두사 데이터로 복원된다', async () => {
  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const snake = await page.locator('#desktop-icon-snake-game').count();
  if (snake !== 1) throw new Error(`snake 아이콘 ${snake}개 (기대 1)`);
  return 'snake 아이콘 1개';
});

// ── 4. 접두사 없는 레거시 레코드가 흡수된다 ──────────────────────────────────
await step('4. 접두사 없는 레거시 레코드를 흡수한다', async () => {
  // 흡수는 1회만 돈다. 완료 표시를 지워 다시 돌게 한 뒤 레거시 레코드를 심는다.
  await page.evaluate(
    () =>
      new Promise((resolve) => {
        const req = indexedDB.open('zm-os');
        req.onsuccess = () => {
          const tx = req.result.transaction('system', 'readwrite');
          tx.objectStore('system').delete('partition-migrated-at');
          tx.oncomplete = () => resolve(true);
        };
      }),
  );
  await seedLegacy('installed-apps', 'sample-tetris', {
    id: 'sample-tetris',
    installedAt: 1,
  });

  await page.goto(BASE, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const installed = await dumpStore('installed-apps');
  const keys = installed.keys ?? [];
  if (keys.includes('sample-tetris')) throw new Error('평문 키가 그대로 남아 있다');
  const adopted = keys.filter((k) => k.endsWith(':sample-tetris'));
  if (adopted.length !== 1) {
    throw new Error(`흡수된 키를 찾지 못했다: ${JSON.stringify(keys)}`);
  }
  return `'sample-tetris' → '${adopted[0]}'`;
});

// ── 5. 흡수 뒤에도 화면이 정상이다 ───────────────────────────────────────────
await step('5. 흡수 뒤 데스크탑이 정상 렌더된다', async () => {
  const icons = await page.locator('[id^="desktop-icon-"]').count();
  if (icons < 2) throw new Error(`데스크탑 아이콘 ${icons}개 — 흡수 후 목록이 줄었다`);
  await page.screenshot({ path: join(OUT_DIR, 'partition-final.png'), fullPage: true });
  return `아이콘 ${icons}개`;
});

// ── 요약 ─────────────────────────────────────────────────────────────────────
log('--- SUMMARY ---');
for (const r of results) log(`${r.ok ? '✅' : '❌'} ${r.step}${r.detail ? ' :: ' + r.detail : ''}`);
log(`pageErrors: ${pageErrors.length}`);
for (const e of pageErrors) log(`  ⚠ ${e}`);

await browser.close();
process.exit(results.every((r) => r.ok) && pageErrors.length === 0 ? 0 : 1);

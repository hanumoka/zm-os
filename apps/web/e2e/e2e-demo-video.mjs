/**
 * e2e-demo-video.mjs — zm-os POC 데모 영상 녹화
 *
 * 흐름 (~90초):
 *   Scene 1: 데스크탑 첫 진입 (빈 데스크탑)
 *   Scene 2: 스토어 → 5개 built-in 앱 전체 설치
 *   Scene 3: ZIP 업로드 → 사용자 앱 등록
 *   Scene 4: 데스크탑 복귀 → Snake 게임플레이
 *   Scene 5: Pixi.js + Three.js 동시 실행
 *   Scene 6: 사용자 앱(My First App) 실행
 *   Scene 7: 전체 앱 동시 실행 피날레
 *
 * 실행: node e2e-demo-video.mjs
 * 산출물: e2e-out/*.webm + 스크린샷
 */
import { chromium } from 'playwright';
import { mkdirSync, writeFileSync } from 'fs';
import { join } from 'path';
import JSZip from 'jszip';

const BASE = 'http://localhost:3000';
const OUT_DIR = './e2e-out';
mkdirSync(OUT_DIR, { recursive: true });

const log = (msg) => {
  const t = new Date().toISOString().substring(11, 23);
  console.log(`[${t}] ${msg}`);
};

async function screenshot(page, name) {
  const path = join(OUT_DIR, `demo-${name}.png`);
  await page.screenshot({ path });
  log(`  📸 ${path}`);
}

async function installApp(page, appName) {
  const card = page.locator(`text=${appName}`).first();
  if (!await card.isVisible().catch(() => false)) return false;
  await card.click();
  await page.waitForTimeout(400);
  const btn = page.locator('button').filter({ hasText: /설치|Install/ }).first();
  if (await btn.isVisible().catch(() => false)) {
    await btn.click();
    await page.waitForTimeout(600);
    log(`  ✅ ${appName} 설치`);
    return true;
  }
  return false;
}

async function openApp(page, appName) {
  const icon = page.locator(`text=${appName}`).first();
  if (await icon.isVisible().catch(() => false)) {
    await icon.dblclick();
    await page.waitForTimeout(3500);
    log(`  ✅ ${appName} 실행`);
    return true;
  }
  log(`  ⚠️ ${appName} 아이콘 없음`);
  return false;
}

async function closeAllWindows(page) {
  const closeBtns = page.locator('button').filter({ hasText: '✕' });
  let count = await closeBtns.count();
  for (let i = count - 1; i >= 0; i--) {
    const btn = closeBtns.nth(i);
    if (await btn.isVisible().catch(() => false)) {
      await btn.click();
      await page.waitForTimeout(300);
    }
  }
}

async function makeUserAppZip() {
  const zip = new JSZip();
  zip.file('manifest.json', JSON.stringify({
    schemaVersion: 1,
    id: 'com.demo.my-first-app',
    name: 'My First App',
    version: '1.0.0',
    author: 'Demo User',
    description: '사용자가 직접 만든 첫 번째 앱',
    entryPoint: 'index.html',
    size: { defaultWidth: 400, defaultHeight: 300 },
  }, null, 2));
  zip.file('index.html', `<!DOCTYPE html>
<html lang="ko">
<head><meta charset="UTF-8"><title>My First App</title>
<style>
  * { margin: 0; padding: 0; box-sizing: border-box; }
  body {
    background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
    color: white; font-family: -apple-system, sans-serif;
    display: flex; flex-direction: column; align-items: center;
    justify-content: center; height: 100vh; text-align: center;
  }
  h1 { font-size: 2em; margin-bottom: 12px; }
  p { font-size: 1.1em; opacity: 0.9; }
  .badge { margin-top: 20px; padding: 8px 16px; background: rgba(255,255,255,0.2);
    border-radius: 20px; font-size: 0.9em; }
  .clock { margin-top: 16px; font-size: 1.5em; font-family: monospace; }
</style></head>
<body>
  <h1>🎉 My First App</h1>
  <p>zm-os에서 실행 중인 사용자 제작 앱입니다</p>
  <div class="badge">sandbox iframe · null origin · 격리 실행</div>
  <div class="clock" id="clock"></div>
  <script>
    setInterval(function() {
      document.getElementById('clock').textContent = new Date().toLocaleTimeString('ko-KR');
    }, 1000);
    document.getElementById('clock').textContent = new Date().toLocaleTimeString('ko-KR');
  </script>
</body></html>`);
  return zip.generateAsync({ type: 'nodebuffer' });
}

// ─── Main ─────────────────────────────────────────────────────────────────────
(async () => {
  log('=== zm-os POC 데모 영상 녹화 시작 ===');
  log('');

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 720 },
    recordVideo: { dir: OUT_DIR, size: { width: 1280, height: 720 } },
  });
  const page = await context.newPage();

  try {
    // ═══ Scene 1: 데스크탑 첫 진입 ═══════════════════════════════════════════
    log('Scene 1: 데스크탑 첫 진입');
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await screenshot(page, '01-desktop-empty');

    // ═══ Scene 2: 스토어 → 전체 설치 ═════════════════════════════════════════
    log('Scene 2: 스토어 → built-in 앱 전체 설치');
    await page.goto(BASE + '/store', { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(2000);
    await screenshot(page, '02-store-catalog');

    for (const name of ['Bouncing Ball', 'IPC Demo', 'Snake', 'Particle Rain', 'Spinning Cubes']) {
      await installApp(page, name);
    }
    await page.waitForTimeout(500);

    // ═══ Scene 3: ZIP 업로드 ═════════════════════════════════════════════════
    log('Scene 3: ZIP 업로드 → 사용자 앱 등록');
    const zipBuffer = await makeUserAppZip();
    const zipPath = join(OUT_DIR, 'demo-user-app.zip');
    writeFileSync(zipPath, zipBuffer);

    const fileInput = page.locator('input[type="file"]');
    if (await fileInput.count() > 0) {
      await fileInput.setInputFiles(zipPath);
      log('  ✅ My First App ZIP 업로드 완료');
      await page.waitForTimeout(2000);
    }

    // ZIP 업로드 후 스토어에서 설치
    await installApp(page, 'My First App');
    await screenshot(page, '03-zip-uploaded');

    // ═══ Scene 4: 데스크탑 → Snake 게임플레이 ═════════════════════════════════
    log('Scene 4: 데스크탑 → Snake 게임플레이');
    await page.goto(BASE, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(3000);
    await screenshot(page, '04-desktop-all-icons');

    await openApp(page, 'Snake');
    // 게임플레이 시뮬레이션
    for (const key of ['ArrowRight', 'ArrowRight', 'ArrowDown', 'ArrowDown', 'ArrowLeft', 'ArrowUp']) {
      await page.keyboard.press(key);
      await page.waitForTimeout(400);
    }
    await screenshot(page, '05-snake-gameplay');
    await closeAllWindows(page);
    await page.waitForTimeout(500);

    // ═══ Scene 5: Pixi.js + Three.js 동시 ═══════════════════════════════════
    log('Scene 5: Pixi.js + Three.js 동시 실행');
    await openApp(page, 'Particle Rain');
    await openApp(page, 'Spinning Cubes');
    await screenshot(page, '06-multi-engine');
    await closeAllWindows(page);
    await page.waitForTimeout(500);

    // ═══ Scene 6: 사용자 앱 실행 ═════════════════════════════════════════════
    log('Scene 6: 사용자 앱 (My First App) 실행');
    await openApp(page, 'My First App');
    await screenshot(page, '07-user-app');
    await closeAllWindows(page);
    await page.waitForTimeout(500);

    // ═══ Scene 7: 피날레 — 전체 동시 실행 ════════════════════════════════════
    log('Scene 7: 피날레 — 전체 앱 동시 실행');
    await openApp(page, 'Snake');
    await openApp(page, 'Particle Rain');
    await openApp(page, 'My First App');
    await screenshot(page, '08-finale');

    await page.waitForTimeout(3000);
    log('');
    log('=== 데모 영상 녹화 완료 ===');

  } finally {
    await page.close();
    await context.close();
    await browser.close();
  }

  log('');
  log('산출물:');
  log('  📹 e2e-out/ 디렉토리에 .webm 비디오');
  log('  📸 e2e-out/demo-01~08.png 스크린샷 8장');
  log('');
  log('✅ Phase 3-C 데모 영상 완료 — M4 마일스톤 달성');
})();

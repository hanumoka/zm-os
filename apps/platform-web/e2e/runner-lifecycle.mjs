import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

async function main() {
  const origin = process.env.ZM_WEB_URL;
  const database = new URL(process.env.ZM_TEST_DATABASE_URL ?? "http://missing.invalid");
  assert.equal(origin, "http://localhost:14600");
  assert.equal(database.hostname, "127.0.0.1");
  assert.match(database.pathname, /^\/zmwebui_[a-f0-9]{12}$/);
  const assets = "http://localhost:14611";
  const root = fileURLToPath(new URL("../../../", import.meta.url));
  const output = path.join(root, "apps/platform-web/e2e-out", `runner-lifecycle-${Date.now()}`);
  await mkdir(output, { recursive: true });
  const browser = await chromium.launch({ headless: true, channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge" });
  const context = await browser.newContext({ baseURL: origin });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  const sessions = new Map();
  const navigations = [];
  const errors = [];
  let stage = "fixture-prepare";
  let cycle = 0;
  let completed = false;
  let snapshot;
  const stages = [];
  const mark = (value) => { stage = value; stages.push({ stage, cycle }); };
  page.on("pageerror", () => errors.push("browser-script-error"));
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) return;
    const url = frame.url();
    navigations.push({ cycle, kind: url === "about:blank" ? "blank" : url.startsWith(`${assets}/lifecycle/initial`) ? "initial" : url.startsWith(`${assets}/lifecycle/next`) ? "next" : "other" });
  });
  try {
    // Use Vite's real React dependency URLs so the actual component and harness
    // share the same runtime. Neither the fixture entry nor fake API is shipped.
    const entry = await (await page.request.get("/src/main.tsx")).text();
    const dependencies = [...entry.matchAll(/(?:from\s+|import\s*)["']([^"']+)["']/g)].map((match) => match[1]);
    const reactUrl = dependencies.find((url) => /\/react\.js(?:\?|$)/.test(url));
    const domUrl = dependencies.find((url) => /\/react-dom_client\.js(?:\?|$)/.test(url));
    assert.ok(reactUrl && domUrl, "Vite React dependency lookup failed");
    const testUser = { id: randomUUID(), status: "active", operator: false, developer: false, providers: [], csrf: "synthetic-only" };
    const fixtureModule = `
      import React from ${JSON.stringify(reactUrl)};
      import ReactDOM from ${JSON.stringify(domUrl)};
      import { AppRunner } from '/src/AppRunner.tsx';
      const root = ReactDOM.createRoot(document.getElementById('root'));
      const user = ${JSON.stringify(testUser)};
      const events = { closes: [], loads: [] };
      let cycle = 0;
      document.addEventListener('load', event => {
        if (event.target instanceof HTMLIFrameElement) events.loads.push({cycle});
      }, true);
      window.__runnerFixture = {
        mount(session, nextCycle) {
          cycle = nextCycle;
          root.render(React.createElement(React.StrictMode, null,
            React.createElement(AppRunner, { key: session.id, session, user,
              onClose(reason) {
                events.closes.push({cycle, reason: reason === '앱이 다른 문서로 이동하여 실행을 종료했습니다.' ? 'document-navigation' : 'other-close'});
                root.render(null);
              }
            })
          ));
        },
        unmount() { root.render(null); },
        snapshot() { return structuredClone(events); }
      };
    `;
    await page.route(`${origin}/__runner-lifecycle.mjs`, (route) => route.fulfill({ contentType: "text/javascript", body: fixtureModule }));
    await page.route(`${origin}/__runner-lifecycle.html`, (route) => route.fulfill({ contentType: "text/html", body: `<!doctype html><html><meta charset="utf-8"><div id="root"></div><script type="module">
      import RefreshRuntime from '/@react-refresh';
      RefreshRuntime.injectIntoGlobalHook(window);
      window.$RefreshReg$ = () => {};
      window.$RefreshSig$ = () => type => type;
      window.__vite_plugin_react_preamble_installed__ = true;
      await import('/__runner-lifecycle.mjs');
    </script></html>` }));
    await page.route(`${origin}/v1/app-sessions/**`, async (route) => {
      const id = new URL(route.request().url()).pathname.split("/")[3];
      const session = sessions.get(id);
      await route.fulfill({ status: session ? 200 : 404, contentType: "application/json", body: JSON.stringify(route.request().method() === "DELETE" ? { ok: true } : session ?? { code: "UNKNOWN_FIXTURE" }) });
    });
    await page.route(`${assets}/lifecycle/**`, async (route) => {
      const url = new URL(route.request().url());
      const instance = url.searchParams.get("instance");
      if (url.pathname.endsWith("/next")) {
        await route.fulfill({ contentType: "text/html", body: "<!doctype html><h1>다음 문서</h1>" });
        return;
      }
      await new Promise((resolve) => setTimeout(resolve, [0, 5, 25, 75][cycle % 4]));
      await route.fulfill({ contentType: "text/html", body: `<!doctype html><html lang="ko"><meta charset="utf-8"><h1>초기 앱 문서</h1><p id="ready">호스트 응답 대기</p><button id="navigate">다음 문서로 이동</button><script>
        const instanceId = ${JSON.stringify(instance)};
        const hello = () => parent.postMessage({type:'ZM_SDK_HELLO',protocol:1,instanceId},'*');
        const retry = setInterval(hello,25);
        addEventListener('message', event => {
          if(event.source !== parent || event.data?.type !== 'ZM_HOST_CONNECT' || event.data.instanceId !== instanceId || !event.ports[0]) return;
          clearInterval(retry);
          const port = event.ports[0];
          port.onmessage = message => { if(message.data.id === 'ready' && !message.data.error) document.getElementById('ready').textContent = '호스트 응답 확인'; };
          port.start(); port.postMessage({id:'ready',method:'runtime.ready',params:{}});
        });
        document.getElementById('navigate').onclick = () => { location.href = '/lifecycle/next'; };
        hello();
      </script></html>` });
    });
    await page.goto(`${origin}/__runner-lifecycle.html`);
    await page.waitForFunction(() => !!window.__runnerFixture);
    const manifest = { schemaVersion: 1, appId: randomUUID(), version: "1.0.0", name: "수명주기 시험", description: "합성 문서 준비와 이동 시험", category: "tools", entry: "index.html", permissions: [], apiOrigins: [], privacyNotice: "시험용 문서입니다." };
    const mount = async () => {
      const id = randomUUID();
      const session = { id, appId: manifest.appId, appUserId: randomUUID(), versionId: randomUUID(), expiresAt: new Date(Date.now() + 600000).toISOString(), documentUrl: `${assets}/lifecycle/initial?instance=${id}`, manifest };
      sessions.set(id, session);
      await page.evaluate(({ session, cycle }) => window.__runnerFixture.mount(session, cycle), { session, cycle });
    };
    for (cycle = 1; cycle <= 40; cycle++) {
      mark("initial-mount");
      await mount();
      mark("initial-ready");
      await page.frameLocator("iframe").getByText("호스트 응답 확인", { exact: true }).waitFor();
      // Allow queued load notifications to be delivered before the DOM is removed.
      await page.waitForTimeout(60);
      snapshot = await page.evaluate(() => window.__runnerFixture.snapshot());
      assert.equal(snapshot.closes.length, 0, "initial mount unexpectedly closed");
      assert.equal(await page.locator("iframe").count(), 1);
      mark("physical-unmount");
      await page.evaluate(() => window.__runnerFixture.unmount());
      await page.locator("iframe").waitFor({ state: "detached" });
    }
    console.info("PASS actual AppRunner StrictMode initial mount/unmount 40 cycles");
    mark("navigation-mount");
    await mount();
    await page.frameLocator("iframe").getByText("호스트 응답 확인", { exact: true }).waitFor();
    await page.waitForTimeout(60);
    mark("real-document-navigation");
    await page.frameLocator("iframe").getByRole("button", { name: "다음 문서로 이동", exact: true }).click();
    await page.locator("iframe").waitFor({ state: "detached" });
    snapshot = await page.evaluate(() => window.__runnerFixture.snapshot());
    assert.deepEqual(snapshot.closes, [{ cycle, reason: "document-navigation" }]);
    assert.equal(navigations.filter((item) => item.kind === "blank").length, 0, "initialization must not navigate to a blank document");
    assert.equal(navigations.filter((item) => item.kind === "initial").length, 41);
    assert.ok(navigations.some((item) => item.kind === "next"));
    assert.deepEqual(errors, []);
    console.info("PASS no initial blank navigation; real second document closes execution");
    completed = true;
  } catch (error) {
    snapshot = await page.evaluate(() => window.__runnerFixture?.snapshot()).catch(() => undefined);
    console.error(`Runner lifecycle failed: stage=${stage}, cycle=${cycle}, kind=${error?.name === "TimeoutError" ? "timeout" : "assertion-or-runtime"}`);
    process.exitCode = 1;
  } finally {
    await writeFile(path.join(output, "result.json"), JSON.stringify({ completed, stage, cycle, syntheticApiAndDocuments: true, actualAppRunner: true, strictMode: true, stages, snapshot, navigations, errors }, null, 2));
    await context.close();
    await browser.close();
  }
}
try { await main(); }
catch { console.error("Runner lifecycle fixture preparation failed; raw errors suppressed."); process.exitCode = 1; }

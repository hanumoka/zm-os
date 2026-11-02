import assert from "node:assert/strict";
import { once } from "node:events";
import { cp, mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath, pathToFileURL } from "node:url";
import { chromium } from "playwright";

async function main() {
// Only scripts/platform-web-check.mjs owns database/process provisioning.
// This test must never use the shared trial database or reset any existing user.
const origin = process.env.ZM_WEB_URL;
const databaseUrl = process.env.ZM_TEST_DATABASE_URL;
assert.ok(
  origin && databaseUrl,
  "전용 웹 URL과 시험 DB 환경변수가 필요합니다.",
);
assert.match(new URL(databaseUrl).pathname, /^\/zmwebui_[a-z0-9_]+$/);
assert.equal(new URL(origin).port, "14600");
const root = fileURLToPath(new URL("../../../", import.meta.url));
const apiRequire = createRequire(path.join(root, "apps/api/package.json"));
const cliRequire = createRequire(path.join(root, "packages/cli/package.json"));
const { Pool } = apiRequire("pg");
const pool = new Pool({ connectionString: databaseUrl, max: 1 });
// A status-like app name must remain an app name, not be translated as a status.
const name = "pending";
const output = path.join(
  root,
  "apps/platform-web/e2e-out",
  `external-deletion-${Date.now()}`,
);
await mkdir(output, { recursive: true });
const ownedFiles = path.resolve(process.env.ZM_FILES ?? "");
assert.ok(path.basename(ownedFiles).startsWith("zm-os-web-check-"));
const temp = await mkdtemp(path.join(ownedFiles, "external-deletion-"));
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
  headless: true,
});
const contexts = [];
const checks = [];
const errors = [];
const counts = {};
let appId = "";
let userId = "";
let externalServer;
let completed = false;
let step = "prepare", failure = null;
const newPage = async () => {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 1050 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", () => errors.push("브라우저 스크립트 오류"));
  page.on("dialog", (dialog) => dialog.accept());
  return page;
};
const developer = await newPage();
const user = await newPage();
const operator = await newPage();
const stranger = await newPage();
const receiptPage = await newPage();
const pass = (message) => {
  checks.push(message);
  process.stdout.write(`PASS ${message}\n`);
};
const nav = (page, text) =>
  page.getByRole("button", { name: text, exact: true }).click();
const success = (page, text) => page.getByText(text, { exact: true }).waitFor();
const me = async (page) => (await page.request.get("/v1/me")).json();
const request = async (page, route, method = "GET", data, expected = 200) => {
  const current = method === "GET" ? null : await me(page);
  const response = await page.request.fetch(`/v1${route}`, {
    method,
    headers: {
      Origin: origin,
      ...(current?.csrf ? { "X-CSRF-Token": current.csrf } : {}),
      ...(Buffer.isBuffer(data) ? { "Content-Type": "application/zip" } : {}),
    },
    ...(data !== undefined ? { data } : {}),
  });
  assert.equal(
    response.status(),
    expected,
    `${method} ${route}: ${response.status()}`,
  );
  return response.json();
};
const login = async (page, subject, provider) => {
  await page.goto(origin);
  await page
    .getByRole("heading", { name: "오늘, 어떤 앱이 필요한가요?", exact: true })
    .waitFor();
  await nav(page, "로그인");
  await page
    .getByRole("combobox", { name: "시험 사용자", exact: true })
    .selectOption(subject);
  await page
    .getByRole("combobox", { name: "모의 로그인 제공자", exact: true })
    .selectOption(provider);
  await page.getByRole("checkbox").check();
  await nav(page, "모의 로그인");
  await success(page, "시험 계정으로 로그인했습니다.");
};
const approve = async (page, displayName) => {
  const application = await request(page, "/developer/applications", "POST", {
    displayName,
    email: "external-trial@example.test",
    description: "전용 환경의 외부 데이터 삭제 시험",
  });
  await request(
    operator,
    `/operator/developer-applications/${application.id}/decisions`,
    "POST",
    { decision: "approved", reason: "독립 시험 DB의 개발자 fixture 승인" },
  );
};
const cli = (args) => {
  const result = spawnSync(
    process.execPath,
    [
      cliRequire.resolve("tsx/cli"),
      path.join(root, "packages/cli/src/cli.ts"),
      ...args,
    ],
    { cwd: root, encoding: "utf8" },
  );
  assert.equal(result.status, 0, result.stderr || result.stdout);
};
const until = async (check) => {
  const end = Date.now() + 45000;
  while (Date.now() < end) {
    if (await check()) return;
    await new Promise((resolve) => setTimeout(resolve, 150));
  }
  throw new Error("시험 상태 대기 시간이 초과되었습니다.");
};
const readCounts = async () => {
  const client = await pool.connect();
  try {
    await client.query("BEGIN READ ONLY");
    const result = await client.query(
      `SELECT
      (SELECT count(*)::int FROM app_users WHERE user_id=$1 AND app_id=$2) app_users,
      (SELECT count(*)::int FROM app_sessions WHERE user_id=$1 AND app_id=$2) app_sessions,
      (SELECT count(*)::int FROM consents WHERE user_id=$1 AND app_id=$2) consents,
      (SELECT count(*)::int FROM auth_codes c JOIN app_sessions s ON s.id=c.session_id WHERE s.user_id=$1 AND s.app_id=$2) auth_codes,
      (SELECT count(*)::int FROM app_tokens t JOIN app_sessions s ON s.id=t.session_id WHERE s.user_id=$1 AND s.app_id=$2) app_tokens`,
      [userId, appId],
    );
    await client.query("ROLLBACK");
    return result.rows[0];
  } finally {
    client.release();
  }
};
const detail = async () => {
  await nav(user, "앱 둘러보기");
  await user.getByRole("searchbox").fill(name);
  await user
    .getByRole("button", { name: `${name} 상세 보기`, exact: true })
    .click();
  await user
    .getByRole("dialog")
    .getByRole("button", { name: "앱 열기", exact: true })
    .click();
  await user
    .getByRole("heading", {
      name: "처음 실행하기 전에 확인해 주세요",
      exact: true,
    })
    .waitFor();
};
const developerRow = () =>
  developer
    .locator(".form-section")
    .filter({
      has: developer.getByRole("heading", {
        name: "외부 서버 데이터 삭제 요청",
        exact: true,
      }),
    })
    .locator(".record-list > li")
    .filter({ hasText: name });
const refreshReceipt = async (status) => {
  await nav(receiptPage, "상태 새로고침");
  await receiptPage
    .locator(".deletion-status")
    .getByText(status, { exact: true })
    .waitFor();
};
const safeScreenshot = (page, file) =>
  page.screenshot({
    path: path.join(output, file),
    fullPage: true,
    mask: [
      page.getByRole("textbox", { name: /조회 링크/ }),
      page.locator("pre"),
    ],
  });

try {
  await login(operator, "owner", "google");
  await login(developer, "alice", "github");
  await login(user, "bob", "github");
  await login(stranger, "bob", "google");
  assert.equal((await request(developer, "/developer/apps")).length, 0);
  assert.equal((await request(user, "/me/app-consents")).length, 0);
  await approve(developer, name);
  await approve(stranger, `${name} 다른 개발자`);
  userId = (await me(user)).id;
  const app = await request(developer, "/developer/apps", "POST", { name });
  appId = app.id;
  const credential = await request(
    developer,
    `/developer/apps/${appId}/credentials`,
    "POST",
    {},
  );
  const { tsImport } = cliRequire("tsx/esm/api");
  const { createExampleServer } = await tsImport(
    pathToFileURL(path.join(root, "examples/api-server/server.ts")).href,
    import.meta.url,
  );
  externalServer = createExampleServer({
    apiBase: origin,
    appId,
    appSecret: credential.secret,
    databasePath: path.join(temp, "notes.sqlite"),
  });
  externalServer.listen(0, "127.0.0.1");
  await once(externalServer, "listening");
  const externalOrigin = `http://127.0.0.1:${externalServer.address().port}`;
  const source = path.join(temp, "app");
  await cp(path.join(root, "examples/api-client"), source, { recursive: true });
  const manifest = JSON.parse(
    await readFile(path.join(source, "manifest.json"), "utf8"),
  );
  Object.assign(manifest, { appId, name, apiOrigins: [externalOrigin] });
  await writeFile(
    path.join(source, "manifest.json"),
    JSON.stringify(manifest, null, 2),
  );
  const clientSource = path.join(source, "src/main.ts");
  await writeFile(
    clientSource,
    (await readFile(clientSource, "utf8")).replace(
      "http://127.0.0.1:4320",
      externalOrigin,
    ),
  );
  cli(["build", source, "--json"]);
  const bundle = path.join(temp, "app.zip");
  cli(["pack", source, "--out", bundle, "--local-test", "--json"]);
  const version = await request(
    developer,
    `/developer/apps/${appId}/versions`,
    "POST",
    await readFile(bundle),
  );
  await until(
    async () =>
      (await request(developer, `/developer/apps/${appId}/versions`)).find(
        (item) => item.id === version.id,
      )?.validationStatus === "passed",
  );
  await request(
    developer,
    `/developer/versions/${version.id}/submit`,
    "POST",
    {},
  );
  await request(
    operator,
    `/operator/versions/${version.id}/decisions`,
    "POST",
    { decision: "approved", reason: "독립 외부 API 번들 시험 검수 승인" },
  );
  const managed = (await request(developer, "/developer/apps")).find(
    (item) => item.id === appId,
  );
  await request(developer, `/developer/apps/${appId}/releases`, "POST", {
    versionId: version.id,
    revision: managed.revision,
  });
  pass("별도 시험 DB·임시 번들·개발자 외부 API 서버로 fixture 준비");

  const mutations = [];
  user.on("request", (outgoing) => {
    const url = new URL(outgoing.url());
    if (
      url.origin === origin &&
      url.pathname.startsWith("/v1/") &&
      !["GET", "HEAD", "OPTIONS"].includes(outgoing.method())
    )
      mutations.push({ method: outgoing.method(), path: url.pathname });
  });
  await detail();
  await nav(user, "취소");
  await nav(user, "앱 상세 닫기");
  counts.afterCancel = await readCounts();
  assert.deepEqual(counts.afterCancel, {
    app_users: 0,
    app_sessions: 0,
    consents: 0,
    auth_codes: 0,
    app_tokens: 0,
  });
  assert.equal(mutations.length, 0);
  assert.equal(await user.locator("iframe").count(), 0);
  pass(
    "첫 동의 취소 후 변경 요청 0건, 사용자·실행·동의·인증 코드·토큰 테이블 모두 0건",
  );

  await detail();
  let releaseConsent;
  let enteredConsent;
  const consentGate = new Promise((resolve) => {
    releaseConsent = resolve;
  });
  const consentEntered = new Promise((resolve) => {
    enteredConsent = resolve;
  });
  let releaseSession;
  let enteredSession;
  const sessionGate = new Promise((resolve) => {
    releaseSession = resolve;
  });
  const sessionEntered = new Promise((resolve) => {
    enteredSession = resolve;
  });
  await user.route(`**/v1/me/app-consents/${appId}`, async (route) => {
    if (route.request().method() === "PUT") {
      enteredConsent();
      await consentGate;
    }
    await route.continue();
  });
  await user.route("**/v1/app-sessions", async (route) => {
    if (route.request().method() === "POST") {
      enteredSession();
      await sessionGate;
    }
    await route.continue();
  });
  await nav(user, "동의하고 실행");
  step = "consent-request";
  await consentEntered;
  for (const text of ["취소", "앱 상세 닫기", "동의하고 실행"])
    assert.equal(
      await user.getByRole("button", { name: text, exact: true }).isDisabled(),
      true,
    );
  await user.keyboard.press("Escape");
  assert.equal(await user.getByRole("dialog").isVisible(), true);
  await user
    .getByText(
      "동의와 실행 요청을 처리하고 있습니다. 결과가 표시될 때까지 기다려 주세요.",
      { exact: true },
    )
    .waitFor();
  releaseConsent();
  await sessionEntered;
  assert.equal(
    await user.getByRole("button", { name: "취소", exact: true }).isDisabled(),
    true,
  );
  await user.keyboard.press("Escape");
  assert.equal(await user.getByRole("dialog").isVisible(), true);
  releaseSession();
  step = "session-frame";
  await user.locator("iframe").waitFor();
  await user.unrouteAll({ behavior: "wait" });
  counts.afterConsent = await readCounts();
  assert.deepEqual(counts.afterConsent, {
    app_users: 1,
    app_sessions: 1,
    consents: 1,
    auth_codes: 0,
    app_tokens: 0,
  });
  assert.equal(
    mutations.filter((item) => item.path === `/v1/me/app-consents/${appId}`)
      .length,
    1,
  );
  assert.equal(
    mutations.filter((item) => item.path === "/v1/app-sessions").length,
    1,
  );
  const frame = user.frameLocator("iframe");
  step = "external-login-button";
  await frame.getByRole("button", { name: "서버 연결", exact: true }).click();
  step = "external-user";
  await frame.getByText(/앱 사용자:/).waitFor();
  await frame
    .getByRole("textbox", { name: "개인 메모", exact: true })
    .fill("삭제 흐름 검증용 외부 메모");
  await frame.getByRole("button", { name: "서버에 저장", exact: true }).click();
  step = "external-save";
  await frame.getByText(/서버에 저장했습니다/).waitFor();
  counts.afterExternalLogin = await readCounts();
  assert.equal(counts.afterExternalLogin.app_tokens, 1);
  assert.equal(counts.afterExternalLogin.auth_codes, 0);
  pass(
    "동의·실행 요청 지연 중 취소·닫기·Escape 차단, 정상 동의 후 외부 인증·저장 생성 확인",
  );
  await nav(user, "앱 종료");
  step = "withdrawal-and-results";
  await success(user, "앱을 종료했습니다.");

  await nav(user, "내 계정");
  await nav(user, "모의 재인증");
  await success(user, "모의 재인증을 완료했습니다.");
  await nav(user, "재인증 후 조회 링크 준비");
  const link = await user
    .getByRole("textbox", {
      name: "탈퇴 후 데이터 삭제 조회 링크",
      exact: true,
    })
    .inputValue();
  assert.ok(new URL(link).hash.startsWith("#withdrawal="));
  const lookupSecret = new URLSearchParams(new URL(link).hash.slice(1)).get(
    "withdrawal",
  );
  await user
    .getByRole("checkbox", { name: "조회 링크를 보관했습니다.", exact: true })
    .check();
  await user
    .getByRole("checkbox", {
      name: "계정 복구가 불가능함을 확인했습니다.",
      exact: true,
    })
    .check();
  await nav(user, "탈퇴 확정");
  await user
    .getByRole("heading", { name: "데이터 삭제 처리 상태", exact: true })
    .waitFor();
  assert.equal((await user.request.get("/v1/me")).status(), 401);
  await receiptPage.goto(link);
  await receiptPage
    .locator(".deletion-status")
    .getByText("대기", { exact: true })
    .waitFor();
  assert.equal(new URL(receiptPage.url()).hash, "");
  await developer.reload();
  await nav(developer, "개발자 공간");
  await developerRow().getByText("대기", { exact: true }).waitFor();
  const deletion = (
    await request(developer, "/developer/deletion-requests")
  ).find((item) => item.appId === appId);
  assert.ok(deletion);
  pass(
    "외부 앱 이용자 탈퇴 후 개발자 콘솔 pending 접수와 독립 조회 링크 상태 표시",
  );

  for (const actor of [operator, stranger]) {
    await request(
      actor,
      `/developer/deletion-requests/${deletion.id}/results`,
      "POST",
      {
        status: "developer_reported_completed",
        note: "다른 주체의 대리 처리 시도",
      },
      403,
    );
    assert.equal(
      (await request(actor, "/developer/deletion-requests")).some(
        (item) => item.id === deletion.id,
      ),
      false,
    );
  }
  for (const [route, method, data] of [
    ["/me", "GET"],
    ["/app-sessions", "POST", { appId }],
    [
      `/developer/deletion-requests/${deletion.id}/results`,
      "POST",
      { status: "processing", note: "조회 자격의 수정 시도" },
    ],
  ]) {
    const response = await receiptPage.request.fetch(`/v1${route}`, {
      method,
      headers: { Origin: origin, Authorization: `Bearer ${lookupSecret}` },
      ...(data ? { data } : {}),
    });
    assert.equal(response.status(), 401);
  }
  pass(
    "다른 개발자·운영자의 삭제 결과 대리 수정 거부, 조회 링크의 계정·실행·수정 권한 없음",
  );

  const resultPath = `**/v1/developer/deletion-requests/${deletion.id}/results`;
  await developerRow()
    .getByRole("textbox", { name: "처리 안내", exact: true })
    .fill("비공개 개발자 메모: 처리 시작");
  await developer.route(resultPath, (route) => route.abort("failed"));
  await developerRow()
    .getByRole("button", { name: "결과 등록", exact: true })
    .click();
  await developer
    .getByRole("alert")
    .filter({ hasText: "서버의 응답을 확인하지 못했습니다" })
    .waitFor();
  assert.equal(
    (await request(developer, "/developer/deletion-requests")).find(
      (item) => item.id === deletion.id,
    ).status,
    "pending",
  );
  await developer.unroute(resultPath);
  await developerRow()
    .getByRole("button", { name: "결과 등록", exact: true })
    .click();
  await success(developer, "삭제 처리 결과를 등록했습니다.");
  await refreshReceipt("처리 중");
  pass("개발자 결과 등록 통신 실패 시 접수 상태 유지·안내 후 재시도 성공");

  for (const [state, text] of [
    ["needs_attention", "확인 필요"],
    ["developer_reported_completed", "개발자 완료 보고"],
  ]) {
    const internalNote = `비공개 개발자 메모: ${state}`;
    await developerRow()
      .getByRole("combobox", { name: "처리 결과", exact: true })
      .selectOption(state);
    await developerRow()
      .getByRole("textbox", { name: "처리 안내", exact: true })
      .fill(internalNote);
    await developerRow()
      .getByRole("button", { name: "결과 등록", exact: true })
      .click();
    await success(developer, "삭제 처리 결과를 등록했습니다.");
    await developerRow().getByText(text, { exact: true }).first().waitFor();
    await developer.reload();
    await nav(developer, "개발자 공간");
    await until(
      async () =>
        (await developerRow()
          .getByRole("combobox", { name: "처리 결과", exact: true })
          .inputValue()) === state,
    );
    await refreshReceipt(text);
    assert.equal(
      await receiptPage.getByText(internalNote, { exact: true }).count(),
      0,
    );
    const view = await receiptPage.request.get("/v1/withdrawal-status", {
      headers: { Authorization: `Bearer ${lookupSecret}` },
    });
    assert.equal(view.status(), 200);
    const body = await view.json();
    assert.equal(
      body.external.find((item) => item.appId === appId).status,
      state,
    );
    assert.deepEqual(
      Object.keys(body.external.find((item) => item.appId === appId)).sort(),
      ["appId", "appName", "status"],
    );
    assert.equal(
      body.external.find((item) => item.appId === appId).appName,
      name,
    );
    await receiptPage
      .locator(".deletion-status")
      .getByText(name, { exact: true })
      .waitFor();
    assert.equal(
      await receiptPage
        .locator(".deletion-status")
        .getByText(appId, { exact: true })
        .count(),
      0,
    );
  }
  await receiptPage
    .getByText(
      /개발자 완료 보고는 외부 서버의 실제 삭제를 플랫폼이 직접 검증했다는 뜻이/,
    )
    .waitFor();
  await safeScreenshot(developer, "developer-completed.png");
  await safeScreenshot(receiptPage, "receipt-completed.png");
  pass(
    "processing→needs_attention→developer_reported_completed 실제 클릭·조회 갱신, 현재 상태 선택 유지·개발자 메모 비공개",
  );

  await receiptPage.route("**/v1/withdrawal-status", (route) =>
    route.abort("failed"),
  );
  await nav(receiptPage, "상태 새로고침");
  await receiptPage.getByRole("alert").waitFor();
  assert.equal(await receiptPage.locator(".deletion-status").count(), 0);
  await safeScreenshot(receiptPage, "receipt-retry.png");
  await receiptPage.unroute("**/v1/withdrawal-status");
  await refreshReceipt("개발자 완료 보고");
  await receiptPage.route("**/v1/withdrawal-status", (route) =>
    route.fulfill({
      status: 404,
      contentType: "application/json",
      body: JSON.stringify({
        code: "STATUS_UNAVAILABLE",
        message: "조회할 수 없는 링크입니다.",
      }),
    }),
  );
  await nav(receiptPage, "상태 새로고침");
  await receiptPage
    .getByRole("alert")
    .filter({ hasText: "조회할 수 없는 링크입니다." })
    .waitFor();
  assert.equal(await receiptPage.locator(".deletion-status").count(), 0);
  await receiptPage.unroute("**/v1/withdrawal-status");
  await refreshReceipt("개발자 완료 보고");
  pass(
    "조회 네트워크 실패·404 응답 주입 시 이전 완료 결과 숨김, 재시도 후 최신 상태 복원",
  );

  await receiptPage.setViewportSize({ width: 390, height: 844 });
  assert.equal(
    await receiptPage.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    ),
    false,
  );
  await safeScreenshot(receiptPage, "receipt-mobile.png");
  assert.deepEqual(errors, []);
  completed = true;
} catch (error) {
  failure = { step, navigationClosed: await user.getByText("앱이 다른 문서로 이동하여 실행을 종료했습니다.", { exact: true }).isVisible().catch(() => false), frameCount: await user.locator("iframe").count().catch(() => -1) };
  console.info("FAIL " + JSON.stringify(failure));
  for (const [page, file] of [
    [user, "user-failure.png"],
    [developer, "developer-failure.png"],
    [receiptPage, "receipt-failure.png"],
  ])
    await safeScreenshot(page, file).catch(() => {});
  throw error;
} finally {
  const ref = spawnSync("git", ["-C", root, "rev-parse", "HEAD"], {
    encoding: "utf8",
  }).stdout.trim();
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        ref,
        workingTree: true,
        mockOAuthOnly: true,
        completed,
        appId,
        counts,
        checks,
        errors,
        failure,
      },
      null,
      2,
    ),
  );
  for (const context of contexts) await context.close();
  await browser.close();
  if (externalServer?.listening)
    await new Promise((resolve, reject) =>
      externalServer.close((error) => (error ? reject(error) : resolve())),
    );
  await pool.end();
  assert.equal(path.dirname(path.resolve(temp)), ownedFiles);
  assert.ok(path.basename(temp).startsWith("external-deletion-"));
  await rm(temp, { recursive: true, force: true });
}
}
try { await main(); }
catch { console.error("외부 삭제 웹 시험에 실패했습니다. 비밀 값이 포함될 수 있는 오류 원문은 출력하지 않습니다."); process.exitCode = 1; }

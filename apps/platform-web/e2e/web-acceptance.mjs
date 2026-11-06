import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

// Dedicated local trial only. No database reset; never close pre-existing apps.
const origin = process.env.ZM_WEB_URL ?? "http://localhost:4300";
const root = fileURLToPath(new URL("../../../", import.meta.url));
const name = `웹 인수 ${Date.now()}`;
const output = path.join(
  root,
  "apps/platform-web/e2e-out",
  name.replaceAll(" ", "-"),
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
  headless: true,
});
const contexts = [];
const checks = [];
const errors = [];
const fixtures = [];
const newPage = async () => {
  const context = await browser.newContext({
    baseURL: origin,
    viewport: { width: 1440, height: 1000 },
  });
  contexts.push(context);
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("dialog", (dialog) => dialog.accept());
  return page;
};
const page = await newPage();
const operator = await newPage();
const second = await newPage();
const pass = (text) => {
  checks.push(text);
  process.stdout.write(`PASS ${text}\n`);
};
const nav = (target, text) =>
  target.getByRole("button", { name: text, exact: true }).click();
const success = (target, text) =>
  target.getByText(text, { exact: true }).waitFor();
const reload = async (target, section) => {
  await target.reload();
  if (section) await nav(target, section);
};
const me = async (target) => (await target.request.get("/v1/me")).json();
const request = async (
  target,
  endpoint,
  method = "GET",
  body,
  expected = 200,
) => {
  const current = method === "GET" ? null : await me(target);
  const response = await target.request.fetch(`/v1${endpoint}`, {
    method,
    headers: {
      Origin: origin,
      ...(current?.csrf ? { "X-CSRF-Token": current.csrf } : {}),
    },
    ...(body !== undefined ? { data: body } : {}),
  });
  assert.equal(
    response.status(),
    expected,
    `${method} ${endpoint}: ${response.status()}`,
  );
  return response.json();
};
const login = async (target, subject = "alice", provider = "github") => {
  await target.goto(origin);
  await target
    .getByRole("heading", { name: "zm-os 데스크톱", exact: true })
    .waitFor();
  if (
    await target.getByRole("button", { name: "내 계정", exact: true }).count()
  ) {
    await nav(target, "시작 메뉴");
    await nav(target, "로그아웃");
    await success(target, "로그아웃했습니다.");
  }
  await nav(target, "로그인");
  await target
    .getByRole("combobox", { name: "시험 사용자", exact: true })
    .selectOption(subject);
  await target
    .getByRole("combobox", { name: "모의 로그인 제공자", exact: true })
    .selectOption(provider);
  await target.getByRole("checkbox").check();
  await nav(target, "모의 로그인");
  await success(target, "시험 계정으로 로그인했습니다.");
};
const decision = async (kind, title, state, reason) => {
  await reload(operator, "운영 관리");
  await nav(operator, kind);
  const row = operator
    .locator(".record-list > li")
    .filter({
      has: operator.getByRole("heading", { name: title, exact: true }),
    })
    .filter({ has: operator.locator('button[type="submit"]:not(:disabled)') });
  await row
    .getByRole("combobox", { name: "심사 결과", exact: true })
    .selectOption(state);
  await row
    .getByRole("textbox", { name: "심사 사유", exact: true })
    .fill(reason);
  await row
    .getByRole("button", { name: "심사 결과 기록", exact: true })
    .click();
  await success(
    operator,
    kind === "개발자 신청"
      ? "개발자 신청 심사 결과를 기록했습니다."
      : state === "approved"
        ? "앱 버전 검수 결과를 기록했습니다. 개발자가 직접 공개할 수 있습니다."
        : "앱 버전 검수 결과를 기록했습니다. 개발자가 사유를 확인하고 수정한 버전을 다시 제출해야 합니다.",
  );
};
const apply = async (suffix) => {
  await reload(page, "개발자 공간");
  await page
    .getByRole("textbox", { name: "개발자 표시명", exact: true })
    .fill(name);
  await page
    .getByRole("textbox", { name: /연락용 이메일/ })
    .fill("web-acceptance@example.test");
  await page
    .getByRole("textbox", { name: "만들 앱의 설명", exact: true })
    .fill(`개인 데이터 앱 시험 ${suffix}`);
  await page
    .getByRole("button", { name: /^(승인 신청|수정하여 다시 신청)$/ })
    .click();
  await success(page, "개발자 신청을 제출했습니다.");
};
const selectApp = async (app) => {
  await reload(page, "개발자 공간");
  await page
    .locator(".app-selector button")
    .filter({ hasText: app.name })
    .click();
};
const createApp = async (suffix, category) => {
  await reload(page, "개발자 공간");
  const appName = `${name} ${suffix}`;
  await page
    .getByRole("textbox", { name: "앱 이름", exact: true })
    .fill(appName);
  await nav(page, "앱 등록");
  await success(
    page,
    "앱을 등록했습니다. 이 앱 ID로 번들을 만들어 제출하세요.",
  );
  const app = {
    id: (await page.locator("code").first().innerText()).trim(),
    name: appName,
    category,
  };
  fixtures.push(app);
  return app;
};
const cliRequire = createRequire(path.join(root, "packages/cli/package.json"));
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
const upload = async (app, version) => {
  const source = path.join(output, `${app.id}-${version}`);
  cli(["init", source, "--app-id", app.id, "--json"]);
  const manifestPath = path.join(source, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  Object.assign(manifest, {
    name: app.name,
    version,
    category: app.category,
    description: `${app.name} 설명 ${version}`,
  });
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  cli(["build", source, "--json"]);
  const bundle = path.join(output, `${app.id}-${version}.zip`);
  cli(["pack", source, "--out", bundle, "--json"]);
  await selectApp(app);
  await page.getByLabel("웹 번들 ZIP").setInputFiles(bundle);
  await nav(page, "번들 업로드");
  await success(page, "번들을 업로드했습니다. 검사 결과를 확인해 주세요.");
  const row = page.locator(".versions > li").filter({ hasText: version });
  await row.getByText("검증 통과", { exact: true }).waitFor({ timeout: 60000 });
  await row.getByRole("button", { name: "검수 요청", exact: true }).click();
  await success(page, "검수를 요청했습니다.");
};
const release = async (app, version) => {
  await selectApp(app);
  await page
    .locator(".versions > li")
    .filter({ hasText: version })
    .getByRole("button", { name: "이 버전 공개", exact: true })
    .click();
  await success(page, "승인된 버전을 공개했습니다.");
};
const details = async (target, app, mine = false) => {
  await nav(target, mine ? "내 앱" : "앱 둘러보기");
  if (!mine) await target.getByRole("searchbox").fill(app.name);
  await target
    .getByRole("button", { name: `${app.name} 상세 보기`, exact: true })
    .click();
};
const launch = async (target, app) => {
  await details(target, app);
  await target
    .getByRole("dialog")
    .getByRole("button", { name: "앱 열기", exact: true })
    .click();
  const consent = target.getByRole("button", {
    name: "동의하고 실행",
    exact: true,
  });
  await Promise.race([consent.waitFor(), target.locator("iframe").waitFor()]);
  if (await consent.isVisible()) await consent.click();
  const frame = target.frameLocator("iframe");
  await frame.getByText(/앱 사용자:/).waitFor();
  return frame;
};
const stored = async (target, userId, appId) =>
  target.evaluate(
    async ({ userId, appId }) => {
      const db = await new Promise((resolve, reject) => {
        const r = indexedDB.open("zm-platform-app-storage-v1");
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      const rows = await new Promise((resolve, reject) => {
        const r = db
          .transaction("entries")
          .objectStore("entries")
          .index("partition")
          .getAll(IDBKeyRange.only([userId, appId]));
        r.onsuccess = () => resolve(r.result);
        r.onerror = () => reject(r.error);
      });
      db.close();
      return rows.map((row) => row.value);
    },
    { userId, appId },
  );
const managedConsent = (target, app) =>
  target
    .locator(".form-section")
    .filter({
      has: target.getByRole("heading", { name: "이용 앱 관리", exact: true }),
    })
    .locator(".record-list > li")
    .filter({
      has: target.getByRole("heading", { name: app.name, exact: true }),
    });
let completed = false;
let testUserId = "";
try {
  await login(operator, "owner", "google");
  await login(page);
  const user = await me(page);
  const prior = await request(page, "/developer/apps");
  assert.equal(
    prior.filter((app) => !app.closed).length,
    0,
    "alice+GitHub에 기존 열린 앱이 있어 전용 시험을 중단합니다.",
  );
  assert.equal(
    user.developer,
    false,
    "이미 승인된 개발자입니다. 기존 자격을 바꾸지 않고 시험을 중단합니다.",
  );
  const previousApplication = await request(page, "/developer/application");
  if (previousApplication?.status === "pending") {
    assert.match(
      previousApplication.displayName,
      /^웹 인수 \d+$/,
      "다른 시험의 미처리 신청이 있어 중단합니다.",
    );
    await decision(
      "개발자 신청",
      previousApplication.displayName,
      "rejected",
      "이전 인수 시험의 중단된 신청 정리",
    );
  }
  testUserId = user.id;
  for (const state of ["changes_requested", "rejected", "approved"]) {
    await apply(state);
    await decision("개발자 신청", name, state, `${state} 사유 ${name}`);
    await reload(page, "개발자 공간");
    if (state !== "approved")
      await page.getByText(`${state} 사유 ${name}`, { exact: true }).waitFor();
  }
  await page
    .getByText("개발자 자격이 승인되어 있습니다.", { exact: true })
    .waitFor();
  pass("개발자 신청의 보완·반려 사유 표시와 수정 재제출, 운영자 재승인");

  const memo = await createApp("메모", "productivity");
  for (const [version, state] of [
    ["1.0.0", "changes_requested"],
    ["1.0.1", "rejected"],
    ["1.0.2", "approved"],
  ]) {
    await upload(memo, version);
    await decision(
      "앱 검수",
      memo.name,
      state,
      `${version} ${state} 수정 안내`,
    );
    await selectApp(memo);
    await page
      .getByText(`검수 안내: ${version} ${state} 수정 안내`, { exact: true })
      .waitFor();
    if (state !== "approved")
      assert.equal(
        await page
          .locator(".versions > li")
          .filter({ hasText: version })
          .getByRole("button", { name: "이 버전 공개" })
          .isDisabled(),
        true,
      );
  }
  await release(memo, "1.0.2");
  const tool = await createApp("도구", "tools");
  await upload(tool, "1.0.0");
  await decision("앱 검수", tool.name, "approved", "분류와 검색용 검수 통과");
  await release(tool, "1.0.0");
  pass("보완·반려 버전 사유 확인, 수정 번들 재제출과 재검수 후 소유자 공개");

  await reload(operator, "운영 관리");
  await nav(operator, "앱 운영");
  const foreign = operator.locator(".record-list > li").filter({
    has: operator.getByRole("heading", { name: memo.name, exact: true }),
  });
  assert.equal(
    await foreign.getByRole("button", { name: /공개|수정/ }).count(),
    0,
  );
  const managed = (await request(page, "/developer/apps")).find(
    (app) => app.id === memo.id,
  );
  await request(
    operator,
    `/developer/apps/${memo.id}/publication`,
    "PUT",
    { published: false, revision: managed.revision },
    403,
  );
  await request(
    operator,
    `/developer/apps/${memo.id}/closure-requests`,
    "POST",
    {},
    403,
  );
  pass("운영자의 타인 앱 수정·공개 제어 미노출과 직접 소유자 API 거부");

  const visitor = await newPage();
  await visitor.goto(origin);
  await details(visitor, memo);
  await visitor
    .getByRole("dialog")
    .getByRole("button", { name: "앱 열기", exact: true })
    .click();
  await visitor.getByRole("heading", { name: "로그인", exact: true }).waitFor();
  assert.equal(await visitor.locator("iframe").count(), 0);
  await details(visitor, memo);
  await nav(visitor, "내 앱에 추가");
  await visitor.getByRole("heading", { name: "로그인", exact: true }).waitFor();
  await request(visitor, "/app-sessions", "POST", { appId: memo.id }, 401);
  await request(visitor, `/me/apps/${memo.id}`, "PUT", {}, 401);
  pass(
    "방문자의 Store 상세 열람, 실행·내 앱 추가 시 로그인 안내와 직접 API 거부",
  );

  await nav(page, "앱 둘러보기");
  await page.getByRole("searchbox").fill(name);
  await page.getByRole("button", { name: `${memo.name} 상세 보기` }).waitFor();
  await page.getByRole("button", { name: `${tool.name} 상세 보기` }).waitFor();
  await page
    .getByRole("combobox", { name: "카테고리", exact: true })
    .selectOption("tools");
  await page
    .getByRole("button", { name: `${memo.name} 상세 보기` })
    .waitFor({ state: "hidden" });
  await page.getByRole("button", { name: `${tool.name} 상세 보기` }).click();
  await page
    .getByRole("dialog")
    .getByText(`${tool.name} 설명 1.0.0`, { exact: true })
    .waitFor();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "앱 상세 닫기", exact: true })
    .click();
  await page.getByRole("searchbox").fill(`${name} 없는검색`);
  await page
    .getByRole("button", { name: `${tool.name} 상세 보기` })
    .waitFor({ state: "hidden" });
  await page
    .getByRole("combobox", { name: "카테고리", exact: true })
    .selectOption("");
  await page.getByRole("searchbox").fill(memo.name);
  await page.getByRole("button", { name: `${memo.name} 상세 보기` }).click();
  await nav(page, "내 앱에 추가");
  await success(page, "내 앱에 추가했습니다.");
  await login(second);
  assert.equal((await me(second)).id, user.id);
  await nav(second, "내 앱");
  await second
    .getByRole("button", { name: `${memo.name} 상세 보기` })
    .waitFor();
  await details(second, memo, true);
  await nav(second, "내 앱에서 제거");
  await success(
    second,
    "내 앱 목록에서 제거했습니다. 저장 데이터는 유지됩니다.",
  );
  await reload(page, "내 앱");
  await page
    .getByText(
      "아직 추가한 앱이 없습니다. 앱 둘러보기에서 마음에 드는 앱을 추가해 보세요.",
      { exact: true },
    )
    .waitFor();
  assert.equal(
    await page.getByRole("button", { name: `${memo.name} 상세 보기` }).count(),
    0,
  );
  pass(
    "Store 검색·분류 교집합·상세·빈 결과 및 독립 웹 세션 간 내 앱 추가/제거 공유",
  );

  await details(page, memo);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "앱 열기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "동의하고 실행", exact: true })
    .waitFor();
  await nav(page, "취소");
  assert.equal(await page.locator("iframe").count(), 0);
  await page.context().setOffline(true);
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "앱 열기", exact: true })
    .click();
  await page.getByRole("alert").waitFor();
  assert.equal(await page.locator("iframe").count(), 0);
  await page.context().setOffline(false);
  await nav(page, "앱 상세 닫기");
  pass("첫 동의 취소와 실제 브라우저 오프라인에서 새 실행 iframe 미생성");

  await details(page, memo);
  await page.getByText("앱 신고", { exact: true }).click();
  const reportReason = `${name} 비공개 신고 시험`;
  await page
    .getByRole("textbox", { name: "신고 사유", exact: true })
    .fill(reportReason);
  await nav(page, "비공개 신고 접수");
  await success(page, "신고를 접수했습니다.");
  await nav(page, "앱 상세 닫기");
  await reload(operator, "운영 관리");
  await nav(operator, "신고");
  const reportRow = operator
    .locator(".record-list > li")
    .filter({ hasText: reportReason });
  await reportRow
    .getByRole("textbox", { name: "처리 사유", exact: true })
    .fill("신고 내용을 확인했습니다.");
  await reportRow
    .getByRole("button", { name: "신고 처리 기록", exact: true })
    .click();
  await success(operator, "신고 처리 결과를 기록했습니다.");
  await nav(page, "내 계정");
  await page
    .getByText("처리 안내: 신고 내용을 확인했습니다.", { exact: true })
    .waitFor();
  assert.equal(
    (
      await request(visitor, `/store/apps?q=${encodeURIComponent(memo.name)}`)
    )[0].id,
    memo.id,
  );
  await details(visitor, memo);
  assert.equal(
    await visitor.getByText(reportReason, { exact: true }).count(),
    0,
  );
  pass("비공개 신고 접수·운영자 처리·본인 상태 조회, Store 비공개 유지");

  let frame = await launch(page, memo);
  await frame
    .getByRole("textbox")
    .fill("계정이 바뀌어도 삭제되면 안 되는 메모");
  await frame.getByRole("button", { name: "저장", exact: true }).click();
  await frame.getByText("현재 기기에 저장했습니다.").waitFor();
  await nav(page, "앱 종료");
  await success(page, "앱을 종료했습니다.");
  const sibling = await page.context().newPage();
  for (const screen of ["store", "account"]) {
    if (screen === "store") {
      await details(page, memo);
      await page.getByText("이용 동의와 데이터 관리", { exact: true }).click();
    } else await nav(page, "내 계정");
    await login(sibling, "bob", "google");
    const button =
      screen === "store"
        ? page.getByRole("button", {
            name: "이 기기의 앱 데이터 삭제",
            exact: true,
          })
        : managedConsent(page, memo).getByRole("button", {
            name: "이 기기의 앱 데이터 삭제",
            exact: true,
          });
    await button.click();
    await page
      .getByText(
        "로그인 계정이 바뀌어 삭제하지 않았습니다. 현재 계정의 화면을 확인해 주세요.",
        { exact: true },
      )
      .waitFor();
    assert.deepEqual(await stored(page, user.id, memo.id), [
      "계정이 바뀌어도 삭제되면 안 되는 메모",
    ]);
    await login(sibling);
    await reload(page);
  }
  await sibling.close();
  pass("Store와 이용 앱 관리의 삭제 직전 계정 변경 감지·기존 계정 데이터 보존");

  for (const restricted of [false, true]) {
    await nav(page, "내 계정");
    const row = managedConsent(page, memo);
    await row
      .getByRole("button", { name: "이 기기의 앱 데이터 삭제", exact: true })
      .waitFor();
    await request(operator, `/operator/users/${user.id}/availability`, "PUT", {
      status: "suspended",
      reason: "로컬 삭제 전 계정 이용 상태 확인 시험",
    });
    if (restricted)
      await request(
        operator,
        `/operator/users/${user.id}/availability`,
        "PUT",
        { status: "active", reason: "기존 세션 재인증 필요 상태 시험" },
      );
    await row
      .getByRole("button", { name: "이 기기의 앱 데이터 삭제", exact: true })
      .click();
    await page
      .locator(".notice.error")
      .filter({
        hasText: restricted ? "본인 확인을 다시 진행" : "이용이 정지된 계정",
      })
      .first()
      .waitFor();
    assert.deepEqual(await stored(page, user.id, memo.id), [
      "계정이 바뀌어도 삭제되면 안 되는 메모",
    ]);
    if (!restricted)
      await request(
        operator,
        `/operator/users/${user.id}/availability`,
        "PUT",
        { status: "active", reason: "로컬 삭제 거부 확인 후 이용 정지 해제" },
      );
    await login(page);
  }
  pass("이용 정지·정지 해제 후 재인증 필요 세션의 기기 데이터 삭제 거부");

  frame = await launch(page, memo);
  const clearing = await page.context().newPage();
  clearing.on("dialog", (dialog) => dialog.accept());
  await clearing.goto(origin);
  await nav(clearing, "내 계정");
  await managedConsent(clearing, memo)
    .getByRole("button", { name: "이 기기의 앱 데이터 삭제", exact: true })
    .click();
  await success(clearing, "현재 기기의 이 앱 데이터를 삭제했습니다.");
  await frame.getByRole("textbox").fill("삭제 후 늦은 저장");
  await frame.getByRole("button", { name: "저장", exact: true }).click();
  await page
    .getByText("로컬 데이터가 삭제되었습니다. 앱을 다시 실행해 주세요.", {
      exact: true,
    })
    .waitFor();
  assert.deepEqual(await stored(page, user.id, memo.id), []);
  await clearing.close();
  frame = await launch(page, memo);
  assert.equal(await frame.getByRole("textbox").inputValue(), "");
  await frame
    .getByRole("textbox")
    .fill("계정이 바뀌어도 삭제되면 안 되는 메모");
  await frame.getByRole("button", { name: "저장", exact: true }).click();
  await frame.getByText("현재 기기에 저장했습니다.").waitFor();
  await nav(page, "앱 종료");
  await success(page, "앱을 종료했습니다.");
  pass(
    "다른 탭에서 기기 데이터 삭제 후 기존 실행의 늦은 SDK 저장 거부·재실행의 새 저장 허용",
  );

  await selectApp(memo);
  await nav(page, "공개 중단");
  await success(page, "공개를 중단했습니다. 기존 실행은 유지됩니다.");
  await nav(page, "내 계정");
  const consentRow = managedConsent(page, memo);
  await consentRow
    .getByText("이용 동의 중 · 현재 실행할 수 없음", { exact: true })
    .waitFor();
  await consentRow
    .getByRole("button", { name: "동의 철회", exact: true })
    .click();
  await success(page, "이용 동의를 철회했습니다.");
  await consentRow
    .getByText("동의 철회됨 · 현재 실행할 수 없음", { exact: true })
    .waitFor();
  assert.deepEqual(await stored(page, user.id, memo.id), [
    "계정이 바뀌어도 삭제되면 안 되는 메모",
  ]);
  await consentRow
    .getByRole("button", { name: "이 기기의 앱 데이터 삭제", exact: true })
    .click();
  await success(page, "현재 기기의 이 앱 데이터를 삭제했습니다.");
  assert.deepEqual(await stored(page, user.id, memo.id), []);
  await page.screenshot({ path: path.join(output, "used-apps.png") });
  pass(
    "내 앱 제거·공개 중단 후 계정에서 동의 철회·별도 기기 삭제 가능, 철회만으로 데이터 보존",
  );

  // App availability and developer approval are independent state machines.
  const stopApp = (await request(page, "/developer/apps")).find(
    (app) => app.id === memo.id,
  );
  await request(operator, `/operator/apps/${memo.id}/availability`, "PUT", {
    status: "normal_suspended",
    reason: "재승인 후 앱 중지 유지 시험",
    revision: stopApp.revision,
  });
  await request(operator, `/operator/developers/${user.id}/revoke`, "POST", {
    reason: "자격 취소 사유 표시 시험",
  });
  await reload(page, "개발자 공간");
  await page
    .getByText("개발자 자격이 취소되었습니다.", { exact: true })
    .waitFor();
  await page
    .getByText("자격 안내: 자격 취소 사유 표시 시험", { exact: true })
    .waitFor();
  await page
    .locator(".app-selector button")
    .filter({ hasText: tool.name })
    .click();
  assert.equal(
    await page
      .getByRole("button", { name: "공개 중단", exact: true })
      .isEnabled(),
    true,
  );
  await nav(page, "공개 중단");
  await success(page, "공개를 중단했습니다. 기존 실행은 유지됩니다.");
  assert.equal(
    await page
      .getByRole("button", { name: "다시 공개", exact: true })
      .isDisabled(),
    true,
  );
  await apply("자격 취소 후 재신청");
  await decision(
    "개발자 신청",
    name,
    "approved",
    "자격 재승인, 앱 중지는 별도",
  );
  await selectApp(memo);
  await page
    .getByText("개발자 자격이 승인되어 있습니다.", { exact: true })
    .waitFor();
  assert.equal(
    await page
      .getByRole("button", { name: "다시 공개", exact: true })
      .isDisabled(),
    true,
  );
  assert.equal(
    (await request(page, "/developer/apps")).find((app) => app.id === memo.id)
      .availability,
    "normal_suspended",
  );
  pass(
    "개발자 자격 취소 사유·공개 중단 허용·재공개 차단·재신청·재승인 후 앱 중지 유지",
  );

  await nav(page, "내 계정");
  await nav(page, "모의 재인증");
  await success(page, "모의 재인증을 완료했습니다.");
  await nav(page, "재인증 후 조회 링크 준비");
  await success(page, "조회 링크를 준비했습니다. 아직 탈퇴하지 않았습니다.");
  await page.getByLabel("조회 링크를 보관했습니다.", { exact: true }).check();
  await page
    .getByLabel("계정 복구가 불가능함을 확인했습니다.", { exact: true })
    .check();
  await nav(page, "탈퇴 확정");
  await page
    .getByText(
      "소유 앱의 종료 확인이 필요합니다. 개발자 공간에서 앱 종료를 요청해 주세요.",
      { exact: true },
    )
    .waitFor();
  assert.equal((await me(page)).id, user.id);
  pass("소유 앱이 남은 개발자 탈퇴는 대기하며 계정 이용 정보 유지");
  for (const app of fixtures) {
    await selectApp(app);
    await page.getByText("앱 종료", { exact: true }).click();
    await nav(page, "앱 종료 요청");
    await success(page, "앱 종료 확인을 요청했습니다.");
    await reload(operator, "운영 관리");
    await nav(operator, "앱 운영");
    const row = operator.locator(".record-list > li").filter({
      has: operator.getByRole("heading", { name: app.name, exact: true }),
    });
    await row
      .getByRole("textbox", { name: "앱 종료 확인 사유", exact: true })
      .fill("시험 소유자의 종료 요청 확인");
    await row
      .getByRole("button", { name: "소유자 요청 앱 종료 확인", exact: true })
      .click();
    await success(operator, "앱 종료를 확인했습니다.");
  }
  await nav(page, "내 계정");
  await managedConsent(page, memo)
    .getByText("동의 철회됨 · 현재 실행할 수 없음", { exact: true })
    .waitFor();
  await nav(page, "재인증 후 조회 링크 준비");
  await success(page, "조회 링크를 준비했습니다. 아직 탈퇴하지 않았습니다.");
  await page.getByLabel("조회 링크를 보관했습니다.", { exact: true }).check();
  await page
    .getByLabel("계정 복구가 불가능함을 확인했습니다.", { exact: true })
    .check();
  await nav(page, "탈퇴 확정");
  await page
    .getByRole("heading", { name: "데이터 삭제 처리 상태", exact: true })
    .waitFor();
  assert.equal((await page.request.get("/v1/me")).status(), 401);
  pass("소유자 앱 종료 요청·운영자 확인 후 개발자 탈퇴와 조회 전용 상태 화면");
  assert.deepEqual(errors, []);
  completed = true;
} catch (error) {
  await page
    .screenshot({
      path: path.join(output, "failure.png"),
      fullPage: true,
      mask: [page.getByRole("textbox", { name: /조회 링크/ })],
    })
    .catch(() => {});
  await operator
    .screenshot({
      path: path.join(output, "operator-failure.png"),
      fullPage: true,
    })
    .catch(() => {});
  throw error;
} finally {
  if (!completed && testUserId) {
    try {
      // Only this run's app IDs can be closed. This account was checked to have
      // no open apps before the run; preserve every pre-existing app record.
      await request(
        operator,
        `/operator/users/${testUserId}/availability`,
        "PUT",
        { status: "active", reason: "중단된 인수 시험 계정의 정지 해제" },
      );
      await request(page, "/test/login", "POST", {
        subject: "alice",
        provider: "github",
        ageConfirmed: true,
      });
      assert.equal((await me(page)).id, testUserId);
      const owned = await request(page, "/developer/apps");
      for (const app of fixtures) {
        const current = owned.find(
          (item) => item.id === app.id && item.name === app.name,
        );
        assert.ok(current, "시험 fixture 소유권을 확인할 수 없습니다.");
        if (current.closed) continue;
        if (!current.closureRequested)
          await request(
            page,
            `/developer/apps/${app.id}/closure-requests`,
            "POST",
            {},
          );
        await request(
          operator,
          `/operator/apps/${app.id}/closure-confirmations`,
          "POST",
          { reason: "중단된 인수 시험의 소유 fixture 종료" },
        );
      }
      await request(page, "/test/reauth", "POST", { provider: "github" });
      const receipt = await request(page, "/me/withdrawal/prepare", "POST", {});
      await request(page, "/me/withdrawal", "POST", {
        confirmed: true,
        receiptId: receipt.receiptId,
      });
    } catch (cleanupError) {
      errors.push(`시험 정리: ${cleanupError.message}`);
    }
  }
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
        fixtures,
        checks,
        errors,
      },
      null,
      2,
    ),
  );
  for (const context of contexts) await context.close();
  await browser.close();
}

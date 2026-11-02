import assert from "node:assert/strict";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { chromium } from "playwright";

const root = fileURLToPath(new URL("../../../", import.meta.url));
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
const fixtureName = `FE 시험 메모 ${Date.now()}`;
const output = path.join(
  root,
  "apps/platform-web/e2e-out",
  fixtureName.replaceAll(" ", "-"),
);
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  headless: true,
  ...(process.env.PLAYWRIGHT_CHANNEL
    ? { channel: process.env.PLAYWRIGHT_CHANNEL }
    : { channel: "msedge" }),
});
const context = await browser.newContext({
  viewport: { width: 1440, height: 1000 },
  baseURL: process.env.ZM_WEB_URL ?? "http://localhost:4300",
});
const page = await context.newPage();
page.setDefaultTimeout(12000);
const pageErrors = [];
const checks = [];
page.on("pageerror", (error) => pageErrors.push(error.message));
const pass = (name) => {
  checks.push(name);
  process.stdout.write(`PASS ${name}\n`);
};
const success = async (text) => {
  await page.getByText(text, { exact: true }).waitFor();
};
const navigate = async (name) => {
  await page.getByRole("button", { name, exact: true }).click();
};
const selectManaged = async () => {
  await navigate("개발자 공간");
  await page
    .locator(".app-selector button")
    .filter({ hasText: fixtureName })
    .click();
};
let appId = "";
try {
  await page.goto(process.env.ZM_WEB_URL ?? "http://localhost:4300");
  await page
    .getByRole("heading", { name: "오늘, 어떤 앱이 필요한가요?" })
    .waitFor();
  await navigate("로그인");
  await page
    .getByRole("combobox", { name: "시험 사용자", exact: true })
    .selectOption("owner");
  assert.equal(
    await page
      .getByRole("button", { name: "모의 로그인", exact: true })
      .isDisabled(),
    true,
  );
  await page.getByRole("checkbox").check();
  await navigate("모의 로그인");
  await success("시험 계정으로 로그인했습니다.");
  pass("연령 확인 전 가입 버튼 차단, 모의 로그인 성공");
  const me = await (await page.request.get("/v1/me")).json();
  if (!me.developer) {
    await navigate("개발자 공간");
    const application = await (
      await page.request.get("/v1/developer/application")
    ).json();
    if (!application || application.status !== "pending") {
      await page
        .getByRole("textbox", { name: "개발자 표시명", exact: true })
        .fill("FE 시험 개발자");
      await page
        .getByRole("textbox", { name: /연락용 이메일/ })
        .fill("fe-trial@example.test");
      await page
        .getByRole("textbox", { name: "만들 앱의 설명", exact: true })
        .fill("개인 메모 로컬 시험 앱");
      await page
        .getByRole("button", {
          name: application ? "수정하여 다시 신청" : "승인 신청",
          exact: true,
        })
        .click();
      await success("개발자 신청을 제출했습니다.");
    }
    await navigate("운영 관리");
    const record = page
      .locator(".record-list>li")
      .filter({ hasText: application?.displayName ?? "FE 시험 개발자" })
      .first();
    await record
      .getByRole("textbox", { name: "심사 사유" })
      .fill("로컬 시험 개발자 신청 확인");
    await record.getByRole("button", { name: "심사 결과 기록" }).click();
    await success("개발자 신청 심사 결과를 기록했습니다.");
    pass("개발자 신청과 운영자 승인");
  }
  await navigate("개발자 공간");
  await page
    .getByRole("textbox", { name: "앱 이름", exact: true })
    .fill(fixtureName);
  await navigate("앱 등록");
  await success("앱을 등록했습니다. 이 앱 ID로 번들을 만들어 제출하세요.");
  appId = (await page.locator("code").first().innerText()).trim();
  assert.match(appId, /^[a-f0-9-]{36}$/);
  const source = path.join(output, "independent-app");
  cli(["init", source, "--app-id", appId, "--json"]);
  const manifestPath = path.join(source, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.name = fixtureName;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2));
  cli(["build", source, "--json"]);
  const bundle = path.join(output, "app.zip");
  cli(["pack", source, "--out", bundle, "--json"]);
  await page.getByLabel("웹 번들 ZIP").setInputFiles(bundle);
  await navigate("번들 업로드");
  await success("번들을 업로드했습니다. 검사 결과를 확인해 주세요.");
  await page
    .getByText("검증 통과", { exact: true })
    .waitFor({ timeout: 60000 });
  await navigate("검수용 실행");
  assert.equal(
    await page.getByRole("button", { name: "동의하고 검수 시작" }).isDisabled(),
    true,
  );
  await page
    .getByRole("checkbox", {
      name: "위 내용을 확인하고 검수용 실행에 동의합니다.",
    })
    .check();
  await navigate("동의하고 검수 시작");
  await page
    .getByText(
      "검수용 실행입니다. 저장 데이터와 앱 사용자 식별자는 일반 실행과 분리됩니다.",
      { exact: true },
    )
    .waitFor();
  const previewFrame = page.frameLocator("iframe");
  await previewFrame.getByText(/앱 사용자:/).waitFor();
  await previewFrame.getByRole("textbox").fill("검수 영역에만 저장");
  await previewFrame.getByRole("button", { name: "저장", exact: true }).click();
  await previewFrame.getByText("현재 기기에 저장했습니다.").waitFor();
  await navigate("앱 종료");
  await success("앱을 종료했습니다.");
  await selectManaged();
  pass("미공개 판의 소유자 검수 동의·격리 실행·검수용 저장");
  await navigate("검수 요청");
  await success("검수를 요청했습니다.");
  await navigate("운영 관리");
  await navigate("앱 검수");
  const versionReview = page
    .locator(".record-list>li")
    .filter({ hasText: fixtureName });
  await versionReview
    .getByRole("textbox", { name: "심사 사유" })
    .fill("파일과 권한 및 로컬 저장 시험 대상 확인");
  await versionReview.getByRole("button", { name: "심사 결과 기록" }).click();
  await success(
    "앱 버전 검수 결과를 기록했습니다. 개발자가 직접 공개할 수 있습니다.",
  );
  await selectManaged();
  await navigate("이 버전 공개");
  await success("승인된 버전을 공개했습니다.");
  pass("독립 CLI 생성·빌드·ZIP 업로드·검증·자기 검수·개발자 공개");
  await navigate("앱 둘러보기");
  await page.getByRole("searchbox").fill(fixtureName);
  await page.getByRole("button", { name: `${fixtureName} 상세 보기` }).click();
  await navigate("내 앱에 추가");
  await success("내 앱에 추가했습니다.");
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "앱 열기", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "처음 실행하기 전에 확인해 주세요" })
    .waitFor();
  await navigate("동의하고 실행");
  const iframe = page.frameLocator("iframe");
  await iframe.getByText(/앱 사용자:/).waitFor();
  assert.equal(await iframe.getByRole("textbox").inputValue(), "");
  const content = page.locator("iframe");
  assert.equal(await content.getAttribute("sandbox"), "allow-scripts");
  const frame = await (await content.elementHandle()).contentFrame();
  const isolated = await frame.evaluate(() => {
    try {
      return !window.parent.document;
    } catch {
      return true;
    }
  });
  assert.equal(isolated, true);
  await iframe.getByRole("textbox").fill("기기별 메모 검증");
  await iframe.getByRole("button", { name: "저장", exact: true }).click();
  await iframe.getByText("현재 기기에 저장했습니다.").waitFor();
  await navigate("앱 종료");
  await success("앱을 종료했습니다.");
  await navigate("내 앱");
  await page.getByRole("button", { name: `${fixtureName} 상세 보기` }).click();
  await page
    .getByRole("dialog")
    .getByRole("button", { name: "앱 열기", exact: true })
    .click();
  await iframe.getByText(/앱 사용자:/).waitFor();
  const reopenedFrame = await (
    await page.locator("iframe").elementHandle()
  ).contentFrame();
  await reopenedFrame.waitForFunction(
    (value) => document.querySelector("#note")?.value === value,
    "기기별 메모 검증",
  );
  assert.equal(
    await iframe.getByRole("textbox").inputValue(),
    "기기별 메모 검증",
  );
  await page.screenshot({ path: path.join(output, "app-running.png") });
  pass("첫 실행 동의·iframe 격리·SDK 저장·재실행 복원");
  const operator = await context.newPage();
  await operator.goto(process.env.ZM_WEB_URL ?? "http://localhost:4300");
  await operator
    .getByRole("button", { name: "운영 관리", exact: true })
    .click();
  await operator.getByRole("button", { name: "앱 운영", exact: true }).click();
  const appRecord = operator
    .locator(".record-list>li")
    .filter({ hasText: fixtureName });
  await appRecord
    .getByRole("combobox", { name: "운영 상태", exact: true })
    .selectOption("normal_suspended");
  await appRecord
    .getByRole("textbox", { name: "변경 사유", exact: true })
    .fill("일반 중지 기존 실행 유지 확인");
  await appRecord.getByRole("button", { name: "운영 상태 변경" }).click();
  await operator
    .getByText("앱 운영 상태를 변경했습니다.", { exact: true })
    .waitFor();
  await page.waitForTimeout(5500);
  assert.equal(await page.locator("iframe").count(), 1);
  await iframe.getByRole("button", { name: "저장", exact: true }).click();
  await iframe.getByText("현재 기기에 저장했습니다.").waitFor();
  await appRecord
    .getByRole("combobox", { name: "운영 상태", exact: true })
    .selectOption("emergency_suspended");
  await appRecord
    .getByRole("textbox", { name: "변경 사유", exact: true })
    .fill("긴급 중지 기존 실행 권한 차단 확인");
  await appRecord.getByRole("button", { name: "운영 상태 변경" }).click();
  await page.locator("iframe").waitFor({ state: "detached", timeout: 12000 });
  pass("일반 중지 기존 실행 유지, 긴급 중지 후 호스트 종료");
  await operator.close();
  await navigate("내 앱");
  const stopped = page.locator(".app-card").filter({ hasText: fixtureName });
  await stopped.waitFor();
  assert.equal(
    await stopped
      .getByRole("button", { name: "앱 열기", exact: true })
      .isDisabled(),
    true,
  );
  await stopped
    .getByRole("button", { name: `${fixtureName} 상세 보기` })
    .click();
  await navigate("내 앱에서 제거");
  await success("내 앱 목록에서 제거했습니다. 저장 데이터는 유지됩니다.");
  await page.getByRole("button", { name: "앱 상세 닫기" }).click();
  pass("중지 앱의 내 앱 목록 유지·실행 차단·목록 제거");
  await page.setViewportSize({ width: 390, height: 844 });
  await navigate("앱 둘러보기");
  await page
    .getByText("앱을 불러오고 있습니다…", { exact: true })
    .waitFor({ state: "hidden" });
  await page.screenshot({
    path: path.join(output, "mobile-store.png"),
    fullPage: true,
  });
  assert.equal(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    true,
  );
  assert.deepEqual(pageErrors, []);
  pass("모바일 폭 가로 넘침 없음·브라우저 실행 오류 없음");
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      { ok: true, appId, fixtureName, checks, pageErrors },
      null,
      2,
    ),
  );
} catch (error) {
  await page
    .screenshot({ path: path.join(output, "failure.png"), fullPage: true })
    .catch(() => undefined);
  await writeFile(
    path.join(output, "result.json"),
    JSON.stringify(
      {
        ok: false,
        appId,
        fixtureName,
        checks,
        error: String(error),
        pageErrors,
        visibleText: await page
          .locator("main")
          .innerText()
          .catch(() => ""),
      },
      null,
      2,
    ),
  );
  throw error;
} finally {
  await context.close();
  await browser.close();
}

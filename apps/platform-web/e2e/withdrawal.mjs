import assert from "node:assert/strict";
import { chromium } from "playwright";
const origin = process.env.ZM_WEB_URL ?? "http://localhost:4300";
const browser = await chromium.launch({
  headless: true,
  channel: process.env.PLAYWRIGHT_CHANNEL ?? "msedge",
});
const context = await browser.newContext({ baseURL: origin });
const page = await context.newPage();
page.setDefaultTimeout(15000);
try {
  await page.goto(origin);
  await page.getByRole("button", { name: "로그인", exact: true }).click();
  await page
    .getByRole("combobox", { name: "시험 사용자", exact: true })
    .selectOption("bob");
  await page
    .getByRole("combobox", { name: "모의 로그인 제공자", exact: true })
    .selectOption("github");
  await page.getByRole("checkbox").check();
  await page.getByRole("button", { name: "모의 로그인", exact: true }).click();
  await page
    .getByText("시험 계정으로 로그인했습니다.", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "모의 재인증", exact: true }).click();
  await page
    .getByText("모의 재인증을 완료했습니다.", { exact: true })
    .waitFor();
  const userId = (await (await page.request.get("/v1/me")).json()).id;
  assert.equal(
    await page
      .getByRole("button", { name: "탈퇴 확정", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("button", { name: "재인증 후 조회 링크 준비", exact: true })
    .click();
  const link = await page
    .getByRole("textbox", {
      name: "탈퇴 후 데이터 삭제 조회 링크",
      exact: true,
    })
    .inputValue();
  assert.match(link, /#withdrawal=.+/);
  await page
    .getByRole("checkbox", { name: "계정 복구가 불가능함을 확인했습니다." })
    .check();
  assert.equal(
    await page
      .getByRole("button", { name: "탈퇴 확정", exact: true })
      .isDisabled(),
    true,
  );
  await page
    .getByRole("checkbox", { name: "조회 링크를 보관했습니다." })
    .check();
  let committed = false;
  await page.route("**/v1/me/withdrawal", async (route) => {
    const response = await route.fetch();
    assert.equal(response.status(), 200);
    const result = await response.json();
    assert.equal(result.status, "withdrawn");
    committed = true;
    await route.abort("failed");
  });
  await page.getByRole("button", { name: "탈퇴 확정", exact: true }).click();
  await page.getByRole("alert").waitFor();
  assert.equal(committed, true);
  assert.equal((await page.request.get("/v1/me")).status(), 401);
  const receiptPage = await context.newPage();
  await receiptPage.goto(link);
  await receiptPage
    .getByRole("heading", { name: "데이터 삭제 처리 상태" })
    .waitFor();
  await receiptPage.locator(".deletion-status").waitFor();
  assert.equal(new URL(receiptPage.url()).hash, "");
  await receiptPage.getByRole("button", { name: "Store로 돌아가기" }).click();
  await receiptPage
    .getByRole("button", { name: "로그인", exact: true })
    .click();
  await receiptPage
    .getByRole("combobox", { name: "시험 사용자", exact: true })
    .selectOption("bob");
  await receiptPage
    .getByRole("combobox", { name: "모의 로그인 제공자", exact: true })
    .selectOption("github");
  await receiptPage.getByRole("checkbox").check();
  await receiptPage
    .getByRole("button", { name: "모의 로그인", exact: true })
    .click();
  await receiptPage
    .getByText("시험 계정으로 로그인했습니다.", { exact: true })
    .waitFor();
  const newId = (await (await receiptPage.request.get("/v1/me")).json()).id;
  assert.notEqual(newId, userId);
  process.stdout.write(
    "PASS 탈퇴 조회 링크 사전 보관·보관 확인 전 확정 차단·커밋 후 응답 유실·보관 링크 상태 조회·같은 제공자로 새 계정 가입\n",
  );
} finally {
  await context.close();
  await browser.close();
}

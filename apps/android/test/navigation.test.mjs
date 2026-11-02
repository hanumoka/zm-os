import test from "node:test";
import assert from "node:assert/strict";
import { navigationDecision } from "../src/navigation.ts";
const context = {
  origin: "http://localhost:4300",
  assetOrigin: "http://localhost:4311",
  preparing: true,
  nonce: "current-native-nonce",
};
const ticketUrl =
  context.origin +
  "/v1/auth/native/start?ticket=abcdefghijklmnopqrstuvwxyz012345#native=current-native-nonce";
test("프레임 판별 정보가 없으면 호스트와 자산 탐색을 모두 거부한다", () => {
  assert.equal(
    navigationDecision(context.origin, undefined, context),
    "missing-frame",
  );
  assert.equal(
    navigationDecision(
      context.assetOrigin + "/apps/bundle",
      undefined,
      context,
    ),
    "missing-frame",
  );
});
test("자산은 자식 프레임에서만 허용하고 다른 외부 문서는 거부한다", () => {
  assert.equal(
    navigationDecision(context.assetOrigin + "/apps/bundle", false, context),
    "allow",
  );
  assert.equal(
    navigationDecision(context.assetOrigin + "/apps/bundle", true, context),
    "deny",
  );
  assert.equal(
    navigationDecision("https://untrusted.example", false, context),
    "deny",
  );
  assert.equal(
    navigationDecision("https://untrusted.example", true, context),
    "deny",
  );
});
test("인앱이나 일반 웹 링크는 네이티브 인증을 시작하지 못한다", () => {
  assert.equal(
    navigationDecision(context.origin + "/v1/auth/google/start", true, context),
    "auth-menu",
  );
  assert.equal(
    navigationDecision(
      context.origin + "/v1/auth/google/start",
      false,
      context,
    ),
    "deny",
  );
  assert.equal(navigationDecision(ticketUrl, false, context), "deny");
});
test("현재 네이티브 시도의 정확한 host·path·nonce·ticket만 일회 인계를 허용한다", () => {
  assert.equal(navigationDecision(ticketUrl, true, context), "auth-start");
  assert.equal(
    navigationDecision(
      ticketUrl.replace("current-native-nonce", "old-native-nonce"),
      true,
      context,
    ),
    "auth-menu",
  );
  assert.equal(
    navigationDecision(
      ticketUrl.replace("/native/start", "/native/wrong"),
      true,
      context,
    ),
    "allow",
  );
  assert.equal(
    navigationDecision(
      ticketUrl.replace("localhost:4300", "localhost:4311"),
      true,
      context,
    ),
    "deny",
  );
  assert.equal(
    navigationDecision(ticketUrl, true, { ...context, preparing: false }),
    "auth-menu",
  );
  assert.equal(
    navigationDecision(ticketUrl, true, { ...context, nonce: undefined }),
    "auth-menu",
  );
});
test("준비 실패 신호도 현재 시도와 최상위 프레임에 결합된다", () => {
  const failure =
    context.origin + "/native-auth-failed#native=current-native-nonce";
  assert.equal(navigationDecision(failure, true, context), "auth-failed");
  assert.equal(navigationDecision(failure, false, context), "deny");
  assert.equal(
    navigationDecision(failure, true, { ...context, preparing: false }),
    "auth-menu",
  );
});

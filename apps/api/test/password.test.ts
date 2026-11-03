import assert from "node:assert/strict";
import test from "node:test";
import { hashPassword, passwordInput, verifyPassword } from "../src/password.js";

test("비밀번호 길이·한글·공백·유니코드 정규화와 일반 비밀번호 거부", () => {
  assert.throws(() => passwordInput("too-short", true));
  assert.throws(() => passwordInput("passwordpassword", true));
  assert.throws(() => passwordInput("A".repeat(15), true));
  assert.throws(() => passwordInput("A".repeat(129), true));
  const password = "햇살을 보며 오늘도 걷습니다 42";
  assert.equal(passwordInput(password, true), password);
  assert.equal(passwordInput(password.normalize("NFD"), true), password);
  assert.equal(passwordInput("  앞뒤 공백도 비밀번호에 포함  "), "  앞뒤 공백도 비밀번호에 포함  ");
});
test("무작위 salt·scrypt 검증·틀린 입력·없는 계정과 손상된 해시 거부", async () => {
  const value = "산책하는 아침에는 커피 한잔 2026";
  const first = await hashPassword(value), second = await hashPassword(value);
  assert.notEqual(first, second);
  assert.equal(first.includes(value), false);
  assert.equal(await verifyPassword(value, first), true);
  assert.equal(await verifyPassword(value.normalize("NFD"), first), true);
  assert.equal(await verifyPassword("다른 사람이 작성한 비밀번호 123", first), false);
  assert.equal(await verifyPassword(value, null), false);
  assert.equal(await verifyPassword(value, "scrypt$999999999$8$1$bad$bad"), false);
});

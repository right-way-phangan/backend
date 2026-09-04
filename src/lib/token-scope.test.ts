import { test } from "node:test";
import assert from "node:assert/strict";
import { tokenAllows, isTrackPath } from "./token-scope";

const T = { full: "full-secret", track: "track-secret" };

test("полный токен открывает всё", () => {
  assert.equal(tokenAllows("/objects", "Bearer full-secret", T), true);
  assert.equal(tokenAllows("/track/view", "Bearer full-secret", T), true);
  assert.equal(tokenAllows("/photos/purge", "Bearer full-secret", T), true);
});

test("track-токен открывает только beacon'ы и /ratelimit", () => {
  assert.equal(tokenAllows("/track/view", "Bearer track-secret", T), true);
  assert.equal(tokenAllows("/track/search", "Bearer track-secret", T), true);
  assert.equal(tokenAllows("/ratelimit", "Bearer track-secret", T), true);
  assert.equal(tokenAllows("/objects", "Bearer track-secret", T), false);
  assert.equal(tokenAllows("/objects/RW-L0001", "Bearer track-secret", T), false);
  assert.equal(tokenAllows("/photos/purge", "Bearer track-secret", T), false);
  assert.equal(tokenAllows("/leads", "Bearer track-secret", T), false);
});

test("без track-токена в конфиге путь /track/* открыт только полным", () => {
  assert.equal(tokenAllows("/track/view", "Bearer track-secret", { full: "full-secret" }), false);
  assert.equal(tokenAllows("/track/view", "Bearer full-secret", { full: "full-secret" }), true);
});

test("мусорный заголовок, пустой Bearer и подмена префикса не проходят", () => {
  assert.equal(tokenAllows("/track/view", undefined, T), false);
  assert.equal(tokenAllows("/track/view", "Bearer ", T), false);
  assert.equal(tokenAllows("/track/view", "Basic full-secret", T), false);
  assert.equal(tokenAllows("/tracking/x", "Bearer track-secret", T), false);
  assert.equal(tokenAllows("/ratelimits", "Bearer track-secret", T), false);
});

test("isTrackPath — точный префикс", () => {
  assert.equal(isTrackPath("/track/event"), true);
  assert.equal(isTrackPath("/ratelimit"), true);
  assert.equal(isTrackPath("/track"), false);
  assert.equal(isTrackPath("/objects"), false);
});

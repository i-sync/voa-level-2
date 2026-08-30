import test from "node:test";
import assert from "node:assert/strict";

import {
  formatMediaTime,
  formatRemaining,
  formatSpeed,
  getAdjacentLessonId,
  normalizeCustomTimerMinutes,
  normalizeSpeed,
  parseLessonId,
} from "../js/core.js";

const lessons = [
  { id: 1, title: "One" },
  { id: 2, title: "Two" },
  { id: 4, title: "Four" },
];

test("normalizes speed to 0.05 steps and clamps the supported range", () => {
  assert.equal(normalizeSpeed(0.83), 0.85);
  assert.equal(normalizeSpeed(0.1), 0.5);
  assert.equal(normalizeSpeed(2), 1.5);
  assert.equal(normalizeSpeed("bad"), 1);
  assert.equal(formatSpeed(0.8), "0.8×");
  assert.equal(formatSpeed(1), "1.0×");
});

test("formats player and timer durations", () => {
  assert.equal(formatMediaTime(0), "0:00");
  assert.equal(formatMediaTime(65.9), "1:05");
  assert.equal(formatMediaTime(3661), "1:01:01");
  assert.equal(formatRemaining(61_001), "01:02");
  assert.equal(formatRemaining(3_661_000), "1:01:01");
});

test("resolves valid and fallback lesson IDs", () => {
  assert.equal(parseLessonId("2", lessons, 1), 2);
  assert.equal(parseLessonId("3", lessons, 4), 4);
  assert.equal(parseLessonId("bad", lessons, 99), 1);
});

test("finds adjacent lessons without assuming IDs are consecutive", () => {
  assert.equal(getAdjacentLessonId(lessons, 2, -1), 1);
  assert.equal(getAdjacentLessonId(lessons, 2, 1), 4);
  assert.equal(getAdjacentLessonId(lessons, 1, -1), null);
  assert.equal(getAdjacentLessonId(lessons, 4, 1), null);
});

test("validates custom sleep timer minutes", () => {
  assert.equal(normalizeCustomTimerMinutes("30"), 30);
  assert.equal(normalizeCustomTimerMinutes(0), 1);
  assert.equal(normalizeCustomTimerMinutes(999), 240);
  assert.equal(normalizeCustomTimerMinutes("not-a-number"), null);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

import { classifyUiRoute } from "../app/ui-route-mode.ts";

test("student and authentication routes opt into optimized content", () => {
  for (const pathname of [
    "/",
    "/dashboard",
    "/courses",
    "/courses/course-01",
    "/lessons/lesson-01",
    "/exam-history",
    "/progress",
    "/profile",
    "/forgot-password",
    "/reset-password",
  ]) {
    assert.equal(classifyUiRoute(pathname), "optimized-content", pathname);
  }
});

test("exam-room catalogs expose optimized chrome without opting exam content in", () => {
  assert.equal(classifyUiRoute("/exam-room"), "optimized-chrome-only");
  assert.equal(classifyUiRoute("/exam-room/practice-room-01"), "optimized-chrome-only");
});

test("exam runners, results, reviews, solutions, and guest exams stay protected", () => {
  for (const pathname of [
    "/exam/123e4567-e89b-42d3-a456-426614174000",
    "/exam/123e4567-e89b-42d3-a456-426614174000/section/section-01",
    "/exam/123e4567-e89b-42d3-a456-426614174000/section/section-01/confirm",
    "/exam/result/attempt-01",
    "/exam/result/attempt-01/review",
    "/exam/result/attempt-01/solutions",
    "/exam/guest-token-01",
    "/guest/exam/guest-token-01",
  ]) {
    assert.equal(classifyUiRoute(pathname), "protected", pathname);
  }
});

test("safe admin operations are explicit while authoring and result routes stay protected", () => {
  for (const pathname of [
    "/admin",
    "/admin/students",
    "/admin/content",
    "/admin/content/courses/course-01",
    "/admin/hls-vault",
    "/admin/sessions",
    "/admin/sessions/new",
    "/admin/timetable",
    "/admin/audit",
    "/admin/upload",
    "/admin/enrollments",
    "/admin/security",
  ]) {
    assert.equal(classifyUiRoute(pathname), "optimized-content", pathname);
  }

  for (const pathname of [
    "/admin/exams",
    "/admin/exams/exam-01",
    "/admin/exams/exam-01/questions/question-01",
    "/admin/exams/exam-01/sections/section-01/editor",
    "/admin/exams/exam-01/preview",
    "/admin/sessions/session-01/results",
    "/admin/question-bank",
    "/admin/question-bank/bank-01",
    "/admin/question-bank/bank-01/items/item-01",
  ]) {
    assert.equal(classifyUiRoute(pathname), "protected", pathname);
  }
});

test("route normalization cannot widen the optimized allowlist", () => {
  assert.equal(classifyUiRoute("/courses/?q=vietnamese#top"), "optimized-content");
  assert.equal(classifyUiRoute("courses/course-01/"), "optimized-content");
  assert.equal(classifyUiRoute("/unknown"), "protected");
  assert.equal(classifyUiRoute("/admin/exams-archive"), "protected");
  assert.equal(classifyUiRoute(""), "optimized-content");
});

test("platform exposes the route mode and only opts approved content into the new UI", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /const uiRouteMode = classifyUiRoute\(pathname\)/);
  assert.match(platform, /data-ui-mode=\{uiRouteMode\}/);
  assert.match(platform, /uiRouteMode === "optimized-content" \? "ui-optimized-surface" : ""/);
  assert.match(platform, /uiRouteMode === "optimized-content" \? "product-content-surface" : ""/);
  assert.match(platform, /tabIndex=\{uiRouteMode !== "protected" \? -1 : undefined\}/);
});

test("chrome-only room routes style shell controls without opting exam content in", async () => {
  const styles = await readFile(new URL("../app/aeck-ui.css", import.meta.url), "utf8");

  assert.match(styles, /\.ui-shell\.product-shell\.ui-optimized-chrome > :where\(\.topbar, \.sidebar\)/);
  assert.match(styles, /:is\(\.ui-optimized-surface, \.ui-optimized-chrome\) > \.sidebar nav a/);
  assert.match(styles, /:is\(\.ui-optimized-surface, \.ui-optimized-chrome\) \.skip-link/);
  assert.doesNotMatch(styles, /\.ui-optimized-chrome[^\n{]*\.main-content/);
});

import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("private exam images stream from R2 and use a short browser-private cache", async () => {
  const [imageServer, r2Server, studentRoute, guestRoute, renderer] = await Promise.all([
    source("lib/exam-images-server.ts"),
    source("lib/r2-server.ts"),
    source("app/api/exam-images/[sectionId]/[asset]/route.ts"),
    source("app/api/guest-exams/images/[sectionId]/[asset]/route.ts"),
    source("components/remixstudyedu/MathExam.jsx"),
  ]);

  assert.match(imageServer, /export const examImageHeaders = \{[\s\S]*"cache-control": "private, no-store, max-age=0"/);
  assert.match(imageServer, /export const examImageAssetHeaders = \{[\s\S]*"cache-control": "private, max-age=300, stale-while-revalidate=60"/);
  assert.match(imageServer, /vary: "authorization, x-supabase-access-token, cookie, origin"/);
  assert.match(r2Server, /export async function streamR2Object/);
  assert.match(r2Server, /body: response\.body/);
  assert.match(studentRoute, /streamR2Object\(examImageKey/);
  assert.match(studentRoute, /new Response\(image\.body/);
  assert.match(guestRoute, /streamR2Object\(examImageKey/);
  assert.match(guestRoute, /new Response\(image\.body/);
  assert.match(guestRoute, /Promise\.all\(\[/);
  assert.doesNotMatch(studentRoute, /image\.bytes/);
  assert.doesNotMatch(guestRoute, /image\.bytes/);
  assert.match(renderer, /cache: "default"/);
  assert.doesNotMatch(renderer, /headers: \{ accept: "image\/\*" \},\s*cache: "no-store"/);
});

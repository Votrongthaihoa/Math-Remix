import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("private exam images use a short browser-private cache and preload after authorization", async () => {
  const [imageServer, r2Server, studentRoute, guestRoute, renderer, examRoom, imageClient] = await Promise.all([
    source("lib/exam-images-server.ts"),
    source("lib/r2-server.ts"),
    source("app/api/exam-images/[sectionId]/[asset]/route.ts"),
    source("app/api/guest-exams/images/[sectionId]/[asset]/route.ts"),
    source("components/remixstudyedu/MathExam.jsx"),
    source("app/exam-room.tsx"),
    source("lib/exam-image-client.ts"),
  ]);

  assert.match(imageServer, /export const examImageHeaders = \{[\s\S]*"cache-control": "private, no-store, max-age=0"/);
  assert.match(imageServer, /export const examImageAssetHeaders = \{[\s\S]*"cache-control": "private, max-age=300, stale-while-revalidate=60"/);
  assert.match(imageServer, /vary: "authorization, x-supabase-access-token, cookie, origin"/);
  assert.match(r2Server, /export async function loadR2Object/);
  assert.match(studentRoute, /loadR2Object\(examImageKey/);
  assert.match(studentRoute, /new Response\(image\.bytes/);
  assert.match(studentRoute, /EXAM_IMAGE_SECTION_PATTERN\.test\(sectionId\)/);
  assert.match(studentRoute, /authentication\.user\.role !== "admin"[\s\S]*loadExamSectionAccess/);
  assert.match(guestRoute, /loadR2Object\(examImageKey/);
  assert.match(guestRoute, /new Response\(image\.bytes/);
  assert.match(guestRoute, /Promise\.all\(\[/);
  assert.match(renderer, /cache: "default"/);
  assert.doesNotMatch(renderer, /headers: \{ accept: "image\/\*" \},\s*cache: "no-store"/);
  assert.match(renderer, /loadAuthenticatedExamImage\(url\)/);
  assert.match(imageClient, /const protectedImageBlobs = new Map<string, Promise<Blob>>/);
  assert.match(imageClient, /authenticatedFetch\(url/);
  assert.match(imageClient, /const token = await activeSessionToken\(\)/);
  assert.match(imageClient, /protectedImageSessionToken !== token[\s\S]*protectedImageBlobs\.clear\(\)/);
  assert.match(imageClient, /MAX_MEMORY_CACHED_IMAGES = 24/);
  assert.match(examRoom, /preloadAuthenticatedExamImages\(preloadOrder\)/);
  assert.match(examRoom, /payload\.attemptId !== attempt\.id/);
  assert.match(renderer, /preloadAuthenticatedExamImages\(questions\.slice\(currentIndex, currentIndex \+ 5\)\)/);
});

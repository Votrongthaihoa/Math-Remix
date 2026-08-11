import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("client API requests use the dedicated configurable origin", async () => {
  const [apiUrl, authClient, guestExam] = await Promise.all([
    source("lib/api-url.ts"),
    source("lib/auth-client.ts"),
    source("app/guest-exam.tsx"),
  ]);
  assert.match(apiUrl, /NEXT_PUBLIC_API_URL/);
  assert.match(apiUrl, /https:\/\/api\.mathremix\.pro\.vn/);
  assert.match(authClient, /apiRequestUrl\(input\)/);
  assert.doesNotMatch(guestExam, /fetch\((?:`|\")\/api\/guest-exams/);
  assert.match(guestExam, /fetch\(apiRequestUrl\(/);
  assert.match(guestExam, /credentials: "include"/);
  assert.match(guestExam, /questionsWithGuestMedia/);
  assert.match(guestExam, /media_url: guestMediaUrl/);
  assert.match(guestExam, /function guestTextWithMediaOrigin/);
  assert.match(guestExam, /prompt: guestTextWithMediaOrigin/);
  assert.match(guestExam, /options: question\.options\.map\(guestOptionWithMedia\)/);
  assert.match(guestExam, /passage: guestTextWithMediaOrigin/);
  assert.match(guestExam, /instruction: guestTextWithMediaOrigin/);
  assert.match(guestExam, /www\.mathremix\.pro\.vn/);
  assert.match(guestExam, /absolute\.pathname\.startsWith\("\/api\/guest-exams\/images\/"\)/);
});

test("API proxy permits only approved web origins and required auth headers", async () => {
  const proxy = await source("proxy.ts");
  assert.match(proxy, /api\.mathremix\.pro\.vn/);
  assert.match(proxy, /request\.nextUrl\.hostname/);
  assert.match(proxy, /!apiPath/);
  assert.match(proxy, /status: 404/);
  assert.match(proxy, /https:\/\/www\.mathremix\.pro\.vn/);
  assert.match(proxy, /X-Supabase-Access-Token/);
  assert.match(proxy, /access-control-allow-credentials/);
  assert.match(proxy, /request\.method === "OPTIONS"/);
  assert.match(proxy, /matcher: "\/:path\*"/);
  assert.match(proxy, /status: 403/);
});

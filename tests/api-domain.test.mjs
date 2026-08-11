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
});

test("API proxy permits only approved web origins and required auth headers", async () => {
  const proxy = await source("proxy.ts");
  assert.match(proxy, /https:\/\/www\.mathremix\.pro\.vn/);
  assert.match(proxy, /X-Supabase-Access-Token/);
  assert.match(proxy, /request\.method === "OPTIONS"/);
  assert.match(proxy, /matcher: "\/api\/:path\*"/);
  assert.match(proxy, /status: 403/);
});

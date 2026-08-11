import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("protected browser requests refresh one shared Supabase session and retry once", async () => {
  const auth = await source("lib/auth-client.ts");
  assert.match(auth, /let refreshPromise: Promise<Session \| null> \| null = null/);
  assert.match(auth, /refreshPromise = supabase\.auth\.refreshSession\(\)/);
  assert.match(auth, /headers\.set\("x-supabase-access-token", token\)/);
  assert.match(auth, /if \(response\.status !== 401/);
  assert.match(auth, /signOut\(\{ scope: "local" \}\)/);
  assert.match(auth, /AUTH_SESSION_INVALID/);
  assert.match(auth, /previous login must never sign out a newer login/);
});

test("the product shell waits for the initial Supabase session before rendering login", async () => {
  const platform = await source("app/platform.tsx");
  assert.match(platform, /const \[checkingSession, setCheckingSession\] = useState\(\(\) => Boolean\(supabase\)\)/);
  assert.doesNotMatch(platform, /queueMicrotask\(\(\) => \{ if \(active\) setCheckingSession\(true\); \}\)/);
  assert.match(platform, /if \(checkingSession && !initialGuestToken\) return <LoadingIndicator[^>]*fullPage \/>/);
});

test("a route 401 does not clear a session that Supabase Auth still validates", async () => {
  const auth = await source("lib/auth-client.ts");
  assert.match(auth, /supabase\.auth\.getUser\(refreshedToken\)/);
  assert.match(auth, /if \(!verificationError && verifiedUser\.user\) return response/);
  assert.match(auth, /await clearInvalidLocalSession\(refreshedToken\)/);
});

test("security-sensitive browser surfaces do not send a stale getSession token directly", async () => {
  const [guard, security, video, platform] = await Promise.all([
    source("app/account-security-guard.tsx"),
    source("app/admin-security.tsx"),
    source("app/video-player.tsx"),
    source("app/platform.tsx"),
  ]);
  assert.match(guard, /authenticatedFetch\("\/api\/security\/session"/);
  assert.doesNotMatch(guard, /supabase\.auth\.getSession\(/);
  assert.match(security, /authenticatedFetch\(path/);
  assert.doesNotMatch(security, /supabase\.auth\.getSession\(/);
  assert.match(video, /activeSessionToken\(\)/);
  assert.match(video, /authenticatedFetch\("\/api\/video-token"/);
  assert.match(platform, /activeSessionToken\(\)/);
  assert.match(platform, /authenticatedFetch\(`\/api\/lesson-resources/);
  assert.match(platform, /authOperationRef\.current \+= 1/);
  assert.match(platform, /isCurrentOperation/);
});

test("exam APIs preserve explicit authentication failure responses", async () => {
  const [route, content, resultContent, security] = await Promise.all([
    source("app/api/exams/route.ts"),
    source("app/api/exams/content/route.ts"),
    source("app/api/exams/result-content/route.ts"),
    source("lib/security-server.ts"),
  ]);
  assert.match(route, /if \(!authentication\.ok\) return authentication\.response/);
  assert.match(content, /if \(!authentication\.ok\) return authentication\.response/);
  assert.match(resultContent, /if \(!authentication\.ok\) return authentication\.response/);
  assert.match(security, /code: "AUTH_REQUIRED"/);
  assert.match(security, /code: "AUTH_SESSION_INVALID"/);
});

test("temporary Supabase verification failures are not reported as expired sessions", async () => {
  const security = await source("lib/security-server.ts");
  assert.match(security, /class AuthServiceUnavailableError extends Error/);
  assert.match(security, /code: "AUTH_SERVICE_UNAVAILABLE"/);
  assert.match(security, /status: 503/);
});

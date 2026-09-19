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

test("course data lifecycle keeps a valid snapshot, rejects stale responses, and forwards recovery state", async () => {
  const [platform, dashboard] = await Promise.all([
    source("app/platform.tsx"),
    source("app/student-dashboard.tsx"),
  ]);
  const lifecycleStart = platform.indexOf("function clearCourseData");
  const lifecycleEnd = platform.indexOf("async function loadCourseData", lifecycleStart);
  assert.ok(lifecycleStart >= 0 && lifecycleEnd > lifecycleStart, "course lifecycle helpers should stay together");
  const lifecycle = platform.slice(lifecycleStart, lifecycleEnd);
  const courseFailure = lifecycle.slice(lifecycle.indexOf(".catch("), lifecycle.indexOf(".finally("));
  const logoutStart = platform.indexOf("async function logoutFromAccountMenu");
  const profileRouteStart = platform.indexOf('if (currentView === "profile"', logoutStart);
  assert.ok(logoutStart >= 0 && profileRouteStart > logoutStart, "logout should have a bounded source region");
  const logout = platform.slice(logoutStart, profileRouteStart);
  const selfClosingElement = name => {
    const match = platform.match(new RegExp(`<${name}\\b[\\s\\S]*?\\/>`));
    assert.ok(match, `${name} should be mounted by the product shell`);
    return match[0];
  };
  const dashboardMount = selfClosingElement("StudentDashboard");
  const coursesMount = selfClosingElement("Courses");
  const detailMount = selfClosingElement("CourseDetail");
  const profileMounts = [...platform.matchAll(/<Profile\b[\s\S]*?\/>/g)].map(match => match[0]);

  assert.match(platform, /const\s+\[\s*coursesLoading\s*,\s*setCoursesLoading\s*\]\s*=\s*useState\(\s*false\s*\)/);
  assert.match(platform, /const\s+\[\s*coursesError\s*,\s*setCoursesError\s*\]\s*=\s*useState\(\s*["']{2}\s*\)/);
  assert.match(platform, /const\s+courseRequestRef\s*=\s*useRef(?:<[^>]+>)?\(\s*0\s*\)/);
  assert.match(platform, /const\s+courseScopeRef\s*=\s*useRef<\s*string\s*\|\s*null\s*>\(\s*null\s*\)/);
  assert.match(lifecycle, /(?:\+\+\s*courseRequestRef\.current|courseRequestRef\.current\s*\+=\s*1)/);
  assert.match(lifecycle, /courseScopeRef\.current\s*=\s*null/);
  assert.match(lifecycle, /const\s+requestId\s*=\s*\+\+\s*courseRequestRef\.current/);
  assert.match(lifecycle, /courseScopeRef\.current\s*!==\s*scope/);
  assert.match(lifecycle, /courseRequestRef\.current\s*!==\s*requestId/);
  assert.match(lifecycle, /setCoursesError\(\s*["']{2}\s*\)/);
  assert.match(courseFailure, /setCoursesError\(/);
  assert.doesNotMatch(courseFailure, /setAssignedCourses\(\s*\[\s*\]\s*\)/);
  assert.match(logout, /clearCourseData\(\)/);
  assert.doesNotMatch(logout, /setAssignedCourses\(\s*\[\s*\]\s*\)/);

  assert.match(dashboardMount, /\bcoursesLoading\s*=\s*\{\s*coursesLoading\s*\}/);
  assert.match(dashboardMount, /\bcoursesError\s*=\s*\{\s*coursesError\s*\}/);
  assert.match(dashboardMount, /\bonRetryCourses\s*=\s*\{\s*(?:retryCourseData|\(\s*\)\s*=>\s*retryCourseData\(\s*\))\s*\}/);
  assert.match(coursesMount, /\bloading\s*=\s*\{\s*coursesLoading\s*\}/);
  assert.match(coursesMount, /\berror\s*=\s*\{\s*coursesError\s*\}/);
  assert.match(coursesMount, /\bonRetry\s*=\s*\{\s*(?:retryCourseData|\(\s*\)\s*=>\s*retryCourseData\(\s*\))\s*\}/);
  assert.match(detailMount, /\bloading\s*=\s*\{\s*coursesLoading\s*\}/);
  assert.match(detailMount, /\bcoursesError\s*=\s*\{\s*coursesError\s*\}/);
  assert.match(detailMount, /\bonRetry\s*=\s*\{\s*(?:retryCourseData|\(\s*\)\s*=>\s*retryCourseData\(\s*\))\s*\}/);
  assert.ok(profileMounts.length > 0, "profile state should be forwarded by the product shell");
  for (const profileMount of profileMounts) {
    assert.match(profileMount, /\bcoursesLoading\s*=\s*\{\s*coursesLoading\s*\}/);
    assert.match(profileMount, /\bcoursesError\s*=\s*\{\s*coursesError\s*\}/);
    assert.match(profileMount, /\bonRetryCourses\s*=\s*\{\s*(?:retryCourseData|\(\s*\)\s*=>\s*retryCourseData\(\s*\))\s*\}/);
    assert.match(profileMount, /\boverviewLoading\s*=\s*\{\s*overviewLoading\s*\}/);
    assert.match(profileMount, /\battemptsError\s*=\s*\{\s*overviewAttemptsError\s*\}/);
    assert.match(profileMount, /\bonRetryOverview\s*=\s*\{[^}]+\}/);
  }
  assert.match(dashboard, /coursesLoading\s*\??\s*:\s*boolean/);
  assert.match(dashboard, /coursesError\s*\??\s*:\s*string/);
  assert.match(dashboard, /onRetryCourses\s*\??\s*:\s*\(\s*\)\s*=>\s*void/);
});

test("restored-session claims and profile are fetched in parallel", async () => {
  const platform = await source("app/platform.tsx");
  const bootstrap = platform.slice(platform.indexOf("const validateShellSession"), platform.indexOf("const bootstrapOperationId"));

  assert.match(bootstrap, /Promise\.all\(\[/);
  assert.match(bootstrap, /supabase!\.auth\.getClaims\(accessToken\)/);
  assert.match(bootstrap, /supabase!\.from\("profiles"\)/);
  assert.match(bootstrap, /loadUserData\(verifiedUser, profileResult\.data/);
});

test("shell auth lifecycle invalidates late bootstrap and revalidates mutable Auth claims", async () => {
  const platform = await source("app/platform.tsx");
  assert.match(platform, /const bootstrapOperationId = \+\+authOperationRef\.current/);
  assert.match(platform, /const signedOutOperationId = \+\+authOperationRef\.current/);
  assert.match(platform, /interactiveAuthRef\.current = null/);
  assert.match(platform, /\["SIGNED_IN", "TOKEN_REFRESHED", "USER_UPDATED"\]/);
  assert.match(platform, /const eventOperationId = \+\+authOperationRef\.current/);
  assert.match(platform, /setCheckingSession\(true\)/);
  assert.match(platform, /authOperationRef\.current !== operationId/);
  assert.match(platform, /account_status,banned_until/);
  assert.match(platform, /const pendingValidationTimers = new Set<number>\(\)/);
  assert.match(platform, /window\.setTimeout\(\(\) => \{[\s\S]*?validateShellSession\(session, operationId\)/);
});

test("standalone auth guard hides stale children and validates active account state", async () => {
  const guard = await source("app/auth-guard.tsx");
  assert.match(guard, /setReady\(false\)/);
  assert.match(guard, /validatedScope !== validationScope/);
  assert.match(guard, /select\("role,status,account_status,banned_until"\)/);
  assert.match(guard, /isActiveProfileState\(profile\)/);
  assert.match(guard, /skipAuthProvider: true/);
  assert.match(guard, /window\.setTimeout\(\(\) => \{[\s\S]*?acceptSession\(session\)/);
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

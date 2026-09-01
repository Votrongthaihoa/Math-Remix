import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("login renders a Cloudflare Turnstile challenge with a stable action", async () => {
  const widget = await source("app/turnstile-login.tsx");
  assert.match(widget, /NEXT_PUBLIC_TURNSTILE_SITE_KEY/);
  assert.match(widget, /api\.js\?render=explicit/);
  assert.match(widget, /action: "login" \| "signup" \| "password_reset"/);
  assert.match(widget, /matchMedia\("\(max-width: 480px\)"\)\.matches \? "compact" : "flexible"/);
  assert.match(widget, /"expired-callback": \(\) => onTokenChange\(""\)/);
  assert.match(widget, /"error-callback": \(\) => onTokenChange\(""\)/);
});

test("signup renders Turnstile with its own stable action", async () => {
  const platform = await source("app/platform.tsx");
  assert.match(platform, /<TurnstileChallenge action="signup"/);
});

test("password login sends the CAPTCHA token to Supabase Auth and resets it", async () => {
  const platform = await source("app/platform.tsx");
  assert.match(platform, /if \(!turnstileToken\)/);
  assert.match(platform, /options: \{ captchaToken: turnstileToken \}/);
  assert.match(platform, /setTurnstileResetNonce\(value => value \+ 1\)/);
  assert.match(platform, /code\.includes\("captcha"\) \|\| message\.includes\("captcha"\)/);
});

test("the same-page widget lifecycle resets a redeemed token", async () => {
  const widget = await source("app/turnstile-login.tsx");
  assert.match(widget, /window\.turnstile\.reset\(widgetIdRef\.current\)/);
  assert.match(widget, /onTokenChange\(""\)/);
  assert.doesNotMatch(widget, /TURNSTILE_SECRET/);
});

test("remote smoke identities use admin-issued one-time sessions when CAPTCHA is enabled", async () => {
  const [helper, matrix, authRoute] = await Promise.all([
    source("scripts/smoke-auth.mjs"),
    source("scripts/staging-rls-matrix.mjs"),
    source("scripts/staging-auth-route-smoke.mjs"),
  ]);
  assert.match(helper, /admin\.auth\.admin\.generateLink/);
  assert.match(helper, /client\.auth\.verifyOtp/);
  assert.match(helper, /type: "email"/);
  assert.match(matrix, /createAdminIssuedSmokeSession/);
  assert.match(authRoute, /createAdminIssuedSmokeSession/);
  assert.doesNotMatch(matrix, /signInWithPassword/);
  assert.doesNotMatch(authRoute, /signInWithPassword/);
});

test("password recovery remains usable when Supabase CAPTCHA protection is enabled", async () => {
  const platform = await source("app/platform.tsx");
  assert.match(platform, /action="password_reset"/);
  assert.match(platform, /resetPasswordForEmail\(recoveryEmail\.trim\(\), \{/);
  assert.match(platform, /captchaToken: turnstileToken/);
  assert.match(platform, /Vui lòng hoàn tất xác minh chống spam trước khi gửi liên kết/);
});

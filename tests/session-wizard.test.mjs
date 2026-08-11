import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("the session wizard is reachable as a first-class admin route", async () => {
  const [page, platform, wizard] = await Promise.all([
    readFile(new URL("../app/[...slug]/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-session-wizard.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(page, /slug\.length === 3 && slug\[1\] === "sessions" && slug\[2\] === "new"/);
  assert.match(platform, /lazy\(\(\) => import\("\.\/admin-session-wizard"\)\)/);
  assert.match(platform, /window\.location\.pathname === "\/admin\/sessions\/new"/);
  assert.match(wizard, /\/api\/admin\/session-catalog/);
  assert.match(wizard, /\/api\/admin\/exam-policy/);
  assert.match(wizard, /action: "save_policy"/);
  assert.match(wizard, /action: "create_slot"/);
  assert.match(wizard, /role="listbox"/);
  assert.match(wizard, /Tạo kíp & sinh link/);
});

test("the session wizard supports a combined account and link session", async () => {
  const wizard = await readFile(new URL("../app/admin-session-wizard.tsx", import.meta.url), "utf8");

  assert.match(wizard, /form\.mode === "both"/);
  assert.match(wizard, /Tài khoản \+ Link\/QR/);
  assert.match(wizard, /audience: form\.mode === "both" \? "both" : "account"/);
  assert.match(wizard, /accountRequired: form\.mode === "both" \? false : true/);
  assert.match(wizard, /action: "create_slot"/);
});

test("exam access manages existing slots instead of creating a duplicate flow", async () => {
  const access = await readFile(new URL("../app/admin-exam-access.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(access, /action: "create_slot"/);
  assert.match(access, /slot-edit-form/);
  assert.match(access, /Kíp thi được tạo trong trình tạo chung/);
  assert.match(access, /slotId.*nextSlots\.some/);
});

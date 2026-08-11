import { spawn } from "node:child_process";
import { createClient } from "@supabase/supabase-js";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const baseUrl = process.env.E2E_BASE_URL;

if (!url || !serviceRoleKey) throw new Error("Supabase URL and service-role key are required");

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
const marker = `E2E RELEASE GATE ${suffix}`;
const password = `E2eGate-${suffix}-Aa9!`;
const identities = [
  { email: `e2e-admin-${suffix}@staging.invalid`, role: "admin", fullName: `E2E Admin ${suffix}` },
  { email: `e2e-student-${suffix}@staging.invalid`, role: "student", fullName: `E2E Student ${suffix}` },
];
const userIds = [];

async function createIdentity(identity) {
  const created = await admin.auth.admin.createUser({
    email: identity.email,
    password,
    email_confirm: true,
    user_metadata: { full_name: identity.fullName },
  });
  if (created.error || !created.data.user?.id) throw new Error(created.error?.message ?? "Could not create E2E identity");
  const userId = created.data.user.id;
  userIds.push(userId);
  const profile = await admin.from("profiles").upsert({
    id: userId,
    full_name: identity.fullName,
    role: identity.role,
    status: "active",
    account_status: "active",
  }, { onConflict: "id" });
  if (profile.error) throw new Error(profile.error.message);
}

async function cleanup() {
  const rooms = await admin.from("exam_rooms").select("id").eq("title", marker);
  for (const room of rooms.data ?? []) {
    const deleted = await admin.from("exam_rooms").delete().eq("id", room.id);
    if (deleted.error) console.error(`E2E room cleanup failed: ${deleted.error.message}`);
  }
  if (userIds.length) {
    const audits = await admin.from("exam_admin_audit_logs").delete().in("admin_id", userIds);
    if (audits.error) console.error(`E2E audit cleanup failed: ${audits.error.message}`);
    const profiles = await admin.from("profiles").delete().in("id", userIds);
    if (profiles.error) console.error(`E2E profile cleanup failed: ${profiles.error.message}`);
    for (const userId of userIds) {
      const deleted = await admin.auth.admin.deleteUser(userId);
      if (deleted.error) console.error(`E2E auth cleanup failed: ${deleted.error.message}`);
    }
  }
}

function runPlaywright(args) {
  return new Promise((resolve, reject) => {
    const childEnv = {
      ...process.env,
      E2E_ADMIN_EMAIL: identities[0].email,
      E2E_ADMIN_PASSWORD: password,
      E2E_STUDENT_EMAIL: identities[1].email,
      E2E_STUDENT_PASSWORD: password,
      E2E_TEST_MARKER: marker,
    };
    if (baseUrl) childEnv.E2E_BASE_URL = baseUrl;
    else delete childEnv.E2E_BASE_URL;
    const child = spawn(process.execPath, ["scripts/run-playwright.mjs", ...args], {
      cwd: process.cwd(),
      stdio: "inherit",
      env: childEnv,
    });
    child.on("error", reject);
    child.on("exit", (code, signal) => resolve(code ?? (signal ? 1 : 0)));
  });
}

try {
  for (const identity of identities) await createIdentity(identity);
  const code = await runPlaywright(process.argv.slice(2));
  process.exitCode = code;
} finally {
  await cleanup();
}

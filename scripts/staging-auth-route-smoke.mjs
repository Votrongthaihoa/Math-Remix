import assert from "node:assert/strict";
import net from "node:net";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import { createAdminIssuedSmokeSession } from "./smoke-auth.mjs";

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
if (!url || !publishableKey || !serviceRoleKey) throw new Error("Supabase URL and keys are required");

const admin = createClient(url, serviceRoleKey, { auth: { persistSession: false, autoRefreshToken: false } });
const publicClient = createClient(url, publishableKey, { auth: { persistSession: false, autoRefreshToken: false } });
const suffix = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
const email = `auth-route-${suffix}@staging.invalid`;
const password = `AuthRoute-${suffix}-Aa1!`;
let userId = null;
let server = null;
let serverOutput = "";

function freePort() {
  return new Promise((resolve, reject) => {
    const listener = net.createServer();
    listener.once("error", reject);
    listener.listen(0, "127.0.0.1", () => {
      const address = listener.address();
      const port = typeof address === "object" && address ? address.port : null;
      listener.close(error => error ? reject(error) : resolve(port));
    });
  });
}

async function waitForServer(baseUrl) {
  const deadline = Date.now() + 90_000;
  while (Date.now() < deadline) {
    try {
      const response = await fetch(`${baseUrl}/`, { signal: AbortSignal.timeout(3_000) });
      if (response.ok) return;
    } catch { /* server is still starting */ }
    await new Promise(resolve => setTimeout(resolve, 500));
  }
  throw new Error("local dev server did not become ready");
}

try {
  const configuredBaseUrl = process.env.AUTH_SMOKE_BASE_URL?.replace(/\/$/, "");
  let baseUrl = configuredBaseUrl;
  if (!baseUrl) {
    const port = await freePort();
    assert.ok(port);
    server = spawn(process.execPath, [
      fileURLToPath(new URL("../node_modules/vinext/dist/cli.js", import.meta.url)),
      "dev", "--host", "127.0.0.1", "--port", String(port),
    ], { cwd: process.cwd(), env: { ...process.env, PORT: String(port), VINEXT_CLOUDFLARE_DEV: "0" }, stdio: ["ignore", "pipe", "pipe"], shell: false });
    server.stdout.on("data", chunk => { serverOutput += chunk.toString(); });
    server.stderr.on("data", chunk => { serverOutput += chunk.toString(); });
    server.on("exit", code => { if (code !== 0) serverOutput += `\nserver exited with ${code}`; });
    baseUrl = `http://localhost:${port}`;
    try {
      await waitForServer(baseUrl);
    } catch (error) {
      throw new Error(`${error instanceof Error ? error.message : String(error)}\n${serverOutput.slice(-4000)}`);
    }
  }

  const created = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  assert.equal(created.error, null, created.error?.message ?? "failed to create auth smoke identity");
  userId = created.data.user?.id ?? null;
  assert.ok(userId);

  const profile = await admin.from("profiles").upsert({
    id: userId,
    full_name: "Auth route staging identity",
    role: "student",
    status: "active",
    account_status: "active",
  }, { onConflict: "id" });
  assert.equal(profile.error, null, profile.error?.message ?? "failed to prepare auth smoke profile");

  const session = await createAdminIssuedSmokeSession({ admin, client: publicClient, email });
  const token = session.access_token;

  const response = await fetch(`${baseUrl}/api/exams?scope=rooms`, {
    headers: { authorization: `Bearer ${token}`, "x-supabase-access-token": token },
  });
  const payload = await response.json().catch(() => ({}));
  assert.equal(response.status, 200, JSON.stringify(payload));
  assert.ok(Array.isArray(payload.rooms));
  console.log(JSON.stringify({ adminIssuedSmokeSession: "PASS", serverAuthentication: "PASS", examsRoute: "PASS", status: response.status }));
} finally {
  if (userId) {
    await admin.from("profiles").delete().eq("id", userId);
    await admin.auth.admin.deleteUser(userId);
  }
  if (server?.pid) {
    if (process.platform === "win32") spawn("taskkill", ["/PID", String(server.pid), "/T", "/F"], { stdio: "ignore" });
    else server.kill("SIGTERM");
  }
}

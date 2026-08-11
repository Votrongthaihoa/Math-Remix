import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const playwrightCli = resolve(repoRoot, "node_modules", "@playwright", "test", "cli.js");
const passthroughArgs = process.argv.slice(2);

function runPlaywright(env = process.env) {
  return spawn(process.execPath, [playwrightCli, "test", ...passthroughArgs], {
    cwd: repoRoot,
    env,
    stdio: "inherit",
  });
}

async function freePort() {
  const server = createServer();
  await new Promise((resolveListen, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolveListen);
  });
  const address = server.address();
  assert(address && typeof address === "object");
  const { port } = address;
  await new Promise((resolveClose, reject) => server.close(error => error ? reject(error) : resolveClose()));
  return port;
}

async function waitForServer(origin, child, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (child.exitCode !== null || child.signalCode !== null) throw new Error("Local Worker exited before Playwright started.");
    try {
      const response = await fetch(`${origin}/`);
      if (response.ok) return;
    } catch {
      // Wrangler needs a short startup window after the process is spawned.
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error(`Local Worker did not become ready at ${origin}.`);
}

async function stopServer(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([once(child, "exit"), new Promise(resolveWait => setTimeout(resolveWait, 5_000))]);
  if (child.exitCode === null && child.signalCode === null) {
    child.kill("SIGKILL");
    await Promise.race([once(child, "exit"), new Promise(resolveWait => setTimeout(resolveWait, 2_000))]);
  }
}

if (process.env.E2E_BASE_URL) {
  const playwright = runPlaywright();
  const [code] = await once(playwright, "exit");
  process.exitCode = typeof code === "number" ? code : 1;
} else {
  const port = await freePort();
  const origin = `http://127.0.0.1:${port}`;
  const worker = spawn(process.execPath, [
    resolve(repoRoot, "scripts", "start-worker.mjs"),
    "--port", String(port),
    "--log-level", "error",
    "--no-show-interactive-dev-session",
  ], {
    cwd: repoRoot,
    env: process.env,
    stdio: "inherit",
  });

  let playwright;
  const forwardSignal = signal => {
    playwright?.kill(signal);
    if (!worker.killed) worker.kill(signal);
  };
  process.once("SIGINT", () => forwardSignal("SIGINT"));
  process.once("SIGTERM", () => forwardSignal("SIGTERM"));

  try {
    await waitForServer(origin, worker);
    playwright = runPlaywright({ ...process.env, E2E_BASE_URL: origin });
    const [code] = await once(playwright, "exit");
    process.exitCode = typeof code === "number" ? code : 1;
  } finally {
    await stopServer(worker);
  }
}

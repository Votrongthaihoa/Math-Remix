import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { createServer } from "node:net";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");

async function freePort() {
  const server = createServer();
  server.unref();
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

async function waitForResponse(url, processState, timeoutMs = 30_000) {
  const deadline = Date.now() + timeoutMs;
  let lastError;
  while (Date.now() < deadline) {
    if (processState.exited) throw new Error(`Worker exited before becoming ready.\n${processState.output}`);
    try {
      const response = await fetch(url);
      if (response.ok) return response;
      lastError = new Error(`Worker returned ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await new Promise(resolveWait => setTimeout(resolveWait, 250));
  }
  throw new Error(`Worker did not become ready: ${lastError instanceof Error ? lastError.message : "timeout"}\n${processState.output}`);
}

async function stopProcess(child) {
  if (child.exitCode !== null || child.signalCode !== null) return;
  child.kill("SIGTERM");
  await Promise.race([
    once(child, "exit"),
    new Promise(resolveWait => setTimeout(resolveWait, 5_000)),
  ]);
  if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
}

const port = await freePort();
const origin = `http://127.0.0.1:${port}`;
const processState = { exited: false, output: "" };
const child = spawn(process.execPath, [
  resolve(repoRoot, "scripts", "start-worker.mjs"),
  "--port", String(port),
  "--log-level", "error",
  "--no-show-interactive-dev-session",
], {
  cwd: repoRoot,
  env: process.env,
  stdio: ["ignore", "pipe", "pipe"],
});

for (const stream of [child.stdout, child.stderr]) {
  stream.on("data", chunk => {
    processState.output = `${processState.output}${chunk}`.slice(-20_000);
  });
}
child.once("exit", () => { processState.exited = true; });

try {
  const rootResponse = await waitForResponse(`${origin}/`, processState);
  assert.match(rootResponse.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await rootResponse.text();
  const assetPath = html.match(/(?:src|href)="([^"?#]+\.js(?:\?[^"#]*)?)"/i)?.[1];
  assert(assetPath, "Root HTML must reference a JavaScript client asset");

  const assetResponse = await fetch(new URL(assetPath, origin));
  assert.equal(assetResponse.status, 200, `Client asset ${assetPath} must be served`);
  assert.match(assetResponse.headers.get("content-type") ?? "", /(?:java|ecma)script/i);
  console.log(`Worker runtime smoke passed on port ${port}: ${assetPath}`);
} finally {
  await stopProcess(child);
}

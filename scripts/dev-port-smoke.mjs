import { spawn } from "node:child_process";
import net from "node:net";
import path from "node:path";

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once("error", reject);
    server.listen(0, "127.0.0.1", () => {
      const address = server.address();
      const port = typeof address === "object" && address ? address.port : null;
      server.close((error) => error ? reject(error) : resolve(port));
    });
  });
}

const requestedPort = await freePort();
if (!requestedPort) throw new Error("could not allocate a free dev-server port");

const child = spawn(process.execPath, [
  path.join(process.cwd(), "node_modules", "vinext", "dist", "cli.js"),
  "dev",
  "--host",
  "127.0.0.1",
  "--port",
  String(requestedPort),
], {
  cwd: process.cwd(),
  env: { ...process.env, PORT: String(requestedPort), WRANGLER_LOG_PATH: ".wrangler/wrangler.log" },
  shell: false,
  stdio: ["ignore", "pipe", "pipe"],
});

let output = "";
let settled = false;
let probeInterval = null;
let actualPort = requestedPort;
let actualHost = "127.0.0.1";
let probeInFlight = false;

function stopChild() {
  if (process.platform === "win32" && child.pid) {
    spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], { stdio: "ignore" });
  } else if (child.exitCode === null) {
    child.kill("SIGTERM");
  }
}

function finish(code, message) {
  if (settled) return;
  settled = true;
  if (probeInterval) clearInterval(probeInterval);
  stopChild();
  if (code === 0) console.log(message);
  else console.error(message);
  setTimeout(() => process.exit(code), 100);
}

function discoverPort() {
  const urls = [...output.matchAll(/https?:\/\/(localhost|127\.0\.0\.1|\[::1\]):([0-9]+)/g)];
  const discovered = Number(urls.at(-1)?.[2]);
  const discoveredHost = urls.at(-1)?.[1];
  if (Number.isInteger(discovered) && discovered > 0 && discovered < 65536) actualPort = discovered;
  if (discoveredHost) actualHost = discoveredHost === "[::1]" ? "localhost" : discoveredHost;
}

async function probe() {
  if (probeInFlight || settled) return;
  probeInFlight = true;
  try {
    const response = await fetch(`http://${actualHost}:${actualPort}/`, { signal: AbortSignal.timeout(5000) });
    if (response.ok) finish(0, JSON.stringify({ requestedPort, actualHost, actualPort, status: response.status }));
  } catch {
    // The listener may still be starting.
  } finally {
    probeInFlight = false;
  }
}

function consume(chunk) {
  output += chunk.toString().replace(/\u001b\[[0-?]*[ -/]*[@-~]/g, "");
  discoverPort();
  void probe();
  if (output.length > 12000) output = output.slice(-12000);
}

child.stdout.on("data", consume);
child.stderr.on("data", consume);
child.on("error", (error) => finish(1, `dev server failed on ${actualPort}: ${error.message}`));
child.on("exit", (code) => {
  if (!settled) finish(code === 0 ? 1 : code ?? 1, `dev server exited before smoke probe; requestedPort=${requestedPort}, actualPort=${actualPort}, output=${output}`);
});

probeInterval = setInterval(() => void probe(), 500);
setTimeout(() => {
  if (!settled) finish(1, `dev server did not answer; requestedPort=${requestedPort}, actualHost=${actualHost}, actualPort=${actualPort}, output=${output}`);
}, 120_000);

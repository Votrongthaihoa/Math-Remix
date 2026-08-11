import { existsSync } from "node:fs";
import { spawn } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, resolve } from "node:path";

const repoRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const WORKER_CONFIG_RELATIVE_PATH = "dist/server/wrangler.json";
const workerConfig = resolve(repoRoot, ...WORKER_CONFIG_RELATIVE_PATH.split("/"));
const wranglerCli = resolve(repoRoot, "node_modules", "wrangler", "wrangler-dist", "cli.js");
const localEnv = resolve(repoRoot, ".env.local");
const wranglerState = resolve(repoRoot, ".wrangler");

if (!existsSync(workerConfig)) {
  console.error(`Missing ${WORKER_CONFIG_RELATIVE_PATH}. Run npm run build before npm start.`);
  process.exit(1);
}

if (!existsSync(wranglerCli)) {
  console.error("Missing local Wrangler installation. Run npm ci before npm start.");
  process.exit(1);
}

const args = ["--no-warnings", "--experimental-vm-modules", wranglerCli, "dev", "--config", workerConfig, ...process.argv.slice(2)];
if (existsSync(localEnv)) args.push("--env-file", localEnv);

const worker = spawn(process.execPath, args, {
  cwd: repoRoot,
  env: {
    ...process.env,
    XDG_CONFIG_HOME: process.env.XDG_CONFIG_HOME || resolve(wranglerState, "config"),
    WRANGLER_LOG_PATH: process.env.WRANGLER_LOG_PATH || resolve(wranglerState, "wrangler.log"),
  },
  stdio: "inherit",
});

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, () => {
    if (!worker.killed) worker.kill(signal);
  });
}

worker.on("error", error => {
  console.error(`Unable to start the generated Worker: ${error.message}`);
  process.exitCode = 1;
});

worker.on("exit", code => {
  process.exitCode = code ?? 1;
});

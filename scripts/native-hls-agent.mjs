import { randomUUID } from "node:crypto";
import { createWriteStream } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { basename, join } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";
import { spawn } from "node:child_process";
import { Transform } from "node:stream";
import { pipeline } from "node:stream/promises";
import { DEFAULT_FFMPEG_PATH, DEFAULT_API_ORIGIN } from "./encode-hls-native.mjs";

const DEFAULT_PORT = 49321;
const MAX_JSON_BYTES = 64 * 1024;
const MAX_INPUT_BYTES = 12 * 1024 * 1024 * 1024;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const TERMINAL_JOB_TTL_MS = 10 * 60 * 1000;
const AGENT_ORIGIN = `http://127.0.0.1:${DEFAULT_PORT}`;
const ENCODER_PATH = fileURLToPath(new URL("./encode-hls-native.mjs", import.meta.url));

const defaultWebOrigins = new Set([
  "https://mathremix.pro.vn",
  "https://www.mathremix.pro.vn",
]);

function isAllowedOrigin(origin, additionalOrigins = []) {
  if (!origin || origin === "null") return false;
  if (defaultWebOrigins.has(origin) || additionalOrigins.includes(origin)) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function normalizeOrigin(value, label) {
  const url = new URL(value);
  if (!/^https?:$/.test(url.protocol) || url.username || url.password || url.pathname !== "/" && url.pathname !== "") {
    throw new Error(`${label} must be an http(s) origin.`);
  }
  url.pathname = "";
  url.search = "";
  url.hash = "";
  return url.toString().replace(/\/$/, "");
}

function allowedApiOrigin(value, configuredOrigin) {
  const origin = normalizeOrigin(value, "apiOrigin");
  if (origin === configuredOrigin) return origin;
  const url = new URL(origin);
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") return origin;
  throw new Error("apiOrigin is not an approved Math Remix API origin.");
}

function parseArguments(argv) {
  const options = {
    port: Number(process.env.NATIVE_HLS_AGENT_PORT || DEFAULT_PORT),
    ffmpeg: process.env.FFMPEG_PATH || DEFAULT_FFMPEG_PATH,
    apiOrigin: normalizeOrigin(process.env.REMIX_API_ORIGIN || DEFAULT_API_ORIGIN, "REMIX_API_ORIGIN"),
    webOrigins: (process.env.NATIVE_HLS_AGENT_ALLOWED_ORIGINS || "")
      .split(",")
      .map(value => value.trim())
      .filter(Boolean),
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--port") {
      const port = Number(argv[++index]);
      if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error("--port must be between 1 and 65535.");
      options.port = port;
      continue;
    }
    if (argument === "--ffmpeg") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--ffmpeg needs a value.");
      options.ffmpeg = value;
      continue;
    }
    if (argument === "--api-origin") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--api-origin needs a value.");
      options.apiOrigin = normalizeOrigin(value, "--api-origin");
      continue;
    }
    if (argument === "--web-origin") {
      const value = argv[++index];
      if (!value || value.startsWith("--")) throw new Error("--web-origin needs a value.");
      options.webOrigins.push(normalizeOrigin(value, "--web-origin"));
      continue;
    }
    throw new Error(`Unsupported argument: ${argument}`);
  }
  return options;
}

function jsonHeaders(origin) {
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-allow-methods": "GET, POST, PUT, DELETE, OPTIONS",
    "access-control-allow-private-network": "true",
    "access-control-max-age": "600",
    "cache-control": "no-store",
    "content-type": "application/json; charset=utf-8",
    vary: "Origin",
    "x-content-type-options": "nosniff",
  };
}

function sendJson(response, status, payload, origin) {
  const body = JSON.stringify(payload);
  response.writeHead(status, { ...jsonHeaders(origin), "content-length": Buffer.byteLength(body) });
  response.end(body);
}

function sendEmpty(response, status, origin) {
  response.writeHead(status, jsonHeaders(origin));
  response.end();
}

async function readJson(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) throw new Error("Request body is too large.");
    chunks.push(chunk);
  }
  if (!chunks.length) return {};
  return JSON.parse(Buffer.concat(chunks).toString("utf8"));
}

function cleanFileName(value) {
  const fileName = basename(String(value || "")).trim();
  if (!fileName || !/\.mp4$/i.test(fileName)) throw new Error("Choose an MP4 file.");
  return fileName;
}

function validateJobRequest(body, configuredApiOrigin, authorizationHeader) {
  const videoId = String(body.videoId || "").trim();
  if (!VIDEO_ID_PATTERN.test(videoId)) throw new Error("Video ID must use 1-80 letters, numbers, hyphens, or underscores.");
  const fileName = cleanFileName(body.fileName);
  const fileSize = Number(body.fileSize);
  if (!Number.isSafeInteger(fileSize) || fileSize < 1 || fileSize > MAX_INPUT_BYTES) throw new Error("The MP4 size is not supported.");
  const accessToken = String(authorizationHeader || "").replace(/^Bearer\s+/i, "").trim();
  if (!accessToken) throw new Error("The signed-in admin session is missing.");
  const apiOrigin = allowedApiOrigin(String(body.apiOrigin || configuredApiOrigin), configuredApiOrigin);
  return { videoId, fileName, fileSize, accessToken, apiOrigin };
}

function publicJob(job) {
  return {
    id: job.id,
    status: job.status,
    stage: job.stage,
    progress: job.progress,
    bytesReceived: job.bytesReceived,
    totalBytes: job.totalBytes,
    fileName: job.fileName,
    error: job.error || "",
    uploadedFiles: job.uploadedFiles,
    totalFiles: job.totalFiles,
    logs: job.logs.slice(-8),
  };
}

function redact(value, token) {
  return (token ? value.replaceAll(token, "[redacted]") : value).trim();
}

function addLog(job, value) {
  const line = redact(value, job.accessToken);
  if (!line) return;
  job.logs.push(line);
  if (job.logs.length > 40) job.logs.splice(0, job.logs.length - 40);
  if (line.includes("[encode]")) {
    job.status = "encoding";
    job.stage = line.replace(/^.*?\[encode\]\s*/, "");
    job.progress = Math.max(job.progress, 15);
  } else if (line.includes("[upload]")) {
    job.status = "uploading";
    job.stage = line.replace(/^.*?\[upload\]\s*/, "");
    const match = line.match(/(\d+)\/(\d+)/);
    if (match) {
      job.uploadedFiles = Number(match[1]);
      job.totalFiles = Number(match[2]);
      job.progress = Math.min(99, 55 + Math.round((Number(match[1]) / Number(match[2])) * 44));
    }
    else job.progress = Math.max(job.progress, 55);
  } else if (line.includes("[setup]")) {
    job.status = "preparing";
    job.stage = line.replace(/^.*?\[setup\]\s*/, "");
    job.progress = Math.max(job.progress, 5);
  }
}

async function removeJobFiles(job) {
  await rm(job.directory, { recursive: true, force: true }).catch(() => undefined);
}

function scheduleJobCleanup(job) {
  const timer = setTimeout(() => {
    jobs.delete(job.id);
    void removeJobFiles(job);
  }, TERMINAL_JOB_TTL_MS);
  timer.unref?.();
}

async function streamInput(request, job) {
  const counter = new Transform({
    transform(chunk, encoding, callback) {
      job.bytesReceived += chunk.length;
      if (job.bytesReceived > job.totalBytes) {
        callback(new Error("Uploaded file is larger than declared."));
        return;
      }
      callback(null, chunk);
    },
  });
  await pipeline(request, counter, createWriteStream(job.inputPath, { flags: "wx" }));
  if (job.bytesReceived !== job.totalBytes) throw new Error("Uploaded file size does not match the selected MP4.");
  job.status = "ready";
  job.stage = "MP4 đã sẵn sàng. Nhấn bắt đầu để chạy FFmpeg native.";
  job.progress = 10;
}

function startJob(job, options) {
  if (job.status !== "ready") throw new Error("Upload the MP4 before starting the job.");
  job.status = "preparing";
  job.stage = "Đang khởi động FFmpeg native…";
  const child = spawn(process.execPath, [
    ENCODER_PATH,
    "--input", job.inputPath,
    "--video-id", job.videoId,
    "--api-origin", job.apiOrigin,
    "--ffmpeg", options.ffmpeg,
  ], {
    cwd: fileURLToPath(new URL("../", import.meta.url)),
    env: {
      ...process.env,
      REMIX_ACCESS_TOKEN: job.accessToken,
      REMIX_ACCESS_TOKEN_FILE: "",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  });
  job.child = child;
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => {
    for (const line of String(chunk).split(/\r?\n/)) addLog(job, line);
  });
  child.stderr.on("data", chunk => {
    for (const line of String(chunk).split(/\r?\n/)) addLog(job, line);
  });
  child.once("error", error => {
    job.status = "failed";
    job.error = `Không chạy được FFmpeg native: ${error.message}`;
    job.stage = "Quy trình đã dừng.";
    job.accessToken = "";
    scheduleJobCleanup(job);
  });
  child.once("close", code => {
    job.child = null;
    job.accessToken = "";
    if (job.status === "cancelled") {
      scheduleJobCleanup(job);
      return;
    }
    if (code === 0) {
      job.status = "done";
      job.progress = 100;
      job.stage = "Đã encode và upload xong bằng FFmpeg native.";
    } else {
      job.status = "failed";
      job.error = job.error || `FFmpeg native kết thúc với mã ${code ?? "unknown"}.`;
      job.stage = "Quy trình đã dừng.";
    }
    scheduleJobCleanup(job);
  });
}

const jobs = new Map();

function requestOrigin(request) {
  return request.headers.origin || "";
}

function authorizedOrigin(request, options) {
  const origin = requestOrigin(request);
  return isAllowedOrigin(origin, options.webOrigins) ? origin : null;
}

async function handleRequest(request, response, options) {
  const origin = authorizedOrigin(request, options);
  if (request.method === "OPTIONS") {
    if (!origin) {
      response.writeHead(403, { "cache-control": "no-store" });
      response.end();
      return;
    }
    sendEmpty(response, 204, origin);
    return;
  }
  if (!origin) {
    sendJson(response, 403, { error: "Origin is not allowed." }, "");
    return;
  }

  const url = new URL(request.url || "/", AGENT_ORIGIN);
  if (request.method === "GET" && url.pathname === "/health") {
    const check = await checkFfmpeg(options.ffmpeg);
    sendJson(response, check.ok ? 200 : 503, {
      agent: "native-hls-agent",
      ffmpeg: options.ffmpeg,
      ffmpegVersion: check.version,
      ready: check.ok,
    }, origin);
    return;
  }

  if (request.method === "POST" && url.pathname === "/jobs") {
    if ([...jobs.values()].some(job => !["done", "failed", "cancelled"].includes(job.status))) {
      sendJson(response, 409, { error: "Another native FFmpeg job is already running." }, origin);
      return;
    }
    try {
      const body = await readJson(request);
      const data = validateJobRequest(body, options.apiOrigin, request.headers.authorization);
      const directory = await mkdtemp(join(process.env.TEMP || process.env.TMP || ".", "mathremix-native-agent-"));
      const job = {
        id: randomUUID(),
        ...data,
        directory,
        inputPath: join(directory, "input.mp4"),
        status: "created",
        stage: "Đang chờ MP4…",
        progress: 0,
        bytesReceived: 0,
        totalBytes: data.fileSize,
        uploadedFiles: 0,
        totalFiles: 0,
        logs: [],
        error: "",
        child: null,
      };
      jobs.set(job.id, job);
      sendJson(response, 201, publicJob(job), origin);
    } catch (error) {
      sendJson(response, 400, { error: error instanceof Error ? error.message : "Invalid job request." }, origin);
    }
    return;
  }

  const inputMatch = url.pathname.match(/^\/jobs\/([0-9a-f-]+)\/input$/i);
  if (request.method === "PUT" && inputMatch) {
    const job = jobs.get(inputMatch[1]);
    if (!job) { sendJson(response, 404, { error: "Job not found." }, origin); return; }
    if (job.status !== "created") { sendJson(response, 409, { error: "This job no longer accepts an input file." }, origin); return; }
    try {
      await streamInput(request, job);
      sendJson(response, 200, publicJob(job), origin);
    } catch (error) {
      job.status = "failed";
      job.error = error instanceof Error ? error.message : "Could not save the MP4.";
      job.stage = "Không thể nhận file MP4.";
      await removeJobFiles(job);
      sendJson(response, 400, publicJob(job), origin);
      scheduleJobCleanup(job);
    }
    return;
  }

  const jobMatch = url.pathname.match(/^\/jobs\/([0-9a-f-]+)$/i);
  if (jobMatch) {
    const job = jobs.get(jobMatch[1]);
    if (!job) { sendJson(response, 404, { error: "Job not found." }, origin); return; }
    if (request.method === "GET") {
      sendJson(response, 200, publicJob(job), origin);
      return;
    }
    if (request.method === "POST") {
      try {
        startJob(job, options);
        sendJson(response, 202, publicJob(job), origin);
      } catch (error) {
        sendJson(response, 409, { error: error instanceof Error ? error.message : "Could not start the job." }, origin);
      }
      return;
    }
    if (request.method === "DELETE") {
      if (job.child && !job.child.killed) job.child.kill();
      job.status = "cancelled";
      job.stage = "Đã hủy.";
      job.accessToken = "";
      await removeJobFiles(job);
      scheduleJobCleanup(job);
      sendJson(response, 200, publicJob(job), origin);
      return;
    }
  }

  sendJson(response, 404, { error: "Not found." }, origin);
}

async function checkFfmpeg(command) {
  return await new Promise(resolve => {
    const child = spawn(command, ["-hide_banner", "-version"], { windowsHide: true, stdio: ["ignore", "pipe", "pipe"] });
    let output = "";
    child.stdout.setEncoding("utf8");
    child.stdout.on("data", chunk => { output += chunk; });
    child.once("error", error => resolve({ ok: false, version: error.message }));
    child.once("close", code => resolve({ ok: code === 0, version: output.split(/\r?\n/)[0] || `exit ${code ?? "unknown"}` }));
  });
}

function usage() {
  return `
Native FFmpeg agent for the Math Remix HLS web tool.

  npm.cmd run ffmpeg:agent
  npm.cmd run ffmpeg:agent -- --web-origin https://mathremix.pro.vn
`;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) { console.log(usage()); return; }
  const server = (await import("node:http")).createServer((request, response) => {
    void handleRequest(request, response, options).catch(error => {
      const origin = requestOrigin(request);
      sendJson(response, 500, { error: error instanceof Error ? error.message : "Agent request failed." }, origin);
    });
  });
  server.listen(options.port, "127.0.0.1", () => {
    console.log(`[agent] Native FFmpeg agent listening on http://127.0.0.1:${options.port}`);
    console.log(`[agent] Allowed web origins: ${[...defaultWebOrigins, ...options.webOrigins, "localhost/127.0.0.1 ports"].join(", ")}`);
  });
  const shutdown = () => {
    for (const job of jobs.values()) if (job.child && !job.child.killed) job.child.kill();
    server.close();
  };
  process.once("SIGINT", shutdown);
  process.once("SIGTERM", shutdown);
}

const isMain = process.argv[1] && pathToFileURL(process.argv[1]).href === import.meta.url;
if (isMain) main().catch(error => { console.error(`[agent:error] ${error instanceof Error ? error.message : String(error)}`); process.exitCode = 1; });

export {
  AGENT_ORIGIN,
  DEFAULT_PORT,
  isAllowedOrigin,
  normalizeOrigin,
  parseArguments,
  publicJob,
};

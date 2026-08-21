import { cpus } from "node:os";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";

const DEFAULT_FFMPEG_PATH = "C:\\ffmpeg\\bin\\ffmpeg.exe";
const DEFAULT_API_ORIGIN = "https://api.mathremix.pro.vn";
const HLS_SEGMENT_SECONDS = 6;
const HLS_UPLOAD_CONCURRENCY = 6;
const MAX_HLS_UPLOAD_BYTES = 4 * 1024 * 1024;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const RENDITIONS = [
  {
    name: "1080p",
    scale: "scale=1920:1080:force_original_aspect_ratio=decrease,pad=1920:1080:(ow-iw)/2:(oh-ih)/2",
    videoBitrate: "4500k",
    maxRate: "5000k",
    bufferSize: "9000k",
    audioBitrate: "160k",
  },
  {
    name: "720p",
    scale: "scale=1280:720:force_original_aspect_ratio=decrease,pad=1280:720:(ow-iw)/2:(oh-ih)/2",
    videoBitrate: "2500k",
    maxRate: "2800k",
    bufferSize: "5000k",
    audioBitrate: "128k",
  },
];

function usage() {
  return `
Encode HLS bằng FFmpeg native local rồi upload vào OneDrive HLS Vault.

Required:
  --input <file.mp4>       File MP4 local
  --video-id <id>          Mã video, chỉ gồm A-Z, a-z, 0-9, _ và -

Authentication:
  REMIX_ACCESS_TOKEN_FILE  File chứa Supabase access token của admin
  REMIX_ACCESS_TOKEN       Có thể dùng thay cho file (không khuyến nghị)

Optional:
  --api-origin <origin>    Mặc định REMIX_API_ORIGIN hoặc ${DEFAULT_API_ORIGIN}
  --ffmpeg <path>          Mặc định FFMPEG_PATH hoặc ${DEFAULT_FFMPEG_PATH}
  --threads <n>            Số luồng encode, mặc định số CPU - 1
  --keep-output            Giữ thư mục HLS tạm sau khi upload để kiểm tra
  --check-ffmpeg           Chỉ kiểm tra FFmpeg local, không cần input/token/API
  --help                   Hiển thị hướng dẫn này
`;
}

function requiredValue(argv, index, option) {
  const value = argv[index + 1];
  if (!value || value.startsWith("--")) throw new Error(`${option} cần một giá trị.`);
  return value;
}

function positiveInteger(value, option) {
  const parsed = Number(value);
  if (!Number.isInteger(parsed) || parsed < 1) throw new Error(`${option} phải là số nguyên dương.`);
  return parsed;
}

function normalizeOrigin(value) {
  const origin = new URL(value);
  if (!/^https?:$/.test(origin.protocol)) throw new Error("--api-origin phải dùng http hoặc https.");
  origin.pathname = "";
  origin.search = "";
  origin.hash = "";
  return origin.toString().replace(/\/$/, "");
}

function isFfmpegPath(value) {
  return value.startsWith(".") || value.startsWith("/") || /^[A-Za-z]:[\\/]/.test(value) || /[\\/]/.test(value);
}

function resolveFfmpegCommand(value) {
  return isFfmpegPath(value) ? resolve(value) : value;
}

function parseArguments(argv) {
  const options = {
    apiOrigin: normalizeOrigin(process.env.REMIX_API_ORIGIN || DEFAULT_API_ORIGIN),
    ffmpegPath: process.env.FFMPEG_PATH || DEFAULT_FFMPEG_PATH,
    inputPath: "",
    videoId: "",
    tokenFile: process.env.REMIX_ACCESS_TOKEN_FILE || "",
    directToken: process.env.REMIX_ACCESS_TOKEN || "",
    threads: Math.max(1, cpus().length - 1),
    keepOutput: false,
    checkFfmpeg: false,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--keep-output") {
      options.keepOutput = true;
      continue;
    }
    if (argument === "--check-ffmpeg") {
      options.checkFfmpeg = true;
      continue;
    }
    if (argument === "--input") {
      options.inputPath = resolve(requiredValue(argv, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--video-id") {
      options.videoId = requiredValue(argv, index, argument).trim();
      index += 1;
      continue;
    }
    if (argument === "--api-origin") {
      options.apiOrigin = normalizeOrigin(requiredValue(argv, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--ffmpeg") {
      options.ffmpegPath = resolveFfmpegCommand(requiredValue(argv, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--threads") {
      options.threads = positiveInteger(requiredValue(argv, index, argument), argument);
      index += 1;
      continue;
    }
    if (argument === "--access-token-file") {
      options.tokenFile = resolve(requiredValue(argv, index, argument));
      index += 1;
      continue;
    }
    if (argument === "--access-token") {
      options.directToken = requiredValue(argv, index, argument);
      index += 1;
      continue;
    }
    throw new Error(`Tham số không được hỗ trợ: ${argument}`);
  }

  if (!options.checkFfmpeg) {
    if (!options.inputPath) throw new Error("Thiếu --input <file.mp4>.");
    if (!options.videoId || !VIDEO_ID_PATTERN.test(options.videoId)) {
      throw new Error("Thiếu hoặc sai --video-id. Chỉ dùng 1-80 ký tự A-Z, a-z, 0-9, _ và -.");
    }
  }
  return options;
}

function cleanToken(value) {
  return value.replace(/^Bearer\s+/i, "").trim();
}

async function accessToken(options) {
  if (options.tokenFile) {
    const token = cleanToken(await readFile(options.tokenFile, "utf8"));
    if (token) return token;
    throw new Error(`File token rỗng: ${options.tokenFile}`);
  }
  const token = cleanToken(options.directToken);
  if (token) return token;
  throw new Error("Thiếu access token. Hãy đặt REMIX_ACCESS_TOKEN_FILE hoặc REMIX_ACCESS_TOKEN.");
}

function apiUrl(origin, pathname) {
  return `${origin}${pathname}`;
}

async function apiFetch(origin, token, pathname, init = {}) {
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${token}`);
  headers.set("cache-control", "no-store");
  return fetch(apiUrl(origin, pathname), { ...init, headers });
}

async function responseMessage(response, fallback) {
  const payload = await response.json().catch(() => null);
  if (payload && typeof payload === "object" && typeof payload.error === "string") return payload.error;
  return fallback;
}

async function prepareVault(options, token) {
  const response = await apiFetch(options.apiOrigin, token, "/api/admin/hls-vault/upload", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ action: "prepare", videoId: options.videoId }),
  });
  if (!response.ok) throw new Error(await responseMessage(response, "Không chuẩn bị được thư mục OneDrive HLS."));
}

async function requestMediaKey(options, token) {
  const response = await apiFetch(options.apiOrigin, token, "/api/admin/hls-vault/key", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ videoId: options.videoId }),
  });
  if (!response.ok) throw new Error(await responseMessage(response, "Không lấy được khóa HLS từ máy chủ."));
  const key = new Uint8Array(await response.arrayBuffer());
  if (key.byteLength !== 16) {
    key.fill(0);
    throw new Error("Máy chủ trả về khóa HLS không hợp lệ.");
  }
  return key;
}

function hlsContentType(relativePath) {
  return relativePath.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t";
}

function retryableStatus(status) {
  return status === 408 || status === 429 || status === 500 || status === 502 || status === 503 || status === 504;
}

function wait(milliseconds) {
  return new Promise(resolvePromise => setTimeout(resolvePromise, milliseconds));
}

async function uploadFile(options, token, outputDir, relativePath, completed, total) {
  const localPath = join(outputDir, ...relativePath.split("/"));
  const bytes = await readFile(localPath);
  if (!bytes.byteLength || bytes.byteLength > MAX_HLS_UPLOAD_BYTES) {
    throw new Error(`File HLS ${relativePath} phải từ 1 byte đến 4 MB.`);
  }

  for (let attempt = 0; attempt < 3; attempt += 1) {
    const form = new FormData();
    form.set("videoId", options.videoId);
    form.set("path", relativePath);
    form.set("file", new Blob([bytes], { type: hlsContentType(relativePath) }), basename(localPath));
    let response;
    try {
      response = await apiFetch(options.apiOrigin, token, "/api/admin/hls-vault/upload", {
        method: "POST",
        body: form,
      });
    } catch (error) {
      if (attempt === 2) throw error;
      await wait(500 * 2 ** attempt);
      continue;
    }
    if (response.ok) {
      completed.value += 1;
      console.log(`[upload] ${completed.value}/${total} ${relativePath}`);
      return;
    }
    const message = await responseMessage(response, `OneDrive từ chối ${relativePath}.`);
    if (!retryableStatus(response.status) || attempt === 2) throw new Error(message);
    await wait(500 * 2 ** attempt);
  }
}

async function runConcurrent(items, limit, worker) {
  let cursor = 0;
  let failure = null;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (!failure) {
      const index = cursor;
      cursor += 1;
      if (index >= items.length) return;
      try {
        await worker(items[index], index);
      } catch (error) {
        failure = error;
        throw error;
      }
    }
  });
  await Promise.all(workers);
}

function masterManifest() {
  return [
    "#EXTM3U",
    "#EXT-X-VERSION:3",
    "#EXT-X-INDEPENDENT-SEGMENTS",
    "#EXT-X-STREAM-INF:BANDWIDTH=5200000,AVERAGE-BANDWIDTH=4660000,RESOLUTION=1920x1080",
    "1080p/index.m3u8",
    "#EXT-X-STREAM-INF:BANDWIDTH=3100000,AVERAGE-BANDWIDTH=2628000,RESOLUTION=1280x720",
    "720p/index.m3u8",
    "",
  ].join("\n");
}

async function runFfmpeg(ffmpegPath, arguments_, label) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(ffmpegPath, arguments_, {
      stdio: ["ignore", "ignore", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    let settled = false;
    child.stderr?.setEncoding("utf8");
    child.stderr?.on("data", chunk => {
      stderr = `${stderr}${chunk}`.slice(-4000);
    });
    child.once("error", error => {
      if (settled) return;
      settled = true;
      rejectPromise(new Error(`Không chạy được FFmpeg (${ffmpegPath}): ${error.message}`));
    });
    child.once("close", code => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolvePromise();
        return;
      }
      const detail = stderr.trim().split(/\r?\n/).slice(-3).join(" ");
      rejectPromise(new Error(`FFmpeg encode ${label} thất bại (mã ${code ?? "unknown"})${detail ? `: ${detail}` : "."}`));
    });
  });
}

function ffmpegPreflightArguments() {
  return [
    "-hide_banner", "-nostdin", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=16x16:r=1",
    "-frames:v", "1", "-f", "null", "-",
  ];
}

function ffmpegArguments(inputPath, outputDir, keyInfoPath, rendition, threads) {
  const renditionDir = join(outputDir, rendition.name);
  return [
    "-hide_banner", "-nostdin", "-loglevel", "warning", "-y",
    "-i", inputPath,
    "-map", "0:v:0", "-map", "0:a:0?",
    "-vf", rendition.scale,
    "-c:v", "libx264", "-threads", String(threads), "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p",
    "-b:v", rendition.videoBitrate, "-maxrate", rendition.maxRate, "-bufsize", rendition.bufferSize,
    "-c:a", "aac", "-b:a", rendition.audioBitrate, "-ar", "48000", "-ac", "2",
    "-force_key_frames", `expr:gte(t,n_forced*${HLS_SEGMENT_SECONDS})`, "-sc_threshold", "0",
    "-hls_time", String(HLS_SEGMENT_SECONDS), "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
    "-hls_segment_filename", join(renditionDir, "seg_%05d.ts"),
    "-hls_key_info_file", keyInfoPath,
    join(renditionDir, "index.m3u8"),
  ];
}

async function renditionFiles(outputDir, rendition) {
  const renditionDir = join(outputDir, rendition.name);
  const entries = await readdir(renditionDir, { withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile() && (entry.name === "index.m3u8" || /^seg_[0-9]{1,10}\.ts$/.test(entry.name)))
    .map(entry => `${rendition.name}/${entry.name}`)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  if (!files.includes(`${rendition.name}/index.m3u8`) || !files.some(file => file.endsWith(".ts"))) {
    throw new Error(`FFmpeg không tạo đủ file cho ${rendition.name}.`);
  }
  return files;
}

async function verifyInput(inputPath) {
  await access(inputPath);
  const inputStats = await stat(inputPath);
  if (!inputStats.isFile()) throw new Error(`Input không phải file: ${inputPath}`);
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  if (options.help) {
    console.log(usage());
    return;
  }

  const ffmpegPath = resolveFfmpegCommand(options.ffmpegPath);
  if (isFfmpegPath(ffmpegPath)) await access(ffmpegPath);
  if (options.checkFfmpeg) {
    await runFfmpeg(ffmpegPath, ffmpegPreflightArguments(), "preflight");
    console.log(`[check] FFmpeg hoạt động: ${ffmpegPath}`);
    return;
  }

  await verifyInput(options.inputPath);
  const token = await accessToken(options);
  const outputDir = await mkdtemp(join(process.env.TEMP || process.env.TMP || ".", `mathremix-hls-${options.videoId}-`));
  const keyPath = join(outputDir, "hls.key");
  const keyInfoPath = join(outputDir, "hls-key-info.txt");
  let mediaKey = null;

  try {
    console.log(`[setup] FFmpeg: ${ffmpegPath}`);
    console.log(`[setup] API: ${options.apiOrigin}`);
    console.log(`[setup] Chuẩn bị VideoVault/${options.videoId}/…`);
    await prepareVault(options, token);
    mediaKey = await requestMediaKey(options, token);
    await writeFile(keyPath, mediaKey, { mode: 0o600 });
    await writeFile(keyInfoPath, `https://hls-key.invalid/key/${options.videoId}\n${keyPath.replaceAll("\\", "/")}\n`, "utf8");

    for (const rendition of RENDITIONS) {
      const renditionDir = join(outputDir, rendition.name);
      await mkdir(renditionDir, { recursive: true });
      console.log(`[encode] ${rendition.name} (${options.threads} luồng)…`);
      await runFfmpeg(ffmpegPath, ffmpegArguments(options.inputPath, outputDir, keyInfoPath, rendition, options.threads), rendition.name);
    }

    const files = [];
    for (const rendition of RENDITIONS) files.push(...await renditionFiles(outputDir, rendition));
    const total = files.length + 1;
    const completed = { value: 0 };
    console.log(`[upload] ${files.length} manifest/segment, ${HLS_UPLOAD_CONCURRENCY} luồng…`);
    await runConcurrent(files, HLS_UPLOAD_CONCURRENCY, relativePath => uploadFile(options, token, outputDir, relativePath, completed, total));

    await writeFile(join(outputDir, "master.m3u8"), masterManifest(), "utf8");
    await uploadFile(options, token, outputDir, "master.m3u8", completed, total);
    console.log(`[done] VideoVault/${options.videoId}/ đã sẵn sàng. Tạo resource hls_vault với videoId này trong lesson.`);
    if (options.keepOutput) console.log(`[done] Giữ output local tại: ${outputDir}`);
  } finally {
    mediaKey?.fill(0);
    await unlink(keyPath).catch(() => undefined);
    await unlink(keyInfoPath).catch(() => undefined);
    if (!options.keepOutput) await rm(outputDir, { recursive: true, force: true });
  }
}

const isMain = process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url;
if (isMain) {
  main().catch(error => {
    console.error(`[error] ${error instanceof Error ? error.message : String(error)}`);
    process.exitCode = 1;
  });
}

export {
  DEFAULT_FFMPEG_PATH,
  DEFAULT_API_ORIGIN,
  HLS_UPLOAD_CONCURRENCY,
  RENDITIONS,
  ffmpegArguments,
  masterManifest,
  parseArguments,
};

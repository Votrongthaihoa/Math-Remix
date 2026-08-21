import { cpus } from "node:os";
import { createHash } from "node:crypto";
import { basename, join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import {
  access,
  mkdtemp,
  readFile,
  readdir,
  rm,
  stat,
  unlink,
  writeFile,
} from "node:fs/promises";
import { spawn } from "node:child_process";
import { createReadStream } from "node:fs";

const DEFAULT_FFMPEG_PATH = "C:\\ffmpeg\\bin\\ffmpeg.exe";
const DEFAULT_API_ORIGIN = "https://api.mathremix.pro.vn";
const HLS_UPLOAD_CONCURRENCY = 6;
const MAX_HLS_UPLOAD_BYTES = 4 * 1024 * 1024;
const VIDEO_ID_PATTERN = /^[A-Za-z0-9_-]{1,80}$/;
const HLS_MANIFEST_NAME = "index.m3u8";
const DEFAULT_FFPROBE_PATH = "C:\\ffmpeg\\bin\\ffprobe.exe";
const DEFAULT_COPY_MAX_VIDEO_BITRATE = 8_000_000;
const DEFAULT_VIDEO_SETTINGS = {
  hwAccel: "auto",
  maxWidth: 1920,
  maxHeight: 1080,
  encoder: "h264_nvenc",
  cpuFallback: "libx264",
  nvencPreset: "p5",
  nvencTune: "hq",
  videoBitrate: "5000k",
  videoMaxrate: "5500k",
  videoBufsize: "10000k",
  audioBitrate: "128k",
  segmentSeconds: 6,
  allowUpscale: false,
  copyMaxVideoBitrate: DEFAULT_COPY_MAX_VIDEO_BITRATE,
};

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
  --ffprobe <path>         Mặc định FFPROBE_PATH hoặc ${DEFAULT_FFPROBE_PATH}
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

function sha256Hex(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

function bitrateToBits(value, fallback) {
  const match = String(value || "").trim().match(/^(\d+(?:\.\d+)?)([kKmMgG]?)$/);
  if (!match) return fallback;
  const multiplier = match[2].toLowerCase() === "g" ? 1_000_000_000 : match[2].toLowerCase() === "m" ? 1_000_000 : match[2].toLowerCase() === "k" ? 1_000 : 1;
  return Math.max(1, Math.round(Number(match[1]) * multiplier));
}

function parseVideoSettings(env = process.env) {
  const hwAccel = ["auto", "cuda", "none"].includes(env.VIDEO_HW_ACCEL) ? env.VIDEO_HW_ACCEL : DEFAULT_VIDEO_SETTINGS.hwAccel;
  const encoder = ["auto", "h264_nvenc", "libx264"].includes(env.VIDEO_ENCODER) ? env.VIDEO_ENCODER : DEFAULT_VIDEO_SETTINGS.encoder;
  const cpuFallback = env.VIDEO_CPU_FALLBACK === "libx264" ? "libx264" : DEFAULT_VIDEO_SETTINGS.cpuFallback;
  const nvencPreset = /^p[1-7]$/.test(env.NVENC_PRESET || "") ? env.NVENC_PRESET : DEFAULT_VIDEO_SETTINGS.nvencPreset;
  const nvencTune = /^[a-z0-9_-]{1,20}$/.test(env.NVENC_TUNE || "") ? env.NVENC_TUNE : DEFAULT_VIDEO_SETTINGS.nvencTune;
  const maxHeight = Number.isInteger(Number(env.VIDEO_MAX_HEIGHT)) && Number(env.VIDEO_MAX_HEIGHT) > 0 ? Number(env.VIDEO_MAX_HEIGHT) : DEFAULT_VIDEO_SETTINGS.maxHeight;
  const segmentSeconds = Number.isInteger(Number(env.HLS_SEGMENT_TIME)) && Number(env.HLS_SEGMENT_TIME) > 0 ? Number(env.HLS_SEGMENT_TIME) : DEFAULT_VIDEO_SETTINGS.segmentSeconds;
  const videoBitrate = /^\d+(?:\.\d+)?[kKmMgG]?$/.test(env.VIDEO_BITRATE || "") ? env.VIDEO_BITRATE : DEFAULT_VIDEO_SETTINGS.videoBitrate;
  const videoMaxrate = /^\d+(?:\.\d+)?[kKmMgG]?$/.test(env.VIDEO_MAXRATE || "") ? env.VIDEO_MAXRATE : DEFAULT_VIDEO_SETTINGS.videoMaxrate;
  const videoBufsize = /^\d+(?:\.\d+)?[kKmMgG]?$/.test(env.VIDEO_BUFSIZE || "") ? env.VIDEO_BUFSIZE : DEFAULT_VIDEO_SETTINGS.videoBufsize;
  const audioBitrate = /^\d+(?:\.\d+)?[kKmMgG]?$/.test(env.AUDIO_BITRATE || "") ? env.AUDIO_BITRATE : DEFAULT_VIDEO_SETTINGS.audioBitrate;
  return {
    ...DEFAULT_VIDEO_SETTINGS,
    hwAccel,
    maxHeight,
    encoder,
    cpuFallback,
    nvencPreset,
    nvencTune,
    videoBitrate,
    videoMaxrate,
    videoBufsize,
    audioBitrate,
    segmentSeconds,
    allowUpscale: /^(1|true|yes)$/i.test(env.VIDEO_ALLOW_UPSCALE || ""),
    copyMaxVideoBitrate: bitrateToBits(env.VIDEO_COPY_MAX_BITRATE, DEFAULT_COPY_MAX_VIDEO_BITRATE),
  };
}

function numericProbeValue(value) {
  const number = Number(value);
  return Number.isFinite(number) && number > 0 ? number : null;
}

function parseProbePayload(payload) {
  const streams = Array.isArray(payload?.streams) ? payload.streams : [];
  const video = streams.find(stream => stream?.codec_type === "video") || {};
  const audio = streams.find(stream => stream?.codec_type === "audio") || null;
  return {
    videoCodec: typeof video.codec_name === "string" ? video.codec_name.toLowerCase() : "",
    width: numericProbeValue(video.width),
    height: numericProbeValue(video.height),
    videoBitrate: numericProbeValue(video.bit_rate),
    audioCodec: audio && typeof audio.codec_name === "string" ? audio.codec_name.toLowerCase() : "",
    audioSampleRate: audio ? numericProbeValue(audio.sample_rate) : null,
    audioChannels: audio ? numericProbeValue(audio.channels) : null,
    audioBitrate: audio ? numericProbeValue(audio.bit_rate) : null,
    durationSeconds: numericProbeValue(payload?.format?.duration),
  };
}

function isCopyCompatible(probe, settings) {
  const maxWidth = settings.maxWidth || 1920;
  const maxHeight = settings.maxHeight || 1080;
  const maxVideoBitrate = settings.copyMaxVideoBitrate || settings.maxVideoBitrate || DEFAULT_COPY_MAX_VIDEO_BITRATE;
  return probe.videoCodec === "h264"
    && Number.isFinite(probe.width) && probe.width <= maxWidth
    && Number.isFinite(probe.height) && probe.height <= maxHeight
    && (!probe.videoBitrate || probe.videoBitrate <= maxVideoBitrate)
    && (!probe.audioCodec || probe.audioCodec === "aac");
}

function chooseVideoMode(probe, settings, capabilities) {
  if (probe && isCopyCompatible(probe, settings)) return "copy";
  if (settings.encoder !== "libx264" && capabilities.nvenc) return "nvenc";
  return "libx264";
}

function parseArguments(argv) {
  const options = {
    apiOrigin: normalizeOrigin(process.env.REMIX_API_ORIGIN || DEFAULT_API_ORIGIN),
    ffmpegPath: process.env.FFMPEG_PATH || DEFAULT_FFMPEG_PATH,
    ffprobePath: process.env.FFPROBE_PATH || DEFAULT_FFPROBE_PATH,
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
    if (argument === "--ffprobe") {
      options.ffprobePath = resolveFfmpegCommand(requiredValue(argv, index, argument));
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

function parseFfmpegProgressLine(line) {
  const value = String(line).trim();
  const clockMatch = value.match(/^out_time=(\d+):(\d{2}):(\d{2})(?:\.(\d+))?$/);
  if (clockMatch) {
    const fraction = clockMatch[4] ? Number(`0.${clockMatch[4]}`) : 0;
    return {
      elapsedSeconds: Number(clockMatch[1]) * 3600 + Number(clockMatch[2]) * 60 + Number(clockMatch[3]) + fraction,
    };
  }
  const microsecondsMatch = value.match(/^out_time_(?:us|ms)=(-?\d+)$/);
  if (microsecondsMatch) return { elapsedSeconds: Math.max(0, Number(microsecondsMatch[1]) / 1_000_000) };
  return null;
}

function formatFfmpegProgressTime(seconds) {
  const totalSeconds = Math.max(0, Math.floor(Number(seconds) || 0));
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const remainingSeconds = totalSeconds % 60;
  return [hours, minutes, remainingSeconds].map(value => String(value).padStart(2, "0")).join(":");
}

async function runFfmpeg(ffmpegPath, arguments_, label, onProgress = () => undefined) {
  await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(ffmpegPath, arguments_, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stderr = "";
    let stdoutBuffer = "";
    let lastProgressSeconds = -1;
    let settled = false;
    const processProgressLine = line => {
      const progress = parseFfmpegProgressLine(line);
      if (!progress || progress.elapsedSeconds <= lastProgressSeconds) return;
      lastProgressSeconds = progress.elapsedSeconds;
      onProgress(progress);
    };
    child.stdout?.setEncoding("utf8");
    child.stdout?.on("data", chunk => {
      stdoutBuffer += String(chunk);
      const lines = stdoutBuffer.split(/\r?\n/);
      stdoutBuffer = lines.pop() || "";
      for (const line of lines) processProgressLine(line);
    });
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
      if (stdoutBuffer) processProgressLine(stdoutBuffer);
      if (code === 0) {
        resolvePromise();
        return;
      }
      const detail = stderr.trim().split(/\r?\n/).slice(-3).join(" ");
      rejectPromise(new Error(`FFmpeg encode ${label} thất bại (mã ${code ?? "unknown"})${detail ? `: ${detail}` : "."}`));
    });
  });
}

function parseFfmpegCapabilities(output) {
  const encoders = String(output?.encoders || "");
  const hwaccels = String(output?.hwaccels || "");
  const filters = String(output?.filters || "");
  return {
    nvenc: /(?:^|\s)h264_nvenc(?:\s|$)/m.test(encoders),
    cuda: /(?:^|\s)cuda(?:\s|$)/m.test(hwaccels),
    scaleCuda: /(?:^|\s)scale_cuda(?:\s|$)/m.test(filters),
  };
}

async function runCommandOutput(command, arguments_, label) {
  return await new Promise((resolvePromise, rejectPromise) => {
    const child = spawn(command, arguments_, {
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    });
    let stdout = "";
    let stderr = "";
    let settled = false;
    child.stdout?.setEncoding("utf8");
    child.stderr?.setEncoding("utf8");
    child.stdout?.on("data", chunk => { stdout = `${stdout}${chunk}`.slice(-2_000_000); });
    child.stderr?.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-8_000); });
    child.once("error", error => {
      if (settled) return;
      settled = true;
      rejectPromise(new Error(`KhÃ´ng cháº¡y Ä‘Æ°á»£c ${label} (${command}): ${error.message}`));
    });
    child.once("close", code => {
      if (settled) return;
      settled = true;
      if (code === 0) {
        resolvePromise({ stdout, stderr });
        return;
      }
      const detail = stderr.trim().split(/\r?\n/).slice(-3).join(" ");
      rejectPromise(new Error(`${label} tháº¥t báº¡i (mÃ£ ${code ?? "unknown"})${detail ? `: ${detail}` : "."}`));
    });
  });
}

async function probeInput(ffprobePath, inputPath) {
  const result = await runCommandOutput(ffprobePath, [
    "-v", "error", "-show_entries", "stream=codec_type,codec_name,width,height,bit_rate,sample_rate,channels:format=duration", "-of", "json", inputPath,
  ], "FFprobe");
  try {
    return parseProbePayload(JSON.parse(result.stdout));
  } catch {
    throw new Error("FFprobe tráº£ vá» dá»¯ liá»‡u khÃ´ng há»£p lá»‡.");
  }
}

async function detectFfmpegCapabilities(ffmpegPath) {
  const [encoders, hwaccels, filters] = await Promise.all([
    runCommandOutput(ffmpegPath, ["-hide_banner", "-encoders"], "FFmpeg encoders").catch(() => ({ stdout: "", stderr: "" })),
    runCommandOutput(ffmpegPath, ["-hide_banner", "-hwaccels"], "FFmpeg hwaccels").catch(() => ({ stdout: "", stderr: "" })),
    runCommandOutput(ffmpegPath, ["-hide_banner", "-filters"], "FFmpeg filters").catch(() => ({ stdout: "", stderr: "" })),
  ]);
  return parseFfmpegCapabilities({
    encoders: `${encoders.stdout}\n${encoders.stderr}`,
    hwaccels: `${hwaccels.stdout}\n${hwaccels.stderr}`,
    filters: `${filters.stdout}\n${filters.stderr}`,
  });
}

function ffmpegPreflightArguments() {
  return [
    "-hide_banner", "-nostdin", "-loglevel", "error",
    "-f", "lavfi", "-i", "color=c=black:s=16x16:r=1",
    "-frames:v", "1", "-f", "null", "-",
  ];
}

function outputDimensions(probe, settings) {
  const inputWidth = Math.max(2, Math.round(Number(probe?.width) || settings.maxWidth));
  const inputHeight = Math.max(2, Math.round(Number(probe?.height) || settings.maxHeight));
  const scale = settings.allowUpscale
    ? Math.min(settings.maxWidth / inputWidth, settings.maxHeight / inputHeight)
    : Math.min(1, settings.maxWidth / inputWidth, settings.maxHeight / inputHeight);
  return {
    width: Math.max(2, Math.floor((inputWidth * scale) / 2) * 2),
    height: Math.max(2, Math.floor((inputHeight * scale) / 2) * 2),
  };
}

function scaleFilter(probe, settings, useCuda) {
  if (!probe) return `${useCuda ? "scale_cuda" : "scale"}=w='min(${settings.maxWidth},iw)':h='min(${settings.maxHeight},ih)':force_original_aspect_ratio=decrease`;
  const dimensions = outputDimensions(probe, settings);
  return `${useCuda ? "scale_cuda" : "scale"}=${dimensions.width}:${dimensions.height}`;
}

function ffmpegArguments(inputPath, outputDir, keyInfoPath, mode, settings, threads, capabilities = {}, probe = null) {
  const useCuda = mode === "nvenc" && capabilities.cuda && capabilities.scaleCuda;
  const arguments_ = [
    "-hide_banner", "-nostdin", "-loglevel", "warning", "-progress", "pipe:1", "-stats_period", "1", "-y",
  ];
  if (useCuda) arguments_.push("-hwaccel", "cuda", "-hwaccel_output_format", "cuda");
  arguments_.push("-i", inputPath, "-map", "0:v:0", "-map", "0:a:0?");
  if (mode === "copy") {
    arguments_.push("-c", "copy");
  } else {
    arguments_.push("-vf", scaleFilter(probe, settings, useCuda));
    if (mode === "nvenc") {
      arguments_.push(
        "-c:v", "h264_nvenc", "-preset", settings.nvencPreset, "-tune", settings.nvencTune,
        "-rc", "vbr", "-b:v", settings.videoBitrate, "-maxrate", settings.videoMaxrate, "-bufsize", settings.videoBufsize,
        ...(useCuda ? [] : ["-pix_fmt", "yuv420p"]), "-g", "60",
      );
    } else {
      arguments_.push("-c:v", "libx264", "-threads", String(threads), "-preset", "medium", "-crf", "20", "-pix_fmt", "yuv420p");
    }
    arguments_.push(
      "-c:a", "aac", "-b:a", settings.audioBitrate, "-ar", "48000", "-ac", "2",
      "-force_key_frames", `expr:gte(t,n_forced*${settings.segmentSeconds})`, "-sc_threshold", "0",
    );
  }
  arguments_.push(
    "-hls_time", String(settings.segmentSeconds), "-hls_playlist_type", "vod", "-hls_flags", "independent_segments",
    "-hls_segment_filename", join(outputDir, "seg_%05d.ts"),
    "-hls_key_info_file", keyInfoPath,
    join(outputDir, HLS_MANIFEST_NAME),
  );
  return arguments_;
}

async function outputFiles(outputDir) {
  const entries = await readdir(outputDir, { withFileTypes: true });
  const files = entries
    .filter(entry => entry.isFile() && (entry.name === HLS_MANIFEST_NAME || /^seg_[0-9]{1,10}\.ts$/.test(entry.name)))
    .map(entry => entry.name)
    .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
  if (!files.includes(HLS_MANIFEST_NAME) || !files.some(file => file.endsWith(".ts"))) {
    throw new Error("FFmpeg không tạo đủ index.m3u8 và segment HLS.");
  }
  return files;
}

async function clearHlsOutput(outputDir) {
  const entries = await readdir(outputDir, { withFileTypes: true }).catch(() => []);
  await Promise.all(entries
    .filter(entry => entry.isFile() && (entry.name === HLS_MANIFEST_NAME || /^seg_[0-9]{1,10}\.ts$/.test(entry.name)))
    .map(entry => unlink(join(outputDir, entry.name)).catch(() => undefined)));
}

function progressLine(label, progress, durationSeconds) {
  const elapsed = formatFfmpegProgressTime(progress.elapsedSeconds);
  const percentage = durationSeconds && durationSeconds > 0
    ? ` (${Math.min(100, Math.max(0, Math.round((progress.elapsedSeconds / durationSeconds) * 100)))}%)`
    : "";
  return `[progress] ${label} ${elapsed}${percentage}`;
}

async function runVideoPipeline({ ffmpegPath, inputPath, outputDir, keyInfoPath, settings, probe, capabilities, threads }) {
  const durationSeconds = probe?.durationSeconds || 0;
  const run = async (mode, useGpu = false) => {
    const label = mode === "copy" ? "stream-copy" : useGpu ? "NVENC CUDA" : mode === "nvenc" ? "NVENC CPU decode" : "libx264 CPU";
    const args = ffmpegArguments(
      inputPath,
      outputDir,
      keyInfoPath,
      mode,
      settings,
      threads,
      useGpu ? capabilities : { cuda: false, scaleCuda: false },
      probe,
    );
    await runFfmpeg(ffmpegPath, args, label, progress => console.log(progressLine(label, progress, durationSeconds)));
    return label;
  };

  let mode = chooseVideoMode(probe, settings, capabilities);
  if (mode === "copy") {
    try {
      console.log("[mode] stream-copy");
      return await run("copy");
    } catch (error) {
      console.log(`[fallback] stream-copy failed: ${error instanceof Error ? error.message : String(error)}`);
      await clearHlsOutput(outputDir);
      mode = capabilities.nvenc ? "nvenc" : settings.cpuFallback;
    }
  }

  if (mode === "nvenc" && capabilities.nvenc) {
    if (settings.hwAccel !== "none" && capabilities.cuda && capabilities.scaleCuda) {
      try {
        console.log("[mode] NVIDIA NVENC + CUDA");
        return await run("nvenc", true);
      } catch (error) {
        console.log(`[fallback] NVDEC/CUDA failed: ${error instanceof Error ? error.message : String(error)}`);
        await clearHlsOutput(outputDir);
      }
    }
    try {
      console.log("[mode] NVIDIA NVENC");
      return await run("nvenc");
    } catch (error) {
      console.log(`[fallback] NVENC failed: ${error instanceof Error ? error.message : String(error)}`);
      await clearHlsOutput(outputDir);
    }
  }

  console.log("[mode] libx264 CPU fallback");
  return await run("libx264");
}

async function verifyInput(inputPath) {
  await access(inputPath);
  const inputStats = await stat(inputPath);
  if (!inputStats.isFile()) throw new Error(`Input không phải file: ${inputPath}`);
}

async function hashInput(inputPath) {
  const hash = createHash("sha256");
  for await (const chunk of createReadStream(inputPath)) hash.update(chunk);
  return hash.digest("hex");
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
    const capabilities = await detectFfmpegCapabilities(ffmpegPath);
    console.log(`[check] NVENC=${capabilities.nvenc ? "yes" : "no"} CUDA=${capabilities.cuda ? "yes" : "no"} scale_cuda=${capabilities.scaleCuda ? "yes" : "no"}`);
    return;
  }

  await verifyInput(options.inputPath);
  const inputHash = await hashInput(options.inputPath);
  console.log(`[hash] SHA-256 ${inputHash}`);
  const settings = parseVideoSettings(process.env);
  let probe = null;
  try {
    probe = await probeInput(resolveFfmpegCommand(options.ffprobePath), options.inputPath);
    console.log(`[probe] ${probe.videoCodec || "unknown"} ${probe.width || "?"}x${probe.height || "?"}${probe.audioCodec ? ` + ${probe.audioCodec}` : ""}`);
  } catch (error) {
    console.log(`[probe] FFprobe unavailable: ${error instanceof Error ? error.message : String(error)}`);
  }
  const capabilities = await detectFfmpegCapabilities(ffmpegPath);
  console.log(`[capability] NVENC=${capabilities.nvenc ? "yes" : "no"} CUDA=${capabilities.cuda ? "yes" : "no"} scale_cuda=${capabilities.scaleCuda ? "yes" : "no"}`);
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

    await runVideoPipeline({ ffmpegPath, inputPath: options.inputPath, outputDir, keyInfoPath, settings, probe, capabilities, threads: options.threads });

    const files = await outputFiles(outputDir);
    const total = files.length;
    const completed = { value: 0 };
    console.log(`[upload] ${files.length} manifest/segment, ${HLS_UPLOAD_CONCURRENCY} luồng…`);
    await runConcurrent(files, HLS_UPLOAD_CONCURRENCY, relativePath => uploadFile(options, token, outputDir, relativePath, completed, total));

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
  DEFAULT_FFPROBE_PATH,
  DEFAULT_FFMPEG_PATH,
  DEFAULT_API_ORIGIN,
  HLS_UPLOAD_CONCURRENCY,
  chooseVideoMode,
  ffmpegArguments,
  parseFfmpegCapabilities,
  parseProbePayload,
  parseFfmpegProgressLine,
  parseVideoSettings,
  sha256Hex,
  parseArguments,
};

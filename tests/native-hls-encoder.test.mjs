import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("native HLS encoder uses local FFmpeg and the existing protected upload contract", async () => {
  const [script, packageJson, docs] = await Promise.all([
    readFile(new URL("../scripts/encode-hls-native.mjs", import.meta.url), "utf8"),
    readFile(new URL("../package.json", import.meta.url), "utf8"),
    readFile(new URL("../docs/onedrive-hls-vault-setup.md", import.meta.url), "utf8"),
  ]);

  assert.match(script, /C:\\\\ffmpeg\\\\bin\\\\ffmpeg\.exe/);
  assert.match(script, /spawn/);
  assert.match(script, /HLS_UPLOAD_CONCURRENCY\s*=\s*6/);
  assert.match(script, /\/api\/admin\/hls-vault\/key/);
  assert.match(script, /\/api\/admin\/hls-vault\/upload/);
  assert.match(script, /authorization/i);
  assert.doesNotMatch(script, /MEDIA_MASTER_KEY_HEX/);
  assert.match(packageJson, /"encode:hls:native"\s*:/);
  assert.match(packageJson, /"ffmpeg:agent"\s*:/);
  assert.match(docs, /encode-hls-native\.mjs/);
  assert.match(docs, /--check-ffmpeg/);
});

test("native HLS encoder supports an FFmpeg-only preflight", async () => {
  const { parseArguments } = await import("../scripts/encode-hls-native.mjs");
  const options = parseArguments(["--check-ffmpeg"]);

  assert.equal(options.checkFfmpeg, true);
});

test("native HLS encoder accepts an FFmpeg executable from PATH", async () => {
  const { parseArguments } = await import("../scripts/encode-hls-native.mjs");
  const options = parseArguments(["--check-ffmpeg", "--ffmpeg", "ffmpeg"]);

  assert.equal(options.ffmpegPath, "ffmpeg");
});

test("native HLS encoder parses FFmpeg live progress timestamps", async () => {
  const { parseFfmpegProgressLine } = await import("../scripts/encode-hls-native.mjs");

  assert.deepEqual(parseFfmpegProgressLine("out_time=00:31:20.40"), { elapsedSeconds: 1880.4 });
});

test("native HLS encoder asks FFmpeg to stream progress", async () => {
  const { ffmpegArguments, parseVideoSettings } = await import("../scripts/encode-hls-native.mjs");
  const arguments_ = ffmpegArguments("input.mp4", "output", "hls-key-info.txt", "copy", parseVideoSettings({}), 4);
  const progressIndex = arguments_.indexOf("-progress");

  assert.deepEqual(arguments_.slice(progressIndex, progressIndex + 2), ["-progress", "pipe:1"]);
});

test("native HLS encoder selects stream-copy for compatible H.264 input", async () => {
  const { chooseVideoMode, parseProbePayload } = await import("../scripts/encode-hls-native.mjs");
  const probe = parseProbePayload({ streams: [
    { codec_type: "video", codec_name: "h264", width: 1920, height: 1080, bit_rate: "5000000" },
    { codec_type: "audio", codec_name: "aac", sample_rate: "48000", channels: 2 },
  ] });

  assert.equal(chooseVideoMode(probe, { encoder: "auto", maxWidth: 1920, maxHeight: 1080, maxVideoBitrate: 8_000_000 }, { nvenc: true }), "copy");
});

test("native HLS encoder reads the single-rendition video settings from the environment", async () => {
  const { parseVideoSettings } = await import("../scripts/encode-hls-native.mjs");
  const settings = parseVideoSettings({
    VIDEO_HW_ACCEL: "auto",
    VIDEO_MAX_HEIGHT: "1080",
    VIDEO_ENCODER: "h264_nvenc",
    VIDEO_CPU_FALLBACK: "libx264",
    NVENC_PRESET: "p5",
    NVENC_TUNE: "hq",
    VIDEO_BITRATE: "5000k",
    VIDEO_MAXRATE: "5500k",
    VIDEO_BUFSIZE: "10000k",
    AUDIO_BITRATE: "128k",
    HLS_SEGMENT_TIME: "6",
    VIDEO_ALLOW_UPSCALE: "false",
  });

  assert.deepEqual(settings, {
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
    copyMaxVideoBitrate: 8000000,
  });
});

test("native HLS encoder creates one encrypted HLS index without an upscale", async () => {
  const { ffmpegArguments } = await import("../scripts/encode-hls-native.mjs");
  const arguments_ = ffmpegArguments("input.mp4", "output", "hls-key-info.txt", "nvenc", {
    maxWidth: 1920,
    maxHeight: 1080,
    videoBitrate: "5000k",
    videoMaxrate: "5500k",
    videoBufsize: "10000k",
    audioBitrate: "128k",
    segmentSeconds: 6,
    nvencPreset: "p5",
    nvencTune: "hq",
  }, 11, { cuda: true, scaleCuda: true });

  assert.equal(arguments_.at(-1), "output\\index.m3u8");
  assert.equal(arguments_.includes("720p"), false);
  assert.equal(arguments_.includes("master.m3u8"), false);
  assert.equal(arguments_[arguments_.indexOf("-c:v") + 1], "h264_nvenc");
  assert.match(arguments_[arguments_.indexOf("-vf") + 1], /min\(1920/);
  assert.match(arguments_[arguments_.indexOf("-hls_segment_filename") + 1], /output\\seg_%05d\.ts$/);
});

test("native HLS encoder keeps CUDA frames on the GPU for NVENC", async () => {
  const { ffmpegArguments, parseVideoSettings } = await import("../scripts/encode-hls-native.mjs");
  const arguments_ = ffmpegArguments("input.mp4", "output", "hls-key-info.txt", "nvenc", parseVideoSettings({}), 11, { cuda: true, scaleCuda: true }, { width: 3840, height: 2160 });

  assert.equal(arguments_.includes("yuv420p"), false);
  assert.deepEqual(arguments_.slice(arguments_.indexOf("-hwaccel"), arguments_.indexOf("-hwaccel") + 4), ["-hwaccel", "cuda", "-hwaccel_output_format", "cuda"]);
});

test("native HLS encoder detects NVENC and CUDA capabilities from FFmpeg output", async () => {
  const { parseFfmpegCapabilities } = await import("../scripts/encode-hls-native.mjs");

  assert.deepEqual(parseFfmpegCapabilities({
    encoders: " V....D h264_nvenc NVIDIA NVENC H.264 encoder",
    hwaccels: "cuda\ndxva2",
    filters: " ... scale_cuda V->V",
  }), { nvenc: true, cuda: true, scaleCuda: true });
});

test("native HLS encoder keeps the source duration for live progress", async () => {
  const { parseProbePayload } = await import("../scripts/encode-hls-native.mjs");
  const probe = parseProbePayload({
    streams: [{ codec_type: "video", codec_name: "h264", width: 1280, height: 720 }],
    format: { duration: "42.5" },
  });

  assert.equal(probe.durationSeconds, 42.5);
});

test("native HLS encoder falls back to libx264 when NVENC is unavailable", async () => {
  const { chooseVideoMode, ffmpegArguments, parseProbePayload } = await import("../scripts/encode-hls-native.mjs");
  const probe = parseProbePayload({ streams: [{ codec_type: "video", codec_name: "hevc", width: 3840, height: 2160 }] });
  const settings = { encoder: "h264_nvenc", maxWidth: 1920, maxHeight: 1080, videoBitrate: "5000k", videoMaxrate: "5500k", videoBufsize: "10000k", audioBitrate: "128k", segmentSeconds: 6, nvencPreset: "p5", nvencTune: "hq" };
  const mode = chooseVideoMode(probe, settings, { nvenc: false });
  const arguments_ = ffmpegArguments("input.mp4", "output", "hls-key-info.txt", mode, settings, 11);

  assert.equal(mode, "libx264");
  assert.equal(arguments_[arguments_.indexOf("-c:v") + 1], "libx264");
  assert.equal(arguments_[arguments_.indexOf("-preset") + 1], "medium");
  assert.equal(arguments_[arguments_.indexOf("-crf") + 1], "20");
});

test("native HLS encoder hashes input bytes with SHA-256", async () => {
  const { sha256Hex } = await import("../scripts/encode-hls-native.mjs");

  assert.equal(sha256Hex(new TextEncoder().encode("Math Remix")), "5ea5998e5e46f7bb0c062476f1449e85ea582e94ef03f43703f4ba9d32011506");
});

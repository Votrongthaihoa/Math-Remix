import assert from "node:assert/strict";
import test from "node:test";

test("native HLS agent allows only approved web origins", async () => {
  const { isAllowedOrigin } = await import("../scripts/native-hls-agent.mjs");

  assert.equal(isAllowedOrigin("https://mathremix.pro.vn"), true);
  assert.equal(isAllowedOrigin("https://www.mathremix.pro.vn"), true);
  assert.equal(isAllowedOrigin("http://localhost:5175"), true);
  assert.equal(isAllowedOrigin("https://evil.example"), false);
  assert.equal(isAllowedOrigin(""), false);
});

test("native HLS agent exposes live FFmpeg progress as the current stage", async () => {
  const { addLog } = await import("../scripts/native-hls-agent.mjs");
  const job = {
    accessToken: "secret",
    logs: [],
    status: "preparing",
    stage: "",
    progress: 0,
    uploadedFiles: 0,
    totalFiles: 0,
  };

  addLog(job, "[progress] 1080p 00:31:20");

  assert.equal(job.status, "encoding");
  assert.equal(job.stage, "1080p 00:31:20");
  assert.equal(job.progress, 15);
});

test("native HLS agent exposes the selected single-rendition mode", async () => {
  const { addLog } = await import("../scripts/native-hls-agent.mjs");
  const job = { accessToken: "secret", logs: [], status: "preparing", stage: "", progress: 0, mode: "" };

  addLog(job, "[mode] NVIDIA NVENC + CUDA");

  assert.equal(job.status, "encoding");
  assert.equal(job.stage, "NVIDIA NVENC + CUDA");
  assert.equal(job.mode, "NVIDIA NVENC + CUDA");
  assert.equal(job.progress, 15);
});

test("native HLS agent forwards an explicit FFprobe executable", async () => {
  const { parseArguments } = await import("../scripts/native-hls-agent.mjs");

  assert.equal(parseArguments(["--ffprobe", "ffprobe"]).ffprobe, "ffprobe");
});

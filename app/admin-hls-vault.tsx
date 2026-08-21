"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ArrowUpToLine, CheckCircle2, Cpu, FileVideo, LoaderCircle, RefreshCw, ShieldCheck, UploadCloud } from "lucide-react";
import Link from "next/link";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { activeSessionToken, authenticatedFetch } from "../lib/auth-client";
import { apiRequestUrl } from "../lib/api-url";
import { clearAttachedBytes } from "../lib/hls-upload";
import "./admin-hls-vault.css";

type RunState = "idle" | "loading" | "encoding" | "uploading" | "done" | "error";
type EncoderMode = "native" | "browser";
type NativeAgentStatus = "checking" | "ready" | "offline";
type NativeJob = {
  id: string;
  status: string;
  stage: string;
  progress: number;
  bytesReceived: number;
  totalBytes: number;
  uploadedFiles: number;
  totalFiles: number;
  mode?: string;
  error?: string;
  logs?: string[];
};
type FfmpegFile = { name: string; isDir: boolean };
type FfmpegEventPayload = { progress?: number; message?: string };
type FfmpegLoadOptions = { coreURL: string; wasmURL: string; workerURL?: string };
type FfmpegLike = {
  load: (options: FfmpegLoadOptions) => Promise<void>;
  on: (event: "progress" | "log", callback: (payload: FfmpegEventPayload) => void) => void;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  exec: (arguments_: string[]) => Promise<number>;
  listDir: (path: string) => Promise<FfmpegFile[]>;
  readFile: (path: string) => Promise<Uint8Array | string>;
  deleteFile: (path: string) => Promise<void>;
  terminate?: () => void;
};

const CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core-mt@0.12.10/dist/umd";
const CORE_FALLBACK_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
const HLS_SEGMENT_SECONDS = 6;
const HLS_UPLOAD_CONCURRENCY = 6;
const NATIVE_AGENT_ORIGIN = "http://127.0.0.1:49321";
const SINGLE_RENDITION = {
  name: "1080p",
  scale: "scale=w='min(1920,iw)':h='min(1080,ih)':force_original_aspect_ratio=decrease:force_divisible_by=2",
  audioBitrate: "128k",
} as const;

function formatBytes(value: number) {
  if (!value) return "0 B";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDuration(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "—";
  const minutes = Math.floor(seconds / 60);
  const remaining = Math.floor(seconds % 60).toString().padStart(2, "0");
  return `${minutes}:${remaining}`;
}

function asBytes(value: Uint8Array | string) {
  if (typeof value !== "string") return value;
  return new TextEncoder().encode(value);
}

function errorMessage(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
}

function createConcurrencyLimiter(limit: number) {
  let active = 0;
  const waiters: Array<() => void> = [];
  return async function run<T>(task: () => Promise<T>) {
    if (active >= limit) await new Promise<void>(resolve => waiters.push(resolve));
    active += 1;
    try {
      return await task();
    } finally {
      active -= 1;
      waiters.shift()?.();
    }
  };
}

function canUseMultithreadCore() {
  return typeof window !== "undefined" && window.crossOriginIsolated && typeof SharedArrayBuffer !== "undefined";
}

function hardwareConcurrency() {
  if (typeof navigator === "undefined" || !Number.isFinite(navigator.hardwareConcurrency)) return 2;
  return Math.max(1, Math.floor(navigator.hardwareConcurrency));
}

function encoderThreadCount(multithread: boolean, encoderCount: number) {
  if (!multithread) return 1;
  return Math.max(1, Math.floor(Math.max(1, hardwareConcurrency() - 1) / Math.max(1, encoderCount)));
}

async function ffmpegLoadOptions(multithread: boolean): Promise<FfmpegLoadOptions> {
  const baseUrl = multithread ? CORE_BASE_URL : CORE_FALLBACK_BASE_URL;
  const [coreURL, wasmURL, workerURL] = await Promise.all([
    toBlobURL(`${baseUrl}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${baseUrl}/ffmpeg-core.wasm`, "application/wasm"),
    multithread ? toBlobURL(`${baseUrl}/ffmpeg-core.worker.js`, "text/javascript") : Promise.resolve(undefined),
  ]);
  return { coreURL, wasmURL, ...(workerURL ? { workerURL } : {}) };
}

async function loadFfmpeg(instance: FfmpegLike, multithread: boolean, options?: FfmpegLoadOptions) {
  await instance.load(options ?? await ffmpegLoadOptions(multithread));
}

async function createFfmpeg(
  multithread: boolean,
  onProgress: (payload: FfmpegEventPayload) => void,
  onLog: (payload: FfmpegEventPayload) => void,
  loadOptions?: FfmpegLoadOptions,
) {
  const ffmpegModule = await import("@ffmpeg/ffmpeg");
  const instance = new ffmpegModule.FFmpeg() as unknown as FfmpegLike;
  instance.on("progress", onProgress);
  instance.on("log", onLog);
  try {
    await loadFfmpeg(instance, multithread, loadOptions);
  } catch (error) {
    instance.terminate?.();
    throw error;
  }
  return instance;
}

export default function AdminHlsVault() {
  const [file, setFile] = useState<File | null>(null);
  const [videoId, setVideoId] = useState("lesson01");
  const [encoderMode, setEncoderMode] = useState<EncoderMode>("native");
  const [nativeAgentStatus, setNativeAgentStatus] = useState<NativeAgentStatus>("checking");
  const [nativeAgentVersion, setNativeAgentVersion] = useState("");
  const [state, setState] = useState<RunState>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [stage, setStage] = useState("Chọn MP4 để bắt đầu.");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ffmpegLog, setFfmpegLog] = useState("");
  const [duration, setDuration] = useState(0);
  const ffmpegRefs = useRef<FfmpegLike[]>([]);
  const progressValuesRef = useRef<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  const checkNativeAgent = useCallback(async () => {
    setNativeAgentStatus("checking");
    try {
      const response = await fetch(`${NATIVE_AGENT_ORIGIN}/health`, { headers: { accept: "application/json" }, cache: "no-store" });
      const payload = await response.json().catch(() => null) as { ready?: boolean; ffmpegVersion?: string } | null;
      if (!response.ok || !payload?.ready) throw new Error("Agent chưa sẵn sàng.");
      setNativeAgentVersion(payload.ffmpegVersion || "FFmpeg native");
      setNativeAgentStatus("ready");
      return true;
    } catch {
      setNativeAgentVersion("");
      setNativeAgentStatus("offline");
      return false;
    }
  }, []);

  useEffect(() => {
    if (encoderMode !== "native") return;
    const timer = window.setTimeout(() => { void checkNativeAgent(); }, 0);
    return () => window.clearTimeout(timer);
  }, [checkNativeAgent, encoderMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.crossOriginIsolated || new URL(window.location.href).searchParams.get("isolated") === "1") return;
    const url = new URL(window.location.href);
    url.searchParams.set("isolated", "1");
    window.location.replace(url.toString());
  }, []);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const next = event.target.files?.[0] ?? null;
    const isMp4 = Boolean(next && (next.type === "video/mp4" || (!next.type && next.name.toLowerCase().endsWith(".mp4"))));
    setFile(isMp4 ? next : null);
    setDuration(0);
    setNotice("");
    setError(next && !isMp4 ? "Hãy chọn file MP4 hợp lệ." : "");
    setStage(isMp4 ? "Đã chọn file. Sẵn sàng encode trên máy này." : "Chọn MP4 để bắt đầu.");
  }

  function reset() {
    if (state === "loading" || state === "encoding" || state === "uploading") return;
    setFile(null);
    setState("idle");
    setProgress(0);
    setUploadedFiles(0);
    setTotalFiles(0);
    setStage("Chọn MP4 để bắt đầu.");
    setNotice("");
    setError("");
    setFfmpegLog("");
    setDuration(0);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function nativeApiOrigin() {
    const apiUrl = apiRequestUrl("/api/admin/hls-vault/upload");
    return new URL(String(apiUrl), window.location.href).origin;
  }

  async function nativeJobRequest(jobId: string, method: "GET" | "POST" | "DELETE" = "GET") {
    const response = await fetch(`${NATIVE_AGENT_ORIGIN}/jobs/${encodeURIComponent(jobId)}`, {
      method,
      headers: { accept: "application/json" },
      cache: "no-store",
    });
    const payload = await response.json().catch(() => null) as NativeJob | { error?: string } | null;
    if (!response.ok) throw new Error(payload && "error" in payload && payload.error ? payload.error : "Không đọc được trạng thái FFmpeg native.");
    return payload as NativeJob;
  }

  async function waitForNativeJob(jobId: string, normalizedVideoId: string) {
    while (true) {
      const job = await nativeJobRequest(jobId);
      setProgress(Math.min(100, Math.max(0, job.progress || 0)));
      setUploadedFiles(job.uploadedFiles || 0);
      setTotalFiles(job.totalFiles || 0);
      setStage(job.stage || "FFmpeg native đang xử lý…");
      setFfmpegLog(job.logs?.at(-1) || "");
      if (job.status === "done") {
        setState("done");
        setProgress(100);
        setStage("Đã encode và upload xong bằng FFmpeg native.");
        setNotice(`OneDrive đã có VideoVault/${normalizedVideoId}/. Bước tiếp theo: tạo resource trong trình soạn khóa học.`);
        return;
      }
      if (["failed", "cancelled"].includes(job.status)) throw new Error(job.error || "Encode FFmpeg native thất bại.");
      setState(job.status === "uploading" ? "uploading" : job.status === "encoding" ? "encoding" : "loading");
      await new Promise(resolve => setTimeout(resolve, 900));
    }
  }

  async function startNative(normalizedVideoId: string) {
    let jobId = "";
    try {
      const agentReady = nativeAgentStatus === "ready" || await checkNativeAgent();
      if (!agentReady) throw new Error("Chưa kết nối được local FFmpeg agent. Hãy chạy `npm.cmd run ffmpeg:agent` trên máy này rồi thử lại.");
      setStage("Đang kết nối local FFmpeg agent…");
      const token = await activeSessionToken();
      const createResponse = await fetch(`${NATIVE_AGENT_ORIGIN}/jobs`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          apiOrigin: nativeApiOrigin(),
          fileName: file!.name,
          fileSize: file!.size,
          videoId: normalizedVideoId,
        }),
      });
      const created = await createResponse.json().catch(() => null) as NativeJob | { error?: string } | null;
      if (!createResponse.ok || !created || !("id" in created)) throw new Error(created && "error" in created && created.error ? created.error : "Không tạo được native FFmpeg job.");
      jobId = created.id;
      setStage("Đang chuyển MP4 vào local agent…");
      const inputResponse = await fetch(`${NATIVE_AGENT_ORIGIN}/jobs/${encodeURIComponent(jobId)}/input`, {
        method: "PUT",
        headers: { "content-type": file!.type || "video/mp4" },
        body: file,
      });
      const uploaded = await inputResponse.json().catch(() => null) as NativeJob | { error?: string } | null;
      if (!inputResponse.ok) throw new Error(uploaded && "error" in uploaded && uploaded.error ? uploaded.error : "Không chuyển được MP4 vào local agent.");
      setProgress(10);
      setStage("MP4 đã sẵn sàng. Đang khởi động FFmpeg native…");
      await nativeJobRequest(jobId, "POST");
      await waitForNativeJob(jobId, normalizedVideoId);
    } catch (value) {
      if (jobId) await nativeJobRequest(jobId, "DELETE").catch(() => undefined);
      setState("error");
      setError(value instanceof Error ? value.message : "Encode FFmpeg native thất bại.");
      setStage("Quy trình đã dừng. Kiểm tra local agent rồi thử lại.");
    }
  }

  async function getFfmpeg(index: number, multithread: boolean, loadOptions: FfmpegLoadOptions) {
    const existing = ffmpegRefs.current[index];
    if (existing) return existing;
    const instance = await createFfmpeg(
      multithread,
      payload => {
        const values = progressValuesRef.current;
        if (!values.length) return;
        values[index] = Math.min(100, Math.max(0, Math.round((payload.progress ?? 0) * 100)));
        setProgress(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length));
      },
      payload => {
        if (payload.message) setFfmpegLog(payload.message.slice(-180));
      },
      loadOptions,
    );
    ffmpegRefs.current[index] = instance;
    return instance;
  }

  async function prepareEncoder(ffmpeg: FfmpegLike, inputBytes: Uint8Array, mediaKey: Uint8Array, videoId: string) {
    await ffmpeg.writeFile("input.mp4", inputBytes.slice());
    const ffmpegKey = new Uint8Array(mediaKey);
    try {
      await ffmpeg.writeFile("hls.key", ffmpegKey);
    } finally {
      clearAttachedBytes(ffmpegKey);
    }
    await ffmpeg.writeFile("hls-key-info.txt", new TextEncoder().encode(`https://hls-key.invalid/key/${videoId}\n/hls.key\n`));
    const entries = await ffmpeg.listDir("/").catch(() => []);
    await Promise.all(entries.filter(entry => !entry.isDir && (entry.name === "index.m3u8" || /^seg_[0-9]{1,10}\.ts$/.test(entry.name))).map(entry => ffmpeg.deleteFile(entry.name).catch(() => undefined)));
  }

  async function encodeRendition(ffmpeg: FfmpegLike, rendition: typeof SINGLE_RENDITION, threads: number) {
    const exitCode = await ffmpeg.exec([
      "-hide_banner", "-y", "-i", "input.mp4",
      "-map", "0:v:0", "-map", "0:a:0?", "-vf", rendition.scale,
      "-c:v", "libx264", "-threads", String(threads), "-preset", "medium", "-crf", "20", "-profile:v", "high", "-pix_fmt", "yuv420p",
      "-c:a", "aac", "-b:a", rendition.audioBitrate, "-ar", "48000", "-ac", "2",
      "-force_key_frames", `expr:gte(t,n_forced*${HLS_SEGMENT_SECONDS})`, "-sc_threshold", "0", "-g", "60", "-hls_time", String(HLS_SEGMENT_SECONDS),
      "-hls_playlist_type", "vod", "-hls_flags", "independent_segments", "-hls_segment_filename",
      "seg_%05d.ts", "-hls_key_info_file", "hls-key-info.txt", "index.m3u8",
    ]);
    if (exitCode !== 0) throw new Error(`FFmpeg encode ${rendition.name} thất bại (mã ${exitCode}).`);
  }

  async function cleanupFfmpegFiles() {
    await Promise.all(ffmpegRefs.current.flatMap(ffmpeg => [
      ffmpeg.deleteFile("input.mp4").catch(() => undefined),
      ffmpeg.deleteFile("hls.key").catch(() => undefined),
      ffmpeg.deleteFile("hls-key-info.txt").catch(() => undefined),
    ]));
  }

  function disposeFfmpeg() {
    for (const ffmpeg of ffmpegRefs.current) ffmpeg.terminate?.();
    ffmpegRefs.current = [];
    progressValuesRef.current = [];
  }

  function revokeFfmpegLoadOptions(options: FfmpegLoadOptions | null) {
    if (!options || typeof URL === "undefined") return;
    for (const url of [options.coreURL, options.wasmURL, options.workerURL]) {
      if (url) URL.revokeObjectURL(url);
    }
  }

  async function requestMediaKey() {
    const response = await authenticatedFetch("/api/admin/hls-vault/key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: videoId.trim() }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => null), "Không lấy được khóa HLS từ máy chủ."));
    const key = new Uint8Array(await response.arrayBuffer());
    if (key.byteLength !== 16) throw new Error("Máy chủ trả về khóa HLS không hợp lệ.");
    return key;
  }

  async function prepareVault() {
    const response = await authenticatedFetch("/api/admin/hls-vault/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "prepare", videoId: videoId.trim() }),
      cache: "no-store",
    });
    if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => null), "Không chuẩn bị được thư mục OneDrive."));
  }

  async function uploadFile(path: string, bytes: Uint8Array) {
    const form = new FormData();
    form.set("videoId", videoId.trim());
    form.set("path", path);
    const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    form.set("file", new Blob([blobBytes], { type: path.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t" }), path.split("/").pop() || path);
    const response = await authenticatedFetch("/api/admin/hls-vault/upload", { method: "POST", body: form, cache: "no-store" });
    if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => null), `OneDrive từ chối ${path}.`));
    setUploadedFiles(value => value + 1);
  }

  async function readAndUploadHls(ffmpeg: FfmpegLike, runUpload: ReturnType<typeof createConcurrencyLimiter>) {
    const entries = (await ffmpeg.listDir("/")).filter(entry => !entry.isDir && (entry.name === "index.m3u8" || /^seg_[0-9]{1,10}\.ts$/.test(entry.name)));
    if (!entries.some(entry => entry.name === "index.m3u8") || !entries.some(entry => /^seg_[0-9]{1,10}\.ts$/.test(entry.name))) throw new Error("FFmpeg không tạo đủ index.m3u8 và segment HLS.");
    setTotalFiles(value => value + entries.length);
    entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
    for (let offset = 0; offset < entries.length; offset += HLS_UPLOAD_CONCURRENCY) {
      const results = await Promise.allSettled(entries.slice(offset, offset + HLS_UPLOAD_CONCURRENCY).map(entry => runUpload(async () => {
        const path = entry.name;
        setStage(`Đang upload ${path} lên OneDrive…`);
        const bytes = asBytes(await ffmpeg.readFile(path));
        await uploadFile(path, bytes);
        await ffmpeg.deleteFile(path).catch(() => undefined);
      })));
      const failed = results.find(result => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    }
  }

  async function start() {
    const normalizedVideoId = videoId.trim();
    if (!file) { setError("Hãy chọn file MP4 trước."); return; }
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(normalizedVideoId)) { setError("Mã video chỉ được dùng chữ, số, gạch ngang và gạch dưới."); return; }
    setState("loading"); setProgress(0); setUploadedFiles(0); setTotalFiles(0); setError(""); setNotice(""); setFfmpegLog("");
    if (encoderMode === "native") {
      await startNative(normalizedVideoId);
      return;
    }
    let mediaKey: Uint8Array | null = null;
    let loadOptions: FfmpegLoadOptions | null = null;
    try {
      setStage("Đang chuẩn bị thư mục VideoVault…");
      await prepareVault();
      mediaKey = await requestMediaKey();
      const multithread = canUseMultithreadCore();
      const threads = encoderThreadCount(multithread, 1);
      loadOptions = await ffmpegLoadOptions(multithread);
      setStage("Đang nạp MP4 vào bộ nhớ trình duyệt…");
      const inputBytes = await fetchFile(file);
      const runUpload = createConcurrencyLimiter(HLS_UPLOAD_CONCURRENCY);
      progressValuesRef.current = [0];
      setStage(multithread
        ? `Đang tải bộ mã hóa FFmpeg WebAssembly đa luồng (${threads} luồng)…`
        : "Đang tải bộ mã hóa FFmpeg WebAssembly dự phòng…");

      const ffmpeg = await getFfmpeg(0, multithread, loadOptions!);
      await prepareEncoder(ffmpeg, inputBytes, mediaKey, normalizedVideoId);
      setState("encoding");
      setProgress(0);
      setStage(`Đang encode HLS một rendition trên máy này (${threads} luồng)…`);
      await encodeRendition(ffmpeg, SINGLE_RENDITION, threads);
      setState("uploading");
      await readAndUploadHls(ffmpeg, runUpload);
      await cleanupFfmpegFiles();
      disposeFfmpeg();
      setProgress(100); setState("done"); setStage("Đã encode và upload xong HLS Vault."); setNotice("OneDrive đã có VideoVault/" + normalizedVideoId + "/. Bước tiếp theo: tạo resource trong trình soạn khóa học.");
    } catch (value) {
      await cleanupFfmpegFiles();
      disposeFfmpeg();
      mediaKey?.fill(0);
      setState("error"); setError(value instanceof Error ? value.message : "Encode hoặc upload HLS thất bại."); setStage("Quy trình đã dừng. Kiểm tra lỗi rồi thử lại.");
    } finally {
      mediaKey?.fill(0);
      revokeFfmpegLoadOptions(loadOptions);
    }
  }

  const busy = state === "loading" || state === "encoding" || state === "uploading";
  return <div className="admin-hls-vault-page">
    <section className="admin-hls-vault-hero">
      <div className="admin-hls-vault-hero-copy">
        <span className="admin-hls-vault-eyebrow">ONEDRIVE HLS VAULT</span>
        <h1>Encode MP4 rồi upload thẳng lên OneDrive</h1>
        <p>MP4 được xử lý local bằng FFmpeg native hoặc WebAssembly dự phòng. Hệ thống ưu tiên stream-copy, sau đó NVENC và chỉ tạo một HLS tối đa 1080p.</p>
        <div className="admin-hls-vault-badges"><span><ShieldCheck aria-hidden="true"/> AES-128 HLS</span><span><FileVideo aria-hidden="true"/> Một rendition · tối đa 1080p</span><span><UploadCloud aria-hidden="true"/> VideoVault</span></div>
      </div>
      <div className="admin-hls-vault-mark" aria-hidden="true">HLS</div>
    </section>

    <section className="admin-hls-vault-card">
      <div className="admin-hls-vault-card-head"><div><span className="admin-hls-vault-eyebrow">BƯỚC 1 · CHUẨN BỊ</span><h2>Chọn video nguồn</h2><p>Không upload MP4 gốc. File sẽ được encode local thành manifest và segment mã hóa.</p></div><span className="admin-hls-vault-step">01</span></div>
      <div className="admin-hls-vault-form-grid">
        <label className="admin-hls-vault-field"><span>Mã video HLS</span><input value={videoId} onChange={event => setVideoId(event.target.value)} placeholder="lesson01" pattern="[A-Za-z0-9_-]{1,80}" disabled={busy}/><small>Dùng cùng mã này khi tạo resource trong lesson.</small></label>
        <div className="admin-hls-vault-file-field"><span>File MP4 local</span><button type="button" className="admin-hls-vault-dropzone" onClick={() => fileInputRef.current?.click()} disabled={busy}><FileVideo aria-hidden="true"/><b>{file ? file.name : "Chọn file MP4"}</b><small>{file ? formatBytes(file.size) : "Chỉ nhận video/mp4"}</small></button><input ref={fileInputRef} className="admin-hls-vault-hidden-input" type="file" accept="video/mp4,.mp4" aria-label="File MP4 local" onChange={selectFile} disabled={busy}/></div>
      </div>
      <fieldset className="admin-hls-vault-engine" disabled={busy}>
        <legend>Phương thức encode</legend>
        <label className="admin-hls-vault-engine-option">
          <input type="radio" name="hls-encoder-mode" value="native" checked={encoderMode === "native"} onChange={() => setEncoderMode("native")} />
          <span><b>FFmpeg native trên máy</b><small>Tự probe, ưu tiên stream-copy, rồi NVIDIA NVENC và libx264 fallback.</small></span>
          <span className={`admin-hls-vault-agent-pill agent-${nativeAgentStatus}`}>{nativeAgentStatus === "ready" ? "Sẵn sàng" : nativeAgentStatus === "checking" ? "Đang kiểm tra" : "Chưa kết nối"}</span>
        </label>
        <label className="admin-hls-vault-engine-option">
          <input type="radio" name="hls-encoder-mode" value="browser" checked={encoderMode === "browser"} onChange={() => setEncoderMode("browser")} />
          <span><b>FFmpeg trong trình duyệt</b><small>Phương án dự phòng, tạo một HLS tối đa 1080p khi local agent chưa chạy.</small></span>
          <span className="admin-hls-vault-agent-pill agent-fallback">Dự phòng</span>
        </label>
      </fieldset>
      {encoderMode === "native" && <div className="admin-hls-vault-agent-status" role="status" aria-live="polite"><span><Cpu aria-hidden="true"/><b>{nativeAgentStatus === "ready" ? `Native agent sẵn sàng${nativeAgentVersion ? ` · ${nativeAgentVersion}` : ""}` : nativeAgentStatus === "checking" ? "Đang tìm local FFmpeg agent…" : "Local FFmpeg agent chưa chạy"}</b></span><button type="button" className="admin-hls-vault-agent-refresh" onClick={() => void checkNativeAgent()} disabled={nativeAgentStatus === "checking" || busy}><RefreshCw aria-hidden="true"/> Kiểm tra lại</button></div>}
      {file && <div className="admin-hls-vault-file-summary"><span><b>{file.name}</b><small>{formatBytes(file.size)}{duration ? ` · ${formatDuration(duration)}` : ""}</small></span><button type="button" onClick={reset} disabled={busy}>Đổi file</button></div>}
      <div className="admin-hls-vault-actions"><button type="button" className="primary-btn admin-hls-vault-start" onClick={() => void start()} disabled={busy || !file}>{busy ? <><LoaderCircle className="admin-hls-vault-spin" aria-hidden="true"/> Đang xử lý…</> : <><ArrowUpToLine aria-hidden="true"/> {encoderMode === "native" ? "Encode native và upload" : "Encode và upload OneDrive"}</>}</button>{state === "done" || state === "error" ? <button type="button" className="outline-btn" onClick={reset}>Bắt đầu video khác</button> : null}</div>
    </section>

    <section className="admin-hls-vault-card admin-hls-vault-progress-card" aria-live="polite">
      <div className="admin-hls-vault-card-head"><div><span className="admin-hls-vault-eyebrow">BƯỚC 2 · XỬ LÝ</span><h2>Tiến trình</h2></div><span className={`admin-hls-vault-state state-${state}`}>{state === "done" ? <><CheckCircle2 aria-hidden="true"/> Hoàn tất</> : state === "error" ? "Có lỗi" : busy ? "Đang chạy" : "Chờ thao tác"}</span></div>
      <div className="admin-hls-vault-progress-track" role="progressbar" aria-label="Tiến trình encode và upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }}/></div>
      <div className="admin-hls-vault-progress-meta"><b>{stage}</b><span>{uploadedFiles}{totalFiles ? ` / ${totalFiles}` : ""} file</span></div>
      {ffmpegLog && <p className="admin-hls-vault-log" title={ffmpegLog}>{ffmpegLog}</p>}
      {notice && <p className="admin-hls-vault-notice" role="status">{notice} <Link href="/admin/content">Mở trình soạn nội dung</Link></p>}
      {error && <p className="admin-hls-vault-error" role="alert">{error}</p>}
    </section>

    <section className="admin-hls-vault-card admin-hls-vault-checklist"><div><span className="admin-hls-vault-eyebrow">SAU KHI HOÀN TẤT</span><h2>Cấu trúc OneDrive cần có</h2></div><code>VideoVault/{videoId || "lesson01"}/<br/>├─ index.m3u8<br/>└─ seg_*.ts</code></section>
  </div>;
}

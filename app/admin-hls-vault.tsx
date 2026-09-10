"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent, type DragEvent as ReactDragEvent, type MouseEvent } from "react";
import { ArrowUpToLine, CheckCircle2, Cpu, FileVideo, LoaderCircle, RefreshCw, ShieldCheck, UploadCloud, X } from "lucide-react";
import Link from "next/link";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { activeSessionToken, authenticatedFetch } from "../lib/auth-client";
import { apiRequestUrl } from "../lib/api-url";
import { clearAttachedBytes } from "../lib/hls-upload";
import { listenForProductNavigation } from "./product-navigation-guard";
import "./admin-hls-vault.css";

type RunState = "idle" | "loading" | "encoding" | "uploading" | "done" | "error" | "cancelled";
type EncoderMode = "native" | "browser";
type NativeAgentStatus = "checking" | "ready" | "offline";
type HlsFieldErrors = { videoId?: string; file?: string };
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
const NATIVE_AGENT_CHECK_TIMEOUT_MS = 5_000;
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
  const [fieldErrors, setFieldErrors] = useState<HlsFieldErrors>({});
  const [isFileDragging, setIsFileDragging] = useState(false);
  const ffmpegRefs = useRef<FfmpegLike[]>([]);
  const progressValuesRef = useRef<number[]>([]);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const videoIdInputRef = useRef<HTMLInputElement | null>(null);
  const fileButtonRef = useRef<HTMLButtonElement | null>(null);
  const activeRunIdRef = useRef(0);
  const activeNativeJobRef = useRef("");
  const runAbortControllerRef = useRef<AbortController | null>(null);
  const nativeAgentProbeControllerRef = useRef<AbortController | null>(null);
  const nativeAgentProbeIdRef = useRef(0);
  const busy = state === "loading" || state === "encoding" || state === "uploading";
  const stageAnnouncement = state === "loading" ? "Đang chuẩn bị video." : state === "encoding" ? "Đang encode HLS." : state === "uploading" ? "Đang upload HLS." : state === "done" ? "Đã encode và upload xong. Bước tiếp theo: mở trình soạn nội dung để tạo resource." : state === "error" ? "Quy trình gặp lỗi." : state === "cancelled" ? "Đã hủy quy trình." : "Sẵn sàng chọn video.";

  const checkNativeAgent = useCallback(async () => {
    nativeAgentProbeControllerRef.current?.abort();
    const controller = new AbortController();
    nativeAgentProbeControllerRef.current = controller;
    nativeAgentProbeIdRef.current += 1;
    const probeId = nativeAgentProbeIdRef.current;
    const timeout = window.setTimeout(() => controller.abort(), NATIVE_AGENT_CHECK_TIMEOUT_MS);
    setNativeAgentStatus("checking");
    try {
      const response = await fetch(`${NATIVE_AGENT_ORIGIN}/health`, { headers: { accept: "application/json" }, cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => null) as { ready?: boolean; ffmpegVersion?: string } | null;
      if (!response.ok || !payload?.ready) throw new Error("Agent chưa sẵn sàng.");
      if (probeId !== nativeAgentProbeIdRef.current || controller.signal.aborted) return false;
      setNativeAgentVersion(payload.ffmpegVersion || "FFmpeg native");
      setNativeAgentStatus("ready");
      return true;
    } catch {
      if (probeId !== nativeAgentProbeIdRef.current) return false;
      setNativeAgentVersion("");
      setNativeAgentStatus("offline");
      return false;
    } finally {
      window.clearTimeout(timeout);
      if (nativeAgentProbeControllerRef.current === controller) nativeAgentProbeControllerRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (encoderMode !== "native") {
      nativeAgentProbeIdRef.current += 1;
      nativeAgentProbeControllerRef.current?.abort();
      return;
    }
    const timer = window.setTimeout(() => { void checkNativeAgent(); }, 0);
    return () => {
      window.clearTimeout(timer);
      nativeAgentProbeControllerRef.current?.abort();
    };
  }, [checkNativeAgent, encoderMode]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (window.crossOriginIsolated || new URL(window.location.href).searchParams.get("isolated") === "1") return;
    const url = new URL(window.location.href);
    url.searchParams.set("isolated", "1");
    window.location.replace(url.toString());
  }, []);

  useEffect(() => {
    if (!busy) return undefined;
    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [busy]);

  useEffect(() => {
    if (!busy) return undefined;
    return listenForProductNavigation(event => {
      event.preventDefault();
      setError("Hãy hủy quy trình đang chạy trước khi rời trang.");
    });
  }, [busy]);

  useEffect(() => () => {
    activeRunIdRef.current += 1;
    runAbortControllerRef.current?.abort();
    runAbortControllerRef.current = null;
    nativeAgentProbeIdRef.current += 1;
    nativeAgentProbeControllerRef.current?.abort();
    nativeAgentProbeControllerRef.current = null;
    disposeFfmpeg();
    const jobId = activeNativeJobRef.current;
    activeNativeJobRef.current = "";
    if (jobId) void nativeJobRequest(jobId, "DELETE").catch(() => undefined);
  }, []);

  function applySelectedFile(next: File | null) {
    const isMp4 = Boolean(next && (next.type === "video/mp4" || (!next.type && next.name.toLowerCase().endsWith(".mp4"))));
    setFile(isMp4 ? next : null);
    setDuration(0);
    setNotice("");
    setError(next && !isMp4 ? "Hãy chọn file MP4 hợp lệ." : "");
    setFieldErrors(current => ({ ...current, file: next && isMp4 ? undefined : next ? "Hãy chọn file MP4 hợp lệ." : current.file }));
    setStage(isMp4 ? "Đã chọn file. Sẵn sàng encode trên máy này." : "Chọn MP4 để bắt đầu.");
  }

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    applySelectedFile(event.target.files?.[0] ?? null);
  }

  function handleFileDragOver(event: ReactDragEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (busy) return;
    event.dataTransfer.dropEffect = "copy";
    setIsFileDragging(true);
  }

  function handleFileDragLeave(event: ReactDragEvent<HTMLButtonElement>) {
    event.preventDefault();
    if (event.currentTarget.contains(event.relatedTarget as Node | null)) return;
    setIsFileDragging(false);
  }

  function handleFileDrop(event: ReactDragEvent<HTMLButtonElement>) {
    event.preventDefault();
    setIsFileDragging(false);
    if (busy) return;
    applySelectedFile(event.dataTransfer.files?.[0] ?? null);
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

  async function nativeJobRequest(jobId: string, method: "GET" | "POST" | "DELETE" = "GET", signal?: AbortSignal) {
    const response = await fetch(`${NATIVE_AGENT_ORIGIN}/jobs/${encodeURIComponent(jobId)}`, {
      method,
      headers: { accept: "application/json" },
      cache: "no-store",
      signal,
    });
    const payload = await response.json().catch(() => null) as NativeJob | { error?: string } | null;
    if (!response.ok) throw new Error(payload && "error" in payload && payload.error ? payload.error : "Không đọc được trạng thái FFmpeg native.");
    return payload as NativeJob;
  }

  function currentRun(runId: number) {
    return activeRunIdRef.current === runId;
  }

  async function cancelRun() {
    if (!busy) return;
    activeRunIdRef.current += 1;
    runAbortControllerRef.current?.abort();
    runAbortControllerRef.current = null;
    disposeFfmpeg();
    const jobId = activeNativeJobRef.current;
    activeNativeJobRef.current = "";
    setState("cancelled");
    setProgress(0);
    setError("");
    setNotice("");
    setStage("Đã hủy quy trình encode và upload.");
    if (jobId) await nativeJobRequest(jobId, "DELETE").catch(() => undefined);
  }

  function guardOwnedNavigation(event: MouseEvent<HTMLAnchorElement>) {
    if (!busy) return;
    event.preventDefault();
    setError("Hãy hủy quy trình đang chạy trước khi rời trang.");
  }

  async function waitForNativeJob(jobId: string, normalizedVideoId: string, runId: number, signal: AbortSignal) {
    while (currentRun(runId)) {
      const job = await nativeJobRequest(jobId, "GET", signal);
      if (!currentRun(runId)) return;
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
        activeNativeJobRef.current = "";
        return;
      }
      if (["failed", "cancelled"].includes(job.status)) throw new Error(job.error || "Encode FFmpeg native thất bại.");
      setState(job.status === "uploading" ? "uploading" : job.status === "encoding" ? "encoding" : "loading");
      await new Promise(resolve => setTimeout(resolve, 900));
    }
  }

  async function startNative(normalizedVideoId: string, runId: number, signal: AbortSignal) {
    let jobId = "";
    try {
      const agentReady = await checkNativeAgent();
      if (!currentRun(runId)) return;
      if (!agentReady) throw new Error("Chưa kết nối được local FFmpeg agent. Hãy chạy `npm.cmd run ffmpeg:agent` trên máy này rồi thử lại.");
      setStage("Đang kết nối local FFmpeg agent…");
      const token = await activeSessionToken();
      if (!currentRun(runId)) return;
      const createResponse = await fetch(`${NATIVE_AGENT_ORIGIN}/jobs`, {
        method: "POST",
        headers: { authorization: `Bearer ${token}`, "content-type": "application/json", accept: "application/json" },
        body: JSON.stringify({
          apiOrigin: nativeApiOrigin(),
          fileName: file!.name,
          fileSize: file!.size,
          videoId: normalizedVideoId,
        }),
        signal,
      });
      const created = await createResponse.json().catch(() => null) as NativeJob | { error?: string } | null;
      if (!createResponse.ok || !created || !("id" in created)) throw new Error(created && "error" in created && created.error ? created.error : "Không tạo được native FFmpeg job.");
      jobId = created.id;
      activeNativeJobRef.current = jobId;
      if (!currentRun(runId)) { await nativeJobRequest(jobId, "DELETE").catch(() => undefined); return; }
      setStage("Đang chuyển MP4 vào local agent…");
      const inputResponse = await fetch(`${NATIVE_AGENT_ORIGIN}/jobs/${encodeURIComponent(jobId)}/input`, {
        method: "PUT",
        headers: { "content-type": file!.type || "video/mp4" },
        body: file,
        signal,
      });
      const uploaded = await inputResponse.json().catch(() => null) as NativeJob | { error?: string } | null;
      if (!inputResponse.ok) throw new Error(uploaded && "error" in uploaded && uploaded.error ? uploaded.error : "Không chuyển được MP4 vào local agent.");
      if (!currentRun(runId)) { await nativeJobRequest(jobId, "DELETE").catch(() => undefined); return; }
      setProgress(10);
      setStage("MP4 đã sẵn sàng. Đang khởi động FFmpeg native…");
      await nativeJobRequest(jobId, "POST", signal);
      if (!currentRun(runId)) return;
      await waitForNativeJob(jobId, normalizedVideoId, runId, signal);
    } catch (value) {
      if (!currentRun(runId)) return;
      if (jobId) await nativeJobRequest(jobId, "DELETE").catch(() => undefined);
      activeNativeJobRef.current = "";
      setState("error");
      setError(value instanceof Error ? value.message : "Encode FFmpeg native thất bại.");
      setStage("Quy trình đã dừng. Kiểm tra local agent rồi thử lại.");
    }
  }

  async function getFfmpeg(index: number, multithread: boolean, loadOptions: FfmpegLoadOptions, runId: number) {
    const existing = ffmpegRefs.current[index];
    if (existing) return existing;
    const instance = await createFfmpeg(
      multithread,
      payload => {
        if (!currentRun(runId)) return;
        const values = progressValuesRef.current;
        if (!values.length) return;
        values[index] = Math.min(100, Math.max(0, Math.round((payload.progress ?? 0) * 100)));
        setProgress(Math.round(values.reduce((sum, value) => sum + value, 0) / values.length));
      },
      payload => {
        if (currentRun(runId) && payload.message) setFfmpegLog(payload.message.slice(-180));
      },
      loadOptions,
    );
    if (!currentRun(runId)) {
      instance.terminate?.();
      throw new Error("Quy trình đã được hủy.");
    }
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

  async function requestMediaKey(signal: AbortSignal) {
    const response = await authenticatedFetch("/api/admin/hls-vault/key", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ videoId: videoId.trim() }),
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => null), "Không lấy được khóa HLS từ máy chủ."));
    const key = new Uint8Array(await response.arrayBuffer());
    if (key.byteLength !== 16) throw new Error("Máy chủ trả về khóa HLS không hợp lệ.");
    return key;
  }

  async function prepareVault(signal: AbortSignal) {
    const response = await authenticatedFetch("/api/admin/hls-vault/upload", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action: "prepare", videoId: videoId.trim() }),
      cache: "no-store",
      signal,
    });
    if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => null), "Không chuẩn bị được thư mục OneDrive."));
  }

  async function uploadFile(path: string, bytes: Uint8Array, runId: number, signal: AbortSignal) {
    const form = new FormData();
    form.set("videoId", videoId.trim());
    form.set("path", path);
    const blobBytes = bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
    form.set("file", new Blob([blobBytes], { type: path.endsWith(".m3u8") ? "application/vnd.apple.mpegurl" : "video/mp2t" }), path.split("/").pop() || path);
    const response = await authenticatedFetch("/api/admin/hls-vault/upload", { method: "POST", body: form, cache: "no-store", signal });
    if (!response.ok) throw new Error(errorMessage(await response.json().catch(() => null), `OneDrive từ chối ${path}.`));
    if (currentRun(runId)) setUploadedFiles(value => value + 1);
  }

  async function readAndUploadHls(ffmpeg: FfmpegLike, runUpload: ReturnType<typeof createConcurrencyLimiter>, runId: number, signal: AbortSignal) {
    const entries = (await ffmpeg.listDir("/")).filter(entry => !entry.isDir && (entry.name === "index.m3u8" || /^seg_[0-9]{1,10}\.ts$/.test(entry.name)));
    if (!currentRun(runId)) return;
    if (!entries.some(entry => entry.name === "index.m3u8") || !entries.some(entry => /^seg_[0-9]{1,10}\.ts$/.test(entry.name))) throw new Error("FFmpeg không tạo đủ index.m3u8 và segment HLS.");
    setTotalFiles(value => value + entries.length);
    entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));
    setStage(`Đang upload ${entries.length} file HLS lên OneDrive…`);
    for (let offset = 0; offset < entries.length; offset += HLS_UPLOAD_CONCURRENCY) {
      const results = await Promise.allSettled(entries.slice(offset, offset + HLS_UPLOAD_CONCURRENCY).map(entry => runUpload(async () => {
        if (!currentRun(runId)) return;
        const path = entry.name;
        const bytes = asBytes(await ffmpeg.readFile(path));
        if (!currentRun(runId)) return;
        await uploadFile(path, bytes, runId, signal);
        if (!currentRun(runId)) return;
        await ffmpeg.deleteFile(path).catch(() => undefined);
      })));
      if (!currentRun(runId)) return;
      const failed = results.find(result => result.status === "rejected");
      if (failed?.status === "rejected") throw failed.reason;
    }
  }

  async function start() {
    const normalizedVideoId = videoId.trim();
    const nextFieldErrors: HlsFieldErrors = {};
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(normalizedVideoId)) nextFieldErrors.videoId = "Mã video chỉ được dùng 1–80 chữ, số, gạch ngang hoặc gạch dưới.";
    if (!file) nextFieldErrors.file = "Chọn một file MP4 trước khi bắt đầu.";
    setFieldErrors(nextFieldErrors);
    if (nextFieldErrors.videoId || nextFieldErrors.file) {
      setError("");
      window.requestAnimationFrame(() => (nextFieldErrors.videoId ? videoIdInputRef.current : fileButtonRef.current)?.focus());
      return;
    }
    const sourceFile = file;
    if (!sourceFile) return;
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    const runController = new AbortController();
    runAbortControllerRef.current = runController;
    setState("loading"); setProgress(0); setUploadedFiles(0); setTotalFiles(0); setError(""); setNotice(""); setFfmpegLog("");
    if (encoderMode === "native") {
      await startNative(normalizedVideoId, runId, runController.signal);
      if (currentRun(runId)) runAbortControllerRef.current = null;
      return;
    }
    let mediaKey: Uint8Array | null = null;
    let loadOptions: FfmpegLoadOptions | null = null;
    try {
      setStage("Đang chuẩn bị thư mục VideoVault…");
      await prepareVault(runController.signal);
      if (!currentRun(runId)) return;
      mediaKey = await requestMediaKey(runController.signal);
      if (!currentRun(runId)) return;
      const multithread = canUseMultithreadCore();
      const threads = encoderThreadCount(multithread, 1);
      loadOptions = await ffmpegLoadOptions(multithread);
      if (!currentRun(runId)) return;
      setStage("Đang nạp MP4 vào bộ nhớ trình duyệt…");
      const inputBytes = await fetchFile(sourceFile);
      if (!currentRun(runId)) return;
      const runUpload = createConcurrencyLimiter(HLS_UPLOAD_CONCURRENCY);
      progressValuesRef.current = [0];
      setStage(multithread
        ? `Đang tải bộ mã hóa FFmpeg WebAssembly đa luồng (${threads} luồng)…`
        : "Đang tải bộ mã hóa FFmpeg WebAssembly dự phòng…");

      const ffmpeg = await getFfmpeg(0, multithread, loadOptions!, runId);
      if (!currentRun(runId)) return;
      await prepareEncoder(ffmpeg, inputBytes, mediaKey, normalizedVideoId);
      if (!currentRun(runId)) return;
      setState("encoding");
      setProgress(0);
      setStage(`Đang encode HLS một rendition trên máy này (${threads} luồng)…`);
      await encodeRendition(ffmpeg, SINGLE_RENDITION, threads);
      if (!currentRun(runId)) return;
      setState("uploading");
      await readAndUploadHls(ffmpeg, runUpload, runId, runController.signal);
      if (!currentRun(runId)) return;
      await cleanupFfmpegFiles();
      disposeFfmpeg();
      setProgress(100); setState("done"); setStage("Đã encode và upload xong HLS Vault."); setNotice("OneDrive đã có VideoVault/" + normalizedVideoId + "/. Bước tiếp theo: tạo resource trong trình soạn khóa học.");
    } catch (value) {
      if (!currentRun(runId)) return;
      await cleanupFfmpegFiles();
      disposeFfmpeg();
      mediaKey?.fill(0);
      setState("error"); setError(value instanceof Error ? value.message : "Encode hoặc upload HLS thất bại."); setStage("Quy trình đã dừng. Kiểm tra lỗi rồi thử lại.");
    } finally {
      mediaKey?.fill(0);
      revokeFfmpegLoadOptions(loadOptions);
      if (currentRun(runId)) runAbortControllerRef.current = null;
    }
  }

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
    <p className="admin-hls-vault-stage-live" role="status" aria-live="polite" aria-atomic="true">{stageAnnouncement}</p>

    <section className="admin-hls-vault-card">
      <div className="admin-hls-vault-card-head"><div><span className="admin-hls-vault-eyebrow">BƯỚC 1 · CHUẨN BỊ</span><h2>Chọn video nguồn</h2><p>Không upload MP4 gốc. File sẽ được encode local thành manifest và segment mã hóa.</p></div><span className="admin-hls-vault-step">01</span></div>
      <div className="admin-hls-vault-form-grid">
        <label className="admin-hls-vault-field"><span>Mã video HLS</span><input ref={videoIdInputRef} value={videoId} onChange={event => { setVideoId(event.target.value); setFieldErrors(current => ({ ...current, videoId: undefined })); }} placeholder="lesson01" pattern="[A-Za-z0-9_-]{1,80}" disabled={busy} aria-invalid={Boolean(fieldErrors.videoId)} aria-describedby={`admin-hls-video-id-help${fieldErrors.videoId ? " admin-hls-video-id-error" : ""}`}/><small id="admin-hls-video-id-help">Dùng cùng mã này khi tạo resource trong lesson.</small>{fieldErrors.videoId && <small id="admin-hls-video-id-error" className="admin-hls-vault-field-error">{fieldErrors.videoId}</small>}</label>
        <div className="admin-hls-vault-file-field"><span>File MP4 local</span><button ref={fileButtonRef} type="button" className={`admin-hls-vault-dropzone${isFileDragging ? " is-dragging" : ""}`} onClick={() => fileInputRef.current?.click()} onDragOver={handleFileDragOver} onDragLeave={handleFileDragLeave} onDrop={handleFileDrop} disabled={busy} data-invalid={fieldErrors.file ? "true" : undefined} aria-describedby={`admin-hls-file-help${fieldErrors.file ? " admin-hls-file-error" : ""}`}><FileVideo aria-hidden="true"/><b>{file ? file.name : "Chọn hoặc thả file MP4"}</b><small id="admin-hls-file-help">{file ? formatBytes(file.size) : "Chỉ nhận video/mp4"}</small></button>{fieldErrors.file && <small id="admin-hls-file-error" className="admin-hls-vault-field-error">{fieldErrors.file}</small>}<input ref={fileInputRef} className="admin-hls-vault-hidden-input" type="file" accept="video/mp4,.mp4" tabIndex={-1} aria-label="File MP4 local" aria-invalid={Boolean(fieldErrors.file)} aria-describedby={fieldErrors.file ? "admin-hls-file-error" : undefined} onChange={selectFile} disabled={busy}/></div>
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
      {encoderMode === "native" && <div className="admin-hls-vault-agent-status"><span><Cpu aria-hidden="true"/><b role="status" aria-live="polite" aria-atomic="true">{nativeAgentStatus === "ready" ? `Native agent sẵn sàng${nativeAgentVersion ? ` · ${nativeAgentVersion}` : ""}` : nativeAgentStatus === "checking" ? "Đang tìm local FFmpeg agent…" : "Local FFmpeg agent chưa chạy"}</b></span><div className="admin-hls-vault-agent-actions"><button type="button" className="admin-hls-vault-agent-refresh" onClick={() => void checkNativeAgent()} disabled={nativeAgentStatus === "checking" || busy}><RefreshCw aria-hidden="true"/> Kiểm tra lại</button>{nativeAgentStatus === "offline" ? <button type="button" className="admin-hls-vault-agent-refresh" onClick={() => setEncoderMode("browser")} disabled={busy}>Dùng FFmpeg trong trình duyệt</button> : null}</div></div>}
      {file && <div className="admin-hls-vault-file-summary"><span><b>{file.name}</b><small>{formatBytes(file.size)}{duration ? ` · ${formatDuration(duration)}` : ""}</small></span><button type="button" onClick={reset} disabled={busy}>Đổi file</button></div>}
      <div className="admin-hls-vault-actions"><button type="button" className="primary-btn admin-hls-vault-start" onClick={() => void start()} disabled={busy}>{busy ? <><LoaderCircle className="admin-hls-vault-spin" aria-hidden="true"/> Đang xử lý…</> : <><ArrowUpToLine aria-hidden="true"/> {encoderMode === "native" ? "Encode native và upload" : "Encode và upload OneDrive"}</>}</button>{busy ? <button type="button" className="outline-btn admin-hls-vault-cancel" onClick={() => void cancelRun()}><X aria-hidden="true"/>Hủy xử lý</button> : null}{state === "done" || state === "error" || state === "cancelled" ? <button type="button" className="outline-btn" onClick={reset}>Bắt đầu video khác</button> : null}</div>
    </section>

    <section className="admin-hls-vault-card admin-hls-vault-progress-card">
      <div className="admin-hls-vault-card-head"><div><span className="admin-hls-vault-eyebrow">BƯỚC 2 · XỬ LÝ</span><h2>Tiến trình</h2></div><span className={`admin-hls-vault-state state-${state}`}>{state === "done" ? <><CheckCircle2 aria-hidden="true"/> Hoàn tất</> : state === "error" ? "Có lỗi" : state === "cancelled" ? "Đã hủy" : busy ? "Đang chạy" : "Chờ thao tác"}</span></div>
      <div className="admin-hls-vault-progress-track" role="progressbar" aria-label="Tiến trình encode và upload" aria-valuemin={0} aria-valuemax={100} aria-valuenow={progress}><span style={{ width: `${progress}%` }}/></div>
      <div className="admin-hls-vault-progress-meta"><b>{stage}</b><span>{uploadedFiles}{totalFiles ? ` / ${totalFiles}` : ""} file</span></div>
      {ffmpegLog && <p className="admin-hls-vault-log" title={ffmpegLog}>{ffmpegLog}</p>}
      {notice && <p className="admin-hls-vault-notice">{notice} <Link href="/admin/content" onClick={guardOwnedNavigation}>Mở trình soạn nội dung</Link></p>}
      {error && <p className="admin-hls-vault-error" role="alert">{error}</p>}
    </section>

    <section className="admin-hls-vault-card admin-hls-vault-checklist"><div><span className="admin-hls-vault-eyebrow">SAU KHI HOÀN TẤT</span><h2>Cấu trúc OneDrive cần có</h2></div><code>VideoVault/{videoId || "lesson01"}/<br/>├─ index.m3u8<br/>└─ seg_*.ts</code></section>
  </div>;
}

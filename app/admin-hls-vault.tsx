"use client";

import { useRef, useState, type ChangeEvent } from "react";
import { ArrowUpToLine, CheckCircle2, FileVideo, LoaderCircle, ShieldCheck, UploadCloud } from "lucide-react";
import Link from "next/link";
import { fetchFile, toBlobURL } from "@ffmpeg/util";
import { authenticatedFetch } from "../lib/auth-client";
import "./admin-hls-vault.css";

type RunState = "idle" | "loading" | "encoding" | "uploading" | "done" | "error";
type FfmpegFile = { name: string; isDir: boolean };
type FfmpegLike = {
  load: (options: { coreURL: string; wasmURL: string }) => Promise<void>;
  on: (event: "progress" | "log", callback: (payload: { progress?: number; message?: string }) => void) => void;
  writeFile: (path: string, data: Uint8Array) => Promise<void>;
  createDir: (path: string) => Promise<void>;
  exec: (arguments_: string[]) => Promise<number>;
  listDir: (path: string) => Promise<FfmpegFile[]>;
  readFile: (path: string) => Promise<Uint8Array | string>;
  deleteFile: (path: string) => Promise<void>;
  deleteDir: (path: string) => Promise<void>;
};

const CORE_BASE_URL = "https://cdn.jsdelivr.net/npm/@ffmpeg/core@0.12.10/dist/umd";
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
] as const;

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

function errorMessage(payload: unknown, fallback: string) {
  return payload && typeof payload === "object" && "error" in payload && typeof payload.error === "string" ? payload.error : fallback;
}

async function loadFfmpeg(instance: FfmpegLike) {
  const [coreURL, wasmURL] = await Promise.all([
    toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.js`, "text/javascript"),
    toBlobURL(`${CORE_BASE_URL}/ffmpeg-core.wasm`, "application/wasm"),
  ]);
  // @ffmpeg/core is the single-thread build; only the multi-thread core-mt
  // package ships ffmpeg-core.worker.js.
  await instance.load({ coreURL, wasmURL });
}

export default function AdminHlsVault() {
  const [file, setFile] = useState<File | null>(null);
  const [videoId, setVideoId] = useState("lesson01");
  const [state, setState] = useState<RunState>("idle");
  const [progress, setProgress] = useState(0);
  const [uploadedFiles, setUploadedFiles] = useState(0);
  const [totalFiles, setTotalFiles] = useState(0);
  const [stage, setStage] = useState("Chọn MP4 để bắt đầu.");
  const [notice, setNotice] = useState("");
  const [error, setError] = useState("");
  const [ffmpegLog, setFfmpegLog] = useState("");
  const [duration, setDuration] = useState(0);
  const ffmpegRef = useRef<FfmpegLike | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

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

  async function readAndUploadRendition(ffmpeg: FfmpegLike, rendition: typeof RENDITIONS[number]) {
    const entries = (await ffmpeg.listDir(rendition.name)).filter(entry => !entry.isDir && (entry.name === "index.m3u8" || /^seg_[0-9]{1,10}\.ts$/.test(entry.name)));
    if (!entries.some(entry => entry.name === "index.m3u8") || !entries.some(entry => /^seg_[0-9]{1,10}\.ts$/.test(entry.name))) throw new Error(`FFmpeg không tạo đủ file cho ${rendition.name}.`);
    for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }))) {
      const path = `${rendition.name}/${entry.name}`;
      setStage(`Đang upload ${path} lên OneDrive…`);
      const bytes = asBytes(await ffmpeg.readFile(path));
      await uploadFile(path, bytes);
      await ffmpeg.deleteFile(path).catch(() => undefined);
    }
  }

  async function start() {
    const normalizedVideoId = videoId.trim();
    if (!file) { setError("Hãy chọn file MP4 trước."); return; }
    if (!/^[A-Za-z0-9_-]{1,80}$/.test(normalizedVideoId)) { setError("Mã video chỉ được dùng chữ, số, gạch ngang và gạch dưới."); return; }
    setState("loading"); setProgress(0); setUploadedFiles(0); setTotalFiles(0); setError(""); setNotice(""); setFfmpegLog("");
    let mediaKey: Uint8Array | null = null;
    try {
      setStage("Đang chuẩn bị thư mục VideoVault…");
      await prepareVault();
      mediaKey = await requestMediaKey();
      let ffmpeg = ffmpegRef.current;
      if (!ffmpeg) {
        setStage("Đang tải bộ mã hóa FFmpeg WebAssembly lần đầu…");
        const ffmpegModule = await import("@ffmpeg/ffmpeg");
        ffmpeg = new ffmpegModule.FFmpeg() as unknown as FfmpegLike;
        ffmpeg.on("progress", payload => setProgress(Math.min(100, Math.max(0, Math.round((payload.progress ?? 0) * 100)))));
        ffmpeg.on("log", payload => { if (payload.message) setFfmpegLog(payload.message.slice(-180)); });
        await loadFfmpeg(ffmpeg);
        ffmpegRef.current = ffmpeg;
      }
      setStage("Đang nạp MP4 vào bộ nhớ trình duyệt…");
      await ffmpeg.writeFile("input.mp4", await fetchFile(file));
      const ffmpegKey = new Uint8Array(mediaKey);
      try {
        await ffmpeg.writeFile("hls.key", ffmpegKey);
      } finally {
        ffmpegKey.fill(0);
      }
      await ffmpeg.writeFile("hls-key-info.txt", new TextEncoder().encode(`https://hls-key.invalid/key/${normalizedVideoId}\n/hls.key\n`));
      await ffmpeg.deleteDir("1080p").catch(() => undefined);
      await ffmpeg.deleteDir("720p").catch(() => undefined);
      await ffmpeg.createDir("1080p");
      await ffmpeg.createDir("720p");
      setState("encoding");
      for (const rendition of RENDITIONS) {
        setState("encoding");
        setProgress(0);
        setStage(`Đang encode ${rendition.name} trên máy này…`);
        const exitCode = await ffmpeg.exec([
          "-hide_banner", "-y", "-i", "input.mp4",
          "-map", "0:v:0", "-map", "0:a:0?", "-vf", rendition.scale,
          "-c:v", "libx264", "-preset", "veryfast", "-profile:v", "high", "-pix_fmt", "yuv420p",
          "-b:v", rendition.videoBitrate, "-maxrate", rendition.maxRate, "-bufsize", rendition.bufferSize,
          "-c:a", "aac", "-b:a", rendition.audioBitrate, "-ar", "48000", "-ac", "2",
          "-force_key_frames", "expr:gte(t,n_forced*4)", "-sc_threshold", "0", "-hls_time", "4",
          "-hls_playlist_type", "vod", "-hls_flags", "independent_segments", "-hls_segment_filename",
          `${rendition.name}/seg_%05d.ts`, "-hls_key_info_file", "hls-key-info.txt", `${rendition.name}/index.m3u8`,
        ]);
        if (exitCode !== 0) throw new Error(`FFmpeg encode ${rendition.name} thất bại (mã ${exitCode}).`);
        const entries = (await ffmpeg.listDir(rendition.name)).filter(entry => !entry.isDir && (entry.name === "index.m3u8" || /^seg_[0-9]{1,10}\.ts$/.test(entry.name)));
        setTotalFiles(value => value + entries.length);
        setState("uploading");
        await readAndUploadRendition(ffmpeg, rendition);
      }
      setTotalFiles(value => value + 1);
      setStage("Đang upload master.m3u8…");
      await uploadFile("master.m3u8", new TextEncoder().encode(masterManifest()));
      await ffmpeg.deleteFile("input.mp4").catch(() => undefined);
      await ffmpeg.deleteFile("hls.key").catch(() => undefined);
      await ffmpeg.deleteFile("hls-key-info.txt").catch(() => undefined);
      setProgress(100); setState("done"); setStage("Đã encode và upload xong HLS Vault."); setNotice("OneDrive đã có VideoVault/" + normalizedVideoId + "/. Bước tiếp theo: tạo resource trong trình soạn khóa học.");
    } catch (value) {
      const ffmpeg = ffmpegRef.current;
      await Promise.all([
        ffmpeg?.deleteFile("input.mp4").catch(() => undefined),
        ffmpeg?.deleteFile("hls.key").catch(() => undefined),
        ffmpeg?.deleteFile("hls-key-info.txt").catch(() => undefined),
        ffmpeg?.deleteDir("1080p").catch(() => undefined),
        ffmpeg?.deleteDir("720p").catch(() => undefined),
      ]);
      mediaKey?.fill(0);
      setState("error"); setError(value instanceof Error ? value.message : "Encode hoặc upload HLS thất bại."); setStage("Quy trình đã dừng. Kiểm tra lỗi rồi thử lại.");
    } finally {
      mediaKey?.fill(0);
    }
  }

  const busy = state === "loading" || state === "encoding" || state === "uploading";
  return <div className="admin-hls-vault-page">
    <section className="admin-hls-vault-hero">
      <div className="admin-hls-vault-hero-copy">
        <span className="admin-hls-vault-eyebrow">ONEDRIVE HLS VAULT</span>
        <h1>Encode MP4 rồi upload thẳng lên OneDrive</h1>
        <p>MP4 được xử lý ngay trong trình duyệt bằng FFmpeg WebAssembly. Website chỉ cấp khóa media theo quyền admin; master key không bao giờ rời máy chủ.</p>
        <div className="admin-hls-vault-badges"><span><ShieldCheck aria-hidden="true"/> AES-128 HLS</span><span><FileVideo aria-hidden="true"/> 1080p + 720p</span><span><UploadCloud aria-hidden="true"/> VideoVault</span></div>
      </div>
      <div className="admin-hls-vault-mark" aria-hidden="true">HLS</div>
    </section>

    <section className="admin-hls-vault-card">
      <div className="admin-hls-vault-card-head"><div><span className="admin-hls-vault-eyebrow">BƯỚC 1 · CHUẨN BỊ</span><h2>Chọn video nguồn</h2><p>Không upload MP4 gốc. File sẽ được encode local thành manifest và segment mã hóa.</p></div><span className="admin-hls-vault-step">01</span></div>
      <div className="admin-hls-vault-form-grid">
        <label className="admin-hls-vault-field"><span>Mã video HLS</span><input value={videoId} onChange={event => setVideoId(event.target.value)} placeholder="lesson01" pattern="[A-Za-z0-9_-]{1,80}" disabled={busy}/><small>Dùng cùng mã này khi tạo resource trong lesson.</small></label>
        <div className="admin-hls-vault-file-field"><span>File MP4 local</span><button type="button" className="admin-hls-vault-dropzone" onClick={() => fileInputRef.current?.click()} disabled={busy}><FileVideo aria-hidden="true"/><b>{file ? file.name : "Chọn file MP4"}</b><small>{file ? formatBytes(file.size) : "Chỉ nhận video/mp4"}</small></button><input ref={fileInputRef} className="admin-hls-vault-hidden-input" type="file" accept="video/mp4,.mp4" onChange={selectFile} disabled={busy}/></div>
      </div>
      {file && <div className="admin-hls-vault-file-summary"><span><b>{file.name}</b><small>{formatBytes(file.size)}{duration ? ` · ${formatDuration(duration)}` : ""}</small></span><button type="button" onClick={reset} disabled={busy}>Đổi file</button></div>}
      <div className="admin-hls-vault-actions"><button type="button" className="primary-btn admin-hls-vault-start" onClick={() => void start()} disabled={busy || !file}>{busy ? <><LoaderCircle className="admin-hls-vault-spin" aria-hidden="true"/> Đang xử lý…</> : <><ArrowUpToLine aria-hidden="true"/> Encode và upload OneDrive</>}</button>{state === "done" || state === "error" ? <button type="button" className="outline-btn" onClick={reset}>Bắt đầu video khác</button> : null}</div>
    </section>

    <section className="admin-hls-vault-card admin-hls-vault-progress-card" aria-live="polite">
      <div className="admin-hls-vault-card-head"><div><span className="admin-hls-vault-eyebrow">BƯỚC 2 · XỬ LÝ</span><h2>Tiến trình</h2></div><span className={`admin-hls-vault-state state-${state}`}>{state === "done" ? <><CheckCircle2 aria-hidden="true"/> Hoàn tất</> : state === "error" ? "Có lỗi" : busy ? "Đang chạy" : "Chờ thao tác"}</span></div>
      <div className="admin-hls-vault-progress-track"><span style={{ width: `${progress}%` }}/></div>
      <div className="admin-hls-vault-progress-meta"><b>{stage}</b><span>{uploadedFiles}{totalFiles ? ` / ${totalFiles}` : ""} file</span></div>
      {ffmpegLog && <p className="admin-hls-vault-log" title={ffmpegLog}>{ffmpegLog}</p>}
      {notice && <p className="admin-hls-vault-notice" role="status">{notice} <Link href="/admin/content">Mở trình soạn nội dung</Link></p>}
      {error && <p className="admin-hls-vault-error" role="alert">{error}</p>}
    </section>

    <section className="admin-hls-vault-card admin-hls-vault-checklist"><div><span className="admin-hls-vault-eyebrow">SAU KHI HOÀN TẤT</span><h2>Cấu trúc OneDrive cần có</h2></div><code>VideoVault/{videoId || "lesson01"}/<br/>├─ master.m3u8<br/>├─ 1080p/index.m3u8 + seg_*.ts<br/>└─ 720p/index.m3u8 + seg_*.ts</code></section>
  </div>;
}

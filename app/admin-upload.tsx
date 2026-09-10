"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type ChangeEvent, type DragEvent, type FormEvent, type KeyboardEvent } from "react";
import {
  Check,
  CircleCheck,
  CloudUpload,
  Copy,
  ExternalLink,
  FileImage,
  FolderOpen,
  Images,
  Info,
  LoaderCircle,
  RefreshCw,
  Search,
  ShieldCheck,
  Trash2,
  X,
} from "lucide-react";
import AeckConfirmDialog from "../components/aeck/AeckConfirmDialog";
import { adminImageFetch, prepareImageFile } from "../lib/exam-image-client";
import { formatUiDate, formatUiTime } from "./ui-format";
import "./admin-upload.css";

type UploadedImage = {
  assetName: string;
  url: string;
  used: boolean;
  size: number;
  lastModified: string | null;
};

type ExamUploadedImage = UploadedImage & {
  sectionId: string;
  examId: string | null;
  examTitle: string;
  sectionTitle: string;
  orphan: boolean;
};

type LibraryTab = "public" | "private";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const LIBRARY_PAGE_SIZE = 12;
const libraryTabs: LibraryTab[] = ["public", "private"];

function positivePage(value: string | null) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return 1;
  return Math.min(10_000, Math.max(1, Math.floor(parsed) || 1));
}

function formatBytes(value: number) {
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function formatDate(value: string | null) {
  return formatUiDate(value, "Chưa rõ thời gian");
}

function formatTime(value: Date | null) {
  return formatUiTime(value, "Chưa đồng bộ");
}

function publicHref(value: string) {
  if (!value.startsWith("/")) return value;
  return typeof window === "undefined" ? value : new URL(value, window.location.origin).toString();
}

function examImageKey(image: ExamUploadedImage) {
  return `${image.sectionId}/${image.assetName}`;
}

function ProtectedImageThumbnail({ image }: { image: ExamUploadedImage }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    void (async () => {
      try {
        const response = await adminImageFetch(image.url, {
          headers: { accept: "image/*" },
          cache: "no-store",
        });
        if (!response.ok) throw new Error("image request failed");
        const blob = await response.blob();
        if (!blob.size) throw new Error("empty image");
        const nextUrl = URL.createObjectURL(blob);
        if (cancelled) {
          URL.revokeObjectURL(nextUrl);
          return;
        }
        objectUrl = nextUrl;
        setSrc(nextUrl);
      } catch {
        if (!cancelled) setSrc("");
      }
    })();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [image.url]);

  return src
    ? <img className="admin-upload-private-thumb" src={src} alt={`Ảnh ${image.assetName}`} width={640} height={360} loading="lazy" />
    : <span className="admin-upload-private-thumb admin-upload-private-thumb-placeholder"><FileImage /></span>;
}

export default function AdminUploadPage() {
  const [images, setImages] = useState<UploadedImage[]>([]);
  const [examImages, setExamImages] = useState<ExamUploadedImage[]>([]);
  const [file, setFile] = useState<File | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [examSearchTerm, setExamSearchTerm] = useState("");
  const [activeLibrary, setActiveLibrary] = useState<LibraryTab>("public");
  const [publicPage, setPublicPage] = useState(1);
  const [privatePage, setPrivatePage] = useState(1);
  const [urlReady, setUrlReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [examLoading, setExamLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [isDragging, setIsDragging] = useState(false);
  const [deletingAsset, setDeletingAsset] = useState("");
  const [pendingImage, setPendingImage] = useState<UploadedImage | null>(null);
  const [imageDeletionError, setImageDeletionError] = useState("");
  const [pendingExamImage, setPendingExamImage] = useState<ExamUploadedImage | null>(null);
  const [deletingExamAsset, setDeletingExamAsset] = useState("");
  const [examImageDeletionError, setExamImageDeletionError] = useState("");
  const [copiedAsset, setCopiedAsset] = useState("");
  const [copyAnnouncement, setCopyAnnouncement] = useState("");
  const [lastLoadedAt, setLastLoadedAt] = useState<Date | null>(null);
  const [examLastLoadedAt, setExamLastLoadedAt] = useState<Date | null>(null);
  const [libraryError, setLibraryError] = useState("");
  const [error, setError] = useState("");
  const [examError, setExamError] = useState("");
  const [notice, setNotice] = useState("");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const copyAnnouncementFrameRef = useRef<number | null>(null);
  const copyResetTimeoutRef = useRef<number | null>(null);
  const libraryAbortControllerRef = useRef<AbortController | null>(null);
  const examLibraryAbortControllerRef = useRef<AbortController | null>(null);
  const libraryTabRefs = useRef<Record<LibraryTab, HTMLButtonElement | null>>({ public: null, private: null });

  const readUrlState = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    setActiveLibrary(params.get("library") === "private" ? "private" : "public");
    setSearchTerm(params.get("publicQ") ?? "");
    setExamSearchTerm(params.get("privateQ") ?? "");
    setPublicPage(positivePage(params.get("publicPage")));
    setPrivatePage(positivePage(params.get("privatePage")));
    setUrlReady(true);
  }, []);

  useEffect(() => {
    // URL state is hydrated after mount to keep the server and first client
    // render identical, then follows browser back/forward navigation.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    readUrlState();
    window.addEventListener("popstate", readUrlState);
    return () => window.removeEventListener("popstate", readUrlState);
  }, [readUrlState]);

  useEffect(() => {
    if (!urlReady) return;
    const url = new URL(window.location.href);
    url.searchParams.set("library", activeLibrary);
    if (searchTerm) url.searchParams.set("publicQ", searchTerm); else url.searchParams.delete("publicQ");
    if (examSearchTerm) url.searchParams.set("privateQ", examSearchTerm); else url.searchParams.delete("privateQ");
    url.searchParams.set("publicPage", String(publicPage));
    url.searchParams.set("privatePage", String(privatePage));
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [activeLibrary, examSearchTerm, privatePage, publicPage, searchTerm, urlReady]);

  const loadImages = useCallback(async () => {
    libraryAbortControllerRef.current?.abort();
    const controller = new AbortController();
    libraryAbortControllerRef.current = controller;
    setLoading(true);
    setLibraryError("");
    try {
      const response = await adminImageFetch("/api/admin/images", { cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => null) as { images?: UploadedImage[]; error?: string } | null;
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(payload?.error || "Không thể tải kho ảnh.");
      setImages(Array.isArray(payload?.images) ? payload.images : []);
      setLastLoadedAt(new Date());
    } catch (value) {
      if (controller.signal.aborted) return;
      setLibraryError(value instanceof Error ? value.message : "Không thể tải kho ảnh.");
    } finally {
      if (!controller.signal.aborted && libraryAbortControllerRef.current === controller) setLoading(false);
    }
  }, []);

  const loadExamImages = useCallback(async () => {
    examLibraryAbortControllerRef.current?.abort();
    const controller = new AbortController();
    examLibraryAbortControllerRef.current = controller;
    setExamLoading(true);
    setExamError("");
    try {
      const response = await adminImageFetch("/api/admin/exam-images?all=1", { cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => null) as { images?: ExamUploadedImage[]; error?: string } | null;
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(payload?.error || "Không thể tải kho ảnh đề thi.");
      setExamImages(Array.isArray(payload?.images) ? payload.images : []);
      setExamLastLoadedAt(new Date());
    } catch (value) {
      if (controller.signal.aborted) return;
      setExamError(value instanceof Error ? value.message : "Không thể tải kho ảnh đề thi.");
    } finally {
      if (!controller.signal.aborted && examLibraryAbortControllerRef.current === controller) setExamLoading(false);
    }
  }, []);

  const loadAllImages = useCallback(async () => {
    await Promise.all([loadImages(), loadExamImages()]);
  }, [loadExamImages, loadImages]);

  useEffect(() => {
    // The first request synchronizes the protected image library with the API.
    // Keep this explicit because the React hooks lint rule cannot see the async
    // state updates that happen after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadAllImages();
  }, [loadAllImages]);

  useEffect(() => () => {
    libraryAbortControllerRef.current?.abort();
    examLibraryAbortControllerRef.current?.abort();
    if (copyAnnouncementFrameRef.current !== null) {
      window.cancelAnimationFrame(copyAnnouncementFrameRef.current);
    }
    if (copyResetTimeoutRef.current !== null) {
      window.clearTimeout(copyResetTimeoutRef.current);
    }
  }, []);

  function clearSelectedFile() {
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = "";
  }

  function applySelectedFile(candidate: File | null) {
    if (!candidate) return;
    setNotice("");
    if (!candidate.type.startsWith("image/")) {
      setFile(null);
      setError("Hãy chọn một file hình ảnh.");
      return;
    }
    if (candidate.size > MAX_SOURCE_BYTES) {
      setFile(null);
      setError("Ảnh đầu vào phải nhỏ hơn 12 MB.");
      return;
    }
    setError("");
    setFile(candidate);
  }

  function chooseFile(event: ChangeEvent<HTMLInputElement>) {
    applySelectedFile(event.target.files?.[0] ?? null);
  }

  function handleDragOver(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(true);
  }

  function handleDragLeave(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
  }

  function handleDrop(event: DragEvent<HTMLLabelElement>) {
    event.preventDefault();
    setIsDragging(false);
    applySelectedFile(event.dataTransfer.files?.[0] ?? null);
  }

  async function upload(event: FormEvent) {
    event.preventDefault();
    if (!file || uploading) return;
    setUploading(true);
    setError("");
    setNotice("");
    try {
      const imageFile = await prepareImageFile(file);
      const form = new FormData();
      form.set("file", imageFile, imageFile.name);
      const response = await adminImageFetch("/api/admin/images", {
        method: "POST",
        body: form,
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { url?: string; error?: string } | null;
      if (!response.ok || !payload?.url) throw new Error(payload?.error || "Không thể tải ảnh lên R2.");
      clearSelectedFile();
      setNotice("Đã tải ảnh lên kho công khai. Bạn có thể sao chép URL bên dưới.");
      await loadImages();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể tải ảnh lên R2.");
    } finally {
      setUploading(false);
    }
  }

  async function copyUrl(image: UploadedImage, copyKey: string) {
    const value = publicHref(image.url);
    try {
      await navigator.clipboard.writeText(value);
      setCopiedAsset(copyKey);
      if (copyAnnouncementFrameRef.current !== null) {
        window.cancelAnimationFrame(copyAnnouncementFrameRef.current);
      }
      setCopyAnnouncement("");
      copyAnnouncementFrameRef.current = window.requestAnimationFrame(() => {
        setCopyAnnouncement(`Đã sao chép URL ảnh ${image.assetName}.`);
        copyAnnouncementFrameRef.current = null;
      });
      if (copyResetTimeoutRef.current !== null) {
        window.clearTimeout(copyResetTimeoutRef.current);
      }
      copyResetTimeoutRef.current = window.setTimeout(() => {
        setCopiedAsset((current) => current === copyKey ? "" : current);
        copyResetTimeoutRef.current = null;
      }, 1800);
    } catch {
      setError("Không thể sao chép URL. Hãy chọn và sao chép thủ công.");
    }
  }

  function handleLibraryTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(event.key)) return;
    event.preventDefault();
    const currentTab = event.currentTarget.dataset.library === "private" ? "private" : "public";
    const currentIndex = libraryTabs.indexOf(currentTab);
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? libraryTabs.length - 1
        : (currentIndex + (event.key === "ArrowRight" ? 1 : -1) + libraryTabs.length) % libraryTabs.length;
    const nextTab = libraryTabs[nextIndex];
    setActiveLibrary(nextTab);
    libraryTabRefs.current[nextTab]?.focus();
  }

  function requestImageRemoval(image: UploadedImage) {
    if (image.used || deletingAsset) return;
    setImageDeletionError("");
    setPendingImage(image);
  }

  async function removeImage(image: UploadedImage) {
    if (deletingAsset) return;
    setDeletingAsset(image.assetName);
    setImageDeletionError("");
    setNotice("");
    try {
      const response = await adminImageFetch("/api/admin/images", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ assetName: image.assetName }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Không thể xóa ảnh trên R2.");
      setImages((current) => current.filter((item) => item.assetName !== image.assetName));
      setNotice("Đã xóa ảnh khỏi kho công khai.");
      setPendingImage(null);
    } catch (value) {
      setImageDeletionError(value instanceof Error ? value.message : "Không thể xóa ảnh trên R2.");
    } finally {
      setDeletingAsset("");
    }
  }

  function requestExamImageRemoval(image: ExamUploadedImage) {
    if (image.used || deletingExamAsset) return;
    setExamImageDeletionError("");
    setPendingExamImage(image);
  }

  function closeExamImageRemoval() {
    if (deletingExamAsset) return;
    setExamImageDeletionError("");
    setPendingExamImage(null);
  }

  async function removeExamImage(image: ExamUploadedImage) {
    if (image.used || deletingExamAsset) return;
    const key = examImageKey(image);
    setDeletingExamAsset(key);
    setExamImageDeletionError("");
    setNotice("");
    try {
      const response = await adminImageFetch("/api/admin/exam-images", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sectionId: image.sectionId, assetName: image.assetName, allowOrphan: image.orphan }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Không thể xoá ảnh đề thi trên R2.");
      setExamImages((current) => current.filter((item) => examImageKey(item) !== key));
      setNotice("Đã xoá ảnh đề thi không còn được sử dụng khỏi R2.");
      setPendingExamImage(null);
    } catch (value) {
      setExamImageDeletionError(value instanceof Error ? value.message : "Không thể xoá ảnh đề thi trên R2.");
    } finally {
      setDeletingExamAsset("");
    }
  }

  const filteredImages = useMemo(() => {
    const query = searchTerm.trim().toLowerCase();
    if (!query) return images;
    return images.filter((image) => image.assetName.toLowerCase().includes(query));
  }, [images, searchTerm]);

  const filteredExamImages = useMemo(() => {
    const query = examSearchTerm.trim().toLowerCase();
    if (!query) return examImages;
    return examImages.filter((image) => `${image.assetName} ${image.examTitle} ${image.sectionTitle}`.toLowerCase().includes(query));
  }, [examImages, examSearchTerm]);

  const publicPageCount = Math.max(1, Math.ceil(filteredImages.length / LIBRARY_PAGE_SIZE));
  const privatePageCount = Math.max(1, Math.ceil(filteredExamImages.length / LIBRARY_PAGE_SIZE));
  useEffect(() => {
    if (loading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote list size normalizes a URL-backed page after loading
    setPublicPage(page => Math.min(page, publicPageCount));
  }, [loading, publicPageCount]);
  useEffect(() => {
    if (examLoading) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect -- remote list size normalizes a URL-backed page after loading
    setPrivatePage(page => Math.min(page, privatePageCount));
  }, [examLoading, privatePageCount]);
  const pagedImages = filteredImages.slice((Math.min(publicPage, publicPageCount) - 1) * LIBRARY_PAGE_SIZE, Math.min(publicPage, publicPageCount) * LIBRARY_PAGE_SIZE);
  const pagedExamImages = filteredExamImages.slice((Math.min(privatePage, privatePageCount) - 1) * LIBRARY_PAGE_SIZE, Math.min(privatePage, privatePageCount) * LIBRARY_PAGE_SIZE);

  const usedCount = images.filter((image) => image.used).length;
  const examBytes = examImages.reduce((total, image) => total + image.size, 0);
  function closeImageRemoval() {
    if (deletingAsset) return;
    setImageDeletionError("");
    setPendingImage(null);
  }

  return <div className="admin-upload-page">
    <header className="admin-upload-hero">
      <div className="admin-upload-hero-copy">
        <span className="eyebrow">KHO ẢNH · R2 PUBLIC</span>
        <h1>Thư viện hình ảnh</h1>
        <p>Quản lý ảnh giữ nguyên định dạng dùng cho LaTeX, đề thi và nội dung học tập tại một nơi.</p>
        <div className="admin-upload-hero-meta">
          <span><CircleCheck /> Giữ nguyên định dạng gốc</span>
          <span><ShieldCheck /> URL R2 tạm thời</span>
        </div>
      </div>
      <div className="admin-upload-hero-mark" aria-hidden="true">R</div>
      <button type="button" className="admin-upload-refresh" onClick={() => void loadAllImages()} disabled={loading || examLoading}>
        <RefreshCw className={loading || examLoading ? "admin-upload-spin" : ""} />
        <span>{loading || examLoading ? "Đang đồng bộ" : "Làm mới"}</span>
      </button>
    </header>

    <section className="admin-upload-stats" aria-label="Thống kê kho ảnh">
      <article className="admin-upload-stat-card">
        <span className="admin-upload-stat-icon red"><Images /></span>
        <div><strong>{loading && !images.length ? "—" : images.length}</strong><span>Tổng ảnh</span></div>
        <small>Trong kho public</small>
      </article>
      <article className="admin-upload-stat-card">
        <span className="admin-upload-stat-icon green"><CircleCheck /></span>
        <div><strong>{loading && !images.length ? "—" : images.length - usedCount}</strong><span>Sẵn sàng dùng</span></div>
        <small>Chưa được tham chiếu</small>
      </article>
      <article className="admin-upload-stat-card">
        <span className="admin-upload-stat-icon blue"><FileImage /></span>
        <div><strong>{loading && !images.length ? "—" : usedCount}</strong><span>Đang sử dụng</span></div>
        <small>Được khóa xóa</small>
      </article>
      <article className="admin-upload-stat-card">
        <span className="admin-upload-stat-icon purple"><FolderOpen /></span>
        <div><strong>{examLoading && !examImages.length ? "—" : examImages.length}</strong><span>Ảnh đề thi</span></div>
        <small>{formatBytes(examBytes)} · kho riêng tư</small>
      </article>
    </section>

    {error && <p className="form-error admin-upload-message" role="alert">{error}</p>}
    {notice && <p className="form-success admin-upload-message">{notice}</p>}
    <p className="admin-upload-live-region" role="status" aria-live="polite" aria-atomic="true">{copyAnnouncement}</p>
    <p className="admin-upload-live-region admin-upload-library-live-region" role="status" aria-live="polite" aria-atomic="true">{notice || (activeLibrary === "public" ? loading ? "Đang đồng bộ kho ảnh công khai." : `Kho ảnh công khai có ${filteredImages.length} file.` : examLoading ? "Đang đồng bộ kho ảnh đề thi." : `Kho ảnh đề thi có ${filteredExamImages.length} file.`)}</p>

    <section className="admin-upload-upload-card">
      <div className="admin-upload-section-heading">
        <div>
          <span className="eyebrow">THÊM TÀI NGUYÊN</span>
          <h2>Tải ảnh lên R2</h2>
          <p>Ảnh được lưu nguyên định dạng gốc; máy chủ sẽ kiểm tra loại file trước khi lưu.</p>
        </div>
        <span className="admin-upload-storage-pill"><span /> R2 public</span>
      </div>
      <form className="admin-upload-form" onSubmit={upload}>
        <label
          htmlFor="admin-upload-file"
          className={`admin-upload-dropzone${isDragging ? " is-dragging" : ""}${file ? " has-file" : ""}`}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
          onDrop={handleDrop}
        >
           <input id="admin-upload-file" name="imageFile" ref={fileInputRef} type="file" accept="image/*" aria-label="Chọn ảnh để tải lên" onChange={chooseFile} />
          <span className="admin-upload-drop-icon"><CloudUpload /></span>
          <span className="admin-upload-drop-copy">
            <strong>{file ? file.name : "Kéo thả ảnh vào đây"}</strong>
            <small>{file ? `${formatBytes(file.size)} · sẵn sàng tải lên` : "hoặc chọn ảnh từ máy tính · mọi định dạng ảnh trình duyệt hỗ trợ"}</small>
          </span>
          <span className="admin-upload-choose">Chọn tệp</span>
        </label>
        <div className="admin-upload-upload-side">
          <div className="admin-upload-upload-note">
            <span><Info /></span>
            <p><strong>Tối đa 12 MB đầu vào</strong><small>File lưu trên R2 không quá 8 MB.</small></p>
          </div>
          <div className="admin-upload-upload-actions">
            {file && <button type="button" className="admin-upload-clear" onClick={clearSelectedFile}><X /> Bỏ chọn</button>}
            <button type="submit" className="primary-btn admin-upload-submit" disabled={!file || uploading}>
              {uploading ? <><LoaderCircle className="admin-upload-spin" /> Đang tải lên</> : <><CloudUpload /> Tải lên R2</>}
            </button>
          </div>
        </div>
      </form>
      <p className="admin-upload-public-note"><ShieldCheck /> Khi chưa có domain public, URL sao chép là link R2 tạm thời và hết hạn sau 7 ngày. Không tải dữ liệu nhạy cảm hoặc thông tin cá nhân lên đây.</p>
    </section>

    <div className="admin-upload-library-tabs" role="tablist" aria-label="Chọn thư viện ảnh">
      <button id="admin-upload-library-tab-public" role="tab" type="button" data-library="public" aria-selected={activeLibrary === "public"} aria-controls="admin-upload-library-panel-public" tabIndex={activeLibrary === "public" ? 0 : -1} className={activeLibrary === "public" ? "active" : ""} ref={element => { libraryTabRefs.current.public = element; }} onClick={() => setActiveLibrary("public")} onKeyDown={handleLibraryTabKeyDown}><Images aria-hidden="true" />Kho công khai</button>
      <button id="admin-upload-library-tab-private" role="tab" type="button" data-library="private" aria-selected={activeLibrary === "private"} aria-controls="admin-upload-library-panel-private" tabIndex={activeLibrary === "private" ? 0 : -1} className={activeLibrary === "private" ? "active" : ""} ref={element => { libraryTabRefs.current.private = element; }} onClick={() => setActiveLibrary("private")} onKeyDown={handleLibraryTabKeyDown}><FolderOpen aria-hidden="true" />Ảnh đề thi</button>
    </div>

    {activeLibrary === "public" && <section className="admin-upload-library" role="tabpanel" id="admin-upload-library-panel-public" aria-labelledby="admin-upload-library-tab-public" aria-busy={loading}>
      <div className="admin-upload-library-head">
        <div>
          <span className="eyebrow">PUBLIC ASSET LIBRARY</span>
          <h2>Ảnh đã tải lên</h2>
          <p>Sao chép URL để chèn vào <code>{`\\chenanh{1}{link ảnh}`}</code>. Ảnh đang được đề thi dùng sẽ không thể xóa.</p>
        </div>
        <div className="admin-upload-library-tools">
          <label className="admin-upload-search">
            <Search />
            <input type="search" name="assetSearch" autoComplete="off" value={searchTerm} onChange={(event) => { setSearchTerm(event.target.value); setPublicPage(1); }} placeholder="Tìm theo tên file…" aria-label="Tìm ảnh theo tên file" />
            {searchTerm && <button type="button" onClick={() => { setSearchTerm(""); setPublicPage(1); }} aria-label="Xóa tìm kiếm"><X /></button>}
          </label>
          <span className="admin-upload-count"><b>{filteredImages.length}</b> / {images.length} file</span>
        </div>
      </div>
      <div className="admin-upload-library-status">
        <span>{loading ? <><LoaderCircle className="admin-upload-spin" /> Đang đồng bộ kho ảnh…</> : libraryError ? <><Info /> Không thể đồng bộ kho ảnh</> : <><CircleCheck /> Đã đồng bộ lúc {formatTime(lastLoadedAt)}</>}</span>
      </div>

      {libraryError && <div className="admin-upload-empty admin-upload-load-error" role="alert">
        <span className="admin-upload-empty-icon"><Info /></span>
        <h3>Không thể tải kho ảnh</h3>
        <p>{libraryError}</p>
        <button type="button" className="outline-btn" onClick={() => void loadImages()}><RefreshCw /> Thử lại</button>
      </div>}
      {loading && !images.length ? <div className="admin-upload-skeleton-grid" aria-label="Đang tải kho ảnh">
        {[0, 1, 2].map((item) => <div className="admin-upload-skeleton-card" key={item}><span /><div><i /><i /></div></div>)}
      </div> : !images.length ? (libraryError ? null : <div className="admin-upload-empty">
        <span className="admin-upload-empty-icon"><Images /></span>
        <h3>Kho ảnh đang trống</h3>
        <p>Tải ảnh đầu tiên lên để bắt đầu xây dựng thư viện tài nguyên cho đề thi.</p>
        <button type="button" className="outline-btn" onClick={() => fileInputRef.current?.click()}><CloudUpload /> Chọn ảnh đầu tiên</button>
      </div>) : !filteredImages.length ? <div className="admin-upload-empty">
        <span className="admin-upload-empty-icon"><Search /></span>
        <h3>Không tìm thấy ảnh</h3>
        <p>Thử tìm với một phần khác trong tên file.</p>
        <button type="button" className="outline-btn" onClick={() => { setSearchTerm(""); setPublicPage(1); }}><X /> Xóa tìm kiếm</button>
      </div> : <div className="admin-upload-grid">
        {pagedImages.map((image) => {
          const href = publicHref(image.url);
          return <article className="admin-upload-image-card" key={image.assetName}>
            <div className="admin-upload-preview">
              <img src={image.url} alt={`Ảnh ${image.assetName}`} width={640} height={360} loading="lazy" />
              <span className={`admin-upload-status-badge ${image.used ? "used" : "free"}`}>
                {image.used ? "Đang dùng" : "Sẵn sàng"}
              </span>
              <a className="admin-upload-preview-link" href={href} target="_blank" rel="noreferrer" aria-label={`Mở ảnh ${image.assetName}`}><ExternalLink /></a>
            </div>
            <div className="admin-upload-image-body">
              <div className="admin-upload-image-title">
                <strong title={image.assetName}>{image.assetName}</strong>
                <small><FileImage /> {formatBytes(image.size)} · {formatDate(image.lastModified)}</small>
              </div>
              <div className="admin-upload-url-row">
                <input readOnly value={href} aria-label={`URL ảnh ${image.assetName}`} onFocus={(event) => event.currentTarget.select()} />
                <button type="button" className="admin-upload-copy" onClick={() => void copyUrl(image, `public:${image.assetName}`)} title="Sao chép URL" aria-label={`Sao chép URL ${image.assetName}`}>
                  {copiedAsset === `public:${image.assetName}` ? <Check /> : <Copy />}
                </button>
              </div>
              <div className="admin-upload-card-actions">
                <button type="button" className="admin-upload-copy-label" onClick={() => void copyUrl(image, `public:${image.assetName}`)}>
                  {copiedAsset === `public:${image.assetName}` ? <><Check /> Đã sao chép</> : <><Copy /> Sao chép URL</>}
                </button>
                <button type="button" className="admin-upload-delete" disabled={image.used || deletingAsset === image.assetName} onClick={() => requestImageRemoval(image)} title={image.used ? "Ảnh đang được tham chiếu trong đề thi" : "Xóa ảnh khỏi R2"}>
                  <Trash2 /> {deletingAsset === image.assetName ? "Đang xóa" : image.used ? "Đang dùng" : "Xóa"}
                </button>
              </div>
            </div>
          </article>;
        })}
      </div>}
      {filteredImages.length > LIBRARY_PAGE_SIZE && <nav className="admin-upload-pagination" aria-label="Phân trang kho ảnh công khai"><button type="button" disabled={publicPage <= 1} onClick={() => setPublicPage(page => Math.max(1, page - 1))}>Trang trước</button><span>Trang <b>{Math.min(publicPage, publicPageCount)}</b> / {publicPageCount}</span><button type="button" disabled={publicPage >= publicPageCount} onClick={() => setPublicPage(page => Math.min(publicPageCount, page + 1))}>Trang sau</button></nav>}
    </section>}

    {pendingImage ? <AeckConfirmDialog
      open
      title="Xóa ảnh này?"
      description={`Xóa “${pendingImage.assetName}” khỏi kho công khai và R2? Thao tác này không thể hoàn tác.`}
      errorMessage={imageDeletionError}
      secondaryAction={{ label: "Hủy", onClick: closeImageRemoval, disabled: Boolean(deletingAsset) }}
      primaryAction={{ label: deletingAsset ? "Đang xóa…" : "Xóa ảnh", onClick: () => void removeImage(pendingImage), disabled: Boolean(deletingAsset) }}
      onClose={closeImageRemoval}
    /> : null}

    {pendingExamImage ? <AeckConfirmDialog
      open
      title="Xóa ảnh riêng tư?"
      description={`Xóa “${pendingExamImage.assetName}” khỏi ${pendingExamImage.examTitle} / ${pendingExamImage.sectionTitle}? Thao tác này không thể hoàn tác.`}
      errorMessage={examImageDeletionError}
      secondaryAction={{ label: "Hủy", onClick: closeExamImageRemoval, disabled: Boolean(deletingExamAsset) }}
      primaryAction={{ label: deletingExamAsset ? "Đang xoá…" : "Xóa ảnh", onClick: () => void removeExamImage(pendingExamImage), disabled: Boolean(deletingExamAsset) }}
      onClose={closeExamImageRemoval}
    /> : null}

    {activeLibrary === "private" && <section className="admin-upload-library admin-upload-private-library" role="tabpanel" id="admin-upload-library-panel-private" aria-labelledby="admin-upload-library-tab-private" aria-busy={examLoading}>
      <div className="admin-upload-library-head">
        <div>
          <span className="eyebrow">PRIVATE EXAM ASSET LIBRARY</span>
          <h2>Ảnh trong đề thi</h2>
          <p>Đây là toàn bộ ảnh riêng tư trong <code>exam-images/</code>. Có thể xem thumbnail, sao chép URL app và dọn ảnh không còn được câu hỏi đã lưu sử dụng.</p>
        </div>
        <div className="admin-upload-library-tools">
          <label className="admin-upload-search">
            <Search />
            <input type="search" name="examAssetSearch" autoComplete="off" value={examSearchTerm} onChange={(event) => { setExamSearchTerm(event.target.value); setPrivatePage(1); }} placeholder="Tìm đề, phần hoặc tên file…" aria-label="Tìm ảnh đề thi" />
            {examSearchTerm && <button type="button" onClick={() => { setExamSearchTerm(""); setPrivatePage(1); }} aria-label="Xoá tìm kiếm ảnh đề thi"><X /></button>}
          </label>
          <span className="admin-upload-count"><b>{filteredExamImages.length}</b> / {examImages.length} file</span>
        </div>
      </div>
      <div className="admin-upload-library-status">
        <span>{examLoading ? <><LoaderCircle className="admin-upload-spin" /> Đang đọc thư mục exam-images…</> : <><CircleCheck /> Đã đồng bộ lúc {formatTime(examLastLoadedAt)} · {formatBytes(examBytes)}</>}</span>
      </div>
      {examError && <p className="form-error admin-upload-private-error" role="alert">{examError}</p>}

      {examLoading && !examImages.length ? <div className="admin-upload-skeleton-grid" aria-label="Đang tải kho ảnh đề thi">
        {[0, 1, 2].map((item) => <div className="admin-upload-skeleton-card" key={item}><span /><div><i /><i /></div></div>)}
      </div> : !examImages.length ? (examError ? null : <div className="admin-upload-empty">
        <span className="admin-upload-empty-icon"><FolderOpen /></span>
        <h3>Chưa có ảnh riêng tư</h3>
        <p>Ảnh chèn từ trình soạn LaTeX của từng phần thi sẽ xuất hiện ở đây để tiện kiểm tra và dọn dẹp.</p>
      </div>) : !filteredExamImages.length ? <div className="admin-upload-empty">
        <span className="admin-upload-empty-icon"><Search /></span>
        <h3>Không tìm thấy ảnh</h3>
        <p>Thử tìm bằng tên đề, tên phần hoặc một phần tên file.</p>
        <button type="button" className="outline-btn" onClick={() => { setExamSearchTerm(""); setPrivatePage(1); }}><X /> Xoá tìm kiếm</button>
      </div> : <div className="admin-upload-grid">
        {pagedExamImages.map((image) => {
          const href = publicHref(image.url);
          const key = examImageKey(image);
          return <article className="admin-upload-image-card admin-upload-private-card" key={key}>
            <div className="admin-upload-preview admin-upload-private-preview">
              <ProtectedImageThumbnail image={image} />
              <span className={`admin-upload-status-badge ${image.used ? "used" : "free"}`}>
                {image.used ? "Đang dùng" : image.orphan ? "Mồ côi" : "Có thể xoá"}
              </span>
              <span className="admin-upload-private-scope" title="Ảnh riêng tư, cần đăng nhập để xem">Riêng tư</span>
            </div>
            <div className="admin-upload-image-body">
              <div className="admin-upload-image-title">
                <strong title={image.examTitle}>{image.examTitle}</strong>
                <small><FolderOpen /> {image.sectionTitle}</small>
                <small><FileImage /> {formatBytes(image.size)} · {formatDate(image.lastModified)}</small>
              </div>
              <div className="admin-upload-url-row">
                <input readOnly value={href} aria-label={`URL ảnh ${image.assetName}`} onFocus={(event) => event.currentTarget.select()} />
                <button type="button" className="admin-upload-copy" onClick={() => void copyUrl(image, `private:${key}`)} title="Sao chép URL ảnh riêng tư" aria-label={`Sao chép URL ${image.assetName}`}>
                  {copiedAsset === `private:${key}` ? <Check /> : <Copy />}
                </button>
              </div>
              <div className="admin-upload-card-actions">
                <button type="button" className="admin-upload-copy-label" onClick={() => void copyUrl(image, `private:${key}`)}>
                  {copiedAsset === `private:${key}` ? <><Check /> Đã sao chép</> : <><Copy /> Sao chép URL</>}
                </button>
                <button type="button" className="admin-upload-delete" disabled={image.used || deletingExamAsset === key} onClick={() => requestExamImageRemoval(image)} title={image.used ? "Ảnh đang được tham chiếu trong đề thi" : "Xoá ảnh riêng tư khỏi R2"}>
                  <Trash2 /> {deletingExamAsset === key ? "Đang xoá" : image.used ? "Đang dùng" : "Xoá"}
                </button>
              </div>
            </div>
          </article>;
        })}
      </div>}
      {filteredExamImages.length > LIBRARY_PAGE_SIZE && <nav className="admin-upload-pagination" aria-label="Phân trang kho ảnh đề thi"><button type="button" disabled={privatePage <= 1} onClick={() => setPrivatePage(page => Math.max(1, page - 1))}>Trang trước</button><span>Trang <b>{Math.min(privatePage, privatePageCount)}</b> / {privatePageCount}</span><button type="button" disabled={privatePage >= privatePageCount} onClick={() => setPrivatePage(page => Math.min(privatePageCount, page + 1))}>Trang sau</button></nav>}
      <p className="admin-upload-private-note"><ShieldCheck /> Thumbnail được tải qua phiên admin. URL <code>/api/exam-images/...</code> là đường dẫn app ổn định để chèn vào bài thi; ảnh đang dùng sẽ bị khoá xoá.</p>
    </section>}
  </div>;
}

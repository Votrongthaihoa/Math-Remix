"use client";

import { useCallback, useEffect, useRef, useState, type ChangeEvent } from "react";
import { ClipboardPaste, FolderOpen, ImagePlus, LoaderCircle, RefreshCw, Trash2, X } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import { prepareImageFile } from "../lib/exam-image-client";

function clipboardImage(event: ClipboardEvent) {
  const items = Array.from(event.clipboardData?.items ?? []);
  const item = items.find((candidate) => candidate.kind === "file" && candidate.type.startsWith("image/"));
  return item?.getAsFile() ?? null;
}

type ExamImagePickerProps = {
  sectionId: string;
  onUploaded: (url: string, caption?: string) => void;
  onUploadedGroup?: (urls: string[], columns: number, captions?: string[], widthPx?: number, frameHeightPx?: number) => void;
  draftSource?: string;
};

type ExamImageAsset = {
  assetName: string;
  url: string;
  used: boolean;
  size: number;
  lastModified: string | null;
};

function imageSize(value: number) {
  if (!value) return "0 KB";
  if (value < 1024 * 1024) return `${Math.max(1, Math.round(value / 1024))} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

const IMAGE_ROW_MAX_WIDTH = 760;
const IMAGE_ROW_CONTROL_SPACE = 48;

function suggestedImageDimensions(columns: number) {
  const safeColumns = Math.max(2, Math.min(8, columns));
  const width = Math.max(100, Math.floor((IMAGE_ROW_MAX_WIDTH - (safeColumns - 1) * 12 - safeColumns * IMAGE_ROW_CONTROL_SPACE) / safeColumns));
  return { width, height: Math.max(100, Math.min(620, Math.round(width * 0.75))) };
}

function ExamImageThumbnail({ image }: { image: ExamImageAsset }) {
  const [src, setSrc] = useState("");

  useEffect(() => {
    let cancelled = false;
    let objectUrl = "";
    void (async () => {
      try {
        const response = await authenticatedFetch(image.url, {
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
    ? <img className="latex-image-thumb" src={src} alt="Ảnh đề thi" />
    : <span className="latex-image-thumb latex-image-thumb-placeholder"><ImagePlus /></span>;
}

export default function ExamImagePicker({ sectionId, onUploaded, onUploadedGroup, draftSource = "" }: ExamImagePickerProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState("");
  const [managerOpen, setManagerOpen] = useState(false);
  const [loadingImages, setLoadingImages] = useState(false);
  const [images, setImages] = useState<ExamImageAsset[]>([]);
  const [managerError, setManagerError] = useState("");
  const [deletingAsset, setDeletingAsset] = useState("");
  const [pendingImageUrls, setPendingImageUrls] = useState<string[]>([]);
  const [captions, setCaptions] = useState<string[]>([]);
  const [pendingColumns, setPendingColumns] = useState(2);
  const [pendingWidth, setPendingWidth] = useState(0);
  const [pendingFrameHeight, setPendingFrameHeight] = useState(0);
  const [requestedImageCount, setRequestedImageCount] = useState(1);

  const refreshImages = useCallback(async () => {
    setLoadingImages(true);
    setManagerError("");
    try {
      const response = await authenticatedFetch(`/api/admin/exam-images?sectionId=${encodeURIComponent(sectionId)}`, {
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { images?: ExamImageAsset[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Không thể đọc danh sách ảnh.");
      setImages(Array.isArray(payload?.images) ? payload.images : []);
    } catch (error) {
      setManagerError(error instanceof Error ? error.message : "Không thể đọc danh sách ảnh.");
    } finally {
      setLoadingImages(false);
    }
  }, [sectionId]);

  useEffect(() => {
    // Opening the library triggers its protected API refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (managerOpen) void refreshImages();
  }, [managerOpen, refreshImages]);

  const upload = useCallback(async (sourceFiles: File[]) => {
    if (!sourceFiles.length || uploading || pendingImageUrls.length) return;
    setUploading(true);
    setMessage("");
    const uploadedUrls: string[] = [];
    try {
      for (const sourceFile of sourceFiles) {
        const imageFile = await prepareImageFile(sourceFile);
        const form = new FormData();
        form.set("sectionId", sectionId);
        form.set("file", imageFile, imageFile.name);
        const response = await authenticatedFetch("/api/admin/exam-images", {
          method: "POST",
          body: form,
          cache: "no-store",
        });
        const payload = await response.json().catch(() => null) as { url?: string; error?: string } | null;
        if (!response.ok || !payload?.url) throw new Error(payload?.error || "Không thể tải ảnh lên R2.");
        uploadedUrls.push(payload.url);
      }
      const columns = Math.max(2, Math.min(8, uploadedUrls.length));
      const dimensions = suggestedImageDimensions(columns);
      setPendingImageUrls(uploadedUrls);
      setCaptions(uploadedUrls.map(() => ""));
      setPendingColumns(columns);
      setPendingWidth(dimensions.width);
      setPendingFrameHeight(dimensions.height);
      setManagerOpen(false);
      void refreshImages();
      setMessage("");
    } catch (error) {
      if (uploadedUrls.length) {
        const columns = Math.max(2, Math.min(8, uploadedUrls.length));
        const dimensions = suggestedImageDimensions(columns);
        setPendingImageUrls(uploadedUrls);
        setCaptions(uploadedUrls.map(() => ""));
        setPendingColumns(columns);
        setPendingWidth(dimensions.width);
        setPendingFrameHeight(dimensions.height);
        setManagerOpen(false);
        void refreshImages();
        setMessage(`Đã tải ${uploadedUrls.length}/${sourceFiles.length} ảnh; hãy chèn số ảnh đã tải hoặc huỷ.`);
        return;
      }
      setMessage(error instanceof Error ? error.message : "Không thể tải ảnh lên.");
    } finally {
      setUploading(false);
    }
  }, [pendingImageUrls.length, refreshImages, sectionId, uploading]);

  useEffect(() => {
    if (!pendingImageUrls.length) return undefined;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      setPendingImageUrls([]);
      setCaptions([]);
      setManagerOpen(true);
      setMessage("Ảnh đã tải lên nhưng chưa được chèn.");
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [pendingImageUrls.length]);

  useEffect(() => {
    const handlePaste = (event: ClipboardEvent) => {
      const target = event.target;
      if (!(target instanceof Element) || !target.closest("textarea.latex-source-textarea")) return;
      const file = clipboardImage(event);
      if (!file) return;
      event.preventDefault();
      void upload([file]);
    };
    document.addEventListener("paste", handlePaste);
    return () => document.removeEventListener("paste", handlePaste);
  }, [upload]);

  function selectFile(event: ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (requestedImageCount > 1 && files.length < requestedImageCount) {
      setMessage(`Hãy chọn đủ ${requestedImageCount} ảnh để chèn cùng hàng.`);
      return;
    }
    void upload(files.slice(0, requestedImageCount));
  }

  function insertPendingImage() {
    if (!pendingImageUrls.length) return;
    const imageCaptions = captions.map(caption => caption.trim());
    const imageCaption = imageCaptions[0] || "";
    if (pendingImageUrls.length === 1) {
      onUploaded(pendingImageUrls[0], imageCaption || undefined);
    } else if (onUploadedGroup) {
      onUploadedGroup(pendingImageUrls, pendingColumns, imageCaptions, pendingWidth, pendingFrameHeight);
    } else {
      pendingImageUrls.forEach((url, index) => onUploaded(url, imageCaptions[index] || undefined));
    }
    setPendingImageUrls([]);
    setCaptions([]);
    setPendingWidth(0);
    setPendingFrameHeight(0);
    setManagerOpen(true);
    setMessage(imageCaption ? "Đã chèn ảnh kèm chú thích." : "Đã chèn ảnh.");
  }

  function cancelPendingImage() {
    setPendingImageUrls([]);
    setCaptions([]);
    setPendingWidth(0);
    setPendingFrameHeight(0);
    setManagerOpen(true);
    setMessage("Ảnh đã tải lên nhưng chưa được chèn.");
  }

  async function removeImage(image: ExamImageAsset) {
    const draftUsed = draftSource.includes(image.assetName);
    if (image.used || draftUsed) {
      setManagerError(draftUsed ? "Hãy xoá tham chiếu ảnh khỏi bản nháp trước." : "Ảnh đang được dùng trong câu hỏi đã lưu.");
      return;
    }
    if (!window.confirm("Xoá ảnh này khỏi R2? Thao tác này không thể hoàn tác.")) return;
    setDeletingAsset(image.assetName);
    setManagerError("");
    try {
      const response = await authenticatedFetch("/api/admin/exam-images", {
        method: "DELETE",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ sectionId, assetName: image.assetName, draftSource }),
        cache: "no-store",
      });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error || "Không thể xoá ảnh trên R2.");
      setImages((current) => current.filter((item) => item.assetName !== image.assetName));
      setMessage("Đã xoá ảnh khỏi R2.");
    } catch (error) {
      setManagerError(error instanceof Error ? error.message : "Không thể xoá ảnh trên R2.");
    } finally {
      setDeletingAsset("");
    }
  }

  function updatePendingCaption(index: number, value: string) {
    setCaptions(current => current.map((caption, captionIndex) => captionIndex === index ? value : caption));
  }

  function updatePendingColumns(value: number) {
    const columns = Math.max(2, Math.min(8, value));
    const dimensions = suggestedImageDimensions(columns);
    setPendingColumns(columns);
    setPendingWidth(dimensions.width);
    setPendingFrameHeight(dimensions.height);
  }

  return <div className="latex-image-picker">
    <input ref={inputRef} className="latex-source-file-input" type="file" accept="image/*" multiple={requestedImageCount > 1} onChange={selectFile} />
    <label className="latex-image-count-control"><span>Số ảnh</span><select value={requestedImageCount} onChange={event => setRequestedImageCount(Number(event.target.value))} disabled={uploading || Boolean(pendingImageUrls.length)} aria-label="Số ảnh muốn chèn">{Array.from({ length: 8 }, (_, index) => index + 1).map(value => <option value={value} key={value}>{value}</option>)}</select></label>
    <button type="button" className="latex-import-button latex-image-button" onClick={() => inputRef.current?.click()} disabled={uploading || Boolean(pendingImageUrls.length)} title="Chọn một hoặc nhiều ảnh; có thể dán ảnh bằng Ctrl/⌘+V">
      {uploading ? <LoaderCircle className="latex-image-spinner" /> : <ImagePlus />} {uploading ? "Đang xử lý…" : requestedImageCount > 1 ? `Chèn ${requestedImageCount} ảnh` : "Chèn ảnh"}
    </button>
    <button type="button" className="latex-import-button latex-image-library-button" onClick={() => setManagerOpen((open) => !open)} aria-expanded={managerOpen} title="Quản lý ảnh của phần thi">
      <FolderOpen /> Ảnh
    </button>
    <span className="latex-image-hint"><ClipboardPaste /> Ctrl/⌘+V để dán</span>
    {message && <span className="latex-image-status" role="status">{message}</span>}
    {pendingImageUrls.length > 0 && <div className="latex-image-caption-dialog" role="dialog" aria-modal="true" aria-labelledby="latex-image-caption-title">
      <div className="latex-image-caption-card">
        <div className="latex-image-caption-heading"><b id="latex-image-caption-title">{pendingImageUrls.length > 1 ? "Chú thích từng ảnh" : "Chú thích ảnh"}</b><small>{pendingImageUrls.length > 1 ? `${pendingImageUrls.length} ảnh · chú thích riêng cho từng ảnh` : "Không bắt buộc · có thể để trống"}</small></div>
        <div className="latex-image-pending-list">{pendingImageUrls.map((url, index) => <label className="latex-image-caption-field" key={`${url}-${index}`}><span>Ảnh {index + 1} · chú thích</span><code>{url.split("/").pop() || url}</code><textarea autoFocus={index === 0} value={captions[index] ?? ""} onChange={event => updatePendingCaption(index, event.target.value)} placeholder={`Ví dụ: Hình ${index + 1}. Mô tả hình minh hoạ.`} rows={2} /></label>)}</div>
        {pendingImageUrls.length > 1 && <>
          <div className="latex-image-row-options">
            <label><span>Ảnh mỗi hàng</span><select value={pendingColumns} onChange={event => updatePendingColumns(Number(event.target.value))}>{Array.from({ length: Math.min(7, pendingImageUrls.length - 1) }, (_, index) => index + 2).map(value => <option value={value} key={value}>{value}</option>)}</select></label>
            <label><span>Rộng mỗi ảnh (px)</span><input type="number" min={80} max={1200} step={1} value={pendingWidth || ""} onChange={event => setPendingWidth(Math.max(0, Number(event.target.value) || 0))} /></label>
            <label><span>Khung cao (px)</span><input type="number" min={40} max={900} step={1} value={pendingFrameHeight || ""} onChange={event => setPendingFrameHeight(Math.max(0, Number(event.target.value) || 0))} /></label>
          </div>
          <p className="latex-image-size-hint">Gợi ý cho {pendingColumns} ảnh: khoảng {suggestedImageDimensions(pendingColumns).width} × {suggestedImageDimensions(pendingColumns).height} px/ảnh để hình và chú thích thẳng hàng. Bạn có thể chỉnh lại.</p>
        </>}
        <div className="latex-image-caption-actions"><button type="button" className="latex-image-caption-cancel" onClick={cancelPendingImage}>Hủy</button><button type="button" className="latex-image-caption-submit" onClick={insertPendingImage}>Chèn {pendingImageUrls.length > 1 ? "cụm ảnh" : "ảnh"}</button></div>
      </div>
    </div>}
    {managerOpen && <div className="latex-image-library" role="dialog" aria-label="Quản lý ảnh phần thi">
      <header className="latex-image-library-head"><div><b>Ảnh trong phần thi</b><small>{images.length} file gốc trên R2</small></div><div><button type="button" className="latex-image-library-refresh" onClick={() => void refreshImages()} disabled={loadingImages} aria-label="Tải lại danh sách ảnh"><RefreshCw className={loadingImages ? "latex-image-spinner" : ""} /></button><button type="button" className="latex-image-library-close" onClick={() => setManagerOpen(false)} aria-label="Đóng thư viện ảnh"><X /></button></div></header>
      {managerError && <p className="latex-image-library-error" role="alert">{managerError}</p>}
      {loadingImages && !images.length && <p className="latex-image-library-empty">Đang đọc R2…</p>}
      {!loadingImages && !images.length && !managerError && <p className="latex-image-library-empty">Chưa có ảnh nào trong phần thi.</p>}
      {!!images.length && <div className="latex-image-library-list">{images.map((image) => {
        const draftUsed = draftSource.includes(image.assetName);
        const locked = image.used || draftUsed;
        return <article className="latex-image-library-item" key={image.assetName}>
          <ExamImageThumbnail image={image} />
          <div className="latex-image-library-copy"><b>{draftUsed ? "Trong bản nháp" : image.used ? "Đang được dùng" : "Chưa dùng"}</b><code>{image.assetName}</code><small>{imageSize(image.size)}{image.lastModified ? ` · ${new Intl.DateTimeFormat("vi-VN", { dateStyle: "short" }).format(new Date(image.lastModified))}` : ""}</small></div>
          <button type="button" className="latex-image-delete" onClick={() => void removeImage(image)} disabled={locked || deletingAsset === image.assetName} title={locked ? "Không thể xoá ảnh đang được tham chiếu" : "Xoá ảnh khỏi R2"} aria-label={`Xoá ${image.assetName}`}><Trash2 />{deletingAsset === image.assetName ? "Đang xoá…" : "Xoá"}</button>
        </article>;
      })}</div>}
      <p className="latex-image-library-note">Chỉ có thể xoá ảnh chưa được dùng. Ảnh trong bản nháp cũng được khoá để không làm hỏng nội dung chưa lưu.</p>
    </div>}
  </div>;
}

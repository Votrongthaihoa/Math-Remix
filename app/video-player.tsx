"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { activeSessionToken, authenticatedFetch } from "../lib/auth-client";
import { apiRequestUrl } from "../lib/api-url";
import LoadingIndicator from "./loading-indicator";

const MEDIA_VIEWER_ORIGIN = "https://media.mathremix.pro.vn";

export type SecureLessonResource = {
  id: string;
  title: string;
  resource_type: "youtube" | "onedrive_video" | "hls_vault" | "external_pdf" | "storage_pdf";
  allow_download: boolean;
  sort_order: number;
  videoToken: string;
  provider_metadata?: Record<string, unknown>;
};

type ResolvedContent = {
  type: SecureLessonResource["resource_type"];
  title: string;
  youtubeId?: string;
  start?: number;
  protectedContent?: "pdf";
  playbackUrl?: string;
  mimeType?: string;
  playbackMode?: "native" | "embed" | "external" | "hls-vault";
};

function SecureViewerState({ label }: { label: string }) {
  return <div className="secure-viewer-state" role="status" aria-live="polite" aria-busy="true"><LoadingIndicator label={label}/></div>;
}

function SecureViewerError({ message, onRetry }: { message: string; onRetry?: () => void }) {
  return <div className="secure-viewer-state error" role="alert"><div><p>{message}</p>{onRetry && <button type="button" className="outline-btn" onClick={onRetry}>Thử tải lại</button>}</div></div>;
}

export default function VideoPlayer({ resource }: { resource: SecureLessonResource }) {
  const [content, setContent] = useState<ResolvedContent | null>(null);
  const [watermarkEmail, setWatermarkEmail] = useState("");
  const [pdfBytes, setPdfBytes] = useState<ArrayBuffer | null>(null);
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoPlaybackError, setVideoPlaybackError] = useState("");
  const [resolutionNonce, setResolutionNonce] = useState(0);
  const videoFrameRef = useRef<HTMLIFrameElement>(null);
  const hlsFrameRef = useRef<HTMLIFrameElement>(null);
  const pdfFrameRef = useRef<HTMLIFrameElement>(null);
  const viewerChannelRef = useRef(crypto.randomUUID());
  const pdfSentRef = useRef(false);
  const pendingDownloadUrlsRef = useRef(new Map<string, number>());

  useEffect(() => () => {
    for (const [url, timer] of pendingDownloadUrlsRef.current) {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    pendingDownloadUrlsRef.current.clear();
  }, []);

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    async function resolveToken() {
      setLoading(true); setError(""); setContent(null);
      if (!supabase) { setError("Chưa cấu hình Supabase."); setLoading(false); return; }
      try {
        const accessToken = await activeSessionToken();
        const { data: userData } = await supabase.auth.getUser(accessToken);
        if (cancelled) return;
        setWatermarkEmail(userData.user?.email || "Học viên AECK");
        const response = await authenticatedFetch("/api/video-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoToken: resource.videoToken }),
          signal: controller.signal,
        });
        const payload = await response.json() as ResolvedContent & { error?: string };
        if (cancelled) return;
        const hasPlayableSource = payload.type === "youtube" ? Boolean(payload.youtubeId) : ["onedrive_video", "hls_vault"].includes(payload.type) ? Boolean(payload.playbackUrl) : payload.protectedContent === "pdf";
        if (!response.ok || !hasPlayableSource) setError(payload.error || "Không thể mở nội dung.");
        else setContent({ ...payload, title: payload.title || resource.title });
      } catch (value) {
        if (!cancelled && (!(value instanceof Error) || value.name !== "AbortError")) setError(value instanceof Error ? value.message : "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void resolveToken();
    return () => { cancelled = true; controller.abort(); };
  }, [resource.id, resource.videoToken, resource.title, resolutionNonce]);

  function retryVideoSource() {
    setVideoPlaybackError("");
    viewerChannelRef.current = crypto.randomUUID();
    setResolutionNonce(value => value + 1);
  }

  const sendEmbeddedVideoSource = useCallback((resolved: ResolvedContent | null) => {
    if (!resolved) return;
    if (resolved.type === "youtube") {
      if (!resolved.youtubeId) return;
      videoFrameRef.current?.contentWindow?.postMessage({ type: "remix:set-video-source", videoId: resolved.youtubeId, start: resolved.start ?? 0, watermark: watermarkEmail, channel: viewerChannelRef.current }, MEDIA_VIEWER_ORIGIN);
      return;
    }
    if (!resolved.playbackUrl || !["onedrive_video", "hls_vault"].includes(resolved.type)) return;
    const frameRef = resolved.type === "hls_vault" ? hlsFrameRef : videoFrameRef;
    const configuredPlaybackUrl = resolved.type === "hls_vault" ? apiRequestUrl(resolved.playbackUrl) : resolved.playbackUrl;
    const playbackUrl = typeof configuredPlaybackUrl === "string"
      ? configuredPlaybackUrl
      : configuredPlaybackUrl instanceof URL
        ? configuredPlaybackUrl.toString()
        : configuredPlaybackUrl.url;
    frameRef.current?.contentWindow?.postMessage({
      type: "remix:set-video-source",
      src: playbackUrl,
      mimeType: resolved.mimeType || (resolved.type === "hls_vault" ? "application/vnd.apple.mpegurl" : "video/mp4"),
      title: resolved.title,
      watermark: watermarkEmail,
      channel: viewerChannelRef.current,
    }, MEDIA_VIEWER_ORIGIN);
  }, [watermarkEmail]);

  function initializeViewer(frame: HTMLIFrameElement | null) {
    frame?.contentWindow?.postMessage({ type: "remix:viewer-init", channel: viewerChannelRef.current }, MEDIA_VIEWER_ORIGIN);
  }

  useEffect(() => {
    if (!content || (content.type === "youtube" ? !content.youtubeId : !content.playbackUrl || !["onedrive_video", "hls_vault"].includes(content.type))) return;
    const frameRef = content.type === "hls_vault" ? hlsFrameRef : videoFrameRef;
    const frameWindow = frameRef.current?.contentWindow;
    function handleVideoPlayerMessage(event: MessageEvent) {
      if (event.origin !== MEDIA_VIEWER_ORIGIN || event.source !== frameWindow || event.data?.channel !== viewerChannelRef.current) return;
      if (event.data?.type === "remix:video-player-ready") sendEmbeddedVideoSource(content);
      if (event.data?.type === "remix:video-player-error") setVideoPlaybackError(typeof event.data.message === "string" ? event.data.message : "Không thể phát video này.");
    }
    window.addEventListener("message", handleVideoPlayerMessage);
    return () => window.removeEventListener("message", handleVideoPlayerMessage);
  }, [content, sendEmbeddedVideoSource]);

  useEffect(() => {
    if (!content || content.protectedContent !== "pdf" || !pdfBytes) return;
    const resolved = content;
    const bytes = pdfBytes;
    function handlePdfViewerMessage(event: MessageEvent) {
      if (event.origin !== MEDIA_VIEWER_ORIGIN || event.source !== pdfFrameRef.current?.contentWindow || event.data?.channel !== viewerChannelRef.current || event.data?.type !== "remix:pdf-viewer-ready" || pdfSentRef.current) return;
      pdfSentRef.current = true;
      pdfFrameRef.current?.contentWindow?.postMessage({ type: "remix:set-pdf-source", bytes, mimeType: "application/pdf", title: resolved.title, allowDownload: resource.allow_download, channel: viewerChannelRef.current }, MEDIA_VIEWER_ORIGIN, [bytes]);
    }
    window.addEventListener("message", handlePdfViewerMessage);
    return () => window.removeEventListener("message", handlePdfViewerMessage);
  }, [content, pdfBytes, resource.allow_download]);

  useEffect(() => {
    if (!content || content.type === "youtube") return;
    const resolved = content;
    let cancelled = false;
    const controller = new AbortController();
    async function downloadWatermarkedPdf(event: MessageEvent) {
      if (event.origin !== MEDIA_VIEWER_ORIGIN || event.source !== pdfFrameRef.current?.contentWindow || event.data?.channel !== viewerChannelRef.current || event.data?.type !== "remix:pdf-download-request") return;
      const frame = pdfFrameRef.current?.contentWindow;
      try {
        if (!supabase) throw new Error("Chưa cấu hình Supabase.");
        const response = await authenticatedFetch("/api/lesson-pdf-download", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoToken: resource.videoToken }),
          signal: controller.signal,
        });
        if (!response.ok) {
          const payload = await response.json() as { error?: string };
          throw new Error(payload.error || "Không thể tải PDF đã đóng watermark.");
        }
        const disposition = response.headers.get("content-disposition") || "";
        const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const filename = encodedName ? decodeURIComponent(encodedName) : `${resolved.title.replace(/\.pdf$/i, "")}-watermarked.pdf`;
        const blobUrl = URL.createObjectURL(await response.blob());
        if (cancelled) {
          URL.revokeObjectURL(blobUrl);
          return;
        }
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        const timer = window.setTimeout(() => {
          URL.revokeObjectURL(blobUrl);
          pendingDownloadUrlsRef.current.delete(blobUrl);
        }, 1000);
        pendingDownloadUrlsRef.current.set(blobUrl, timer);
        if (!cancelled) frame?.postMessage({ type: "remix:pdf-download-result", ok: true, channel: viewerChannelRef.current }, MEDIA_VIEWER_ORIGIN);
      } catch (downloadError) {
        if (!cancelled && (!(downloadError instanceof Error) || downloadError.name !== "AbortError")) frame?.postMessage({ type: "remix:pdf-download-result", ok: false, error: downloadError instanceof Error ? downloadError.message : "Không thể tải PDF.", channel: viewerChannelRef.current }, MEDIA_VIEWER_ORIGIN);
      }
    }
    window.addEventListener("message", downloadWatermarkedPdf);
    return () => {
      cancelled = true;
      controller.abort();
      window.removeEventListener("message", downloadWatermarkedPdf);
    };
  }, [content, resource.videoToken]);

  useEffect(() => {
    if (content?.protectedContent !== "pdf" || content.type === "youtube") return;
    let cancelled = false;
    const controller = new AbortController();
    async function loadPdfIntoMemory() {
      setPdfLoading(true);
      setPdfError("");
      setPdfBytes(null);
      pdfSentRef.current = false;
      try {
        if (!supabase) throw new Error("Chưa cấu hình Supabase.");
        const response = await authenticatedFetch("/api/resource-content", {
          method: "POST",
          headers: { "content-type": "application/json", accept: "application/json" },
          body: JSON.stringify({ videoToken: resource.videoToken }),
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as { error?: string; encoding?: string; mimeType?: string; data?: string } | null;
        if (cancelled) return;
        if (!response.ok) throw new Error(payload?.error || `Máy chủ PDF trả về mã ${response.status}.`);
        if (payload?.encoding !== "base64" || !payload.data) throw new Error("Tài liệu PDF không có dữ liệu.");
        const binary = atob(payload.data);
        const bytes = new Uint8Array(binary.length);
        for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
        if (!cancelled) {
          setPdfError("");
          setPdfBytes(bytes.buffer);
        }
      } catch (loadError) {
        if (!cancelled && (!(loadError instanceof Error) || loadError.name !== "AbortError")) setPdfError(loadError instanceof Error ? loadError.message : "Không thể tải tài liệu PDF.");
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    }
    void loadPdfIntoMemory();
    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [content, resource.videoToken]);

  if (loading) return <SecureViewerState label="Đang xác thực nội dung…"/>;
  if (error || !content) return <SecureViewerError message={error || "Không thể mở nội dung."} onRetry={retryVideoSource}/>;

  if (content.type === "youtube") {
    if (!content.youtubeId) return <SecureViewerError message="Liên kết YouTube không hợp lệ."/>;
    return <iframe ref={videoFrameRef} key={`${resource.id}:${resolutionNonce}`} className="lesson-frame lesson-video" src={`${MEDIA_VIEWER_ORIGIN}/viewer/video?mode=youtube`} title={content.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" onLoad={event => initializeViewer(event.currentTarget)}/>;
  }

  if (content.type === "hls_vault") {
    if (!content.playbackUrl) return <SecureViewerError message="Không lấy được nguồn phát HLS." onRetry={retryVideoSource}/>;
    if (content.playbackMode === "hls-vault") {
      if (videoPlaybackError) return <SecureViewerError message={videoPlaybackError} onRetry={retryVideoSource}/>;
      return <iframe
        ref={hlsFrameRef}
        key={`${resource.id}:${resolutionNonce}`}
        className="lesson-frame lesson-video"
        src={`${MEDIA_VIEWER_ORIGIN}/viewer/video?mode=hls`}
        title={content.title}
        allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
        sandbox="allow-scripts allow-same-origin"
        referrerPolicy="no-referrer"
        onLoad={event => initializeViewer(event.currentTarget)}
      />;
    }

  }

  if (content.type === "onedrive_video") {
    if (videoPlaybackError) return <SecureViewerError message={videoPlaybackError} onRetry={retryVideoSource}/>;
    return <iframe
      ref={videoFrameRef}
      key={`${resource.id}:${resolutionNonce}`}
      className="lesson-frame lesson-video"
      src={`${MEDIA_VIEWER_ORIGIN}/viewer/video?mode=native`}
      title={content.title}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      sandbox="allow-scripts allow-same-origin"
      referrerPolicy="no-referrer"
      onLoad={event => initializeViewer(event.currentTarget)}
    />;
  }

  if (content.protectedContent !== "pdf") return <SecureViewerError message="Không thể mở tài liệu PDF."/>;
  if (pdfLoading || !pdfBytes && !pdfError) return <SecureViewerState label="Đang tải tài liệu PDF…"/>;
  if (pdfError) return <SecureViewerError message={pdfError} onRetry={retryVideoSource}/>;
  const viewerUrl = `${MEDIA_VIEWER_ORIGIN}/viewer/pdf`;
  return <div className="lesson-document"><iframe ref={pdfFrameRef} className="lesson-frame" src={viewerUrl} title={content.title} sandbox="allow-scripts allow-same-origin" referrerPolicy="no-referrer" onLoad={event => initializeViewer(event.currentTarget)}/></div>;
}






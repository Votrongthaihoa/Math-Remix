"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { activeSessionToken, authenticatedFetch } from "../lib/auth-client";
import LoadingIndicator from "./loading-indicator";
import "plyr/dist/plyr.css";
import "./hls-player.css";

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

export default function VideoPlayer({ resource }: { resource: SecureLessonResource }) {
  const [content, setContent] = useState<ResolvedContent | null>(null);
  const [watermarkEmail, setWatermarkEmail] = useState("");
  const [pdfObjectUrl, setPdfObjectUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [videoPlaybackError, setVideoPlaybackError] = useState("");
  const [resolutionNonce, setResolutionNonce] = useState(0);
  const videoFrameRef = useRef<HTMLIFrameElement>(null);
  const hlsVideoRef = useRef<HTMLVideoElement>(null);
  const hlsInstanceRef = useRef<{ destroy: () => void } | null>(null);
  const plyrInstanceRef = useRef<{ destroy: () => void } | null>(null);
  const pdfFrameRef = useRef<HTMLIFrameElement>(null);
  const pendingDownloadUrlsRef = useRef(new Map<string, number>());

  useEffect(() => () => {
    for (const [url, timer] of pendingDownloadUrlsRef.current) {
      window.clearTimeout(timer);
      URL.revokeObjectURL(url);
    }
    pendingDownloadUrlsRef.current.clear();
    hlsInstanceRef.current?.destroy();
    hlsInstanceRef.current = null;
    plyrInstanceRef.current?.destroy();
    plyrInstanceRef.current = null;
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
        setWatermarkEmail(userData.user?.email || "Học viên REMIX");
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

  function retryMicrosoftVideo() {
    setVideoPlaybackError("");
    setResolutionNonce(value => value + 1);
  }

  const sendMicrosoftVideoSource = useCallback((resolved: ResolvedContent | null) => {
    if (resolved?.type !== "onedrive_video" || !resolved.playbackUrl) return;
    videoFrameRef.current?.contentWindow?.postMessage({
      type: "remix:set-video-source",
      src: resolved.playbackUrl,
      mimeType: resolved.mimeType || "video/mp4",
      title: resolved.title,
    }, window.location.origin);
  }, []);

  useEffect(() => {
    if (content?.type !== "onedrive_video" || !content.playbackUrl) return;
    const frameWindow = videoFrameRef.current?.contentWindow;
    function handleVideoPlayerMessage(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== frameWindow) return;
      if (event.data?.type === "remix:video-player-ready") sendMicrosoftVideoSource(content);
      if (event.data?.type === "remix:video-player-error") setVideoPlaybackError(typeof event.data.message === "string" ? event.data.message : "Không thể phát video Microsoft.");
    }
    window.addEventListener("message", handleVideoPlayerMessage);
    return () => window.removeEventListener("message", handleVideoPlayerMessage);
  }, [content, sendMicrosoftVideoSource]);

  useEffect(() => {
    if (!content || content.type === "youtube") return;
    const resolved = content;
    let cancelled = false;
    const controller = new AbortController();
    async function downloadWatermarkedPdf(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== pdfFrameRef.current?.contentWindow || event.data?.type !== "remix:pdf-download-request") return;
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
        if (!cancelled) frame?.postMessage({ type: "remix:pdf-download-result", ok: true }, window.location.origin);
      } catch (downloadError) {
        if (!cancelled && (!(downloadError instanceof Error) || downloadError.name !== "AbortError")) frame?.postMessage({ type: "remix:pdf-download-result", ok: false, error: downloadError instanceof Error ? downloadError.message : "Không thể tải PDF." }, window.location.origin);
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
    if (content?.type !== "hls_vault" || content.playbackMode !== "hls-vault" || !content.playbackUrl || !hlsVideoRef.current) return;
    const video = hlsVideoRef.current;
    let cancelled = false;
    let localPlyr: { destroy: () => void } | null = null;
    let localHls: { destroy: () => void } | null = null;
    const destroyPlyr = () => {
      const instance = localPlyr;
      localPlyr = null;
      if (!instance) return;
      instance.destroy();
      if (plyrInstanceRef.current === instance) plyrInstanceRef.current = null;
    };
    const destroyHls = () => {
      const instance = localHls;
      localHls = null;
      if (!instance) return;
      instance.destroy();
      if (hlsInstanceRef.current === instance) hlsInstanceRef.current = null;
    };
    hlsInstanceRef.current?.destroy();
    hlsInstanceRef.current = null;
    plyrInstanceRef.current?.destroy();
    plyrInstanceRef.current = null;
    video.removeAttribute("src");
    video.load();

    async function mountHls() {
      try {
        const supportsNativeHls = Boolean(video.canPlayType("application/vnd.apple.mpegurl"));
        const plyrModulePromise = import("plyr");
        const hlsModulePromise = supportsNativeHls ? null : import("hls.js");
        if (supportsNativeHls) {
          video.src = content!.playbackUrl!;
        } else {
          const hlsModule = await hlsModulePromise!;
          if (cancelled) return;
          const Hls = hlsModule.default;
          if (!Hls.isSupported()) throw new Error("Trình duyệt này không hỗ trợ HLS/MSE.");
          const hls = new Hls({ enableWorker: true, lowLatencyMode: false });
          localHls = hls;
          hlsInstanceRef.current = hls;
          hls.on(Hls.Events.ERROR, (_event, data) => {
            if (data.fatal) setVideoPlaybackError("Không thể phát HLS. Hãy thử lấy nguồn phát mới.");
          });
          hls.loadSource(content!.playbackUrl!);
          hls.attachMedia(video);
        }
        if (cancelled) return;
        const plyrModule = await plyrModulePromise;
        if (cancelled) return;
        const Plyr = plyrModule.default;
        const plyr = new Plyr(video, {
          controls: ["play-large", "play", "progress", "current-time", "mute", "volume", "settings", "fullscreen"],
          settings: ["speed"],
          disableContextMenu: true,
          fullscreen: { enabled: true, fallback: true, iosNative: false },
          storage: { enabled: false },
          i18n: {
            restart: "Phát lại",
            play: "Phát",
            pause: "Tạm dừng",
            seek: "Tua",
            seekLabel: "Tiến tới {seektime} giây",
            played: "Đã phát",
            buffered: "Đã tải",
            currentTime: "Thời gian hiện tại",
            duration: "Thời lượng",
            volume: "Âm lượng",
            settings: "Cài đặt",
            speed: "Tốc độ",
            normal: "Bình thường",
            enterFullscreen: "Mở toàn màn hình",
            exitFullscreen: "Thoát toàn màn hình",
          },
        });
        localPlyr = plyr;
        plyrInstanceRef.current = plyr;
      } catch (value) {
        destroyHls();
        destroyPlyr();
        if (!cancelled) setVideoPlaybackError(value instanceof Error ? value.message : "Không thể khởi tạo trình phát HLS.");
      }
    }
    void mountHls();
    return () => {
      cancelled = true;
      destroyHls();
      destroyPlyr();
      video.removeAttribute("src");
      video.load();
    };
  }, [content]);

  useEffect(() => {
    if (content?.protectedContent !== "pdf" || content.type === "youtube") return;
    let cancelled = false;
    let objectUrl = "";
    const controller = new AbortController();
    async function loadPdfIntoMemory() {
      setPdfLoading(true);
      setPdfError("");
      setPdfObjectUrl("");
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
        objectUrl = URL.createObjectURL(new Blob([bytes], { type: payload.mimeType || "application/pdf" }));
        if (!cancelled) {
          setPdfError("");
          setPdfObjectUrl(objectUrl);
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
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [content, resource.videoToken]);

  if (loading) return <div className="secure-viewer-state"><LoadingIndicator label="Đang xác thực nội dung…" /></div>;
  if (error || !content) return <div className="secure-viewer-state error">{error || "Không thể mở nội dung."}</div>;

  if (content.type === "youtube") {
    if (!content.youtubeId) return <div className="secure-viewer-state error">Liên kết YouTube không hợp lệ.</div>;
    return <iframe className="lesson-frame lesson-video" src={`/yt-embed-player.html?v=${encodeURIComponent(content.youtubeId)}&start=${content.start ?? 0}&wm=${encodeURIComponent(watermarkEmail)}`} title={content.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen/>;
  }

  if (content.type === "hls_vault") {
    if (!content.playbackUrl) return <div className="secure-viewer-state error">Không lấy được nguồn phát HLS.</div>;
    if (content.playbackMode === "hls-vault") {
      if (videoPlaybackError) return <div className="secure-viewer-state error" role="alert"><div><p>{videoPlaybackError}</p><button type="button" className="outline-btn" onClick={retryMicrosoftVideo}>Lấy nguồn phát mới</button></div></div>;
      return <div className="lesson-microsoft-video"><video ref={hlsVideoRef} className="lesson-video lesson-native-video" controls controlsList="nodownload noremoteplayback" disablePictureInPicture playsInline preload="metadata" title={content.title}>Trình duyệt của bạn không hỗ trợ phát HLS.</video><div className="lesson-video-status" role="status"><span>Video HLS được phát qua gateway có kiểm soát quyền truy cập.</span></div></div>;
    }

  }

  if (content.type === "onedrive_video") {
    if (videoPlaybackError) return <div className="secure-viewer-state error" role="alert"><div><p>{videoPlaybackError}</p><button type="button" className="outline-btn" onClick={retryMicrosoftVideo}>Lấy nguồn phát mới</button></div></div>;
    return <iframe
      ref={videoFrameRef}
      key={`${resource.id}:${resolutionNonce}`}
      className="lesson-frame lesson-video"
      src={`/yt-embed-player.html?mode=native&wm=${encodeURIComponent(watermarkEmail)}`}
      title={content.title}
      allow="autoplay; encrypted-media; picture-in-picture; fullscreen"
      allowFullScreen
      onLoad={() => sendMicrosoftVideoSource(content)}
    />;
  }

  if (content.protectedContent !== "pdf") return <div className="secure-viewer-state error">Không thể mở tài liệu PDF.</div>;
  if (pdfLoading || !pdfObjectUrl && !pdfError) return <div className="secure-viewer-state"><LoadingIndicator label="Đang tải tài liệu PDF…" /></div>;
  if (pdfError) return <div className="secure-viewer-state error">{pdfError}</div>;
  const viewerUrl = `/pdf-viewer.html?file=${encodeURIComponent(pdfObjectUrl)}&title=${encodeURIComponent(content.title)}&download=${resource.allow_download ? "1" : "0"}`;
  return <div className="lesson-document"><iframe ref={pdfFrameRef} className="lesson-frame" src={viewerUrl} title={content.title}/></div>;
}

"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import { activeSessionToken, authenticatedFetch } from "../lib/auth-client";
import LoadingIndicator from "./loading-indicator";

export type SecureLessonResource = {
  id: string;
  title: string;
  resource_type: "youtube" | "external_pdf" | "storage_pdf";
  allow_download: boolean;
  sort_order: number;
  videoToken: string;
};

type ResolvedContent = {
  type: SecureLessonResource["resource_type"];
  title: string;
  youtubeId?: string;
  start?: number;
  protectedContent?: "pdf";
};

export default function VideoPlayer({ resource }: { resource: SecureLessonResource }) {
  const [content, setContent] = useState<ResolvedContent | null>(null);
  const [watermarkEmail, setWatermarkEmail] = useState("");
  const [pdfObjectUrl, setPdfObjectUrl] = useState("");
  const [pdfLoading, setPdfLoading] = useState(false);
  const [pdfError, setPdfError] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pdfFrameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolveToken() {
      setLoading(true); setError(""); setContent(null);
      if (!supabase) { setError("Chưa cấu hình Supabase."); setLoading(false); return; }
      try {
        const accessToken = await activeSessionToken();
        const { data: userData } = await supabase.auth.getUser(accessToken);
        setWatermarkEmail(userData.user?.email || "Học viên REMIX");
        const response = await authenticatedFetch("/api/video-token", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoToken: resource.videoToken }),
        });
        const payload = await response.json() as ResolvedContent & { error?: string };
        if (cancelled) return;
        const hasPlayableSource = payload.type === "youtube" ? Boolean(payload.youtubeId) : payload.protectedContent === "pdf";
        if (!response.ok || !hasPlayableSource) setError(payload.error || "Không thể mở nội dung.");
        else setContent({ ...payload, title: payload.title || resource.title });
      } catch (value) {
        if (!cancelled) setError(value instanceof Error ? value.message : "Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại.");
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void resolveToken();
    return () => { cancelled = true; };
  }, [resource.id, resource.videoToken, resource.title]);

  useEffect(() => {
    if (!content || content.type === "youtube") return;
    const resolved = content;
    async function downloadWatermarkedPdf(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== pdfFrameRef.current?.contentWindow || event.data?.type !== "remix:pdf-download-request") return;
      const frame = pdfFrameRef.current?.contentWindow;
      try {
        if (!supabase) throw new Error("Chưa cấu hình Supabase.");
        const response = await authenticatedFetch("/api/lesson-pdf-download", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ videoToken: resource.videoToken }),
        });
        if (!response.ok) {
          const payload = await response.json() as { error?: string };
          throw new Error(payload.error || "Không thể tải PDF đã đóng watermark.");
        }
        const disposition = response.headers.get("content-disposition") || "";
        const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const filename = encodedName ? decodeURIComponent(encodedName) : `${resolved.title.replace(/\.pdf$/i, "")}-watermarked.pdf`;
        const blobUrl = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = blobUrl;
        link.download = filename;
        document.body.append(link);
        link.click();
        link.remove();
        setTimeout(() => URL.revokeObjectURL(blobUrl), 1000);
        frame?.postMessage({ type: "remix:pdf-download-result", ok: true }, window.location.origin);
      } catch (downloadError) {
        frame?.postMessage({ type: "remix:pdf-download-result", ok: false, error: downloadError instanceof Error ? downloadError.message : "Không thể tải PDF." }, window.location.origin);
      }
    }
    window.addEventListener("message", downloadWatermarkedPdf);
    return () => window.removeEventListener("message", downloadWatermarkedPdf);
  }, [content, resource.videoToken]);

  useEffect(() => {
    if (content?.protectedContent !== "pdf" || content.type === "youtube") return;
    let cancelled = false;
    let objectUrl = "";
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
        });
        const payload = await response.json().catch(() => null) as { error?: string; encoding?: string; mimeType?: string; data?: string } | null;
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
        if (!cancelled) setPdfError(loadError instanceof Error ? loadError.message : "Không thể tải tài liệu PDF.");
      } finally {
        if (!cancelled) setPdfLoading(false);
      }
    }
    void loadPdfIntoMemory();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [content, resource.videoToken]);

  if (loading) return <div className="secure-viewer-state"><LoadingIndicator label="Đang xác thực nội dung…" /></div>;
  if (error || !content) return <div className="secure-viewer-state error">{error || "Không thể mở nội dung."}</div>;

  if (content.type === "youtube") {
    if (!content.youtubeId) return <div className="secure-viewer-state error">Liên kết YouTube không hợp lệ.</div>;
    return <iframe className="lesson-frame lesson-video" src={`/yt-embed-player.html?v=${encodeURIComponent(content.youtubeId)}&start=${content.start ?? 0}&wm=${encodeURIComponent(watermarkEmail)}`} title={content.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen/>;
  }

  if (content.protectedContent !== "pdf") return <div className="secure-viewer-state error">Không thể mở tài liệu PDF.</div>;
  if (pdfLoading || !pdfObjectUrl && !pdfError) return <div className="secure-viewer-state"><LoadingIndicator label="Đang tải tài liệu PDF…" /></div>;
  if (pdfError) return <div className="secure-viewer-state error">{pdfError}</div>;
  const viewerUrl = `/pdf-viewer.html?file=${encodeURIComponent(pdfObjectUrl)}&title=${encodeURIComponent(content.title)}&download=${resource.allow_download ? "1" : "0"}`;
  return <div className="lesson-document"><iframe ref={pdfFrameRef} className="lesson-frame" src={viewerUrl} title={content.title}/></div>;
}

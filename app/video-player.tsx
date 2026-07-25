"use client";

import { useEffect, useRef, useState } from "react";
import { supabase } from "../lib/supabase";
import LoadingIndicator from "./loading-indicator";

export type SecureLessonResource = {
  id: string;
  title: string;
  resource_type: "youtube" | "external_pdf" | "storage_pdf";
  allow_download: boolean;
  sort_order: number;
  videoToken: string;
};

type ResolvedContent = { url: string; type: SecureLessonResource["resource_type"]; title: string };

function youtubeSource(url: string) {
  try {
    const parsed = new URL(url);
    const id = parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop() || "";
    const start = Number(parsed.searchParams.get("t") || parsed.searchParams.get("start") || 0) || 0;
    return { id, start };
  } catch {
    return { id: "", start: 0 };
  }
}

export default function VideoPlayer({ resource }: { resource: SecureLessonResource }) {
  const [content, setContent] = useState<ResolvedContent | null>(null);
  const [watermarkEmail, setWatermarkEmail] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const pdfFrameRef = useRef<HTMLIFrameElement>(null);

  useEffect(() => {
    let cancelled = false;
    async function resolveToken() {
      setLoading(true); setError(""); setContent(null);
      if (!supabase) { setError("Chưa cấu hình Supabase."); setLoading(false); return; }
      const { data } = await supabase.auth.getSession();
      const accessToken = data.session?.access_token;
      if (!accessToken) { setError("Phiên đăng nhập đã hết hạn."); setLoading(false); return; }
      setWatermarkEmail(data.session?.user.email || "Học viên REMIX");
      const response = await fetch("/api/video-token", {
        method: "POST",
        headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
        body: JSON.stringify({ videoToken: resource.videoToken }),
      });
      const payload = await response.json() as ResolvedContent & { error?: string };
      if (cancelled) return;
      if (!response.ok || !payload.url) setError(payload.error || "Không thể mở nội dung.");
      else setContent({ url: payload.url, type: payload.type, title: payload.title || resource.title });
      setLoading(false);
    }
    void resolveToken();
    return () => { cancelled = true; };
  }, [resource.id, resource.videoToken, resource.title]);

  useEffect(() => {
    if (!content || content.type === "youtube") return;
    async function downloadWatermarkedPdf(event: MessageEvent) {
      if (event.origin !== window.location.origin || event.source !== pdfFrameRef.current?.contentWindow || event.data?.type !== "remix:pdf-download-request") return;
      const frame = pdfFrameRef.current?.contentWindow;
      try {
        if (!supabase) throw new Error("Chưa cấu hình Supabase.");
        const { data } = await supabase.auth.getSession();
        const accessToken = data.session?.access_token;
        if (!accessToken) throw new Error("Phiên đăng nhập đã hết hạn.");
        const response = await fetch("/api/lesson-pdf-download", {
          method: "POST",
          headers: { authorization: `Bearer ${accessToken}`, "content-type": "application/json" },
          body: JSON.stringify({ videoToken: resource.videoToken }),
        });
        if (!response.ok) {
          const payload = await response.json() as { error?: string };
          throw new Error(payload.error || "Không thể tải PDF đã đóng watermark.");
        }
        const disposition = response.headers.get("content-disposition") || "";
        const encodedName = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
        const filename = encodedName ? decodeURIComponent(encodedName) : `${content.title.replace(/\.pdf$/i, "")}-watermarked.pdf`;
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

  if (loading) return <div className="secure-viewer-state"><LoadingIndicator label="Đang xác thực nội dung…" /></div>;
  if (error || !content) return <div className="secure-viewer-state error">{error || "Không thể mở nội dung."}</div>;

  if (content.type === "youtube") {
    const source = youtubeSource(content.url);
    if (!source.id) return <div className="secure-viewer-state error">Liên kết YouTube không hợp lệ.</div>;
    return <iframe className="lesson-frame lesson-video" src={`/yt-embed-player.html?v=${encodeURIComponent(source.id)}&start=${source.start}&wm=${encodeURIComponent(watermarkEmail)}`} title={content.title} allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; fullscreen" allowFullScreen/>;
  }

  const viewerUrl = `/pdf-viewer.html?file=${encodeURIComponent(content.url)}&title=${encodeURIComponent(content.title)}&download=${resource.allow_download ? "1" : "0"}`;
  return <div className="lesson-document"><iframe ref={pdfFrameRef} className="lesson-frame" src={viewerUrl} title={content.title}/></div>;
}

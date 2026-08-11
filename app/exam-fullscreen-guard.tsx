"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, Maximize2 } from "lucide-react";
import "./exam-fullscreen-guard.css";

/** Request fullscreen while still inside the candidate's start-button gesture. */
export async function enterExamFullscreen() {
  if (typeof document === "undefined") return false;
  if (document.fullscreenElement) return true;
  const root = document.documentElement;
  if (!document.fullscreenEnabled || typeof root.requestFullscreen !== "function") return false;
  try {
    await root.requestFullscreen();
    return Boolean(document.fullscreenElement);
  } catch {
    return false;
  }
}

export async function leaveExamFullscreen() {
  if (typeof document === "undefined" || !document.fullscreenElement || typeof document.exitFullscreen !== "function") return;
  try { await document.exitFullscreen(); } catch { /* the browser may already be leaving fullscreen */ }
}

export default function ExamFullscreenGuard() {
  const [isFullscreen, setIsFullscreen] = useState(() => typeof document !== "undefined" && Boolean(document.fullscreenElement));
  const supported = typeof document !== "undefined" && document.fullscreenEnabled && typeof document.documentElement.requestFullscreen === "function";

  useEffect(() => {
    const sync = () => setIsFullscreen(Boolean(document.fullscreenElement));
    document.addEventListener("fullscreenchange", sync);
    const frame = window.requestAnimationFrame(sync);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("fullscreenchange", sync);
      void leaveExamFullscreen();
    };
  }, []);

  if (isFullscreen) return null;
  return <div className="exam-fullscreen-shade" role="alertdialog" aria-modal="true" aria-labelledby="exam-fullscreen-title">
    <section className="exam-fullscreen-card">
      <span className="exam-fullscreen-icon"><AlertTriangle /></span>
      <span className="exam-fullscreen-kicker">CHẾ ĐỘ THI</span>
      <h2 id="exam-fullscreen-title">Bài thi yêu cầu toàn màn hình</h2>
      <p>{supported ? "Bạn đã rời chế độ toàn màn hình. Hãy quay lại toàn màn hình để tiếp tục làm bài." : "Trình duyệt hiện tại không cho phép toàn màn hình. Hãy mở bài thi bằng Chrome hoặc Edge trên máy tính rồi thử lại."}</p>
      <button type="button" className="exam-fullscreen-button" disabled={!supported} onClick={() => { void enterExamFullscreen(); }}><Maximize2 />{supported ? "Quay lại toàn màn hình" : "Trình duyệt không hỗ trợ"}</button>
      <small>Chế độ luyện tập không yêu cầu toàn màn hình.</small>
    </section>
  </div>;
}

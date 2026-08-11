"use client";

import { useState } from "react";
import { X } from "lucide-react";
import { normalizeExamType, thptqgSubjectForSection } from "../../lib/exam-config";
import type { ThptqgExam, ThptqgRoom, ThptqgSection } from "./ThptqgSubjectDashboard";
import "./thptqg.css";

export default function ThptqgConfirmation({ room, exam, section, questionCount, candidateName, mode, starting, error, onStart, onExit }: {
  room: ThptqgRoom;
  exam: ThptqgExam;
  section?: ThptqgSection;
  questionCount: number;
  candidateName: string;
  mode: "practice" | "exam";
  starting: boolean;
  error: string;
  onStart: () => void;
  onExit: () => void;
}) {
  const [guideOpen, setGuideOpen] = useState(false);
  const meta = section ? thptqgSubjectForSection(section.subject_code, section.title) : null;
  const subjectTitle = meta?.title || section?.title || "Môn thi";
  const duration = section?.duration_minutes ?? meta?.duration_minutes ?? exam.duration_minutes;
  const examType = normalizeExamType(room.exam_type || exam.exam_type);
  const guideText = exam.description?.trim()
    || room.description?.trim()
    || meta?.structure
    || `Môn ${subjectTitle} gồm ${questionCount} câu hỏi.`;
  return <main className="exam-confirmation-page thptqg-confirmation-page" aria-labelledby="thptqg-confirmation-title">
    <section className="exam-confirmation-card thptqg-confirmation-card">
       <div className="exam-confirmation-logo-wrap thptqg-confirmation-logo-wrap">
         <div className="exam-confirmation-logo thptqg-confirmation-logo">{examType === "THPTQG" ? <span className="tsa-math-remix-logo thptqg-confirmation-wordmark" aria-label="MATH REMIX">MATH <b>REMIX</b></span> : <span className="thptqg-confirmation-type-mark">V-SAT</span>}</div>
      </div>
      <h1 id="thptqg-confirmation-title" className="exam-confirmation-title thptqg-confirmation-title">Xác nhận thông tin dự thi</h1>
      <div className="exam-confirmation-info thptqg-confirmation-info">
        <p><span>Họ tên</span><strong>{candidateName}</strong></p>
        <p><span>Môn thi</span><strong>{subjectTitle}</strong></p>
        <p><span>Thời gian làm bài</span><strong>{duration} phút</strong></p>
      </div>
      <p className="exam-confirmation-note thptqg-confirmation-note">Lưu ý: Bằng việc nhấn nút “Bắt đầu môn” hệ thống sẽ bắt đầu tính giờ cho môn {subjectTitle} của bạn</p>
      {mode === "exam" && <p className="exam-fullscreen-reminder">Chế độ thi yêu cầu toàn màn hình và sẽ nhắc nếu bạn rời khỏi màn hình.</p>}
      {error && <p className="exam-confirmation-error thptqg-error" role="alert">{error}</p>}
      <button type="button" className="exam-confirmation-start thptqg-confirmation-start" onClick={onStart} disabled={starting}>{starting ? "Đang bắt đầu…" : "Bắt đầu môn"}</button>
      <div className="exam-confirmation-links thptqg-confirmation-links"><button type="button" onClick={onExit}>Quay lại</button><button type="button" onClick={() => setGuideOpen(true)}>Hướng dẫn</button></div>
    </section>
    {guideOpen && <div className="thptqg-confirmation-guide-shade" onMouseDown={event => { if (event.target === event.currentTarget) setGuideOpen(false); }}>
      <section className="thptqg-confirmation-guide" role="dialog" aria-modal="true" aria-labelledby="thptqg-guide-title">
        <button type="button" className="thptqg-confirmation-guide-close" onClick={() => setGuideOpen(false)} aria-label="Đóng hướng dẫn"><X/></button>
         <span>HƯỚNG DẪN DỰ THI</span><h2 id="thptqg-guide-title">Môn {subjectTitle}</h2><p>{guideText}</p><small>{room.title} · {mode === "exam" ? "Thực chiến" : "Luyện tập"}</small>
        <button type="button" className="thptqg-confirmation-guide-done" onClick={() => setGuideOpen(false)}>Đã hiểu</button>
      </section>
    </div>}
  </main>;
}

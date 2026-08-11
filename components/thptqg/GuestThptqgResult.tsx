"use client";

import { useState } from "react";
import { ArrowLeft, BarChart3, CheckCircle2, ChevronRight, Clock3, RotateCcw } from "lucide-react";
import ThptqgExamRenderer, { type ThptqgAnswerValue, type ThptqgQuestion } from "./ThptqgExamRenderer";
import "./thptqg.css";

type AnswerValue = string | string[];

export type GuestResultQuestion = {
  id: string;
  selected: AnswerValue | null;
  correct: boolean;
  correctAnswer: AnswerValue | null;
  explanation: string;
  voided?: boolean;
  question?: ThptqgQuestion;
};

export type GuestThptqgResultData = {
  attempt: {
    id: string;
    status: string;
    score: number | null;
    correct_answers: number | null;
    total_questions?: number | null;
    submitted_at: string | null;
    duration_seconds: number | null;
  };
  scoreVisible: boolean;
  answersVisible: boolean;
  questions?: GuestResultQuestion[];
};

type GuestThptqgMeta = {
  exam: { title: string; duration_minutes: number };
  room: { title: string };
  section?: { title: string; duration_minutes?: number | null } | null;
};

function formatDate(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "Chưa xác định";
}

function formatDuration(seconds: number | null | undefined) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function watermarkImage(candidateId: string, submittedAt: string | null | undefined) {
  const value = candidateId.trim();
  if (!value) return "none";
  const completedAt = submittedAt ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(submittedAt)) : "";
  const escapeSvgText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="150" viewBox="0 0 340 150"><g transform="rotate(-22 170 75)"><text x="170" y="66" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="1.8" fill="#0a328c" fill-opacity="0.09">${escapeSvgText(value)}</text>${completedAt ? `<text x="170" y="94" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="600" letter-spacing="1" fill="#0a328c" fill-opacity="0.09">${escapeSvgText(completedAt)}</text>` : ""}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

export default function GuestThptqgResult({ meta, result, candidateName, candidateId, onClose, onRetake }: {
  meta: GuestThptqgMeta;
  result: GuestThptqgResultData;
  candidateName: string;
  candidateId: string;
  onClose: () => void;
  onRetake: () => void;
}) {
  const [reviewOpen, setReviewOpen] = useState(false);
  const subjectTitle = meta.section?.title || "Môn thi";
  const examTitle = meta.exam.title?.trim() || "Kết quả thi";
  const resultTitle = examTitle.toLocaleLowerCase("vi-VN").includes(subjectTitle.toLocaleLowerCase("vi-VN"))
    ? examTitle
    : `${examTitle} - ${subjectTitle}`;
  const correctCount = result.scoreVisible ? Math.max(0, Number(result.attempt.correct_answers) || 0) : null;
  const totalQuestions = Math.max(0, Number(result.attempt.total_questions) || result.questions?.length || 0);
  const score = result.scoreVisible ? Math.max(0, Number(result.attempt.score) || 0) : null;
  const accuracy = scoreVisibleNumber(correctCount, totalQuestions);
  const rows = result.questions ?? [];
  const reviewQuestions = rows.flatMap(row => row.question
    ? [{ ...row.question, solution: row.explanation || row.question.solution || null } as ThptqgQuestion]
    : []);
  const answerPreview: Record<string, ThptqgAnswerValue> = {};
  rows.forEach(row => {
    if (row.correctAnswer !== null && row.correctAnswer !== undefined) answerPreview[row.id] = row.correctAnswer;
  });
  const reviewDuration = Math.max(1, meta.section?.duration_minutes ?? meta.exam.duration_minutes) * 60;
  const lockedMessage = result.scoreVisible
    ? "Điểm đã được công bố. Giáo viên chưa mở phần đề và đáp án để xem lại."
    : "Kết quả và đáp án chưa được mở theo cấu hình của kíp thi.";

  return <main className="thptqg-result-page guest-thptqg-result-page">
    <div className="thptqg-result-shell">
      <div className="thptqg-result-actions guest-thptqg-result-actions">
        <button type="button" onClick={onClose}><ArrowLeft />Đóng kết quả</button>
        <button type="button" onClick={onRetake}><RotateCcw />Làm lại</button>
        <button type="button" onClick={() => setReviewOpen(true)} disabled={!result.answersVisible || !reviewQuestions.length}><RotateCcw />Xem lại đáp án</button>
      </div>
      <section className="thptqg-result-header">
        <div>
          <span>KẾT QUẢ MÔN THI</span>
          <h1>{resultTitle}</h1>
          <p>{meta.room.title ? `${meta.room.title} · ` : ""}{formatDate(result.attempt.submitted_at)} · {formatDuration(result.attempt.duration_seconds)}</p>
          <small>Thí sinh: {candidateName}</small>
        </div>
        <div className="thptqg-result-score"><b>{score === null ? "—" : score}</b><span>{score === null ? "điểm chưa mở" : "điểm"}</span></div>
      </section>
      <section className="thptqg-result-summary">
        {result.scoreVisible && <>
          <div><CheckCircle2 /><span><small>Số câu đúng</small><b>{correctCount === null ? "—" : `${correctCount}/${totalQuestions}`}</b></span></div>
          <div><BarChart3 /><span><small>Tỷ lệ hoàn thành</small><b>{accuracy}%</b></span></div>
        </>}
        <div><Clock3 /><span><small>Thời gian làm</small><b>{formatDuration(result.attempt.duration_seconds)}</b></span></div>
      </section>
      <section className="thptqg-result-review">
        <header>
          <div><span>PHÂN TÍCH CHI TIẾT</span><h2>{subjectTitle}</h2></div>
          <p>{result.answersVisible ? "Mở giao diện đề để xem đáp án và lời giải." : "Đáp án sẽ được mở theo cấu hình của kíp thi."}</p>
        </header>
        {result.answersVisible && reviewQuestions.length
          ? <article className="guest-thptqg-result-review-card"><div><b>Đã có thể xem lại bài làm</b><small>{rows.length} câu hỏi · đáp án đúng và lời giải được hiển thị theo quyền của kíp</small></div><button type="button" onClick={() => setReviewOpen(true)}>Xem chi tiết<ChevronRight /></button></article>
          : <p className="guest-thptqg-result-locked">{lockedMessage}</p>}
      </section>
      <button type="button" className="guest-thptqg-result-close" onClick={onClose}>Kết thúc xem kết quả</button>
    </div>
    {reviewOpen && <div className="exam-result-review-overlay thptqg-result-review-overlay" role="dialog" aria-modal="true" aria-label={`Xem đáp án ${subjectTitle}`}>
      <div className="exam-result-review-host">
        <ThptqgExamRenderer
          key={`guest-result-review-${result.attempt.id}-${reviewQuestions.length}`}
          examTitle={examTitle}
          subjectTitle={subjectTitle}
          candidateName={candidateName}
          candidateId={candidateId}
          mode="exam"
          questions={reviewQuestions}
          initialAnswers={answerPreview}
          initialRemainingSeconds={reviewDuration}
          resultReview
          previewMode="answer"
          watermarkImage={watermarkImage(candidateId, result.attempt.submitted_at)}
          onExit={() => setReviewOpen(false)}
          onSubmit={() => undefined}
        />
      </div>
    </div>}
  </main>;
}

function scoreVisibleNumber(correctCount: number | null, totalQuestions: number) {
  return correctCount === null || !totalQuestions ? 0 : Math.round(correctCount / totalQuestions * 100);
}

export type { AnswerValue as GuestResultAnswerValue };

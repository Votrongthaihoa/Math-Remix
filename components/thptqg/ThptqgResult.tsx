"use client";

import { useState, type CSSProperties } from "react";
import { ArrowLeft, BarChart3, CheckCircle2, ChevronRight, Clock3, RotateCcw } from "lucide-react";
import ThptqgExamRenderer, { type ThptqgQuestion } from "./ThptqgExamRenderer";
import type { ThptqgAttempt, ThptqgExam, ThptqgRoom, ThptqgSection } from "./ThptqgSubjectDashboard";
import "./thptqg.css";

type AnswerValue = string | string[];
type AnswerKey = { question_id: string; correct_answer: AnswerValue | null; explanation: string };

function formatDate(value: string | null | undefined) {
  return value
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value))
    : "Chưa xác định";
}

function formatDuration(seconds: number | null | undefined) {
  const safe = Math.max(0, Number(seconds) || 0);
  return `${String(Math.floor(safe / 60)).padStart(2, "0")}:${String(safe % 60).padStart(2, "0")}`;
}

function watermarkImage(candidateId: string, candidateEmail: string, submittedAt: string | null | undefined) {
  const value = candidateId.trim();
  const email = candidateEmail.trim();
  if (!value && !email) return "none";
  const completedAt = submittedAt
    ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(submittedAt))
    : "";
  const escapeSvgText = (text: string) => text.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="340" height="190" viewBox="0 0 340 190"><g transform="rotate(-22 170 95)">${value ? `<text x="170" y="73" text-anchor="middle" font-family="Arial,sans-serif" font-size="18" font-weight="700" letter-spacing="1.8" fill="#0a328c" fill-opacity="0.09">${escapeSvgText(value)}</text>` : ""}${email ? `<text x="170" y="99" text-anchor="middle" font-family="Arial,sans-serif" font-size="11" font-weight="600" letter-spacing="0.6" fill="#0a328c" fill-opacity="0.09">${escapeSvgText(email)}</text>` : ""}${completedAt ? `<text x="170" y="122" text-anchor="middle" font-family="Arial,sans-serif" font-size="12" font-weight="600" letter-spacing="1" fill="#0a328c" fill-opacity="0.09">${escapeSvgText(completedAt)}</text>` : ""}</g></svg>`;
  return `url("data:image/svg+xml,${encodeURIComponent(svg)}")`;
}

function reviewQuestion(question: ThptqgQuestion, key?: AnswerKey) {
  return key ? { ...question, solution: key.explanation || question.solution || null } : question;
}

export default function ThptqgResult({ room, exam, section, attempt, questions, keys, candidateName, candidateId, candidateEmail, onBack, onRetake, resultVisibility }: {
  room: ThptqgRoom;
  exam: ThptqgExam;
  section?: ThptqgSection;
  attempt: Omit<ThptqgAttempt, "score" | "correct_answers"> & { answers?: Record<string, AnswerValue>; student_id?: string; score: number | null; correct_answers: number | null };
  questions: ThptqgQuestion[];
  keys: AnswerKey[];
  candidateName: string;
  candidateId: string;
  candidateEmail: string;
  onBack: () => void;
  onRetake: () => void;
  resultVisibility?: { scoreVisible?: boolean; answersVisible?: boolean; solutionsVisible?: boolean };
}) {
  const keyMap = new Map(keys.map(key => [key.question_id, key]));
  const scoreVisible = resultVisibility?.scoreVisible !== false;
  const answersVisible = resultVisibility?.answersVisible !== false;
  const subjectTitle = section?.title || "Môn thi";
  const examTitle = exam.title?.trim() || room.title?.trim() || "Kết quả thi";
  const resultTitle = subjectTitle && !examTitle.toLowerCase().includes(subjectTitle.toLowerCase())
    ? `${examTitle} - ${subjectTitle}`
    : examTitle;
  const correctCount = scoreVisible ? Math.max(0, Number(attempt.correct_answers) || 0) : null;
  const totalQuestions = Math.max(0, Number(attempt.total_questions) || questions.length);
  const score = scoreVisible ? Math.max(0, Number(attempt.score) || 0) : null;
  const accuracy = scoreVisible && totalQuestions ? Math.round((correctCount ?? 0) / totalQuestions * 100) : 0;
  const reviewQuestions = questions.map(question => reviewQuestion(question, keyMap.get(question.id)));
  const answerPreview: Record<string, AnswerValue> = {};
  questions.forEach(question => {
    const answer = keyMap.get(question.id)?.correct_answer;
    if (answer !== undefined && answer !== null) answerPreview[question.id] = answer;
  });
  const [reviewOpen, setReviewOpen] = useState(false);
  const reviewWatermark = watermarkImage(candidateId, candidateEmail, attempt.submitted_at);

  return <div className="exam-page exam-result-page thptqg-result-page">
    <div className="exam-result-actions thptqg-result-actions"><button type="button" className="exam-back" onClick={onBack}><ArrowLeft />Quay lại danh sách</button><button type="button" onClick={onRetake}><RotateCcw />Làm lại</button></div>
    <section className="exam-result-hero thptqg-result-hero"><div><span>KẾT QUẢ MÔN THI</span><h1>{resultTitle}</h1><p>{room.title ? `${room.title} · ` : ""}{formatDate(attempt.submitted_at)} · {formatDuration(attempt.duration_seconds)}</p></div>{scoreVisible ? <div className="exam-score-ring thptqg-result-score" style={{ "--score": `${Math.min(100, score ?? 0)}%` } as CSSProperties}><span><b>{score}</b><small>điểm</small></span></div> : <div className="exam-score-ring thptqg-result-score is-locked"><span><b>—</b><small>chưa công bố</small></span></div>}</section>
    <section className="exam-result-summary thptqg-result-summary"><div><CheckCircle2 /><span><small>Số câu đúng</small><b>{scoreVisible ? `${correctCount}/${totalQuestions}` : "Chưa công bố"}</b></span></div><div><BarChart3 /><span><small>Tỷ lệ hoàn thành</small><b>{scoreVisible ? `${accuracy}%` : "—"}</b></span></div><div><Clock3 /><span><small>Thời gian làm</small><b>{formatDuration(attempt.duration_seconds)}</b></span></div></section>
    <section className="exam-section-results thptqg-result-sections"><header><div><span>PHÂN TÍCH CHI TIẾT</span><h2>Kết quả theo môn</h2></div><p>{answersVisible ? "Chọn môn để xem lại đáp án từng câu." : "Đáp án và lời giải sẽ được mở theo cấu hình của kỳ thi."}</p></header>{answersVisible ? <article><div><b>{subjectTitle}</b><small>{correctCount}/{totalQuestions} câu đúng</small></div><div className="exam-result-bar thptqg-result-bar"><span style={{ width: `${accuracy}%` }} /></div><button type="button" onClick={() => setReviewOpen(true)} disabled={!questions.length}>Chi tiết<ChevronRight /></button></article> : <p className="exam-result-release-note">Kết quả chi tiết chưa được phát hành.</p>}</section>
    {reviewOpen && answersVisible && <div className="exam-result-review-overlay thptqg-result-review-overlay" role="dialog" aria-modal="true" aria-label={`Xem đáp án ${subjectTitle}`}><div className="exam-result-review-host"><ThptqgExamRenderer key={`result-review-${reviewQuestions.length}`} examTitle={exam.title} subjectTitle={subjectTitle} candidateName={candidateName} candidateId={candidateId} mode="exam" questions={reviewQuestions} initialAnswers={answerPreview} initialRemainingSeconds={Math.max(1, section?.duration_minutes ?? exam.duration_minutes) * 60} resultReview previewMode="answer" watermarkImage={reviewWatermark} onExit={() => setReviewOpen(false)} onSubmit={() => undefined} /></div></div>}
  </div>;
}

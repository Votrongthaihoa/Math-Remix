"use client";

import { THPTQG_SUBJECT_TEMPLATES, VSAT_SUBJECT_TEMPLATES, normalizeExamType, thptqgSubjectForSection, type ThptqgSubjectCode } from "../../lib/exam-config";
import "./thptqg.css";
import "./thptqg-dashboard-reference.css";

type Room = { id: string; title: string; description: string; exam_type: string };
type Exam = { id: string; title: string; description: string; exam_type?: string; dashboard_title?: string | null; duration_minutes: number; mode: string };
type Section = { id: string; exam_id: string; title: string; duration_minutes: number | null; sort_order: number; subject_code?: string | null };
type Attempt = { id: string; section_id?: string | null; status: string; score: number; correct_answers: number; total_questions: number; submitted_at: string | null; started_at?: string | null; duration_seconds?: number | null };

function subjectMeta(section: Section, isVsat: boolean) {
  if (isVsat) return VSAT_SUBJECT_TEMPLATES.find(item => item.code === section.subject_code || item.title.toLocaleLowerCase("vi-VN") === section.title.toLocaleLowerCase("vi-VN"));
  return thptqgSubjectForSection(section.subject_code, section.title);
}

function latestCompleted(attempts: Attempt[], sectionId: string) {
  return attempts
    .filter(attempt => attempt.section_id === sectionId && attempt.status !== "in_progress" && Boolean(attempt.submitted_at))
    .sort((left, right) => new Date(right.submitted_at ?? right.started_at ?? 0).getTime() - new Date(left.submitted_at ?? left.started_at ?? 0).getTime())[0];
}

function activeAttempt(attempts: Attempt[], sectionId: string) {
  return attempts
    .filter(attempt => attempt.section_id === sectionId && attempt.status === "in_progress")
    .sort((left, right) => new Date(right.started_at ?? 0).getTime() - new Date(left.started_at ?? 0).getTime())[0];
}

const THPTQG_DASHBOARD_SUBJECT_ORDER = ["toan", "nguvan", "vatly", "hoahoc", "tienganh", "tinhoc", "lichsu", "dialy"];

export default function ThptqgSubjectDashboard({
  room,
  exam,
  sections,
  attempts,
  candidateName,
  candidateId,
  dashboardTitle,
  mode,
  onChoose,
  onContinue,
  onResult,
  onExit,
}: {
  room: Room;
  exam: Exam;
  sections: Section[];
  attempts: Attempt[];
  candidateName: string;
  candidateId: string;
  dashboardTitle?: string | null;
  mode: "practice" | "exam";
  onChoose: (section: Section) => void;
  onContinue: (section: Section) => void;
  onResult: (attemptId: string) => void;
  onExit: () => void;
}) {
  const isVsat = normalizeExamType(room.exam_type) === "VSAT" || normalizeExamType(exam.exam_type) === "VSAT";
  const subjectTemplates = isVsat ? VSAT_SUBJECT_TEMPLATES : THPTQG_SUBJECT_TEMPLATES;
  const displayedDashboardTitle = dashboardTitle?.trim() || (isVsat ? "KỲ THI ĐÁNH GIÁ ĐẦU VÀO ĐẠI HỌC (V-SAT)" : (room.title && /thpt|tốt nghiệp/i.test(room.title) ? room.title : "KỲ THI TỐT NGHIỆP THPT 2027"));
  return <main className="thptqg-dashboard" data-mode={mode} aria-labelledby="thptqg-dashboard-title">
    <h1 id="thptqg-dashboard-title" className="thptqg-dashboard-title">{displayedDashboardTitle}</h1>

    <div className="thptqg-dashboard-shell">
      <div className="thptqg-dashboard-info-grid">
        <section className="thptqg-dashboard-info-card">
          <h2>THÔNG TIN THÍ SINH</h2>
          <div className="thptqg-dashboard-info-values">
            <div>Họ và tên: <span>{candidateName || "—"}</span></div>
            <div>SBD: <span>{candidateId || "—"}</span></div>
            <div>Ngày sinh: <span>—</span></div>
            <div>Giới tính: <span>—</span></div>
            <div>Căn cước: <span>—</span></div>
          </div>
        </section>

        <section className="thptqg-dashboard-info-card">
          <h2>HỘI ĐỒNG THI</h2>
          <div className="thptqg-dashboard-council-values">
            <div>Hội đồng thi: <span>—</span></div>
            <div>Điểm thi: <span>{room.title || "—"}</span></div>
            <div>Phòng thi: <span>{room.title || "—"}</span></div>
          </div>
        </section>
      </div>

      <section className="thptqg-dashboard-subject-panel" aria-label="Danh sách môn thi">
        <h2>DANH SÁCH MÔN THI</h2>
        <div className="thptqg-exam-grid">
          {(isVsat ? VSAT_SUBJECT_TEMPLATES.map(item => item.code) : THPTQG_DASHBOARD_SUBJECT_ORDER).map(subjectCode => {
            const subject = subjectTemplates.find(item => item.code === subjectCode);
            if (!subject) return null;
            const section = sections.find(item => subjectMeta(item, isVsat)?.code === subject.code);
            const configured = Boolean(section);
            const active = section ? activeAttempt(attempts, section.id) : undefined;
            const latest = section ? latestCompleted(attempts, section.id) : undefined;
            const duration = section?.duration_minutes ?? subject.duration_minutes;
            return <div className={`thptqg-exam-cell${configured ? "" : " is-unavailable"}`} data-configured={configured ? "true" : "false"} key={subject.code}>
              <div className="thptqg-exam-cell-copy"><span>{subject.title}</span><small>{duration} phút</small></div>
              <div className="thptqg-exam-cell-actions">
                {latest && <button type="button" className="thptqg-exam-result-button" onClick={() => onResult(latest.id)}>Điểm {latest.score}</button>}
                {section ? <button type="button" className="thptqg-exam-enter-button" onClick={() => active ? onContinue(section) : onChoose(section)}>{active ? "Tiếp tục" : "Vào thi"}</button> : <button type="button" className="thptqg-exam-enter-button is-disabled" disabled title="Môn này không có trong đề">Không có trong đề</button>}
              </div>
            </div>;
          })}
        </div>
      </section>

      <button type="button" className="thptqg-dashboard-logout" onClick={onExit}>Thoát phòng thi</button>
    </div>
  </main>;
}

export type { Attempt as ThptqgAttempt, Section as ThptqgSection, Room as ThptqgRoom, Exam as ThptqgExam, ThptqgSubjectCode };

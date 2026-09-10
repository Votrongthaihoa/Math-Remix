"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, BookOpenCheck, ClipboardCheck, UserRound } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import { continueLearningStorageKey, loadContinueLearningResult, type ContinueLearningResult } from "../lib/continue-learning";
import { buildActivityCalendar, summarizeDashboardAttempts, type DashboardAttempt } from "../lib/student-dashboard";
import { formatUiActivityDate, formatUiDate } from "./ui-format";

type StudentDashboardProfile = {
  full_name: string;
  student_code: string;
  role: "student" | "admin";
  email: string;
};

type StudentDashboardCourse = {
  id: string | number;
  title: string;
};

type StudentDashboardRoom = {
  id: string;
  title: string;
  examCount: number;
};

type StudentDashboardProps = {
  profile: StudentDashboardProfile;
  userId: string;
  userCourses: readonly StudentDashboardCourse[];
  practiceRooms: readonly StudentDashboardRoom[];
  attempts: readonly DashboardAttempt[];
  onCourses: () => void;
  onExams: () => void;
 onOpenRoom: (roomId: string) => void;
 onOpenAttempt: (attemptId: string) => void;
 onContinueLearning: (lessonId: string, resourceId?: string) => void;
  loading?: boolean;
  error?: string;
  onRetry?: () => void;
};

function initials(name: string) {
  return name.split(" ").filter(Boolean).slice(-2).map(part => part[0]).join("").toUpperCase() || "AE";
}

function followLink(event: React.MouseEvent<HTMLAnchorElement>, action: () => void) {
  if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  action();
}

export default function StudentDashboard({ profile, userId, userCourses, practiceRooms, attempts, onCourses, onExams, onOpenRoom, onOpenAttempt, onContinueLearning, loading = false, error = "", onRetry }: StudentDashboardProps) {
  const year = new Date().getFullYear();
  const summary = summarizeDashboardAttempts(attempts, new Date());
  const activityDays = buildActivityCalendar(year, summary.currentYear);
  const [continueRetry, setContinueRetry] = useState(0);
  const [continueResult, setContinueResult] = useState<{ userId: string; request: number; result: ContinueLearningResult } | null>(null);
  const activeContinueResult = continueResult?.userId === userId && continueResult.request === continueRetry ? continueResult.result : null;
  const continueItem = activeContinueResult?.item ?? null;
  const continueStatus = activeContinueResult?.status ?? "loading";

  useEffect(() => {
    let cancelled = false;
    const controller = new AbortController();
    void loadContinueLearningResult({
      request: signal => authenticatedFetch("/api/learning/continue", { cache: "no-store", signal }),
      readFallback: () => window.localStorage.getItem(continueLearningStorageKey(userId)),
      signal: controller.signal,
    }).then(result => {
      if (!cancelled) setContinueResult({ userId, request: continueRetry, result });
    }).catch(() => {
      if (!cancelled) setContinueResult({ userId, request: continueRetry, result: { status: "error", item: null } });
    });
    return () => { cancelled = true; controller.abort(); };
  }, [userId, continueRetry]);

  return <div className="alpha-dashboard" data-testid="student-dashboard" aria-busy={loading}>
    {loading && <p className="alpha-dashboard-status" role="status" aria-live="polite">Đang cập nhật tổng quan…</p>}
    {error && <div className="alpha-dashboard-error" role="alert"><span>{error}</span><button type="button" onClick={onRetry} disabled={!onRetry}>Thử tải lại</button></div>}
    <section className="alpha-dashboard-summary" aria-labelledby="alpha-dashboard-title">
      <div className="alpha-summary-profile">
        <span className="alpha-summary-avatar" aria-hidden="true"><UserRound /></span>
        <div className="alpha-summary-profile-copy">
          <p>Xin chào,</p>
          <h1 id="alpha-dashboard-title">{profile.full_name}</h1>
          <p className="alpha-summary-email" title={profile.email}>{profile.email}</p>
        </div>
      </div>
      <div className="alpha-summary-stat">
        <p>Tổng bài đã làm</p>
        <strong>{summary.completed.length}</strong>
        <span>bài thi</span>
      </div>
      <div className="alpha-summary-stat">
        <p>Trong năm {year}</p>
        <strong>{summary.currentYear.length}</strong>
        <span>bài thi</span>
      </div>
      <div className="alpha-summary-role">
        <p>Vai trò</p>
        <strong>{profile.role === "admin" ? "QUẢN TRỊ VIÊN" : "HỌC SINH"}</strong>
        <span>{profile.student_code}</span>
      </div>
    </section>

    <section className="alpha-dashboard-continue" aria-labelledby="alpha-dashboard-continue-title" aria-busy={continueStatus === "loading"}>
      <div className="alpha-dashboard-continue-icon" aria-hidden="true"><BookOpenCheck /></div>
      <div className="alpha-dashboard-continue-copy">
        <p>Học tập</p>
        <h2 id="alpha-dashboard-continue-title">Tiếp tục học</h2>
        {continueItem ? <><strong title={continueItem.lessonTitle}>{continueItem.lessonTitle}</strong><span title={continueItem.resourceTitle ?? continueItem.courseTitle}>{continueItem.resourceTitle ?? continueItem.courseTitle}</span></> : continueStatus === "ready" ? <span>Chọn một khóa học để bắt đầu hành trình của bạn.</span> : null}
        <p role="status">{continueStatus === "loading" ? "Đang tải bài học gần đây…" : continueStatus === "fallback" ? "Đang dùng bản lưu trên thiết bị; dữ liệu chưa được đồng bộ." : continueStatus === "error" ? "Chưa tải được bài học gần đây. Hãy thử lại." : ""}</p>
      </div>
      {continueItem ? <Link className="alpha-dashboard-continue-action" href={`/lessons/${encodeURIComponent(continueItem.lessonId)}${continueItem.resourceId ? `?resource=${encodeURIComponent(continueItem.resourceId)}` : ""}`} onClick={event => followLink(event, () => onContinueLearning(continueItem.lessonId, continueItem.resourceId))}>Tiếp tục <ArrowRight aria-hidden="true" /></Link> : <Link className="alpha-dashboard-continue-action" href="/courses" onClick={event => followLink(event, onCourses)}>Khám phá khóa học <ArrowRight aria-hidden="true" /></Link>}
    </section>
    {(continueStatus === "error" || continueStatus === "fallback") && <div className="alpha-dashboard-error"><button type="button" onClick={() => setContinueRetry(value => value + 1)}>Tải lại bài học gần đây</button></div>}

    <section className="alpha-dashboard-resource-grid" aria-label="Tài nguyên học tập">
      <article className="alpha-dashboard-list-card">
        <div className="alpha-dashboard-card-head">
          <h2>Khóa học</h2>
          <Link href="/courses" onClick={event => followLink(event, onCourses)}>Xem tất cả</Link>
        </div>
        {userCourses.length ? <ul>
          {userCourses.slice(0, 5).map(course => <li key={course.id}>
            <span className="alpha-list-dot alpha-list-dot-course" aria-hidden="true" />
            <Link href={`/courses/${encodeURIComponent(String(course.id))}`} title={course.title}>{course.title}</Link>
          </li>)}
        </ul> : <p className="alpha-dashboard-empty">Chưa được phân khóa học.</p>}
      </article>
      <article className="alpha-dashboard-list-card">
        <div className="alpha-dashboard-card-head">
          <h2>Phòng luyện</h2>
          <Link href="/exam-room" onClick={event => followLink(event, onExams)}>Xem tất cả</Link>
        </div>
        {practiceRooms.length ? <ul>
          {practiceRooms.slice(0, 5).map(room => <li key={room.id}>
            <span className="alpha-list-dot alpha-list-dot-room" aria-hidden="true" />
            <Link href={`/exam-room/${encodeURIComponent(room.id)}`} onClick={event => followLink(event, () => onOpenRoom(room.id))} title={`${room.title} · ${room.examCount} đề`}>{room.title}</Link>
          </li>)}
        </ul> : <p className="alpha-dashboard-empty">Chưa có phòng luyện nào.</p>}
      </article>
    </section>

    <section className="alpha-dashboard-attempt-grid" aria-label="Kết quả làm bài">
      <article className="alpha-dashboard-list-card alpha-dashboard-attempt-card">
        <div className="alpha-dashboard-card-head">
          <h2>Bài thi gần đây</h2>
          <Link href="/exam-history">Xem tất cả</Link>
        </div>
        {summary.recent.length ? <ul>
          {summary.recent.map(item => <li key={item.id}>
            <span className="alpha-list-dot alpha-list-dot-neutral" aria-hidden="true" />
            <Link href={`/exam/result/${encodeURIComponent(item.id)}`} onClick={event => followLink(event, () => onOpenAttempt(item.id))} title={item.title ?? "Bài thi"}>{item.title ?? "Bài thi"}</Link>
            <time dateTime={item.submitted_at ?? undefined}>{formatUiDate(item.submitted_at, "—")}</time>
          </li>)}
        </ul> : <p className="alpha-dashboard-empty">Chưa có bài thi nào được thực hiện.</p>}
      </article>
      <article className="alpha-dashboard-list-card alpha-dashboard-attempt-card">
        <div className="alpha-dashboard-card-head">
          <h2>Top 5 điểm cao nhất</h2>
        </div>
        {summary.top.length ? <ul>
          {summary.top.map(item => <li key={item.id}>
            <span className="alpha-list-dot alpha-list-dot-neutral" aria-hidden="true" />
            <Link href={`/exam/result/${encodeURIComponent(item.id)}`} onClick={event => followLink(event, () => onOpenAttempt(item.id))} title={item.title ?? "Bài thi"}>{item.title ?? "Bài thi"}</Link>
            <strong>{Number(item.score ?? 0)}</strong>
          </li>)}
        </ul> : <p className="alpha-dashboard-empty">Chưa có dữ liệu xếp hạng.</p>}
      </article>
    </section>

    <section className="alpha-dashboard-activity" aria-labelledby="alpha-dashboard-activity-title">
      <div className="alpha-dashboard-activity-head">
        <div>
          <h2 id="alpha-dashboard-activity-title">Thống kê làm bài ({year})</h2>
          <p>{summary.currentYear.length} bài thi trong năm {year}</p>
        </div>
        <span className="alpha-dashboard-year" aria-label={`Năm ${year}`}>{year}</span>
      </div>
      <div className="alpha-activity-months" aria-hidden="true">
        {Array.from({ length: 12 }, (_, index) => <span key={index}>Th.{index + 1}</span>)}
      </div>
      <div className="alpha-activity-heatmap" role="img" aria-label={`Biểu đồ hoạt động năm ${year}: ${summary.currentYear.length} bài thi đã hoàn thành`}>
        {activityDays.map((day, index) => <span key={`${day.dateKey}-${index}`} className={day.inYear ? `level-${Math.min(day.count, 4)}` : "outside-year"} title={day.inYear ? `${formatUiActivityDate(new Date(`${day.dateKey}T12:00:00`))}: ${day.count} bài thi` : undefined} aria-hidden="true" />)}
      </div>
      <ol className="alpha-activity-mobile-summary" aria-label={`Hoạt động theo tháng năm ${year}`}>
        {summary.monthly.map((count, index) => <li key={index}><span>Tháng {index + 1}</span><strong>{count} bài</strong></li>)}
      </ol>
      <div className="alpha-activity-footer">
        <span><ClipboardCheck aria-hidden="true" /> {summary.currentYear.length} bài thi trong năm</span>
        <div className="alpha-activity-legend" aria-label="Mức độ hoạt động"><span>Ít</span><i className="level-0" /><i className="level-1" /><i className="level-2" /><i className="level-3" /><i className="level-4" /><span>Nhiều</span></div>
      </div>
    </section>
  </div>;
}

export { initials };

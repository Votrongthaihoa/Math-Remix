import { useQuery } from "@tanstack/react-query";
import { UserRound } from "lucide-react";
import { Link } from "react-router-dom";

import { studentDashboardQuery } from "../../api/dashboard-api.ts";
import { LoadingPanel } from "../../components/ui/loading-panel.tsx";
import { QueryError } from "../../components/ui/query-error.tsx";
import { DashboardPanel } from "./dashboard-panel.tsx";
import "../../styles/dashboard-shared.css";
import "../../styles/student-dashboard.css";

const monthLabels = Array.from({ length: 12 }, (_, index) => `Th.${index + 1}`);
const daySlots = Array.from({ length: 28 }, (_, index) => index);

function EmptyMessage({ children }: { children: string }) {
  return <p className="student-empty-message">{children}</p>;
}

export default function StudentDashboard() {
  const query = useQuery(studentDashboardQuery);
  if (query.isPending) return <LoadingPanel label="Đang tải tổng quan học tập…" />;
  if (query.isError) {
    return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  }

  const dashboard = query.data;
  const activityLookup = new Map(dashboard.activity.map((day) => [day.date, day.count]));

  return (
    <div className="student-dashboard">
      <div className="student-mobile-current" aria-hidden="true">
        <span className="student-current-icon">⌘</span>
        <strong>Tổng quan</strong>
      </div>

      <section className="student-welcome-panel" aria-labelledby="student-welcome-title">
        <div className="student-profile-summary">
          <span className="student-avatar" aria-hidden="true"><UserRound /></span>
          <div className="student-profile-copy">
            <span>Xin chào,</span>
            <h1 id="student-welcome-title">{dashboard.profile.fullName}</h1>
            <p>{dashboard.profile.email}</p>
          </div>
        </div>
        <div className="student-attempt-summary">
          <div>
            <span>Tổng bài đã làm</span>
            <strong>{dashboard.summary.totalAttempts}</strong>
            <small>bài thi</small>
          </div>
          <div>
            <span>Trong năm {dashboard.summary.year}</span>
            <strong>{dashboard.summary.yearAttempts}</strong>
            <small>bài thi</small>
          </div>
          <div className="student-role-summary">
            <span>Vai trò</span>
            <strong>HỌC SINH</strong>
            <small>{dashboard.profile.studentCode}</small>
          </div>
        </div>
      </section>

      <div className="student-overview-grid">
        <DashboardPanel
          title="Khóa học"
          action={<Link to="/courses">Xem tất cả</Link>}
          className="student-compact-panel"
        >
          {dashboard.courses.length ? (
            <ul className="student-simple-list">
              {dashboard.courses.slice(0, 2).map((course) => <li key={course.id}><i className="dot-blue" />{course.title}</li>)}
            </ul>
          ) : <EmptyMessage>Chưa có khóa học nào</EmptyMessage>}
        </DashboardPanel>
        <DashboardPanel
          title="Phòng luyện"
          action={<Link to="/exam-room">Xem tất cả</Link>}
          className="student-compact-panel"
        >
          {dashboard.practiceRooms.length ? (
            <ul className="student-simple-list">
              {dashboard.practiceRooms.slice(0, 2).map((room) => <li key={room.id}><i className="dot-pink" />{room.title}</li>)}
            </ul>
          ) : <EmptyMessage>Chưa có phòng luyện nào</EmptyMessage>}
        </DashboardPanel>
        <DashboardPanel
          title="Bài thi IRT"
          action={<Link to="/irt-exams">Xem tất cả</Link>}
          className="student-compact-panel"
        >
          {dashboard.irtExams.length ? (
            <ul className="student-simple-list">
              {dashboard.irtExams.slice(0, 2).map((exam) => <li key={exam.id}>{exam.title}</li>)}
            </ul>
          ) : <EmptyMessage>Chưa có bài thi IRT nào</EmptyMessage>}
        </DashboardPanel>
      </div>

      <div className="student-history-grid">
        <DashboardPanel title="Bài thi gần đây" action={<Link to="/exam-history">Xem tất cả</Link>}>
          {dashboard.recentAttempts.length ? (
            <ul className="student-simple-list">
              {dashboard.recentAttempts.slice(0, 4).map((attempt) => <li key={attempt.id}>{attempt.title}</li>)}
            </ul>
          ) : <EmptyMessage>Chưa có bài thi nào</EmptyMessage>}
        </DashboardPanel>
        <DashboardPanel title="Top 5 điểm cao nhất" action={<Link to="/exam-history">Xem tất cả</Link>}>
          {dashboard.topScores.length ? (
            <ol className="student-score-list">
              {dashboard.topScores.slice(0, 5).map((attempt) => <li key={attempt.id}><span>{attempt.title}</span><strong>{attempt.score}</strong></li>)}
            </ol>
          ) : <EmptyMessage>Chưa có dữ liệu</EmptyMessage>}
        </DashboardPanel>
      </div>

      <section className="student-activity-panel" aria-labelledby="student-activity-title">
        <header>
          <h2 id="student-activity-title">Thống kê làm bài ({dashboard.summary.year})</h2>
          <span>{dashboard.summary.yearAttempts} bài thi trong năm {dashboard.summary.year}</span>
        </header>
        <strong className="student-year-chip">{dashboard.summary.year}</strong>
        <div className="student-activity-scroll" tabIndex={0} aria-label="Biểu đồ hoạt động theo tháng; kéo ngang để xem đầy đủ">
          <div className="student-activity-months">
            {monthLabels.map((month, monthIndex) => (
              <div className="student-activity-month" key={month}>
                <span>{month}</span>
                <div>
                  {daySlots.map((slot) => {
                    const date = `${dashboard.summary.year}-${String(monthIndex + 1).padStart(2, "0")}-${String(slot + 1).padStart(2, "0")}`;
                    const count = activityLookup.get(date) ?? 0;
                    return <i key={date} data-level={Math.min(count, 4)} title={count ? `${date}: ${count} bài thi` : undefined} />;
                  })}
                </div>
              </div>
            ))}
          </div>
        </div>
        <footer>
          <span>{dashboard.summary.yearAttempts} bài thi trong năm</span>
          <span className="student-activity-legend">Ít <i data-level="0" /><i data-level="1" /><i data-level="2" /><i data-level="3" /><i data-level="4" /> Nhiều</span>
        </footer>
      </section>
    </div>
  );
}

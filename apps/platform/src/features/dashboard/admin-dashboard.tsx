import { useQuery } from "@tanstack/react-query";
import {
  BarChart3,
  CalendarDays,
  ClipboardList,
  FileText,
  Mail,
  TrendingUp,
  UserRound,
  Users,
} from "lucide-react";

import { adminDashboardQuery } from "../../api/dashboard-api.ts";
import { LoadingPanel } from "../../components/ui/loading-panel.tsx";
import { QueryError } from "../../components/ui/query-error.tsx";
import { BarChart, DonutChart, LineChart } from "./chart-components.tsx";
import { DashboardPanel } from "./dashboard-panel.tsx";
import "../../styles/dashboard-shared.css";
import "../../styles/admin-dashboard.css";

const numberFormatter = new Intl.NumberFormat("en-US");
const updateFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  second: "2-digit",
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour12: false,
  timeZone: "Asia/Ho_Chi_Minh",
});

function percentage(complete: number, incomplete: number) {
  const total = complete + incomplete;
  return total ? Math.round((complete / total) * 100) : 0;
}

export default function AdminDashboard() {
  const query = useQuery(adminDashboardQuery);
  if (query.isPending) return <LoadingPanel label="Đang tải dữ liệu quản trị…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;

  const data = query.data;
  const metrics = [
    { label: "Tổng người dùng", value: data.metrics.totalUsers, icon: Users },
    { label: "Tổng đề thi", value: data.metrics.totalExams, icon: FileText },
    { label: "Tổng bài thi", value: data.metrics.totalAttempts, icon: ClipboardList },
    { label: "Người dùng hôm nay", value: data.metrics.todayUsers, icon: UserRound, accent: true },
    { label: "Người dùng tháng này", value: data.metrics.monthUsers, icon: CalendarDays, accent: true, secondary: true },
    { label: "Người dùng năm nay", value: data.metrics.yearUsers, icon: BarChart3, accent: true, secondary: true },
  ];
  const emailTotal = data.emailVerification.complete + data.emailVerification.incomplete;
  const profileTotal = data.profileCompletion.complete + data.profileCompletion.incomplete;

  return (
    <div className="admin-dashboard">
      <header className="admin-dashboard-heading">
        <div>
          <h1>Dashboard</h1>
          <p>Tổng quan về hệ thống và thống kê dữ liệu</p>
        </div>
        <p className="admin-updated-at">
          <span>Cập nhật lần cuối</span>
          <time dateTime={data.generatedAt}>{updateFormatter.format(new Date(data.generatedAt))}</time>
        </p>
      </header>

      <section className="admin-metric-grid" aria-label="Chỉ số chính">
        {metrics.map((metric) => {
          const Icon = metric.icon;
          return (
            <article key={metric.label} data-secondary={metric.secondary || undefined}>
              <div><Icon aria-hidden="true" /><span>{metric.label}</span></div>
              <strong className={metric.accent ? "is-accent" : undefined}>{numberFormatter.format(metric.value)}</strong>
            </article>
          );
        })}
      </section>

      <div className="admin-primary-charts">
        <DashboardPanel title="Tăng trưởng người dùng theo tháng" icon={<TrendingUp aria-hidden="true" />}>
          <div className="admin-chart-scroll" tabIndex={0} aria-label="Biểu đồ tăng trưởng; kéo ngang để xem đầy đủ">
            <LineChart points={data.monthlyGrowth} title="Tăng trưởng người dùng mới từ tháng 3 đến tháng 8 năm 2026" />
          </div>
          <p className="admin-chart-legend"><i className="line-swatch" />Người dùng mới</p>
        </DashboardPanel>
        <DashboardPanel title="Người dùng mới 7 ngày gần đây" icon={<BarChart3 aria-hidden="true" />}>
          <div className="admin-chart-scroll" tabIndex={0} aria-label="Biểu đồ người dùng mới; kéo ngang để xem đầy đủ">
            <BarChart points={data.dailyUsers} title="Người dùng mới trong 7 ngày gần đây" />
          </div>
          <p className="admin-chart-legend"><i />Người dùng mới trong ngày</p>
        </DashboardPanel>
      </div>

      <div className="admin-secondary-charts">
        <DashboardPanel title="Xác thực email" icon={<Mail aria-hidden="true" />} className="admin-donut-panel">
          <div className="admin-donut-content">
            <DonutChart percentage={percentage(data.emailVerification.complete, data.emailVerification.incomplete)} label="Đã xác thực" tone="green" />
            <dl>
              <div><dt><i className="dot-green" />Đã xác thực</dt><dd>{numberFormatter.format(data.emailVerification.complete)} <small>({percentage(data.emailVerification.complete, data.emailVerification.incomplete)}%)</small></dd></div>
              <div><dt><i className="dot-gray" />Chưa xác thực</dt><dd>{numberFormatter.format(data.emailVerification.incomplete)} <small>({100 - percentage(data.emailVerification.complete, data.emailVerification.incomplete)}%)</small></dd></div>
              <div className="admin-total-row"><dt>Tổng:</dt><dd>{numberFormatter.format(emailTotal)}</dd></div>
            </dl>
          </div>
        </DashboardPanel>
        <DashboardPanel title="Hoàn thiện hồ sơ" icon={<UserRound aria-hidden="true" />} className="admin-donut-panel">
          <div className="admin-donut-content">
            <DonutChart percentage={percentage(data.profileCompletion.complete, data.profileCompletion.incomplete)} label="Hoàn thiện" tone="red" />
            <dl>
              <div><dt><i className="dot-red" />Hoàn thiện</dt><dd>{numberFormatter.format(data.profileCompletion.complete)} <small>({percentage(data.profileCompletion.complete, data.profileCompletion.incomplete)}%)</small></dd></div>
              <div><dt><i className="dot-gray" />Chưa hoàn thiện</dt><dd>{numberFormatter.format(data.profileCompletion.incomplete)} <small>({100 - percentage(data.profileCompletion.complete, data.profileCompletion.incomplete)}%)</small></dd></div>
              <div className="admin-total-row"><dt>Tổng:</dt><dd>{numberFormatter.format(profileTotal)}</dd></div>
            </dl>
          </div>
        </DashboardPanel>
        <DashboardPanel title="Đề thi theo môn học" icon={<FileText aria-hidden="true" />} className="admin-subject-panel">
          <div className="admin-chart-scroll" tabIndex={0} aria-label="Biểu đồ đề thi theo môn; kéo ngang để xem đầy đủ">
            <BarChart points={data.examsBySubject} title="Số lượng đề thi theo môn học" neutralAfterFirst />
          </div>
          <p className="admin-chart-legend"><i />Số lượng đề thi</p>
        </DashboardPanel>
      </div>
      <footer className="admin-dashboard-footer">© 2026 AECK. Tất cả quyền được bảo lưu.</footer>
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  CalendarDays,
  CheckCircle2,
  Gauge,
  History,
  Medal,
  Minus,
  Target,
} from "lucide-react";
import { formatUiDate, formatUiNumber } from "./ui-format";

export type StudentProgressAttempt = {
  id: string;
  title: string;
  score: number;
  correct: number;
  total: number;
  submittedAt: string;
  status: string;
  examType: string;
};

type ScoreBand = {
  id: string;
  label: string;
  hint: string;
  minimum: number;
  maximum: number;
};

const scoreBands: ScoreBand[] = [
  { id: "excellent", label: "Từ 85 điểm", hint: "Mức nổi bật", minimum: 85, maximum: 100 },
  { id: "good", label: "70 – 84 điểm", hint: "Mức tốt", minimum: 70, maximum: 84.999 },
  { id: "steady", label: "50 – 69 điểm", hint: "Đang củng cố", minimum: 50, maximum: 69.999 },
  { id: "foundation", label: "Dưới 50 điểm", hint: "Cần luyện thêm", minimum: 0, maximum: 49.999 },
];

function validDate(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function clampScore(value: number) {
  return Math.min(100, Math.max(0, Number.isFinite(value) ? value : 0));
}

function initialParam(name: string, fallback: string) {
  if (typeof window === "undefined") return fallback;
  return new URLSearchParams(window.location.search).get(name) ?? fallback;
}

export default function StudentProgress({ attempts }: { attempts: StudentProgressAttempt[] }) {
  const completedAttempts = useMemo(() => attempts.filter(attempt => attempt.status !== "in_progress" && validDate(attempt.submittedAt)), [attempts]);
  const currentYear = new Date().getFullYear();
  const years = useMemo(() => [...new Set(completedAttempts.map(attempt => validDate(attempt.submittedAt)!.getFullYear()))].sort((left, right) => right - left), [completedAttempts]);
  const examTypes = useMemo(() => [...new Set(completedAttempts.map(attempt => attempt.examType.trim()).filter(Boolean))].sort((left, right) => left.localeCompare(right, "vi-VN")), [completedAttempts]);
  const [year, setYear] = useState(() => {
    const requested = Number(initialParam("year", String(currentYear)));
    return Number.isFinite(requested) && years.includes(requested) ? requested : years[0] ?? currentYear;
  });
  const [examType, setExamType] = useState(() => {
    const requested = initialParam("type", "all");
    return requested === "all" || examTypes.includes(requested) ? requested : "all";
  });

  const selectedYear = years.includes(year) ? year : years[0] ?? currentYear;
  const selectedExamType = examType === "all" || examTypes.includes(examType) ? examType : "all";

  useEffect(() => {
    const url = new URL(window.location.href);
    if (selectedYear === currentYear) url.searchParams.delete("year"); else url.searchParams.set("year", String(selectedYear));
    if (selectedExamType === "all") url.searchParams.delete("type"); else url.searchParams.set("type", selectedExamType);
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
  }, [currentYear, selectedExamType, selectedYear]);

  const visibleAttempts = useMemo(() => completedAttempts
    .filter(attempt => {
      const submittedAt = validDate(attempt.submittedAt);
      return submittedAt?.getFullYear() === selectedYear
        && (selectedExamType === "all" || attempt.examType === selectedExamType);
    })
    .sort((left, right) => Date.parse(left.submittedAt) - Date.parse(right.submittedAt)), [completedAttempts, selectedExamType, selectedYear]);

  const insights = useMemo(() => {
    const totalAttempts = visibleAttempts.length;
    const average = totalAttempts ? visibleAttempts.reduce((sum, attempt) => sum + clampScore(attempt.score), 0) / totalAttempts : 0;
    const best = totalAttempts ? Math.max(...visibleAttempts.map(attempt => clampScore(attempt.score))) : 0;
    const totalItems = visibleAttempts.reduce((sum, attempt) => sum + Math.max(0, attempt.total), 0);
    const correctItems = visibleAttempts.reduce((sum, attempt) => sum + Math.max(0, attempt.correct), 0);
    const accuracy = totalItems ? correctItems / totalItems * 100 : 0;
    const recent = visibleAttempts.slice(-3);
    const previous = visibleAttempts.slice(-6, -3);
    const recentAverage = recent.length ? recent.reduce((sum, attempt) => sum + clampScore(attempt.score), 0) / recent.length : 0;
    const previousAverage = previous.length ? previous.reduce((sum, attempt) => sum + clampScore(attempt.score), 0) / previous.length : recentAverage;
    const trend = recent.length && previous.length ? recentAverage - previousAverage : 0;
    return { totalAttempts, average, best, accuracy, trend };
  }, [visibleAttempts]);

  const monthlyActivity = useMemo(() => Array.from({ length: 12 }, (_, month) => {
    const monthAttempts = visibleAttempts.filter(attempt => validDate(attempt.submittedAt)!.getMonth() === month);
    const average = monthAttempts.length ? monthAttempts.reduce((sum, attempt) => sum + clampScore(attempt.score), 0) / monthAttempts.length : 0;
    return { month, count: monthAttempts.length, average };
  }), [visibleAttempts]);
  const maxMonthlyCount = Math.max(1, ...monthlyActivity.map(item => item.count));

  const distribution = useMemo(() => scoreBands.map(band => {
    const count = visibleAttempts.filter(attempt => {
      const score = clampScore(attempt.score);
      return score >= band.minimum && score <= band.maximum;
    }).length;
    return { ...band, count, percentage: visibleAttempts.length ? count / visibleAttempts.length * 100 : 0 };
  }), [visibleAttempts]);

  const typePerformance = useMemo(() => {
    const grouped = new Map<string, number[]>();
    for (const attempt of visibleAttempts) {
      const key = attempt.examType || "Khác";
      grouped.set(key, [...(grouped.get(key) ?? []), clampScore(attempt.score)]);
    }
    return [...grouped.entries()].map(([type, scores]) => ({
      type,
      count: scores.length,
      average: scores.reduce((sum, score) => sum + score, 0) / scores.length,
    })).sort((left, right) => right.average - left.average);
  }, [visibleAttempts]);

  const latestAttempts = visibleAttempts.slice(-5).reverse();
  const trendLabel = insights.trend > 0.05 ? "Đang tăng" : insights.trend < -0.05 ? "Đang giảm" : "Ổn định";
  const TrendIcon = insights.trend > 0.05 ? ArrowUpRight : insights.trend < -0.05 ? ArrowDownRight : Minus;
  const hasData = visibleAttempts.length > 0;

  return (
    <div className="student-progress-page">
      <header className="student-progress-header">
        <div><span>Tiến độ học tập</span><h1>Nhìn lại quá trình luyện tập</h1><p>Số liệu được tổng hợp từ những lượt làm đã hoàn thành trong tài khoản của bạn.</p></div>
        <div className="student-progress-filters" aria-label="Bộ lọc tiến độ">
          <label htmlFor="progress-year">Năm<select id="progress-year" name="year" value={selectedYear} onChange={event => setYear(Number(event.target.value))}>{(years.length ? years : [currentYear]).map(item => <option value={item} key={item}>{item}</option>)}</select></label>
          <label htmlFor="progress-exam-type">Loại kỳ thi<select id="progress-exam-type" name="examType" value={selectedExamType} onChange={event => setExamType(event.target.value)}><option value="all">Tất cả</option>{examTypes.map(type => <option value={type} key={type}>{type}</option>)}</select></label>
        </div>
      </header>

      <section className="student-progress-kpis" aria-label="Chỉ số tiến độ" style={{ fontVariantNumeric: "tabular-nums" }}>
        <article><span><CheckCircle2 aria-hidden="true" /></span><div><small>Đã hoàn thành</small><strong>{insights.totalAttempts}</strong><p>lượt làm trong {selectedYear}</p></div></article>
        <article><span><Gauge aria-hidden="true" /></span><div><small>Điểm trung bình</small><strong>{hasData ? formatUiNumber(insights.average) : "—"}</strong><p>trên thang 100</p></div></article>
        <article><span><Medal aria-hidden="true" /></span><div><small>Điểm cao nhất</small><strong>{hasData ? formatUiNumber(insights.best) : "—"}</strong><p>kết quả tốt nhất</p></div></article>
        <article><span><Target aria-hidden="true" /></span><div><small>Tỷ lệ chính xác</small><strong>{hasData ? `${formatUiNumber(insights.accuracy)}%` : "—"}</strong><p>trên toàn bộ lượt làm</p></div></article>
      </section>

      {hasData ? <>
        <section className="student-progress-insight" aria-labelledby="progress-insight-title">
          <div className={`student-progress-trend ${insights.trend > 0.05 ? "is-up" : insights.trend < -0.05 ? "is-down" : "is-steady"}`}><TrendIcon aria-hidden="true" /></div>
          <div><span>Xu hướng gần đây</span><h2 id="progress-insight-title">{trendLabel}{Math.abs(insights.trend) > 0.05 ? ` ${formatUiNumber(Math.abs(insights.trend))} điểm` : ""}</h2><p>So sánh tối đa ba lượt gần nhất với ba lượt liền trước. Chỉ số này cần thêm dữ liệu khi bạn mới bắt đầu.</p></div>
          <Link href="/exam-history">Mở lịch sử <ArrowRight aria-hidden="true" /></Link>
        </section>

        <div className="student-progress-grid">
          <section className="student-progress-panel student-progress-months" aria-labelledby="monthly-progress-title">
            <div className="student-progress-panel-heading"><div><span><CalendarDays aria-hidden="true" /></span><div><h2 id="monthly-progress-title">Nhịp luyện tập theo tháng</h2><p>Số lượt hoàn thành và điểm trung bình từng tháng.</p></div></div><small>{visibleAttempts.length} lượt trong {selectedYear}</small></div>
            <ol className="student-progress-month-chart" aria-label={`Hoạt động theo tháng năm ${selectedYear}`}>
              {monthlyActivity.map(item => <li key={item.month}>
                <div className="student-progress-month-bar" aria-hidden="true"><i style={{ height: `${Math.max(item.count ? 12 : 2, item.count / maxMonthlyCount * 100)}%` }} /></div>
                <strong>Tháng {item.month + 1}</strong>
                <span>{item.count} lượt</span>
                <small>{item.count ? `TB ${formatUiNumber(item.average)}` : "Chưa có"}</small>
              </li>)}
            </ol>
          </section>

          <section className="student-progress-panel student-progress-distribution" aria-labelledby="score-distribution-title">
            <div className="student-progress-panel-heading"><div><span><BarChart3 aria-hidden="true" /></span><div><h2 id="score-distribution-title">Phân bố kết quả</h2><p>Mỗi hàng cho biết số lượt ở một khoảng điểm.</p></div></div></div>
            <ol>
              {distribution.map(item => <li key={item.id}><div><strong>{item.label}</strong><small>{item.hint}</small></div><span>{item.count} lượt</span><div className={`student-progress-distribution-bar tone-${item.id}`} aria-label={`${item.count} lượt, ${formatUiNumber(item.percentage)} phần trăm`}><i style={{ width: `${item.percentage}%` }} /></div></li>)}
            </ol>
          </section>

          <section className="student-progress-panel student-progress-types" aria-labelledby="type-performance-title">
            <div className="student-progress-panel-heading"><div><span><Target aria-hidden="true" /></span><div><h2 id="type-performance-title">Theo loại kỳ thi</h2><p>So sánh điểm trung bình giữa các nhóm dữ liệu hiện có.</p></div></div></div>
            {typePerformance.length ? <ol>{typePerformance.map(item => <li key={item.type}><div><strong>{item.type}</strong><small>{item.count} lượt làm</small></div><span>{formatUiNumber(item.average)}</span><div aria-hidden="true"><i style={{ width: `${clampScore(item.average)}%` }} /></div></li>)}</ol> : <p className="student-progress-inline-empty">Chưa có loại kỳ thi để so sánh.</p>}
          </section>

          <section className="student-progress-panel student-progress-recent" aria-labelledby="recent-progress-title">
            <div className="student-progress-panel-heading"><div><span><History aria-hidden="true" /></span><div><h2 id="recent-progress-title">Kết quả gần đây</h2><p>Năm lượt hoàn thành mới nhất trong bộ lọc.</p></div></div><Link href="/exam-history">Xem tất cả</Link></div>
            <ol>{latestAttempts.map(attempt => <li key={attempt.id}><div><strong title={attempt.title}>{attempt.title}</strong><small>{formatUiDate(attempt.submittedAt)} · {attempt.examType || "Khác"}</small></div><span>{formatUiNumber(attempt.score)}</span></li>)}</ol>
          </section>
        </div>
      </> : <section className="student-progress-empty" role="status"><span><BarChart3 aria-hidden="true" /></span><h2>Chưa có dữ liệu trong bộ lọc này</h2><p>Chọn một năm hoặc loại kỳ thi khác, hoặc hoàn thành thêm lượt luyện tập để xem tiến độ.</p><Link href="/exam-room">Mở phòng luyện <ArrowRight aria-hidden="true" /></Link></section>}
    </div>
  );
}

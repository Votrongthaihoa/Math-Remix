"use client";

import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Clock3,
  History,
  Search,
  X,
} from "lucide-react";
import { formatUiDate, formatUiMonthDay, formatUiTime, formatUiWeekday } from "./ui-format";

type SearchCourse = {
  id: string | number;
  title: string;
  description: string;
  lessons: number;
};

export type ScheduledRoom = {
  id: string;
  title: string;
  description?: string | null;
  exam_type?: string | null;
  examCount: number;
  registration_start?: string | null;
  registration_end?: string | null;
  exam_start?: string | null;
  exam_end?: string | null;
};

type SearchAttempt = {
  id: string;
  title: string;
  score: number;
  submitted_at: string;
  status: string;
};

type SearchCategory = "all" | "courses" | "rooms" | "history";

const searchCategories: Array<{ id: SearchCategory; label: string }> = [
  { id: "all", label: "Tất cả" },
  { id: "courses", label: "Khóa học" },
  { id: "rooms", label: "Phòng thi" },
  { id: "history", label: "Lịch sử" },
];

function searchable(value: string) {
  return value
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/đ/g, "d")
    .replace(/Đ/g, "D")
    .toLocaleLowerCase("vi-VN");
}

function formatDate(value: string) {
  return formatUiDate(value, "Chưa có ngày");
}

export function StudentSearchPage({
  courses,
  rooms,
  attempts,
  onOpenAttempt,
  initialQuery = "",
  initialCategory = "all",
}: {
  courses: SearchCourse[];
  rooms: ScheduledRoom[];
  attempts: SearchAttempt[];
  onOpenAttempt: (attemptId: string) => void;
  initialQuery?: string;
  initialCategory?: string;
}) {
  const [query, setQuery] = useState(initialQuery);
  const [category, setCategory] = useState<SearchCategory>(() => searchCategories.some(item => item.id === initialCategory) ? initialCategory as SearchCategory : "all");
  const deferredQuery = useDeferredValue(query);
  const queryKey = searchable(deferredQuery.trim());

  useEffect(() => {
    const timeout = window.setTimeout(() => {
      const url = new URL(window.location.href);
      if (query.trim()) url.searchParams.set("q", query.trim());
      else url.searchParams.delete("q");
      if (category === "all") url.searchParams.delete("type");
      else url.searchParams.set("type", category);
      window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}`);
    }, 180);
    return () => window.clearTimeout(timeout);
  }, [category, query]);

  const results = useMemo(() => {
    const matches = (...values: Array<string | number | null | undefined>) =>
      !queryKey || searchable(values.filter(value => value != null).join(" ")).includes(queryKey);
    const courseResults = category === "all" || category === "courses"
      ? courses.filter(course => matches(course.title, course.description, course.lessons))
      : [];
    const roomResults = category === "all" || category === "rooms"
      ? rooms.filter(room => matches(room.title, room.description, room.exam_type, room.examCount))
      : [];
    const historyResults = category === "all" || category === "history"
      ? attempts
          .filter(attempt => attempt.status !== "in_progress" && matches(attempt.title, attempt.score, formatDate(attempt.submitted_at)))
          .slice(0, queryKey ? 20 : 6)
      : [];
    return { courses: courseResults, rooms: roomResults, history: historyResults };
  }, [attempts, category, courses, queryKey, rooms]);

  const resultCount = results.courses.length + results.rooms.length + results.history.length;

  return (
    <div className="reference-search-page">
      <header className="reference-page-heading">
        <div>
          <span className="reference-page-kicker">Tra cứu học tập</span>
          <h1>Tìm mọi nội dung được giao</h1>
          <p>Tìm khóa học, phòng khảo thí và bài đã hoàn thành trong cùng một nơi.</p>
        </div>
        <div className="reference-search-summary" aria-label="Dữ liệu có thể tra cứu">
          <span><b>{courses.length}</b> khóa học</span>
          <span><b>{rooms.length}</b> phòng thi</span>
          <span><b>{attempts.filter(item => item.status !== "in_progress").length}</b> lượt làm</span>
        </div>
      </header>

      <section className="reference-search-console" aria-labelledby="student-search-title">
        <h2 id="student-search-title" className="reference-visually-hidden">Công cụ tra cứu</h2>
        <label className="reference-search-field">
          <Search aria-hidden="true" />
          <span className="reference-visually-hidden">Từ khóa tra cứu</span>
          <input
            name="search"
            type="search"
            autoComplete="off"
            value={query}
            onChange={event => setQuery(event.target.value)}
            placeholder="Nhập tên khóa học, phòng thi hoặc bài đã làm…"
          />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Xóa từ khóa"><X aria-hidden="true" /></button> : null}
        </label>
        <div className="reference-search-filters" aria-label="Lọc loại nội dung">
          {searchCategories.map(item => (
            <button
              key={item.id}
              type="button"
              aria-pressed={category === item.id}
              onClick={() => setCategory(item.id)}
            >
              {item.label}
            </button>
          ))}
        </div>
        <p className="reference-result-count" role="status" aria-live="polite">
          {queryKey ? `${resultCount} kết quả phù hợp` : `${resultCount} nội dung đang sẵn sàng`}
        </p>
      </section>

      {resultCount ? (
        <div className="reference-result-groups">
          {results.courses.length ? (
            <section className="reference-result-group" aria-labelledby="course-result-title">
              <div className="reference-result-head"><span><BookOpen aria-hidden="true" /></span><div><h2 id="course-result-title">Khóa học</h2><p>{results.courses.length} kết quả</p></div></div>
              <div className="reference-result-list">
                {results.courses.map(course => (
                  <Link key={course.id} href={`/courses/${encodeURIComponent(String(course.id))}`}>
                    <span className="reference-result-icon"><BookOpen aria-hidden="true" /></span>
                    <span className="reference-result-copy"><b>{course.title}</b><small>{course.description || `${course.lessons} bài học`}</small></span>
                    <span className="reference-result-meta">{course.lessons} bài</span>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {results.rooms.length ? (
            <section className="reference-result-group" aria-labelledby="room-result-title">
              <div className="reference-result-head"><span><ClipboardCheck aria-hidden="true" /></span><div><h2 id="room-result-title">Phòng khảo thí</h2><p>{results.rooms.length} kết quả</p></div></div>
              <div className="reference-result-list">
                {results.rooms.map(room => (
                  <Link key={room.id} href={`/exam-room/${encodeURIComponent(room.id)}`}>
                    <span className="reference-result-icon"><ClipboardCheck aria-hidden="true" /></span>
                    <span className="reference-result-copy"><b>{room.title}</b><small>{room.description || `${room.exam_type || "Đánh giá năng lực"} - ${room.examCount} đề`}</small></span>
                    <span className="reference-result-meta">{room.examCount} đề</span>
                    <ChevronRight aria-hidden="true" />
                  </Link>
                ))}
              </div>
            </section>
          ) : null}

          {results.history.length ? (
            <section className="reference-result-group" aria-labelledby="history-result-title">
              <div className="reference-result-head"><span><History aria-hidden="true" /></span><div><h2 id="history-result-title">Lịch sử làm bài</h2><p>{results.history.length} kết quả</p></div></div>
              <div className="reference-result-list">
                {results.history.map(attempt => (
                  <button key={attempt.id} type="button" onClick={() => onOpenAttempt(attempt.id)}>
                    <span className="reference-result-icon"><History aria-hidden="true" /></span>
                    <span className="reference-result-copy"><b>{attempt.title}</b><small>Hoàn thành ngày {formatDate(attempt.submitted_at)}</small></span>
                    <span className="reference-result-score">{attempt.score}</span>
                    <ChevronRight aria-hidden="true" />
                  </button>
                ))}
              </div>
            </section>
          ) : null}
        </div>
      ) : (
        <section className="reference-empty-state" role="status">
          <span><Search aria-hidden="true" /></span>
          <h2>Không tìm thấy nội dung phù hợp</h2>
          <p>Thử một từ khóa ngắn hơn hoặc chọn lại loại nội dung.</p>
          <button type="button" onClick={() => { setQuery(""); setCategory("all"); }}>Xóa bộ lọc</button>
        </section>
      )}
    </div>
  );
}

function startOfWeek(date: Date) {
  const result = new Date(date);
  const day = result.getDay();
  result.setDate(result.getDate() + (day === 0 ? -6 : 1 - day));
  result.setHours(0, 0, 0, 0);
  return result;
}

function addDays(date: Date, amount: number) {
  const result = new Date(date);
  result.setDate(result.getDate() + amount);
  return result;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function scheduleStatus(room: ScheduledRoom, now: number) {
  const start = room.exam_start ? Date.parse(room.exam_start) : Number.NaN;
  const end = room.exam_end ? Date.parse(room.exam_end) : Number.NaN;
  if (!Number.isFinite(start)) return { label: "Không giới hạn", tone: "neutral" };
  if (now < start) return { label: "Sắp diễn ra", tone: "upcoming" };
  if (!Number.isFinite(end) || now <= end) return { label: "Đang mở", tone: "open" };
  return { label: "Đã kết thúc", tone: "ended" };
}

export function StudentSchedulePage({ rooms }: { rooms: ScheduledRoom[] }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [referenceNow] = useState(() => new Date());
  const weekStart = useMemo(() => addDays(startOfWeek(referenceNow), weekOffset * 7), [referenceNow, weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const scheduledRooms = useMemo(
    () => rooms.filter(room => room.exam_start && Number.isFinite(Date.parse(room.exam_start))).sort((left, right) => Date.parse(left.exam_start!) - Date.parse(right.exam_start!)),
    [rooms],
  );
  const unscheduledRooms = rooms.filter(room => !room.exam_start || !Number.isFinite(Date.parse(room.exam_start)));
  const roomsByDate = useMemo(() => {
    const grouped = new Map<string, ScheduledRoom[]>();
    for (const day of days) grouped.set(dateKey(day), []);
    for (const room of scheduledRooms) {
      const key = dateKey(new Date(room.exam_start!));
      grouped.get(key)?.push(room);
    }
    return grouped;
  }, [days, scheduledRooms]);
  const weekEnd = days[6];
  const todayKey = dateKey(referenceNow);
  const now = referenceNow.getTime();
  const weekLabel = `${formatUiMonthDay(weekStart)} - ${formatUiDate(weekEnd)}`;

  return (
    <div className="reference-schedule-page">
      <header className="reference-page-heading reference-schedule-heading">
        <div>
          <span className="reference-page-kicker">Lịch học và thi</span>
          <h1>Thời khóa biểu của bạn</h1>
          <p>Lịch được tổng hợp từ các phòng khảo thí mà tài khoản của bạn có quyền truy cập.</p>
        </div>
        <div className="reference-week-controls" aria-label="Điều hướng tuần">
          <button type="button" onClick={() => setWeekOffset(value => value - 1)} aria-label="Xem tuần trước"><ChevronLeft aria-hidden="true" /></button>
          <strong aria-live="polite">{weekLabel}</strong>
          <button type="button" onClick={() => setWeekOffset(value => value + 1)} aria-label="Xem tuần sau"><ChevronRight aria-hidden="true" /></button>
          {weekOffset !== 0 ? <button type="button" className="reference-current-week" onClick={() => setWeekOffset(0)}>Tuần này</button> : null}
        </div>
      </header>

      <section className="reference-week-panel" aria-labelledby="weekly-schedule-title">
        <div className="reference-week-panel-head">
          <span><CalendarClock aria-hidden="true" /></span>
          <div><h2 id="weekly-schedule-title">Lịch trong tuần</h2><p>{scheduledRooms.length} lịch thi có thời gian cụ thể</p></div>
        </div>
        <ol className="reference-week-grid">
          {days.map(day => {
            const key = dateKey(day);
            const dayRooms = roomsByDate.get(key) ?? [];
            const isToday = key === todayKey;
            return (
              <li key={key} className={isToday ? "is-today" : undefined}>
                <header><span>{formatUiWeekday(day)}</span><b>{day.getDate()}</b><small>tháng {day.getMonth() + 1}</small></header>
                <div className="reference-day-events">
                  {dayRooms.length ? dayRooms.map(room => {
                    const status = scheduleStatus(room, now);
                    const start = new Date(room.exam_start!);
                    const end = room.exam_end ? new Date(room.exam_end) : null;
                    return (
                      <Link href={`/exam-room/${encodeURIComponent(room.id)}`} key={room.id} className={`reference-schedule-event tone-${status.tone}`}>
                        <span className="reference-event-status">{status.label}</span>
                        <b>{room.title}</b>
                        <span><Clock3 aria-hidden="true" />{formatUiTime(start)}{end && Number.isFinite(end.getTime()) ? ` - ${formatUiTime(end)}` : ""}</span>
                        <small>{room.exam_type || "Đánh giá năng lực"} - {room.examCount} đề</small>
                      </Link>
                    );
                  }) : <span className="reference-day-empty">Chưa có lịch</span>}
                </div>
              </li>
            );
          })}
        </ol>
      </section>

      <section className="reference-open-rooms" aria-labelledby="open-room-title">
        <div className="reference-result-head"><span><ClipboardCheck aria-hidden="true" /></span><div><h2 id="open-room-title">Phòng mở không giới hạn</h2><p>Có thể truy cập bất cứ lúc nào khi phòng còn xuất bản.</p></div></div>
        {unscheduledRooms.length ? (
          <div className="reference-open-room-grid">
            {unscheduledRooms.map(room => (
              <Link key={room.id} href={`/exam-room/${encodeURIComponent(room.id)}`}>
                <span><ClipboardCheck aria-hidden="true" /></span>
                <span><b>{room.title}</b><small>{room.exam_type || "Phòng luyện"} - {room.examCount} đề</small></span>
                <ChevronRight aria-hidden="true" />
              </Link>
            ))}
          </div>
        ) : <p className="reference-inline-empty">Không có phòng mở không giới hạn.</p>}
      </section>
    </div>
  );
}

export type AdminFinderItem = {
  id: string;
  title: string;
  description: string;
  category: string;
  path: string;
  searchValue?: string;
  kind?: "navigation" | "student" | "course" | "room" | "action";
};

export function AdminQuickFinder({
  items,
  loading,
  onSelect,
}: {
  items: AdminFinderItem[];
  loading: boolean;
  onSelect: (item: AdminFinderItem) => void;
}) {
  const inputId = useId();
  const [query, setQuery] = useState("");
  const deferredQuery = useDeferredValue(query);
  const queryKey = searchable(deferredQuery.trim());
  const visibleItems = useMemo(() => {
    const matched = queryKey
      ? items.filter(item => searchable(`${item.title} ${item.description} ${item.category} ${item.searchValue ?? ""}`).includes(queryKey))
      : items.filter(item => item.kind === "action" || item.kind === "navigation");
    return matched.slice(0, 8);
  }, [items, queryKey]);

  return (
    <section className="admin-reference-finder" aria-labelledby="admin-reference-finder-title">
      <div className="admin-reference-finder-intro">
        <span><Search aria-hidden="true" /></span>
        <div><h2 id="admin-reference-finder-title">Tìm nhanh trong quản trị</h2><p>Mở chức năng, khóa học, phòng thi hoặc hồ sơ học viên mà không cần dò menu.</p></div>
      </div>
      <div className="admin-reference-search-wrap">
        <label htmlFor={inputId}>Từ khóa</label>
        <div className="admin-reference-search-field">
          <Search aria-hidden="true" />
          <input id={inputId} type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Ví dụ: học viên, khóa TSA, tạo kíp thi…" autoComplete="off" />
          {query ? <button type="button" onClick={() => setQuery("")} aria-label="Xóa từ khóa quản trị"><X aria-hidden="true" /></button> : null}
        </div>
      </div>
      <div className="admin-reference-results" aria-busy={loading}>
        {loading ? <p className="admin-reference-loading" role="status">Đang đồng bộ dữ liệu quản trị…</p> : visibleItems.length ? visibleItems.map(item => (
          <button type="button" key={item.id} onClick={() => { onSelect(item); setQuery(""); }}>
            <span className="admin-reference-result-category">{item.category}</span>
            <span className="admin-reference-result-copy"><b>{item.title}</b><small>{item.description}</small></span>
            <ChevronRight aria-hidden="true" />
          </button>
        )) : <p className="admin-reference-loading" role="status">Không tìm thấy mục quản trị phù hợp.</p>}
      </div>
      <p className="admin-reference-result-count" role="status" aria-live="polite">{loading ? "Đang tải dữ liệu" : `${visibleItems.length} mục đang hiển thị`}</p>
    </section>
  );
}

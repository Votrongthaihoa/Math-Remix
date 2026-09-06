"use client";

import { useDeferredValue, useEffect, useId, useMemo, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  CalendarClock,
  ChevronLeft,
  ChevronRight,
  ClipboardCheck,
  Crosshair,
  History,
  Search,
  X,
} from "lucide-react";
import { formatUiDate, formatUiTime, formatUiWeekday } from "./ui-format";

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

const timetableStartHour = 8;
const timetableEndHour = 24;
const timetableHourHeight = 64;
const timetableHeight = (timetableEndHour - timetableStartHour) * timetableHourHeight;
const timetableAccent = "#778CF7";
const timetablePalettes = [
  { background: "rgba(119,140,247,.16)", border: timetableAccent, text: "rgb(75,69,181)", soft: "rgba(119,140,247,.10)" },
  { background: "rgb(224,242,254)", border: "rgb(2,132,199)", text: "rgb(7,89,133)", soft: "rgb(240,249,255)" },
  { background: "rgb(254,243,199)", border: "rgb(217,119,6)", text: "rgb(146,64,14)", soft: "rgb(255,251,235)" },
  { background: "rgb(209,250,229)", border: "rgb(5,150,105)", text: "rgb(6,95,70)", soft: "rgb(236,253,245)" },
] as const;

function timetableWeekLabel(start: Date, end: Date) {
  const two = (value: number) => String(value).padStart(2, "0");
  return `${two(start.getDate())}-${two(start.getMonth() + 1)} – ${two(end.getDate())}/${two(end.getMonth() + 1)}/${end.getFullYear()}`;
}

function timetableMinutes(date: Date) {
  return date.getHours() * 60 + date.getMinutes();
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
  const weekLabel = timetableWeekLabel(weekStart, weekEnd);
  const examTypes = [...new Set(scheduledRooms.map(room => room.exam_type?.trim() || "Phòng khảo thí"))].slice(0, timetablePalettes.length);
  const paletteForRoom = (room: ScheduledRoom) => {
    const type = room.exam_type?.trim() || "Phòng khảo thí";
    const index = Math.max(0, examTypes.indexOf(type));
    return timetablePalettes[index % timetablePalettes.length];
  };
  const currentMinutes = timetableMinutes(referenceNow);
  const currentLineTop = (currentMinutes - timetableStartHour * 60) / 60 * timetableHourHeight;

  return (
    <div className="student-timetable-page w-full">
      <section className="bg-white rounded-xl shadow-sm border border-gray-100 select-none overflow-hidden" aria-labelledby="student-timetable-title">
        <div className="px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
          <h1 id="student-timetable-title" className="text-base font-semibold text-gray-800 flex items-center gap-2 m-0"><CalendarClock style={{ color: timetableAccent }} aria-hidden="true" />Thời Khóa Biểu</h1>
          <div className="flex items-center gap-2 flex-wrap">
            <div className="hidden sm:flex items-center gap-2" aria-label="Loại lịch">
              {examTypes.map((type, index) => {
                const palette = timetablePalettes[index % timetablePalettes.length];
                return <span key={type} className="inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: palette.soft, color: palette.text }}><ClipboardCheck className="w-[11px] h-[11px]" aria-hidden="true" />{type}</span>;
              })}
            </div>
            <div className="flex items-center gap-1" aria-label="Điều hướng tuần">
              <button type="button" className="ant-btn ant-btn-default ant-btn-sm ant-btn-icon-only" onClick={() => setWeekOffset(value => value - 1)} aria-label="Xem tuần trước"><ChevronLeft aria-hidden="true" /></button>
              <strong className="text-xs font-medium text-gray-600 px-1 min-w-[140px] text-center" aria-live="polite">{weekLabel}</strong>
              <button type="button" className="ant-btn ant-btn-default ant-btn-sm ant-btn-icon-only" onClick={() => setWeekOffset(value => value + 1)} aria-label="Xem tuần sau"><ChevronRight aria-hidden="true" /></button>
            </div>
            <button type="button" className="ant-btn ant-btn-default ant-btn-sm" onClick={() => setWeekOffset(0)}><Crosshair aria-hidden="true" /><span>Hôm nay</span></button>
          </div>
        </div>
        <div className="student-timetable-scroll overflow-y-auto overflow-x-auto" style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
          <div style={{ minWidth: 560 }}>
            <div className="flex border-b border-gray-200 bg-white sticky top-0 z-10">
              <div className="flex-shrink-0 border-r border-gray-100" style={{ width: 52 }} />
              {days.map(day => {
                const key = dateKey(day);
                const isToday = key === todayKey;
                return <div key={key} className="flex-1 text-center py-2 border-l border-gray-100 min-w-[72px]" style={isToday ? { background: "rgba(119,140,247,.06)" } : undefined}><div className="text-[10px] leading-none" style={{ color: isToday ? timetableAccent : "rgb(156,163,175)" }}><span className="hidden sm:block">{formatUiWeekday(day)}</span><span className="block sm:hidden">{["CN", "T2", "T3", "T4", "T5", "T6", "T7"][day.getDay()]}</span></div><div className="text-[12px] font-semibold leading-tight mt-0.5" style={{ color: isToday ? timetableAccent : "rgb(107,114,128)" }}>{day.getDate()}/{day.getMonth() + 1}</div>{isToday ? <div className="w-1 h-1 rounded-full mx-auto mt-1" style={{ background: timetableAccent }} /> : null}</div>;
              })}
            </div>
            <div className="relative">
              <div className="flex" style={{ height: timetableHeight }}>
                <div className="flex-shrink-0 relative border-r border-gray-100 bg-white" style={{ width: 52 }}>
                  {Array.from({ length: timetableEndHour - timetableStartHour }, (_, index) => timetableStartHour + index + 1).map(hour => <div key={hour} className="absolute right-2 text-[11px] text-gray-400 leading-none" style={{ top: (hour - timetableStartHour) * timetableHourHeight - 5 }}>{String(hour).padStart(2, "0")}:00</div>)}
                </div>
                {days.map(day => {
                  const key = dateKey(day);
                  const isToday = key === todayKey;
                  const dayRooms = roomsByDate.get(key) ?? [];
                  return <div key={key} className="flex-1 relative border-l border-gray-100 min-w-[72px]" style={isToday ? { background: "rgba(119,140,247,.025)" } : undefined}>
                    {Array.from({ length: timetableEndHour - timetableStartHour + 1 }, (_, index) => <span key={index} className="absolute left-0 right-0 border-t border-dashed border-gray-100" style={{ top: index * timetableHourHeight }} />)}
                    {dayRooms.map(room => {
                      const start = new Date(room.exam_start!);
                      const parsedEnd = room.exam_end ? new Date(room.exam_end) : null;
                      const startMinutes = Math.max(timetableStartHour * 60, Math.min(timetableEndHour * 60, timetableMinutes(start)));
                      const rawEndMinutes = parsedEnd && Number.isFinite(parsedEnd.getTime()) && dateKey(parsedEnd) === key ? timetableMinutes(parsedEnd) : startMinutes + 60;
                      const endMinutes = Math.max(startMinutes + 30, Math.min(timetableEndHour * 60, rawEndMinutes));
                      const top = (startMinutes - timetableStartHour * 60) / 60 * timetableHourHeight;
                      const height = Math.max(30, (endMinutes - startMinutes) / 60 * timetableHourHeight - 2);
                      const palette = paletteForRoom(room);
                      return <Link href={`/exam-room/${encodeURIComponent(room.id)}`} key={room.id} className="absolute overflow-hidden transition-opacity hover:opacity-80" style={{ top, height, left: 2, right: 2, borderRadius: 5, background: palette.background, borderLeft: `3px solid ${palette.border}`, boxShadow: "rgba(0,0,0,0.06) 0px 1px 3px", color: palette.text }} title={`${room.title} · ${formatUiTime(start)}`}><span className="block p-[3px_6px] min-w-0"><b className="block text-[11px] leading-[1.25] overflow-hidden text-ellipsis whitespace-nowrap">{room.title}</b><span className="block text-[10px] leading-[1.3] opacity-80 overflow-hidden text-ellipsis whitespace-nowrap">{formatUiTime(start)}{parsedEnd && Number.isFinite(parsedEnd.getTime()) ? `–${formatUiTime(parsedEnd)}` : ""}</span><span className="block text-[10px] leading-[1.3] opacity-65 overflow-hidden text-ellipsis whitespace-nowrap">{room.exam_type || "Phòng khảo thí"} · {room.examCount} đề</span></span></Link>;
                    })}
                    {isToday && currentMinutes >= timetableStartHour * 60 && currentMinutes <= timetableEndHour * 60 ? <div className="absolute left-0 right-0 z-10 pointer-events-none flex items-center" style={{ top: currentLineTop }}><span className="w-2 h-2 rounded-full -ml-1" style={{ background: timetableAccent }} /><span className="flex-1 h-0.5 opacity-85" style={{ background: timetableAccent }} /></div> : null}
                  </div>;
                })}
              </div>
            </div>
          </div>
        </div>
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

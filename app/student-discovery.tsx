"use client";

import { type MouseEvent as ReactMouseEvent, useCallback, useDeferredValue, useEffect, useId, useMemo, useRef, useState } from "react";
import Link from "next/link";
import {
  BookOpen,
  ChevronRight,
  ClipboardCheck,
  History,
  Search,
  X,
} from "lucide-react";
import { formatUiDate, formatUiWeekRange } from "./ui-format";
import { authenticatedFetch } from "../lib/auth-client";
import QuestionSearch from "../components/question-search";

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
  const followAttemptLink = (event: ReactMouseEvent<HTMLAnchorElement>, attemptId: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpenAttempt(attemptId);
  };

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

      <QuestionSearch />

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
        <div className="reference-search-filters" role="group" aria-label="Lọc loại nội dung">
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
                  <Link key={attempt.id} href={`/exam/result/${encodeURIComponent(attempt.id)}`} onClick={event => followAttemptLink(event, attempt.id)}>
                    <span className="reference-result-icon"><History aria-hidden="true" /></span>
                    <span className="reference-result-copy"><b>{attempt.title}</b><small>Hoàn thành ngày {formatDate(attempt.submitted_at)}</small></span>
                    <span className="reference-result-score">{attempt.score}</span>
                    <ChevronRight aria-hidden="true" />
                  </Link>
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

export type TimetableFormat = "ilearn" | "zoom" | "live" | "video";

export type TimetableEntry = {
  id: string;
  date: string;
  startTime: string;
  endTime: string;
  title: string;
  courseTitle?: string;
  eventKind?: "live" | "lesson";
  format: TimetableFormat;
  instructor?: string | null;
  hasLink?: boolean;
  joinUrl?: string | null;
};

type TimetableApiEvent = {
  id: string;
  courseTitle: string;
  lessonId?: string | null;
  title: string;
  startAt: string;
  endAt: string;
  instructor?: string | null;
  deliveryMode: "online" | "offline" | "hybrid" | "self_study";
  eventKind: "live" | "lesson";
  canJoin: boolean;
  joinPath?: string | null;
};

type TimetableApiPayload = { events?: TimetableApiEvent[]; error?: string };

type TimetableIconName = "calendar" | "left" | "right" | "aim" | "read" | "lock" | "video-camera" | "play-circle" | "link";

const timetableIconPaths: Record<TimetableIconName, string[]> = {
  calendar: ["M880 184H712v-64c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v64H384v-64c0-4.4-3.6-8-8-8h-56c-4.4 0-8 3.6-8 8v64H144c-17.7 0-32 14.3-32 32v664c0 17.7 14.3 32 32 32h736c17.7 0 32-14.3 32-32V216c0-17.7-14.3-32-32-32zm-40 656H184V460h656v380zM184 392V256h128v48c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8v-48h256v48c0 4.4 3.6 8 8 8h56c4.4 0 8-3.6 8-8v-48h128v136H184z"],
  left: ["M724 218.3V141c0-6.7-7.7-10.4-12.9-6.3L260.3 486.8a31.86 31.86 0 000 50.3l450.8 352.1c5.3 4.1 12.9.4 12.9-6.3v-77.3c0-4.9-2.3-9.6-6.1-12.6l-360-281 360-281.1c3.8-3 6.1-7.7 6.1-12.6z"],
  right: ["M765.7 486.8L314.9 134.7A7.97 7.97 0 00302 141v77.3c0 4.9 2.3 9.6 6.1 12.6l360 281.1-360 281.1c-3.9 3-6.1 7.7-6.1 12.6V883c0 6.7 7.7 10.4 12.9 6.3l450.8-352.1a31.96 31.96 0 000-50.4z"],
  aim: ["M952 474H829.8C812.5 327.6 696.4 211.5 550 194.2V72c0-4.4-3.6-8-8-8h-60c-4.4 0-8 3.6-8 8v122.2C327.6 211.5 211.5 327.6 194.2 474H72c-4.4 0-8 3.6-8 8v60c0 4.4 3.6 8 8 8h122.2C211.5 696.4 327.6 812.5 474 829.8V952c0 4.4 3.6 8 8 8h60c4.4 0 8-3.6 8-8V829.8C696.4 812.5 812.5 696.4 829.8 550H952c4.4 0 8-3.6 8-8v-60c0-4.4-3.6-8-8-8zM512 756c-134.8 0-244-109.2-244-244s109.2-244 244-244 244 109.2 244 244-109.2 244-244 244z", "M512 392c-32.1 0-62.1 12.4-84.8 35.2-22.7 22.7-35.2 52.7-35.2 84.8s12.5 62.1 35.2 84.8C449.9 619.4 480 632 512 632s62.1-12.5 84.8-35.2C619.4 574.1 632 544 632 512s-12.5-62.1-35.2-84.8A118.57 118.57 0 00512 392z"],
  read: ["M928 161H699.2c-49.1 0-97.1 14.1-138.4 40.7L512 233l-48.8-31.3A255.2 255.2 0 00324.8 161H96c-17.7 0-32 14.3-32 32v568c0 17.7 14.3 32 32 32h228.8c49.1 0 97.1 14.1 138.4 40.7l44.4 28.6c1.3.8 2.8 1.3 4.3 1.3s3-.4 4.3-1.3l44.4-28.6C602 807.1 650.1 793 699.2 793H928c17.7 0 32-14.3 32-32V193c0-17.7-14.3-32-32-32zM324.8 721H136V233h188.8c35.4 0 69.8 10.1 99.5 29.2l48.8 31.3 6.9 4.5v462c-47.6-25.6-100.8-39-155.2-39zm563.2 0H699.2c-54.4 0-107.6 13.4-155.2 39V298l6.9-4.5 48.8-31.3c29.7-19.1 64.1-29.2 99.5-29.2H888v488zM396.9 361H211.1c-3.9 0-7.1 3.4-7.1 7.5v45c0 4.1 3.2 7.5 7.1 7.5h185.7c3.9 0 7.1-3.4 7.1-7.5v-45c.1-4.1-3.1-7.5-7-7.5zm223.1 7.5v45c0 4.1 3.2 7.5 7.1 7.5h185.7c3.9 0 7.1-3.4 7.1-7.5v-45c0-4.1-3.2-7.5-7.1-7.5H627.1c-3.9 0-7.1 3.4-7.1 7.5zM396.9 501H211.1c-3.9 0-7.1 3.4-7.1 7.5v45c0 4.1 3.2 7.5 7.1 7.5h185.7c3.9 0 7.1-3.4 7.1-7.5v-45c.1-4.1-3.1-7.5-7-7.5zm416 0H627.1c-3.9 0-7.1 3.4-7.1 7.5v45c0 4.1 3.2 7.5 7.1 7.5h185.7c3.9 0 7.1-3.4 7.1-7.5v-45c.1-4.1-3.1-7.5-7-7.5z"],
  lock: ["M832 464h-68V240c0-70.7-57.3-128-128-128H388c-70.7 0-128 57.3-128 128v224h-68c-17.7 0-32 14.3-32 32v384c0 17.7 14.3 32 32 32h640c17.7 0 32-14.3 32-32V496c0-17.7-14.3-32-32-32zM332 240c0-30.9 25.1-56 56-56h248c30.9 0 56 25.1 56 56v224H332V240zm460 600H232V536h560v304zM484 701v53c0 4.4 3.6 8 8 8h40c4.4 0 8-3.6 8-8v-53a48.01 48.01 0 10-56 0z"],
  "video-camera": ["M912 302.3L784 376V224c0-35.3-28.7-64-64-64H128c-35.3 0-64 28.7-64 64v576c0 35.3 28.7 64 64 64h592c35.3 0 64-28.7 64-64V648l128 73.7c21.3 12.3 48-3.1 48-27.6V330c0-24.6-26.7-40-48-27.7zM712 792H136V232h576v560zm176-167l-104-59.8V458.9L888 399v226zM208 360h112c4.4 0 8-3.6 8-8v-48c0-4.4-3.6-8-8-8H208c-4.4 0-8 3.6-8 8v48c0 4.4 3.6 8 8 8z"],
  "play-circle": ["M512 64C264.6 64 64 264.6 64 512s200.6 448 448 448 448-200.6 448-448S759.4 64 512 64zm0 820c-205.4 0-372-166.6-372-372s166.6-372 372-372 372 166.6 372 372-166.6 372-372 372z", "M719.4 499.1l-296.1-215A15.9 15.9 0 00398 297v430c0 13.1 14.8 20.5 25.3 12.9l296.1-215a15.9 15.9 0 000-25.8zm-257.6 134V390.9L628.5 512 461.8 633.1z"],
  link: ["M574 665.4a8.03 8.03 0 00-11.3 0L446.5 781.6c-53.8 53.8-144.6 59.5-204 0-59.5-59.5-53.8-150.2 0-204l116.2-116.2c3.1-3.1 3.1-8.2 0-11.3l-39.8-39.8a8.03 8.03 0 00-11.3 0L191.4 526.5c-84.6 84.6-84.6 221.5 0 306s221.5 84.6 306 0l116.2-116.2c3.1-3.1 3.1-8.2 0-11.3L574 665.4zm258.6-474c-84.6-84.6-221.5-84.6-306 0L410.3 307.6a8.03 8.03 0 000 11.3l39.7 39.7c3.1 3.1 8.2 3.1 11.3 0l116.2-116.2c53.8-53.8 144.6-59.5 204 0 59.5 59.5 53.8 150.2 0 204L665.3 562.6a8.03 8.03 0 000 11.3l39.8 39.8c3.1 3.1 8.2 3.1 11.3 0l116.2-116.2c84.5-84.6 84.5-221.5 0-306.1zM610.1 372.3a8.03 8.03 0 00-11.3 0L372.3 598.7a8.03 8.03 0 000 11.3l39.6 39.6c3.1 3.1 8.2 3.1 11.3 0l226.4-226.4c3.1-3.1 3.1-8.2 0-11.3l-39.5-39.6z"],
};

function TimetableIcon({ name, size = 11 }: { name: TimetableIconName; size?: number }) {
  return <svg className="student-timetable-ant-icon" data-icon={name} viewBox="64 64 896 896" width="1em" height="1em" fill="currentColor" style={{ fontSize: size }} aria-hidden="true">{timetableIconPaths[name].map(path => <path d={path} key={path} />)}</svg>;
}

const timetableStartHour = 8;
const timetableEndHour = 24;
const timetableHourHeight = 64;
const timetableHeight = (timetableEndHour - timetableStartHour) * timetableHourHeight;
const timetableAccent = "#cd1627";
const timetableDayNames = ["Chủ Nhật", "Thứ Hai", "Thứ Ba", "Thứ Tư", "Thứ Năm", "Thứ Sáu", "Thứ Bảy"];
const timetableShortDayNames = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];
const timetablePalettes: Record<TimetableFormat, { label: string; background: string; border: string; text: string; pillBackground: string; pillText: string; icon: TimetableIconName }> = {
  ilearn: { label: "Tại lớp", background: "#f9fafb", border: "#9ca3af", text: "#374151", pillBackground: "#f3f4f6", pillText: "#374151", icon: "read" },
  zoom: { label: "Trực tuyến", background: "#fee2e2", border: "#cd1627", text: "#991b1b", pillBackground: "#fef2f2", pillText: "#991b1b", icon: "lock" },
  live: { label: "Kết hợp", background: "#fff1f2", border: "#a8101e", text: "#881337", pillBackground: "#fff1f2", pillText: "#881337", icon: "video-camera" },
  video: { label: "Tự học", background: "#ffffff", border: "#cd1627", text: "#4b5563", pillBackground: "#ffffff", pillText: "#4b5563", icon: "play-circle" },
};

const timetablePartsFormatter = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Ho_Chi_Minh",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
  hour: "2-digit",
  minute: "2-digit",
  hourCycle: "h23",
});

function timetableParts(value: string) {
  const date = new Date(value);
  const parts = timetablePartsFormatter.formatToParts(date);
  const read = (type: Intl.DateTimeFormatPartTypes) => parts.find(part => part.type === type)?.value ?? "";
  return { date: `${read("year")}-${read("month")}-${read("day")}`, time: `${read("hour")}:${read("minute")}` };
}

function timetableEntryFromApi(event: TimetableApiEvent): TimetableEntry {
  const start = timetableParts(event.startAt);
  const end = timetableParts(event.endAt);
  const format: TimetableFormat = event.eventKind === "lesson"
    ? "video"
    : event.deliveryMode === "offline"
      ? "ilearn"
      : event.deliveryMode === "hybrid"
        ? "live"
        : "zoom";
  return {
    id: event.id,
    date: start.date,
    startTime: start.time,
    endTime: end.time,
    title: event.title,
    courseTitle: event.courseTitle,
    eventKind: event.eventKind,
    format,
    instructor: event.instructor,
    hasLink: event.eventKind === "lesson" ? Boolean(event.lessonId) : event.canJoin,
    joinUrl: event.eventKind === "lesson" && event.lessonId ? `/lessons/${encodeURIComponent(event.lessonId)}` : event.joinPath,
  };
}

function timetableStartOfWeek(offset = 0) {
  const today = new Date();
  const day = today.getDay();
  const mondayOffset = day === 0 ? -6 : 1 - day;
  const result = new Date(today);
  result.setDate(today.getDate() + mondayOffset + offset * 7);
  result.setHours(0, 0, 0, 0);
  return result;
}

function timetableDays(start: Date) {
  return Array.from({ length: 7 }, (_, index) => {
    const result = new Date(start);
    result.setDate(start.getDate() + index);
    return result;
  });
}

function timetableDateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

function timetableTimeMinutes(value = "") {
  const [hour, minute] = value.split(":").map(Number);
  if (!Number.isFinite(hour) || !Number.isFinite(minute)) return timetableStartHour * 60;
  return hour * 60 + minute;
}

function TimetableEventCard({ entry, top, height, joining, onJoin }: { entry: TimetableEntry; top: number; height: number; joining: boolean; onJoin: (entry: TimetableEntry) => void }) {
  const tooltipId = useId();
  const palette = timetablePalettes[entry.format] ?? timetablePalettes.zoom;
  const canJoin = Boolean(entry.hasLink && entry.joinUrl);
  const activate = () => { if (canJoin && !joining) onJoin(entry); };
  const content = <>
    <div className="student-timetable-event-copy">
      <div className="student-timetable-event-title" style={{ color: palette.text }}><TimetableIcon name={palette.icon} />{entry.title}</div>
      {height >= 38 ? <div className="student-timetable-event-time" style={{ color: palette.text }}>{entry.startTime}–{entry.endTime}</div> : null}
      {height >= 56 && entry.instructor ? <div className="student-timetable-event-instructor" style={{ color: palette.text }}>{entry.instructor}</div> : null}
    </div>
    {canJoin ? <span className="student-timetable-event-link" style={{ color: palette.text }}><TimetableIcon name="link" size={9} /></span> : null}
  </>;
  return <div className="student-timetable-event-anchor" style={{ top, height, left: 2, right: 2 }}>
    {canJoin ? <button
      type="button"
      className="student-timetable-event absolute overflow-hidden transition-opacity hover:opacity-80 is-joinable"
      aria-describedby={tooltipId}
      aria-label={`${entry.title}, ${palette.label}, ${entry.startTime} đến ${entry.endTime}${entry.instructor ? `, ${entry.instructor}` : ""}`}
      onClick={activate}
      disabled={joining}
      style={{ background: palette.background, borderLeft: `3px solid ${palette.border}` }}
    >{content}</button> : <div
      className="student-timetable-event absolute overflow-hidden"
      aria-describedby={tooltipId}
      style={{ background: palette.background, borderLeft: `3px solid ${palette.border}` }}
    >{content}</div>}
    <div className="student-timetable-tooltip" id={tooltipId} role="tooltip">
      <strong>{entry.title}</strong>
      {entry.courseTitle ? <span>{entry.courseTitle}</span> : null}
      <span><TimetableIcon name={palette.icon} size={12} />{palette.label}</span>
      <span>{entry.startTime} – {entry.endTime} (dự kiến)</span>
      {entry.instructor ? <span>{entry.instructor}</span> : null}
      {canJoin ? <b>{joining ? "Đang mở lớp…" : "Vào lớp học"}</b> : null}
      {canJoin ? <small>Link mở trước giờ học 30 phút</small> : null}
    </div>
  </div>;
}

export function StudentSchedulePage({ entries: suppliedEntries }: { entries?: TimetableEntry[] }) {
  const [weekOffset, setWeekOffset] = useState(0);
  const [loadedEntries, setLoadedEntries] = useState<TimetableEntry[]>([]);
  const [loading, setLoading] = useState(suppliedEntries === undefined);
  const [loadError, setLoadError] = useState("");
  const [reloadKey, setReloadKey] = useState(0);
  const [joiningId, setJoiningId] = useState<string | null>(null);
  const [joinError, setJoinError] = useState("");
  const [referenceNow] = useState(() => new Date());
  const scrollRef = useRef<HTMLDivElement | null>(null);
  const currentMinutes = referenceNow.getHours() * 60 + referenceNow.getMinutes();
  const currentLineTop = (currentMinutes - timetableStartHour * 60) / 60 * timetableHourHeight;
  const currentTimeVisible = currentMinutes >= timetableStartHour * 60 && currentMinutes <= timetableEndHour * 60;
  const todayKey = timetableDateKey(referenceNow);
  const weekStart = useMemo(() => timetableStartOfWeek(weekOffset), [weekOffset]);
  const days = useMemo(() => timetableDays(weekStart), [weekStart]);
  const entries = suppliedEntries ?? loadedEntries;
  const loadWeek = useCallback(async (signal: AbortSignal) => {
    if (suppliedEntries !== undefined) return;
    setLoading(true);
    setLoadError("");
    const from = new Date(weekStart);
    const to = new Date(weekStart);
    to.setDate(to.getDate() + 7);
    try {
      const response = await authenticatedFetch(`/api/timetable?from=${encodeURIComponent(from.toISOString())}&to=${encodeURIComponent(to.toISOString())}`, { cache: "no-store", signal });
      const payload = await response.json().catch(() => null) as TimetableApiPayload | null;
      if (signal.aborted) return;
      if (!response.ok) throw new Error(payload?.error ?? "Không thể tải thời khóa biểu.");
      setLoadedEntries((payload?.events ?? []).map(timetableEntryFromApi));
    } catch (value) {
      if (signal.aborted) return;
      setLoadedEntries([]);
      setLoadError(value instanceof Error ? value.message : "Không thể tải thời khóa biểu.");
    } finally {
      if (!signal.aborted) setLoading(false);
    }
  }, [suppliedEntries, weekStart]);

  useEffect(() => {
    const controller = new AbortController();
    const timer = window.setTimeout(() => { void loadWeek(controller.signal); }, 0);
    return () => {
      window.clearTimeout(timer);
      controller.abort();
    };
  }, [loadWeek, reloadKey]);
  const entriesByDate = useMemo(() => {
    const result = new Map(days.map(day => [timetableDateKey(day), [] as TimetableEntry[]]));
    for (const entry of entries) {
      const key = entry.date?.split("T")[0];
      result.get(key)?.push(entry);
    }
    result.forEach(dayEntries => dayEntries.sort((left, right) => timetableTimeMinutes(left.startTime) - timetableTimeMinutes(right.startTime)));
    return result;
  }, [days, entries]);
  const hasEntries = [...entriesByDate.values()].some(dayEntries => dayEntries.length > 0);
  const weekLabel = formatUiWeekRange(days[0], days[6]);
  const returnLabel = weekOffset !== 0 ? "Tuần này" : "Hôm nay";

  useEffect(() => {
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previousOverflow; };
  }, []);

  useEffect(() => {
    if (!scrollRef.current || !currentTimeVisible || weekOffset !== 0) return;
    const timeout = window.setTimeout(() => {
      if (scrollRef.current) scrollRef.current.scrollTop = Math.max(0, currentLineTop - 120);
    }, 150);
    return () => window.clearTimeout(timeout);
  }, [currentLineTop, currentTimeVisible, entries, weekOffset]);

  function scrollToNow() {
    if (scrollRef.current && currentTimeVisible) scrollRef.current.scrollTop = Math.max(0, currentLineTop - 120);
  }

  async function openClass(entry: TimetableEntry) {
    if (!entry.hasLink || !entry.joinUrl || joiningId) return;
    setJoinError("");
    setJoiningId(entry.id);
    try {
      if (entry.eventKind === "lesson") {
        window.location.href = entry.joinUrl;
        return;
      }
      const response = await authenticatedFetch(entry.joinUrl, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { url?: string; path?: string; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Chưa vào lớp được lúc này.");
      const destination = payload?.url ?? payload?.path;
      if (!destination) throw new Error("Buổi học chưa có đường dẫn hợp lệ.");
      if (payload?.url) window.open(destination, "_blank", "noopener,noreferrer");
      else window.location.href = destination;
    } catch (value) {
      setJoinError(value instanceof Error ? value.message : "Chưa vào lớp được lúc này.");
    } finally {
      setJoiningId(null);
    }
  }

  return <div className="student-timetable-page w-full">
    <section className="student-timetable-card bg-white rounded-xl shadow-sm border border-gray-100 select-none overflow-hidden" aria-labelledby="student-timetable-title">
      <div className="student-timetable-toolbar px-5 py-3 border-b border-gray-200 flex items-center justify-between flex-wrap gap-2">
        <h1 id="student-timetable-title" className="student-timetable-title text-base font-semibold text-gray-800 flex items-center gap-2"><TimetableIcon name="calendar" size={16} />Thời Khóa Biểu</h1>
        <div className="student-timetable-tools flex items-center gap-2 flex-wrap">
          <ul className="student-timetable-legends hidden sm:flex items-center gap-2" aria-label="Loại lịch học">
            {(Object.entries(timetablePalettes) as Array<[TimetableFormat, typeof timetablePalettes[TimetableFormat]]>).map(([format, palette]) => <li className="student-timetable-legend inline-flex items-center gap-1 text-[11px] font-medium px-2 py-0.5 rounded-full" style={{ background: palette.pillBackground, color: palette.pillText }} key={format}><TimetableIcon name={palette.icon} />{palette.label}</li>)}
          </ul>
          <nav className="student-timetable-week-controls flex items-center gap-1" aria-label="Điều hướng tuần">
            <button type="button" className="student-timetable-button ant-btn ant-btn-default ant-btn-sm ant-btn-icon-only" onClick={() => setWeekOffset(value => value - 1)} aria-label="Xem tuần trước"><TimetableIcon name="left" /></button>
            <span className="student-timetable-week-label text-xs font-medium text-gray-600 px-1 min-w-[140px] text-center" aria-live="polite">{weekLabel}</span>
            <button type="button" className="student-timetable-button ant-btn ant-btn-default ant-btn-sm ant-btn-icon-only" onClick={() => setWeekOffset(value => value + 1)} aria-label="Xem tuần sau"><TimetableIcon name="right" /></button>
          </nav>
          {weekOffset !== 0 || currentTimeVisible ? <button type="button" className="student-timetable-button student-timetable-today ant-btn ant-btn-default ant-btn-sm" onClick={() => { if (weekOffset !== 0) setWeekOffset(0); else scrollToNow(); }}>{weekOffset === 0 ? <TimetableIcon name="aim" /> : null}<span>{returnLabel}</span></button> : null}
        </div>
      </div>
      {loadError ? <p className="student-timetable-notice" role="alert">{loadError}<button type="button" onClick={() => setReloadKey(value => value + 1)}>Thử lại</button></p> : null}
      {joinError ? <p className="student-timetable-notice" role="alert">{joinError}</p> : null}
      <p id="student-timetable-scroll-hint" className="student-timetable-scroll-hint">Vuốt ngang để xem cả tuần.</p>
      <div ref={scrollRef} className="student-timetable-scroll overflow-y-auto overflow-x-auto" role="region" aria-label="Lịch học theo tuần" aria-describedby="student-timetable-scroll-hint" tabIndex={0} style={{ height: "calc(100vh - 220px)", minHeight: 400 }}>
        <div className="student-timetable-canvas" style={{ minWidth: 560 }}>
          <div className="student-timetable-days flex border-b border-gray-200 bg-white sticky top-0 z-10">
            <div className="student-timetable-axis-head flex-shrink-0 border-r border-gray-100" style={{ width: 52 }} />
            {days.map(day => {
              const key = timetableDateKey(day);
              const isToday = key === todayKey;
              return <div className={`student-timetable-day flex-1 text-center py-2 border-l border-gray-100 min-w-[72px]${isToday ? " is-today" : ""}`} key={key}>
                <div className="student-timetable-day-name text-[10px] leading-none" style={{ color: isToday ? timetableAccent : "#9ca3af" }}><span className="student-timetable-day-long hidden sm:block">{timetableDayNames[day.getDay()]}</span><span className="student-timetable-day-short block sm:hidden">{timetableShortDayNames[day.getDay()]}</span></div>
                <div className="student-timetable-day-date text-[12px] font-semibold leading-tight mt-0.5" style={{ color: isToday ? timetableAccent : "#6b7280" }}>{day.getDate()}/{day.getMonth() + 1}</div>
                {isToday ? <span className="student-timetable-today-dot" /> : null}
              </div>;
            })}
          </div>
          <div className="student-timetable-grid relative">
            {loading ? <div className="student-timetable-empty" role="status">Đang tải lịch học…</div> : !loadError && !hasEntries ? <div className="student-timetable-empty">Không có lịch học trong tuần này</div> : null}
            <div className="student-timetable-grid-row flex" style={{ height: timetableHeight }}>
              <div className="student-timetable-axis flex-shrink-0 relative border-r border-gray-100 bg-white" style={{ width: 52 }}>
                {Array.from({ length: timetableEndHour - timetableStartHour }, (_, index) => timetableStartHour + index + 1).map(hour => <div className="student-timetable-hour absolute right-2 text-[11px] text-gray-400 leading-none" style={{ top: (hour - timetableStartHour) * timetableHourHeight - 7 }} key={hour}>{String(hour).padStart(2, "0")}:00</div>)}
              </div>
              {days.map(day => {
                const key = timetableDateKey(day);
                const isToday = key === todayKey;
                const dayEntries = entriesByDate.get(key) ?? [];
                return <div className={`student-timetable-column flex-1 relative border-l border-gray-100 min-w-[72px]${isToday ? " is-today" : ""}`} key={key}>
                  {Array.from({ length: timetableEndHour - timetableStartHour + 1 }, (_, index) => <span className="student-timetable-hour-line" style={{ top: index * timetableHourHeight }} key={index} />)}
                  {Array.from({ length: timetableEndHour - timetableStartHour }, (_, index) => <span className="student-timetable-half-line" style={{ top: index * timetableHourHeight + timetableHourHeight / 2 }} key={`half-${index}`} />)}
                  {isToday && currentTimeVisible ? <div className="student-timetable-now-line" style={{ top: currentLineTop }}><span /><i /></div> : null}
                  {dayEntries.map(entry => {
                    const startMinutes = timetableTimeMinutes(entry.startTime);
                    const endMinutes = timetableTimeMinutes(entry.endTime);
                    const top = (startMinutes - timetableStartHour * 60) / 60 * timetableHourHeight;
                    const height = Math.max((endMinutes - startMinutes) / 60 * timetableHourHeight - 2, 22);
                    return <TimetableEventCard entry={entry} top={top} height={height} joining={joiningId === entry.id} onJoin={item => void openClass(item)} key={entry.id} />;
                  })}
                </div>;
              })}
            </div>
          </div>
        </div>
      </div>
    </section>
  </div>;
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

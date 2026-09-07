"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  CircleAlert,
  Clock3,
  Eye,
  EyeOff,
  ExternalLink,
  Pencil,
  Plus,
  RefreshCw,
  RotateCcw,
  Save,
  Sparkles,
  Trash2,
  Video,
  X,
} from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";

type Course = { id: string; title: string; published: boolean };
type Chapter = { id: string; course_id: string; title: string; sort_order: number };
type Lesson = { id: string; chapter_id: string; title: string; published: boolean; sort_order: number };
type CourseEvent = {
  id: string;
  course_id: string;
  lesson_id: string | null;
  title: string;
  description: string;
  start_at: string;
  end_at: string;
  instructor: string;
  delivery_mode: "online" | "offline" | "hybrid" | "self_study";
  meeting_url: string | null;
  event_kind: "live" | "lesson";
  source: "manual" | "generated";
  generation_batch_id: string | null;
  status: "scheduled" | "cancelled";
  published: boolean;
};
type Payload = { courses?: Course[]; chapters?: Chapter[]; lessons?: Lesson[]; events?: CourseEvent[]; error?: string };
type Mode = "list" | "live" | "generate" | "edit";
type EditableEvent = {
  id: string;
  eventKind: CourseEvent["event_kind"];
  title: string;
  description: string;
  instructor: string;
  startAt: string;
  endAt: string;
  deliveryMode: CourseEvent["delivery_mode"];
  meetingUrl: string;
  published: boolean;
};
type DateRange = { from: string; to: string };

const dayOptions = [
  { value: 1, label: "Thứ Hai" }, { value: 2, label: "Thứ Ba" }, { value: 3, label: "Thứ Tư" },
  { value: 4, label: "Thứ Năm" }, { value: 5, label: "Thứ Sáu" }, { value: 6, label: "Thứ Bảy" }, { value: 7, label: "Chủ Nhật" },
];

function localInput(value: Date | string) {
  const date = value instanceof Date ? value : new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dateInput(value = new Date()) {
  return localInput(value).slice(0, 10);
}

function newLiveWindow() {
  const start = new Date();
  start.setDate(start.getDate() + 1);
  start.setHours(19, 0, 0, 0);
  return { startAt: localInput(start), endAt: localInput(new Date(start.getTime() + 90 * 60_000)) };
}

function offsetDateInput(days: number) {
  const value = new Date();
  value.setDate(value.getDate() + days);
  return dateInput(value);
}

function defaultDateRange(): DateRange {
  return { from: offsetDateInput(-7), to: offsetDateInput(54) };
}

function offsetInputDate(value: string, days: number) {
  const date = new Date(`${value}T12:00:00`);
  date.setDate(date.getDate() + days);
  return dateInput(date);
}

function dateRangeIso(range: DateRange) {
  const from = new Date(`${range.from}T00:00:00`);
  const to = new Date(`${range.to}T23:59:59.999`);
  const duration = to.getTime() - from.getTime();
  if (!Number.isFinite(duration) || duration < 0) throw new Error("Khoảng ngày xem lịch không hợp lệ.");
  if (duration > 62 * 24 * 60 * 60 * 1000) throw new Error("Chỉ được xem tối đa 62 ngày lịch mỗi lần.");
  return { from: from.toISOString(), to: to.toISOString() };
}

export default function AdminCourseTimetable() {
  const initialWindow = useMemo(() => newLiveWindow(), []);
  const [courses, setCourses] = useState<Course[]>([]);
  const [chapters, setChapters] = useState<Chapter[]>([]);
  const [lessons, setLessons] = useState<Lesson[]>([]);
  const [events, setEvents] = useState<CourseEvent[]>([]);
  const [courseId, setCourseId] = useState("");
  const [mode, setMode] = useState<Mode>("list");
  const [range, setRange] = useState<DateRange>(defaultDateRange);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [busyEventId, setBusyEventId] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [live, setLive] = useState({ title: "", description: "", lessonId: "", instructor: "", startAt: initialWindow.startAt, endAt: initialWindow.endAt, deliveryMode: "online", meetingUrl: "", published: true });
  const [editing, setEditing] = useState<EditableEvent | null>(null);
  const [rule, setRule] = useState({ startDate: dateInput(), weekdays: [1, 3, 5], startTime: "19:00", durationMinutes: 90, published: true });
  const abortRef = useRef<AbortController | null>(null);

  const load = useCallback(async () => {
    abortRef.current?.abort();
    const controller = new AbortController();
    abortRef.current = controller;
    setLoading(true); setError("");
    try {
      const window = dateRangeIso(range);
      const response = await authenticatedFetch(`/api/admin/course-timetable?from=${encodeURIComponent(window.from)}&to=${encodeURIComponent(window.to)}`, { cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => null) as Payload | null;
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(payload?.error ?? "Không thể tải lịch khóa học.");
      const nextCourses = payload?.courses ?? [];
      setCourses(nextCourses); setChapters(payload?.chapters ?? []); setLessons(payload?.lessons ?? []); setEvents(payload?.events ?? []);
      setCourseId(current => current && nextCourses.some(course => course.id === current) ? current : nextCourses[0]?.id ?? "");
    } catch (value) {
      if (!controller.signal.aborted) setError(value instanceof Error ? value.message : "Không thể tải lịch khóa học.");
    } finally {
      if (!controller.signal.aborted) setLoading(false);
    }
  }, [range]);

  useEffect(() => {
    const timer = window.setTimeout(() => { void load(); }, 0);
    return () => {
      window.clearTimeout(timer);
      abortRef.current?.abort();
    };
  }, [load]);

  const chapterIds = useMemo(() => new Set(chapters.filter(chapter => chapter.course_id === courseId).map(chapter => chapter.id)), [chapters, courseId]);
  const courseLessons = useMemo(() => lessons.filter(lesson => chapterIds.has(lesson.chapter_id)), [chapterIds, lessons]);
  const courseEvents = useMemo(() => events.filter(event => !courseId || event.course_id === courseId).toSorted((left, right) => Date.parse(left.start_at) - Date.parse(right.start_at)), [courseId, events]);
  const courseMap = useMemo(() => new Map(courses.map(course => [course.id, course.title])), [courses]);
  const lessonMap = useMemo(() => new Map(lessons.map(lesson => [lesson.id, lesson.title])), [lessons]);
  const latestRangeEnd = useMemo(() => offsetInputDate(range.from, 61), [range.from]);

  async function submitLive(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await authenticatedFetch("/api/admin/course-timetable", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ eventKind: "live", courseId, lessonId: live.lessonId || null, title: live.title, description: live.description, instructor: live.instructor, startAt: new Date(live.startAt).toISOString(), endAt: new Date(live.endAt).toISOString(), deliveryMode: live.deliveryMode, meetingUrl: live.deliveryMode === "offline" ? null : live.meetingUrl || null, published: live.published }) });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Không thể tạo buổi học.");
      setNotice("Đã tạo buổi học."); setMode("list"); setLive(current => ({ ...current, title: "", description: "", lessonId: "", meetingUrl: "" })); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể tạo buổi học."); }
    finally { setSaving(false); }
  }

  async function submitGeneration(event: React.FormEvent) {
    event.preventDefault();
    if (saving) return;
    setSaving(true); setError(""); setNotice("");
    try {
      const response = await authenticatedFetch("/api/admin/course-timetable/generate", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ courseId, ...rule }) });
      const payload = await response.json().catch(() => null) as { error?: string; events?: CourseEvent[] } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Không thể sinh lịch bài học.");
      setNotice(`Đã tạo ${payload?.events?.length ?? 0} sự kiện bài học.`); setMode("list"); await load();
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể sinh lịch bài học."); }
    finally { setSaving(false); }
  }

  function startEdit(item: CourseEvent) {
    setEditing({
      id: item.id,
      eventKind: item.event_kind,
      title: item.title,
      description: item.description,
      instructor: item.instructor,
      startAt: localInput(item.start_at),
      endAt: localInput(item.end_at),
      deliveryMode: item.delivery_mode,
      meetingUrl: item.meeting_url ?? "",
      published: item.published,
    });
    setError("");
    setNotice("");
    setMode("edit");
  }

  async function patchEvent(item: CourseEvent, changes: Record<string, unknown>, successMessage: string) {
    if (saving) return null;
    setSaving(true); setBusyEventId(item.id); setError(""); setNotice("");
    try {
      const response = await authenticatedFetch(`/api/admin/course-timetable/${encodeURIComponent(item.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(changes),
      });
      const payload = await response.json().catch(() => null) as { event?: CourseEvent; error?: string } | null;
      if (!response.ok || !payload?.event) throw new Error(payload?.error ?? "Không thể cập nhật sự kiện.");
      setEvents(current => current.map(event => event.id === item.id ? payload.event! : event));
      setNotice(successMessage);
      return payload.event;
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể cập nhật sự kiện.");
      return null;
    } finally {
      setSaving(false); setBusyEventId("");
    }
  }

  async function submitEdit(event: React.FormEvent) {
    event.preventDefault();
    if (!editing) return;
    const current = events.find(item => item.id === editing.id);
    if (!current) { setError("Sự kiện này không còn trong danh sách."); return; }
    const changes: Record<string, unknown> = {
      title: editing.title,
      description: editing.description,
      startAt: new Date(editing.startAt).toISOString(),
      endAt: new Date(editing.endAt).toISOString(),
      published: editing.published,
    };
    if (editing.eventKind === "live") {
      changes.instructor = editing.instructor;
      changes.deliveryMode = editing.deliveryMode;
      changes.meetingUrl = editing.deliveryMode === "offline" ? null : editing.meetingUrl || null;
    }
    const updated = await patchEvent(current, changes, "Đã lưu thay đổi sự kiện.");
    if (updated) { setEditing(null); setMode("list"); }
  }

  async function togglePublished(item: CourseEvent) {
    await patchEvent(item, { published: !item.published }, item.published ? "Đã ẩn sự kiện khỏi học viên." : "Đã hiển thị sự kiện cho học viên.");
  }

  async function toggleStatus(item: CourseEvent) {
    const nextStatus = item.status === "cancelled" ? "scheduled" : "cancelled";
    await patchEvent(item, { status: nextStatus }, nextStatus === "cancelled" ? "Đã hủy sự kiện." : "Đã khôi phục sự kiện.");
  }

  async function removeEvent(item: CourseEvent) {
    if (!window.confirm(`Xóa sự kiện “${item.title}”?`) || saving) return;
    setSaving(true); setBusyEventId(item.id); setError(""); setNotice("");
    try {
      const response = await authenticatedFetch(`/api/admin/course-timetable/${encodeURIComponent(item.id)}`, { method: "DELETE" });
      const payload = await response.json().catch(() => null) as { error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Không thể xóa sự kiện.");
      setEvents(current => current.filter(event => event.id !== item.id)); setNotice("Đã xóa sự kiện.");
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể xóa sự kiện."); }
    finally { setSaving(false); setBusyEventId(""); }
  }

  return <section className="admin-course-timetable" aria-labelledby="admin-course-timetable-title">
    <header className="admin-course-timetable-head">
      <div><h2 id="admin-course-timetable-title">Lịch khóa học</h2><p>Tạo buổi live hoặc sinh lịch tuần tự từ các bài học đã xuất bản.</p></div>
      <div className="admin-course-timetable-actions"><button type="button" onClick={() => { setEditing(null); setMode("live"); }}><Plus aria-hidden="true" />Tạo buổi live</button><button type="button" onClick={() => { setEditing(null); setMode("generate"); }}><Sparkles aria-hidden="true" />Sinh lịch bài học</button><button type="button" onClick={() => void load()} disabled={loading} aria-label="Làm mới lịch" title="Làm mới lịch"><RefreshCw className={loading ? "is-spinning" : undefined} aria-hidden="true" /></button></div>
    </header>
    <div className="admin-course-timetable-filters">
      <label>Khóa học<select value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">Tất cả khóa học</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}{course.published ? "" : " — Bản nháp"}</option>)}</select></label>
      <label>Từ ngày<input type="date" value={range.from} max={range.to} onChange={event => setRange(current => ({ ...current, from: event.target.value }))} /></label>
      <label>Đến ngày<input type="date" value={range.to} min={range.from} max={latestRangeEnd} onChange={event => setRange(current => ({ ...current, to: event.target.value }))} /></label>
    </div>
    {error ? <p className="admin-timetable-page-error" role="alert"><CircleAlert aria-hidden="true" />{error}</p> : null}
    {notice ? <p className="admin-timetable-notice" role="status"><CheckCircle2 aria-hidden="true" />{notice}<button type="button" aria-label="Đóng thông báo" onClick={() => setNotice("")}>×</button></p> : null}

    {mode === "live" ? <form className="admin-course-timetable-form" onSubmit={submitLive}>
      <div className="admin-course-timetable-form-head"><Video aria-hidden="true" /><div><h3>Tạo buổi live</h3><p>Buổi học bắt buộc gắn với một khóa học hiện có.</p></div></div>
      <label>Khóa học<select required value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">Chọn khóa học</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
      <label>Bài học (không bắt buộc)<select value={live.lessonId} onChange={event => setLive(current => ({ ...current, lessonId: event.target.value }))}><option value="">Không gắn bài cụ thể</option>{courseLessons.map(lesson => <option key={lesson.id} value={lesson.id}>{lesson.title}</option>)}</select></label>
      <label className="wide">Tên buổi học<input required maxLength={180} value={live.title} onChange={event => setLive(current => ({ ...current, title: event.target.value }))} placeholder="Ví dụ: Ôn tập hàm số" /></label>
      <label className="wide">Mô tả<textarea maxLength={2000} value={live.description} onChange={event => setLive(current => ({ ...current, description: event.target.value }))} placeholder="Nội dung hoặc lưu ý cho buổi học" /></label>
      <label>Giờ bắt đầu<input type="datetime-local" required value={live.startAt} onChange={event => setLive(current => ({ ...current, startAt: event.target.value }))} /></label>
      <label>Giờ kết thúc<input type="datetime-local" required min={live.startAt} value={live.endAt} onChange={event => setLive(current => ({ ...current, endAt: event.target.value }))} /></label>
      <label>Hình thức<select value={live.deliveryMode} onChange={event => setLive(current => ({ ...current, deliveryMode: event.target.value }))}><option value="online">Trực tuyến</option><option value="offline">Tại lớp</option><option value="hybrid">Kết hợp</option></select></label>
      <label>Giáo viên<input value={live.instructor} onChange={event => setLive(current => ({ ...current, instructor: event.target.value }))} /></label>
      <label className="wide">Link vào lớp<input type="url" required={live.deliveryMode !== "offline"} disabled={live.deliveryMode === "offline"} value={live.meetingUrl} onChange={event => setLive(current => ({ ...current, meetingUrl: event.target.value }))} placeholder={live.deliveryMode === "offline" ? "Buổi học tại lớp không cần link" : "https://…"} /></label>
      <label className="admin-course-timetable-check wide"><input type="checkbox" checked={live.published} onChange={event => setLive(current => ({ ...current, published: event.target.checked }))} />Hiển thị cho học viên</label>
      <div className="admin-course-timetable-form-actions wide"><button type="button" onClick={() => setMode("list")}>Hủy</button><button type="submit" disabled={saving}>{saving ? "Đang tạo…" : "Tạo buổi học"}</button></div>
    </form> : null}

    {mode === "generate" ? <form className="admin-course-timetable-form" onSubmit={submitGeneration}>
      <div className="admin-course-timetable-form-head"><Sparkles aria-hidden="true" /><div><h3>Sinh lịch bài học</h3><p>Xếp từng bài đã xuất bản theo đúng thứ tự phần và bài.</p></div></div>
      <label>Khóa học<select required value={courseId} onChange={event => setCourseId(event.target.value)}><option value="">Chọn khóa học</option>{courses.map(course => <option key={course.id} value={course.id}>{course.title}</option>)}</select></label>
      <label>Ngày bắt đầu<input type="date" required value={rule.startDate} onChange={event => setRule(current => ({ ...current, startDate: event.target.value }))} /></label>
      <fieldset className="wide"><legend>Ngày học trong tuần</legend><div className="admin-course-timetable-days">{dayOptions.map(day => <label key={day.value}><input type="checkbox" checked={rule.weekdays.includes(day.value)} onChange={event => setRule(current => ({ ...current, weekdays: event.target.checked ? [...current.weekdays, day.value].sort() : current.weekdays.filter(value => value !== day.value) }))} />{day.label}</label>)}</div></fieldset>
      <label>Giờ bắt đầu<input type="time" required value={rule.startTime} onChange={event => setRule(current => ({ ...current, startTime: event.target.value }))} /></label>
      <label>Thời lượng mỗi buổi<input type="number" min={5} max={1440} step={5} required value={rule.durationMinutes} onChange={event => setRule(current => ({ ...current, durationMinutes: Number(event.target.value) }))} /></label>
      <label className="admin-course-timetable-check wide"><input type="checkbox" checked={rule.published} onChange={event => setRule(current => ({ ...current, published: event.target.checked }))} />Hiển thị lịch vừa sinh cho học viên</label>
      <div className="admin-course-timetable-form-actions wide"><button type="button" onClick={() => setMode("list")}>Hủy</button><button type="submit" disabled={saving || !rule.weekdays.length}>{saving ? "Đang sinh lịch…" : `Sinh lịch cho ${courseLessons.filter(lesson => lesson.published).length} bài`}</button></div>
    </form> : null}

    {mode === "edit" && editing ? <form className="admin-course-timetable-form" onSubmit={submitEdit}>
      <div className="admin-course-timetable-form-head"><Pencil aria-hidden="true" /><div><h3>Chỉnh sửa sự kiện</h3><p>{editing.eventKind === "live" ? "Cập nhật thông tin buổi live." : "Cập nhật tên và thời gian bài học trong lịch."}</p></div><button type="button" className="admin-course-timetable-form-close" onClick={() => { setEditing(null); setMode("list"); }} aria-label="Đóng biểu mẫu chỉnh sửa"><X aria-hidden="true" /></button></div>
      <label className="wide">Tên sự kiện<input required maxLength={180} value={editing.title} onChange={event => setEditing(current => current ? { ...current, title: event.target.value } : current)} /></label>
      <label className="wide">Mô tả<textarea maxLength={2000} value={editing.description} onChange={event => setEditing(current => current ? { ...current, description: event.target.value } : current)} /></label>
      <label>Giờ bắt đầu<input type="datetime-local" required value={editing.startAt} onChange={event => setEditing(current => current ? { ...current, startAt: event.target.value } : current)} /></label>
      <label>Giờ kết thúc<input type="datetime-local" required min={editing.startAt} value={editing.endAt} onChange={event => setEditing(current => current ? { ...current, endAt: event.target.value } : current)} /></label>
      {editing.eventKind === "live" ? <>
        <label>Hình thức<select value={editing.deliveryMode} onChange={event => setEditing(current => current ? { ...current, deliveryMode: event.target.value as CourseEvent["delivery_mode"] } : current)}><option value="online">Trực tuyến</option><option value="offline">Tại lớp</option><option value="hybrid">Kết hợp</option></select></label>
        <label>Giáo viên<input maxLength={160} value={editing.instructor} onChange={event => setEditing(current => current ? { ...current, instructor: event.target.value } : current)} /></label>
        <label className="wide">Link vào lớp<input type="url" required={editing.deliveryMode !== "offline"} disabled={editing.deliveryMode === "offline"} value={editing.meetingUrl} onChange={event => setEditing(current => current ? { ...current, meetingUrl: event.target.value } : current)} placeholder={editing.deliveryMode === "offline" ? "Buổi học tại lớp không cần link" : "https://…"} /></label>
      </> : null}
      <label className="admin-course-timetable-check wide"><input type="checkbox" checked={editing.published} onChange={event => setEditing(current => current ? { ...current, published: event.target.checked } : current)} />Hiển thị cho học viên</label>
      <div className="admin-course-timetable-form-actions wide"><button type="button" onClick={() => { setEditing(null); setMode("list"); }}>Hủy</button><button type="submit" disabled={saving}><Save aria-hidden="true" />{saving ? "Đang lưu…" : "Lưu thay đổi"}</button></div>
    </form> : null}

    <div className="admin-course-timetable-list" aria-busy={loading}>
      {loading ? <p className="admin-timetable-loading" role="status"><RefreshCw className="is-spinning" aria-hidden="true" />Đang tải lịch khóa học…</p> : courseEvents.length ? courseEvents.map(item => <article key={item.id} className={item.status === "cancelled" ? "is-cancelled" : undefined} aria-busy={busyEventId === item.id}>
        <div className="admin-course-timetable-date"><CalendarDays aria-hidden="true" /><time dateTime={item.start_at}>{new Date(item.start_at).toLocaleDateString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", day: "2-digit", month: "2-digit", year: "numeric" })}</time><span><Clock3 aria-hidden="true" />{new Date(item.start_at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })}–{new Date(item.end_at).toLocaleTimeString("vi-VN", { timeZone: "Asia/Ho_Chi_Minh", hour: "2-digit", minute: "2-digit" })}</span></div>
        <div className="admin-course-timetable-copy"><span>{item.event_kind === "live" ? "Buổi live" : "Bài học tự sinh"}</span><h3>{item.title}</h3><p>{courseMap.get(item.course_id)}{item.lesson_id ? ` · ${lessonMap.get(item.lesson_id) ?? "Bài học"}` : ""}</p></div>
        <div className="admin-course-timetable-state"><span>{item.status === "cancelled" ? "Đã hủy" : item.published ? "Đã xuất bản" : "Bản nháp"}</span><small>{item.delivery_mode === "online" ? "Trực tuyến" : item.delivery_mode === "offline" ? "Tại lớp" : item.delivery_mode === "hybrid" ? "Kết hợp" : "Tự học"}</small></div>
        <div className="admin-course-timetable-row-actions">
          {item.meeting_url && item.delivery_mode !== "offline" ? <a href={item.meeting_url} target="_blank" rel="noreferrer" aria-label={`Mở link ${item.title}`} title="Mở link"><ExternalLink aria-hidden="true" /></a> : null}
          <button type="button" disabled={saving} onClick={() => startEdit(item)} aria-label={`Chỉnh sửa ${item.title}`} title="Chỉnh sửa"><Pencil aria-hidden="true" /></button>
          <button type="button" disabled={saving} onClick={() => void togglePublished(item)} aria-label={`${item.published ? "Ẩn" : "Hiện"} ${item.title} với học viên`} title={item.published ? "Ẩn với học viên" : "Hiện với học viên"}>{item.published ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button>
          <button type="button" disabled={saving} onClick={() => void toggleStatus(item)} aria-label={`${item.status === "cancelled" ? "Khôi phục" : "Hủy"} ${item.title}`} title={item.status === "cancelled" ? "Khôi phục sự kiện" : "Hủy sự kiện"}><RotateCcw aria-hidden="true" /></button>
          <button type="button" disabled={saving} onClick={() => void removeEvent(item)} aria-label={`Xóa ${item.title}`} title="Xóa vĩnh viễn"><Trash2 aria-hidden="true" /></button>
        </div>
      </article>) : <p className="admin-timetable-inline-empty" role="status">Khóa học này chưa có lịch.</p>}
    </div>
  </section>;
}

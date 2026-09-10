"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent } from "react";
import {
  CalendarClock,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  CircleAlert,
  Clock3,
  RefreshCw,
  Save,
  Search,
  Trash2,
} from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import AeckConfirmDialog from "../components/aeck/AeckConfirmDialog";
import { formatUiDate, formatUiTime, formatUiWeekday } from "./ui-format";
import AdminCourseTimetable from "./admin-course-timetable";

type AdminTimetableRoom = {
  id: string;
  title: string;
  description: string;
  exam_type: string;
  access_mode: "open" | "assigned";
  exam_start: string | null;
  exam_end: string | null;
  published: boolean;
  sort_order: number;
  created_at: string;
  exam_count: number;
  published_exam_count: number;
};

type TimetablePayload = {
  rooms?: AdminTimetableRoom[];
  room?: AdminTimetableRoom;
  serverTime?: string;
  error?: string;
};

type TimetableView = "courses" | "exams";

function timetableViewFromUrl(url: URL): TimetableView {
  return url.searchParams.get("view") === "exams" ? "exams" : "courses";
}

function startOfWeek(value: Date) {
  const date = new Date(value);
  const day = date.getDay();
  date.setDate(date.getDate() + (day === 0 ? -6 : 1 - day));
  date.setHours(0, 0, 0, 0);
  return date;
}

function addDays(value: Date, amount: number) {
  const date = new Date(value);
  date.setDate(date.getDate() + amount);
  return date;
}

function dateKey(value: Date) {
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, "0")}-${String(value.getDate()).padStart(2, "0")}`;
}

function validDate(value?: string | null) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function localDateTimeValue(value?: string | null, fallback?: Date) {
  const date = validDate(value) ?? fallback ?? new Date();
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function nextEditableWindow() {
  const start = new Date();
  start.setMinutes(0, 0, 0);
  start.setHours(start.getHours() + 1);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);
  return { start, end };
}

function formatTime(value?: string | null) {
  return formatUiTime(value, "—");
}

function roomScheduleState(room: AdminTimetableRoom, now = Date.now()) {
  const start = validDate(room.exam_start)?.getTime();
  const end = validDate(room.exam_end)?.getTime();
  if (start == null) return { label: "Chưa xếp lịch", tone: "unscheduled" };
  if (start > now) return { label: "Sắp diễn ra", tone: "upcoming" };
  if (end == null || end >= now) return { label: "Đang mở", tone: "live" };
  return { label: "Đã kết thúc", tone: "ended" };
}

function TimetableEditor({
  room,
  onSaved,
}: {
  room: AdminTimetableRoom;
  onSaved: (room: AdminTimetableRoom, notice: string) => void;
}) {
  const fallback = useMemo(() => nextEditableWindow(), []);
  const [startAt, setStartAt] = useState(() => localDateTimeValue(room.exam_start, fallback.start));
  const [endAt, setEndAt] = useState(() => localDateTimeValue(room.exam_end, fallback.end));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [pendingScheduleRemoval, setPendingScheduleRemoval] = useState(false);
  const [scheduleRemovalError, setScheduleRemovalError] = useState("");
  const scheduled = Boolean(validDate(room.exam_start));
  const scheduleAbortController = useRef<AbortController | null>(null);
  const startTimestamp = Date.parse(startAt);
  const endTimestamp = Date.parse(endAt);
  const invalidRange = Number.isFinite(startTimestamp) && Number.isFinite(endTimestamp) && endTimestamp <= startTimestamp;
  const startInvalid = Boolean(error && (!startAt || !Number.isFinite(startTimestamp) || invalidRange));
  const endInvalid = Boolean(error && (!endAt || !Number.isFinite(endTimestamp) || invalidRange));

  useEffect(() => () => scheduleAbortController.current?.abort(), []);

  async function updateSchedule(start: string | null, end: string | null, source: "save" | "remove") {
    if (saving) return;
    scheduleAbortController.current?.abort();
    const controller = new AbortController();
    scheduleAbortController.current = controller;
    setSaving(true);
    if (source === "remove") setScheduleRemovalError(""); else setError("");
    try {
      const response = await authenticatedFetch("/api/admin/timetable", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          roomId: room.id,
          startAt: start ? new Date(start).toISOString() : null,
          endAt: end ? new Date(end).toISOString() : null,
        }),
        signal: controller.signal,
      });
      const payload = await response.json().catch(() => null) as TimetablePayload | null;
      if (controller.signal.aborted) return;
      if (!response.ok || !payload?.room) throw new Error(payload?.error ?? "Không thể cập nhật lịch vận hành.");
      onSaved(payload.room, start ? "Đã lưu lịch vận hành." : "Đã gỡ lịch khỏi phòng thi.");
      if (source === "remove") setPendingScheduleRemoval(false);
    } catch (value) {
      if (controller.signal.aborted) return;
      const message = value instanceof Error ? value.message : "Không thể cập nhật lịch vận hành.";
      if (source === "remove") setScheduleRemovalError(message); else setError(message);
    } finally {
      if (scheduleAbortController.current === controller) setSaving(false);
    }
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    const start = Date.parse(startAt);
    const end = Date.parse(endAt);
    if (!Number.isFinite(start) || !Number.isFinite(end)) {
      setError("Hãy nhập đầy đủ thời gian bắt đầu và kết thúc.");
      return;
    }
    if (end <= start) {
      setError("Thời gian kết thúc phải sau thời gian bắt đầu.");
      return;
    }
    void updateSchedule(startAt, endAt, "save");
  }

  return (
    <>
      <form className="admin-timetable-editor" onSubmit={submit} aria-labelledby="admin-timetable-editor-title">
      <div className="admin-timetable-panel-heading">
        <span><Clock3 aria-hidden="true" /></span>
        <div>
          <h2 id="admin-timetable-editor-title">Thiết lập thời gian</h2>
          <p>Lịch này được đồng bộ sang thời khóa biểu học viên.</p>
        </div>
      </div>

      <div className="admin-timetable-room-identity">
        <span className={`admin-timetable-publish-state ${room.published ? "is-published" : "is-draft"}`}>
          {room.published ? "Đã xuất bản" : "Bản nháp"}
        </span>
        <strong title={room.title}>{room.title}</strong>
        <small>{room.exam_type} · {room.exam_count} đề · {room.access_mode === "open" ? "Mở" : "Được phân quyền"}</small>
      </div>

      <label htmlFor="admin-timetable-start">Bắt đầu
        <input id="admin-timetable-start" name="startAt" type="datetime-local" autoComplete="off" value={startAt} onChange={event => { setStartAt(event.target.value); setError(""); }} aria-invalid={startInvalid} aria-describedby={error ? "admin-timetable-editor-error" : undefined} required />
      </label>
      <label htmlFor="admin-timetable-end">Kết thúc
        <input id="admin-timetable-end" name="endAt" type="datetime-local" autoComplete="off" value={endAt} min={startAt || undefined} onChange={event => { setEndAt(event.target.value); setError(""); }} aria-invalid={endInvalid} aria-describedby={error ? "admin-timetable-editor-error" : undefined} required />
      </label>

      {error ? <p id="admin-timetable-editor-error" className="admin-timetable-form-error" role="alert"><CircleAlert aria-hidden="true" />{error}</p> : null}

      <div className="admin-timetable-editor-actions">
        <button type="button" className="admin-timetable-secondary-action" disabled={saving || !scheduled} onClick={() => setPendingScheduleRemoval(true)}>
          <Trash2 aria-hidden="true" />Gỡ lịch
        </button>
        <button type="submit" className="admin-timetable-primary-action" disabled={saving}>
          {saving ? <RefreshCw className="is-spinning" aria-hidden="true" /> : <Save aria-hidden="true" />}
          {saving ? "Đang lưu…" : "Lưu lịch"}
        </button>
      </div>
      </form>
      {pendingScheduleRemoval ? <AeckConfirmDialog
        open
      title="Gỡ lịch phòng thi?"
      description={`Lịch của “${room.title}” sẽ được gỡ khỏi lịch vận hành và không còn hiển thị cho học viên. Phòng thi và đề thi vẫn được giữ nguyên.`}
        errorMessage={scheduleRemovalError}
        secondaryAction={{ label: "Hủy", onClick: () => { setScheduleRemovalError(""); setPendingScheduleRemoval(false); }, disabled: saving }}
        primaryAction={{ label: saving ? "Đang gỡ…" : "Gỡ lịch", onClick: () => void updateSchedule(null, null, "remove"), disabled: saving }}
        onClose={() => { if (!saving) { setScheduleRemovalError(""); setPendingScheduleRemoval(false); } }}
      /> : null}
    </>
  );
}

function ExamRoomTimetable() {
  const [rooms, setRooms] = useState<AdminTimetableRoom[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [weekOffset, setWeekOffset] = useState(0);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [referenceNow, setReferenceNow] = useState(() => new Date());
  const timetableAbortController = useRef<AbortController | null>(null);

  const loadTimetable = useCallback(async () => {
    timetableAbortController.current?.abort();
    const controller = new AbortController();
    timetableAbortController.current = controller;
    setLoading(true);
    setError("");
    try {
      const response = await authenticatedFetch("/api/admin/timetable", { cache: "no-store", signal: controller.signal });
      const payload = await response.json().catch(() => null) as TimetablePayload | null;
      if (controller.signal.aborted) return;
      if (!response.ok) throw new Error(payload?.error ?? "Không thể tải lịch vận hành.");
      const nextRooms = payload?.rooms ?? [];
      const serverNow = validDate(payload?.serverTime);
      setRooms(nextRooms);
      if (serverNow) setReferenceNow(serverNow);
      setSelectedRoomId(current => current && nextRooms.some(room => room.id === current)
        ? current
        : nextRooms.find(room => !validDate(room.exam_start))?.id ?? nextRooms[0]?.id ?? "");
    } catch (value) {
      if (controller.signal.aborted) return;
      setError(value instanceof Error ? value.message : "Không thể tải lịch vận hành.");
    } finally {
      if (!controller.signal.aborted && timetableAbortController.current === controller) setLoading(false);
    }
  }, []);

  useEffect(() => () => timetableAbortController.current?.abort(), []);
  useEffect(() => {
    // This effect starts an async request; its state updates happen after the
    // request resolves and are guarded by the controller above.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadTimetable();
  }, [loadTimetable]);

  const weekStart = useMemo(() => addDays(startOfWeek(referenceNow), weekOffset * 7), [referenceNow, weekOffset]);
  const days = useMemo(() => Array.from({ length: 7 }, (_, index) => addDays(weekStart, index)), [weekStart]);
  const scheduledRooms = useMemo(() => rooms
    .filter(room => validDate(room.exam_start))
    .sort((left, right) => Date.parse(left.exam_start!) - Date.parse(right.exam_start!)), [rooms]);
  const unscheduledRooms = useMemo(() => rooms.filter(room => !validDate(room.exam_start)), [rooms]);
  const selectedRoom = rooms.find(room => room.id === selectedRoomId) ?? null;
  const roomsByDay = useMemo(() => {
    const result = new Map(days.map(day => [dateKey(day), [] as AdminTimetableRoom[]]));
    for (const room of scheduledRooms) {
      const start = validDate(room.exam_start);
      if (start) result.get(dateKey(start))?.push(room);
    }
    return result;
  }, [days, scheduledRooms]);
  const normalizedQuery = query.trim().toLocaleLowerCase("vi-VN");
  const visibleUnscheduledRooms = unscheduledRooms.filter(room => !normalizedQuery || `${room.title} ${room.exam_type} ${room.description}`.toLocaleLowerCase("vi-VN").includes(normalizedQuery));
  const weekEnd = days[6];
  const weekLabel = `${formatUiDate(weekStart)} – ${formatUiDate(weekEnd)}`;
  const now = referenceNow.getTime();
  const activeCount = scheduledRooms.filter(room => {
    const start = validDate(room.exam_start)?.getTime();
    const end = validDate(room.exam_end)?.getTime();
    return start != null && start <= now && (end == null || end >= now);
  }).length;

  function handleSaved(updatedRoom: AdminTimetableRoom, message: string) {
    setRooms(current => current.map(room => room.id === updatedRoom.id ? { ...room, ...updatedRoom } : room));
    setNotice(message);
  }

  return (
    <div className="admin-timetable-page">
      <header className="admin-timetable-header">
        <div>
          <h1>Lịch phòng thi</h1>
          <p>Sắp xếp thời gian mở phòng thi theo tuần, tách biệt với lịch khóa học.</p>
        </div>
        <button type="button" className="admin-timetable-refresh" onClick={() => void loadTimetable()} disabled={loading}>
          <RefreshCw className={loading ? "is-spinning" : undefined} aria-hidden="true" />Làm mới
        </button>
      </header>

      {error ? <p className="admin-timetable-page-error" role="alert"><CircleAlert aria-hidden="true" />{error}<button type="button" onClick={() => void loadTimetable()}>Thử lại</button></p> : null}
      {notice ? <p className="admin-timetable-notice" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" />{notice}<button type="button" aria-label="Đóng thông báo" onClick={() => setNotice("")}>×</button></p> : null}

      <section className="admin-timetable-summary" aria-label="Tổng quan lịch vận hành">
        <div><span>Đã xếp lịch</span><strong>{loading ? "—" : scheduledRooms.length}</strong><small>phòng thi</small></div>
        <div><span>Đang mở</span><strong>{loading ? "—" : activeCount}</strong><small>phòng thi</small></div>
        <div><span>Chưa xếp lịch</span><strong>{loading ? "—" : unscheduledRooms.length}</strong><small>phòng thi</small></div>
        <div><span>Đề đã xuất bản</span><strong>{loading ? "—" : rooms.reduce((sum, room) => sum + room.published_exam_count, 0)}</strong><small>đề thi</small></div>
      </section>

      <div className="admin-timetable-workspace">
        <section className="admin-timetable-calendar" aria-labelledby="admin-timetable-week-title">
          <div className="admin-timetable-calendar-toolbar">
            <div className="admin-timetable-panel-heading">
              <span><CalendarClock aria-hidden="true" /></span>
              <div><h2 id="admin-timetable-week-title">Lịch theo tuần</h2><p>{weekLabel}</p></div>
            </div>
            <nav className="admin-timetable-week-controls" aria-label="Điều hướng tuần">
              <button type="button" aria-label="Tuần trước" onClick={() => setWeekOffset(value => value - 1)}><ChevronLeft aria-hidden="true" /></button>
              <button type="button" className="admin-timetable-current-week" disabled={weekOffset === 0} onClick={() => setWeekOffset(0)}>Tuần này</button>
              <button type="button" aria-label="Tuần sau" onClick={() => setWeekOffset(value => value + 1)}><ChevronRight aria-hidden="true" /></button>
            </nav>
          </div>

          {loading ? <div className="admin-timetable-loading" role="status"><RefreshCw className="is-spinning" aria-hidden="true" />Đang tải lịch vận hành…</div> : (
            <ol className="admin-timetable-week-grid">
              {days.map(day => {
                const key = dateKey(day);
                const dayRooms = roomsByDay.get(key) ?? [];
                const isToday = key === dateKey(referenceNow);
                return (
                  <li key={key} className={isToday ? "is-today" : undefined}>
                    <header><span>{formatUiWeekday(day)}</span><b>{day.getDate()}</b><small>tháng {day.getMonth() + 1}</small></header>
                    <div className="admin-timetable-day-events">
                      {dayRooms.length ? dayRooms.map(room => {
                        const state = roomScheduleState(room, now);
                        return <button type="button" key={room.id} className={`admin-timetable-event tone-${state.tone} ${selectedRoomId === room.id ? "is-selected" : ""}`} onClick={() => setSelectedRoomId(room.id)} aria-pressed={selectedRoomId === room.id}>
                          <span>{state.label}</span><strong>{room.title}</strong><small><Clock3 aria-hidden="true" />{formatTime(room.exam_start)} – {formatTime(room.exam_end)}</small><small>{room.exam_type} · {room.exam_count} đề</small>
                        </button>;
                      }) : <span className="admin-timetable-day-empty">Chưa có lịch</span>}
                    </div>
                  </li>
                );
              })}
            </ol>
          )}
        </section>

        {selectedRoom ? <TimetableEditor key={`${selectedRoom.id}:${selectedRoom.exam_start ?? "unscheduled"}:${selectedRoom.exam_end ?? "open"}`} room={selectedRoom} onSaved={handleSaved} /> : (
          <aside className="admin-timetable-editor admin-timetable-editor-empty">
            <CalendarClock aria-hidden="true" /><h2>Chưa có phòng thi</h2><p>Tạo phòng thi trước khi thiết lập lịch vận hành.</p>
          </aside>
        )}
      </div>

      <section className="admin-timetable-unscheduled" aria-labelledby="admin-unscheduled-title">
        <div className="admin-timetable-unscheduled-heading">
          <div className="admin-timetable-panel-heading"><span><Clock3 aria-hidden="true" /></span><div><h2 id="admin-unscheduled-title">Phòng chưa xếp lịch</h2><p>Chọn một phòng để điền thời gian ở bảng thiết lập.</p></div></div>
          <label className="admin-timetable-search"><Search aria-hidden="true" /><span className="admin-timetable-visually-hidden">Tìm phòng chưa xếp lịch</span><input name="roomSearch" type="search" value={query} onChange={event => setQuery(event.target.value)} placeholder="Tìm phòng…" autoComplete="off" /></label>
        </div>
        {loading ? <div className="admin-timetable-loading" role="status">Đang tải danh sách…</div> : visibleUnscheduledRooms.length ? (
          <table className="admin-timetable-room-table">
            <caption className="admin-timetable-visually-hidden">Phòng chưa xếp lịch</caption>
            <thead><tr className="admin-timetable-room-row admin-timetable-room-row-head"><th scope="col">Phòng thi</th><th scope="col">Loại</th><th scope="col">Số đề</th><th scope="col">Trạng thái</th><th scope="col">Thao tác</th></tr></thead>
            <tbody>
              {visibleUnscheduledRooms.map(room => <tr className={`admin-timetable-room-row ${selectedRoomId === room.id ? "is-selected" : ""}`} key={room.id}>
                <td><span className="admin-timetable-cell-label">Phòng thi</span><strong title={room.title}>{room.title}</strong><small>{room.description || "Chưa có mô tả"}</small></td>
                <td><span className="admin-timetable-cell-label">Loại</span>{room.exam_type}</td><td><span className="admin-timetable-cell-label">Số đề</span>{room.exam_count} đề</td><td><span className="admin-timetable-cell-label">Trạng thái</span><i className={room.published ? "is-published" : "is-draft"} />{room.published ? "Đã xuất bản" : "Bản nháp"}</td>
                <td><span className="admin-timetable-cell-label">Thao tác</span><button type="button" aria-label={`Thiết lập lịch cho ${room.title}`} onClick={() => setSelectedRoomId(room.id)}>Thiết lập <ChevronRight aria-hidden="true" /></button></td>
              </tr>)}
            </tbody>
          </table>
        ) : <div className="admin-timetable-inline-empty" role="status">{unscheduledRooms.length ? "Không tìm thấy phòng phù hợp." : "Tất cả phòng thi đã được xếp lịch."}</div>}
      </section>
    </div>
  );
}

export default function AdminTimetable() {
  const [activeView, setActiveView] = useState<TimetableView>("courses");
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);
  const tabViews: TimetableView[] = ["courses", "exams"];

  useEffect(() => {
    const syncViewFromUrl = () => setActiveView(timetableViewFromUrl(new URL(window.location.href)));
    syncViewFromUrl();
    window.addEventListener("popstate", syncViewFromUrl);
    return () => window.removeEventListener("popstate", syncViewFromUrl);
  }, []);

  function setTimetableView(view: TimetableView) {
    if (view === activeView) return;
    const url = new URL(window.location.href);
    if (view === "exams") url.searchParams.set("view", view);
    else url.searchParams.delete("view");
    window.history.pushState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
    setActiveView(view);
  }

  function handleTimetableTabKeyDown(event: KeyboardEvent<HTMLButtonElement>) {
    const currentIndex = tabViews.indexOf(activeView);
    let nextIndex = currentIndex;
    if (event.key === "ArrowRight") nextIndex = (currentIndex + 1) % tabViews.length;
    else if (event.key === "ArrowLeft") nextIndex = (currentIndex - 1 + tabViews.length) % tabViews.length;
    else if (event.key === "Home") nextIndex = 0;
    else if (event.key === "End") nextIndex = tabViews.length - 1;
    else return;

    event.preventDefault();
    const nextView = tabViews[nextIndex];
    setTimetableView(nextView);
    window.requestAnimationFrame(() => tabRefs.current[nextIndex]?.focus());
  }

  return <div className="admin-timetable-hub">
    <div className="admin-timetable-tabs" role="tablist" aria-label="Loại thời khóa biểu" aria-orientation="horizontal">
      <button ref={element => { tabRefs.current[0] = element; }} type="button" role="tab" id="admin-timetable-course-tab" aria-controls="admin-timetable-course-panel" aria-selected={activeView === "courses"} tabIndex={activeView === "courses" ? 0 : -1} onKeyDown={handleTimetableTabKeyDown} onClick={() => setTimetableView("courses")}>Lịch khóa học</button>
      <button ref={element => { tabRefs.current[1] = element; }} type="button" role="tab" id="admin-timetable-exam-tab" aria-controls="admin-timetable-exam-panel" aria-selected={activeView === "exams"} tabIndex={activeView === "exams" ? 0 : -1} onKeyDown={handleTimetableTabKeyDown} onClick={() => setTimetableView("exams")}>Lịch phòng thi</button>
    </div>
    <div role="tabpanel" id={activeView === "courses" ? "admin-timetable-course-panel" : "admin-timetable-exam-panel"} aria-labelledby={activeView === "courses" ? "admin-timetable-course-tab" : "admin-timetable-exam-tab"}>{activeView === "courses" ? <AdminCourseTimetable /> : <ExamRoomTimetable />}</div>
  </div>;
}

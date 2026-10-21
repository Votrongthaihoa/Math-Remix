"use client";

import { useMemo, useState, type FormEvent } from "react";
import { ChevronRight, Search, Trash2, X } from "lucide-react";
import AeckConfirmDialog from "../components/aeck/AeckConfirmDialog";
import type {
  AdminProfileRow,
  AdminCourseRow,
  AdminExamRoomRow,
  AdminEnrollmentRow,
  AdminExamEnrollmentRow,
} from "./admin-types";

function MiniEmpty({ text }: { text: string }) {
  return <div className="mini-empty"><p>{text}</p></div>;
}

/** Lightweight combobox: renders a text input paired with a <datalist> for
 *  browser-native filtering. Works well for lists up to ~500 items without
 *  any external dependency. The value tracks the display label while
 *  `onSelect` returns the selected id. */
function StudentCombobox({
  id,
  label,
  students,
  value,
  onSelect,
}: {
  id: string;
  label: string;
  students: AdminProfileRow[];
  value: string;
  onSelect: (studentId: string, display: string) => void;
}) {
  const listId = `${id}-list`;
  const [display, setDisplay] = useState(value);
  const optionMap = useMemo(() => {
    const map = new Map<string, string>();
    for (const s of students) {
      map.set(`${s.student_code} — ${s.full_name}${s.email ? ` — ${s.email}` : ""}`, s.id);
    }
    return map;
  }, [students]);

  function handleChange(text: string) {
    setDisplay(text);
    const matched = optionMap.get(text);
    onSelect(matched ?? "", text);
  }

  // Sync from parent reset (e.g. after submit)
  if (value === "" && display !== "") setDisplay("");

  return (
    <label htmlFor={id}>
      {label}
      <input
        id={id}
        list={listId}
        type="text"
        autoComplete="off"
        value={display}
        onChange={e => handleChange(e.target.value)}
        placeholder="Gõ để tìm học viên…"
        required
      />
      <datalist id={listId}>
        {students.map(s => (
          <option key={s.id} value={`${s.student_code} — ${s.full_name}${s.email ? ` — ${s.email}` : ""}`} />
        ))}
      </datalist>
    </label>
  );
}

export default function AdminEnrollments({
  students,
  courses,
  examRooms,
  enrollments,
  examRoomEnrollments,
  loading,
  removingEnrollmentKey,
  onAssignCourse,
  onRemoveCourseEnrollment,
  onAssignExamRoom,
  onRemoveExamRoomEnrollment,
}: {
  students: AdminProfileRow[];
  courses: AdminCourseRow[];
  examRooms: AdminExamRoomRow[];
  enrollments: AdminEnrollmentRow[];
  examRoomEnrollments: AdminExamEnrollmentRow[];
  loading: boolean;
  removingEnrollmentKey: string;
  onAssignCourse: (studentId: string, courseId: string) => Promise<void>;
  onRemoveCourseEnrollment: (studentId: string, courseId: string) => Promise<void>;
  onAssignExamRoom: (studentId: string, roomId: string) => Promise<void>;
  onRemoveExamRoomEnrollment: (studentId: string, roomId: string) => Promise<void>;
}) {
  // Course assignment
  const [courseStudentDisplay, setCourseStudentDisplay] = useState("");
  const [courseStudentId, setCourseStudentId] = useState("");
  const [assignCourseId, setAssignCourseId] = useState("");
  const [assigningCourse, setAssigningCourse] = useState(false);
  const [assignError, setAssignError] = useState("");

  // Exam room assignment
  const [examStudentDisplay, setExamStudentDisplay] = useState("");
  const [examStudentId, setExamStudentId] = useState("");
  const [assignExamRoomId, setAssignExamRoomId] = useState("");
  const [assigningExamRoom, setAssigningExamRoom] = useState(false);

  // Search filter
  const [searchTerm, setSearchTerm] = useState("");

  // Confirm dialog
  const [pendingRemove, setPendingRemove] = useState<{
    type: "course" | "room";
    studentId: string;
    targetId: string;
    label: string;
  } | null>(null);
  const [removeError, setRemoveError] = useState("");

  // Helpers
  const studentMap = useMemo(() => new Map(students.map(s => [s.id, s])), [students]);
  const courseMap = useMemo(() => new Map(courses.map(c => [c.id, c])), [courses]);
  const roomMap = useMemo(() => new Map(examRooms.map(r => [r.id, r])), [examRooms]);

  const filteredEnrollments = useMemo(() => {
    const q = searchTerm.trim().toLocaleLowerCase("vi");
    if (!q) return enrollments;
    return enrollments.filter(row => {
      const s = studentMap.get(row.student_id);
      const c = courseMap.get(row.course_id);
      const text = `${s?.full_name ?? ""} ${s?.student_code ?? ""} ${s?.email ?? ""} ${c?.title ?? ""}`.toLocaleLowerCase("vi");
      return text.includes(q);
    });
  }, [searchTerm, enrollments, studentMap, courseMap]);

  const filteredExamEnrollments = useMemo(() => {
    const q = searchTerm.trim().toLocaleLowerCase("vi");
    if (!q) return examRoomEnrollments;
    return examRoomEnrollments.filter(row => {
      const s = studentMap.get(row.student_id);
      const r = roomMap.get(row.room_id);
      const text = `${s?.full_name ?? ""} ${s?.student_code ?? ""} ${s?.email ?? ""} ${r?.title ?? ""}`.toLocaleLowerCase("vi");
      return text.includes(q);
    });
  }, [searchTerm, examRoomEnrollments, studentMap, roomMap]);

  function handleCourseStudentSelect(studentId: string) {
    setCourseStudentId(studentId);
    const s = studentId ? studentMap.get(studentId) : undefined;
    setCourseStudentDisplay(s ? `${s.student_code} — ${s.full_name}` : "");
  }

  function handleExamStudentSelect(studentId: string) {
    setExamStudentId(studentId);
    const s = studentId ? studentMap.get(studentId) : undefined;
    setExamStudentDisplay(s ? `${s.student_code} — ${s.full_name}` : "");
  }

  async function submitCourseAssign(event: FormEvent) {
    event.preventDefault();
    setAssignError("");
    if (!courseStudentId || !assignCourseId) { setAssignError("Hãy chọn học viên và khóa học."); return; }
    setAssigningCourse(true);
    try {
      await onAssignCourse(courseStudentId, assignCourseId);
      setCourseStudentDisplay("");
      setCourseStudentId("");
      setAssignCourseId("");
    } catch (value) {
      setAssignError(value instanceof Error ? value.message : "Không thể phân khóa học. Hãy thử lại.");
    } finally {
      setAssigningCourse(false);
    }
  }

  async function submitExamRoomAssign(event: FormEvent) {
    event.preventDefault();
    setAssignError("");
    if (!examStudentId || !assignExamRoomId) { setAssignError("Hãy chọn học viên và phòng thi."); return; }
    setAssigningExamRoom(true);
    try {
      await onAssignExamRoom(examStudentId, assignExamRoomId);
      setExamStudentDisplay("");
      setExamStudentId("");
      setAssignExamRoomId("");
    } catch (value) {
      setAssignError(value instanceof Error ? value.message : "Không thể cấp quyền phòng thi. Hãy thử lại.");
    } finally {
      setAssigningExamRoom(false);
    }
  }

  function requestRemove(type: "course" | "room", studentId: string, targetId: string) {
    const s = studentMap.get(studentId);
    const label = type === "course"
      ? `Bỏ khóa học "${courseMap.get(targetId)?.title ?? "?"}" khỏi ${s?.full_name ?? "học viên"}?`
      : `Bỏ quyền phòng thi "${roomMap.get(targetId)?.title ?? "?"}" của ${s?.full_name ?? "học viên"}?`;
    setRemoveError("");
    setPendingRemove({ type, studentId, targetId, label });
  }

  async function confirmRemove() {
    if (!pendingRemove) return;
    setRemoveError("");
    try {
      if (pendingRemove.type === "course") {
        await onRemoveCourseEnrollment(pendingRemove.studentId, pendingRemove.targetId);
      } else {
        await onRemoveExamRoomEnrollment(pendingRemove.studentId, pendingRemove.targetId);
      }
      setPendingRemove(null);
    } catch (value) {
      setRemoveError(value instanceof Error ? value.message : "Không thể bỏ phân quyền. Hãy thử lại.");
    }
  }

  return (
    <div className="assignment-page">
      <header className="assignment-page-head">
        <div>
          <span className="eyebrow">PHÂN QUYỀN HỌC VIÊN</span>
          <h2>Khóa học và phòng thi</h2>
          <p>Quản lý toàn bộ nội dung được cấp cho từng học viên tại một nơi.</p>
        </div>
      </header>

      {assignError && <p className="form-error">{assignError}</p>}

      {/* Search filter for enrollment lists */}
      <label className="search wide student-search" style={{ marginBottom: 16 }}>
        <Search />
        <input
          type="search"
          value={searchTerm}
          onChange={e => setSearchTerm(e.target.value)}
          placeholder="Lọc danh sách phân quyền theo tên, mã hoặc khóa học…"
          aria-label="Lọc danh sách phân quyền"
        />
        {searchTerm && (
          <button type="button" onClick={() => setSearchTerm("")} aria-label="Xóa bộ lọc">
            <X />
          </button>
        )}
      </label>

      {/* Course enrollments */}
      <section className="section-card enrollment-manager">
        <div className="section-head">
          <div>
            <h2>Phân khóa học</h2>
            <p className="muted">Học viên chỉ thấy khóa đã được phân và xuất bản.</p>
          </div>
        </div>
        <form className="enrollment-form" onSubmit={submitCourseAssign}>
          <StudentCombobox
            id="assign-student"
            label="Học viên"
            students={students}
            value={courseStudentDisplay}
            onSelect={handleCourseStudentSelect}
          />
          <label htmlFor="assign-course">
            Khóa học
            <select
              id="assign-course"
              name="courseId"
              value={assignCourseId}
              onChange={e => setAssignCourseId(e.target.value)}
              required
            >
              <option value="">Chọn khóa học</option>
              {courses.map(course => (
                <option key={course.id} value={course.id}>
                  {course.title}{course.published ? "" : " (bản nháp)"}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary-btn small" disabled={assigningCourse}>
            {assigningCourse ? "Đang phân…" : "Phân khóa học"}
          </button>
        </form>
        <div className="enrollment-list">
          {filteredEnrollments.length ? filteredEnrollments.map(row => {
            const student = studentMap.get(row.student_id);
            const course = courseMap.get(row.course_id);
            const actionKey = `course:${row.student_id}:${row.course_id}`;
            return (
              <article key={`${row.student_id}-${row.course_id}`}>
                <div>
                  <b>{student?.full_name ?? "Học viên không tồn tại"}</b>
                  <small>{student?.student_code}{student?.email ? ` · ${student.email}` : ""}</small>
                </div>
                <ChevronRight />
                <div>
                  <b>{course?.title ?? "Khóa học không tồn tại"}</b>
                  <small>{course?.published ? "Đã xuất bản" : "Bản nháp"}</small>
                </div>
                <button
                  type="button"
                  className="outline-btn danger"
                  disabled={Boolean(removingEnrollmentKey)}
                  onClick={() => requestRemove("course", row.student_id, row.course_id)}
                >
                  <Trash2 /> {removingEnrollmentKey === actionKey ? "Đang bỏ…" : "Bỏ phân"}
                </button>
              </article>
            );
          }) : <MiniEmpty text="Chưa có học viên nào được phân khóa." />}
        </div>
      </section>

      {/* Exam room enrollments */}
      <section className="section-card enrollment-manager">
        <div className="section-head">
          <div>
            <h2>Phân phòng thi</h2>
            <p className="muted">Áp dụng cho phòng có quyền truy cập "Chỉ học viên được phân".</p>
          </div>
        </div>
        <form className="enrollment-form" onSubmit={submitExamRoomAssign}>
          <StudentCombobox
            id="assign-exam-student"
            label="Học viên"
            students={students}
            value={examStudentDisplay}
            onSelect={handleExamStudentSelect}
          />
          <label htmlFor="assign-exam-room">
            Phòng thi
            <select
              id="assign-exam-room"
              name="roomId"
              value={assignExamRoomId}
              onChange={e => setAssignExamRoomId(e.target.value)}
              required
            >
              <option value="">Chọn phòng thi</option>
              {examRooms.map(room => (
                <option key={room.id} value={room.id}>
                  {room.title}{room.access_mode === "open" ? " (đang mở cho mọi học viên)" : ""}{room.published ? "" : " (bản nháp)"}
                </option>
              ))}
            </select>
          </label>
          <button type="submit" className="primary-btn small" disabled={assigningExamRoom}>
            {assigningExamRoom ? "Đang phân…" : "Cấp phòng thi"}
          </button>
        </form>
        <div className="enrollment-list">
          {filteredExamEnrollments.length ? filteredExamEnrollments.map(row => {
            const student = studentMap.get(row.student_id);
            const room = roomMap.get(row.room_id);
            const actionKey = `room:${row.student_id}:${row.room_id}`;
            return (
              <article key={`${row.student_id}-${row.room_id}`}>
                <div>
                  <b>{student?.full_name ?? "Học viên không tồn tại"}</b>
                  <small>{student?.student_code}{student?.email ? ` · ${student.email}` : ""}</small>
                </div>
                <ChevronRight />
                <div>
                  <b>{room?.title ?? "Phòng thi không tồn tại"}</b>
                  <small>{room?.published ? "Đã xuất bản" : "Bản nháp"}</small>
                </div>
                <button
                  type="button"
                  className="outline-btn danger"
                  disabled={Boolean(removingEnrollmentKey)}
                  onClick={() => requestRemove("room", row.student_id, row.room_id)}
                >
                  <Trash2 /> {removingEnrollmentKey === actionKey ? "Đang bỏ…" : "Bỏ quyền"}
                </button>
              </article>
            );
          }) : <MiniEmpty text="Chưa có học viên nào được phân phòng thi." />}
        </div>
      </section>

      {/* Confirm remove dialog */}
      {pendingRemove && (
        <AeckConfirmDialog
          title={pendingRemove.type === "course" ? "Bỏ phân khóa học?" : "Bỏ quyền phòng thi?"}
          description={pendingRemove.label}
          errorMessage={removeError}
          primaryAction={{
            label: pendingRemove.type === "course" ? "Bỏ phân" : "Bỏ quyền",
            onClick: () => void confirmRemove(),
            disabled: Boolean(removingEnrollmentKey),
          }}
          secondaryAction={{
            label: "Hủy",
            onClick: () => setPendingRemove(null),
          }}
          onClose={() => setPendingRemove(null)}
        />
      )}
    </div>
  );
}

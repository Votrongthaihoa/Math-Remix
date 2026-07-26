"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  CalendarDays, ChevronRight, ClipboardCheck, FilePlus2, FolderPlus,
  GraduationCap, Pencil, Plus, Save, Settings2, Trash2, UserPlus, X
} from "lucide-react";
import { supabase } from "../lib/supabase";
import LoadingIndicator from "./loading-indicator";
import "./admin-exams.css";

type Room = { id: string; title: string; description: string; exam_type: string; access_mode: "open" | "assigned"; registration_start: string | null; registration_end: string | null; exam_start: string | null; exam_end: string | null; published: boolean; sort_order: number };
type Exam = { id: string; room_id: string; title: string; description: string; exam_type: string; mode: "free" | "scheduled"; duration_minutes: number; published: boolean; sort_order: number };
type Section = { id: string; exam_id: string; title: string; duration_minutes: number | null; sort_order: number };
type Question = { id: string; section_id: string; prompt: string; question_type: "single" | "multiple" | "text"; options: Array<{ value: string; label: string }>; points: number; sort_order: number };
type KeyRow = { question_id: string; correct_answer: string | string[]; explanation: string };
type Student = { id: string; full_name: string; student_code: string; status: string };
type Enrollment = { room_id: string; student_id: string };
type ModalType = "room" | "exam" | "section" | "question" | null;

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function MathPreview({ text }: { text: string }) {
  const html = useMemo(() => {
    const expression = text.match(/\$\$([\s\S]+?)\$\$|\$([^$\n]+?)\$/);
    const formula = expression?.[1] ?? expression?.[2];
    return formula ? katex.renderToString(formula, { displayMode: Boolean(expression?.[1]), throwOnError: false, trust: false, strict: false }) : "";
  }, [text]);
  return <div className="admin-exam-math-preview"><small>Xem trước</small>{html ? <span dangerouslySetInnerHTML={{ __html: html }} /> : <span>{text || "Nhập nội dung câu hỏi và công thức trong $...$ hoặc $$...$$"}</span>}</div>;
}

export default function AdminExamManager({ students: suppliedStudents = [] }: { students?: Student[] }) {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [keys, setKeys] = useState<KeyRow[]>([]);
  const [students, setStudents] = useState<Student[]>(suppliedStudents);
  const [enrollments, setEnrollments] = useState<Enrollment[]>([]);
  const [selectedRoomId, setSelectedRoomId] = useState("");
  const [selectedExamId, setSelectedExamId] = useState("");
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [modal, setModal] = useState<ModalType>(null);
  const [modalParentId, setModalParentId] = useState("");
  const [editingRoom, setEditingRoom] = useState<Room | null>(null);
  const [editingExam, setEditingExam] = useState<Exam | null>(null);
  const [assignStudentId, setAssignStudentId] = useState("");

  const load = useCallback(async () => {
    if (!supabase) { setError("Chưa cấu hình Supabase."); setLoading(false); return; }
    setLoading(true); setError("");
    const roomResult = await supabase.from("exam_rooms").select("*").order("sort_order").order("created_at");
    if (roomResult.error) { setError(`${roomResult.error.message}. Hãy chạy migration 006_exam_room_module.sql trước.`); setLoading(false); return; }
    const roomRows = (roomResult.data ?? []) as Room[];
    const roomIds = roomRows.map(room => room.id);
    const examResult = roomIds.length ? await supabase.from("exams").select("*").in("room_id", roomIds).order("sort_order") : { data: [], error: null };
    const examRows = (examResult.data ?? []) as Exam[];
    const examIds = examRows.map(exam => exam.id);
    const sectionResult = examIds.length ? await supabase.from("exam_sections").select("*").in("exam_id", examIds).order("sort_order") : { data: [], error: null };
    const sectionRows = (sectionResult.data ?? []) as Section[];
    const sectionIds = sectionRows.map(section => section.id);
    const questionResult = sectionIds.length ? await supabase.from("exam_questions").select("*").in("section_id", sectionIds).order("sort_order") : { data: [], error: null };
    const questionRows = (questionResult.data ?? []) as Question[];
    const questionIds = questionRows.map(question => question.id);
    const keyResult = questionIds.length ? await supabase.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questionIds) : { data: [], error: null };
    const enrollmentResult = roomIds.length ? await supabase.from("exam_room_enrollments").select("room_id,student_id").in("room_id", roomIds) : { data: [], error: null };
    const studentResult = suppliedStudents.length ? { data: suppliedStudents, error: null } : await supabase.from("profiles").select("id,full_name,student_code,status").eq("role", "student").order("student_code");
    const firstError = examResult.error ?? sectionResult.error ?? questionResult.error ?? keyResult.error ?? enrollmentResult.error ?? studentResult.error;
    if (firstError) setError(firstError.message);
    setRooms(roomRows); setExams(examRows); setSections(sectionRows); setQuestions(questionRows); setKeys((keyResult.data ?? []) as KeyRow[]); setEnrollments((enrollmentResult.data ?? []) as Enrollment[]); setStudents((studentResult.data ?? []) as Student[]);
    setSelectedRoomId(previous => roomRows.some(room => room.id === previous) ? previous : roomRows[0]?.id ?? "");
    setLoading(false);
  }, [suppliedStudents]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selectedRoom = rooms.find(room => room.id === selectedRoomId) ?? null;
  const roomExams = exams.filter(exam => exam.room_id === selectedRoomId);
  const selectedExam = exams.find(exam => exam.id === selectedExamId) ?? null;
  const examSections = sections.filter(section => section.exam_id === selectedExamId);
  const roomEnrollments = enrollments.filter(row => row.room_id === selectedRoomId);

  useEffect(() => {
    if (selectedExamId && roomExams.some(exam => exam.id === selectedExamId)) return;
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSelectedExamId(roomExams[0]?.id ?? "");
  }, [roomExams, selectedExamId]);

  function openModal(type: Exclude<ModalType, null>, parentId = "") { setError(""); setNotice(""); setModalParentId(parentId); setModal(type); }

  async function saveRoom() {
    if (!supabase || !editingRoom) return;
    setSaving(true); setError(""); setNotice("");
    const { error: updateError } = await supabase.from("exam_rooms").update({ title: editingRoom.title.trim(), description: editingRoom.description.trim(), exam_type: editingRoom.exam_type.trim() || "TSA", access_mode: editingRoom.access_mode, registration_start: editingRoom.registration_start || null, registration_end: editingRoom.registration_end || null, exam_start: editingRoom.exam_start || null, exam_end: editingRoom.exam_end || null, published: editingRoom.published }).eq("id", editingRoom.id);
    setSaving(false); if (updateError) { setError(updateError.message); return; }
    setEditingRoom(null); setNotice("Đã lưu thông tin phòng thi."); await load();
  }

  async function saveExam() {
    if (!supabase || !editingExam) return;
    setSaving(true); setError(""); setNotice("");
    const { error: updateError } = await supabase.from("exams").update({ title: editingExam.title.trim(), description: editingExam.description.trim(), exam_type: editingExam.exam_type.trim() || "TSA", mode: editingExam.mode, duration_minutes: editingExam.duration_minutes, published: editingExam.published }).eq("id", editingExam.id);
    setSaving(false); if (updateError) { setError(updateError.message); return; }
    setEditingExam(null); setNotice("Đã lưu thông tin đề thi."); await load();
  }

  async function remove(table: "exam_rooms" | "exams" | "exam_sections" | "exam_questions", id: string, label: string) {
    if (!supabase || !window.confirm(`Xóa ${label}? Dữ liệu bên trong cũng sẽ bị xóa.`)) return;
    const { error: deleteError } = await supabase.from(table).delete().eq("id", id);
    if (deleteError) setError(deleteError.message); else { setNotice(`Đã xóa ${label}.`); await load(); }
  }

  async function assignStudent(event: React.FormEvent) {
    event.preventDefault(); if (!supabase || !selectedRoomId || !assignStudentId) return;
    setSaving(true); const { error: assignError } = await supabase.from("exam_room_enrollments").upsert({ room_id: selectedRoomId, student_id: assignStudentId }); setSaving(false);
    if (assignError) setError(assignError.message); else { setAssignStudentId(""); setNotice("Đã cấp quyền phòng thi cho học viên."); await load(); }
  }

  async function revokeStudent(studentId: string) {
    if (!supabase) return;
    const { error: revokeError } = await supabase.from("exam_room_enrollments").delete().eq("room_id", selectedRoomId).eq("student_id", studentId);
    if (revokeError) setError(revokeError.message); else await load();
  }

  if (loading) return <LoadingIndicator label="Đang tải dữ liệu khảo thí…" />;
  return <div className="admin-exam-manager">
    <header className="admin-exam-header"><div><span className="eyebrow">QUẢN TRỊ KHẢO THÍ</span><h2>Phòng thi và ngân hàng đề</h2><p>Tạo dữ liệu theo cấp Phòng → Đề → Phần → Câu hỏi và đáp án.</p></div><button className="primary-btn small" onClick={() => openModal("room")}><Plus/>Tạo phòng thi</button></header>
    {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
    <div className="admin-exam-layout">
      <aside className="admin-exam-room-list"><div className="admin-exam-panel-title"><span><ClipboardCheck/>Phòng thi</span><b>{rooms.length}</b></div>{rooms.length ? rooms.map(room => <button key={room.id} className={room.id === selectedRoomId ? "active" : ""} onClick={() => setSelectedRoomId(room.id)}><span><b>{room.title}</b><small>{exams.filter(exam => exam.room_id === room.id).length} đề · {room.published ? "Đã xuất bản" : "Bản nháp"}</small></span><ChevronRight/></button>) : <div className="admin-exam-empty"><ClipboardCheck/><p>Chưa có phòng thi.</p></div>}</aside>
      <section className="admin-exam-workspace">{selectedRoom ? <>
        <div className="admin-exam-toolbar"><div><span className="exam-admin-badge">{selectedRoom.exam_type}</span><h3>{selectedRoom.title}</h3><p>{selectedRoom.description || "Chưa có mô tả."}</p></div><div><button className="outline-btn" onClick={() => setEditingRoom({ ...selectedRoom })}><Pencil/>Sửa phòng</button><button className="outline-btn danger" onClick={() => void remove("exam_rooms", selectedRoom.id, "phòng thi")}><Trash2/></button></div></div>
        <div className="admin-exam-summary"><span><CalendarDays/><small>Thời gian thi</small><b>{selectedRoom.exam_start ? new Date(selectedRoom.exam_start).toLocaleString("vi-VN") : "Không giới hạn"}</b></span><span><GraduationCap/><small>Quyền truy cập</small><b>{selectedRoom.access_mode === "open" ? "Mọi học viên" : `${roomEnrollments.length} học viên`}</b></span><span><ClipboardCheck/><small>Trạng thái</small><b>{selectedRoom.published ? "Đã xuất bản" : "Bản nháp"}</b></span></div>
        <div className="admin-exam-content-head"><div><h3>Danh sách đề thi</h3><p>Chọn một đề để quản lý phần và câu hỏi.</p></div><button className="primary-btn small" onClick={() => openModal("exam", selectedRoom.id)}><FilePlus2/>Thêm đề</button></div>
        <div className="admin-exam-card-grid">{roomExams.length ? roomExams.map(exam => <article key={exam.id} className={exam.id === selectedExamId ? "selected" : ""} onClick={() => setSelectedExamId(exam.id)}><div><span>{exam.exam_type}</span><h4>{exam.title}</h4><p>{exam.duration_minutes} phút · {sections.filter(section => section.exam_id === exam.id).length} phần · {exam.published ? "Đã xuất bản" : "Bản nháp"}</p></div><div><button aria-label="Sửa đề" onClick={event => { event.stopPropagation(); setEditingExam({ ...exam }); }}><Settings2/></button><button aria-label="Xóa đề" onClick={event => { event.stopPropagation(); void remove("exams", exam.id, "đề thi"); }}><Trash2/></button></div></article>) : <div className="admin-exam-empty wide"><FilePlus2/><p>Chưa có đề thi trong phòng này.</p></div>}</div>
        {selectedExam && <ExamTree exam={selectedExam} sections={examSections} questions={questions} keys={keys} onModal={openModal} onDelete={remove} />}
        <section className="admin-exam-access"><div className="admin-exam-content-head"><div><h3>Phân quyền học viên</h3><p>Chỉ áp dụng khi phòng đặt ở chế độ “Được phân”.</p></div></div><form onSubmit={assignStudent}><select value={assignStudentId} onChange={event => setAssignStudentId(event.target.value)} disabled={selectedRoom.access_mode === "open"}><option value="">Chọn học viên</option>{students.filter(student => !roomEnrollments.some(row => row.student_id === student.id)).map(student => <option key={student.id} value={student.id}>{student.student_code} — {student.full_name}</option>)}</select><button className="primary-btn small" disabled={saving || !assignStudentId || selectedRoom.access_mode === "open"}><UserPlus/>Cấp quyền</button></form><div className="admin-exam-students">{roomEnrollments.map(row => { const student = students.find(item => item.id === row.student_id); return <span key={row.student_id}><i>{student?.full_name.split(" ").slice(-2).map(part => part[0]).join("") || "HV"}</i><b>{student?.student_code ?? "Học viên"}</b><small>{student?.full_name}</small><button onClick={() => void revokeStudent(row.student_id)} aria-label="Bỏ quyền"><X/></button></span>; })}</div></section>
      </> : <div className="admin-exam-empty workspace"><ClipboardCheck/><h3>Chưa có phòng thi</h3><p>Hãy tạo phòng thi đầu tiên để bắt đầu xây dựng đề.</p></div>}</section>
    </div>
    {modal && <CreateExamModal type={modal} parentId={modalParentId} counts={{ rooms: rooms.length, exams: roomExams.length, sections: examSections.length, questions: questions.length }} onClose={() => setModal(null)} onCreated={async id => { setModal(null); setNotice("Đã tạo dữ liệu khảo thí."); await load(); if (modal === "room") setSelectedRoomId(id); if (modal === "exam") setSelectedExamId(id); }} />}
    {editingRoom && <EditRoomModal room={editingRoom} setRoom={setEditingRoom} saving={saving} onClose={() => setEditingRoom(null)} onSave={() => void saveRoom()} />}
    {editingExam && <EditExamModal exam={editingExam} setExam={setEditingExam} saving={saving} onClose={() => setEditingExam(null)} onSave={() => void saveExam()} />}
  </div>;
}

function ExamTree({ exam, sections, questions, keys, onModal, onDelete }: { exam: Exam; sections: Section[]; questions: Question[]; keys: KeyRow[]; onModal: (type: Exclude<ModalType, null>, parentId?: string) => void; onDelete: (table: "exam_rooms" | "exams" | "exam_sections" | "exam_questions", id: string, label: string) => Promise<void> }) {
  return <section className="admin-exam-tree"><div className="admin-exam-content-head"><div><span className="eyebrow">CẤU TRÚC ĐỀ</span><h3>{exam.title}</h3></div><button className="outline-btn" onClick={() => onModal("section", exam.id)}><FolderPlus/>Thêm phần</button></div>{sections.length ? sections.map((section, sectionIndex) => { const items = questions.filter(question => question.section_id === section.id); return <details key={section.id} open><summary><span>Phần {sectionIndex + 1}</span><b>{section.title}</b><small>{items.length} câu</small><button aria-label="Xóa phần" onClick={event => { event.preventDefault(); void onDelete("exam_sections", section.id, "phần thi"); }}><Trash2/></button></summary><div className="admin-exam-question-list"><button className="admin-add-question" onClick={() => onModal("question", section.id)}><Plus/>Thêm câu hỏi</button>{items.map((question, questionIndex) => { const key = keys.find(item => item.question_id === question.id); return <article key={question.id}><span>Câu {questionIndex + 1}</span><div><p>{question.prompt}</p><small>{question.question_type === "single" ? "Một đáp án" : question.question_type === "multiple" ? "Nhiều đáp án" : "Tự luận ngắn"} · Đáp án: {Array.isArray(key?.correct_answer) ? key?.correct_answer.join(", ") : key?.correct_answer ?? "Chưa đặt"}</small></div><button aria-label="Xóa câu hỏi" onClick={() => void onDelete("exam_questions", question.id, "câu hỏi")}><Trash2/></button></article>; })}</div></details>; }) : <div className="admin-exam-empty wide"><FolderPlus/><p>Đề này chưa có phần thi.</p></div>}</section>;
}

function CreateExamModal({ type, parentId, counts, onClose, onCreated }: { type: Exclude<ModalType, null>; parentId: string; counts: { rooms: number; exams: number; sections: number; questions: number }; onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [examType, setExamType] = useState("TSA"); const [duration, setDuration] = useState(90); const [published, setPublished] = useState(false); const [accessMode, setAccessMode] = useState<"open" | "assigned">("open");
  const [questionType, setQuestionType] = useState<Question["question_type"]>("single"); const [optionsText, setOptionsText] = useState(""); const [correctAnswer, setCorrectAnswer] = useState(""); const [explanation, setExplanation] = useState(""); const [points, setPoints] = useState(1); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const labels = { room: ["PHÒNG THI MỚI", "Tạo phòng thi"], exam: ["ĐỀ THI MỚI", "Tạo đề thi"], section: ["PHẦN THI MỚI", "Thêm phần thi"], question: ["NGÂN HÀNG CÂU HỎI", "Thêm câu hỏi"] } as const;
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return; setSaving(true); setError("");
    let id = ""; let failure: { message: string } | null = null;
    if (type === "room") { const result = await supabase.from("exam_rooms").insert({ title: title.trim(), description: description.trim(), exam_type: examType.trim() || "TSA", access_mode: accessMode, published, sort_order: counts.rooms }).select("id").single(); id = result.data?.id ?? ""; failure = result.error; }
    if (type === "exam") { const result = await supabase.from("exams").insert({ room_id: parentId, title: title.trim(), description: description.trim(), exam_type: examType.trim() || "TSA", duration_minutes: duration, published, sort_order: counts.exams }).select("id").single(); id = result.data?.id ?? ""; failure = result.error; }
    if (type === "section") { const result = await supabase.from("exam_sections").insert({ exam_id: parentId, title: title.trim(), duration_minutes: duration || null, sort_order: counts.sections }).select("id").single(); id = result.data?.id ?? ""; failure = result.error; }
    if (type === "question") {
      const optionLines = optionsText.split("\n").map(line => line.trim()).filter(Boolean); const options = questionType === "text" ? [] : optionLines.map((label, index) => ({ value: String.fromCharCode(65 + index), label }));
      const result = await supabase.from("exam_questions").insert({ section_id: parentId, prompt: title.trim(), question_type: questionType, options, points, sort_order: counts.questions }).select("id").single(); id = result.data?.id ?? ""; failure = result.error;
      if (!failure && id) { const answer = questionType === "multiple" ? correctAnswer.split(",").map(value => value.trim().toUpperCase()).filter(Boolean) : correctAnswer.trim(); const keyResult = await supabase.from("exam_question_keys").insert({ question_id: id, correct_answer: answer, explanation: explanation.trim() }); failure = keyResult.error; if (failure) await supabase.from("exam_questions").delete().eq("id", id); }
    }
    setSaving(false); if (failure || !id) { setError(failure?.message ?? "Không thể tạo dữ liệu."); return; } await onCreated(id);
  }
  return <div className="modal-shade"><form className="modal admin-exam-modal" onSubmit={submit}><div className="section-head"><div><span className="eyebrow">{labels[type][0]}</span><h2>{labels[type][1]}</h2></div><button type="button" className="icon-btn" onClick={onClose}><X/></button></div><label>{type === "question" ? "Nội dung câu hỏi" : "Tên"}{type === "question" ? <textarea value={title} onChange={event => setTitle(event.target.value)} rows={4} placeholder="Có thể nhập công thức dạng $x^2$" required/> : <input value={title} onChange={event => setTitle(event.target.value)} required/>}</label>{type === "question" && <MathPreview text={title}/>} {(type === "room" || type === "exam") && <><label>Mô tả<textarea value={description} onChange={event => setDescription(event.target.value)} rows={3}/></label><label>Loại kỳ thi<input value={examType} onChange={event => setExamType(event.target.value)} placeholder="TSA"/></label></>}{type === "room" && <label>Quyền truy cập<select value={accessMode} onChange={event => setAccessMode(event.target.value as "open" | "assigned")}><option value="open">Mọi học viên</option><option value="assigned">Chỉ học viên được phân</option></select></label>}{(type === "exam" || type === "section") && <label>Thời lượng (phút)<input type="number" min={1} value={duration} onChange={event => setDuration(Number(event.target.value))} required/></label>}{type === "question" && <><label>Loại câu hỏi<select value={questionType} onChange={event => setQuestionType(event.target.value as Question["question_type"])}><option value="single">Một đáp án</option><option value="multiple">Nhiều đáp án</option><option value="text">Tự luận ngắn</option></select></label>{questionType !== "text" && <label>Các phương án — mỗi dòng một đáp án<textarea value={optionsText} onChange={event => setOptionsText(event.target.value)} rows={5} placeholder={'Phương án A\nPhương án B\nPhương án C\nPhương án D'} required/></label>}<label>Đáp án đúng<input value={correctAnswer} onChange={event => setCorrectAnswer(event.target.value)} placeholder={questionType === "multiple" ? "A, C" : questionType === "single" ? "A" : "Nhập đáp án"} required/></label><label>Lời giải<textarea value={explanation} onChange={event => setExplanation(event.target.value)} rows={3} placeholder="Có thể dùng công thức KaTeX"/></label><label>Điểm<input type="number" min={0} step="0.25" value={points} onChange={event => setPoints(Number(event.target.value))}/></label></>}{(type === "room" || type === "exam") && <label className="checkbox-row"><input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)}/><span>Xuất bản ngay</span></label>}{error && <p className="form-error">{error}</p>}<button className="primary-btn" disabled={saving}>{saving ? "Đang tạo…" : labels[type][1]}</button></form></div>;
}

function EditRoomModal({ room, setRoom, saving, onClose, onSave }: { room: Room; setRoom: (room: Room | null) => void; saving: boolean; onClose: () => void; onSave: () => void }) {
  return <div className="modal-shade"><section className="modal admin-exam-modal"><div className="section-head"><div><span className="eyebrow">CẤU HÌNH PHÒNG</span><h2>Sửa phòng thi</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><label>Tên<input value={room.title} onChange={event => setRoom({ ...room, title: event.target.value })}/></label><label>Mô tả<textarea rows={3} value={room.description} onChange={event => setRoom({ ...room, description: event.target.value })}/></label><label>Loại kỳ thi<input value={room.exam_type} onChange={event => setRoom({ ...room, exam_type: event.target.value })}/></label><div className="admin-date-grid"><label>Bắt đầu đăng ký<input type="datetime-local" value={toLocalInput(room.registration_start)} onChange={event => setRoom({ ...room, registration_start: event.target.value ? new Date(event.target.value).toISOString() : null })}/></label><label>Kết thúc đăng ký<input type="datetime-local" value={toLocalInput(room.registration_end)} onChange={event => setRoom({ ...room, registration_end: event.target.value ? new Date(event.target.value).toISOString() : null })}/></label><label>Bắt đầu thi<input type="datetime-local" value={toLocalInput(room.exam_start)} onChange={event => setRoom({ ...room, exam_start: event.target.value ? new Date(event.target.value).toISOString() : null })}/></label><label>Kết thúc thi<input type="datetime-local" value={toLocalInput(room.exam_end)} onChange={event => setRoom({ ...room, exam_end: event.target.value ? new Date(event.target.value).toISOString() : null })}/></label></div><label>Quyền truy cập<select value={room.access_mode} onChange={event => setRoom({ ...room, access_mode: event.target.value as Room["access_mode"] })}><option value="open">Mọi học viên</option><option value="assigned">Chỉ học viên được phân</option></select></label><label className="checkbox-row"><input type="checkbox" checked={room.published} onChange={event => setRoom({ ...room, published: event.target.checked })}/><span>Đã xuất bản</span></label><button className="primary-btn" onClick={onSave} disabled={saving}><Save/>{saving ? "Đang lưu…" : "Lưu phòng thi"}</button></section></div>;
}

function EditExamModal({ exam, setExam, saving, onClose, onSave }: { exam: Exam; setExam: (exam: Exam | null) => void; saving: boolean; onClose: () => void; onSave: () => void }) {
  return <div className="modal-shade"><section className="modal admin-exam-modal"><div className="section-head"><div><span className="eyebrow">CẤU HÌNH ĐỀ</span><h2>Sửa đề thi</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><label>Tên đề<input value={exam.title} onChange={event => setExam({ ...exam, title: event.target.value })}/></label><label>Mô tả<textarea rows={3} value={exam.description} onChange={event => setExam({ ...exam, description: event.target.value })}/></label><label>Loại kỳ thi<input value={exam.exam_type} onChange={event => setExam({ ...exam, exam_type: event.target.value })}/></label><label>Thời lượng<input type="number" min={1} value={exam.duration_minutes} onChange={event => setExam({ ...exam, duration_minutes: Number(event.target.value) })}/></label><label>Hình thức<select value={exam.mode} onChange={event => setExam({ ...exam, mode: event.target.value as Exam["mode"] })}><option value="free">Tự do</option><option value="scheduled">Theo lịch</option></select></label><label className="checkbox-row"><input type="checkbox" checked={exam.published} onChange={event => setExam({ ...exam, published: event.target.checked })}/><span>Đã xuất bản</span></label><button className="primary-btn" onClick={onSave} disabled={saving}><Save/>{saving ? "Đang lưu…" : "Lưu đề thi"}</button></section></div>;
}

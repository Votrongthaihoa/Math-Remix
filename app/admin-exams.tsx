"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import katex from "katex";
import "katex/dist/katex.min.css";
import {
  CalendarDays, ChevronRight, ClipboardCheck, FilePlus2, FolderPlus,
  GraduationCap, Pencil, Plus, Save, Settings2, Trash2, X
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { authenticatedFetch } from "../lib/auth-client";
import {
  DEFAULT_EXAM_ROOM_TYPE,
  EXAM_ROOM_TYPE_OPTIONS,
  THPTQG_SUBJECT_TEMPLATES,
  QUESTION_FORMATS,
  questionTypeLabel,
  sectionTemplatesForExamType,
  type QuestionType,
} from "../lib/exam-config";
import LoadingIndicator from "./loading-indicator";
import "./admin-exams.css";
import { useAdminDialogFocus } from "./admin-dialog";

type Room = { id: string; title: string; description: string; exam_type: string; access_mode: "open" | "assigned"; registration_start: string | null; registration_end: string | null; exam_start: string | null; exam_end: string | null; published: boolean; sort_order: number };
type Exam = { id: string; room_id: string; title: string; description: string; exam_type: string; mode: "free" | "scheduled"; duration_minutes: number; published: boolean; sort_order: number };
type Section = { id: string; exam_id: string; title: string; duration_minutes: number | null; sort_order: number; subject_code?: string | null };
type Question = { id: string; section_id: string; prompt: string; question_type: QuestionType; options: Array<{ value: string; label: string }>; points: number; sort_order: number; passage?: string | null; media_url?: string | null; instruction?: string | null };
type KeyRow = { question_id: string; correct_answer: string | string[]; explanation: string };
type ModalType = "room" | "exam" | "section" | "question" | null;

const ROOM_SELECT = "id,title,description,exam_type,access_mode,registration_start,registration_end,exam_start,exam_end,published,sort_order";
const EXAM_SELECT = "id,room_id,title,description,exam_type,mode,duration_minutes,published,sort_order";
const SECTION_SELECT = "id,exam_id,title,duration_minutes,subject_code,sort_order";
const QUESTION_SELECT = "id,section_id,prompt,question_type,options,points,sort_order,passage,media_url,instruction";

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

export default function AdminExamManager() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [exams, setExams] = useState<Exam[]>([]);
  const [sections, setSections] = useState<Section[]>([]);
  const [questions, setQuestions] = useState<Question[]>([]);
  const [keys, setKeys] = useState<KeyRow[]>([]);
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
  const [editingSection, setEditingSection] = useState<Section | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<{ question: Question; key?: KeyRow } | null>(null);

  const load = useCallback(async () => {
    if (!supabase) { setError("Chưa cấu hình Supabase."); setLoading(false); return; }
    setLoading(true); setError("");
    const roomResult = await supabase.from("exam_rooms").select(ROOM_SELECT).order("sort_order").order("created_at");
    if (roomResult.error) { setError(`${roomResult.error.message}. Hãy chạy migration 006_exam_room_module.sql trước.`); setLoading(false); return; }
    const roomRows = (roomResult.data ?? []) as Room[];
    const roomIds = roomRows.map(room => room.id);
    const examResult = roomIds.length ? await supabase.from("exams").select(EXAM_SELECT).in("room_id", roomIds).order("sort_order") : { data: [], error: null };
    const examRows = (examResult.data ?? []) as Exam[];
    const examIds = examRows.map(exam => exam.id);
    const sectionResult = examIds.length ? await supabase.from("exam_sections").select(SECTION_SELECT).in("exam_id", examIds).order("sort_order") : { data: [], error: null };
    const sectionRows = (sectionResult.data ?? []) as Section[];
    const sectionIds = sectionRows.map(section => section.id);
    const questionResult = sectionIds.length ? await supabase.from("exam_questions").select(QUESTION_SELECT).in("section_id", sectionIds).order("sort_order") : { data: [], error: null };
    const questionRows = (questionResult.data ?? []) as Question[];
    const questionIds = questionRows.map(question => question.id);
    const keyResult = questionIds.length ? await supabase.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questionIds) : { data: [], error: null };
    const firstError = examResult.error ?? sectionResult.error ?? questionResult.error ?? keyResult.error;
    if (firstError) setError(firstError.message);
    setRooms(roomRows); setExams(examRows); setSections(sectionRows); setQuestions(questionRows); setKeys((keyResult.data ?? []) as KeyRow[]);
    setSelectedRoomId(previous => roomRows.some(room => room.id === previous) ? previous : roomRows[0]?.id ?? "");
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void load();
  }, [load]);

  const selectedRoom = rooms.find(room => room.id === selectedRoomId) ?? null;
  const roomExams = exams.filter(exam => exam.room_id === selectedRoomId);
  const selectedExam = exams.find(exam => exam.id === selectedExamId) ?? null;
  const examSections = sections.filter(section => section.exam_id === selectedExamId);

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
    if (editingExam.published) {
      try {
        const preflightResponse = await authenticatedFetch(`/api/admin/exam-policy?examId=${encodeURIComponent(editingExam.id)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "preflight", examId: editingExam.id }),
        });
        const preflight = await preflightResponse.json().catch(() => ({})) as { error?: string; canPublish?: boolean; checks?: Array<{ level?: string; message?: string }> };
        if (!preflightResponse.ok || !preflight.canPublish) {
          const firstError = preflight.checks?.find(check => check.level === "error")?.message;
          setSaving(false);
          setError(firstError || preflight.error || "Đề chưa đạt preflight và chưa thể xuất bản.");
          return;
        }
      } catch (value) {
        setSaving(false);
        setError(value instanceof Error ? value.message : "Không thể kiểm tra preflight trước khi xuất bản.");
        return;
      }
    }
    const { error: updateError } = await supabase.from("exams").update({ title: editingExam.title.trim(), description: editingExam.description.trim(), exam_type: editingExam.exam_type.trim() || "TSA", mode: editingExam.mode, duration_minutes: editingExam.duration_minutes, published: editingExam.published }).eq("id", editingExam.id);
    setSaving(false); if (updateError) { setError(updateError.message); return; }
    setEditingExam(null); setNotice("Đã lưu thông tin đề thi."); await load();
  }

  async function saveSection() {
    if (!supabase || !editingSection) return;
    setSaving(true); setError(""); setNotice("");
    const { error: updateError } = await supabase.from("exam_sections").update({
      title: editingSection.title.trim(),
      duration_minutes: editingSection.duration_minutes || null,
    }).eq("id", editingSection.id);
    setSaving(false);
    if (updateError) { setError(updateError.message); return; }
    setEditingSection(null); setNotice("Đã lưu thông tin phần thi."); await load();
  }

  async function remove(table: "exam_rooms" | "exams" | "exam_sections" | "exam_questions", id: string, label: string) {
    if (!supabase || !window.confirm(`Xóa ${label}? Dữ liệu bên trong cũng sẽ bị xóa.`)) return;
    const { error: deleteError } = await supabase.from(table).delete().eq("id", id);
    if (deleteError) setError(deleteError.message); else { setNotice(`Đã xóa ${label}.`); await load(); }
  }

  if (loading) return <LoadingIndicator label="Đang tải dữ liệu khảo thí…" />;
  return <div className="admin-exam-manager">
    <header className="admin-exam-header"><div><span className="eyebrow">NỘI DUNG ĐỀ THI</span><h2>Đề thi</h2><p>Soạn nội dung có thể tái sử dụng, xem trước, kiểm tra rồi xuất bản.</p><RoomTypeLegend/></div><button className="primary-btn small" onClick={() => openModal("room")}><Plus/>Tạo đề</button></header>
    {error && <p className="form-error">{error}</p>}{notice && <p className="form-success">{notice}</p>}
    <div className="admin-exam-layout">
      <aside className="admin-exam-room-list"><div className="admin-exam-panel-title"><span><ClipboardCheck/>Thư viện đề</span><b>{rooms.length}</b></div>{rooms.length ? rooms.map(room => <button key={room.id} className={room.id === selectedRoomId ? "active" : ""} onClick={() => setSelectedRoomId(room.id)}><span><b>{room.title}</b><small>{exams.filter(exam => exam.room_id === room.id).length} đề · {room.published ? "Đã xuất bản" : "Bản nháp"}</small></span><ChevronRight/></button>) : <div className="admin-exam-empty"><ClipboardCheck/><p>Chưa có nhóm đề.</p></div>}</aside>
      <section className="admin-exam-workspace">{selectedRoom ? <>
        <div className="admin-exam-toolbar"><div><span className="exam-admin-badge">{selectedRoom.exam_type}</span><h3>{selectedRoom.title}</h3><p>{selectedRoom.description || "Chưa có mô tả."}</p></div><div><button className="outline-btn" onClick={() => setEditingRoom({ ...selectedRoom })}><Pencil/>Sửa nhóm đề</button><button className="outline-btn danger" onClick={() => void remove("exam_rooms", selectedRoom.id, "nhóm đề")}><Trash2/></button></div></div>
        <div className="admin-exam-summary"><span><CalendarDays/><small>Thời gian thi</small><b>{selectedRoom.exam_start ? new Date(selectedRoom.exam_start).toLocaleString("vi-VN") : "Không giới hạn"}</b></span><span><GraduationCap/><small>Quyền truy cập</small><b>{selectedRoom.access_mode === "open" ? "Mọi học viên" : "Theo tab Phân quyền"}</b></span><span><ClipboardCheck/><small>Trạng thái</small><b>{selectedRoom.published ? "Đã xuất bản" : "Bản nháp"}</b></span></div>
        <div className="admin-exam-content-head"><div><h3>Các phiên bản đề</h3><p>Chọn một đề để quản lý phần và câu hỏi.</p></div><button className="primary-btn small" onClick={() => openModal("exam", selectedRoom.id)}><FilePlus2/>Thêm đề</button></div>
        <div className="admin-exam-card-grid">{roomExams.length ? roomExams.map(exam => { const examSectionIds = sections.filter(section => section.exam_id === exam.id).map(section => section.id); const questionCount = questions.filter(question => examSectionIds.includes(question.section_id)).length; return <article key={exam.id} className={exam.id === selectedExamId ? "selected" : ""} role="button" tabIndex={0} aria-pressed={exam.id === selectedExamId} onClick={() => setSelectedExamId(exam.id)} onKeyDown={event => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setSelectedExamId(exam.id); } }}><div><span>{exam.exam_type}</span><h4>{exam.title}</h4><p>{exam.duration_minutes} phút · {examSectionIds.length} phần · {questionCount} câu hỏi · {exam.published ? "Đã xuất bản" : "Bản nháp"}</p></div><div><button aria-label="Sửa đề" onClick={event => { event.stopPropagation(); setEditingExam({ ...exam }); }}><Settings2/></button><button aria-label="Xóa đề" onClick={event => { event.stopPropagation(); void remove("exams", exam.id, "đề thi"); }}><Trash2/></button></div></article>; }) : <div className="admin-exam-empty wide"><FilePlus2/><p>Chưa có đề thi trong nhóm này.</p></div>}</div>
        {selectedExam && <ExamTree exam={selectedExam} sections={examSections} questions={questions} keys={keys} onModal={openModal} onDelete={remove} onEditSection={setEditingSection} onEditQuestion={(question, key) => setEditingQuestion({ question, key })} />}
      </> : <div className="admin-exam-empty workspace"><ClipboardCheck/><h3>Chưa có phòng thi</h3><p>Hãy tạo phòng thi đầu tiên để bắt đầu xây dựng đề.</p></div>}</section>
    </div>
    {modal && modal !== "question" && <CreateExamModal type={modal} parentId={modalParentId} defaultExamType={selectedRoom?.exam_type ?? DEFAULT_EXAM_ROOM_TYPE} counts={{ rooms: rooms.length, exams: roomExams.length, sections: examSections.length, questions: questions.length }} onClose={() => setModal(null)} onCreated={async id => { setModal(null); setNotice("Đã tạo dữ liệu khảo thí."); await load(); if (modal === "room") setSelectedRoomId(id); if (modal === "exam") setSelectedExamId(id); }} />}
    {modal === "question" && <QuestionEditorModal sectionId={modalParentId} sectionTitle={sections.find(section => section.id === modalParentId)?.title} sortOrder={questions.filter(question => question.section_id === modalParentId).length} onClose={() => setModal(null)} onSaved={async () => { setModal(null); setNotice("Đã thêm câu hỏi vào phần thi."); await load(); }} />}
    {editingRoom && <EditRoomModal room={editingRoom} setRoom={setEditingRoom} saving={saving} onClose={() => setEditingRoom(null)} onSave={() => void saveRoom()} />}
    {editingExam && <EditExamModal exam={editingExam} setExam={setEditingExam} saving={saving} onClose={() => setEditingExam(null)} onSave={() => void saveExam()} />}
    {editingSection && <EditSectionModal section={editingSection} setSection={setEditingSection} saving={saving} onClose={() => setEditingSection(null)} onSave={() => void saveSection()} />}
    {editingQuestion && <QuestionEditorModal question={editingQuestion.question} answerKey={editingQuestion.key} sectionId={editingQuestion.question.section_id} sectionTitle={sections.find(section => section.id === editingQuestion.question.section_id)?.title} onClose={() => setEditingQuestion(null)} onSaved={async () => { setEditingQuestion(null); setNotice("Đã cập nhật câu hỏi."); await load(); }} />}
  </div>;
}

function RoomTypeLegend() {
  return <div className="admin-room-type-legend" aria-label="Các loại đề thi">{EXAM_ROOM_TYPE_OPTIONS.map(option => <span key={option.value}><b>{option.label}</b><small>{option.description}</small></span>)}</div>;
}

function ExamTree({ exam, sections, questions, keys, onModal, onDelete, onEditSection, onEditQuestion }: { exam: Exam; sections: Section[]; questions: Question[]; keys: KeyRow[]; onModal: (type: Exclude<ModalType, null>, parentId?: string) => void; onDelete: (table: "exam_rooms" | "exams" | "exam_sections" | "exam_questions", id: string, label: string) => Promise<void>; onEditSection: (section: Section) => void; onEditQuestion: (question: Question, key?: KeyRow) => void }) {
  const isThptqg = exam.exam_type.toUpperCase() === "THPTQG";
  const canAddSection = !isThptqg && sections.length < 3;
  return <section className="admin-exam-tree">
    <div className="admin-exam-content-head">
      <div><span className="eyebrow">CẤU TRÚC ĐỀ</span><h3>{exam.title}</h3><p className="admin-exam-structure-note">{isThptqg ? "THPTQG cho phép bật 1–8 môn khi tạo đề; mỗi môn là một lượt thi độc lập." : "TSA dùng 3 phần: Toán học, Đọc hiểu và Khoa học theo mẫu tham khảo."}</p></div>
      {canAddSection && <button className="outline-btn" onClick={() => onModal("section", exam.id)}><FolderPlus/>Thêm phần {sections.length + 1}/3</button>}
    </div>
    <details className="admin-format-guide" open={exam.exam_type.toUpperCase() === "TSA"}>
      <summary><span>Gợi ý soạn đề TSA</span><small>Đối chiếu huongdan.MD · \\tsa[4]</small></summary>
      <div>{QUESTION_FORMATS.map(format => <span key={format.value}><b>{format.label}</b><small>{format.guide}</small><code>{format.syntax}</code></span>)}</div>
    </details>
    {sections.length ? sections.map((section, sectionIndex) => {
      const items = questions.filter(question => question.section_id === section.id);
      return <details key={section.id} open>
        <summary>
           <span>{isThptqg ? (section.subject_code || `Môn ${sectionIndex + 1}`) : `Phần ${sectionIndex + 1}`}</span><b>{section.title}</b><small>{items.length} câu{section.duration_minutes ? ` · ${section.duration_minutes} phút` : ""}</small>
           <button aria-label="Sửa phần" onClick={event => { event.preventDefault(); onEditSection(section); }}><Pencil/></button>
           {(isThptqg || sections.length > 3) && <button aria-label="Xóa phần" onClick={event => { event.preventDefault(); void onDelete("exam_sections", section.id, isThptqg ? "môn thi" : "phần thi"); }}><Trash2/></button>}
        </summary>
        <div className="admin-exam-question-list">
          <button className="admin-add-question" onClick={() => onModal("question", section.id)}><Plus/>Thêm câu hỏi</button>
          {items.map((question, questionIndex) => {
            const key = keys.find(item => item.question_id === question.id);
            return <article key={question.id}><span>Câu {questionIndex + 1}</span><div><p>{question.prompt}</p><small>{questionTypeLabel(question.question_type)} · Đáp án: {Array.isArray(key?.correct_answer) ? key?.correct_answer.join(", ") : key?.correct_answer ?? "Chưa đặt"}</small></div><div className="admin-question-actions"><button aria-label="Sửa câu hỏi" onClick={() => onEditQuestion(question, key)}><Pencil/></button><button aria-label="Xóa câu hỏi" onClick={() => void onDelete("exam_questions", question.id, "câu hỏi")}><Trash2/></button></div></article>;
          })}
        </div>
      </details>;
    }) : <div className="admin-exam-empty wide"><FolderPlus/><p>Đề này chưa có phần thi.</p></div>}
  </section>;
}

function CreateExamModal({ type, parentId, defaultExamType, counts, onClose, onCreated }: { type: Exclude<ModalType, null>; parentId: string; defaultExamType: string; counts: { rooms: number; exams: number; sections: number; questions: number }; onClose: () => void; onCreated: (id: string) => Promise<void> }) {
  const [title, setTitle] = useState(""); const [description, setDescription] = useState(""); const [examType, setExamType] = useState(type === "room" ? DEFAULT_EXAM_ROOM_TYPE : defaultExamType); const [duration, setDuration] = useState(type === "exam" && defaultExamType.toUpperCase() === "TSA" ? 150 : 90); const [published, setPublished] = useState(false); const [accessMode, setAccessMode] = useState<"open" | "assigned">("open");
  const [selectedSubjectCodes, setSelectedSubjectCodes] = useState<string[]>([]);
  const [questionType, setQuestionType] = useState<Question["question_type"]>("single"); const [optionsText, setOptionsText] = useState(""); const [correctAnswer, setCorrectAnswer] = useState(""); const [explanation, setExplanation] = useState(""); const [passage, setPassage] = useState(""); const [mediaUrl, setMediaUrl] = useState(""); const [instruction, setInstruction] = useState(""); const [points, setPoints] = useState(1); const [saving, setSaving] = useState(false); const [error, setError] = useState("");
  const labels = { room: ["PHÒNG THI MỚI", "Tạo phòng thi"], exam: ["ĐỀ THI MỚI", "Tạo đề thi"], section: ["PHẦN THI MỚI", "Thêm phần thi"], question: ["NGÂN HÀNG CÂU HỎI", "Thêm câu hỏi"] } as const;
  const dialogRef = useAdminDialogFocus<HTMLFormElement>(true, onClose);
  async function submit(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return; setSaving(true); setError("");
    let id = ""; let failure: { message: string } | null = null;
    if (type === "room") { const result = await supabase.from("exam_rooms").insert({ title: title.trim(), description: description.trim(), exam_type: examType.trim() || "TSA", access_mode: accessMode, published, sort_order: counts.rooms }).select("id").single(); id = result.data?.id ?? ""; failure = result.error; }
    if (type === "exam") {
      const normalizedType = examType.trim() || defaultExamType || DEFAULT_EXAM_ROOM_TYPE;
      if (normalizedType.toUpperCase() === "THPTQG" && !selectedSubjectCodes.length) { setSaving(false); setError("Hãy chọn ít nhất một môn cho cụm đề THPTQG."); return; }
      const requestedPublish = published;
      const dashboardTitle = normalizedType.toUpperCase() === "THPTQG" ? "KỲ THI TỐT NGHIỆP THPT 2027" : title.trim() || "ĐỀ THI";
      const result = await supabase.from("exams").insert({ room_id: parentId, title: title.trim(), description: description.trim(), dashboard_title: dashboardTitle, exam_type: normalizedType, duration_minutes: duration, published: false, sort_order: counts.exams }).select("id").single();
      id = result.data?.id ?? "";
      failure = result.error;
      if (!failure && id) {
        const templates = sectionTemplatesForExamType(normalizedType).filter(section => normalizedType.toUpperCase() !== "THPTQG" || selectedSubjectCodes.includes("code" in section ? section.code : ""));
        const sectionResult = await supabase.from("exam_sections").insert(templates.map((section, index) => ({ exam_id: id, title: section.title, duration_minutes: section.duration_minutes, subject_code: "code" in section ? section.code : null, sort_order: index })));
         failure = sectionResult.error;
         if (failure) { await supabase.from("exams").delete().eq("id", id); id = ""; }
       }
       if (!failure && id && requestedPublish) {
         try {
           const preflightResponse = await authenticatedFetch(`/api/admin/exam-policy?examId=${encodeURIComponent(id)}`, {
             method: "POST",
             headers: { "content-type": "application/json" },
             body: JSON.stringify({ action: "preflight", examId: id }),
           });
           const preflight = await preflightResponse.json().catch(() => ({})) as { error?: string; canPublish?: boolean; checks?: Array<{ level?: string; message?: string }> };
           if (!preflightResponse.ok || !preflight.canPublish) {
             const firstError = preflight.checks?.find(check => check.level === "error")?.message;
             setError(`Bản nháp đã được tạo nhưng chưa thể xuất bản. ${firstError || preflight.error || "Đề chưa đạt preflight."}`);
             setSaving(false);
             return;
           }
           const publishResponse = await authenticatedFetch("/api/admin/exam-policy", {
             method: "POST",
             headers: { "content-type": "application/json" },
             body: JSON.stringify({ action: "publish_exam", examId: id }),
           });
           const publishPayload = await publishResponse.json().catch(() => ({})) as { error?: string; published?: boolean; checks?: Array<{ level?: string; message?: string }> };
           if (!publishResponse.ok || !publishPayload.published) {
             const firstError = publishPayload.checks?.find(check => check.level === "error")?.message;
             setError(`Bản nháp đã được tạo nhưng chưa thể xuất bản: ${firstError || publishPayload.error || "Lỗi server khi chuyển trạng thái."}`);
             setSaving(false);
             return;
           }
         } catch (value) {
           setError(`Bản nháp đã được tạo nhưng chưa thể kiểm tra preflight. ${value instanceof Error ? value.message : "Hãy mở lại đề để kiểm tra và xuất bản sau."}`);
           setSaving(false);
           return;
         }
       }
     }
    if (type === "section") { const result = await supabase.from("exam_sections").insert({ exam_id: parentId, title: title.trim(), duration_minutes: duration || null, sort_order: counts.sections }).select("id").single(); id = result.data?.id ?? ""; failure = result.error; }
    if (type === "question") {
      const optionLines = optionsText.split("\n").map(line => line.trim()).filter(Boolean); const options = ["text", "inline"].includes(questionType) ? [] : optionLines.map((label, index) => ({ value: String.fromCharCode(65 + index), label }));
      const result = await supabase.from("exam_questions").insert({ section_id: parentId, prompt: title.trim(), question_type: questionType, options, passage: passage.trim() || null, media_url: mediaUrl.trim() || null, instruction: instruction.trim() || null, points, sort_order: counts.questions }).select("id").single(); id = result.data?.id ?? ""; failure = result.error;
      if (!failure && id) { const answer = ["multiple", "inline", "true_false", "ordering", "drag_drop"].includes(questionType) ? correctAnswer.split(",").map(value => value.trim()).filter(Boolean) : correctAnswer.trim(); const keyResult = await supabase.from("exam_question_keys").insert({ question_id: id, correct_answer: answer, explanation: explanation.trim() }); failure = keyResult.error; if (failure) await supabase.from("exam_questions").delete().eq("id", id); }
    }
    setSaving(false); if (failure || !id) { setError(failure?.message ?? "Không thể tạo dữ liệu."); return; } await onCreated(id);
  }
  return <div className="modal-shade" role="presentation"><form ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-labelledby={`create-${type}-dialog-title`} className="modal admin-exam-modal" onSubmit={submit}><div className="section-head"><div><span className="eyebrow">{labels[type][0]}</span><h2 id={`create-${type}-dialog-title`}>{labels[type][1]}</h2></div><button type="button" className="icon-btn" aria-label="Đóng hộp thoại" onClick={onClose}><X aria-hidden="true"/></button></div><label>{type === "question" ? "Nội dung câu hỏi" : "Tên"}{type === "question" ? <textarea value={title} onChange={event => setTitle(event.target.value)} rows={4} placeholder="Có thể nhập công thức dạng $x^2$" required/> : <input value={title} onChange={event => setTitle(event.target.value)} required/>}</label>{type === "question" && <MathPreview text={title}/>} {(type === "room" || type === "exam") && <><label>Mô tả<textarea value={description} onChange={event => setDescription(event.target.value)} rows={3}/></label><label>Loại kỳ thi<input value={examType} onChange={event => setExamType(event.target.value)} placeholder="TSA"/></label>{type === "exam" && examType.trim().toUpperCase() === "THPTQG" && <fieldset className="admin-subject-picker"><legend>Chọn các môn trong cụm đề</legend><p>Chọn 1–8 môn. Mỗi môn sẽ có màn hình làm bài và kết quả riêng.</p><div>{THPTQG_SUBJECT_TEMPLATES.map(subject => <label key={subject.code}><input type="checkbox" checked={selectedSubjectCodes.includes(subject.code)} onChange={event => setSelectedSubjectCodes(previous => event.target.checked ? [...previous, subject.code] : previous.filter(code => code !== subject.code))}/><span><b>{subject.title}</b><small>{subject.duration_minutes} phút</small></span></label>)}</div></fieldset>}</>}{type === "room" && <label>Quyền truy cập<select value={accessMode} onChange={event => setAccessMode(event.target.value as "open" | "assigned")}><option value="open">Mọi học viên</option><option value="assigned">Chỉ học viên được phân</option></select></label>}{(type === "exam" || type === "section") && <label>Thời lượng (phút)<input type="number" min={1} value={duration} onChange={event => setDuration(Number(event.target.value))} required/></label>}{type === "question" && <><label>Loại câu hỏi<select value={questionType} onChange={event => setQuestionType(event.target.value as Question["question_type"])}><option value="single">Một đáp án</option><option value="multiple">Nhiều đáp án</option><option value="text">Điền câu trả lời</option><option value="inline">Nhiều ô trống</option><option value="true_false">Ma trận đúng / sai</option><option value="ordering">Ghép nối</option><option value="drag_drop">Kéo và thả</option></select></label>{!["text", "inline"].includes(questionType) && <label>Các phương án / phát biểu — mỗi dòng một mục<textarea value={optionsText} onChange={event => setOptionsText(event.target.value)} rows={5} placeholder={'Phương án A\nPhương án B\nPhương án C\nPhương án D'} required/></label>}<label>Chỉ dẫn hiển thị<input value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="Ví dụ: Chọn HAI đáp án"/></label><label>Đoạn đọc / dữ liệu chung<textarea value={passage} onChange={event => setPassage(event.target.value)} rows={4} placeholder="Bỏ trống nếu câu hỏi không thuộc nhóm đoạn đọc"/></label><label>URL hình minh họa<input type="url" value={mediaUrl} onChange={event => setMediaUrl(event.target.value)} placeholder="https://…"/></label><label>Đáp án đúng<input value={correctAnswer} onChange={event => setCorrectAnswer(event.target.value)} placeholder={["multiple", "inline", "true_false", "ordering", "drag_drop"].includes(questionType) ? "Các giá trị cách nhau bằng dấu phẩy" : questionType === "single" ? "A" : "Nhập đáp án"} required/></label><label>Lời giải<textarea value={explanation} onChange={event => setExplanation(event.target.value)} rows={3} placeholder="Có thể dùng công thức KaTeX"/></label><label>Điểm<input type="number" min={0} step="0.25" value={points} onChange={event => setPoints(Number(event.target.value))}/></label></>}{(type === "room" || type === "exam") && <label className="checkbox-row"><input type="checkbox" checked={published} onChange={event => setPublished(event.target.checked)}/><span>Xuất bản ngay</span></label>}{error && <p className="form-error">{error}</p>}<button className="primary-btn" disabled={saving}>{saving ? "Đang tạo…" : labels[type][1]}</button></form></div>;
}

function QuestionEditorModal({ question: initialQuestion, answerKey, sectionId, sectionTitle, sortOrder, onClose, onSaved }: { question?: Question; answerKey?: KeyRow; sectionId: string; sectionTitle?: string; sortOrder?: number; onClose: () => void; onSaved: () => Promise<void> }) {
  const [prompt, setPrompt] = useState(initialQuestion?.prompt ?? "");
  const [questionType, setQuestionType] = useState<QuestionType>(initialQuestion?.question_type ?? "single");
  const [optionsText, setOptionsText] = useState(initialQuestion?.options.map(option => option.label).join("\n") ?? "");
  const [instruction, setInstruction] = useState(initialQuestion?.instruction ?? "");
  const [passage, setPassage] = useState(initialQuestion?.passage ?? "");
  const [mediaUrl, setMediaUrl] = useState(initialQuestion?.media_url ?? "");
  const [correctAnswer, setCorrectAnswer] = useState(Array.isArray(answerKey?.correct_answer) ? answerKey.correct_answer.join(", ") : answerKey?.correct_answer ?? "");
  const [explanation, setExplanation] = useState(answerKey?.explanation ?? "");
  const [points, setPoints] = useState(initialQuestion?.points ?? 1);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const format = QUESTION_FORMATS.find(item => item.value === questionType) ?? QUESTION_FORMATS[0];
  const needsOptions = !["text", "inline"].includes(questionType);
  const listAnswer = ["multiple", "inline", "true_false", "ordering", "drag_drop"].includes(questionType);
  const isEditing = Boolean(initialQuestion);
  const dialogRef = useAdminDialogFocus<HTMLFormElement>(true, onClose);

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const optionLines = optionsText.split("\n").map(line => line.trim()).filter(Boolean);
    if (!prompt.trim()) { setError("Hãy nhập nội dung câu hỏi."); return; }
    if (needsOptions && optionLines.length < 2) { setError("Hãy nhập ít nhất hai phương án hoặc phát biểu, mỗi dòng một mục."); return; }
    if (["inline", "drag_drop"].includes(questionType) && !/___+/.test(prompt)) { setError("Dạng này cần ít nhất một vị trí trống bằng chuỗi gạch dưới, ví dụ ____."); return; }
    if (!correctAnswer.trim()) { setError("Hãy nhập đáp án đúng."); return; }
    setSaving(true); setError("");
    const options = needsOptions ? optionLines.map((label, index) => ({ value: String.fromCharCode(65 + index), label })) : [];
    const answer = listAnswer ? correctAnswer.split(",").map(value => value.trim()).filter(Boolean) : correctAnswer.trim();
    const payload = { prompt: prompt.trim(), question_type: questionType, options, passage: passage.trim() || null, media_url: mediaUrl.trim() || null, instruction: instruction.trim() || null, points: Number(points) || 0 };
    let questionId = initialQuestion?.id ?? "";
    let failure: { message: string } | null = null;
    if (initialQuestion) {
      const result = await supabase.from("exam_questions").update(payload).eq("id", initialQuestion.id);
      failure = result.error;
      if (!failure) {
        const keyResult = await supabase.from("exam_question_keys").upsert({ question_id: initialQuestion.id, correct_answer: answer, explanation: explanation.trim() }, { onConflict: "question_id" });
        failure = keyResult.error;
      }
    } else {
      const result = await supabase.from("exam_questions").insert({ ...payload, section_id: sectionId, sort_order: sortOrder ?? 0 }).select("id").single();
      questionId = result.data?.id ?? "";
      failure = result.error;
      if (!failure && questionId) {
        const keyResult = await supabase.from("exam_question_keys").insert({ question_id: questionId, correct_answer: answer, explanation: explanation.trim() });
        failure = keyResult.error;
        if (failure) await supabase.from("exam_questions").delete().eq("id", questionId);
      }
    }
    setSaving(false);
    if (failure || !questionId && !initialQuestion) { setError(failure?.message ?? "Không thể lưu câu hỏi."); return; }
    await onSaved();
  }

  return <div className="modal-shade" role="presentation"><form ref={dialogRef} tabIndex={-1} role="dialog" aria-modal="true" aria-label="Trình soạn câu hỏi" className="modal admin-question-editor" onSubmit={submit}>
    <header className="admin-question-editor-header"><div><span className="eyebrow">{isEditing ? "CHỈNH SỬA CÂU HỎI" : "SOẠN CÂU HỎI TSA"}</span><h2>{isEditing ? "Cập nhật câu hỏi" : "Thêm câu hỏi"}</h2><p>{sectionTitle ? `Phần: ${sectionTitle}` : "Câu hỏi sẽ được lưu vào phần thi đang chọn."}</p></div><button type="button" className="icon-btn" onClick={onClose} aria-label="Đóng"><X/></button></header>
    <div className="admin-question-editor-grid">
      <div className="admin-question-fields">
        <label>Loại câu hỏi<select value={questionType} onChange={event => setQuestionType(event.target.value as QuestionType)}>{QUESTION_FORMATS.map(item => <option value={item.value} key={item.value}>{item.label}</option>)}</select></label>
        <div className="admin-question-format-card"><b>{format.label}</b><span>{format.guide}</span><code>{format.syntax}</code><small>Đáp án mẫu: {format.answerHint}</small></div>
        <label>Nội dung câu hỏi<textarea autoFocus value={prompt} onChange={event => setPrompt(event.target.value)} rows={5} placeholder="Nhập nội dung; có thể dùng $x^2$ hoặc ____ để tạo ô trống." required/></label>
        {needsOptions && <label>Phương án / phát biểu <small>(mỗi dòng một mục; hệ thống tự đánh mã A, B, C…)</small><textarea value={optionsText} onChange={event => setOptionsText(event.target.value)} rows={5} placeholder="Phương án A\nPhương án B\nPhương án C\nPhương án D" required/></label>}
        {["inline", "drag_drop"].includes(questionType) && <p className="admin-question-tip">Dùng chuỗi <code>____</code> trong nội dung để tạo vị trí trả lời. Đáp án nhập theo đúng thứ tự các ô.</p>}
        <div className="admin-question-two-col"><label>Chỉ dẫn hiển thị<input value={instruction} onChange={event => setInstruction(event.target.value)} placeholder="Ví dụ: Chọn HAI đáp án"/></label><label>Điểm<input type="number" min={0} step="0.25" value={points} onChange={event => setPoints(Number(event.target.value))}/></label></div>
        <label>Đoạn đọc / dữ liệu chung <small>(không bắt buộc)</small><textarea value={passage} onChange={event => setPassage(event.target.value)} rows={4} placeholder="Dùng cho nhóm câu hỏi đọc hiểu hoặc dữ liệu khoa học."/></label>
        <label>URL hình minh họa <small>(không bắt buộc)</small><input type="url" value={mediaUrl} onChange={event => setMediaUrl(event.target.value)} placeholder="https://…"/></label>
        <label>Đáp án đúng <small>({listAnswer ? "nhiều giá trị, cách nhau bằng dấu phẩy" : "một giá trị"})</small><input value={correctAnswer} onChange={event => setCorrectAnswer(event.target.value)} placeholder={listAnswer ? format.answerHint : questionType === "single" ? "A" : "Nhập đáp án"} required/></label>
        <label>Lời giải / giải thích <small>(có thể dùng công thức KaTeX)</small><textarea value={explanation} onChange={event => setExplanation(event.target.value)} rows={4} placeholder="Giải thích ngắn gọn để hiển thị khi xem lại kết quả."/></label>
      </div>
      <aside className="admin-question-preview"><span className="eyebrow">XEM TRƯỚC</span><h3>Cách học viên sẽ thấy</h3><QuestionDraftPreview prompt={prompt} optionsText={optionsText} questionType={questionType} correctAnswer={correctAnswer}/></aside>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <footer className="admin-question-editor-footer"><button type="button" className="outline-btn" onClick={onClose}>Hủy</button><button className="primary-btn small" disabled={saving}>{saving ? "Đang lưu…" : isEditing ? "Lưu thay đổi" : "Thêm câu hỏi"}</button></footer>
  </form></div>;
}

function QuestionDraftPreview({ prompt, optionsText, questionType, correctAnswer }: { prompt: string; optionsText: string; questionType: QuestionType; correctAnswer: string }) {
  const options = optionsText.split("\n").map(item => item.trim()).filter(Boolean);
  return <div className="admin-question-preview-card"><div className="admin-question-preview-number">1</div><div className="admin-question-preview-body"><p>{prompt || "Nội dung câu hỏi sẽ hiển thị ở đây."}</p>{options.length ? <div className="admin-question-preview-options">{options.map((option, index) => <div key={`${option}-${index}`}><b>{String.fromCharCode(65 + index)}</b><span>{option}</span></div>)}</div> : <div className="admin-question-preview-empty">{questionType === "text" ? "Ô nhập câu trả lời ngắn" : "Các ô trả lời sẽ xuất hiện theo dấu ____"}</div>}{correctAnswer && <small>Đáp án đang đặt: <b>{correctAnswer}</b></small>}</div></div>;
}

function EditRoomModal({ room, setRoom, saving, onClose, onSave }: { room: Room; setRoom: (room: Room | null) => void; saving: boolean; onClose: () => void; onSave: () => void }) {
  useAdminDialogFocus(true, onClose);
  return <div className="modal-shade"><section className="modal admin-exam-modal"><div className="section-head"><div><span className="eyebrow">CẤU HÌNH PHÒNG</span><h2>Sửa phòng thi</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><label>Tên<input value={room.title} onChange={event => setRoom({ ...room, title: event.target.value })}/></label><label>Mô tả<textarea rows={3} value={room.description} onChange={event => setRoom({ ...room, description: event.target.value })}/></label><label>Loại kỳ thi<input value={room.exam_type} onChange={event => setRoom({ ...room, exam_type: event.target.value })}/></label><div className="admin-date-grid"><label>Bắt đầu đăng ký<input type="datetime-local" value={toLocalInput(room.registration_start)} onChange={event => setRoom({ ...room, registration_start: event.target.value ? new Date(event.target.value).toISOString() : null })}/></label><label>Kết thúc đăng ký<input type="datetime-local" value={toLocalInput(room.registration_end)} onChange={event => setRoom({ ...room, registration_end: event.target.value ? new Date(event.target.value).toISOString() : null })}/></label><label>Bắt đầu thi<input type="datetime-local" value={toLocalInput(room.exam_start)} onChange={event => setRoom({ ...room, exam_start: event.target.value ? new Date(event.target.value).toISOString() : null })}/></label><label>Kết thúc thi<input type="datetime-local" value={toLocalInput(room.exam_end)} onChange={event => setRoom({ ...room, exam_end: event.target.value ? new Date(event.target.value).toISOString() : null })}/></label></div><label>Quyền truy cập<select value={room.access_mode} onChange={event => setRoom({ ...room, access_mode: event.target.value as Room["access_mode"] })}><option value="open">Mọi học viên</option><option value="assigned">Chỉ học viên được phân</option></select></label><label className="checkbox-row"><input type="checkbox" checked={room.published} onChange={event => setRoom({ ...room, published: event.target.checked })}/><span>Đã xuất bản</span></label><button className="primary-btn" onClick={onSave} disabled={saving}><Save/>{saving ? "Đang lưu…" : "Lưu phòng thi"}</button></section></div>;
}

function EditExamModal({ exam, setExam, saving, onClose, onSave }: { exam: Exam; setExam: (exam: Exam | null) => void; saving: boolean; onClose: () => void; onSave: () => void }) {
  useAdminDialogFocus(true, onClose);
  return <div className="modal-shade"><section className="modal admin-exam-modal"><div className="section-head"><div><span className="eyebrow">CẤU HÌNH ĐỀ</span><h2>Sửa đề thi</h2></div><button className="icon-btn" onClick={onClose}><X/></button></div><label>Tên đề<input value={exam.title} onChange={event => setExam({ ...exam, title: event.target.value })}/></label><label>Mô tả<textarea rows={3} value={exam.description} onChange={event => setExam({ ...exam, description: event.target.value })}/></label><label>Loại kỳ thi<input value={exam.exam_type} onChange={event => setExam({ ...exam, exam_type: event.target.value })}/></label><label>Thời lượng<input type="number" min={1} value={exam.duration_minutes} onChange={event => setExam({ ...exam, duration_minutes: Number(event.target.value) })}/></label><label>Hình thức<select value={exam.mode} onChange={event => setExam({ ...exam, mode: event.target.value as Exam["mode"] })}><option value="free">Tự do</option><option value="scheduled">Theo lịch</option></select></label><label className="checkbox-row"><input type="checkbox" checked={exam.published} onChange={event => setExam({ ...exam, published: event.target.checked })}/><span>Đã xuất bản</span></label><button className="primary-btn" onClick={onSave} disabled={saving}><Save/>{saving ? "Đang lưu…" : "Lưu đề thi"}</button></section></div>;
}

function EditSectionModal({ section, setSection, saving, onClose, onSave }: { section: Section; setSection: (section: Section | null) => void; saving: boolean; onClose: () => void; onSave: () => void }) {
  useAdminDialogFocus(true, onClose);
  return <div className="modal-shade"><form className="modal admin-exam-modal" onSubmit={event => { event.preventDefault(); onSave(); }}><div className="section-head"><div><span className="eyebrow">CẤU HÌNH PHẦN</span><h2>Sửa phần thi</h2></div><button type="button" className="icon-btn" onClick={onClose}><X/></button></div><label>Tên phần<input value={section.title} onChange={event => setSection({ ...section, title: event.target.value })} required/></label><label>Thời lượng (phút)<input type="number" min={1} value={section.duration_minutes ?? ""} onChange={event => setSection({ ...section, duration_minutes: event.target.value ? Number(event.target.value) : null })}/></label><button className="primary-btn" disabled={saving}><Save/>{saving ? "Đang lưu…" : "Lưu phần thi"}</button></form></div>;
}

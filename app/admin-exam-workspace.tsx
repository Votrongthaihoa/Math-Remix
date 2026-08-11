"use client";

import { useCallback, useEffect, useMemo, useRef, useState, type FormEvent, type KeyboardEvent as ReactKeyboardEvent } from "react";
import Link from "next/link";
import {
  ArrowDown, ArrowLeft, ArrowUp, BookOpen, Check, CheckCircle2, ChevronRight, Clock3, Code2, Copy, Download, ExternalLink, FilePlus2, Link2,
  FileText, FolderOpen, Layers3, LayoutList, Pencil, Plus, Save, Settings2,
  Search, Sparkles, TerminalSquare, Trash2, Upload, X
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { authenticatedFetch } from "../lib/auth-client";
import { hasAnswerValue } from "../lib/exam-answers";
import { loadCandidateIdentity, type CandidateIdentity } from "../lib/exam-identity";
import {
  DEFAULT_EXAM_ROOM_TYPE, EXAM_ROOM_TYPE_OPTIONS,
  HSA_SECTION_TEMPLATES, HSA_SCIENCE_SUBJECTS, THPTQG_SUBJECT_TEMPLATES, TSA_SECTION_TEMPLATES, VSAT_SUBJECT_TEMPLATES,
  defaultHsaStructureConfig, expectedQuestionCountForSection, hsaTotalDuration, isPassageSection,
  normalizeExamType, normalizeHsaSelection, normalizeHsaStructureConfig, roomTypeLabel, sectionTemplatesForExamType, thptqgSubjectForSection, type HsaScienceSubjectCode, type HsaSelectionMode, type HsaStructureVersion, type QuestionType
} from "../lib/exam-config";
import {
  DEFAULT_BAIDOC_INSTRUCTION, ensureExEnvironment, latexPartInstruction, matchingError, parseBaidocDocument, parseBaidocQuestionEntries, parseLatexQuestion, questionToLatex, splitLatexQuestions,
  type LatexPartNumber, type ParsedBaidoc, type ParsedLatexQuestion
} from "../lib/exam-latex";
import { DEFAULT_HSA_COMBINATION_CODE, HSA_COMBINATIONS, HSA_PART3_SUBJECTS, hsaSubjectCodeFromLatex, replaceHsaPart3SubjectBank, resolveHsaCombination, splitHsaPart3SubjectBanks, type HsaSubjectCode } from "../lib/hsa-exam";
import { extractHsaPartSource, hsaPartForSectionTitle } from "../lib/hsa-latex-template";
import LoadingIndicator from "./loading-indicator";
import AdminExamAccess from "./admin-exam-access";
import AdminExamPolicy from "./admin-exam-policy";
import ExamImagePicker from "../components/ExamImagePicker";
import LearnerExamPreview from "../components/remixstudyedu/LearnerExamPreview";
import RemixStudyEduReviewPreview from "../components/remixstudyedu/RemixStudyEduReviewPreview";
import ThptqgPreview from "../components/thptqg/ThptqgPreview";
import "./admin-room-standard.css";
import "./admin-exam-workspace.css";
import "./admin-exam-latex-import.css";
import "./exam-themes.css";
import "./thptqg-admin.css";

type Room = {
  id: string; title: string; description: string; exam_type: string;
  access_mode: "open" | "assigned"; registration_start: string | null;
  registration_end: string | null; exam_start: string | null; exam_end: string | null;
  published: boolean; sort_order: number; created_at?: string | null;
};
type Exam = {
  id: string; room_id: string; title: string; description: string; dashboard_title: string | null; exam_type: string;
  mode: "free" | "scheduled"; duration_minutes: number; published: boolean;
  structure_config?: unknown;
  sort_order: number; created_at?: string | null;
};
type Section = { id: string; exam_id: string; title: string; duration_minutes: number | null; sort_order: number; subject_code?: string | null; source_latex?: string | null };
type OptionValue = { value?: string; label?: string; text?: string } | string;
type Question = {
  id: string; section_id: string; prompt: string; question_type: QuestionType;
  options: OptionValue[]; points: number; sort_order: number; passage?: string | null;
  media_url?: string | null; instruction?: string | null; latex_source?: string | null;
  solution_source?: string | null;
};
type KeyRow = { question_id: string; correct_answer: string | string[]; explanation: string };
type DataState = { rooms: Room[]; exams: Exam[]; sections: Section[]; questions: Question[]; keys: KeyRow[] };

const ROOM_SELECT = "id,title,description,exam_type,access_mode,registration_start,registration_end,exam_start,exam_end,published,sort_order,created_at";
const EXAM_SELECT = "id,room_id,title,description,dashboard_title,exam_type,mode,duration_minutes,structure_config,published,sort_order,created_at";
const SECTION_SELECT = "id,exam_id,title,duration_minutes,subject_code,source_latex,sort_order";
const QUESTION_SELECT = "id,section_id,prompt,question_type,options,points,sort_order,passage,media_url,instruction,latex_source,solution_source";

type PreviewHeaderSection = { id: string; title: string };

function PreviewHeaderControls({ sections = [], activeSectionId = "", onSectionChange, mode, onModeChange, onClose, hsaLayout = false, hsaCombinationCode, onHsaCombinationChange }: { sections?: PreviewHeaderSection[]; activeSectionId?: string; onSectionChange?: (sectionId: string) => void; mode: "exam" | "answer"; onModeChange: (mode: "exam" | "answer") => void; onClose: () => void; hsaLayout?: boolean; hsaCombinationCode?: string; onHsaCombinationChange?: (code: string) => void }) {
  const controls = <>
    {sections.length > 0 && <nav className="preview-header-section-nav" aria-label="Các phần trong đề thi">{sections.map((section, index) => <button type="button" key={section.id} className={section.id === activeSectionId ? "active" : ""} onClick={() => onSectionChange?.(section.id)}><i>{index + 1}</i><span>{section.title}</span></button>)}</nav>}
    <div className="preview-header-control-group">
      {hsaLayout && mode === "answer" && hsaCombinationCode && <label className="hsa-preview-combination"><span>Tổ hợp</span><select aria-label="Tổ hợp đáp án HSA" value={hsaCombinationCode} onChange={event => onHsaCombinationChange?.(event.target.value)}>{HSA_COMBINATIONS.map(combination => <option value={combination.code} key={combination.code}>{combination.code}</option>)}</select></label>}
      <div className="learner-preview-mode-switch" role="tablist" aria-label="Chọn giao diện preview"><button type="button" role="tab" aria-selected={mode === "exam"} className={mode === "exam" ? "active" : ""} onClick={() => onModeChange("exam")}>Giao diện bài làm</button><button type="button" role="tab" aria-selected={mode === "answer"} className={mode === "answer" ? "active" : ""} onClick={() => onModeChange("answer")}>Giao diện đáp án</button></div>
      <button type="button" className="preview-header-close" aria-label="Đóng bản xem trước" onClick={onClose}><X/>Đóng</button>
    </div>
  </>;
  return hsaLayout ? <div className="hsa-preview-header-extras">{controls}</div> : controls;
}

type AdminExamRoute =
  | { page: "rooms" }
  | { page: "room"; roomId: string }
  | { page: "room-new" }
  | { page: "room-edit"; roomId: string }
  | { page: "exam-new"; roomId: string }
  | { page: "exam"; examId: string }
  | { page: "access"; examId: string }
  | { page: "policy"; examId: string }
  | { page: "exam-preview"; examId: string }
  | { page: "section-editor"; examId: string; sectionId: string }
  | { page: "section-preview"; examId: string; sectionId: string; draftKey: string }
  | { page: "question-new"; examId: string; sectionId?: string }
  | { page: "question"; examId: string; questionId: string };

function safeDecode(value: string) {
  try { return decodeURIComponent(value); } catch { return value; }
}

function compactLatexSource(value: string) {
  return value
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .filter(line => line.trim() !== "")
    .join("\n")
    .trim();
}

function environmentBalance(value: string, environment: string) {
  const pattern = new RegExp(`\\\\(?:begin|end)\\s*\\{\\s*${environment}\\s*\\}`, "gi");
  let depth = 0;
  let beginCount = 0;
  let endCount = 0;
  let completeCount = 0;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(value))) {
    if (/^\\begin/i.test(match[0])) {
      beginCount += 1;
      depth += 1;
    } else {
      endCount += 1;
      if (depth > 0) depth -= 1;
      if (depth === 0 && beginCount > 0) completeCount += 1;
    }
  }
  return {
    hasAny: beginCount > 0 || endCount > 0,
    balanced: depth === 0 && beginCount === endCount,
    beginCount,
    endCount,
    completeCount,
  };
}

function parseAdminExamRoute(): AdminExamRoute {
  if (typeof window === "undefined") return { page: "rooms" };
  const segments = window.location.pathname.split("/").filter(Boolean).map(safeDecode);
  if (segments[0] !== "admin" || segments[1] !== "exams") return { page: "rooms" };
  if (!segments[2]) return { page: "rooms" };
  if (segments[2] === "rooms") {
    if (segments[3] === "new") return { page: "room-new" };
    if (!segments[3]) return { page: "rooms" };
    if (segments[4] === "exams" && segments[5] === "new") return { page: "exam-new", roomId: segments[3] };
    if (segments[4] === "edit") return { page: "room-edit", roomId: segments[3] };
    return { page: "room", roomId: segments[3] };
  }
  if (segments[3] === "preview") {
    return {
      page: "exam-preview",
      examId: segments[2],
    };
  }
  if (segments[3] === "access") return { page: "access", examId: segments[2] };
  if (segments[3] === "policy") return { page: "policy", examId: segments[2] };
  if (segments[3] === "sections" && segments[4] && segments[5] === "editor") {
    return { page: "section-editor", examId: segments[2], sectionId: segments[4] };
  }
  if (segments[3] === "sections" && segments[4] && segments[5] === "preview") {
    return {
      page: "section-preview",
      examId: segments[2],
      sectionId: segments[4],
      draftKey: new URLSearchParams(window.location.search).get("draft") ?? "",
    };
  }
  if (segments[3] === "questions" && segments[4] === "new") {
    return { page: "question-new", examId: segments[2], sectionId: new URLSearchParams(window.location.search).get("section") ?? undefined };
  }
  if (segments[3] === "questions" && segments[4]) return { page: "question", examId: segments[2], questionId: segments[4] };
  return { page: "exam", examId: segments[2] };
}

function formatDate(value: string | null | undefined, withTime = false) {
  if (!value) return "Chưa đặt";
  return new Intl.DateTimeFormat("vi-VN", withTime ? { dateStyle: "short", timeStyle: "short" } : { dateStyle: "short" }).format(new Date(value));
}

function answerText(value: string | string[] | undefined) {
  return Array.isArray(value) ? value.join(", ") : value ?? "";
}

function imageLatexSnippet(url: string, caption = "") {
  const image = String.raw`\chenanh{1}{${url}}`;
  const text = caption.trim();
  return text ? `${image}\\chuthich{${text}}` : image;
}

function imageRowLatexSnippet(urls: string[], columns: number, captions: string[] = [], widthPx = 0, frameHeightPx = 0) {
  const safeColumns = Math.max(2, Math.min(8, Math.round(columns || urls.length)));
  const size = widthPx > 0 && frameHeightPx > 0 ? `[${safeColumns}][${Math.round(widthPx)}x${Math.round(frameHeightPx)}]` : `[${safeColumns}]`;
  const entries = urls.map((url, index) => `{{${url}}{${captions[index]?.trim() ?? ""}}}`).join("\n    ");
  return `${String.raw`\anhhang${size}`}\n    ${entries}`;
}

function explainExamSchemaError(error: { code?: string; message?: string } | null | undefined, fallback: string) {
  const message = error?.message?.trim() ?? "";
  const permissionDenied = message.match(/permission denied for table\s+([a-z_]+)/i);
  if (permissionDenied) {
    return `Supabase đang từ chối quyền Data API của tài khoản đăng nhập với bảng ${permissionDenied[1]}. Hãy kiểm tra bảng đã được expose cho role authenticated và đối chiếu migration supabase/migrations/034_exam_content_data_api_hardening.sql; không cấp quyền cho anon rồi tải lại trang.`;
  }
  if (/row-level security policy/i.test(message)) {
    return "Supabase đã nhận diện tài khoản nhưng policy RLS chưa cho phép thao tác này. Hãy kiểm tra role admin và policy của workspace trong Supabase rồi tải lại trang.";
  }
  if (/source_latex/i.test(message)) {
    return "Supabase chưa có cột source_latex cho phần thi. Hãy chạy supabase/migrations/015_exam_section_source.sql trong SQL Editor rồi tải lại trang.";
  }
  if (error?.code === "PGRST204" || /schema cache|latex_source|solution_source|passage|media_url|instruction/i.test(message)) {
    return "Supabase chưa cập nhật schema câu hỏi. Hãy chạy supabase/migrations/011_exam_editor_schema_compat.sql trong SQL Editor rồi tải lại trang.";
  }
  return message || fallback;
}

function routePath(path: string) {
  return path.replace(/([^:]\/\/)\/+/g, "$1");
}

function buildStarterSource() {
  return String.raw`\begin{ex}
    Cho biểu thức hoặc dữ kiện của câu hỏi ở đây.

    \choice
        {Phương án A}
        {Phương án B}
        {Phương án C}
        {\True Phương án D}

    \loigiai{
        Trình bày lời giải ở đây.
    }
\end{ex}`;
}

function appendSolution(source: string, solution: string) {
  const normalized = ensureExEnvironment(source);
  if (!solution.trim() || /\\loigiai\b/.test(normalized)) return normalized;
  const body = solution.trim().split("\n").map(line => `    ${line}`).join("\n");
  return normalized.replace(/\\end\{ex\}\s*$/, `    \\loigiai{\n${body}\n    }\n\\end{ex}`);
}

function answerForType(type: QuestionType, value: string) {
  const listType = ["multiple", "inline", "true_false", "ordering", "drag_drop"].includes(type);
  return listType ? value.split(",").map(item => item.trim()).filter(Boolean) : value.trim();
}

function sourceLineBounds(value: string, selectionStart: number, selectionEnd = selectionStart) {
  const lineStart = value.lastIndexOf("\n", Math.max(0, selectionStart - 1)) + 1;
  const effectiveEnd = selectionEnd > selectionStart && value[selectionEnd - 1] === "\n" ? selectionEnd - 1 : selectionEnd;
  const nextBreak = value.indexOf("\n", effectiveEnd);
  return { start: lineStart, end: nextBreak < 0 ? value.length : nextBreak };
}

function sourceLineIndex(value: string, offset: number) {
  return value.slice(0, offset).split("\n").length - 1;
}

function handleAutoPairKey(event: ReactKeyboardEvent<HTMLTextAreaElement>, commitSourceEdit: (nextValue: string, selectionStart: number, selectionEnd?: number) => void) {
  if (event.ctrlKey || event.metaKey || event.altKey) return false;
  const textarea = event.currentTarget;
  const value = textarea.value;
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = value.slice(start, end);
  const openPairs: Record<string, string> = { "{": "}", "[": "]" };
  const close = event.key === "}" || event.key === "]" ? event.key : "";

  if (close && start === end && value[start] === close) {
    event.preventDefault();
    commitSourceEdit(value, start + 1, start + 1);
    return true;
  }

  const isDollarShortcut = event.shiftKey && (event.key === "$" || event.code === "Digit4");
  if (isDollarShortcut && start !== end) {
    event.preventDefault();
    const nextValue = `${value.slice(0, start)}$$${selected}$$${value.slice(end)}`;
    commitSourceEdit(nextValue, start + 2, end + 2);
    return true;
  }

  const closePair = openPairs[event.key];
  if (!closePair) return false;
  event.preventDefault();
  const nextValue = `${value.slice(0, start)}${event.key}${selected}${closePair}${value.slice(end)}`;
  const caretStart = start + 1;
  commitSourceEdit(nextValue, caretStart, selected ? caretStart + selected.length : caretStart);
  return true;
}

type SourceMatch = { start: number; end: number };

type SourceFindReplaceProps = {
  source: string;
  textareaRef: { current: HTMLTextAreaElement | null };
  open: boolean;
  replaceOpen: boolean;
  initialQuery: string;
  onClose: () => void;
  onToggleReplace: () => void;
  onCommit: (nextValue: string, selectionStart: number, selectionEnd?: number) => void;
};

function findSourceMatches(source: string, query: string): SourceMatch[] {
  const normalizedQuery = query.toLocaleLowerCase();
  if (!normalizedQuery) return [];
  const normalizedSource = source.toLocaleLowerCase();
  const matches: SourceMatch[] = [];
  let offset = 0;
  while (offset <= normalizedSource.length - normalizedQuery.length) {
    const index = normalizedSource.indexOf(normalizedQuery, offset);
    if (index < 0) break;
    matches.push({ start: index, end: index + query.length });
    offset = index + Math.max(query.length, 1);
  }
  return matches;
}

function SourceFindReplace({ source, textareaRef, open, replaceOpen, initialQuery, onClose, onToggleReplace, onCommit }: SourceFindReplaceProps) {
  const findInputRef = useRef<HTMLInputElement>(null);
  const [query, setQuery] = useState("");
  const [replacement, setReplacement] = useState("");
  const [activeMatchIndex, setActiveMatchIndex] = useState(-1);
  const matches = useMemo(() => findSourceMatches(source, query), [query, source]);
  const effectiveActiveMatchIndex = activeMatchIndex >= 0 && activeMatchIndex < matches.length ? activeMatchIndex : -1;

  useEffect(() => {
    if (!open) return;
    const frame = window.requestAnimationFrame(() => {
      setQuery(initialQuery);
      setActiveMatchIndex(-1);
      const input = findInputRef.current;
      input?.focus();
      if (initialQuery) input?.select();
    });
    return () => window.cancelAnimationFrame(frame);
  }, [initialQuery, open]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, open]);

  if (!open) return null;

  function selectMatch(index: number) {
    const match = matches[index];
    if (!match) return;
    setActiveMatchIndex(index);
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.focus();
    textarea.setSelectionRange(match.start, match.end);
  }

  function findNext() {
    if (!matches.length) return;
    if (effectiveActiveMatchIndex >= 0) {
      selectMatch((effectiveActiveMatchIndex + 1) % matches.length);
      return;
    }
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? 0;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const selectedIndex = matches.findIndex(match => match.start === selectionStart && match.end === selectionEnd);
    if (selectedIndex >= 0) {
      selectMatch((selectedIndex + 1) % matches.length);
      return;
    }
    const nextIndex = matches.findIndex(match => match.start >= selectionStart);
    selectMatch(nextIndex >= 0 ? nextIndex : 0);
  }

  function findPrevious() {
    if (!matches.length) return;
    if (effectiveActiveMatchIndex >= 0) {
      selectMatch((effectiveActiveMatchIndex - 1 + matches.length) % matches.length);
      return;
    }
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? source.length;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const selectedIndex = matches.findIndex(match => match.start === selectionStart && match.end === selectionEnd);
    if (selectedIndex >= 0) {
      selectMatch((selectedIndex - 1 + matches.length) % matches.length);
      return;
    }
    let previousIndex = -1;
    matches.forEach((match, index) => {
      if (match.start < selectionStart) previousIndex = index;
    });
    selectMatch(previousIndex >= 0 ? previousIndex : matches.length - 1);
  }

  function currentMatchIndex() {
    if (!matches.length) return -1;
    if (effectiveActiveMatchIndex >= 0) return effectiveActiveMatchIndex;
    const textarea = textareaRef.current;
    const selectionStart = textarea?.selectionStart ?? 0;
    const selectionEnd = textarea?.selectionEnd ?? selectionStart;
    const selectedIndex = matches.findIndex(match => match.start === selectionStart && match.end === selectionEnd);
    if (selectedIndex >= 0) return selectedIndex;
    const nextIndex = matches.findIndex(match => match.start >= selectionStart);
    return nextIndex >= 0 ? nextIndex : 0;
  }

  function replaceCurrent() {
    const index = currentMatchIndex();
    const match = matches[index];
    if (!match) return;
    const nextSource = `${source.slice(0, match.start)}${replacement}${source.slice(match.end)}`;
    setActiveMatchIndex(-1);
    onCommit(nextSource, match.start, match.start + replacement.length);
  }

  function replaceAll() {
    if (!matches.length) return;
    let cursor = 0;
    let nextSource = "";
    matches.forEach(match => {
      nextSource += `${source.slice(cursor, match.start)}${replacement}`;
      cursor = match.end;
    });
    nextSource += source.slice(cursor);
    const caret = matches[0].start + replacement.length;
    setActiveMatchIndex(-1);
    onCommit(nextSource, caret, caret);
  }

  function handleFindKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    if (event.shiftKey) findPrevious();
    else findNext();
  }

  function handleReplaceKeyDown(event: ReactKeyboardEvent<HTMLInputElement>) {
    if (event.key !== "Enter") return;
    event.preventDefault();
    replaceCurrent();
  }

  const resultLabel = !query
    ? "Nhập từ khóa"
    : matches.length
      ? `${effectiveActiveMatchIndex >= 0 ? effectiveActiveMatchIndex + 1 : 0}/${matches.length}`
      : "Không tìm thấy";

  return <div className="editor-find-replace" role="search" aria-label="Tìm kiếm và thay thế trong mã LaTeX">
    <div className="editor-find-row">
      <label className="editor-find-field">
        <Search aria-hidden="true" />
        <input ref={findInputRef} value={query} onChange={event => { setQuery(event.target.value); setActiveMatchIndex(-1); }} onKeyDown={handleFindKeyDown} placeholder="Tìm trong mã LaTeX" aria-label="Tìm trong mã LaTeX" />
      </label>
      <span className={`editor-find-result ${query && !matches.length ? "is-empty" : ""}`} aria-live="polite">{resultLabel}</span>
      <button type="button" className="editor-find-icon-button" onClick={findPrevious} disabled={!matches.length} aria-label="Tìm kết quả trước" title="Tìm trước (Shift+Enter)"><ArrowUp /></button>
      <button type="button" className="editor-find-icon-button" onClick={findNext} disabled={!matches.length} aria-label="Tìm kết quả tiếp theo" title="Tìm tiếp (Enter)"><ArrowDown /></button>
      <button type="button" className="editor-find-action" onClick={onToggleReplace}>{replaceOpen ? "Ẩn thay thế" : "Thay thế"}</button>
      <button type="button" className="editor-find-close" onClick={onClose} aria-label="Đóng tìm kiếm" title="Đóng (Esc)"><X /></button>
    </div>
    {replaceOpen && <div className="editor-replace-row">
      <label className="editor-find-field editor-replace-field">
        <input value={replacement} onChange={event => setReplacement(event.target.value)} onKeyDown={handleReplaceKeyDown} placeholder="Thay thế bằng" aria-label="Thay thế bằng" />
      </label>
      <button type="button" className="editor-find-action" onClick={replaceCurrent} disabled={!matches.length}>Thay thế</button>
      <button type="button" className="editor-find-action editor-find-action-primary" onClick={replaceAll} disabled={!matches.length}>Thay tất cả</button>
    </div>}
  </div>;
}

const SNIPPETS = [
  { label: "\item[] câu dẫn ngữ liệu", passageOnly: true, value: String.raw`\item[] Dựa vào thông tin dưới đây và trả lời các câu hỏi từ câu {start} - {end}:` },
  { label: "baidoc · bài đọc + câu hỏi", passageOnly: true, value: String.raw`\begin{baidoc}
    \item[] Dựa vào thông tin dưới đây và trả lời các câu hỏi từ câu {start} - {end}:

\item Đoạn ngữ liệu thứ nhất.

\item Đoạn ngữ liệu thứ hai.

\begin{ex}
    Nội dung câu hỏi thứ nhất...
    \choice
        {Phương án A}
        {Phương án B}
        {Phương án C}
        {\True Phương án D}
\end{ex}
\end{baidoc}` },
  { label: "\\trich · nguồn căn phải", passageOnly: true, value: String.raw`\trich{(Nguồn: Tác giả, tên tài liệu, năm xuất bản)}` },
  { label: "\\phan1 · bắt đầu phần I", value: String.raw`\phan1` },
  { label: "\\phan2 · bắt đầu phần II", value: String.raw`\phan2` },
  { label: "\\phan3 · bắt đầu phần III", value: String.raw`\phan3` },
  { label: "Môi trường ex", value: String.raw`\begin{ex}
    Nội dung câu hỏi...
\end{ex}` },
  { label: "enumerate [a)]", value: String.raw`\begin{enumerate}[a)]
    \item Mệnh đề thứ nhất.
    \item Mệnh đề thứ hai.
\end{enumerate}` },
  { label: "\\choice", value: String.raw`\choice
    {Phương án A}
    {Phương án B}
    {Phương án C}
    {\True Phương án D}` },
  { label: "\\choiceTF", value: String.raw`\choiceTF
    {\True Phát biểu đúng}
    {Phát biểu sai}` },
  { label: "\\cham", value: String.raw`Kết quả là \cham{42}.` },
  { label: "listKT + \\choiceKT", value: String.raw`Kéo và thả các phương án thích hợp:
    \begin{listKT}
        {Mục A}{Mục B}
    \end{listKT}
    \choiceKT
        {a) \cham{Mục A}}
        {b) \cham{Mục B}}` },
  { label: "\\match / \\with · ghép nối", value: String.raw`\match
    {Kháng nguyên}
    {Tế bào T}
    {Tế bào B}
    {Lượng lớn kháng thể}
\with
    [3]{Có thể biệt hóa thành tế bào plasma.}
    [2]{Hoạt hóa khi tiếp xúc với tế bào tua gắn kháng nguyên.}
    [4]{Tạo ra bởi tế bào plasma.}
    [1]{Vào hạch bạch huyết ở hai dạng hòa tan và liên kết.}` },
  { label: "\\loigiai", value: String.raw`\loigiai{
    Trình bày các bước giải.
}` },
  { label: "\\dotlineans", value: String.raw`\dotlineans` },
  { label: "\\tenbaidoc · tiêu đề ngữ liệu (tuỳ chọn)", passageOnly: true, value: String.raw`\tenbaidoc{\indam{Ngữ liệu 1: Tên bài}}` },
];

export default function AdminExamWorkspace() {
  const [route, setRoute] = useState<AdminExamRoute>(parseAdminExamRoute);
  const [data, setData] = useState<DataState>({ rooms: [], exams: [], sections: [], questions: [], keys: [] });
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const load = useCallback(async () => {
    if (!supabase) { setError("Chưa cấu hình Supabase."); setLoading(false); return; }
    setLoading(true); setError("");
    const roomResult = await supabase.from("exam_rooms").select(ROOM_SELECT).order("sort_order").order("created_at");
    if (roomResult.error) { setError(explainExamSchemaError(roomResult.error, "Không thể tải phòng khảo thí.")); setLoading(false); return; }
    const rooms = (roomResult.data ?? []) as Room[];
    const roomIds = rooms.map(room => room.id);
    const examResult = roomIds.length ? await supabase.from("exams").select(EXAM_SELECT).in("room_id", roomIds).order("sort_order").order("created_at") : { data: [], error: null };
    const exams = (examResult.data ?? []) as Exam[];
    const examIds = exams.map(exam => exam.id);
    const sectionResult = examIds.length ? await supabase.from("exam_sections").select(SECTION_SELECT).in("exam_id", examIds).order("sort_order") : { data: [], error: null };
    const sections = (sectionResult.data ?? []) as Section[];
    const sectionIds = sections.map(section => section.id);
    const questionResult = sectionIds.length ? await supabase.from("exam_questions").select(QUESTION_SELECT).in("section_id", sectionIds).order("sort_order") : { data: [], error: null };
    const questions = (questionResult.data ?? []) as Question[];
    const questionIds = questions.map(question => question.id);
    const keyResult = questionIds.length ? await supabase.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questionIds) : { data: [], error: null };
    const firstError = examResult.error ?? sectionResult.error ?? questionResult.error ?? keyResult.error;
    if (firstError) setError(explainExamSchemaError(firstError, "Không thể tải dữ liệu khảo thí."));
    setData({ rooms, exams, sections, questions, keys: (keyResult.data ?? []) as KeyRow[] });
    setLoading(false);
  }, []);

  const isPreviewRoute = route.page === "section-preview" || route.page === "exam-preview";
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (!isPreviewRoute) void load(); }, [isPreviewRoute, load]);
  useEffect(() => {
    const syncRoute = () => setRoute(parseAdminExamRoute());
    window.addEventListener("popstate", syncRoute);
    return () => window.removeEventListener("popstate", syncRoute);
  }, []);

  const navigate = useCallback((path: string) => {
    const target = routePath(path);
    window.history.pushState({}, "", target);
    setRoute(parseAdminExamRoute());
    setNotice("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }, []);

  const refresh = useCallback(async (message?: string) => {
    if (message) setNotice(message);
    await load();
  }, [load]);

  if (route.page === "section-preview") return <SectionPreviewPage draftKey={route.draftKey} />;
  if (route.page === "exam-preview") return <ExamPreviewPage examId={route.examId} />;
  if (loading) return <LoadingIndicator label="Đang tải workspace khảo thí…" />;
  if (error && !data.rooms.length) return <div className="admin-exam-route-shell"><ErrorState message={error} onRetry={() => void load()} /></div>;

  const room = "roomId" in route ? data.rooms.find(item => item.id === route.roomId) ?? null : "examId" in route ? data.rooms.find(item => item.id === data.exams.find(exam => exam.id === route.examId)?.room_id) ?? null : null;
  const exam = "examId" in route ? data.exams.find(item => item.id === route.examId) ?? null : null;
  const section = (route.page === "question-new" || route.page === "section-editor") ? data.sections.find(item => item.id === route.sectionId) ?? data.sections.find(item => item.exam_id === route.examId) ?? null : null;
  const question = route.page === "question" ? data.questions.find(item => item.id === route.questionId) ?? null : null;
  const questionSection = question ? data.sections.find(item => item.id === question.section_id) ?? null : section;
  const questionExam = exam ?? (questionSection ? data.exams.find(item => item.id === questionSection.exam_id) ?? null : null);
  const questionRoom = questionExam ? data.rooms.find(item => item.id === questionExam.room_id) ?? null : room;

  let content: React.ReactNode;
  if (route.page === "rooms") content = <RoomCatalog data={data} navigate={navigate} />;
  else if (route.page === "room-new") content = <RoomFormPage navigate={navigate} onSaved={async id => { await refresh("Đã tạo phòng khảo thí."); navigate(`/admin/exams/rooms/${id}`); }} />;
  else if (route.page === "room-edit" && room) content = <RoomFormPage room={room} navigate={navigate} onSaved={async () => { await refresh("Đã cập nhật thông tin phòng."); navigate(`/admin/exams/rooms/${room.id}`); }} />;
  else if (route.page === "room" && room) content = <RoomWorkspace room={room} data={data} navigate={navigate} onChanged={refresh} />;
  else if (route.page === "exam-new" && room) content = <ExamFormPage room={room} exams={data.exams.filter(item => item.room_id === room.id)} navigate={navigate} onSaved={async id => { await refresh("Đã tạo đề thi."); navigate(`/admin/exams/${id}`); }} />;
  else if (route.page === "exam" && exam && room) content = <ExamWorkspace exam={exam} room={room} data={data} navigate={navigate} onChanged={refresh} />;
  else if (route.page === "access" && exam && room) content = <AdminExamAccess exam={exam} room={room} navigate={navigate} />;
  else if (route.page === "policy" && exam && room) content = <AdminExamPolicy examId={exam.id} navigate={navigate} />;
  else if (route.page === "section-editor" && questionExam && questionRoom && section) content = <SectionLatexEditorPage exam={questionExam} room={questionRoom} section={section} data={data} navigate={navigate} onSaved={async message => { await refresh(message); }} />;
  else if ((route.page === "question" || route.page === "question-new") && questionExam && questionRoom && questionSection) content = <QuestionEditorPage exam={questionExam} room={questionRoom} section={questionSection} question={question} answerKey={question ? data.keys.find(item => item.question_id === question.id) : undefined} data={data} navigate={navigate} onSaved={async savedQuestionId => { const wasNew = !question; await refresh(question ? "Đã lưu câu hỏi." : "Đã thêm câu hỏi vào phần thi."); if (wasNew && savedQuestionId) navigate(`/admin/exams/${savedQuestionId}`); }} />;
  else content = <ErrorState message="Không tìm thấy route khảo thí này." onRetry={() => navigate("/admin/exams")} />;

  return <div className="admin-exam-route-shell">
    {notice && <div className="admin-route-notice"><Check/>{notice}<button onClick={() => setNotice("")} aria-label="Đóng thông báo"><X/></button></div>}
    {error && <div className="admin-route-error">{error}</div>}
    {content}
  </div>;
}

function ErrorState({ message, onRetry }: { message: string; onRetry: () => void }) {
  return <section className="admin-route-empty"><TerminalSquare/><h2>Chưa thể mở workspace</h2><p>{message}</p><button className="workspace-button primary" onClick={onRetry}>Thử lại</button></section>;
}

function PageHeader({ eyebrow, title, description, back, actions }: { eyebrow: string; title: string; description?: string; back?: () => void; actions?: React.ReactNode }) {
  return <header className="workspace-page-header"><div className="workspace-heading-wrap">{back && <button className="workspace-back" onClick={back}><ArrowLeft/>Quay lại</button>}<span className="editor-eyebrow">{eyebrow}</span><h1>{title}</h1>{description && <p>{description}</p>}</div>{actions && <div className="workspace-header-actions">{actions}</div>}</header>;
}

function RoomCatalog({ data, navigate }: { data: DataState; navigate: (path: string) => void }) {
  const [typeFilter, setTypeFilter] = useState("ALL");
  const rooms = useMemo(() => typeFilter === "ALL" ? data.rooms : data.rooms.filter(room => room.exam_type.toUpperCase() === typeFilter), [data.rooms, typeFilter]);
  return <div className="workspace-page">
    <PageHeader eyebrow="THƯ VIỆN PHÒNG THI" title="Phòng thi chuẩn hoá" description="Tạo phòng theo cấu trúc TSA, HSA, V-SAT hoặc THPTQG, rồi thêm các phiên bản đề để soạn nội dung." actions={<Link className="workspace-button primary" href="/admin/exams/rooms/new" onClick={event => { event.preventDefault(); navigate("/admin/exams/rooms/new"); }}><Plus aria-hidden="true"/>Tạo phòng thi</Link>} />
    <div className="workspace-filter-row"><div><b>Phòng thi theo loại</b><span>Chọn một loại cấu trúc để mở phòng, phiên bản đề và câu hỏi.</span></div><div className="workspace-pills" role="tablist" aria-label="Lọc phòng thi theo loại"><button type="button" role="tab" aria-selected={typeFilter === "ALL"} className={typeFilter === "ALL" ? "active" : ""} onClick={() => setTypeFilter("ALL")}>Tất cả <small>{data.rooms.length}</small></button>{EXAM_ROOM_TYPE_OPTIONS.map(option => <button type="button" role="tab" aria-selected={typeFilter === option.value} key={option.value} className={typeFilter === option.value ? "active" : ""} onClick={() => setTypeFilter(option.value)}>{option.label} <small>{data.rooms.filter(room => room.exam_type.toUpperCase() === option.value).length}</small></button>)}</div></div>
    {rooms.length ? <div className="room-catalog-grid">{rooms.map(room => {
      const exams = data.exams.filter(exam => exam.room_id === room.id);
      const completedExams = exams.filter(exam => data.sections.filter(section => section.exam_id === exam.id).some(section => data.questions.some(question => question.section_id === section.id))).length;
      const roomType = normalizeExamType(room.exam_type).toLowerCase();
      return <article className={`exam-room-card reference-room-card admin-reference-room-card exam-theme-${roomType}`} data-exam-type={roomType} key={room.id}>
        <div className="admin-room-card-main"><div className="reference-room-card-title"><span className="exam-type-badge">{room.exam_type}</span><h2>{room.title}</h2></div>
        <div className="reference-room-card-body">
          <AdminRoomMeta icon={CheckCircle2} label="Trạng thái" value={room.published ? "Đã xuất bản" : "Bản nháp"} />
          <AdminRoomMeta icon={Layers3} label="Số lượng đề" value={`${exams.length} đề`} />
      <AdminRoomMeta icon={LayoutList} label="Cấu trúc" value={exams.length ? (normalizeExamType(room.exam_type) === "THPTQG" ? "1–8 môn / đề" : "1–3 phần / đề") : "Chưa có đề"} />
          <AdminRoomMeta icon={FileText} label="Quyền truy cập" value={room.access_mode === "open" ? "Mọi học viên" : "Theo phân quyền"} />
        </div></div>
        <div className="reference-room-card-footer"><div className="reference-room-completion"><div><span>Hoàn thành</span><b>{completedExams}/{exams.length} đề</b></div><div className="exam-progress"><span style={{ width: `${exams.length ? completedExams / exams.length * 100 : 0}%` }} /></div></div><Link href={`/admin/exams/rooms/${encodeURIComponent(room.id)}`} onClick={event => { event.preventDefault(); navigate(`/admin/exams/rooms/${encodeURIComponent(room.id)}`); }}>Mở phòng <ChevronRight aria-hidden="true"/></Link></div>
      </article>;
    })}</div> : <section className="admin-route-empty"><FolderOpen aria-hidden="true"/><h2>Chưa có phòng thi</h2><p>Tạo phòng thi chuẩn hoá đầu tiên, sau đó thêm phiên bản đề để bắt đầu soạn câu hỏi.</p><Link className="workspace-button primary" href="/admin/exams/rooms/new" onClick={event => { event.preventDefault(); navigate("/admin/exams/rooms/new"); }}><Plus aria-hidden="true"/>Tạo phòng thi</Link></section>}
    <ExamHistoryCleanup />
  </div>;
}

function ExamHistoryCleanup() {
  const [attemptCount, setAttemptCount] = useState<number | null>(null);
  const [loading, setLoading] = useState(true);
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");

  const loadCount = useCallback(async () => {
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/admin/exam-history", { cache: "no-store" });
      const payload = await response.json().catch(() => ({})) as { count?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Không thể tải số lượng lịch sử thi.");
      setAttemptCount(typeof payload.count === "number" ? payload.count : 0);
      setError("");
    } catch (value) {
      setAttemptCount(null);
      setError(value instanceof Error ? value.message : "Không thể tải số lượng lịch sử thi.");
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadCount();
  }, [loadCount]);

  async function deleteHistory() {
    if (deleting) return;
    const count = attemptCount ?? 0;
    if (!count) {
      setNotice("Hiện không có lịch sử thi để xoá.");
      return;
    }
    if (!window.confirm(`Xoá toàn bộ ${count} lượt thi, bao gồm cả phiên đang làm dở? Thao tác này không thể hoàn tác.`)) return;

    setDeleting(true);
    setError("");
    setNotice("");
    try {
      const response = await authenticatedFetch("/api/admin/exam-history", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "delete_all", confirm: true }),
      });
      const payload = await response.json().catch(() => ({})) as { deleted?: number; error?: string };
      if (!response.ok) throw new Error(payload.error || "Không thể xóa lịch sử thi.");
      setAttemptCount(0);
      setNotice(`Đã xoá ${typeof payload.deleted === "number" ? payload.deleted : count} lượt thi. Những lượt thi mới sẽ được ghi lại bình thường.`);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể xóa lịch sử thi.");
    }
    setDeleting(false);
  }

  return <details className="history-cleanup-disclosure">
    <summary><span className="history-cleanup-summary-icon"><Trash2 aria-hidden="true"/></span><span><b>Công cụ dữ liệu kiểm thử</b><small>Chỉ mở khi cần làm sạch toàn bộ lịch sử thi.</small></span><strong>{loading ? "…" : attemptCount === null ? "—" : attemptCount.toLocaleString("vi-VN")} lượt</strong><ChevronRight aria-hidden="true"/></summary>
    <section className="history-cleanup-card" aria-labelledby="history-cleanup-title">
    <div className="history-cleanup-heading">
      <div className="history-cleanup-title">
        <span className="history-cleanup-icon"><Trash2/></span>
        <div><span className="editor-eyebrow">DỌN DỮ LIỆU TEST</span><h2 id="history-cleanup-title">Xoá lịch sử thi</h2><p>Dùng khi đang kiểm thử để làm gọn bảng lịch sử. Tính năng thi vẫn hoạt động và sẽ tạo lịch sử mới sau lần nộp bài tiếp theo.</p></div>
      </div>
      <div className="history-cleanup-count"><b>{loading ? "…" : attemptCount === null ? "—" : attemptCount.toLocaleString("vi-VN")}</b><small>lượt thi trong cơ sở dữ liệu</small></div>
    </div>
    <div className="history-cleanup-body">
      <div className="history-cleanup-warning"><strong>Lưu ý trước khi xoá</strong><span>Thao tác sẽ xoá tất cả lượt đã nộp và phiên đang làm dở của mọi học viên.</span></div>
      <div className="history-cleanup-actions"><button type="button" className="workspace-button danger" onClick={() => void deleteHistory()} disabled={loading || deleting || attemptCount === null || attemptCount === 0}><Trash2/>{deleting ? "Đang xoá…" : "Xoá toàn bộ lịch sử"}</button><button type="button" className="workspace-text-button" onClick={() => void loadCount()} disabled={loading || deleting}>Cập nhật số lượng</button></div>
    </div>
    {error && <p className="history-cleanup-message error" role="alert">Không thể tải hoặc xoá lịch sử: {error}</p>}
    {notice && <p className="history-cleanup-message success" role="status">{notice}</p>}
    </section>
  </details>;
}

function AdminRoomMeta({ icon: Icon, label, value }: { icon: typeof Clock3; label: string; value: string }) {
  return <div className="exam-meta-item"><span><Icon/><small>{label}</small></span><b>{value}</b></div>;
}

function defaultRoomTitle(examType: string) {
  return `Phòng ${roomTypeLabel(examType)}`;
}

function defaultRoomDescription(examType: string) {
  return `Kho đề luyện tập theo cấu trúc ${roomTypeLabel(examType)}.`;
}

function RoomStandardProfile({ examType }: { examType: string }) {
  const normalizedType = normalizeExamType(examType);
  const templates = sectionTemplatesForExamType(examType);
  const isCustom = normalizedType === "OTHER";
  return <section className="room-standard-profile" aria-labelledby="room-standard-profile-title">
    <div className="room-standard-profile-head">
      <div><span className="editor-eyebrow">CẤU TRÚC ÁP DỤNG</span><h3 id="room-standard-profile-title">Mẫu {roomTypeLabel(examType)}</h3></div>
      <span className={`room-standard-profile-badge${isCustom ? " is-custom" : ""}`}>{isCustom ? "Tùy chỉnh" : "Mẫu chuẩn"}</span>
    </div>
    <p>{isCustom ? "Phòng bắt đầu với ba phần mẫu; bạn có thể điều chỉnh khi tạo đề." : "Mẫu này sẽ được dùng để khởi tạo các phần hoặc môn khi bạn tạo phiên bản đề."}</p>
    <div className="room-standard-profile-list">
      {templates.map((template, index) => {
        const details = [
          template.duration_minutes ? `${template.duration_minutes} phút` : "Theo cấu hình đề",
          "question_count" in template && template.question_count ? `${template.question_count} câu` : "",
          "structure" in template ? template.structure : "",
        ].filter(Boolean).join(" · ");
        return <div className="room-standard-profile-item" key={`${template.title}-${index}`}>
          <span className="room-standard-profile-number">{index + 1}</span>
          <div><b>{template.title}</b><small>{details}</small></div>
        </div>;
      })}
    </div>
  </section>;
}

type RoomFormValues = Pick<Room, "title" | "description" | "exam_type" | "access_mode" | "registration_start" | "registration_end" | "exam_start" | "exam_end" | "published">;

function localDateValue(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function RoomFormPage({ room, navigate, onSaved }: { room?: Room; navigate: (path: string) => void; onSaved: (id?: string) => Promise<void> }) {
  const initialExamType = room?.exam_type ?? DEFAULT_EXAM_ROOM_TYPE;
  const [form, setForm] = useState<RoomFormValues>({
    title: room?.title ?? defaultRoomTitle(initialExamType),
    description: room?.description ?? defaultRoomDescription(initialExamType),
    exam_type: initialExamType,
    access_mode: room?.access_mode ?? "open",
    registration_start: room?.registration_start ?? null,
    registration_end: room?.registration_end ?? null,
    exam_start: room?.exam_start ?? null,
    exam_end: room?.exam_end ?? null,
    published: room?.published ?? false,
  });
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [titleEdited, setTitleEdited] = useState(Boolean(room));
  const [descriptionEdited, setDescriptionEdited] = useState(Boolean(room));
  const isEditing = Boolean(room);

  const setField = <K extends keyof RoomFormValues>(field: K, value: RoomFormValues[K]) => setForm(previous => ({ ...previous, [field]: value }));
  const setDate = (field: "registration_start" | "registration_end" | "exam_start" | "exam_end", value: string) => setField(field, value ? new Date(value).toISOString() : null);
  const setExamType = (value: string) => {
    setField("exam_type", value);
    if (!room && !titleEdited) setField("title", defaultRoomTitle(value));
    if (!room && !descriptionEdited) setField("description", defaultRoomDescription(value));
  };

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (!form.title.trim()) { setError("Hãy đặt tên cho phòng thi."); return; }
    setSaving(true); setError("");
    const payload = { ...form, title: form.title.trim(), description: form.description.trim(), exam_type: form.exam_type.trim().toUpperCase() || DEFAULT_EXAM_ROOM_TYPE };
    const result = room
      ? await supabase.from("exam_rooms").update(payload).eq("id", room.id).select("id").single()
      : await supabase.from("exam_rooms").insert({ ...payload, sort_order: 0 }).select("id").single();
    setSaving(false);
    if (result.error || !result.data?.id && !room) { setError(result.error?.message ?? "Không thể lưu phòng thi."); return; }
    await onSaved(result.data?.id ?? room?.id);
  }

  return <div className={`workspace-page room-form-page exam-theme-${normalizeExamType(form.exam_type).toLowerCase()}`} data-exam-type={normalizeExamType(form.exam_type).toLowerCase()}>
    <PageHeader eyebrow={isEditing ? "CẤU HÌNH PHÒNG THI" : "PHÒNG THI CHUẨN HOÁ MỚI"} title={isEditing ? "Cập nhật phòng thi" : "Tạo phòng thi chuẩn hoá"} description="Chọn một cấu trúc chuẩn, sau đó thêm các phiên bản đề và câu hỏi trong workspace." back={() => navigate(room ? `/admin/exams/rooms/${room.id}` : "/admin/exams")} />
    <form className="workspace-form-card room-form-card" onSubmit={submit}>
      <div className="form-card-heading"><div><span className="form-step">01</span><div><h2>Thông tin phòng</h2><p>Phòng là thư viện nội dung; các phiên bản đề được soạn sau khi tạo.</p></div></div><span className="form-required">* Bắt buộc</span></div>
      <div className="workspace-form-grid two-col"><label>Tên phòng *<input value={form.title} onChange={event => { setTitleEdited(true); setField("title", event.target.value); }} placeholder="Phòng TSA" required /></label><label>Loại phòng *<select value={form.exam_type} onChange={event => setExamType(event.target.value)}>{EXAM_ROOM_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label} — {option.description}</option>)}</select></label></div>
      <label>Mô tả ngắn<textarea value={form.description} onChange={event => { setDescriptionEdited(true); setField("description", event.target.value); }} rows={3} placeholder="Ví dụ: Kho đề TSA tham khảo, mỗi đề có thể gồm một hoặc nhiều phần..." /></label>
      <RoomStandardProfile examType={form.exam_type} />
      <div className="workspace-form-grid two-col"><label>Quyền truy cập<select value={form.access_mode} onChange={event => setField("access_mode", event.target.value as RoomFormValues["access_mode"])}><option value="open">Mọi học viên đã đăng nhập</option><option value="assigned">Chỉ học viên được phân quyền</option></select><small>Phân quyền chi tiết được quản lý ở tab Phân quyền.</small></label><label className="checkbox-card"><input type="checkbox" checked={form.published} onChange={event => setField("published", event.target.checked)} /><span><b>Xuất bản phòng</b><small>Học viên có thể nhìn thấy phòng và các đề đã xuất bản.</small></span></label></div>
      <div className="form-section-divider"><span>Lịch đăng ký và lịch thi (không bắt buộc)</span></div>
      <div className="workspace-form-grid four-col"><label>Mở đăng ký<input type="datetime-local" value={localDateValue(form.registration_start)} onChange={event => setDate("registration_start", event.target.value)} /></label><label>Đóng đăng ký<input type="datetime-local" value={localDateValue(form.registration_end)} onChange={event => setDate("registration_end", event.target.value)} /></label><label>Bắt đầu thi<input type="datetime-local" value={localDateValue(form.exam_start)} onChange={event => setDate("exam_start", event.target.value)} /></label><label>Kết thúc thi<input type="datetime-local" value={localDateValue(form.exam_end)} onChange={event => setDate("exam_end", event.target.value)} /></label></div>
      {error && <p className="form-error">{error}</p>}
      <footer className="workspace-form-footer"><button type="button" className="workspace-button ghost" onClick={() => navigate(room ? `/admin/exams/rooms/${room.id}` : "/admin/exams")}>Hủy</button><button className="workspace-button primary" disabled={saving}><Save/>{saving ? "Đang lưu…" : isEditing ? "Lưu thông tin phòng" : "Tạo phòng và mở workspace"}</button></footer>
    </form>
  </div>;
}

function RoomWorkspace({ room, data, navigate, onChanged }: { room: Room; data: DataState; navigate: (path: string) => void; onChanged: (message?: string) => Promise<void> }) {
  const exams = data.exams.filter(exam => exam.room_id === room.id);
  const questionCount = exams.reduce((total, exam) => total + data.sections.filter(section => section.exam_id === exam.id).reduce((partTotal, section) => partTotal + data.questions.filter(question => question.section_id === section.id).length, 0), 0);
  async function deleteRoom() {
    if (!supabase || !window.confirm("Xóa phòng này và toàn bộ đề bên trong?")) return;
    const result = await supabase.from("exam_rooms").delete().eq("id", room.id);
    if (result.error) window.alert(result.error.message);
    else { await onChanged("Đã xóa phòng khảo thí."); navigate("/admin/exams"); }
  }
  async function deleteExam(exam: Exam) {
    if (!supabase || !window.confirm(`Xóa đề “${exam.title}” và toàn bộ môn, câu hỏi bên trong?`)) return;
    const result = await supabase.from("exams").delete().eq("id", exam.id);
    if (result.error) window.alert(result.error.message);
    else await onChanged(`Đã xóa đề “${exam.title}”.`);
  }
  const roomType = normalizeExamType(room.exam_type).toLowerCase();
  return <div className={`workspace-page room-workspace-page exam-theme-${roomType}`} data-exam-type={roomType}>
    <PageHeader eyebrow={`${room.exam_type} · NỘI DUNG ĐỀ THI`} title={room.title} description={room.description} back={() => navigate("/admin/exams")} actions={<><button className="workspace-button ghost" onClick={() => navigate(`/admin/exams/rooms/${room.id}/edit`)}><Settings2/>Thông tin bộ đề</button><button className="workspace-button primary" onClick={() => navigate(`/admin/exams/rooms/${room.id}/exams/new`)}><FilePlus2/>Tạo phiên bản đề</button><button type="button" className="workspace-danger-link room-delete-action" title="Xóa bộ đề và toàn bộ phiên bản bên trong" aria-label="Xóa bộ đề và toàn bộ phiên bản bên trong" onClick={() => void deleteRoom()}><Trash2/>Xóa bộ đề</button></>} />
    <section className="room-workspace-hero"><div className="room-hero-type"><span>{room.exam_type}</span><b>{room.published ? "Đã xuất bản" : "Bản nháp"}</b></div><div className="room-hero-stats"><span><b>{exams.length}</b><small>phiên bản đề</small></span><span><b>{normalizeExamType(room.exam_type) === "THPTQG" ? "1–8" : "1–3"}</b><small>{normalizeExamType(room.exam_type) === "THPTQG" ? "môn / đề" : "phần / đề"}</small></span><span><b>{questionCount}</b><small>câu hỏi đã soạn</small></span><span><b>{room.access_mode === "open" ? "Mở" : "Riêng"}</b><small>quyền truy cập</small></span></div></section>
    <section className="room-exam-catalog"><div className="room-exam-list-head"><div><span className="editor-eyebrow">CÁC PHIÊN BẢN ĐỀ</span><h2>Các phiên bản đề <small>{exams.length}</small></h2></div></div>{exams.length ? <div className="exam-package-grid">{exams.map(exam => <ExamPackageCard key={exam.id} exam={exam} data={data} navigate={navigate} onDelete={() => void deleteExam(exam)} />)}</div> : <section className="admin-route-empty compact"><FileText/><h2>Bộ đề chưa có phiên bản</h2><p>Tạo phiên bản đầu tiên để bắt đầu soạn câu hỏi.</p><button className="workspace-button primary" onClick={() => navigate(`/admin/exams/rooms/${room.id}/exams/new`)}><Plus/>Tạo phiên bản đầu tiên</button></section>}</section>
  </div>;
}

function ExamPackageCard({ exam, data, navigate, onDelete }: { exam: Exam; data: DataState; navigate: (path: string) => void; onDelete: () => void }) {
  const sections = data.sections.filter(section => section.exam_id === exam.id).sort((a, b) => a.sort_order - b.sort_order);
  const isIndependent = normalizeExamType(exam.exam_type) === "THPTQG" || normalizeExamType(exam.exam_type) === "VSAT";
  const examType = normalizeExamType(exam.exam_type).toLowerCase();
  return <article className={`exam-paper-card reference-exam-card admin-reference-exam-card exam-theme-${examType}`} data-exam-type={examType}>
    <div className="reference-exam-card-head"><h3 title={exam.title}>{exam.title}</h3></div>
    <div className="reference-exam-card-body">
      <div><span>Trạng thái:</span><b className={`reference-exam-status ${exam.published ? "admin-status-live" : "admin-status-draft"}`}>{exam.published ? "Đã xuất bản" : "Bản nháp"}</b></div>
      <div><span>{isIndependent ? "Môn thi:" : "Số phần thi:"}</span><strong>{sections.length} {isIndependent ? "môn" : "phần"}</strong></div>
      <div><span>Hình thức:</span><strong>{exam.mode === "scheduled" ? "Theo lịch" : "Luyện tập"}</strong></div>
      <div><span>Ngày tạo:</span><strong>{exam.created_at ? formatDate(exam.created_at) : "—"}</strong></div>
    </div>
    <div className="reference-exam-card-footer">
      <button type="button" className="reference-exam-start" onClick={() => navigate(`/admin/exams/${exam.id}`)}><Pencil/>Soạn đề</button><button type="button" className="workspace-danger-link exam-delete-button" onClick={onDelete} title="Xóa đề và toàn bộ nội dung" aria-label={`Xóa đề ${exam.title}`}><Trash2/>Xóa</button>
    </div>
  </article>;
}

type ExamFormValues = Pick<Exam, "title" | "description" | "dashboard_title" | "exam_type" | "mode" | "duration_minutes" | "published">;

function ExamFormPage({ room, exams, navigate, onSaved }: { room: Room; exams: Exam[]; navigate: (path: string) => void; onSaved: (id: string) => Promise<void> }) {
  const [form, setForm] = useState<ExamFormValues>({ title: `Đề Số ${String(exams.length + 1).padStart(2, "0")}`, description: `Đề ${room.exam_type} có thể gồm một hoặc nhiều phần thi.`, dashboard_title: normalizeExamType(room.exam_type) === "THPTQG" ? "KỲ THI TỐT NGHIỆP THPT 2027" : "", exam_type: room.exam_type, mode: "free", duration_minutes: room.exam_type.toUpperCase() === "TSA" ? 150 : 90, published: false });
  const [selectedSubjectCodes, setSelectedSubjectCodes] = useState<string[]>([]);
  const [selectedVsatSubjectCodes, setSelectedVsatSubjectCodes] = useState<string[]>(() => VSAT_SUBJECT_TEMPLATES.map(template => template.code));
  const [selectedHsaSectionTitles, setSelectedHsaSectionTitles] = useState<string[]>(() => HSA_SECTION_TEMPLATES.map(template => template.title));
  const [hsaVersion, setHsaVersion] = useState<HsaStructureVersion>("HSA-2026");
  const [hsaSelectionMode, setHsaSelectionMode] = useState<Exclude<HsaSelectionMode, "custom">>("science");
  const [hsaScienceSubjectCodes, setHsaScienceSubjectCodes] = useState<HsaScienceSubjectCode[]>(["vatly", "hoahoc", "sinhhoc"]);
  const [selectedTsaSectionTitles, setSelectedTsaSectionTitles] = useState<string[]>(() => TSA_SECTION_TEMPLATES.map(template => template.title));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const isThptqg = normalizeExamType(form.exam_type) === "THPTQG";
  const isTsa = normalizeExamType(form.exam_type) === "TSA";
  const isHsa = normalizeExamType(form.exam_type) === "HSA";
  const isVsat = normalizeExamType(form.exam_type) === "VSAT";
  const templates = sectionTemplatesForExamType(form.exam_type).filter(template => isThptqg
    ? selectedSubjectCodes.includes("code" in template ? template.code : "")
    : isTsa ? selectedTsaSectionTitles.includes(template.title)
      : isHsa ? selectedHsaSectionTitles.includes(template.title)
        : isVsat ? selectedVsatSubjectCodes.includes("code" in template ? template.code : "")
          : true);
  const hsaSections = templates.map(template => ({
    title: template.title,
    duration_minutes: template.duration_minutes ?? 1,
    question_count: "question_count" in template ? template.question_count : null,
    structure: "structure" in template ? template.structure : "Cấu trúc tùy chỉnh",
  }));
  const hsaSelection = {
    mode: hsaSelectionMode,
    subjects: hsaSelectionMode === "science" ? hsaScienceSubjectCodes : [],
    label: hsaSelectionMode === "english" ? "Tiếng Anh · mã HSA-F" : "Khoa học · chọn 3/5 chủ đề",
  };
  const setField = <K extends keyof ExamFormValues>(field: K, value: ExamFormValues[K]) => setForm(previous => ({ ...previous, [field]: value }));

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    if (!form.title.trim()) { setError("Hãy đặt tên cho đề thi."); return; }
    if (isThptqg && !selectedSubjectCodes.length) { setError("Hãy chọn ít nhất một môn trong cụm đề THPTQG."); return; }
    if (isTsa && !templates.length) { setError("Hãy chọn ít nhất một phần của đề TSA."); return; }
    if (isHsa && !templates.length) { setError("Hãy chọn ít nhất một phần của cấu trúc HSA."); return; }
    if (isVsat && !templates.length) { setError("Hãy chọn ít nhất một môn V-SAT."); return; }
    if (isHsa && hsaSelectionMode === "science" && hsaScienceSubjectCodes.length !== 3) { setError("Phần 3 HSA Khoa học phải chọn đúng 3 trong 5 chủ đề."); return; }
    setSaving(true); setError("");
    const examDuration = isThptqg || isVsat ? Math.max(...templates.map(template => template.duration_minutes || 1), 1) : isHsa ? hsaTotalDuration({ ...defaultHsaStructureConfig(hsaVersion), sections: hsaSections }) : form.duration_minutes;
    const structureConfig = isHsa ? { ...defaultHsaStructureConfig(hsaVersion), selection: hsaSelection, sections: hsaSections } : {};
    const requestedPublish = form.published;
    // Always create the content as a draft first. Publishing is a separate,
    // preflight-gated transition so a newly created empty/partial exam can
    // never become visible just because the checkbox was selected.
    const dashboardTitle = form.dashboard_title?.trim() || (isThptqg ? "KỲ THI TỐT NGHIỆP THPT 2027" : form.title.trim() || "ĐỀ THI");
    const examResult = await supabase.from("exams").insert({ ...form, published: false, structure_config: structureConfig, dashboard_title: dashboardTitle, duration_minutes: examDuration, title: form.title.trim(), description: form.description.trim(), exam_type: form.exam_type.trim().toUpperCase() || room.exam_type, room_id: room.id, sort_order: exams.length }).select("id").single();
    if (examResult.error || !examResult.data?.id) { setSaving(false); setError(examResult.error?.message ?? "Không thể tạo đề thi."); return; }
    const sectionResult = await supabase.from("exam_sections").insert(templates.map((template, index) => ({ exam_id: examResult.data.id, title: template.title, duration_minutes: template.duration_minutes, subject_code: "code" in template ? template.code : null, sort_order: index })));
    if (sectionResult.error) { await supabase.from("exams").delete().eq("id", examResult.data.id); setSaving(false); setError(`Không thể tạo các môn của đề: ${sectionResult.error.message}${/subject_code|section_id|schema cache/i.test(sectionResult.error.message) ? " · Hãy chạy supabase/migrations/013_thptqg_schema_compat.sql rồi tải lại trang." : ""}`); return; }
    if (requestedPublish) {
      try {
        const preflightResponse = await authenticatedFetch(`/api/admin/exam-policy?examId=${encodeURIComponent(examResult.data.id)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "preflight", examId: examResult.data.id }),
        });
        const preflight = await preflightResponse.json().catch(() => ({})) as { error?: string; canPublish?: boolean; checks?: Array<{ level?: string; message?: string }> };
        if (!preflightResponse.ok || !preflight.canPublish) {
          const firstError = preflight.checks?.find(check => check.level === "error")?.message;
          setSaving(false);
          setError(`Bản nháp đã được tạo nhưng chưa thể xuất bản. ${firstError || preflight.error || "Đề chưa đạt preflight."}`);
          return;
        }
      } catch (value) {
        setSaving(false);
        setError(`Bản nháp đã được tạo nhưng chưa thể kiểm tra preflight. ${value instanceof Error ? value.message : "Hãy mở lại đề để kiểm tra và xuất bản sau."}`);
        return;
      }
      const publishResponse = await authenticatedFetch("/api/admin/exam-policy", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ action: "publish_exam", examId: examResult.data.id }),
      });
      const publishPayload = await publishResponse.json().catch(() => ({})) as { error?: string; published?: boolean; checks?: Array<{ level?: string; message?: string }> };
      if (!publishResponse.ok || !publishPayload.published) {
        setSaving(false);
        const firstError = publishPayload.checks?.find(check => check.level === "error")?.message;
        setError(`Bản nháp đã được tạo nhưng chưa thể xuất bản: ${firstError || publishPayload.error || "Lỗi server khi chuyển trạng thái."}`);
        return;
      }
    }
    setSaving(false);
    await onSaved(examResult.data.id);
  }

  return <div className={`workspace-page exam-create-page exam-theme-${normalizeExamType(form.exam_type).toLowerCase()}`} data-exam-type={normalizeExamType(form.exam_type).toLowerCase()}>
    <PageHeader eyebrow={`${room.exam_type} · BÀI THI MỚI`} title="Tạo một đề thi trong phòng" description={`Phòng “${room.title}” có thể chứa nhiều đề. ${isThptqg ? "Đề THPTQG sẽ có các môn bạn tích chọn." : isTsa ? "Đề TSA có thể chọn một hoặc nhiều phần để soạn." : "Đề có thể gồm một hoặc nhiều phần."}`} back={() => navigate(`/admin/exams/rooms/${room.id}`)} />
    <div className="exam-create-layout"><form className="workspace-form-card" onSubmit={submit}>
      <div className="form-card-heading"><div><span className="form-step">01</span><div><h2>Thông tin đề</h2><p>Các trường này hiển thị trên card đề của học viên.</p></div></div><span className="form-required">* Bắt buộc</span></div>
      <label>Tên đề thi *<input value={form.title} onChange={event => setField("title", event.target.value)} placeholder="Đề Số 01" required /></label><label>Mô tả<textarea rows={4} value={form.description} onChange={event => setField("description", event.target.value)} /></label>{isThptqg && <label>Tiêu đề trang chọn môn<input value={form.dashboard_title ?? ""} onChange={event => setField("dashboard_title", event.target.value)} placeholder="KỲ THI TỐT NGHIỆP THPT 2027" /><small>Hiển thị ở đầu trang danh sách 8 môn của thí sinh.</small></label>}
      <div className="workspace-form-grid two-col"><label>Loại kỳ thi<select value={form.exam_type} onChange={event => { setField("exam_type", event.target.value); setField("duration_minutes", event.target.value === "TSA" ? 150 : 90); }}>{EXAM_ROOM_TYPE_OPTIONS.map(option => <option key={option.value} value={option.value}>{option.label}</option>)}</select></label>{isThptqg || isHsa || isVsat ? <div className="workspace-duration-note"><span>Thời lượng làm bài</span><b>{isHsa ? `${templates.reduce((total, template) => total + (template.duration_minutes || 0), 0)} phút theo các phần` : isVsat ? "Theo từng môn độc lập" : "Theo từng môn đã chọn"}</b><small>{templates.length ? templates.map(template => `${template.title}: ${template.duration_minutes} phút`).join(" · ") : "Chưa chọn cấu trúc"}</small></div> : <label>Tổng thời lượng (phút)<input type="number" min={1} value={form.duration_minutes} onChange={event => setField("duration_minutes", Number(event.target.value))} required /></label>}</div>
      {isThptqg && <fieldset className="workspace-subject-picker"><legend>Chọn các môn có trong cụm thi</legend><p>Tích các môn sẽ xuất hiện ở trang chọn môn của học viên. Mỗi môn có lượt làm bài và kết quả riêng.</p><div>{THPTQG_SUBJECT_TEMPLATES.map(subject => <label key={subject.code}><input type="checkbox" checked={selectedSubjectCodes.includes(subject.code)} onChange={event => setSelectedSubjectCodes(previous => event.target.checked ? [...previous, subject.code] : previous.filter(code => code !== subject.code))}/><span><b>{subject.title}</b><small>{subject.duration_minutes} phút · {subject.structure}</small></span></label>)}</div></fieldset>}
      {isTsa && <fieldset className="workspace-subject-picker"><legend>Chọn các phần có trong đề TSA</legend><p>Không bắt buộc phải đủ cả Toán học, Đọc hiểu và Khoa học; có thể chọn một hoặc nhiều phần.</p><div>{TSA_SECTION_TEMPLATES.map(template => <label key={template.title}><input type="checkbox" checked={selectedTsaSectionTitles.includes(template.title)} onChange={event => setSelectedTsaSectionTitles(previous => event.target.checked ? [...previous, template.title] : previous.filter(title => title !== template.title))}/><span><b>{template.title}</b><small>{template.duration_minutes} phút</small></span></label>)}</div></fieldset>}
      {isHsa && <fieldset className="workspace-subject-picker"><legend>Cấu trúc HSA</legend><p>HSA 2026 là mốc chính thức; HSA 2027 hiện là cấu hình đề xuất để tham khảo và có thể chỉnh lại sau khi tạo đề.</p><label className="structure-version-field">Phiên bản cấu trúc<select value={hsaVersion} onChange={event => setHsaVersion(event.target.value as HsaStructureVersion)}><option value="HSA-2026">HSA 2026 · chính thức</option><option value="HSA-2027">HSA 2027 · đề xuất</option></select></label><div className="structure-version-note">{defaultHsaStructureConfig(hsaVersion).note}</div><div className="hsa-selection-mode"><span>Phần 3 · lựa chọn</span><label><input type="radio" name="new-hsa-selection" checked={hsaSelectionMode === "science"} onChange={() => setHsaSelectionMode("science")}/><span><b>Khoa học</b><small>Chọn đúng 3 trong 5 chủ đề</small></span></label><label><input type="radio" name="new-hsa-selection" checked={hsaSelectionMode === "english"} onChange={() => setHsaSelectionMode("english")}/><span><b>Tiếng Anh · HSA-F</b><small>Đánh giá năng lực ngôn ngữ</small></span></label>{hsaSelectionMode === "science" && <div className="hsa-science-subjects">{HSA_SCIENCE_SUBJECTS.map(subject => <label key={subject.code}><input type="checkbox" checked={hsaScienceSubjectCodes.includes(subject.code)} disabled={!hsaScienceSubjectCodes.includes(subject.code) && hsaScienceSubjectCodes.length >= 3} onChange={event => setHsaScienceSubjectCodes(previous => event.target.checked ? [...previous, subject.code] : previous.filter(code => code !== subject.code))}/><span>{subject.title}</span></label>)}</div>}</div><div>{HSA_SECTION_TEMPLATES.map(template => <label key={template.title}><input type="checkbox" checked={selectedHsaSectionTitles.includes(template.title)} onChange={event => setSelectedHsaSectionTitles(previous => event.target.checked ? [...previous, template.title] : previous.filter(title => title !== template.title))}/><span><b>{template.title}</b><small>{template.duration_minutes} phút · {template.question_count == null ? "50/51 câu tùy tổ hợp" : `${template.question_count} câu`} · {template.structure}</small></span></label>)}</div></fieldset>}
      {isVsat && <fieldset className="workspace-subject-picker"><legend>Chọn môn V-SAT</legend><p>V-SAT gồm các môn độc lập; mỗi môn có thể tạo một lượt thi và kết quả riêng.</p><div>{VSAT_SUBJECT_TEMPLATES.map(subject => <label key={subject.code}><input type="checkbox" checked={selectedVsatSubjectCodes.includes(subject.code)} onChange={event => setSelectedVsatSubjectCodes(previous => event.target.checked ? [...previous, subject.code] : previous.filter(code => code !== subject.code))}/><span><b>{subject.title}</b><small>{subject.duration_minutes} phút · {subject.structure}</small></span></label>)}</div></fieldset>}
      <div className="workspace-form-grid two-col"><label>Hình thức<select value={form.mode} onChange={event => setField("mode", event.target.value as ExamFormValues["mode"])}><option value="free">Tự do / luyện tập</option><option value="scheduled">Theo lịch phòng</option></select></label><label className="checkbox-card"><input type="checkbox" checked={form.published} onChange={event => setField("published", event.target.checked)} /><span><b>Xuất bản ngay</b><small>Có thể tắt lại trong workspace đề.</small></span></label></div>
      {error && <p className="form-error">{error}</p>}<footer className="workspace-form-footer"><button type="button" className="workspace-button ghost" onClick={() => navigate(`/admin/exams/rooms/${room.id}`)}>Hủy</button><button className="workspace-button primary" disabled={saving}><FilePlus2/>{saving ? "Đang tạo…" : isThptqg ? templates.length ? `Tạo đề gồm ${templates.length} môn` : "Chọn môn để tạo" : isTsa ? templates.length ? `Tạo đề gồm ${templates.length} phần` : "Chọn phần để tạo" : "Tạo đề"}</button></footer>
    </form><aside className="structure-preview-card"><span className="editor-eyebrow">CẤU TRÚC SẼ TẠO</span><h2>{form.title || "Đề mới"}</h2><p>{isThptqg ? templates.length ? `Một đề duy nhất, ${templates.length} môn được chọn.` : "Chưa chọn môn nào." : isTsa ? templates.length ? `Một đề duy nhất, ${templates.length} phần được chọn.` : "Chưa chọn phần nào." : "Các phần thi theo cấu hình đề."}</p><div className="structure-preview-list">{templates.map((template, index) => <div key={template.title}><i>{index + 1}</i><span><b>{template.title}</b><small>{template.duration_minutes ? `${template.duration_minutes} phút` : "Theo cấu hình đề"}</small></span><Check/></div>)}</div><div className="structure-preview-tip"><Sparkles/> Sau khi tạo đề, hãy mở từng {isThptqg ? "môn" : "phần"} và bấm “Thêm câu hỏi” để vào trình soạn môi trường <code>ex</code>.</div></aside></div>
  </div>;
}

function ExamWorkspace({ exam, room, data, navigate, onChanged }: { exam: Exam; room: Room; data: DataState; navigate: (path: string) => void; onChanged: (message?: string) => Promise<void> }) {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [subjectsOpen, setSubjectsOpen] = useState(false);
  const [subjectCodes, setSubjectCodes] = useState<string[]>([]);
  const [savingSubjects, setSavingSubjects] = useState(false);
  const [savingExam, setSavingExam] = useState(false);
  const [activeSectionId, setActiveSectionId] = useState(data.sections.find(section => section.exam_id === exam.id)?.id ?? "");
  const [selectedQuestionId, setSelectedQuestionId] = useState("");
  const [draggedQuestionId, setDraggedQuestionId] = useState("");
  const [dragOverQuestionId, setDragOverQuestionId] = useState("");
  const [form, setForm] = useState<ExamFormValues>({ title: exam.title, description: exam.description, dashboard_title: exam.dashboard_title ?? (normalizeExamType(exam.exam_type) === "THPTQG" ? "KỲ THI TỐT NGHIỆP THPT 2027" : ""), exam_type: exam.exam_type, mode: exam.mode, duration_minutes: exam.duration_minutes, published: exam.published });
  const initialHsaConfig = normalizeHsaStructureConfig(exam.structure_config);
  const [hsaVersion, setHsaVersion] = useState<HsaStructureVersion>(() => initialHsaConfig.version);
  const [hsaSelectionMode, setHsaSelectionMode] = useState<HsaSelectionMode>(() => initialHsaConfig.selection.mode);
  const [hsaScienceSubjectCodes, setHsaScienceSubjectCodes] = useState<HsaScienceSubjectCode[]>(() => [...initialHsaConfig.selection.subjects]);
  const [hsaSelectionLabel, setHsaSelectionLabel] = useState(() => initialHsaConfig.selection.label);
  const [hsaAuthoringSubjectCode, setHsaAuthoringSubjectCode] = useState<HsaSubjectCode>("vatly");
  const sections = data.sections.filter(section => section.exam_id === exam.id).sort((a, b) => a.sort_order - b.sort_order);
  const isThptqg = normalizeExamType(exam.exam_type) === "THPTQG";
  const isHsa = normalizeExamType(exam.exam_type) === "HSA";
  const isVsat = normalizeExamType(exam.exam_type) === "VSAT";
  const isTsa = normalizeExamType(exam.exam_type) === "TSA";
  useEffect(() => {
    document.documentElement.dataset.examType = normalizeExamType(exam.exam_type).toLowerCase();
    return () => { delete document.documentElement.dataset.examType; };
  }, [exam.exam_type]);
  const hsaAuthoringEntries = sections.flatMap<{ part: Section; subject: (typeof HSA_PART3_SUBJECTS)[number] | null }>(part => isHsa && hsaPartForSectionTitle(part.title) === 3
    ? HSA_PART3_SUBJECTS.map(subject => ({ part, subject }))
    : [{ part, subject: null }]
  ).map((entry, index) => ({ ...entry, index }));
  const currentSubjectCodes = sections.map(section => thptqgSubjectForSection(section.subject_code, section.title)?.code || section.subject_code || "").filter(Boolean);
  const currentSubjectKey = currentSubjectCodes.join(",");
  const selectedSection = sections.find(section => section.id === activeSectionId) ?? sections[0] ?? null;
  const selectedSectionQuestions = selectedSection ? data.questions.filter(question => question.section_id === selectedSection.id).sort((a, b) => a.sort_order - b.sort_order) : [];
  const selectedSectionIsHsaPart3 = isHsa && hsaPartForSectionTitle(selectedSection?.title ?? "") === 3;
  const hsaPart3HasSubjectMarkers = selectedSectionIsHsaPart3 && selectedSectionQuestions.some(question => hsaSubjectCodeFromLatex(question.latex_source) !== null);
  const selectedHsaSubject = HSA_PART3_SUBJECTS.find(subject => subject.code === hsaAuthoringSubjectCode) ?? HSA_PART3_SUBJECTS[0];
  const selectedQuestions = hsaPart3HasSubjectMarkers
    ? selectedSectionQuestions.filter(question => hsaSubjectCodeFromLatex(question.latex_source) === selectedHsaSubject.code)
    : selectedSectionQuestions;
  const selectedQuestionTarget = hsaPart3HasSubjectMarkers ? (selectedHsaSubject.code === "tienganh" ? 50 : 17) : selectedSection ? expectedQuestionCountForSection(exam.exam_type, selectedSection.title) : null;
  const selectedEditorPath = selectedSection
    ? `/admin/exams/${exam.id}/sections/${selectedSection.id}/editor${hsaPart3HasSubjectMarkers ? `?subject=${selectedHsaSubject.code}` : ""}`
    : "";
  const completedSections = sections.filter(section => data.questions.some(question => question.section_id === section.id)).length;
  const allQuestions = sections.reduce((count, section) => count + data.questions.filter(question => question.section_id === section.id).length, 0);
  const hsaSelection = normalizeHsaSelection({ mode: hsaSelectionMode, subjects: hsaScienceSubjectCodes, label: hsaSelectionLabel });
  const setField = <K extends keyof ExamFormValues>(field: K, value: ExamFormValues[K]) => setForm(previous => ({ ...previous, [field]: value }));

  useEffect(() => {
    // The subject picker mirrors the persisted section list after a refresh.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (isThptqg) setSubjectCodes(currentSubjectCodes);
  // The section list is represented by a stable code key so opening the editor
  // or refreshing after a save does not reset a checkbox on every render.
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [exam.id, isThptqg, currentSubjectKey]);

  function openSavedPreview() {
    if (!sections.length) { window.alert("Đề chưa có phần thi để xem."); return; }
    try {
      openSavedExamPreview(exam);
    } catch (value) {
      window.alert(value instanceof Error ? value.message : "Không thể mở bản xem bài thi đã lưu.");
    }
  }

  async function exportAccountResults() {
    try {
      const response = await authenticatedFetch(`/api/admin/exam-export?examId=${encodeURIComponent(exam.id)}`, { cache: "no-store" });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({})) as { error?: string };
        throw new Error(payload.error || "Không thể xuất dữ liệu bài làm.");
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `${exam.title}-account.xlsx`.replace(/[\\/:*?"<>|]+/g, "-");
      anchor.click();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (value) {
      window.alert(value instanceof Error ? value.message : "Không thể xuất dữ liệu bài làm.");
    }
  }

  async function deleteCurrentExam() {
    if (!supabase || !window.confirm(`Xóa đề “${exam.title}” và toàn bộ môn, câu hỏi bên trong?`)) return;
    const result = await supabase.from("exams").delete().eq("id", exam.id);
    if (result.error) window.alert(result.error.message);
    else { await onChanged(`Đã xóa đề “${exam.title}”.`); navigate(`/admin/exams/rooms/${room.id}`); }
  }

  async function saveExam(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSavingExam(true);
    if (form.published) {
      try {
        const preflightResponse = await authenticatedFetch(`/api/admin/exam-policy?examId=${encodeURIComponent(exam.id)}`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ action: "preflight", examId: exam.id }),
        });
        const preflight = await preflightResponse.json().catch(() => ({})) as { error?: string; canPublish?: boolean; checks?: Array<{ level?: string; message?: string }> };
        if (!preflightResponse.ok || !preflight.canPublish) {
          const firstError = preflight.checks?.find(check => check.level === "error")?.message;
          window.alert(firstError || preflight.error || "Đề chưa đạt preflight và chưa thể xuất bản.");
          setSavingExam(false);
          return;
        }
      } catch (value) {
        window.alert(value instanceof Error ? value.message : "Không thể kiểm tra preflight trước khi xuất bản.");
        setSavingExam(false);
        return;
      }
    }
    const currentHsaConfig = normalizeHsaStructureConfig(exam.structure_config);
    const nextHsaConfig = isHsa ? { ...currentHsaConfig, version: hsaVersion, selection: hsaSelection } : exam.structure_config ?? {};
    const dashboardTitle = form.dashboard_title?.trim() || (isThptqg ? "KỲ THI TỐT NGHIỆP THPT 2027" : form.title.trim() || "ĐỀ THI");
    const result = await supabase.from("exams").update({ ...form, structure_config: nextHsaConfig, dashboard_title: dashboardTitle, title: form.title.trim(), description: form.description.trim() }).eq("id", exam.id);
    setSavingExam(false);
    if (result.error) { window.alert(result.error.message); return; }
    setSettingsOpen(false); signalExamPreviewRefresh(exam.id); await onChanged("Đã lưu cấu hình đề thi.");
  }

  async function saveThptqgSubjects() {
    if (!supabase || !isThptqg || savingSubjects) return;
    const selected = new Set(subjectCodes);
    if (!selected.size) { window.alert("Đề THPTQG phải có ít nhất một môn thi."); return; }
    const currentByCode = new Map(sections.map(section => [thptqgSubjectForSection(section.subject_code, section.title)?.code || section.subject_code || "", section]));
    const removed = sections.filter(section => {
      const code = thptqgSubjectForSection(section.subject_code, section.title)?.code || section.subject_code || "";
      return !selected.has(code);
    });
    const added = THPTQG_SUBJECT_TEMPLATES.filter(subject => selected.has(subject.code) && !currentByCode.has(subject.code));
    if (removed.length && !window.confirm(`Bỏ ${removed.length} môn khỏi đề? Các câu hỏi trong những môn này cũng sẽ bị xóa.`)) return;
    setSavingSubjects(true);
    let failure: { message: string } | null = null;
    for (const section of removed) {
      const questionIds = data.questions.filter(question => question.section_id === section.id).map(question => question.id);
      if (questionIds.length) failure = (await supabase.from("exam_question_keys").delete().in("question_id", questionIds)).error;
      if (!failure) failure = (await supabase.from("exam_questions").delete().eq("section_id", section.id)).error;
      if (!failure) failure = (await supabase.from("exam_sections").delete().eq("id", section.id)).error;
      if (failure) break;
    }
    if (!failure && added.length) {
      failure = (await supabase.from("exam_sections").insert(added.map((subject, index) => ({ exam_id: exam.id, title: subject.title, duration_minutes: subject.duration_minutes, subject_code: subject.code, sort_order: sections.length + index })))).error;
    }
    setSavingSubjects(false);
    if (failure) { window.alert(failure.message); return; }
    setSubjectsOpen(false);
    signalExamPreviewRefresh(exam.id);
    await onChanged("Đã cập nhật các môn trong cụm đề THPTQG.");
  }

  async function addMissingParts() {
    if (!supabase) return;
    const templates = sectionTemplatesForExamType(exam.exam_type);
    if (isThptqg) return;
    const existingTitles = new Set(sections.map(section => section.title.trim().toLocaleLowerCase("vi-VN")));
    const missing = templates.filter(template => !existingTitles.has(template.title.toLocaleLowerCase("vi-VN")));
    if (!missing.length) return;
    const result = await supabase.from("exam_sections").insert(missing.map((template, index) => ({ exam_id: exam.id, title: template.title, duration_minutes: template.duration_minutes, subject_code: "code" in template ? template.code : null, sort_order: sections.length + index })));
    if (result.error) window.alert(result.error.message); else { signalExamPreviewRefresh(exam.id); await onChanged("Đã bổ sung các phần thi còn thiếu."); }
  }

  async function moveQuestion(questionId: string, direction: -1 | 1) {
    if (!supabase) return;
    const index = selectedQuestions.findIndex(question => question.id === questionId);
    const target = selectedQuestions[index + direction];
    const current = selectedQuestions[index];
    if (!current || !target) return;
    if (isPassageSection(selectedSection?.title, exam.exam_type) && (current.passage?.trim() ?? "") !== (target.passage?.trim() ?? "")) {
      window.alert("Hãy dùng nút đảo ngữ liệu để đổi cả nhóm; nút này chỉ đảo câu trong cùng một ngữ liệu.");
      return;
    }
    const first = await supabase.from("exam_questions").update({ sort_order: target.sort_order }).eq("id", current.id);
    if (first.error) { window.alert(first.error.message); return; }
    const second = await supabase.from("exam_questions").update({ sort_order: current.sort_order }).eq("id", target.id);
    if (second.error) { window.alert(second.error.message); return; }
    signalExamPreviewRefresh(exam.id);
    await onChanged("Đã đổi vị trí câu hỏi.");
  }

  async function moveQuestionToIndex(questionId: string, targetIndex: number) {
    if (!supabase) return;
    const client = supabase;
    const sourceIndex = selectedQuestions.findIndex(question => question.id === questionId);
    const current = selectedQuestions[sourceIndex];
    const target = selectedQuestions[targetIndex];
    if (!current || !target || sourceIndex === targetIndex) return;
    if (isPassageSection(selectedSection?.title, exam.exam_type) && (current.passage?.trim() ?? "") !== (target.passage?.trim() ?? "")) {
      window.alert("Hãy dùng nút đảo ngữ liệu để đổi cả nhóm; chỉ được kéo câu trong cùng một ngữ liệu.");
      return;
    }
    const reordered = [...selectedQuestions];
    reordered.splice(sourceIndex, 1);
    reordered.splice(targetIndex, 0, current);
    const updates = await Promise.all(reordered.map((question, index) => client.from("exam_questions").update({ sort_order: index }).eq("id", question.id)));
    const failure = updates.find(result => result.error)?.error;
    if (failure) { window.alert(failure.message); return; }
    signalExamPreviewRefresh(exam.id);
    await onChanged("Đã di chuyển ô số câu hỏi.");
  }

  function beginQuestionDrag(questionId: string) {
    setDraggedQuestionId(questionId);
    setDragOverQuestionId(questionId);
  }

  function overQuestion(questionId: string) {
    if (draggedQuestionId && draggedQuestionId !== questionId) setDragOverQuestionId(questionId);
  }

  function endQuestionDrag() {
    setDraggedQuestionId("");
    setDragOverQuestionId("");
  }

  async function dropQuestion(targetIndex: number) {
    const sourceId = draggedQuestionId;
    endQuestionDrag();
    if (sourceId) await moveQuestionToIndex(sourceId, targetIndex);
  }

  const examType = normalizeExamType(exam.exam_type).toLowerCase();
  return <div className={`workspace-page exam-editor-page exam-theme-${examType}`} data-exam-type={examType}>
    <PageHeader eyebrow={`${room.exam_type} · SOẠN ĐỀ`} title={exam.title} description={`${room.title} / ${sections.length} ${isThptqg || isVsat ? "môn" : "phần thi"} / ${allQuestions} câu hỏi`} back={() => navigate(`/admin/exams/rooms/${room.id}`)} actions={<><button className="workspace-button ghost" onClick={openSavedPreview}><ExternalLink/>Xem trước</button><button className="workspace-button ghost" onClick={() => setSettingsOpen(value => !value)} aria-expanded={settingsOpen}><Settings2/>Cấu hình đề</button><button className="workspace-button ghost" onClick={() => navigate(`/admin/exams/${exam.id}/policy`)}><Settings2/>Quy tắc làm bài</button>{isThptqg && <button className="workspace-button ghost" onClick={() => setSubjectsOpen(value => !value)}><Layers3/>Chọn môn ({sections.length}/8)</button>}<button type="button" className="workspace-danger-link" onClick={() => void deleteCurrentExam()}><Trash2/>Xóa đề</button></>} />
    <div className="exam-editor-breadcrumb"><span>{room.exam_type}</span><ChevronRight/><span>{room.title}</span><ChevronRight/><b>{exam.title}</b><span className={exam.published ? "status-live" : "status-draft"}>{exam.published ? "Đã xuất bản" : "Bản nháp"}</span></div>
    {settingsOpen && <form className="inline-settings-card" onSubmit={saveExam}><div className="inline-settings-head"><div><span className="editor-eyebrow">CẤU HÌNH ĐỀ</span><h2>Thông tin hiển thị và trạng thái</h2></div><button type="button" onClick={() => setSettingsOpen(false)}><X/></button></div><div className="workspace-form-grid two-col"><label>Tên đề<input value={form.title} onChange={event => setField("title", event.target.value)} required /></label><label>Thời lượng (phút)<input type="number" min={1} value={form.duration_minutes} onChange={event => setField("duration_minutes", Number(event.target.value))} required /></label></div><label>Mô tả<textarea rows={3} value={form.description} onChange={event => setField("description", event.target.value)} /></label>{isThptqg && <label>Tiêu đề trang chọn môn<input value={form.dashboard_title ?? ""} onChange={event => setField("dashboard_title", event.target.value)} placeholder="KỲ THI TỐT NGHIỆP THPT 2027" /><small>Hiển thị ở đầu trang danh sách môn của thí sinh.</small></label>}{isHsa && <><label>Phiên bản cấu trúc HSA<select value={hsaVersion} onChange={event => setHsaVersion(event.target.value as HsaStructureVersion)}><option value="HSA-2026">HSA 2026 · chính thức</option><option value="HSA-2027">HSA 2027 · đề xuất</option><option value="CUSTOM">Tùy chỉnh</option></select><small>HSA 2027 là cấu hình đề xuất; hãy kiểm tra quy định chính thức trước khi dùng.</small></label><fieldset className="hsa-selection-settings"><legend>Phần 3 · lựa chọn</legend><label><input type="radio" name="edit-hsa-selection" checked={hsaSelectionMode === "science"} onChange={() => setHsaSelectionMode("science")}/><span><b>Khoa học</b><small>Chọn đúng 3 trong 5 chủ đề</small></span></label><label><input type="radio" name="edit-hsa-selection" checked={hsaSelectionMode === "english"} onChange={() => setHsaSelectionMode("english")}/><span><b>Tiếng Anh · HSA-F</b><small>Đánh giá năng lực ngôn ngữ</small></span></label><label><input type="radio" name="edit-hsa-selection" checked={hsaSelectionMode === "custom"} onChange={() => setHsaSelectionMode("custom")}/><span><b>Tùy chỉnh</b><small>Dùng khi đề mô phỏng có lựa chọn riêng</small></span></label>{hsaSelectionMode === "science" && <div className="hsa-science-subjects">{HSA_SCIENCE_SUBJECTS.map(subject => <label key={subject.code}><input type="checkbox" checked={hsaScienceSubjectCodes.includes(subject.code)} disabled={!hsaScienceSubjectCodes.includes(subject.code) && hsaScienceSubjectCodes.length >= 3} onChange={event => setHsaScienceSubjectCodes(previous => event.target.checked ? [...previous, subject.code] : previous.filter(code => code !== subject.code))}/><span>{subject.title}</span></label>)}</div>}{hsaSelectionMode === "custom" && <label>Tên lựa chọn<input value={hsaSelectionLabel} onChange={event => setHsaSelectionLabel(event.target.value)} placeholder="Ví dụ: Khoa học mở rộng" /></label>}</fieldset></>}{isHsa && <p className="structure-version-note">{hsaSelection.label}</p>}<div className="workspace-form-grid two-col"><label>Hình thức<select value={form.mode} onChange={event => setField("mode", event.target.value as ExamFormValues["mode"])}><option value="free">Tự do / luyện tập</option><option value="scheduled">Theo lịch</option></select></label><label className="checkbox-card"><input type="checkbox" checked={form.published} onChange={event => setField("published", event.target.checked)} /><span><b>{form.published ? "Đề đang xuất bản" : "Đề đang ở bản nháp"}</b><small>Học viên chỉ thấy đề khi cả phòng và đề đã xuất bản.</small></span></label></div><div className="workspace-form-footer"><span/><button className="workspace-button primary" disabled={savingExam}><Save/>{savingExam ? "Đang lưu…" : "Lưu cấu hình"}</button></div></form>}
    {subjectsOpen && isThptqg && <fieldset className="workspace-subject-picker workspace-subject-picker-edit"><legend>Chọn các môn có trong cụm thi</legend><p>Chỉ các môn được tích mới xuất hiện ở trang chọn môn của học viên.</p><div>{THPTQG_SUBJECT_TEMPLATES.map(subject => <label key={subject.code}><input type="checkbox" checked={subjectCodes.includes(subject.code)} onChange={event => setSubjectCodes(previous => event.target.checked ? [...previous, subject.code] : previous.filter(code => code !== subject.code))}/><span><b>{subject.title}</b><small>{subject.duration_minutes} phút · {subject.structure}</small></span></label>)}</div><footer><button type="button" className="workspace-button ghost" onClick={() => { setSubjectCodes(currentSubjectCodes); setSubjectsOpen(false); }}>Hủy</button><button type="button" className="workspace-button primary" onClick={() => void saveThptqgSubjects()} disabled={savingSubjects}>{savingSubjects ? "Đang cập nhật…" : "Lưu danh sách môn"}</button></footer></fieldset>}
    {((isTsa && sections.length < 3) || (isHsa && sections.length < 3) || (isVsat && sections.length < VSAT_SUBJECT_TEMPLATES.length)) && <div className="parts-warning"><Sparkles/><div><b>{isHsa ? `Cấu trúc HSA hiện có ${sections.length}/3 phần` : isVsat ? `Đề V-SAT hiện có ${sections.length}/${VSAT_SUBJECT_TEMPLATES.length} môn` : `Đề TSA hiện có ${sections.length}/3 phần`}</b><span>{isHsa ? "HSA 2026 chuẩn gồm 3 phần; có thể bổ sung phần còn thiếu hoặc chỉnh lại trong workspace." : isVsat ? "Có thể bổ sung các môn độc lập còn thiếu để hoàn thiện gói V-SAT." : "Có thể soạn và sử dụng từng phần độc lập."}</span></div><button className="workspace-button ghost" onClick={() => void addMissingParts()}>Bổ sung {isVsat ? "môn" : "phần"}</button></div>}
    <div className="exam-editor-layout"><aside className="exam-part-sidebar" aria-label={isHsa ? "Cấu trúc soạn HSA theo từng môn" : "Cấu trúc đề"}><div className="part-sidebar-head"><span className="editor-eyebrow">CẤU TRÚC SOẠN</span><b>{isHsa ? `${hsaAuthoringEntries.length} mục` : isThptqg || isVsat ? `${sections.length} môn` : `${sections.length} phần`}</b></div>{hsaAuthoringEntries.map(({ part, subject, index }) => {
      const sectionQuestions = data.questions.filter(question => question.section_id === part.id);
      const count = subject ? sectionQuestions.filter(question => hsaSubjectCodeFromLatex(question.latex_source) === subject.code).length : sectionQuestions.length;
      const target = subject ? (subject.code === "tienganh" ? 50 : 17) : expectedQuestionCountForSection(exam.exam_type, part.title);
      const active = part.id === selectedSection?.id && (!subject || subject.code === selectedHsaSubject.code);
      if (subject) return <div className={`hsa-authoring-subject-entry${active ? " active" : ""}`} key={`${part.id}:${subject.code}`}>
        <button type="button" className="hsa-authoring-subject-select" onClick={() => { setActiveSectionId(part.id); setHsaAuthoringSubjectCode(subject.code); }}><span className="part-number">{index + 1}</span><span><b>{subject.title}</b><small>{count}/{target} câu · Phần 3</small></span><ChevronRight/></button>
        <button type="button" className="hsa-authoring-subject-open" aria-label={`Soạn môn ${subject.title}`} onClick={() => navigate(`/admin/exams/${exam.id}/sections/${part.id}/editor?subject=${subject.code}`)}><Code2/><span>Soạn</span></button>
      </div>;
      return <button key={part.id} className={active ? "active" : ""} onClick={() => setActiveSectionId(part.id)}><span className="part-number">{index + 1}</span><span><b>{part.title}</b><small>{`${count}${target ? `/${target}` : ""} câu${part.duration_minutes ? ` · ${part.duration_minutes} phút` : ""}`}</small></span><ChevronRight/></button>;
    })}<div className="part-sidebar-tip"><Code2/><span>{isThptqg ? "Mỗi môn được soạn độc lập." : isHsa ? "Toán, Văn và từng môn lựa chọn có ô soạn riêng; khi thi hệ thống vẫn ghép đúng 3 phần HSA." : "TSA có thể chỉ gồm một hoặc một vài phần; mỗi câu = một môi trường ex."}</span></div></aside>
      <main className="exam-question-board">{selectedSection ? <>
        <div className="question-board-head"><div><span className="editor-eyebrow">PHẦN {selectedSection.sort_order + 1}{hsaPart3HasSubjectMarkers ? " · NGÂN HÀNG MÔN" : ""}</span><h2>{hsaPart3HasSubjectMarkers ? selectedHsaSubject.title : selectedSection.title}</h2><p>{selectedQuestions.length}{selectedQuestionTarget ? `/${selectedQuestionTarget}` : ""} câu đã soạn{hsaPart3HasSubjectMarkers ? ` · ${selectedSection.title}` : ""}</p></div><div className="question-board-head-actions"><button className="workspace-button primary" onClick={() => navigate(selectedEditorPath)}><Layers3/>{hsaPart3HasSubjectMarkers ? `Soạn môn ${selectedHsaSubject.title}` : isPassageSection(selectedSection.title) ? "Soạn bài thi" : "Soạn câu hỏi"}</button></div></div>
        <SectionSettings section={selectedSection} onChanged={onChanged} />
        {selectedQuestions.length ? <div className="question-board-list" aria-label={`Danh sách ${selectedQuestions.length} câu hỏi${hsaPart3HasSubjectMarkers ? ` môn ${selectedHsaSubject.title}` : ""}`}>{selectedQuestions.map((question, index) => { const samePreviousGroup = !isPassageSection(selectedSection.title) || index === 0 || (question.passage?.trim() ?? "") === (selectedQuestions[index - 1]?.passage?.trim() ?? ""); const sameNextGroup = !isPassageSection(selectedSection.title) || index === selectedQuestions.length - 1 || (question.passage?.trim() ?? "") === (selectedQuestions[index + 1]?.passage?.trim() ?? ""); return <QuestionBoardRow key={question.id} examId={exam.id} question={question} index={index} navigate={navigate} onChanged={onChanged} canMoveUp={index > 0 && samePreviousGroup} canMoveDown={index < selectedQuestions.length - 1 && sameNextGroup} onMove={direction => void moveQuestion(question.id, direction)} selected={selectedQuestionId === question.id} onSelect={() => setSelectedQuestionId(current => current === question.id ? "" : question.id)} dragged={draggedQuestionId === question.id} dragOver={dragOverQuestionId === question.id} onDragStart={() => beginQuestionDrag(question.id)} onDragOver={() => overQuestion(question.id)} onDrop={() => void dropQuestion(index)} onDragEnd={endQuestionDrag} />; })}</div> : <div className="question-board-empty"><Code2/><h3>{hsaPart3HasSubjectMarkers ? `Môn ${selectedHsaSubject.title} chưa có câu hỏi` : "Phần này chưa có câu hỏi"}</h3><p>{isPassageSection(selectedSection.title) ? "Mỗi ngữ liệu gồm bài đọc và các môi trường ex của các câu hỏi trong nhóm." : <>Nhập một câu hoặc dán nhiều môi trường <code>ex</code> trong cùng trình soạn; các câu lưu xong sẽ tự vào danh sách của phần này.</>}</p><div className="question-board-empty-actions"><button className="workspace-button primary" onClick={() => navigate(selectedEditorPath)}><Layers3/>{hsaPart3HasSubjectMarkers ? `Soạn môn ${selectedHsaSubject.title}` : isPassageSection(selectedSection.title) ? "Soạn bài thi" : "Soạn câu hỏi"}</button></div></div>}
      </> : <div className="question-board-empty"><Layers3/><h3>Chưa có phần thi</h3><p>Đề TSA có thể bắt đầu với một phần; hãy bổ sung phần mẫu nếu cần.</p><button className="workspace-button primary" onClick={() => void addMissingParts()}>Tạo phần mẫu</button></div>}</main></div>
  </div>;
}

function SectionSettings({ section, onChanged }: { section: Section; onChanged: (message?: string) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [title, setTitle] = useState(section.title);
  const [duration, setDuration] = useState(section.duration_minutes ?? 0);
  const [saving, setSaving] = useState(false);
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTitle(section.title); setDuration(section.duration_minutes ?? 0); }, [section.id, section.title, section.duration_minutes]);
  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    setSaving(true);
    const result = await supabase.from("exam_sections").update({ title: title.trim(), duration_minutes: duration || null }).eq("id", section.id);
    setSaving(false);
    if (result.error) window.alert(result.error.message); else { setOpen(false); signalExamPreviewRefresh(section.exam_id); await onChanged("Đã lưu tên phần thi."); }
  }
  if (!open) return <button className="section-settings-trigger" onClick={() => setOpen(true)}><Pencil/> Sửa tên phần và thời lượng</button>;
  return <form className="section-settings-form" onSubmit={submit}><label>Tên phần<input value={title} onChange={event => setTitle(event.target.value)} required /></label><label>Phút<input type="number" min={1} value={duration || ""} onChange={event => setDuration(Number(event.target.value))} /></label><button type="button" className="workspace-button ghost" onClick={() => setOpen(false)}>Hủy</button><button className="workspace-button primary" disabled={saving}><Save/>{saving ? "Đang lưu…" : "Lưu phần"}</button></form>;
}

function QuestionBoardRow({ examId, question, index, navigate, onChanged, canMoveUp, canMoveDown, onMove, selected, onSelect, dragged, dragOver, onDragStart, onDragOver, onDrop, onDragEnd }: { examId: string; question: Question; index: number; navigate: (path: string) => void; onChanged: (message?: string) => Promise<void>; canMoveUp: boolean; canMoveDown: boolean; onMove: (direction: -1 | 1) => void; selected: boolean; onSelect: () => void; dragged: boolean; dragOver: boolean; onDragStart: () => void; onDragOver: () => void; onDrop: () => void; onDragEnd: () => void }) {
  async function remove() {
    if (!supabase || !window.confirm(`Xóa câu ${index + 1} khỏi phần thi?`)) return;
    const result = await supabase.from("exam_questions").delete().eq("id", question.id);
    if (result.error) window.alert(result.error.message); else { signalExamPreviewRefresh(examId); await onChanged("Đã xóa câu hỏi."); }
  }
  return <article draggable className={`question-board-row question-board-number-row${selected ? " is-selected" : ""}${dragged ? " is-dragging" : ""}${dragOver ? " is-drag-over" : ""}`} aria-label={`Ô câu ${index + 1}`} onDragStart={onDragStart} onDragOver={event => { event.preventDefault(); onDragOver(); }} onDrop={event => { event.preventDefault(); onDrop(); }} onDragEnd={onDragEnd}><button type="button" className="question-board-number" aria-label={`${selected ? "Bỏ chọn" : "Chọn"} câu ${index + 1}`} aria-pressed={selected} onClick={onSelect}><span>{String(index + 1).padStart(2, "0")}</span></button>{selected && <div className="question-board-actions"><div className="question-order-actions"><button className="icon-only" type="button" aria-label={`Đưa câu ${index + 1} lên`} onClick={() => onMove(-1)} disabled={!canMoveUp}><ArrowUp /></button><button className="icon-only" type="button" aria-label={`Đưa câu ${index + 1} xuống`} onClick={() => onMove(1)} disabled={!canMoveDown}><ArrowDown /></button></div><button type="button" aria-label="Mở trình soạn câu hỏi" onClick={() => navigate(`/admin/exams/${examId}/questions/${question.id}`)}><Pencil/>Soạn</button><button type="button" className="danger" aria-label="Xóa câu hỏi" onClick={() => void remove()}><Trash2/>Xóa</button></div>}</article>;
}

type SectionPreviewDraftQuestion = {
  parsed: ParsedLatexQuestion;
  passage?: string;
  instruction?: string;
  mediaUrl?: string;
};

type SectionPreviewDraft = {
  version: 1;
  examTitle: string;
  sectionTitle: string;
  durationMinutes: number;
  questions: SectionPreviewDraftQuestion[];
};

type ExamPreviewSectionDraft = {
  id: string;
  title: string;
  subjectCode?: string | null;
  durationMinutes: number;
  questions: SectionPreviewDraftQuestion[];
};

type ExamPreviewDraft = {
  version: 2;
  examType: string;
  examTitle: string;
  dashboardTitle: string;
  roomTitle: string;
  durationMinutes: number;
  activeSectionId: string;
  sections: ExamPreviewSectionDraft[];
};

function usePreviewCandidateIdentity() {
  const [identity, setIdentity] = useState<CandidateIdentity>({ candidateName: "Học viên", candidateId: "", candidateEmail: "" });

  useEffect(() => {
    let active = true;
    void loadCandidateIdentity().then((value) => {
      if (active) setIdentity(value);
    });
    return () => { active = false; };
  }, []);

  return identity;
}

function parseSectionPreviewDraft(raw: string | null): SectionPreviewDraft {
  if (!raw) throw new Error("Bản nháp xem trước đã hết hoặc không còn trong tab này.");
  const value = JSON.parse(raw) as SectionPreviewDraft;
  if (value.version !== 1 || !Array.isArray(value.questions) || !value.questions.length) throw new Error("Bản nháp xem trước không hợp lệ.");
  return value;
}

function questionSourceForEditor(question: Question, answerKey?: KeyRow) {
  return question.latex_source?.trim() || questionToLatex({
    prompt: question.prompt,
    question_type: question.question_type,
    options: question.options.map((option, index) => typeof option === "string" ? { value: String.fromCharCode(65 + index), label: option } : option),
  }, answerKey?.correct_answer, question.solution_source ?? answerKey?.explanation ?? "");
}

function storedPreviewItems(section: Section, data: DataState) {
  return data.questions
    .filter(question => question.section_id === section.id)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map(question => {
      const answerKey = data.keys.find(key => key.question_id === question.id);
      const parsed = parseLatexQuestion(questionSourceForEditor(question, answerKey));
      const correctAnswer = hasAnswerValue(answerKey?.correct_answer) ? answerKey?.correct_answer : parsed.correctAnswer;
      return {
        parsed: { ...parsed, correctAnswer, solution: parsed.solution.trim() || question.solution_source?.trim() || answerKey?.explanation?.trim() || "" },
        passage: question.passage?.trim() ?? "",
        instruction: question.instruction?.trim() ?? "",
        mediaUrl: question.media_url?.trim() ?? "",
      };
    });
}

async function loadLiveExamPreviewDraft(examId: string): Promise<ExamPreviewDraft> {
  if (!supabase) throw new Error("Chưa cấu hình Supabase.");
  const examResult = await supabase.from("exams").select(EXAM_SELECT).eq("id", examId).single();
  if (examResult.error || !examResult.data) throw new Error(explainExamSchemaError(examResult.error, "Không thể tải đề thi xem trước."));
  const exam = examResult.data as Exam;
  const roomResult = await supabase.from("exam_rooms").select(ROOM_SELECT).eq("id", exam.room_id).single();
  if (roomResult.error || !roomResult.data) throw new Error(explainExamSchemaError(roomResult.error, "Không thể tải phòng khảo thí."));
  const sectionResult = await supabase.from("exam_sections").select(SECTION_SELECT).eq("exam_id", exam.id).order("sort_order");
  if (sectionResult.error) throw new Error(explainExamSchemaError(sectionResult.error, "Không thể tải các phần thi."));
  const sections = (sectionResult.data ?? []) as Section[];
  if (!sections.length) throw new Error("Đề thi chưa có phần để xem trước.");
  const sectionIds = sections.map(section => section.id);
  const questionResult = sectionIds.length
    ? await supabase.from("exam_questions").select(QUESTION_SELECT).in("section_id", sectionIds).order("sort_order")
    : { data: [], error: null };
  if (questionResult.error) throw new Error(explainExamSchemaError(questionResult.error, "Không thể tải câu hỏi của đề."));
  const questions = (questionResult.data ?? []) as Question[];
  const questionIds = questions.map(question => question.id);
  const keyResult = questionIds.length
    ? await supabase.from("exam_question_keys").select("question_id,correct_answer,explanation").in("question_id", questionIds)
    : { data: [], error: null };
  if (keyResult.error) throw new Error(explainExamSchemaError(keyResult.error, "Không thể tải đáp án của đề."));
  const data: DataState = { rooms: [roomResult.data as Room], exams: [exam], sections, questions, keys: (keyResult.data ?? []) as KeyRow[] };
  return {
    version: 2,
    examType: normalizeExamType((roomResult.data as Room).exam_type || exam.exam_type),
    examTitle: exam.title,
    dashboardTitle: exam.dashboard_title ?? "",
    roomTitle: (roomResult.data as Room).title,
    durationMinutes: exam.duration_minutes,
    activeSectionId: sections[0]?.id ?? "",
    sections: sections.map(section => ({
      id: section.id,
      title: section.title,
      subjectCode: section.subject_code,
      durationMinutes: section.duration_minutes ?? 60,
      questions: storedPreviewItems(section, data),
    })),
  };
}

function signalExamPreviewRefresh(examId: string) {
  if (typeof window === "undefined") return;
  const storageKey = `exam-preview-refresh:${examId}`;
  const timestamp = String(Date.now());
  window.localStorage.setItem(storageKey, timestamp);
  if (typeof BroadcastChannel !== "undefined") {
    const channel = new BroadcastChannel(storageKey);
    channel.postMessage(timestamp);
    channel.close();
  }
}

function useLiveExamPreview(examId: string) {
  const [draft, setDraft] = useState<ExamPreviewDraft | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    let inFlight = false;
    const refresh = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const nextDraft = await loadLiveExamPreviewDraft(examId);
        if (!active) return;
        setDraft(nextDraft);
        setError("");
      } catch (value) {
        if (active) setError(value instanceof Error ? value.message : "Không thể cập nhật bản xem trước.");
      } finally {
        inFlight = false;
        if (active) setLoading(false);
      }
    };
    const storageKey = `exam-preview-refresh:${examId}`;
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey) void refresh(); };
    window.addEventListener("storage", onStorage);
    let refreshChannel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      refreshChannel = new BroadcastChannel(storageKey);
      refreshChannel.onmessage = () => void refresh();
    }
    const intervalId = window.setInterval(() => void refresh(), 1500);
    let channel: ReturnType<NonNullable<typeof supabase>["channel"]> | null = null;
    if (supabase) {
      channel = supabase.channel(`exam-preview-live-${examId}`)
        .on("postgres_changes", { event: "*", schema: "public", table: "exams", filter: `id=eq.${examId}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "exam_sections", filter: `exam_id=eq.${examId}` }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "exam_questions" }, () => void refresh())
        .on("postgres_changes", { event: "*", schema: "public", table: "exam_question_keys" }, () => void refresh())
        .subscribe();
    }
    void refresh();
    return () => {
      active = false;
      window.removeEventListener("storage", onStorage);
      refreshChannel?.close();
      window.clearInterval(intervalId);
      if (channel) void channel.unsubscribe();
    };
  }, [examId]);

  return { draft, error, loading };
}

function openExamPreviewTab(examId: string) {
  window.open(`/admin/exams/${encodeURIComponent(examId)}/preview`, "_blank", "noopener,noreferrer");
}

function openSavedExamPreview(exam: Exam) {
  openExamPreviewTab(exam.id);
}

function parsedQuestionIsUsable(parsed: ParsedLatexQuestion) {
  return Boolean(parsed.prompt || parsed.options.length || /\\cham\b|_{3,}/.test(parsed.body));
}

type ParsedEditorQuestion = {
  parsed: ParsedLatexQuestion;
  passage: string | null;
  passageIndex?: number;
};

function buildStarterPassageSource() {
  return String.raw`% Mỗi bài đọc được đặt trong một môi trường baidoc.
% Các môi trường ex bên trong baidoc là các câu hỏi thuộc cùng ngữ liệu.
\begin{baidoc}
\item[] Dựa vào thông tin dưới đây và trả lời các câu hỏi từ câu {start} - {end}:

\item Nội dung ngữ liệu thứ nhất. Bạn có thể thay đoạn này bằng văn bản, bảng số liệu hoặc hình ảnh.

\item Nội dung ngữ liệu thứ hai nếu bài đọc có nhiều đoạn.

\begin{ex}
    Nội dung câu hỏi thứ nhất...
    \choice
        {Phương án A}
        {Phương án B}
        {Phương án C}
        {\True Phương án D}
\end{ex}
\end{baidoc}`;
}

function passageKey(value: string | null | undefined) {
  return value?.trim().replace(/\s+/g, " ") ?? "";
}

function storedPassageParts(value: string) {
  const lines = value.trim().split(/\r?\n/);
  const firstLine = lines.shift()?.trim() ?? "";
  const firstIsInstruction = /\{start\}|\{end\}/i.test(firstLine) || /^Dựa vào thông tin/i.test(firstLine);
  const instruction = firstIsInstruction ? firstLine : DEFAULT_BAIDOC_INSTRUCTION;
  let heading = (firstIsInstruction ? lines.shift()?.trim() : firstLine) || "";
  let bodyLines = lines;
  // Recover passage data written by the old parser, which could accidentally
  // place the first paragraph in \tenbaidoc{} and leave the original heading
  // as the first line inside an enumerate block.
  const firstListIndex = bodyLines.findIndex(line => /^\s*\\begin\s*\{\s*enumerate\s*\}/i.test(line));
  const legacyHeading = bodyLines[0]?.trim() ?? "";
  if (firstListIndex === 1 && heading.length > 80 && legacyHeading && legacyHeading.length <= 80 && !/[\\{}]/.test(legacyHeading)) {
    const legacyBodyHeading = heading;
    heading = legacyHeading;
    bodyLines = [legacyBodyHeading, ...bodyLines.slice(1)];
  }
  const hasNumberedItems = bodyLines.some(line => /^\s*\[\d+\]\s*/.test(line));
  const body = hasNumberedItems
    ? bodyLines.map(line => line.replace(/^\s*\[\d+\]\s*/, "\\item ")).join("\n").trim()
    : bodyLines.join("\n").trim();
  return { instruction, heading, body };
}

function buildStoredPassageSectionSource(questions: Question[], keys: KeyRow[]) {
  const orderedQuestions = [...questions].sort((left, right) => left.sort_order - right.sort_order);
  const chunks: string[] = [];
  let index = 0;
  while (index < orderedQuestions.length) {
    const question = orderedQuestions[index];
    const passage = question.passage?.trim() ?? "";
    if (!passage) {
      chunks.push(questionSourceForEditor(question, keys.find(key => key.question_id === question.id)));
      index += 1;
      continue;
    }

    const groupPassageKey = passageKey(passage);
    const groupQuestions: Question[] = [];
    while (index < orderedQuestions.length && passageKey(orderedQuestions[index].passage) === groupPassageKey) {
      groupQuestions.push(orderedQuestions[index]);
      index += 1;
    }
    const { instruction, heading, body } = storedPassageParts(passage);
    const passageBody = [heading, body].filter(Boolean).join("\n\n");
    chunks.push([
      "\\begin{baidoc}",
      `\\item[] ${instruction}`,
      passageBody || "% Nhập nội dung bài đọc ở đây.",
      ...groupQuestions.map(item => questionSourceForEditor(item, keys.find(key => key.question_id === item.id))),
      "\\end{baidoc}",
    ].join("\n\n"));
  }
  return chunks.join("\n\n").trim();
}

function moveBaidocSource(input: string, index: number, direction: -1 | 1) {
  const beginPattern = /\\begin\s*\{\s*baidoc\s*\}(?:\s*\[[^\]]*\])?/gi;
  const endPattern = /\\end\s*\{\s*baidoc\s*\}/gi;
  const blocks: Array<{ start: number; end: number; source: string }> = [];
  let beginMatch: RegExpExecArray | null;
  while ((beginMatch = beginPattern.exec(input))) {
    endPattern.lastIndex = beginPattern.lastIndex;
    const endMatch = endPattern.exec(input);
    if (!endMatch) break;
    const end = endMatch.index + endMatch[0].length;
    blocks.push({ start: beginMatch.index, end, source: input.slice(beginMatch.index, end) });
    beginPattern.lastIndex = end;
  }
  const targetIndex = index + direction;
  if (index < 0 || targetIndex < 0 || targetIndex >= blocks.length) return input;
  const leftIndex = Math.min(index, targetIndex);
  const rightIndex = Math.max(index, targetIndex);
  const left = blocks[leftIndex];
  const right = blocks[rightIndex];
  const between = input.slice(left.end, right.start);
  const reordered = `${blocks[rightIndex].source}${between}${blocks[leftIndex].source}`;
  return `${input.slice(0, left.start)}${reordered}${input.slice(right.end)}`;
}

function initialHsaEditorScope(): HsaSubjectCode | "all" {
  if (typeof window === "undefined") return "vatly";
  const requested = new URLSearchParams(window.location.search).get("subject");
  return HSA_PART3_SUBJECTS.some(subject => subject.code === requested) ? requested as HsaSubjectCode : "vatly";
}

function SectionLatexEditorPage({ exam, room, section, data, navigate, onSaved }: { exam: Exam; room: Room; section: Section; data: DataState; navigate: (path: string) => void; onSaved: (message?: string) => Promise<void> }) {
  const sectionQuestions = useMemo(() => data.questions.filter(item => item.section_id === section.id).sort((left, right) => left.sort_order - right.sort_order), [data.questions, section.id]);
  const thptqgMode = normalizeExamType(exam.exam_type) === "THPTQG";
  const hsaPart = normalizeExamType(exam.exam_type) === "HSA" ? hsaPartForSectionTitle(section.title) : null;
  const storedPassageMode = sectionQuestions.some(question => Boolean(question.passage?.trim()));
  const passageMode = isPassageSection(section.title, exam.exam_type) || storedPassageMode;
  // THPTQG sections normally contain standalone `ex` questions, but the
  // source format also allows a `baidoc` wrapper for a reading/data passage.
  // Keep standalone editing as the default and switch to passage parsing only
  // when the wrapper is actually present.
  const supportsBaidoc = passageMode || thptqgMode;
  const existingSources = useMemo(() => sectionQuestions.map(question => questionSourceForEditor(question, data.keys.find(key => key.question_id === question.id))).filter(Boolean), [data.keys, sectionQuestions]);
  const initialSource = useMemo(() => {
    if (section.source_latex?.trim()) return section.source_latex;
    if (passageMode) return sectionQuestions.length ? buildStoredPassageSectionSource(sectionQuestions, data.keys) : buildStarterPassageSource();
    return existingSources.join("\n\n") || String.raw`% Mỗi câu hỏi phải nằm trong một môi trường ex.
% Với Toán TSA, hãy nhập nhiều môi trường ex; mỗi ex sẽ thành một câu.
% Bạn có thể dán và lưu từng đợt, sau đó mở lại để viết tiếp.`;
  }, [data.keys, existingSources, passageMode, section.source_latex, sectionQuestions]);
  const [source, setSource] = useState(() => initialSource);
  const [savedSource, setSavedSource] = useState(() => initialSource);
  const [hsaEditorScope, setHsaEditorScope] = useState<HsaSubjectCode | "all">(initialHsaEditorScope);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [hsaTemplateLoading, setHsaTemplateLoading] = useState(false);
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findInitialQuery, setFindInitialQuery] = useState("");
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const hsaSubjectBanks = useMemo(() => hsaPart === 3 ? splitHsaPart3SubjectBanks(source) : [], [hsaPart, source]);
  const requestedHsaSubjectBank = hsaEditorScope === "all" ? null : hsaSubjectBanks.find(bank => bank.code === hsaEditorScope) ?? null;
  const activeHsaSubjectBank = requestedHsaSubjectBank ?? (hsaEditorScope === "all" ? null : hsaSubjectBanks[0] ?? null);
  const editorSource = activeHsaSubjectBank?.source ?? source;
  const hasBaidocSyntax = /\\begin\s*\{\s*baidoc\s*\}/i.test(source);
  const editorHasBaidocSyntax = /\\begin\s*\{\s*baidoc\s*\}/i.test(editorSource);
  const baidocEditorMode = passageMode || hasBaidocSyntax;
  const parsedBaidocs = useMemo<ParsedBaidoc[]>(() => hasBaidocSyntax ? parseBaidocDocument(source) : [], [hasBaidocSyntax, source]);
  const editorParsedBaidocs = useMemo<ParsedBaidoc[]>(() => editorHasBaidocSyntax ? parseBaidocDocument(editorSource) : [], [editorHasBaidocSyntax, editorSource]);
  const parsedBaidocEntries = useMemo(() => hasBaidocSyntax ? parseBaidocQuestionEntries(source) : [], [hasBaidocSyntax, source]);
  const parsedBlocks = useMemo(() => {
    if (hasBaidocSyntax) return parsedBaidocEntries.map(entry => entry.source);
    return /\\begin\s*\{\s*ex\s*\}/i.test(source) ? splitLatexQuestions(source) : [];
  }, [hasBaidocSyntax, parsedBaidocEntries, source]);
  const parsedEditorQuestions = useMemo<ParsedEditorQuestion[]>(() => {
    if (hasBaidocSyntax) return parsedBaidocEntries.map(entry => ({ parsed: parseLatexQuestion(entry.source), passage: entry.passage, passageIndex: entry.passageIndex }));
    return parsedBlocks.map(questionSource => ({ parsed: parseLatexQuestion(questionSource), passage: null }));
  }, [hasBaidocSyntax, parsedBaidocEntries, parsedBlocks]);
  const parsedQuestions = parsedEditorQuestions.map(item => item.parsed);
  const sections = data.sections.filter(item => item.exam_id === exam.id).sort((left, right) => left.sort_order - right.sort_order);
  const sectionIndex = Math.max(0, sections.findIndex(item => item.id === section.id));
  const hsaTemplateAvailable = hsaPart !== null;
  const questionTarget = expectedQuestionCountForSection(exam.exam_type, section.title);
  const draftQuestionCount = parsedQuestions.length;
  const editorDraftQuestionCount = activeHsaSubjectBank?.questionCount ?? draftQuestionCount;
  const savedQuestionCount = sectionQuestions.length;
  const sourceHasUnsavedChanges = source !== savedSource;
  const partSummaries = useMemo(() => {
    const starts = parsedQuestions.flatMap((parsed, index) => parsed.part ? [{ index, part: parsed.part }] : []);
    return starts.map((start, index) => {
      const end = starts[index + 1]?.index ?? parsedQuestions.length;
      return {
        part: start.part as LatexPartNumber,
        count: end - start.index,
        instruction: latexPartInstruction(start.part, end - start.index),
      };
    });
  }, [parsedQuestions]);
  const passageGroupSummaries = useMemo(() => {
    return editorParsedBaidocs.map((group, index) => ({
      index,
      count: group.questions.length,
      start: group.questionStart,
      end: group.questionEnd,
    }));
  }, [editorParsedBaidocs]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") {
        event.preventDefault();
        (document.getElementById("latex-section-form") as HTMLFormElement | null)?.requestSubmit();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function openSourceFindReplace(withReplace = false) {
    const textarea = sourceRef.current;
    const value = textarea?.value ?? editorSource;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? start;
    setFindInitialQuery(value.slice(start, end));
    setFindOpen(true);
    if (withReplace) setReplaceOpen(true);
  }

  function insertSectionSnippet(value: string) {
    const textarea = sourceRef.current;
    const cursor = textarea?.selectionStart ?? editorSource.length;
    const before = editorSource.slice(0, cursor);
    const after = editorSource.slice(cursor);
    const separator = before.trim() ? "\n\n" : "";
    const next = `${before}${separator}${value}\n${after}`;
    commitSourceEdit(next, before.length + separator.length + value.length + 1);
  }

  function movePassageGroup(index: number, direction: -1 | 1) {
    if (!baidocEditorMode) return;
    const nextSource = moveBaidocSource(editorSource, index, direction);
    if (nextSource !== editorSource) commitSourceEdit(nextSource, 0);
  }

  function insertPrivateImage(url: string, caption = "") {
    const textarea = sourceRef.current;
    const cursor = textarea?.selectionStart ?? editorSource.length;
    const before = editorSource.slice(0, cursor);
    const after = editorSource.slice(cursor);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n" : "";
    const snippet = imageLatexSnippet(url, caption);
    const next = `${before}${prefix}    ${snippet}${suffix}${after}`;
    const selection = before.length + prefix.length + 4 + snippet.length;
    commitSourceEdit(next, selection, selection);
  }

  function insertPrivateImageGroup(urls: string[], columns: number, captions: string[] = [], widthPx = 0, frameHeightPx = 0) {
    if (urls.length < 2) {
      if (urls[0]) insertPrivateImage(urls[0], captions[0] ?? "");
      return;
    }
    const textarea = sourceRef.current;
    const cursor = textarea?.selectionStart ?? editorSource.length;
    const before = editorSource.slice(0, cursor);
    const after = editorSource.slice(cursor);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n" : "";
    const snippet = imageRowLatexSnippet(urls, columns, captions, widthPx, frameHeightPx);
    const next = `${before}${prefix}    ${snippet}${suffix}${after}`;
    const selection = before.length + prefix.length + 4 + snippet.length;
    commitSourceEdit(next, selection, selection);
  }

  function commitSourceEdit(nextValue: string, selectionStart: number, selectionEnd = selectionStart) {
    setSource(activeHsaSubjectBank ? replaceHsaPart3SubjectBank(source, activeHsaSubjectBank.code, nextValue) : nextValue);
    window.requestAnimationFrame(() => {
      const textarea = sourceRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function wrapSourceSelection(command: "textbf" | "textit") {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const prefix = `\\${command}{`;
    const next = `${value.slice(0, start)}${prefix}${selected}}${value.slice(end)}`;
    const innerStart = start + prefix.length;
    commitSourceEdit(next, innerStart, innerStart + selected.length);
  }

  function changeSourceCase(upper: boolean) {
    const textarea = sourceRef.current;
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const transformed = upper ? selected.toUpperCase() : selected.toLowerCase();
    commitSourceEdit(`${textarea.value.slice(0, start)}${transformed}${textarea.value.slice(end)}`, start, end);
  }

  function indentSourceSelection(unindent = false) {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const bounds = sourceLineBounds(value, start, end);
    const block = value.slice(bounds.start, bounds.end);
    if (start === end && !unindent) {
      commitSourceEdit(`${value.slice(0, start)}    ${value.slice(start)}`, start + 4, start + 4);
      return;
    }
    const lines = block.split("\n");
    const nextLines = unindent
      ? lines.map(line => line.replace(/^(?: {1,4}|\t)/, ""))
      : lines.map(line => `    ${line}`);
    const replacement = nextLines.join("\n");
    commitSourceEdit(`${value.slice(0, bounds.start)}${replacement}${value.slice(bounds.end)}`, bounds.start, bounds.start + replacement.length);
  }

  function toggleSourceComments() {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const bounds = sourceLineBounds(value, textarea.selectionStart, textarea.selectionEnd);
    const lines = value.slice(bounds.start, bounds.end).split("\n");
    const nonEmptyLines = lines.filter(line => line.trim());
    const shouldUncomment = nonEmptyLines.length > 0 && nonEmptyLines.every(line => /^\s*%/.test(line));
    const replacement = lines.map(line => {
      if (shouldUncomment) return line.replace(/^(\s*)% ?/, "$1");
      const indentation = line.match(/^\s*/)?.[0] ?? "";
      return `${indentation}% ${line.slice(indentation.length)}`;
    }).join("\n");
    commitSourceEdit(`${value.slice(0, bounds.start)}${replacement}${value.slice(bounds.end)}`, bounds.start, bounds.start + replacement.length);
  }

  function duplicateSourceSelection() {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) {
      const selected = value.slice(start, end);
      commitSourceEdit(`${value.slice(0, end)}${selected}${value.slice(end)}`, end, end + selected.length);
      return;
    }
    const bounds = sourceLineBounds(value, start);
    const line = value.slice(bounds.start, bounds.end);
    const duplicateStart = bounds.end + 1;
    commitSourceEdit(`${value.slice(0, bounds.end)}${line}\n${value.slice(bounds.end)}`, duplicateStart, duplicateStart + line.length);
  }

  function deleteSourceLine() {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const bounds = sourceLineBounds(value, textarea.selectionStart);
    const deleteStart = bounds.end < value.length ? bounds.start : Math.max(0, bounds.start - 1);
    const deleteEnd = bounds.end < value.length ? bounds.end + 1 : bounds.end;
    commitSourceEdit(`${value.slice(0, deleteStart)}${value.slice(deleteEnd)}`, deleteStart, deleteStart);
  }

  function moveOrCopySourceLine(direction: -1 | 1, copy = false) {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const cursor = textarea.selectionStart;
    const lineIndex = sourceLineIndex(value, cursor);
    const lines = value.split("\n");
    const targetIndex = copy ? lineIndex + (direction < 0 ? 0 : 1) : lineIndex + direction;
    if (targetIndex < 0 || targetIndex >= lines.length || (!copy && targetIndex === lineIndex)) return;
    const line = lines[lineIndex];
    if (copy) lines.splice(targetIndex, 0, line);
    else [lines[lineIndex], lines[targetIndex]] = [lines[targetIndex], lines[lineIndex]];
    const nextValue = lines.join("\n");
    const nextLineStart = lines.slice(0, targetIndex).reduce((total, item) => total + item.length + 1, 0);
    const oldLineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
    const offset = Math.min(cursor - oldLineStart, line.length);
    commitSourceEdit(nextValue, nextLineStart + offset, nextLineStart + offset);
  }

  function handleSourceKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (handleAutoPairKey(event, commitSourceEdit)) return;
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;

    if (modifier && key === "f") { event.preventDefault(); openSourceFindReplace(); return; }
    if (modifier && key === "h") { event.preventDefault(); openSourceFindReplace(true); return; }
    if (modifier && key === "b") { event.preventDefault(); wrapSourceSelection("textbf"); return; }
    if (modifier && key === "i") { event.preventDefault(); wrapSourceSelection("textit"); return; }
    if (modifier && event.shiftKey && key === "u") { event.preventDefault(); changeSourceCase(false); return; }
    if (modifier && key === "u") { event.preventDefault(); changeSourceCase(true); return; }
    if (modifier && key === "/") { event.preventDefault(); toggleSourceComments(); return; }
    if (modifier && event.shiftKey && key === "d") { event.preventDefault(); duplicateSourceSelection(); return; }
    if (modifier && key === "d") { event.preventDefault(); deleteSourceLine(); return; }
    if (modifier && (key === "]" || key === "[")) { event.preventDefault(); indentSourceSelection(key === "["); return; }
    if (event.key === "Tab") { event.preventDefault(); indentSourceSelection(event.shiftKey); return; }
    if (event.altKey && event.shiftKey && event.key === "ArrowUp") { event.preventDefault(); moveOrCopySourceLine(-1, true); return; }
    if (event.altKey && event.shiftKey && event.key === "ArrowDown") { event.preventDefault(); moveOrCopySourceLine(1, true); return; }
    if (event.altKey && !modifier && event.key === "ArrowUp") { event.preventDefault(); moveOrCopySourceLine(-1); return; }
    if (event.altKey && !modifier && event.key === "ArrowDown") { event.preventDefault(); moveOrCopySourceLine(1); }
  }

  async function importLatexFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const nextSource = await file.text();
      const blocks = splitLatexQuestions(nextSource);
      if (!blocks.length) throw new Error("Không tìm thấy môi trường \\begin{ex}...\\end{ex} trong file.");
      setSource(nextSource);
      setError("");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể đọc file LaTeX.");
    }
  }

  async function loadHsaTemplate() {
    if (!hsaPart || hsaTemplateLoading) return;
    setHsaTemplateLoading(true);
    try {
      const templateModule = await import("../examples/hsa/hsa-full-set.tex?raw");
      const hsaTemplateSource = extractHsaPartSource(templateModule.default, hsaPart);
      if (!hsaTemplateSource) {
        setError(`Chưa có mẫu LaTeX HSA cho Phần ${hsaPart}.`);
        return;
      }
      if (sourceHasUnsavedChanges || draftQuestionCount || savedQuestionCount) {
        const confirmed = window.confirm(`Nạp mẫu HSA Phần ${hsaPart} sẽ thay nội dung hiện có trong ô soạn. Nội dung đã lưu trong cơ sở dữ liệu chỉ thay đổi sau khi bạn bấm “Lưu”. Tiếp tục?`);
        if (!confirmed) return;
      }
      setSource(hsaTemplateSource);
      setError("");
      window.requestAnimationFrame(() => sourceRef.current?.focus());
    } catch {
      setError("Không thể nạp mẫu HSA. Hãy tải lại trang rồi thử lại.");
    } finally {
      setHsaTemplateLoading(false);
    }
  }

  function openPreviewTab() {
    try {
      openExamPreviewTab(exam.id);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể mở tab xem trước.");
    }
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const sourceToSave = source;
    const sourceForParsing = compactLatexSource(source);
    const hasBaidocToSave = /\\begin\s*\{\s*baidoc\s*\}/i.test(sourceForParsing);
    const parsedBaidocsToSave = hasBaidocToSave ? parseBaidocDocument(sourceForParsing) : [];
    const parsedBaidocEntriesToSave = hasBaidocToSave ? parseBaidocQuestionEntries(sourceForParsing) : [];
    const parsedBlocksToSave = hasBaidocToSave
      ? parsedBaidocEntriesToSave.map(entry => entry.source)
      : /\\begin\s*\{\s*ex\s*\}/i.test(sourceForParsing) ? splitLatexQuestions(sourceForParsing) : [];
    const parsedEditorQuestionsToSave: ParsedEditorQuestion[] = hasBaidocToSave
      ? parsedBaidocEntriesToSave.map(entry => ({ parsed: parseLatexQuestion(entry.source), passage: entry.passage, passageIndex: entry.passageIndex }))
      : parsedBlocksToSave.map(questionSource => ({ parsed: parseLatexQuestion(questionSource), passage: null }));
    const parsedQuestionsToSave = parsedEditorQuestionsToSave.map(item => item.parsed);
    const baidocBalance = environmentBalance(sourceForParsing, "baidoc");
    const exBalance = environmentBalance(sourceForParsing, "ex");
    if (baidocBalance.hasAny) {
      if (!baidocBalance.balanced) {
        setError("Mỗi môi trường baidoc phải có đủ cặp \\begin{baidoc}...\\end{baidoc}.");
        return;
      }
      if (parsedBaidocsToSave.some(group => group.questionEnvironmentCount !== group.questionSources.length)) {
        setError("Có câu hỏi trong baidoc chưa đủ cặp \\begin{ex}...\\end{ex}. Hãy kiểm tra từng ngữ liệu.");
        return;
      }
      const emptyGroupIndex = parsedBaidocsToSave.findIndex(group => !group.questionSources.length);
      if (emptyGroupIndex >= 0) {
        setError(`Ngữ liệu ${emptyGroupIndex + 1} chưa có môi trường ex nào.`);
        return;
      }
    }
    if (!exBalance.balanced || exBalance.completeCount !== parsedBlocksToSave.length) {
      setError("Có môi trường ex chưa đủ cặp \\begin{ex}...\\end{ex}. Hãy kiểm tra lại trước khi lưu.");
      return;
    }
    const hasNonCommentContent = sourceForParsing.split(/\r?\n/).some(line => line.trim() && !line.trim().startsWith("%"));
    if (!parsedQuestionsToSave.length && hasNonCommentContent) {
      setError("Không nhận diện được môi trường ex hoàn chỉnh. Hãy giữ mỗi câu trong cặp \\begin{ex}...\\end{ex}.");
      return;
    }
    const invalidOrderingIndex = parsedQuestionsToSave.findIndex(parsed => Boolean(matchingError(parsed)));
    if (invalidOrderingIndex >= 0) { setError(`Câu ${invalidOrderingIndex + 1}: ${matchingError(parsedQuestionsToSave[invalidOrderingIndex])}`); return; }
    const invalidIndex = parsedQuestionsToSave.findIndex(parsed => !parsedQuestionIsUsable(parsed) || parsed.options.length === 1);
    if (invalidIndex >= 0) { setError(`Câu ${invalidIndex + 1} trong phần chưa đủ nội dung hoặc phương án.`); return; }
    if (!parsedQuestionsToSave.length && sectionQuestions.length && !window.confirm(`Ô soạn hiện không còn câu nào. Xoá toàn bộ ${sectionQuestions.length} câu đã lưu trong phần “${section.title}” khỏi cơ sở dữ liệu?`)) return;
    setSaving(true); setError("");
    const sectionSourceResult = await supabase.from("exam_sections").update({ source_latex: sourceToSave }).eq("id", section.id);
    if (sectionSourceResult.error) {
      setSaving(false);
      setError(explainExamSchemaError(sectionSourceResult.error, "Chưa lưu được source nguyên văn. Hãy chạy supabase/migrations/015_exam_section_source.sql trong SQL Editor rồi tải lại trang."));
      return;
    }
    const orderedExisting = sectionQuestions;
    const existingSlots = orderedExisting.map(question => ({
      question,
      source: questionSourceForEditor(question, data.keys.find(key => key.question_id === question.id)).trim(),
      used: false,
    }));
    const existingFor = (parsed: ParsedLatexQuestion, index: number) => {
      const sourceValue = parsed.source.trim();
      const exact = existingSlots.find(slot => !slot.used && slot.source === sourceValue);
      const samePosition = existingSlots[index] && !existingSlots[index].used ? existingSlots[index] : undefined;
      const slot = exact ?? samePosition ?? existingSlots.find(item => !item.used);
      if (slot) slot.used = true;
      return slot?.question;
    };
    const payloadFor = (parsed: ParsedLatexQuestion, index: number, existing: Question | undefined, editorPassage: string | null) => {
      const passage = hasBaidocToSave
        ? (editorPassage ? compactLatexSource(editorPassage) || null : null)
        : null;
      return {
        section_id: section.id,
        sort_order: index,
        prompt: parsed.prompt || "Câu hỏi từ môi trường ex",
        question_type: parsed.questionType,
        options: parsed.options.map((option, optionIndex) => ({ value: option.value || String.fromCharCode(65 + optionIndex), label: option.label })),
        passage,
        media_url: existing?.media_url?.trim() || null,
        instruction: existing?.instruction?.trim() || null,
        points: existing?.points ?? 1,
        latex_source: parsed.source,
        solution_source: parsed.solution || "",
      };
    };
    let failure: { message: string } | null = null;
    let savedCount = 0;
    const retainedIds = new Set<string>();
    const insertedIds: string[] = [];
    for (let index = 0; index < parsedQuestionsToSave.length && !failure; index += 1) {
      const editorQuestion = parsedEditorQuestionsToSave[index];
      const parsed = editorQuestion.parsed;
      const existing = existingFor(parsed, index);
      const payload = payloadFor(parsed, index, existing, editorQuestion.passage);
      let questionId = existing?.id ?? "";
      if (existing) {
        const result = await supabase.from("exam_questions").update(payload).eq("id", existing.id);
        failure = result.error;
      } else {
        const result = await supabase.from("exam_questions").insert(payload).select("id").single();
        failure = result.error;
        questionId = result.data?.id ?? "";
        if (!failure && questionId) insertedIds.push(questionId);
      }
      if (!failure && questionId) {
        const keyResult = await supabase.from("exam_question_keys").upsert({ question_id: questionId, correct_answer: parsed.correctAnswer, explanation: parsed.solution || "" }, { onConflict: "question_id" });
        failure = keyResult.error;
      }
      if (!failure && questionId) {
        retainedIds.add(questionId);
        savedCount += 1;
      }
    }
    const removedQuestions = orderedExisting.filter(question => !retainedIds.has(question.id));
    if (!failure && removedQuestions.length) {
      const result = await supabase.from("exam_questions").delete().in("id", removedQuestions.map(question => question.id));
      failure = result.error;
    }
    if (failure && insertedIds.length) {
      await supabase.from("exam_questions").delete().in("id", insertedIds);
    }
    setSaving(false);
    if (failure) { setError(explainExamSchemaError(failure, "Không thể lưu các câu hỏi.")); return; }
    setSource(sourceToSave);
    setSavedSource(sourceToSave);
    setSavedAt(new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
    signalExamPreviewRefresh(exam.id);
    await onSaved(`Đã lưu ${savedCount} câu${hasBaidocToSave && parsedBaidocsToSave.length ? ` trong ${parsedBaidocsToSave.length} ngữ liệu` : ` trong ${section.title}`}.${removedQuestions.length ? ` Đã xoá ${removedQuestions.length} câu đã bỏ khỏi ô soạn.` : ""}`);
  }

  const examType = normalizeExamType(exam.exam_type).toLowerCase();
  return <div className={`workspace-page question-editor-page exam-theme-${examType}`} data-exam-type={examType}>
    <PageHeader eyebrow={`${room.exam_type} · ${baidocEditorMode ? "SOẠN BÀI THI" : "SOẠN CÂU HỎI"}`} title={baidocEditorMode ? "Soạn bài thi" : "Soạn câu hỏi"} description={`${exam.title} / Phần ${sectionIndex + 1}: ${section.title}`} back={() => navigate(`/admin/exams/${exam.id}`)} actions={<><span className="editor-save-state">{savedAt ? `Đã lưu lúc ${savedAt}` : "Ctrl/⌘ + S để lưu"}</span><button type="button" className="workspace-button ghost" onClick={openPreviewTab}><ExternalLink/>Xem bài thi đã lưu</button><button type="button" className="workspace-button primary" onClick={() => (document.getElementById("latex-section-form") as HTMLFormElement | null)?.requestSubmit()} disabled={saving}><Save/>{saving ? "Đang lưu…" : `Lưu ${draftQuestionCount} câu`}</button></>} />
    <div className="question-editor-context"><div><span className="context-chip">PHẦN {sectionIndex + 1}</span><b>{section.title}</b><ChevronRight/><span>{draftQuestionCount ? `${draftQuestionCount}${questionTarget ? `/${questionTarget}` : ""} câu đã soạn` : "Chưa có môi trường ex"}</span></div><div className={`question-editor-progress ${sourceHasUnsavedChanges ? "is-draft" : "is-saved"}`}><span><b>{baidocEditorMode ? parsedBaidocs.length : draftQuestionCount}</b>{baidocEditorMode ? " ngữ liệu" : questionTarget ? `/${questionTarget} môi trường ex` : " môi trường ex"}</span><small>{sourceHasUnsavedChanges ? `${savedQuestionCount} câu đã lưu · còn thay đổi chưa lưu` : `${savedQuestionCount} câu đã lưu`}</small></div><span className="context-rule"><Code2/> {baidocEditorMode ? <>Một hoặc nhiều <code>\begin&#123;baidoc&#125;...\end&#123;baidoc&#125;</code>; mỗi <code>ex</code> bên trong là một câu.</> : <>Một hoặc nhiều <code>\begin&#123;ex&#125;...\end&#123;ex&#125;</code> trong cùng trình soạn.</>}</span></div>
    <form id="latex-section-form" className="latex-editor-form" onSubmit={submit}>
      <div className="latex-editor-layout question-editor-no-inline-preview">
        <section className="latex-code-column">
          <div className="code-editor-panel">
            <header className="code-editor-header"><div><span className="editor-eyebrow">{baidocEditorMode ? "MÃ NGUỒN BÀI THI" : "MÃ NGUỒN CÂU HỎI"}</span><h2>LaTeX source · {baidocEditorMode ? "bài đọc và câu hỏi" : "1 hoặc nhiều câu"}</h2><p>{baidocEditorMode ? <>Nhập tất cả trong một ô: mỗi <code>baidoc</code> là một ngữ liệu, các môi trường <code>ex</code> bên trong được tự nhận diện thành câu hỏi của ngữ liệu đó.</> : <>Nhập một hoặc nhiều môi trường <code>ex</code>; hệ thống tự tách thành các câu theo đúng thứ tự trong mã. Với THPTQG, bạn cũng có thể chèn <code>baidoc</code> để nhóm dữ kiện và câu hỏi.</>}</p></div><div className="code-editor-header-actions">{hsaTemplateAvailable && <button type="button" className="latex-import-button latex-template-button" onClick={() => void loadHsaTemplate()} disabled={hsaTemplateLoading} title={`Nạp mẫu LaTeX HSA cho Phần ${hsaPart}`}><FilePlus2/>{hsaTemplateLoading ? "Đang nạp…" : "Nạp mẫu HSA"}</button>}<button type="button" className="latex-import-button" onClick={() => openSourceFindReplace()}><Search/>Tìm / thay thế</button><button type="button" className="latex-import-button" onClick={() => fileInputRef.current?.click()}><Upload/>Nhập file .tex</button><ExamImagePicker sectionId={section.id} onUploaded={insertPrivateImage} onUploadedGroup={insertPrivateImageGroup} draftSource={source} /><span className="code-language" title="Ctrl/⌘+B đậm · Ctrl/⌘+I nghiêng · Ctrl/⌘+/ chú thích · Shift+4 bọc $$ · { và [ tự đóng · Tab thụt lề · Ctrl/⌘+F tìm · Ctrl/⌘+H thay thế · Ctrl/⌘+S lưu"><TerminalSquare/>LaTeX · phím tắt</span></div></header>
            {hsaPart === 3 && hsaSubjectBanks.length > 0 && <div className="hsa-subject-editor-tabs">
              <div className="hsa-subject-editor-tabs-head"><div><b>Ngân hàng môn · Phần 3 HSA</b><span>Mỗi tab chỉ sửa nguồn của một môn; khi lưu và preview, hệ thống vẫn ghép toàn bộ ngân hàng.</span></div><small>Giữ nguyên marker <code>% hsa-subject:</code> trong từng câu.</small></div>
              <div className="hsa-subject-editor-tablist" role="tablist" aria-label="Chọn môn soạn HSA Phần 3">
                <button type="button" role="tab" aria-selected={!activeHsaSubjectBank} className={!activeHsaSubjectBank ? "active" : ""} onClick={() => setHsaEditorScope("all")}><span>Toàn bộ source</span><small>{draftQuestionCount} câu</small></button>
                {HSA_PART3_SUBJECTS.map(subject => {
                  const bank = hsaSubjectBanks.find(item => item.code === subject.code);
                  const active = activeHsaSubjectBank?.code === subject.code;
                  return <button type="button" role="tab" key={subject.code} aria-selected={active} className={active ? "active" : ""} disabled={!bank} onClick={() => setHsaEditorScope(subject.code)}><span>{subject.title}</span><small>{bank?.questionCount ?? 0} câu</small></button>;
                })}
              </div>
            </div>}
            <div className="snippet-toolbar"><div><b>Thư viện nhanh</b><span>Chèn vào mã đang soạn</span></div><div className="snippet-list">{SNIPPETS.filter(snippet => !snippet.passageOnly || supportsBaidoc).map(snippet => <button type="button" key={snippet.label} onClick={() => insertSectionSnippet(snippet.value)}><Copy/>{snippet.label}</button>)}</div></div>
            {!baidocEditorMode && partSummaries.length > 0 && <div className="latex-part-detection"><div><b>Nhận diện các phần</b><span>{partSummaries.length} phần · {draftQuestionCount} câu hỏi</span></div><div className="latex-part-detection-groups">{partSummaries.map(group => <span key={group.part}><b>\phan{group.part}</b><small>{group.count} môi trường ex</small><em>{group.instruction}</em></span>)}</div></div>}
            {baidocEditorMode && <div className="latex-passage-detection"><div><b>Nhận diện bài đọc</b><span>{editorParsedBaidocs.length ? `${editorParsedBaidocs.length} ngữ liệu · ${editorDraftQuestionCount} câu hỏi` : "Chưa nhận diện môi trường baidoc"}</span></div><div className="latex-passage-detection-groups">{passageGroupSummaries.map(group => <span key={group.index}><div className="latex-passage-detection-group-copy"><b>Ngữ liệu {group.index + 1}</b><small>{group.count ? `câu ${group.start}–${group.end}` : "chưa có câu"}</small></div><div className="latex-passage-detection-group-actions"><button type="button" aria-label={`Đưa ngữ liệu ${group.index + 1} lên`} disabled={group.index === 0} onClick={() => movePassageGroup(group.index, -1)}><ArrowUp /></button><button type="button" aria-label={`Đưa ngữ liệu ${group.index + 1} xuống`} disabled={group.index === passageGroupSummaries.length - 1} onClick={() => movePassageGroup(group.index, 1)}><ArrowDown /></button></div></span>)}</div></div>}
            <SourceFindReplace source={editorSource} textareaRef={sourceRef} open={findOpen} replaceOpen={replaceOpen} initialQuery={findInitialQuery} onClose={() => { setFindOpen(false); setReplaceOpen(false); }} onToggleReplace={() => setReplaceOpen(value => !value)} onCommit={commitSourceEdit} />
            <textarea ref={sourceRef} className="latex-source-textarea" value={editorSource} onChange={event => setSource(activeHsaSubjectBank ? replaceHsaPart3SubjectBank(source, activeHsaSubjectBank.code, event.target.value) : event.target.value)} onKeyDown={handleSourceKeyDown} spellCheck={false} wrap="soft" aria-label={activeHsaSubjectBank ? `Mã LaTeX môn ${activeHsaSubjectBank.title}, Phần 3 HSA` : baidocEditorMode ? "Mã LaTeX bài đọc và câu hỏi" : "Mã LaTeX của một hoặc nhiều môi trường ex"} />
            <input ref={fileInputRef} className="latex-source-file-input" type="file" accept=".tex,text/plain" onChange={event => void importLatexFile(event)} />
            <footer className="code-editor-footer"><span>{editorSource.length} ký tự</span><span>{editorSource.split("\n").length} dòng</span><span className={draftQuestionCount ? "code-valid" : "code-warning"}>{activeHsaSubjectBank ? `✓ ${activeHsaSubjectBank.questionCount} câu · ${activeHsaSubjectBank.title}` : draftQuestionCount ? (baidocEditorMode ? `✓ Nhận ${parsedBaidocs.length} ngữ liệu · ${draftQuestionCount} câu` : `✓ Nhận ${draftQuestionCount}${questionTarget ? `/${questionTarget}` : ""} môi trường ex`) : "Chưa có môi trường ex"}</span><span>{savedQuestionCount} đã lưu</span></footer>
          </div>
          {error && <p className="form-error latex-editor-error">{error}</p>}
        </section>
      </div>
    </form>
  </div>;
}

function ExamPreviewPage({ examId }: { examId: string }) {
  const candidate = usePreviewCandidateIdentity();
  const { draft, error, loading } = useLiveExamPreview(examId);
  const [mode, setMode] = useState<"exam" | "answer">("exam");
  const [activeSectionId, setActiveSectionId] = useState("");
  const [hsaAnswerCombinationCode, setHsaAnswerCombinationCode] = useState(DEFAULT_HSA_COMBINATION_CODE);

  useEffect(() => {
    if (!draft) return;
    // Sync the selected preview section when a new draft arrives.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setActiveSectionId(current => draft.sections.some(section => section.id === current) ? current : draft.activeSectionId || draft.sections[0]?.id || "");
  }, [draft]);

  if (!draft) return error
    ? <main className="section-preview-error"><TerminalSquare/><h1>Không mở được bản xem trước đề thi</h1><p>{error}</p><button className="workspace-button primary" onClick={() => window.close()}>Đóng tab</button></main>
    : <LoadingIndicator label={loading ? "Đang tải đề thi xem trước…" : "Đang dựng bản xem trước đề thi…"} />;
  if (normalizeExamType(draft.examType) === "THPTQG") return <ThptqgPreview
    examTitle={draft.examTitle}
    roomTitle={draft.roomTitle}
    dashboardTitle={draft.dashboardTitle}
    sections={draft.sections}
    candidateName={candidate.candidateName}
    candidateId={candidate.candidateId}
    mode={mode}
    onModeChange={setMode}
    onClose={() => window.close()}
  />;
  const activeSection = draft.sections.find(section => section.id === activeSectionId) ?? draft.sections[0];
  const activeIndex = Math.max(0, draft.sections.findIndex(section => section.id === activeSection.id));
  const isHsaPreview = normalizeExamType(draft.examType) === "HSA";
  const isTsaPreview = normalizeExamType(draft.examType) === "TSA";
  const hsaAnswerCombination = resolveHsaCombination(hsaAnswerCombinationCode);
  const hasTaggedHsaSubjects = activeSection.questions.some(item => hsaSubjectCodeFromLatex(item.parsed.source) !== null);
  const previewQuestions = isHsaPreview && mode === "answer" && activeIndex === 2 && hasTaggedHsaSubjects
    ? activeSection.questions.filter(item => {
      const subject = hsaSubjectCodeFromLatex(item.parsed.source);
      return subject !== null && hsaAnswerCombination.subjects.includes(subject);
    })
    : activeSection.questions;
  const previewSectionTitle = isHsaPreview && mode === "answer" && activeIndex === 2
    ? `${activeSection.title} · ${hsaAnswerCombination.code}`
    : activeSection.title;
  const headerExtras = <PreviewHeaderControls sections={draft.sections} activeSectionId={activeSection.id} onSectionChange={setActiveSectionId} mode={mode} onModeChange={setMode} onClose={() => window.close()} hsaLayout={isHsaPreview} hsaCombinationCode={isHsaPreview ? hsaAnswerCombination.code : undefined} onHsaCombinationChange={setHsaAnswerCombinationCode} />;
  return <main className="exam-preview-page">
    <div className="exam-preview-layout">
      <section className="exam-preview-stage"><div className="exam-preview-stage-heading"><div><span>PHẦN {activeIndex + 1} / {draft.sections.length}</span><h2>{previewSectionTitle}</h2></div><b>{previewQuestions.length} câu</b></div>{isTsaPreview && mode === "answer" ? <RemixStudyEduReviewPreview previewItems={previewQuestions} title={draft.examTitle} sectionTitle={previewSectionTitle} durationMinutes={activeSection.durationMinutes} candidateName={candidate.candidateName} candidateId={candidate.candidateId} headerExtras={headerExtras} onExit={() => window.close()} /> : <LearnerExamPreview previewItems={previewQuestions} answers={previewQuestions.map(item => item.parsed.correctAnswer)} mode={mode} title={draft.examTitle} examType={draft.examType} sectionTitle={previewSectionTitle} durationMinutes={activeSection.durationMinutes} candidateName={candidate.candidateName} candidateId={candidate.candidateId} headerExtras={headerExtras} standalone showToolbar={false} />}</section>
    </div>
  </main>;
}

function SectionPreviewPage({ draftKey }: { draftKey: string }) {
  const candidate = usePreviewCandidateIdentity();
  const [draft, setDraft] = useState<SectionPreviewDraft | null>(null);
  const [error, setError] = useState("");
  const [mode, setMode] = useState<"exam" | "answer">("exam");

  useEffect(() => {
    if (!draftKey) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setError("Thiếu mã bản xem trước.");
      return;
    }
    const storageKey = `exam-preview:${draftKey}`;
    let lastRaw: string | null = null;
    const applyDraft = (raw: string | null) => {
      if (raw === lastRaw) return;
      lastRaw = raw;
      try {
        const value = parseSectionPreviewDraft(raw);
        setDraft(value);
        setError("");
      } catch (value) {
        setError(value instanceof Error ? value.message : "Không thể đọc bản xem trước.");
      }
    };
    applyDraft(window.localStorage.getItem(storageKey));
    const onStorage = (event: StorageEvent) => { if (event.key === storageKey) applyDraft(event.newValue); };
    window.addEventListener("storage", onStorage);
    let channel: BroadcastChannel | null = null;
    if (typeof BroadcastChannel !== "undefined") {
      channel = new BroadcastChannel(storageKey);
      channel.onmessage = (event: MessageEvent<string>) => applyDraft(event.data);
    }
    const pollId = window.setInterval(() => applyDraft(window.localStorage.getItem(storageKey)), 250);
    return () => {
      window.removeEventListener("storage", onStorage);
      channel?.close();
      window.clearInterval(pollId);
    };
  }, [draftKey]);

  if (error) return <main className="section-preview-error"><TerminalSquare/><h1>Không mở được bản xem trước</h1><p>{error}</p><button className="workspace-button primary" onClick={() => window.close()}>Đóng tab</button></main>;
  if (!draft) return <LoadingIndicator label="Đang dựng bản xem trước phần thi…" />;
  const headerExtras = <PreviewHeaderControls mode={mode} onModeChange={setMode} onClose={() => window.close()} />;
  return <main className="section-preview-page"><LearnerExamPreview previewItems={draft.questions} answers={draft.questions.map(item => item.parsed.correctAnswer)} mode={mode} onModeChange={setMode} title={draft.examTitle} sectionTitle={draft.sectionTitle} durationMinutes={draft.durationMinutes} candidateName={candidate.candidateName} candidateId={candidate.candidateId} headerExtras={headerExtras} standalone showToolbar={false} /></main>;
}

function QuestionEditorPage({ exam, room, section, question, answerKey, data, navigate, onSaved }: { exam: Exam; room: Room; section: Section; question: Question | null; answerKey?: KeyRow; data: DataState; navigate: (path: string) => void; onSaved: (questionId?: string) => Promise<void> }) {
  const sourceFromQuestion = question?.latex_source?.trim() || (question ? questionToLatex({ prompt: question.prompt, question_type: question.question_type, options: question.options.map((option, index) => typeof option === "string" ? { value: String.fromCharCode(65 + index), label: option } : option) }, answerKey?.correct_answer, question.solution_source ?? answerKey?.explanation ?? "") : buildStarterSource());
  const initialParsed = parseLatexQuestion(sourceFromQuestion);
  const [source, setSource] = useState(sourceFromQuestion);
  const [solution, setSolution] = useState(question?.solution_source ?? answerKey?.explanation ?? initialParsed.solution);
  const passage = question?.passage ?? "";
  const mediaUrl = question?.media_url ?? "";
  const instruction = question?.instruction ?? "";
  const points = question?.points ?? 1;
  const [answerOverride, setAnswerOverride] = useState(answerText(answerKey?.correct_answer));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [findOpen, setFindOpen] = useState(false);
  const [replaceOpen, setReplaceOpen] = useState(false);
  const [findInitialQuery, setFindInitialQuery] = useState("");
  const [importedFileName, setImportedFileName] = useState("");
  const [importedBlocks, setImportedBlocks] = useState<string[]>([]);
  const [importedIndex, setImportedIndex] = useState(0);
  const [bulkImporting, setBulkImporting] = useState(false);
  const sourceRef = useRef<HTMLTextAreaElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(question);
  const sections = data.sections.filter(item => item.exam_id === exam.id).sort((a, b) => a.sort_order - b.sort_order);
  const sectionIndex = Math.max(0, sections.findIndex(item => item.id === section.id));

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "s") { event.preventDefault(); const form = document.getElementById("latex-question-form") as HTMLFormElement | null; form?.requestSubmit(); }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  function openSourceFindReplace(withReplace = false) {
    const textarea = sourceRef.current;
    const value = textarea?.value ?? source;
    const start = textarea?.selectionStart ?? value.length;
    const end = textarea?.selectionEnd ?? start;
    setFindInitialQuery(value.slice(start, end));
    setFindOpen(true);
    if (withReplace) setReplaceOpen(true);
  }

  function insertSnippet(value: string) {
    const textarea = sourceRef.current;
    if (value.includes("\\begin{ex}")) { setSource(value); return; }
    const current = ensureExEnvironment(source);
    const endIndex = current.lastIndexOf("\\end{ex}");
    const before = endIndex >= 0 ? current.slice(0, endIndex) : current;
    const after = endIndex >= 0 ? current.slice(endIndex) : "\n\\end{ex}";
    const cursor = textarea?.selectionStart ?? before.length;
    const insertionPoint = cursor > 0 && cursor < before.length ? cursor : before.length;
    const next = `${before.slice(0, insertionPoint)}\n    ${value.split("\n").join("\n    ")}\n${before.slice(insertionPoint)}${after}`;
    setSource(next);
  }

  function insertPrivateImage(url: string, caption = "") {
    const textarea = sourceRef.current;
    const cursor = textarea?.selectionStart ?? source.length;
    const before = source.slice(0, cursor);
    const after = source.slice(cursor);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n" : "";
    const snippet = imageLatexSnippet(url, caption);
    const next = `${before}${prefix}    ${snippet}${suffix}${after}`;
    const selection = before.length + prefix.length + 4 + snippet.length;
    commitSourceEdit(next, selection, selection);
  }

  function insertPrivateImageGroup(urls: string[], columns: number, captions: string[] = [], widthPx = 0, frameHeightPx = 0) {
    if (urls.length < 2) {
      if (urls[0]) insertPrivateImage(urls[0], captions[0] ?? "");
      return;
    }
    const textarea = sourceRef.current;
    const cursor = textarea?.selectionStart ?? source.length;
    const before = source.slice(0, cursor);
    const after = source.slice(cursor);
    const prefix = before && !before.endsWith("\n") ? "\n" : "";
    const suffix = after && !after.startsWith("\n") ? "\n" : "";
    const snippet = imageRowLatexSnippet(urls, columns, captions, widthPx, frameHeightPx);
    const next = `${before}${prefix}    ${snippet}${suffix}${after}`;
    const selection = before.length + prefix.length + 4 + snippet.length;
    commitSourceEdit(next, selection, selection);
  }

  function commitSourceEdit(nextValue: string, selectionStart: number, selectionEnd = selectionStart) {
    setSource(nextValue);
    window.requestAnimationFrame(() => {
      const textarea = sourceRef.current;
      if (!textarea) return;
      textarea.focus();
      textarea.setSelectionRange(selectionStart, selectionEnd);
    });
  }

  function wrapSourceSelection(command: "textbf" | "textit") {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = value.slice(start, end);
    const prefix = `\\${command}{`;
    const next = `${value.slice(0, start)}${prefix}${selected}}${value.slice(end)}`;
    const innerStart = start + prefix.length;
    commitSourceEdit(next, innerStart, innerStart + selected.length);
  }

  function changeSourceCase(upper: boolean) {
    const textarea = sourceRef.current;
    if (!textarea || textarea.selectionStart === textarea.selectionEnd) return;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const selected = textarea.value.slice(start, end);
    const transformed = upper ? selected.toUpperCase() : selected.toLowerCase();
    commitSourceEdit(`${textarea.value.slice(0, start)}${transformed}${textarea.value.slice(end)}`, start, end);
  }

  function indentSourceSelection(unindent = false) {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const bounds = sourceLineBounds(value, start, end);
    const block = value.slice(bounds.start, bounds.end);
    if (start === end && !unindent) {
      commitSourceEdit(`${value.slice(0, start)}    ${value.slice(start)}`, start + 4, start + 4);
      return;
    }
    const lines = block.split("\n");
    const nextLines = unindent
      ? lines.map(line => line.replace(/^(?: {1,4}|\t)/, ""))
      : lines.map(line => `    ${line}`);
    const replacement = nextLines.join("\n");
    commitSourceEdit(`${value.slice(0, bounds.start)}${replacement}${value.slice(bounds.end)}`, bounds.start, bounds.start + replacement.length);
  }

  function toggleSourceComments() {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const bounds = sourceLineBounds(value, textarea.selectionStart, textarea.selectionEnd);
    const lines = value.slice(bounds.start, bounds.end).split("\n");
    const shouldUncomment = lines.filter(line => line.trim()).length > 0 && lines.filter(line => line.trim()).every(line => /^\s*%/.test(line));
    const replacement = lines.map(line => {
      if (shouldUncomment) return line.replace(/^(\s*)% ?/, "$1");
      const indentation = line.match(/^\s*/)?.[0] ?? "";
      return `${indentation}% ${line.slice(indentation.length)}`;
    }).join("\n");
    commitSourceEdit(`${value.slice(0, bounds.start)}${replacement}${value.slice(bounds.end)}`, bounds.start, bounds.start + replacement.length);
  }

  function duplicateSourceSelection() {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    if (start !== end) {
      const selected = value.slice(start, end);
      commitSourceEdit(`${value.slice(0, end)}${selected}${value.slice(end)}`, end, end + selected.length);
      return;
    }
    const bounds = sourceLineBounds(value, start);
    const line = value.slice(bounds.start, bounds.end);
    const insertion = `${line}${bounds.end < value.length ? "\n" : "\n"}`;
    const duplicateStart = bounds.end + 1;
    commitSourceEdit(`${value.slice(0, bounds.end)}${insertion}${value.slice(bounds.end)}`, duplicateStart, duplicateStart + line.length);
  }

  function deleteSourceLine() {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const bounds = sourceLineBounds(value, textarea.selectionStart);
    const deleteStart = bounds.end < value.length ? bounds.start : Math.max(0, bounds.start - 1);
    const deleteEnd = bounds.end < value.length ? bounds.end + 1 : bounds.end;
    commitSourceEdit(`${value.slice(0, deleteStart)}${value.slice(deleteEnd)}`, deleteStart, deleteStart);
  }

  function moveOrCopySourceLine(direction: -1 | 1, copy = false) {
    const textarea = sourceRef.current;
    if (!textarea) return;
    const value = textarea.value;
    const cursor = textarea.selectionStart;
    const lineIndex = sourceLineIndex(value, cursor);
    const lines = value.split("\n");
    const targetIndex = copy ? lineIndex + (direction < 0 ? 0 : 1) : lineIndex + direction;
    if (targetIndex < 0 || targetIndex >= lines.length || (!copy && targetIndex === lineIndex)) return;
    const line = lines[lineIndex];
    if (copy) lines.splice(targetIndex, 0, line);
    else [lines[lineIndex], lines[targetIndex]] = [lines[targetIndex], lines[lineIndex]];
    const nextValue = lines.join("\n");
    const nextLineIndex = copy ? targetIndex : targetIndex;
    const nextLineStart = lines.slice(0, nextLineIndex).reduce((total, item) => total + item.length + 1, 0);
    const oldLineStart = value.lastIndexOf("\n", Math.max(0, cursor - 1)) + 1;
    const offset = Math.min(cursor - oldLineStart, line.length);
    commitSourceEdit(nextValue, nextLineStart + offset, nextLineStart + offset);
  }

  function handleSourceKeyDown(event: ReactKeyboardEvent<HTMLTextAreaElement>) {
    if (handleAutoPairKey(event, commitSourceEdit)) return;
    const key = event.key.toLowerCase();
    const modifier = event.ctrlKey || event.metaKey;

    if (modifier && key === "f") { event.preventDefault(); openSourceFindReplace(); return; }
    if (modifier && key === "h") { event.preventDefault(); openSourceFindReplace(true); return; }
    if (modifier && key === "b") { event.preventDefault(); wrapSourceSelection("textbf"); return; }
    if (modifier && key === "i") { event.preventDefault(); wrapSourceSelection("textit"); return; }
    if (modifier && event.shiftKey && key === "u") { event.preventDefault(); changeSourceCase(false); return; }
    if (modifier && key === "u") { event.preventDefault(); changeSourceCase(true); return; }
    if (modifier && key === "/") { event.preventDefault(); toggleSourceComments(); return; }
    if (modifier && event.shiftKey && key === "d") { event.preventDefault(); duplicateSourceSelection(); return; }
    if (modifier && key === "d") { event.preventDefault(); deleteSourceLine(); return; }
    if (modifier && (key === "]" || key === "[")) { event.preventDefault(); indentSourceSelection(key === "["); return; }
    if (event.key === "Tab") { event.preventDefault(); indentSourceSelection(event.shiftKey); return; }
    if (event.altKey && event.shiftKey && event.key === "ArrowUp") { event.preventDefault(); moveOrCopySourceLine(-1, true); return; }
    if (event.altKey && event.shiftKey && event.key === "ArrowDown") { event.preventDefault(); moveOrCopySourceLine(1, true); return; }
    if (event.altKey && !modifier && event.key === "ArrowUp") { event.preventDefault(); moveOrCopySourceLine(-1); return; }
    if (event.altKey && !modifier && event.key === "ArrowDown") { event.preventDefault(); moveOrCopySourceLine(1); }
  }

  function loadImportedBlock(block: string, index: number) {
    const nextParsed = parseLatexQuestion(block);
    setImportedIndex(index);
    setSource(block);
    setSolution(nextParsed.solution);
    setAnswerOverride("");
    setError("");
  }

  function selectImportedBlock(index: number) {
    const block = importedBlocks[index];
    if (block) loadImportedBlock(block, index);
  }

  async function importLatexFile(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    try {
      const blocks = splitLatexQuestions(await file.text());
      if (!blocks.length) throw new Error("Không tìm thấy môi trường \\begin{ex}...\\end{ex} trong file.");
      setImportedFileName(file.name);
      setImportedBlocks(blocks);
      loadImportedBlock(blocks[0], 0);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể đọc file LaTeX.");
    }
  }

  async function importAllQuestions() {
    if (!supabase || importedBlocks.length < 2 || bulkImporting) return;
    const parsedBlocks = importedBlocks.map(sourceValue => ({ source: sourceValue, parsed: parseLatexQuestion(sourceValue) }));
    const invalidOrderingIndex = parsedBlocks.findIndex(({ parsed: item }) => Boolean(matchingError(item)));
    if (invalidOrderingIndex >= 0) {
      setError(`Câu ${invalidOrderingIndex + 1}: ${matchingError(parsedBlocks[invalidOrderingIndex].parsed)}`);
      return;
    }
    const invalidIndex = parsedBlocks.findIndex(({ parsed: item }) => (
      (!item.prompt && !item.options.length && !/\\cham\b|_{3,}/.test(item.body)) || item.options.length === 1
    ));
    if (invalidIndex >= 0) {
      setError(`Câu ${invalidIndex + 1} trong file chưa đủ nội dung hoặc phương án để nhập.`);
      return;
    }
    if (!window.confirm(`Nhập ${parsedBlocks.length} câu từ ${importedFileName || "file LaTeX"} vào phần “${section.title}”?`)) return;
    setBulkImporting(true);
    setError("");
    const startOrder = data.questions.filter(item => item.section_id === section.id).length;
    const payloads = parsedBlocks.map(({ source: sourceValue, parsed: item }, index) => ({
      section_id: section.id,
      sort_order: startOrder + index,
      prompt: item.prompt || "Câu hỏi từ môi trường ex",
      question_type: item.questionType,
      options: item.options.map((option, optionIndex) => ({ value: option.value || String.fromCharCode(65 + optionIndex), label: option.label })),
      passage: passage.trim() || null,
      media_url: mediaUrl.trim() || null,
      instruction: instruction.trim() || null,
      points: Number(points) || 0,
      latex_source: ensureExEnvironment(sourceValue),
      solution_source: item.solution || "",
    }));
    const result = await supabase.from("exam_questions").insert(payloads).select("id");
    const inserted = (result.data ?? []) as Array<{ id: string }>;
    if (result.error || inserted.length !== payloads.length) {
      setBulkImporting(false);
      setError(explainExamSchemaError(result.error, "Không thể tạo đủ các câu hỏi từ file LaTeX."));
      if (inserted.length) await supabase.from("exam_questions").delete().in("id", inserted.map(item => item.id));
      return;
    }
    const keyResult = await supabase.from("exam_question_keys").insert(parsedBlocks.map(({ parsed: item }, index) => ({
      question_id: inserted[index].id,
      correct_answer: item.correctAnswer,
      explanation: item.solution || "",
    })));
    if (keyResult.error) {
      await supabase.from("exam_questions").delete().in("id", inserted.map(item => item.id));
      setBulkImporting(false);
      setError(explainExamSchemaError(keyResult.error, "Không thể lưu đáp án câu hỏi."));
      return;
    }
    setBulkImporting(false);
    setSavedAt(new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
    signalExamPreviewRefresh(exam.id);
    await onSaved();
  }

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (!supabase) return;
    const finalSource = appendSolution(source, solution);
    const finalParsed = parseLatexQuestion(finalSource);
    const effectiveSolution = finalParsed.solution.trim() || solution.trim();
    const matchingValidation = matchingError(finalParsed);
    if (matchingValidation) { setError(matchingValidation); return; }
    if (!finalParsed.prompt && !finalParsed.options.length && !/\\cham\b|_{3,}/.test(finalParsed.body)) { setError("Môi trường ex cần có nội dung câu hỏi trước khi lưu."); return; }
    if (finalParsed.options.length && finalParsed.options.length < 2) { setError("Câu trắc nghiệm cần ít nhất hai phương án trong mã LaTeX."); return; }
    setSaving(true); setError("");
    const answer = answerOverride.trim() ? answerForType(finalParsed.questionType, answerOverride) : finalParsed.correctAnswer;
    const options = finalParsed.options.map((option, index) => ({ value: option.value || String.fromCharCode(65 + index), label: option.label }));
    const payload = { prompt: finalParsed.prompt || "Câu hỏi từ môi trường ex", question_type: finalParsed.questionType, options, passage: passage.trim() || null, media_url: mediaUrl.trim() || null, instruction: instruction.trim() || null, points: Number(points) || 0, latex_source: finalSource, solution_source: effectiveSolution };
    let questionId = question?.id ?? "";
    let failure: { message: string } | null = null;
    if (question) {
      const result = await supabase.from("exam_questions").update(payload).eq("id", question.id);
      failure = result.error;
      if (!failure) failure = (await supabase.from("exam_question_keys").upsert({ question_id: question.id, correct_answer: answer, explanation: effectiveSolution }, { onConflict: "question_id" })).error;
    } else {
      const result = await supabase.from("exam_questions").insert({ ...payload, section_id: section.id, sort_order: data.questions.filter(item => item.section_id === section.id).length }).select("id").single();
      questionId = result.data?.id ?? "";
      failure = result.error;
      if (!failure && questionId) {
        const keyResult = await supabase.from("exam_question_keys").insert({ question_id: questionId, correct_answer: answer, explanation: effectiveSolution });
        failure = keyResult.error;
        if (failure) await supabase.from("exam_questions").delete().eq("id", questionId);
      }
    }
    setSaving(false);
    if (failure || !questionId) { setError(explainExamSchemaError(failure, "Không thể lưu câu hỏi. Hãy kiểm tra migration 011_exam_editor_schema_compat.sql.")); return; }
    setSavedAt(new Intl.DateTimeFormat("vi-VN", { hour: "2-digit", minute: "2-digit", second: "2-digit" }).format(new Date()));
    signalExamPreviewRefresh(exam.id);
    await onSaved(questionId);
  }

  function openPreviewTab() {
    try {
      openExamPreviewTab(exam.id);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể mở tab xem trước.");
    }
  }

  const examType = normalizeExamType(exam.exam_type).toLowerCase();
  return <div className={`workspace-page question-editor-page exam-theme-${examType}`} data-exam-type={examType}>
    <PageHeader eyebrow={`${room.exam_type} · SOẠN CÂU HỎI`} title={isEditing ? "Chỉnh sửa một môi trường ex" : "Thêm một môi trường ex"} description={`${exam.title} / Phần ${sectionIndex + 1}: ${section.title}`} back={() => navigate(`/admin/exams/${exam.id}`)} actions={<><span className="editor-save-state">{savedAt ? `Đã lưu lúc ${savedAt}` : "Ctrl/⌘ + S để lưu"}</span><button type="button" className="workspace-button ghost" onClick={openPreviewTab}><ExternalLink/>Xem bài thi đã lưu</button><button className="workspace-button primary" onClick={() => (document.getElementById("latex-question-form") as HTMLFormElement | null)?.requestSubmit()} disabled={saving}><Save/>{saving ? "Đang lưu…" : "Lưu câu hỏi"}</button></>} />
    <div className="question-editor-context"><div><span className="context-chip">PHẦN {sectionIndex + 1}</span><b>{section.title}</b><ChevronRight/><span>{isEditing ? `Câu ${question ? question.sort_order + 1 : ""}` : "Câu mới"}</span></div><span className="context-rule"><Code2/> Một câu hỏi = một <code>\begin&#123;ex&#125;...\end&#123;ex&#125;</code></span></div>
    <form id="latex-question-form" className="latex-editor-form" onSubmit={submit}>
      <div className="latex-editor-layout question-editor-no-inline-preview">
        <section className="latex-code-column">
          <div className="code-editor-panel">
            <header className="code-editor-header">
              <div>
                <span className="editor-eyebrow">MÃ NGUỒN CÂU HỎI</span>
                <h2>LaTeX source</h2>
                <p>Viết đúng một môi trường <code>ex</code>, giống cách soạn trong dự án TSA Remix Pro.</p>
              </div>
              <div className="code-editor-header-actions">
                <button type="button" className="latex-import-button" onClick={() => openSourceFindReplace()}><Search/>Tìm / thay thế</button>
<ExamImagePicker sectionId={section.id} onUploaded={insertPrivateImage} onUploadedGroup={insertPrivateImageGroup} draftSource={source} />
                <button type="button" className="latex-import-button" onClick={() => fileInputRef.current?.click()}><Upload/>Nhập file .tex</button>
                <span className="code-language" title="Ctrl/⌘+B đậm · Ctrl/⌘+I nghiêng · Ctrl/⌘+/ chú thích · Shift+4 bọc $$ · { và [ tự đóng · Tab thụt lề · Ctrl/⌘+F tìm · Ctrl/⌘+H thay thế · Ctrl/⌘+S lưu"><TerminalSquare/>LaTeX · phím tắt</span>
              </div>
            </header>
            <input ref={fileInputRef} className="latex-source-file-input" type="file" accept=".tex,text/plain" onChange={event => void importLatexFile(event)} />
            {importedBlocks.length > 1 && <div className="latex-file-import">
              <div className="latex-file-import-copy">
                <b>Đọc file LaTeX</b>
                <span>{importedFileName ? importedFileName + " · " + importedBlocks.length + " môi trường ex" : "Chọn file .tex để nạp câu hỏi vào trình soạn"}</span>
              </div>
              <div className="latex-file-import-actions">
                <label>Câu đang nạp
                  <select value={importedIndex} onChange={event => selectImportedBlock(Number(event.target.value))} aria-label="Chọn câu trong file LaTeX">
                    {importedBlocks.map((_, index) => <option value={index} key={index}>Câu {index + 1}</option>)}
                  </select>
                </label>
                <button type="button" className="latex-bulk-import-button" onClick={() => void importAllQuestions()} disabled={bulkImporting}><Layers3/>{bulkImporting ? "Đang nhập…" : "Nhập tất cả " + importedBlocks.length + " câu"}</button>
              </div>
            </div>
            }
            <div className="snippet-toolbar">
              <div><b>Thư viện nhanh</b><span>Chèn vào mã đang soạn</span></div>
              <div className="snippet-list">{SNIPPETS.map(snippet => <button type="button" key={snippet.label} onClick={() => insertSnippet(snippet.value)}><Copy/>{snippet.label}</button>)}</div>
            </div>
            <SourceFindReplace source={source} textareaRef={sourceRef} open={findOpen} replaceOpen={replaceOpen} initialQuery={findInitialQuery} onClose={() => { setFindOpen(false); setReplaceOpen(false); }} onToggleReplace={() => setReplaceOpen(value => !value)} onCommit={commitSourceEdit} />
            <textarea ref={sourceRef} className="latex-source-textarea" value={source} onChange={event => setSource(event.target.value)} onKeyDown={handleSourceKeyDown} spellCheck={false} wrap="soft" aria-label="Mã LaTeX của môi trường ex" />
            <footer className="code-editor-footer">
              <span>{source.length} ký tự</span>
              <span>{source.split("\n").length} dòng</span>
              <span className={/\\begin\{ex\}/.test(source) && /\\end\{ex\}/.test(source) ? "code-valid" : "code-warning"}>{/\\begin\{ex\}/.test(source) && /\\end\{ex\}/.test(source) ? "✓ Có môi trường ex" : "Sẽ tự bọc ex khi lưu"}</span>
            </footer>
          </div>
          {error && <p className="form-error latex-editor-error">{error}</p>}
        </section>
      </div>
    </form>
  </div>;
}

"use client";

import { useCallback, useEffect, useMemo, useState, type FormEvent } from "react";
import { BookOpen, CheckSquare, ChevronRight, FilePlus2, Filter, Library, Link2, Pencil, Plus, RefreshCw, Save, Search, Tags, Upload, X } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import { QUESTION_FORMATS, questionTypeLabel, type QuestionType } from "../lib/exam-config";
import {
  QUESTION_BANK_DIFFICULTIES,
  normalizeTags,
  type QuestionBank,
  type QuestionBankDifficulty,
  type QuestionBankItem,
  type QuestionBankNode,
  type QuestionBankSourceExam,
  type QuestionBankSourceSection,
} from "../lib/question-bank";
import LoadingIndicator from "./loading-indicator";
import "./admin-question-bank.css";

type Navigate = (path: string) => void;
type BankForm = { name: string; subjectCode: string; grade: string; curriculum: string; description: string };
type NodeForm = { title: string; parentId: string; nodeType: "topic" | "unit" };
type ItemForm = {
  prompt: string;
  questionType: QuestionType;
  options: string;
  correctAnswer: string;
  explanation: string;
  passage: string;
  mediaUrl: string;
  instruction: string;
  solutionSource: string;
  difficulty: QuestionBankDifficulty | "";
  tags: string;
  nodeId: string;
};

type Payload = {
  banks?: QuestionBank[];
  bank?: QuestionBank;
  nodes?: QuestionBankNode[];
  items?: QuestionBankItem[];
  sourceExams?: QuestionBankSourceExam[];
  sourceSections?: QuestionBankSourceSection[];
  error?: string;
};

const emptyBankForm: BankForm = { name: "", subjectCode: "", grade: "", curriculum: "", description: "" };
const emptyNodeForm: NodeForm = { title: "", parentId: "", nodeType: "topic" };
const emptyItemForm: ItemForm = {
  prompt: "",
  questionType: "single",
  options: "A |\nB |\nC |\nD |",
  correctAnswer: "A",
  explanation: "",
  passage: "",
  mediaUrl: "",
  instruction: "",
  solutionSource: "",
  difficulty: "",
  tags: "",
  nodeId: "",
};

function parseOptions(value: string) {
  return value.split("\n").map((line, index) => {
    const [rawValue, ...labelParts] = line.split("|");
    const optionValue = rawValue.trim() || String.fromCharCode(65 + index);
    return { value: optionValue.slice(0, 20), label: labelParts.join("|").trim() };
  }).filter(option => option.label);
}

function parseAnswer(value: string) {
  const values = value.split(",").map(item => item.trim()).filter(Boolean);
  return values.length > 1 ? values : values[0] ?? null;
}

function answerLabel(value: unknown) {
  return Array.isArray(value) ? value.join(", ") : value === null || value === undefined ? "Chưa có" : String(value);
}

function dateLabel(value: string) {
  const date = new Date(value);
  return Number.isFinite(date.getTime()) ? date.toLocaleDateString("vi-VN") : "—";
}

export default function AdminQuestionBank({ navigate }: { navigate: Navigate }) {
  const [banks, setBanks] = useState<QuestionBank[]>([]);
  const [selectedBankId, setSelectedBankId] = useState("");
  const [selectedBank, setSelectedBank] = useState<QuestionBank | null>(null);
  const [nodes, setNodes] = useState<QuestionBankNode[]>([]);
  const [items, setItems] = useState<QuestionBankItem[]>([]);
  const [sourceExams, setSourceExams] = useState<QuestionBankSourceExam[]>([]);
  const [sourceSections, setSourceSections] = useState<QuestionBankSourceSection[]>([]);
  const [search, setSearch] = useState("");
  const [difficulty, setDifficulty] = useState<QuestionBankDifficulty | "">("");
  const [selectedNodeId, setSelectedNodeId] = useState("");
  const [selectedItemIds, setSelectedItemIds] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [bankFormOpen, setBankFormOpen] = useState(false);
  const [nodeFormOpen, setNodeFormOpen] = useState(false);
  const [itemFormOpen, setItemFormOpen] = useState(false);
  const [editingItemId, setEditingItemId] = useState("");
  const [importFormOpen, setImportFormOpen] = useState(false);
  const [attachFormOpen, setAttachFormOpen] = useState(false);
  const [bankForm, setBankForm] = useState<BankForm>(emptyBankForm);
  const [nodeForm, setNodeForm] = useState<NodeForm>(emptyNodeForm);
  const [itemForm, setItemForm] = useState<ItemForm>(emptyItemForm);
  const [seedNodeId, setSeedNodeId] = useState("");
  const [seedSectionId, setSeedSectionId] = useState("");
  const [attachExamId, setAttachExamId] = useState("");
  const [attachSectionId, setAttachSectionId] = useState("");

  const loadCatalog = useCallback(async () => {
    const response = await authenticatedFetch("/api/admin/question-banks", { cache: "no-store" });
    const payload = await response.json() as Payload;
    if (!response.ok) throw new Error(payload.error || "Không thể tải ngân hàng câu hỏi.");
    setBanks(payload.banks ?? []);
    setSourceExams(payload.sourceExams ?? []);
    setSourceSections(payload.sourceSections ?? []);
    if (!selectedBankId && payload.banks?.[0]?.id) setSelectedBankId(payload.banks[0].id);
    return payload;
  }, [selectedBankId]);

  const loadBank = useCallback(async (bankId: string) => {
    if (!bankId) {
      setSelectedBank(null); setNodes([]); setItems([]); return;
    }
    const response = await authenticatedFetch(`/api/admin/question-banks?bankId=${encodeURIComponent(bankId)}`, { cache: "no-store" });
    const payload = await response.json() as Payload;
    if (!response.ok) throw new Error(payload.error || "Không thể tải ngân hàng câu hỏi.");
    setSelectedBank(payload.bank ?? null);
    setNodes(payload.nodes ?? []);
    setItems(payload.items ?? []);
    setSelectedItemIds(new Set());
  }, []);

  const refresh = useCallback(async (bankId = selectedBankId) => {
    setLoading(true); setError("");
    try {
      await loadCatalog();
      if (bankId) await loadBank(bankId);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể tải ngân hàng câu hỏi.");
    } finally {
      setLoading(false);
    }
  }, [loadBank, loadCatalog, selectedBankId]);

  useEffect(() => {
    // Network-backed state is populated after the request resolves.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh("");
  }, [refresh]);
  useEffect(() => {
    if (selectedBankId) {
      // Network-backed state is populated after the request resolves.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      void loadBank(selectedBankId).catch(value => setError(value instanceof Error ? value.message : "Không thể tải ngân hàng câu hỏi."));
    }
  }, [loadBank, selectedBankId]);

  const selectedSections = useMemo(() => sourceSections.filter(section => section.exam_id === attachExamId), [attachExamId, sourceSections]);
  const seedSections = useMemo(() => sourceSections, [sourceSections]);
  const visibleItems = useMemo(() => {
    const query = search.trim().toLocaleLowerCase("vi");
    return items.filter(item => {
      if (difficulty && item.difficulty !== difficulty) return false;
      if (selectedNodeId && item.node_id !== selectedNodeId) return false;
      if (!query) return true;
      return `${item.prompt} ${item.tags.join(" ")}`.toLocaleLowerCase("vi").includes(query);
    });
  }, [difficulty, items, search, selectedNodeId]);

  function setField<K extends keyof BankForm>(key: K, value: BankForm[K]) { setBankForm(previous => ({ ...previous, [key]: value })); }
  function setItemField<K extends keyof ItemForm>(key: K, value: ItemForm[K]) { setItemForm(previous => ({ ...previous, [key]: value })); }

  async function post(body: Record<string, unknown>) {
    const response = await authenticatedFetch("/api/admin/question-banks", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    const payload = await response.json() as Payload & { imported?: number; attached?: number; bank?: QuestionBank };
    if (!response.ok) throw new Error(payload.error || "Không thể lưu dữ liệu.");
    return payload;
  }

  async function createBank(event: FormEvent) {
    event.preventDefault(); setSaving(true); setError(""); setNotice("");
    try {
      const payload = await post({ action: "create_bank", name: bankForm.name, subjectCode: bankForm.subjectCode, grade: bankForm.grade, curriculum: bankForm.curriculum, description: bankForm.description });
      setBankForm(emptyBankForm); setBankFormOpen(false); setNotice("Đã tạo ngân hàng câu hỏi.");
      await refresh(payload.bank?.id ?? "");
      if (payload.bank?.id) setSelectedBankId(payload.bank.id);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể tạo ngân hàng."); }
    finally { setSaving(false); }
  }

  async function createNode(event: FormEvent) {
    event.preventDefault(); if (!selectedBankId) return; setSaving(true); setError(""); setNotice("");
    try {
      await post({ action: "create_node", bankId: selectedBankId, title: nodeForm.title, parentId: nodeForm.parentId || null, nodeType: nodeForm.nodeType });
      setNodeForm(emptyNodeForm); setNodeFormOpen(false); setNotice("Đã thêm chủ đề."); await loadBank(selectedBankId);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể thêm chủ đề."); }
    finally { setSaving(false); }
  }

  async function createItem(event: FormEvent) {
    event.preventDefault(); if (!selectedBankId) return; setSaving(true); setError(""); setNotice("");
    try {
      await post({
        action: editingItemId ? "update_item" : "create_item",
        itemId: editingItemId || undefined,
        bankId: selectedBankId,
        parentId: itemForm.nodeId || null,
        difficulty: itemForm.difficulty || null,
        tags: normalizeTags(itemForm.tags),
        content: {
          prompt: itemForm.prompt,
          question_type: itemForm.questionType,
          options: parseOptions(itemForm.options),
          correct_answer: parseAnswer(itemForm.correctAnswer),
          explanation: itemForm.explanation,
          passage: itemForm.passage,
          media_url: itemForm.mediaUrl,
          instruction: itemForm.instruction,
          solution_source: itemForm.solutionSource,
        },
      });
      const wasEditing = Boolean(editingItemId);
      setItemForm(emptyItemForm); setEditingItemId(""); setItemFormOpen(false); setNotice(wasEditing ? "Đã lưu phiên bản câu hỏi mới." : "Đã thêm câu hỏi phiên bản 1."); await loadBank(selectedBankId);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể thêm câu hỏi."); }
    finally { setSaving(false); }
  }

  async function seedFromSection(event: FormEvent) {
    event.preventDefault(); if (!selectedBankId || !seedSectionId) return; setSaving(true); setError(""); setNotice("");
    try {
      const payload = await post({ action: "seed_from_section", bankId: selectedBankId, sectionId: seedSectionId, parentId: seedNodeId || null });
      setImportFormOpen(false); setSeedSectionId(""); setNotice(`Đã nạp ${payload.imported ?? 0} câu hỏi vào ngân hàng.`); await loadBank(selectedBankId);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể nạp câu hỏi."); }
    finally { setSaving(false); }
  }

  async function attachToExam(event: FormEvent) {
    event.preventDefault(); if (!selectedBankId || !attachExamId || !attachSectionId || selectedItemIds.size === 0) return; setSaving(true); setError(""); setNotice("");
    try {
      const payload = await post({ action: "attach_to_exam", bankId: selectedBankId, examId: attachExamId, sectionId: attachSectionId, itemIds: [...selectedItemIds] });
      setAttachFormOpen(false); setSelectedItemIds(new Set()); setNotice(`Đã thêm ${payload.attached ?? 0} câu vào đề.`);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể thêm câu vào đề."); }
    finally { setSaving(false); }
  }

  function toggleItem(id: string) {
    setSelectedItemIds(current => { const next = new Set(current); if (next.has(id)) next.delete(id); else next.add(id); return next; });
  }

  function editItem(item: QuestionBankItem) {
    setEditingItemId(item.id);
    setItemForm({
      prompt: item.prompt,
      questionType: item.question_type,
      options: item.options.map(option => `${option.value} | ${option.label}`).join("\n"),
      correctAnswer: answerLabel(item.correct_answer),
      explanation: item.explanation,
      passage: item.passage ?? "",
      mediaUrl: item.media_url ?? "",
      instruction: item.instruction ?? "",
      solutionSource: item.solution_source,
      difficulty: item.difficulty ?? "",
      tags: item.tags.join(", "),
      nodeId: item.node_id ?? "",
    });
    setItemFormOpen(true);
  }

  function renderNodes(parentId: string | null, depth = 0): React.ReactNode {
    return nodes.filter(node => node.parent_id === parentId).map(node => <div key={node.id}>
      <button type="button" className={`question-bank-node ${selectedNodeId === node.id ? "active" : ""}`} style={{ paddingInlineStart: `${12 + depth * 16}px` }} onClick={() => setSelectedNodeId(current => current === node.id ? "" : node.id)} aria-pressed={selectedNodeId === node.id}>
        <span>{node.node_type === "unit" ? "↳" : "•"}</span><b>{node.title}</b><small>{items.filter(item => item.node_id === node.id).length}</small>
      </button>
      {renderNodes(node.id, depth + 1)}
    </div>);
  }

  if (loading && !banks.length) return <LoadingIndicator label="Đang tải ngân hàng câu hỏi…" />;

  return <div className="question-bank-page">
    <header className="question-bank-header">
      <div>
        <span className="editor-eyebrow">AUTHORING LIBRARY</span>
        <h1>Ngân hàng câu hỏi</h1>
        <p>Tạo cấu trúc, phân loại và tái sử dụng câu hỏi để sinh đề nhanh hơn.</p>
      </div>
      <div className="question-bank-header-actions">
        <button type="button" className="outline-btn" onClick={() => navigate("/admin/exams")}><FilePlus2 aria-hidden="true" /> Mở đề thi</button>
        <button type="button" className="primary-btn small" onClick={() => setBankFormOpen(value => !value)}><Plus aria-hidden="true" /> Tạo ngân hàng</button>
      </div>
    </header>
    {error && <p className="form-error question-bank-alert" role="alert">{error}</p>}
    {notice && <p className="form-success question-bank-alert" role="status" aria-live="polite">{notice}</p>}
    {bankFormOpen && <form className="question-bank-form question-bank-create-form" onSubmit={createBank}>
      <div className="question-bank-form-heading"><div><span className="eyebrow">NEW LIBRARY</span><h2>Tạo ngân hàng mới</h2></div><button type="button" className="icon-btn" onClick={() => setBankFormOpen(false)} aria-label="Đóng form tạo ngân hàng"><X aria-hidden="true" /></button></div>
      <div className="question-bank-form-grid">
        <label>Tên ngân hàng<input value={bankForm.name} onChange={event => setField("name", event.target.value)} placeholder="Ví dụ: Toán 12 · Hàm số" required /></label>
        <label>Môn học<input value={bankForm.subjectCode} onChange={event => setField("subjectCode", event.target.value)} placeholder="TOAN" /></label>
        <label>Khối<input value={bankForm.grade} onChange={event => setField("grade", event.target.value)} placeholder="12" /></label>
        <label>Chương trình / bộ sách<input value={bankForm.curriculum} onChange={event => setField("curriculum", event.target.value)} placeholder="CT 2018" /></label>
      </div>
      <label>Mô tả<textarea rows={2} value={bankForm.description} onChange={event => setField("description", event.target.value)} placeholder="Mục đích sử dụng và phạm vi kiến thức" /></label>
      <button className="primary-btn small" disabled={saving}><Save aria-hidden="true" /> {saving ? "Đang tạo…" : "Lưu ngân hàng"}</button>
    </form>}
    <div className="question-bank-layout">
      <aside className="question-bank-sidebar" aria-label="Danh sách ngân hàng">
        <div className="question-bank-sidebar-heading"><span><Library aria-hidden="true" /> Ngân hàng</span><b>{banks.length}</b></div>
        <div className="question-bank-list">
          {banks.length ? banks.map(bank => <button type="button" key={bank.id} className={bank.id === selectedBankId ? "active" : ""} onClick={() => { setSelectedBankId(bank.id); setSelectedNodeId(""); }} aria-pressed={bank.id === selectedBankId}><span><b>{bank.name}</b><small>{[bank.subject_code, bank.grade].filter(Boolean).join(" · ") || "Chưa phân loại"}</small></span><ChevronRight aria-hidden="true" /></button>) : <div className="question-bank-empty"><Library aria-hidden="true" /><p>Chưa có ngân hàng.</p><button type="button" className="outline-btn small" onClick={() => setBankFormOpen(true)}>Tạo ngân hàng đầu tiên</button></div>}
        </div>
      </aside>
      <main className="question-bank-stage">
        {selectedBank ? <>
          <header className="question-bank-stage-heading">
            <div><span className="eyebrow">{selectedBank.subject_code || "QUESTION BANK"} · {selectedBank.grade || "MỌI KHỐI"}</span><h2>{selectedBank.name}</h2><p>{selectedBank.description || "Chọn chủ đề để lọc hoặc thêm câu hỏi vào thư viện."}</p></div>
            <div className="question-bank-stage-meta"><span className={`question-bank-status ${selectedBank.status}`}>{selectedBank.status === "active" ? "Đang dùng" : selectedBank.status === "archived" ? "Đã lưu trữ" : "Bản nháp"}</span><small>Cập nhật {dateLabel(selectedBank.updated_at)}</small></div>
          </header>
          <div className="question-bank-actions-row">
            <button type="button" className="outline-btn small" onClick={() => setNodeFormOpen(value => !value)}><Tags aria-hidden="true" /> Chủ đề</button>
            <button type="button" className="outline-btn small" onClick={() => setImportFormOpen(value => !value)}><Upload aria-hidden="true" /> Nạp từ đề hiện có</button>
            <button type="button" className="primary-btn small" onClick={() => setItemFormOpen(value => !value)}><Plus aria-hidden="true" /> Thêm câu hỏi</button>
          </div>
          {nodeFormOpen && <form className="question-bank-inline-form" onSubmit={createNode}><div className="question-bank-inline-title"><b>Tạo cấu trúc chủ đề</b><button type="button" onClick={() => setNodeFormOpen(false)} aria-label="Đóng form chủ đề"><X aria-hidden="true" /></button></div><div className="question-bank-form-grid compact"><label>Tên chủ đề<input value={nodeForm.title} onChange={event => setNodeForm(previous => ({ ...previous, title: event.target.value }))} placeholder="Ví dụ: Đạo hàm" required /></label><label>Chủ đề cha<select value={nodeForm.parentId} onChange={event => setNodeForm(previous => ({ ...previous, parentId: event.target.value }))}><option value="">Cấp cao nhất</option>{nodes.filter(node => node.node_type === "topic").map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label><label>Kiểu cấu trúc<select value={nodeForm.nodeType} onChange={event => setNodeForm(previous => ({ ...previous, nodeType: event.target.value as NodeForm["nodeType"] }))}><option value="topic">Chủ đề / chương</option><option value="unit">Đơn vị kiến thức</option></select></label></div><button className="primary-btn small" disabled={saving}><Save aria-hidden="true" /> Lưu chủ đề</button></form>}
          {importFormOpen && <form className="question-bank-inline-form" onSubmit={seedFromSection}><div className="question-bank-inline-title"><b>Nạp câu hỏi từ đề hiện có</b><button type="button" onClick={() => setImportFormOpen(false)} aria-label="Đóng form nạp câu hỏi"><X aria-hidden="true" /></button></div><p className="question-bank-help">Nội dung và đáp án được copy thành phiên bản mới trong ngân hàng; đề gốc không bị thay đổi.</p><div className="question-bank-form-grid compact"><label>Phần đề<select value={seedSectionId} onChange={event => setSeedSectionId(event.target.value)} required><option value="">Chọn section</option>{seedSections.map(section => <option key={section.id} value={section.id}>{sourceExams.find(exam => exam.id === section.exam_id)?.title || "Đề"} · {section.title}</option>)}</select></label><label>Chủ đề đích<select value={seedNodeId} onChange={event => setSeedNodeId(event.target.value)}><option value="">Chưa gán chủ đề</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label></div><button className="primary-btn small" disabled={saving || !seedSectionId}><Upload aria-hidden="true" /> {saving ? "Đang nạp…" : "Nạp vào ngân hàng"}</button></form>}
          {itemFormOpen && <form className="question-bank-form" onSubmit={createItem}><div className="question-bank-form-heading"><div><span className="eyebrow">ITEM AUTHORING</span><h3>{editingItemId ? "Sửa câu hỏi" : "Thêm câu hỏi"}</h3></div><button type="button" className="icon-btn" onClick={() => { setItemFormOpen(false); setEditingItemId(""); setItemForm(emptyItemForm); }} aria-label="Đóng form câu hỏi"><X aria-hidden="true" /></button></div><div className="question-bank-form-grid"><label>Chủ đề<select value={itemForm.nodeId} onChange={event => setItemField("nodeId", event.target.value)}><option value="">Chưa gán</option>{nodes.map(node => <option key={node.id} value={node.id}>{node.title}</option>)}</select></label><label>Loại câu hỏi<select value={itemForm.questionType} onChange={event => setItemField("questionType", event.target.value as QuestionType)}>{QUESTION_FORMATS.map(format => <option key={format.value} value={format.value}>{format.label}</option>)}</select></label><label>Độ khó<select value={itemForm.difficulty} onChange={event => setItemField("difficulty", event.target.value as ItemForm["difficulty"])}><option value="">Chưa gắn mức độ</option>{QUESTION_BANK_DIFFICULTIES.map(value => <option key={value} value={value}>{value}</option>)}</select></label><label>Tag<input value={itemForm.tags} onChange={event => setItemField("tags", event.target.value)} placeholder="hàm số, đạo hàm" /></label></div><label>Nội dung câu hỏi<textarea rows={5} value={itemForm.prompt} onChange={event => setItemField("prompt", event.target.value)} placeholder="Có thể dùng LaTeX trong nội dung." required /></label><div className="question-bank-form-grid"><label>Phương án <small>Mỗi dòng: A | Nội dung</small><textarea rows={4} value={itemForm.options} onChange={event => setItemField("options", event.target.value)} /></label><label>Đáp án đúng <small>Dùng dấu phẩy cho multiple</small><input value={itemForm.correctAnswer} onChange={event => setItemField("correctAnswer", event.target.value)} placeholder="A hoặc A,C" /></label></div><label>Giải thích / lời giải<textarea rows={3} value={itemForm.explanation} onChange={event => setItemField("explanation", event.target.value)} placeholder="Hiển thị khi chính sách cho phép." /></label><details className="question-bank-advanced"><summary>Thông tin bổ sung</summary><div className="question-bank-form-grid"><label>Đoạn dẫn<textarea rows={2} value={itemForm.passage} onChange={event => setItemField("passage", event.target.value)} /></label><label>URL hình ảnh<input type="url" value={itemForm.mediaUrl} onChange={event => setItemField("mediaUrl", event.target.value)} /></label><label>Hướng dẫn câu hỏi<input value={itemForm.instruction} onChange={event => setItemField("instruction", event.target.value)} /></label><label>LaTeX lời giải<textarea rows={2} value={itemForm.solutionSource} onChange={event => setItemField("solutionSource", event.target.value)} /></label></div></details><button className="primary-btn small" disabled={saving}><Save aria-hidden="true" /> {saving ? "Đang lưu…" : editingItemId ? "Lưu phiên bản mới" : "Lưu câu hỏi"}</button></form>}
          <div className="question-bank-toolbar"><label className="question-bank-search"><Search aria-hidden="true" /><span className="sr-only">Tìm câu hỏi</span><input value={search} onChange={event => setSearch(event.target.value)} placeholder="Tìm nội dung hoặc tag…" type="search" /></label><label className="question-bank-filter"><Filter aria-hidden="true" /><span className="sr-only">Lọc độ khó</span><select value={difficulty} onChange={event => setDifficulty(event.target.value as QuestionBankDifficulty | "")}><option value="">Mọi mức độ</option>{QUESTION_BANK_DIFFICULTIES.map(value => <option key={value} value={value}>{value}</option>)}</select></label><span className="question-bank-result-count">{visibleItems.length}/{items.length} câu</span>{selectedItemIds.size > 0 && <button type="button" className="primary-btn small" onClick={() => setAttachFormOpen(value => !value)}><Link2 aria-hidden="true" /> Đưa {selectedItemIds.size} câu vào đề</button>}</div>
          {attachFormOpen && <form className="question-bank-attach-form" onSubmit={attachToExam}><div><span className="eyebrow">REUSE IN EXAM</span><h3>Đưa câu hỏi vào đề</h3><p>Hệ thống sẽ tạo snapshot nội dung và đáp án ở section đã chọn.</p></div><label>Đề thi<select value={attachExamId} onChange={event => { setAttachExamId(event.target.value); setAttachSectionId(""); }} required><option value="">Chọn đề</option>{sourceExams.map(exam => <option key={exam.id} value={exam.id}>{exam.title} · {exam.exam_type}</option>)}</select></label><label>Phần thi<select value={attachSectionId} onChange={event => setAttachSectionId(event.target.value)} required><option value="">Chọn section</option>{selectedSections.map(section => <option key={section.id} value={section.id}>{section.title}</option>)}</select></label><button className="primary-btn small" disabled={saving}><Link2 aria-hidden="true" /> {saving ? "Đang thêm…" : "Thêm vào đề"}</button></form>}
          <div className="question-bank-content">
            <aside className="question-bank-node-panel"><div className="question-bank-panel-heading"><span><BookOpen aria-hidden="true" /> Cấu trúc</span><b>{nodes.length}</b></div><button type="button" className={`question-bank-node ${!selectedNodeId ? "active" : ""}`} onClick={() => setSelectedNodeId("")} aria-pressed={!selectedNodeId}><span>⌂</span><b>Tất cả câu hỏi</b><small>{items.length}</small></button>{renderNodes(null)}</aside>
            <section className="question-bank-items" aria-labelledby="question-bank-items-heading"><div className="question-bank-items-heading"><div><span className="eyebrow">QUESTION SET</span><h3 id="question-bank-items-heading">Câu hỏi trong thư viện</h3></div><button type="button" className="outline-btn small" onClick={() => void refresh(selectedBankId)} disabled={loading}><RefreshCw aria-hidden="true" /> Làm mới</button></div>{visibleItems.length ? <div className="question-bank-item-list">{visibleItems.map(item => <article className={`question-bank-item-card ${selectedItemIds.has(item.id) ? "selected" : ""}`} key={item.id}><label className="question-bank-item-select"><input type="checkbox" checked={selectedItemIds.has(item.id)} onChange={() => toggleItem(item.id)} aria-label={`Chọn câu hỏi ${item.prompt.slice(0, 60)}`} /><span /></label><div className="question-bank-item-main"><div className="question-bank-item-meta"><span className="question-bank-item-type">{questionTypeLabel(item.question_type)}</span>{item.difficulty && <span className={`difficulty-chip difficulty-${item.difficulty.toLowerCase()}`}>{item.difficulty}</span>}<span className="version-chip">v{item.current_version}</span><small>{dateLabel(item.updated_at)}</small><button type="button" className="question-bank-item-edit" onClick={() => editItem(item)} aria-label={`Sửa câu hỏi ${item.prompt.slice(0, 60)}`}><Pencil aria-hidden="true" /></button></div><h4>{item.prompt}</h4>{item.options.length > 0 && <div className="question-bank-options">{item.options.slice(0, 4).map(option => <span key={option.value}><b>{option.value}</b>{option.label}</span>)}</div>}<div className="question-bank-item-footer"><span>Đáp án: <b>{answerLabel(item.correct_answer)}</b></span>{item.tags.length > 0 && <span className="question-bank-tags">{item.tags.slice(0, 4).map(tag => <em key={tag}>#{tag}</em>)}</span>}</div></div></article>)}</div> : <div className="question-bank-empty wide"><CheckSquare aria-hidden="true" /><h3>Chưa có câu hỏi phù hợp</h3><p>Thử đổi bộ lọc, nạp câu từ một đề hiện có hoặc thêm câu hỏi mới.</p><button type="button" className="primary-btn small" onClick={() => setItemFormOpen(true)}><Plus aria-hidden="true" /> Thêm câu hỏi</button></div>}</section>
          </div>
        </> : <div className="question-bank-empty workspace"><Library aria-hidden="true" /><h2>Chọn một ngân hàng để bắt đầu</h2><p>Tạo thư viện đầu tiên rồi đưa câu hỏi hiện có vào để tái sử dụng.</p><button type="button" className="primary-btn small" onClick={() => setBankFormOpen(true)}><Plus aria-hidden="true" /> Tạo ngân hàng</button></div>}
      </main>
    </div>
  </div>;
}

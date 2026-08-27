import type { ExamDocument } from "@aeck/contracts";
import { useQuery } from "@tanstack/react-query";
import { $generateHtmlFromNodes, $generateNodesFromDOM } from "@lexical/html";
import { HistoryPlugin } from "@lexical/react/LexicalHistoryPlugin";
import { LexicalComposer } from "@lexical/react/LexicalComposer";
import { ContentEditable } from "@lexical/react/LexicalContentEditable";
import { LexicalErrorBoundary } from "@lexical/react/LexicalErrorBoundary";
import { useLexicalComposerContext } from "@lexical/react/LexicalComposerContext";
import { OnChangePlugin } from "@lexical/react/LexicalOnChangePlugin";
import { RichTextPlugin } from "@lexical/react/LexicalRichTextPlugin";
import { HeadingNode, QuoteNode } from "@lexical/rich-text";
import {
  $getRoot,
  $insertNodes,
  FORMAT_ELEMENT_COMMAND,
  FORMAT_TEXT_COMMAND,
  REDO_COMMAND,
  UNDO_COMMAND,
  type EditorState,
  type LexicalEditor,
} from "lexical";
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  ArrowLeft,
  ArrowRight,
  Bold,
  Braces,
  FilePenLine,
  FilePlus2,
  History,
  Italic,
  LibraryBig,
  Plus,
  Redo2,
  RefreshCw,
  Save,
  ShieldAlert,
  Sparkles,
  Underline,
  Undo2,
} from "lucide-react";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router-dom";

import { createExamDocument, loadExamDocument, saveExamDocument } from "../../api/exam-builder-api.ts";
import { ApiClientError } from "../../api/api-client.ts";
import MathRenderer from "../../components/shared/math-renderer.tsx";
import { LoadingPanel } from "../../components/ui/loading-panel.tsx";
import { legacyUrl } from "../parity/legacy-url.ts";
import { legacyHtmlHasUnsupportedNodes } from "./exam-document.ts";
import "../../styles/exam-builder.css";

type BuilderTemplate = "blank" | "from-bank" | "random";

function TemplateCard({ icon: Icon, title, description, path }: { icon: typeof FilePenLine; title: string; description: string; path: string }) {
  return <Link to={path}><span aria-hidden="true"><Icon /></span><div><h2>{title}</h2><p>{description}</p></div><ArrowRight aria-hidden="true" /></Link>;
}

export function ExamBuilderCatalogPage() {
  return <div className="aeck-exam-builder-catalog"><header><div><span>Trình soạn bổ sung</span><h1>Soạn đề thế hệ mới</h1><p>Tạo tài liệu bằng Lexical trong khi trình soạn cũ và dữ liệu HTML/LaTeX chuẩn vẫn được giữ nguyên.</p></div><a href={legacyUrl("/admin/exams")}><History aria-hidden="true" />Mở trình soạn cũ</a></header><section className="aeck-builder-template-grid" aria-label="Cách bắt đầu"><TemplateCard icon={FilePlus2} title="Đề trống" description="Tạo cấu trúc mới và nhập nội dung theo từng phần." path="/admin/exam-builder/new" /><TemplateCard icon={LibraryBig} title="Từ ngân hàng câu hỏi" description="Khởi tạo tài liệu có liên kết tới câu hỏi đã chuẩn hóa." path="/admin/exam-builder/new/from-bank" /><TemplateCard icon={Sparkles} title="Ma trận ngẫu nhiên" description="Chuẩn bị cấu trúc đề theo chủ đề và mức độ." path="/admin/exam-builder/new/random" /></section><section className="aeck-builder-recent"><header><h2>Tài liệu gần đây</h2><span>1 tài liệu mẫu</span></header><article><span aria-hidden="true"><Braces /></span><div><strong>TSA tổng hợp · Bản biên soạn mới</strong><p>Cập nhật gần nhất · Bản sửa 1</p></div><Link to="/admin/exam-builder/exam-demo-tsa">Tiếp tục soạn <ArrowRight aria-hidden="true" /></Link></article></section><aside><ShieldAlert aria-hidden="true" /><div><strong>Ranh giới tương thích</strong><p>Nội dung cũ không ánh xạ an toàn sẽ được giữ nguyên dưới dạng HTML thô. Trình soạn mới không tự xóa bảng, KaTeX, SVG hoặc widget CKEditor.</p></div></aside></div>;
}

function ToolbarButton({ label, icon: Icon, onClick }: { label: string; icon: typeof Bold; onClick: () => void }) {
  return <button type="button" aria-label={label} title={label} onClick={onClick}><Icon aria-hidden="true" /></button>;
}

function EditorToolbar() {
  const [editor] = useLexicalComposerContext();
  return <div className="aeck-editor-toolbar" role="toolbar" aria-label="Định dạng nội dung"><div><ToolbarButton label="Hoàn tác" icon={Undo2} onClick={() => editor.dispatchCommand(UNDO_COMMAND, undefined)} /><ToolbarButton label="Làm lại" icon={Redo2} onClick={() => editor.dispatchCommand(REDO_COMMAND, undefined)} /></div><div><ToolbarButton label="In đậm" icon={Bold} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "bold")} /><ToolbarButton label="In nghiêng" icon={Italic} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "italic")} /><ToolbarButton label="Gạch chân" icon={Underline} onClick={() => editor.dispatchCommand(FORMAT_TEXT_COMMAND, "underline")} /></div><div><ToolbarButton label="Căn trái" icon={AlignLeft} onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "left")} /><ToolbarButton label="Căn giữa" icon={AlignCenter} onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "center")} /><ToolbarButton label="Căn phải" icon={AlignRight} onClick={() => editor.dispatchCommand(FORMAT_ELEMENT_COMMAND, "right")} /></div></div>;
}

function InitialHtmlPlugin({ html }: { html: string }) {
  const [editor] = useLexicalComposerContext();
  const initialized = useRef(false);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    editor.update(() => {
      const root = $getRoot();
      root.clear();
      const document = new DOMParser().parseFromString(html || "<p></p>", "text/html");
      const nodes = $generateNodesFromDOM(editor, document);
      root.select();
      $insertNodes(nodes);
    });
  }, [editor, html]);
  return null;
}

function LexicalSectionEditor({ html, onChange }: { html: string; onChange: (html: string, json: Record<string, unknown>) => void }) {
  const onEditorChange = (editorState: EditorState, editor: LexicalEditor) => {
    editorState.read(() => onChange($generateHtmlFromNodes(editor), editorState.toJSON() as unknown as Record<string, unknown>));
  };
  return <LexicalComposer initialConfig={{ namespace: "AeckExamBuilder", nodes: [HeadingNode, QuoteNode], onError: (error) => { throw error; }, theme: { paragraph: "aeck-editor-paragraph", heading: { h1: "aeck-editor-h1", h2: "aeck-editor-h2", h3: "aeck-editor-h3" }, quote: "aeck-editor-quote" } }}><EditorToolbar /><RichTextPlugin contentEditable={<ContentEditable className="aeck-editor-content" aria-label="Nội dung phần thi" />} placeholder={<div className="aeck-editor-placeholder">Nhập nội dung phần thi…</div>} ErrorBoundary={LexicalErrorBoundary} /><HistoryPlugin /><InitialHtmlPlugin html={html} /><OnChangePlugin onChange={onEditorChange} ignoreSelectionChange /></LexicalComposer>;
}

function CreateExamPanel({ template }: { template: BuilderTemplate }) {
  const navigate = useNavigate();
  const [title, setTitle] = useState(template === "from-bank" ? "Đề mới từ ngân hàng" : template === "random" ? "Đề ngẫu nhiên mới" : "Đề thi mới");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault(); setSubmitting(true); setError("");
    try { const document = await createExamDocument(title.trim(), template); navigate(`/admin/exam-builder/${document.examId}`, { replace: true }); }
    catch (reason) { setError(reason instanceof Error ? reason.message : "Không thể tạo tài liệu."); }
    finally { setSubmitting(false); }
  };
  return <div className="aeck-builder-create"><Link to="/admin/exam-builder"><ArrowLeft aria-hidden="true" />Quay lại</Link><form onSubmit={submit} aria-busy={submitting}><span aria-hidden="true"><FilePlus2 /></span><h1>{template === "from-bank" ? "Tạo đề từ ngân hàng" : template === "random" ? "Tạo đề theo ma trận" : "Tạo đề trống"}</h1><p>Trình soạn mới là phần bổ sung; bạn luôn có thể quay lại trình soạn cũ.</p><label htmlFor="aeck-builder-title">Tên đề thi</label><input id="aeck-builder-title" value={title} onChange={(event) => setTitle(event.target.value)} minLength={3} maxLength={160} required autoFocus />{error ? <p className="aeck-builder-error" role="alert">{error}</p> : null}<button type="submit" disabled={submitting}>{submitting ? "Đang tạo…" : "Tạo và mở trình soạn"}<ArrowRight aria-hidden="true" /></button></form></div>;
}

export function ExamBuilderPage() {
  const { examId } = useParams();
  const location = useLocation();
  const query = useQuery({
    queryKey: ["platform", "exam-document", examId],
    queryFn: () => loadExamDocument(examId ?? ""),
    enabled: Boolean(examId),
    retry: false,
  });

  if (!examId) {
    const template: BuilderTemplate = location.pathname.endsWith("/from-bank") ? "from-bank" : location.pathname.endsWith("/random") ? "random" : "blank";
    return <CreateExamPanel template={template} />;
  }
  if (query.isPending) return <LoadingPanel label="Đang tải tài liệu đề thi…" />;
  if (query.isError) return <div className="aeck-builder-load-error"><ShieldAlert aria-hidden="true" /><h1>Không thể mở tài liệu</h1><p>{query.error.message}</p><button type="button" onClick={() => void query.refetch()}><RefreshCw aria-hidden="true" />Tải lại</button><a href={legacyUrl(`/admin/exams/${encodeURIComponent(examId)}`)}>Mở trình soạn cũ</a></div>;
  return <ExamBuilderWorkspace key={`${examId}-${query.data.revision}`} initialDocument={query.data} />;
}

function ExamBuilderWorkspace({ initialDocument }: { initialDocument: ExamDocument }) {
  const [document, setDocument] = useState(initialDocument);
  const [activeSectionId, setActiveSectionId] = useState(
    initialDocument.normalizedSections[0]?.id ?? "",
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [conflict, setConflict] = useState(false);
  const lexicalSectionsRef = useRef<Record<string, Record<string, unknown>>>({});

  const activeIndex = document.normalizedSections.findIndex((section) => section.id === activeSectionId);
  const activeSection = document.normalizedSections[activeIndex] ?? document.normalizedSections[0];
  const unsupported = activeSection ? legacyHtmlHasUnsupportedNodes(activeSection.html) : false;
  const updateSection = (html: string, json: Record<string, unknown>) => {
    if (!activeSection || unsupported) return;
    lexicalSectionsRef.current[activeSection.id] = json;
    setDocument((current) => current ? { ...current, normalizedSections: current.normalizedSections.map((section) => section.id === activeSection.id ? { ...section, html } : section), lexicalJson: { sections: lexicalSectionsRef.current } } : current);
    setNotice("Có thay đổi chưa lưu");
  };
  const addSection = () => {
    const section = { id: crypto.randomUUID(), title: `Phần thi ${document.normalizedSections.length + 1}`, html: "<p>Bắt đầu soạn nội dung tại đây.</p>", latexSource: "" };
    setDocument({ ...document, normalizedSections: [...document.normalizedSections, section] }); setActiveSectionId(section.id); setNotice("Có thay đổi chưa lưu");
  };
  const save = async () => {
    setSaving(true); setError(""); setConflict(false);
    try { const saved = await saveExamDocument(document); setDocument(saved); setNotice(`Đã lưu bản sửa ${saved.revision}`); }
    catch (reason) { if (reason instanceof ApiClientError && reason.status === 409 && reason.code === "EDIT_CONFLICT") { setConflict(true); setError("Tài liệu đã thay đổi ở cửa sổ khác. Hãy tải lại trước khi lưu tiếp."); } else setError(reason instanceof Error ? reason.message : "Không thể lưu tài liệu."); }
    finally { setSaving(false); }
  };

  return <div className="aeck-exam-builder"><header className="aeck-builder-topbar"><div><Link to="/admin/exam-builder"><ArrowLeft aria-hidden="true" />Tài liệu</Link><input aria-label="Tên đề thi" value={document.title} onChange={(event) => { setDocument({ ...document, title: event.target.value }); setNotice("Có thay đổi chưa lưu"); }} /><span>Bản sửa {document.revision} · {notice || "Đã đồng bộ"}</span></div><div><a href={legacyUrl(`/admin/exams/${encodeURIComponent(document.examId)}`)}><History aria-hidden="true" />Trình soạn cũ</a><button type="button" onClick={() => void save()} disabled={saving}><Save aria-hidden="true" />{saving ? "Đang lưu…" : "Lưu tài liệu"}</button></div></header>{error ? <div className={`aeck-builder-banner${conflict ? " is-conflict" : ""}`} role="alert"><ShieldAlert aria-hidden="true" /><span>{error}</span>{conflict ? <button type="button" onClick={() => window.location.reload()}>Tải bản mới nhất</button> : null}</div> : null}<div className="aeck-builder-workspace"><aside><header><div><span>Cấu trúc đề</span><strong>{document.normalizedSections.length} phần</strong></div><button type="button" aria-label="Thêm phần thi" onClick={addSection}><Plus aria-hidden="true" /></button></header><ol>{document.normalizedSections.map((section, index) => <li key={section.id}><button type="button" aria-current={section.id === activeSection?.id ? "true" : undefined} onClick={() => setActiveSectionId(section.id)}><i>{String(index + 1).padStart(2, "0")}</i><span>{section.title}</span>{legacyHtmlHasUnsupportedNodes(section.html) ? <ShieldAlert aria-label="Có nội dung cần mở bằng trình soạn cũ" /> : null}</button></li>)}</ol></aside><main>{activeSection ? <><div className="aeck-builder-section-heading"><div><span>Phần {activeIndex + 1}</span><input aria-label="Tên phần thi" value={activeSection.title} onChange={(event) => { setDocument({ ...document, normalizedSections: document.normalizedSections.map((section) => section.id === activeSection.id ? { ...section, title: event.target.value } : section) }); setNotice("Có thay đổi chưa lưu"); }} /></div><span>{unsupported ? "Chế độ bảo toàn HTML" : "Lexical"}</span></div>{unsupported ? <section className="aeck-builder-unsupported"><header><ShieldAlert aria-hidden="true" /><div><h2>Nội dung cũ cần được bảo toàn</h2><p>Phần này chứa bảng, công thức hoặc widget chưa thể ánh xạ an toàn. HTML thô không bị chỉnh sửa.</p></div><a href={legacyUrl(`/admin/exams/${encodeURIComponent(document.examId)}`)}>Mở trình soạn cũ</a></header><MathRenderer content={activeSection.html} /></section> : <div className="aeck-lexical-editor" key={activeSection.id}><LexicalSectionEditor html={activeSection.html} onChange={updateSection} /></div>}</> : null}</main><aside className="aeck-builder-preview"><header><span>Xem trước nội dung</span><strong>{activeSection?.title}</strong></header><div>{activeSection ? <MathRenderer content={activeSection.html} /> : null}</div><footer><p>Preview chỉ hiển thị nội dung biên soạn; giao diện câu hỏi/đáp án được bảo vệ không thay đổi.</p></footer></aside></div></div>;
}

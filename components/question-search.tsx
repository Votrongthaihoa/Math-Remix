"use client";

import { useEffect, useId, useRef, useState } from "react";
import { ChevronDown, CircleHelp, Search, Sparkles, Upload, X } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import { MathRendererContent } from "./MathRendererContent";
import "./question-search.css";

export type SearchedQuestion = { id: string; prompt: string; type: string; options: unknown[]; passage?: string | null; mediaUrl?: string | null; instruction?: string | null; explanation?: string | null; similarityScore: number };
const OCR_SCAN_ACTION = "scan-question";

function label(value: string) { return ({ single: "Trắc nghiệm", multiple: "Nhiều đáp án", true_false: "Đúng / Sai", short_answer: "Trả lời ngắn", inline_dropdown: "Điền chọn", matching: "Ghép đôi", group: "Câu hỏi nhóm", katex: "Công thức" }[value] ?? value); }

export function SimilarityScore({ value }: { value: number }) {
  const tone = value >= 70 ? "high" : value >= 40 ? "medium" : "low";
  return <span className={`question-search-similarity is-${tone}`} aria-label={`Độ tương đồng ${value}%`}>{value}% tương đồng</span>;
}

function optionLabel(value: unknown, index: number) {
  if (typeof value === "string") return value;
  if (value && typeof value === "object") return String((value as { label?: unknown; value?: unknown }).label ?? (value as { value?: unknown }).value ?? "");
  return `${String.fromCharCode(65 + index)}.`;
}

export function QuestionDetail({ question }: { question: SearchedQuestion }) {
  const [showExplanation, setShowExplanation] = useState(false);
  const options = question.options.slice(0, 12);
  return <article className="question-search-detail"><header><span className="question-search-type">{label(question.type)}</span><SimilarityScore value={question.similarityScore} /><code>{question.id}</code></header>{question.instruction ? <p className="question-search-instruction"><MathRendererContent content={question.instruction} /></p> : null}{question.passage ? <blockquote><MathRendererContent content={question.passage} /></blockquote> : null}<div className="question-search-prompt"><MathRendererContent content={question.prompt} /></div>{options.length ? <ul className="question-search-options">{options.map((option, index) => <li key={`${question.id}-${index}`}><span>{String.fromCharCode(65 + index)}</span><MathRendererContent content={optionLabel(option, index)} /></li>)}</ul> : <p className="question-search-no-options">Câu hỏi tự luận hoặc dữ liệu lựa chọn không được công khai.</p>}{question.explanation ? <><button type="button" className="question-search-explanation-toggle" aria-expanded={showExplanation} onClick={() => setShowExplanation(value => !value)}><Sparkles aria-hidden="true" />{showExplanation ? "Ẩn lời giải" : "Xem lời giải"}<ChevronDown aria-hidden="true" /></button>{showExplanation ? <div className="question-search-explanation"><MathRendererContent content={question.explanation} /></div> : null}</> : null}</article>;
}

export default function QuestionSearch() {
  const inputId = useId();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchedQuestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [file, setFile] = useState<File | null>(null);
  async function search(event?: React.FormEvent) {
    event?.preventDefault();
    const value = query.trim();
    if (value.length < 3) { setError("Nhập ít nhất 3 ký tự hoặc mã câu hỏi."); return; }
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch(`/api/question-search?${/^[0-9a-f-]{8,}$/i.test(value) ? `id=${encodeURIComponent(value)}` : `q=${encodeURIComponent(value)}`}`, { cache: "no-store" });
      const payload = await response.json().catch(() => null) as { results?: SearchedQuestion[]; error?: string } | null;
      if (!response.ok) throw new Error(payload?.error ?? "Không thể tra cứu câu hỏi.");
      setResults(payload?.results ?? []);
    } catch (value) { setError(value instanceof Error ? value.message : "Không thể tra cứu câu hỏi."); }
    finally { setLoading(false); }
  }
  async function scanImage(nextFile: File | null) {
    setFile(nextFile); if (!nextFile) return;
    if (!nextFile.type.startsWith("image/") || nextFile.size > 10 * 1024 * 1024) { setError("Chỉ hỗ trợ ảnh tối đa 10 MB."); return; }
    const form = new FormData(); form.set("file", nextFile);
    setLoading(true); setError("");
    try { const response = await authenticatedFetch("/api/ocr/scan-question", { method: "POST", headers: { "x-ocr-action": OCR_SCAN_ACTION }, body: form }); const payload = await response.json().catch(() => null) as { results?: SearchedQuestion[]; error?: string } | null; if (!response.ok) throw new Error(payload?.error ?? "Không thể quét ảnh."); setResults(payload?.results ?? []); }
    catch (value) { setError(value instanceof Error ? value.message : "Không thể quét ảnh."); }
    finally { setLoading(false); }
  }
  useEffect(() => { const handler = (event: KeyboardEvent) => { if (!(event.ctrlKey || event.metaKey) || event.key.toLocaleLowerCase() !== "k") return; event.preventDefault(); inputRef.current?.focus(); }; window.addEventListener("keydown", handler); return () => window.removeEventListener("keydown", handler); }, []);
  return <section className="question-search" aria-labelledby="question-search-title"><header><div><span className="question-search-kicker">TRA CỨU CÂU HỎI</span><h2 id="question-search-title">Tìm theo mã, nội dung hoặc ảnh</h2><p>Chỉ hiển thị dữ liệu mà tài khoản hiện tại được phép xem.</p></div><CircleHelp aria-hidden="true" /></header><form className="question-search-form" onSubmit={search}><label htmlFor={inputId}><Search aria-hidden="true" /><span className="sr-only">Từ khóa câu hỏi</span><input ref={inputRef} id={inputId} value={query} onChange={event => setQuery(event.target.value)} placeholder="Nhập ít nhất 3 ký tự…" autoComplete="off" />{query ? <button type="button" aria-label="Xóa từ khóa" onClick={() => { setQuery(""); setResults([]); }}><X aria-hidden="true" /></button> : null}</label><button type="submit" disabled={loading}>{loading ? "Đang tìm…" : "Tra cứu"}</button></form><div className="question-search-upload"><label htmlFor={`${inputId}-file`}><Upload aria-hidden="true" />Quét ảnh OCR<input id={`${inputId}-file`} type="file" accept="image/*" onChange={event => void scanImage(event.target.files?.[0] ?? null)} /></label>{file ? <button type="button" onClick={() => { setFile(null); if (inputRef.current) inputRef.current.value = ""; }} aria-label="Bỏ ảnh đã chọn">{file.name}<X aria-hidden="true" /></button> : null}</div>{error ? <p className="question-search-error" role="alert">{error}</p> : null}<div className="question-search-results" aria-live="polite">{results.length ? results.map(question => <QuestionDetail question={question} key={question.id} />) : <p className="question-search-empty">Chưa có kết quả. Nhập nội dung để bắt đầu tra cứu.</p>}</div></section>;
}

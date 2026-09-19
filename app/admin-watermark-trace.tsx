"use client";

import { useRef, useState } from "react";
import { CheckCircle2, CircleAlert, FileSearch, Upload } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import { formatUiDateTime } from "./ui-format";

export const MAX_TRACE_FILE_BYTES = 50 * 1024 * 1024;

type TracePayload = {
  matched?: boolean;
  reason?: string;
  message?: string;
  visibleEmails?: string[];
  error?: string;
  attribution?: {
    userId: string;
    fullName: string | null;
    studentCode: string | null;
    email: string | null;
    resourceId: string;
    issuedAt: string;
    ipHash: string;
  };
};

function formatHash(value: string) {
  return value.length > 16 ? `${value.slice(0, 16)}…` : value;
}

export default function AdminWatermarkTrace() {
  const inputRef = useRef<HTMLInputElement | null>(null);
  const [file, setFile] = useState<File | null>(null);
  const [payload, setPayload] = useState<TracePayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setPayload(null);
    if (!file) {
      setError("Hãy chọn một tệp cần truy vết.");
      inputRef.current?.focus();
      return;
    }
    if (file.size > MAX_TRACE_FILE_BYTES) {
      setError("Tệp không được vượt quá 50 MB.");
      return;
    }
    const form = new FormData();
    form.set("file", file);
    setLoading(true);
    try {
      const response = await authenticatedFetch("/api/admin/watermark-trace", { method: "POST", body: form, cache: "no-store" });
      const result = await response.json().catch(() => null) as TracePayload | null;
      if (!response.ok && result?.matched !== false) throw new Error(result?.error ?? "Không thể kiểm tra watermark.");
      setPayload(result ?? { matched: false, message: "Không nhận được kết quả truy vết." });
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể kiểm tra watermark.");
    } finally {
      setLoading(false);
    }
  }

  return <section className="admin-watermark-trace" aria-labelledby="admin-watermark-trace-title">
    <header className="admin-watermark-trace-heading">
      <div><span className="admin-watermark-trace-kicker">SIGNED METADATA</span><h3 id="admin-watermark-trace-title">Kiểm tra dấu vết tài liệu</h3><p>Chỉ marker ký hợp lệ mới được dùng để xác định tài khoản. Ảnh chụp chỉ có watermark hiển thị sẽ không bị suy đoán.</p></div>
      <FileSearch aria-hidden="true" />
    </header>
    <form className="admin-watermark-trace-form" onSubmit={submit} aria-busy={loading}>
      <label htmlFor="watermark-trace-file">Tệp cần truy vết<span className="admin-watermark-trace-help">PDF đã tải xuống hoặc tệp marker văn bản · tối đa 50 MB</span></label>
      <input ref={inputRef} id="watermark-trace-file" name="file" type="file" accept=".pdf,image/*,text/plain" onChange={event => { setFile(event.target.files?.[0] ?? null); setPayload(null); setError(""); }} />
      {file ? <p className="admin-watermark-trace-file" role="status">Đã chọn <b>{file.name}</b> · {(file.size / 1024 / 1024).toFixed(2)} MB</p> : null}
      <button type="submit" className="aeck-button aeck-button-primary" disabled={loading || !file}><Upload aria-hidden="true" />{loading ? "Đang kiểm tra…" : "Truy vết watermark"}</button>
    </form>
    {error ? <p className="admin-watermark-trace-message is-error" role="alert"><CircleAlert aria-hidden="true" />{error}</p> : null}
    {payload?.matched === true && payload.attribution ? <div className="admin-watermark-trace-result is-matched" role="status" aria-live="polite"><CheckCircle2 aria-hidden="true" /><div><strong>Đã xác nhận marker</strong><dl><div><dt>Tài khoản</dt><dd>{payload.attribution.fullName || payload.attribution.email || payload.attribution.userId}</dd></div><div><dt>Email</dt><dd>{payload.attribution.email || "Không có email"}</dd></div><div><dt>Tài liệu</dt><dd>{payload.attribution.resourceId}</dd></div><div><dt>Thời điểm</dt><dd>{formatUiDateTime(payload.attribution.issuedAt, "Không rõ")}</dd></div><div><dt>IP hash</dt><dd>{formatHash(payload.attribution.ipHash)} · không lưu IP gốc</dd></div></dl></div></div> : null}
    {payload?.matched === false ? <div className="admin-watermark-trace-result is-unmatched" role="status" aria-live="polite"><CircleAlert aria-hidden="true" /><div><strong>Chưa thể xác định nguồn</strong><p>{payload.message || "Không tìm thấy marker ký hợp lệ."}</p>{payload.reason === "visible_only" ? <small>visible-only: chỉ có dấu hiển thị, chưa đủ bằng chứng để quy trách nhiệm.</small> : null}{payload.visibleEmails?.length ? <small>Watermark hiển thị tìm thấy: {payload.visibleEmails.join(", ")} · cần file gốc có marker ẩn để xác nhận.</small> : null}</div></div> : null}
  </section>;
}

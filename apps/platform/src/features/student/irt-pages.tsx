import { useQuery } from "@tanstack/react-query";
import { ArrowRight, BarChart3, BrainCircuit, CheckCircle2, ClipboardList, Clock3, Gauge, Search, Sparkles } from "lucide-react";
import { Link, useParams } from "react-router-dom";

import { platformCollectionQuery } from "../../api/platform-api.ts";
import { LoadingPanel } from "../../components/ui/loading-panel.tsx";
import { QueryError } from "../../components/ui/query-error.tsx";
import { legacyUrl } from "../parity/legacy-url.ts";
import "../../styles/student-modules.css";

function value(record: { metrics: Array<{ label: string; value: string | number }> }, label: string) {
  return record.metrics.find((item) => item.label === label)?.value ?? "—";
}

export function IrtExamCatalogPage() {
  const query = useQuery(platformCollectionQuery("irt-exams"));
  if (query.isPending) return <LoadingPanel label="Đang tải bài thi IRT…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  return <div className="aeck-student-module"><header className="aeck-student-page-heading"><div><h1>Bài thi IRT</h1><p>Đánh giá năng lực theo mô hình IRT và theo dõi kết quả trong hệ thống hiện tại.</p></div><Link className="aeck-button-secondary" to="/irt-results"><BarChart3 aria-hidden="true" />Kết quả IRT</Link></header><div className="aeck-irt-grid">{query.data.records.map((record) => <article key={record.id}><header><span><BrainCircuit aria-hidden="true" />IRT</span><span className="aeck-status" data-status={record.status}>{record.status === "published" ? "Sẵn sàng" : "Bản nháp"}</span></header><h2>{record.title}</h2><p>{record.description || "Bài đánh giá năng lực được cân chỉnh theo nhóm câu hỏi."}</p><dl><div><dt><ClipboardList aria-hidden="true" />Câu hỏi</dt><dd>{value(record, "Câu hỏi")}</dd></div><div><dt><Gauge aria-hidden="true" />Lượt thi</dt><dd>{value(record, "Lượt thi")}</dd></div></dl><Link to={`/irt-exam/${record.id}/register`}>Xem thông tin <ArrowRight aria-hidden="true" /></Link></article>)}</div></div>;
}

export function IrtResultsPage() {
  const query = useQuery(platformCollectionQuery("irt-exams"));
  if (query.isPending) return <LoadingPanel label="Đang tải kết quả IRT…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  return <div className="aeck-student-module"><header className="aeck-student-page-heading"><div><h1>Kết quả IRT</h1><p>Các kết quả chi tiết vẫn mở trong giao diện kết quả chuyên biệt để đảm bảo tương thích.</p></div></header><div className="aeck-irt-results-list">{query.data.records.map((record, index) => <article key={record.id}><span className="aeck-irt-result-rank">{String(index + 1).padStart(2, "0")}</span><div><span>{record.category}</span><h2>{record.title}</h2><p><CheckCircle2 aria-hidden="true" />Đã hoàn thành · {value(record, "Lượt thi")} lượt thi</p></div><a href={legacyUrl(`/irt-results?examId=${encodeURIComponent(String(record.id))}`)}>Mở kết quả <ArrowRight aria-hidden="true" /></a></article>)}</div></div>;
}

export function IrtRegistrationPage() {
  const { id = "" } = useParams();
  const query = useQuery(platformCollectionQuery("irt-exams"));
  if (query.isPending) return <LoadingPanel label="Đang tải thông tin bài IRT…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  const record = query.data.records.find((item) => String(item.id) === id) ?? query.data.records[0];
  if (!record) return <div className="aeck-student-empty"><Search aria-hidden="true" /><h2>Không tìm thấy bài IRT</h2></div>;
  return <div className="aeck-student-module aeck-irt-registration"><Link className="aeck-student-back" to="/irt-exams">Bài thi IRT</Link><header><span aria-hidden="true"><Sparkles /></span><div><span>{record.category}</span><h1>{record.title}</h1><p>{record.description}</p></div></header><section><article><ClipboardList aria-hidden="true" /><strong>{value(record, "Câu hỏi")}</strong><span>Câu hỏi</span></article><article><Clock3 aria-hidden="true" /><strong>60 phút</strong><span>Thời gian dự kiến</span></article><article><Gauge aria-hidden="true" /><strong>IRT</strong><span>Mô hình đánh giá</span></article></section><div className="aeck-irt-registration-action"><p>Sau khi bắt đầu, hệ thống sẽ chuyển sang luồng làm bài hiện tại và giữ nguyên giao diện tương thích.</p><a href={legacyUrl(`/irt-exam/${encodeURIComponent(String(record.id))}/register`)}>Đăng ký bài thi <ArrowRight aria-hidden="true" /></a></div></div>;
}

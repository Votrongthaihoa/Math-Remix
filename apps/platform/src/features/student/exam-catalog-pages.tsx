import { useQuery } from "@tanstack/react-query";
import {
  ArrowRight,
  BarChart3,
  BookOpen,
  CheckCircle2,
  Clock3,
  History,
  KeyRound,
  Search,
  Trophy,
} from "lucide-react";
import { useMemo, useState, type FormEvent } from "react";
import { Link, useParams } from "react-router-dom";

import { platformCollectionQuery } from "../../api/platform-api.ts";
import { LoadingPanel } from "../../components/ui/loading-panel.tsx";
import { QueryError } from "../../components/ui/query-error.tsx";
import { normalizedSearchText } from "../collections/collection-utils.ts";
import { legacyUrl } from "../parity/legacy-url.ts";
import "../../styles/student-modules.css";

function metric(record: { metrics: Array<{ label: string; value: string | number }> }, label: string) {
  return record.metrics.find((item) => item.label === label)?.value;
}

export function ExamRoomCatalogPage() {
  const { type } = useParams();
  const query = useQuery(platformCollectionQuery("exam-rooms"));
  const [filter, setFilter] = useState(type?.toLocaleUpperCase("vi") ?? "all");
  if (query.isPending) return <LoadingPanel label="Đang tải phòng khảo thí…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  const categories = ["all", ...new Set(query.data.records.map((record) => record.category))];
  const rooms = filter === "all" ? query.data.records : query.data.records.filter((room) => room.category === filter);
  return <div className="aeck-student-module aeck-exam-catalog"><header className="aeck-student-page-heading"><div><h1>Phòng khảo thí</h1><p>Chọn cấu trúc TSA, HSA, THPTQG hoặc V-SAT để xem đề được cấp quyền.</p></div><div className="aeck-segmented-filter" aria-label="Lọc loại bài thi">{categories.map((category) => <button key={category} type="button" aria-pressed={filter === category} onClick={() => setFilter(category)}>{category === "all" ? "Tất cả" : category}</button>)}</div></header><div className="aeck-exam-room-grid">{rooms.map((room, index) => <article key={room.id}><header><span>{room.category}</span><i>{String(index + 1).padStart(2, "0")}</i></header><div><BookOpen aria-hidden="true" /><h2>{room.title}</h2><p>{room.description}</p></div><footer><span>{metric(room, "Đề thi")} đề thi</span><Link to={`/assessment-list/${room.id}`}>Xem danh sách <ArrowRight aria-hidden="true" /></Link></footer></article>)}</div></div>;
}

export function AssessmentListPage() {
  const { examRoomId = "" } = useParams();
  const query = useQuery(platformCollectionQuery("assessments"));
  const [search, setSearch] = useState("");
  if (query.isPending) return <LoadingPanel label="Đang tải danh sách đề…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  const normalized = normalizedSearchText(search);
  const assessments = query.data.records.filter((record) => (!examRoomId || record.metadata.roomId === examRoomId) && normalizedSearchText(record.title).includes(normalized));
  return <div className="aeck-student-module"><header className="aeck-student-page-heading"><div><Link className="aeck-student-back" to="/exam-rooms/all">Phòng khảo thí</Link><h1>Danh sách đề thi</h1><p>Thông tin tổng quan trước khi chuyển sang giao diện làm bài được bảo vệ.</p></div><label className="aeck-student-search"><Search aria-hidden="true" /><span className="aeck-sr-only">Tìm đề thi</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm đề thi…" /></label></header><div className="aeck-assessment-list">{assessments.map((assessment, index) => <article key={assessment.id}><span className="aeck-assessment-index">{String(index + 1).padStart(2, "0")}</span><div><span>{assessment.category}</span><h2>{assessment.title}</h2><p><Clock3 aria-hidden="true" />{metric(assessment, "Thời gian")}<b>·</b><BookOpen aria-hidden="true" />{metric(assessment, "Câu hỏi")} câu</p></div><a href={legacyUrl(`/assessment/${assessment.id}`)}>Vào làm <ArrowRight aria-hidden="true" /></a></article>)}</div>{!assessments.length ? <div className="aeck-student-empty"><Search aria-hidden="true" /><h2>Chưa có đề phù hợp</h2><p>Hãy quay lại chọn phòng khảo thí khác.</p></div> : null}</div>;
}

export function ExamHistoryPage() {
  const query = useQuery(platformCollectionQuery("attempts"));
  const [search, setSearch] = useState("");
  if (query.isPending) return <LoadingPanel label="Đang tải lịch sử thi…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  const records = query.data.records.filter((record) => normalizedSearchText(`${record.title} ${record.category}`).includes(normalizedSearchText(search)));
  return <div className="aeck-student-module"><header className="aeck-student-page-heading"><div><h1>Lịch sử thi</h1><p>Theo dõi điểm số và mở lại kết quả trong giao diện chuyên biệt được giữ nguyên.</p></div><label className="aeck-student-search"><Search aria-hidden="true" /><span className="aeck-sr-only">Tìm lịch sử</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm bài thi…" /></label></header><section className="aeck-history-summary">{query.data.summary.map((item) => <article key={item.label}><span>{item.label}</span><strong>{item.value}</strong></article>)}</section><div className="aeck-history-list">{records.map((record) => <article key={record.id}><span className="aeck-history-icon" aria-hidden="true"><CheckCircle2 /></span><div><span>{record.category}</span><h2>{record.title}</h2><time dateTime={record.updatedAt ?? undefined}>{record.updatedAt ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "medium", timeStyle: "short", timeZone: "Asia/Ho_Chi_Minh" }).format(new Date(record.updatedAt)) : ""}</time></div><div className="aeck-history-score"><span>Điểm</span><strong>{metric(record, "Điểm")}</strong><small>{metric(record, "Đúng")}</small></div><a href={legacyUrl(String(record.metadata.resultPath ?? `/exam/result/${record.id}`))}>Xem kết quả</a></article>)}</div></div>;
}

export function StudentProgressPage() {
  const query = useQuery(platformCollectionQuery("progress"));
  if (query.isPending) return <LoadingPanel label="Đang tổng hợp tiến độ…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  return <div className="aeck-student-module"><header className="aeck-student-page-heading"><div><h1>Tiến độ học tập</h1><p>Tổng hợp lộ trình, chuỗi ngày học và các bước nên tiếp tục.</p></div></header><div className="aeck-progress-grid">{query.data.records.map((record) => { const progress = typeof record.metadata.progress === "number" ? record.metadata.progress : 0; return <article key={record.id}><header><BarChart3 aria-hidden="true" /><span>{record.category}</span></header><h2>{record.title}</h2><div className="aeck-progress-ring" style={{ "--progress": progress } as React.CSSProperties}><strong>{progress}%</strong></div><dl>{record.metrics.map((item) => <div key={item.label}><dt>{item.label}</dt><dd>{item.value}</dd></div>)}</dl><Link to="/courses">Tiếp tục học <ArrowRight aria-hidden="true" /></Link></article>; })}</div></div>;
}

export function RecapPage() {
  const query = useQuery(platformCollectionQuery("attempts"));
  const recap = useMemo(() => {
    const records = query.data?.records ?? [];
    const scores = records.map((record) => Number(metric(record, "Điểm"))).filter(Number.isFinite);
    return { count: records.length, best: scores.length ? Math.max(...scores) : 0, average: scores.length ? Math.round(scores.reduce((sum, score) => sum + score, 0) / scores.length * 10) / 10 : 0 };
  }, [query.data]);
  if (query.isPending) return <LoadingPanel label="Đang tạo bản tổng kết…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  return <div className="aeck-student-module aeck-recap-page"><header><span aria-hidden="true"><Trophy /></span><h1>Tổng kết luyện tập</h1><p>Một góc nhìn ngắn gọn về quá trình làm bài gần đây.</p></header><section><article><History aria-hidden="true" /><span>Bài đã làm</span><strong>{recap.count}</strong></article><article><Trophy aria-hidden="true" /><span>Điểm cao nhất</span><strong>{recap.best}</strong></article><article><BarChart3 aria-hidden="true" /><span>Điểm trung bình</span><strong>{recap.average}</strong></article></section><div><h2>Gợi ý tiếp theo</h2><p>Tiếp tục một bài luyện ngắn để duy trì nhịp học, sau đó xem lại chuyên đề có điểm thấp nhất.</p><Link to="/exam-rooms/all">Chọn bài luyện <ArrowRight aria-hidden="true" /></Link></div></div>;
}

export function EnterByCodePage() {
  const [code, setCode] = useState("");
  const [error, setError] = useState("");
  const submit = (event: FormEvent) => {
    event.preventDefault();
    const normalized = code.trim().toLocaleUpperCase("vi");
    if (!/^[A-Z0-9-]{4,32}$/.test(normalized)) { setError("Mã truy cập gồm 4–32 chữ cái, số hoặc dấu gạch ngang."); return; }
    window.location.assign(legacyUrl(`/enter?code=${encodeURIComponent(normalized)}`));
  };
  return <main className="aeck-enter-page"><form onSubmit={submit}><span aria-hidden="true"><KeyRound /></span><h1>Nhập mã phòng thi</h1><p>Dùng mã được giáo viên hoặc quản trị viên cung cấp.</p><label htmlFor="aeck-room-code">Mã truy cập</label><input id="aeck-room-code" value={code} onChange={(event) => { setCode(event.target.value); setError(""); }} autoComplete="off" autoCapitalize="characters" spellCheck={false} aria-invalid={Boolean(error)} aria-describedby={error ? "aeck-room-code-error" : undefined} placeholder="Ví dụ: TSA-2026" />{error ? <p id="aeck-room-code-error" role="alert">{error}</p> : null}<button type="submit">Tiếp tục <ArrowRight aria-hidden="true" /></button><Link to="/login">Quay lại đăng nhập</Link></form></main>;
}

"use client";

// Port of the supplied StudentsPage: summary, filtered table, and student detail.
// Existing authenticated create/password handlers stay in platform.tsx.
import { useMemo, useState } from "react";
import { Download, Eye, LockKeyhole, Plus, RefreshCw, Search, Users } from "lucide-react";
import type { AdminProfileRow } from "./admin-types";
import { AdminReferenceDataTable, type ReferenceColumn } from "./admin-reference-data-table";
import AdminReferenceDialog from "./admin-reference-dialog";
import { filterRoster, type RosterEnrollment, type RosterSort, type RosterStatus } from "./admin-roster-query";
import { downloadCsv } from "../lib/download-csv";
import { formatUiDate } from "./ui-format";
import LoadingIndicator from "./loading-indicator";
import "./admin-reference-data-table.css";
import "./admin-student-roster.css";

const PAGE_SIZE = 20;
export default function AdminStudentRoster({ students, enrollmentCount, loading, error, truncated, searchTerm, onSearch, onRetry, onCreate, onPassword }: {
  students: AdminProfileRow[]; enrollmentCount: Record<string, number>; loading: boolean; error: string; truncated: boolean;
  searchTerm: string; onSearch: (value: string) => void; onRetry: () => void; onCreate: () => void; onPassword: (student: AdminProfileRow) => void;
}) {
  const [status, setStatus] = useState<RosterStatus>("all");
  const [enrollment, setEnrollment] = useState<RosterEnrollment>("all");
  const [sort, setSort] = useState<RosterSort>("name");
  const [page, setPage] = useState(1);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const selected = students.find(student => student.id === selectedId);
  const filtered = useMemo(() => filterRoster(students, enrollmentCount, searchTerm, status, enrollment, sort), [students, enrollmentCount, searchTerm, status, enrollment, sort]);
  const safePage = Math.min(page, Math.max(1, Math.ceil(filtered.length / PAGE_SIZE)));
  const hasFilters = Boolean(searchTerm || status !== "all" || enrollment !== "all");
  function reset() { onSearch(""); setStatus("all"); setEnrollment("all"); setPage(1); }
  function exportRows() { downloadCsv("hoc-vien-da-loc.csv", [
    ["Mã học viên", "Họ và tên", "Email", "Trạng thái", "Số khóa học", "Ngày tạo"],
    ...filtered.map(student => [student.student_code, student.full_name, student.email, student.status === "active" ? "Hoạt động" : "Đã khóa", enrollmentCount[student.id] ?? 0, formatUiDate(student.created_at, "")]),
  ]); }
  const columns: ReferenceColumn<AdminProfileRow>[] = [
    { key: "name", title: "Học viên / Email", className: "roster-person-column", render: student => <button className="roster-person" onClick={() => setSelectedId(student.id)} type="button" aria-label={`Xem hồ sơ ${student.full_name}`}><span className="roster-avatar" aria-hidden="true">{student.full_name.trim().split(/\s+/).slice(-2).map(word => word[0]).join("").toUpperCase()}</span><span><strong>{student.full_name}</strong><small>{student.email || "Chưa có email"}</small></span></button> },
    { key: "code", title: "Mã học viên", render: student => student.student_code },
    { key: "courses", title: "Khóa học", render: student => `${enrollmentCount[student.id] ?? 0} khóa` },
    { key: "status", title: "Trạng thái", render: student => <span className="roster-status">{student.status === "active" ? "Hoạt động" : "Đã khóa"}</span> },
    { key: "actions", title: "Thao tác", render: student => <div className="roster-row-actions"><button type="button" onClick={() => setSelectedId(student.id)} aria-label={`Chi tiết ${student.full_name}`}><Eye size={16} aria-hidden="true" /> Chi tiết</button><button type="button" className="student-password-btn" onClick={() => onPassword(student)} aria-label={`Đổi mật khẩu cho ${student.full_name}`}><LockKeyhole size={16} aria-hidden="true" /> Đổi mật khẩu</button></div> },
  ];
  return <section className="section-card student-manager admin-student-roster" aria-labelledby="roster-title">
    <header className="roster-head"><div><h2 id="roster-title">Quản lý học viên</h2><p>Hồ sơ, trạng thái và khóa học đã được cấp.</p></div><div className="roster-actions"><button type="button" onClick={exportRows} disabled={loading || Boolean(error) || !filtered.length}><Download size={16} aria-hidden="true" /> Xuất CSV</button><button type="button" className="primary-btn" onClick={onCreate}><Plus size={16} aria-hidden="true" /> Thêm học viên</button></div></header>
    <div className="roster-summary" aria-label="Thống kê danh sách đã tải"><span><Users size={18} aria-hidden="true" /><b>{students.length}</b> học viên đã tải</span><span><b>{students.filter(student => student.status === "active").length}</b> hoạt động</span><span><b>{students.filter(student => student.status === "locked").length}</b> đã khóa</span></div>
    {truncated && <p className="student-data-warning" role="status">Danh sách email chưa chắc đầy đủ vì máy chủ đã chạm giới hạn phân trang. CSV chỉ gồm dữ liệu đã tải.</p>}
    <div className="roster-filters">
      <label>Tìm học viên<span className="roster-search"><Search size={18} aria-hidden="true" /><input type="search" name="rosterSearch" autoComplete="off" aria-label="Tìm học viên theo tên, mã hoặc email" value={searchTerm} onChange={event => { onSearch(event.target.value); setPage(1); }} placeholder="Tên, mã học viên hoặc email" /></span></label>
      <label>Trạng thái<select value={status} onChange={event => { setStatus(event.target.value as RosterStatus); setPage(1); }}><option value="all">Tất cả trạng thái</option><option value="active">Hoạt động</option><option value="locked">Đã khóa</option></select></label>
      <label>Khóa học<select value={enrollment} onChange={event => { setEnrollment(event.target.value as RosterEnrollment); setPage(1); }}><option value="all">Tất cả học viên</option><option value="assigned">Đã có khóa học</option><option value="unassigned">Chưa có khóa học</option></select></label>
      <label>Sắp xếp<select value={sort} onChange={event => { setSort(event.target.value as RosterSort); setPage(1); }}><option value="name">Tên A–Z</option><option value="code">Mã học viên</option><option value="courses">Nhiều khóa học nhất</option><option value="newest">Mới tạo nhất</option></select></label>
    </div>
    <div className="roster-result"><p role="status">{loading ? "Đang tải học viên…" : `${filtered.length} kết quả trong ${students.length} học viên đã tải`}</p>{hasFilters && <button type="button" onClick={reset}>Đặt lại bộ lọc</button>}</div>
    {error && <div role="alert" className="roster-feedback"><h3>Không thể cập nhật danh sách học viên</h3><p>{error}</p><button type="button" onClick={onRetry} disabled={loading}><RefreshCw size={16} aria-hidden="true" /> Thử lại</button></div>}
    {loading ? <LoadingIndicator label="Đang tải dữ liệu…" /> : filtered.length ? <AdminReferenceDataTable columns={columns} rows={filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE)} rowKey={student => student.id} caption="Danh sách học viên" page={safePage} pageSize={PAGE_SIZE} total={filtered.length} onPageChange={setPage} paginationLabel="Phân trang học viên" /> : !error && <div className="roster-feedback"><h3>{hasFilters ? "Không tìm thấy học viên phù hợp" : "Chưa có học viên"}</h3><p>{hasFilters ? "Thử tên, mã hoặc email khác, hoặc đặt lại bộ lọc." : "Thêm tài khoản để bắt đầu quản lý học viên."}</p><button type="button" onClick={hasFilters ? reset : onCreate}>{hasFilters ? "Xóa bộ lọc" : "Thêm học viên"}</button></div>}
    {selected && <AdminReferenceDialog title="Hồ sơ học viên" onClose={() => setSelectedId(null)}><h3>{selected.full_name}</h3><dl><div><dt>Mã học viên</dt><dd>{selected.student_code}</dd></div><div><dt>Email</dt><dd>{selected.email || "Chưa có email"}</dd></div><div><dt>Trạng thái</dt><dd>{selected.status === "active" ? "Hoạt động" : "Đã khóa"}</dd></div><div><dt>Khóa học được cấp</dt><dd>{enrollmentCount[selected.id] ?? 0}</dd></div><div><dt>Ngày tạo</dt><dd>{formatUiDate(selected.created_at, "Chưa có thông tin")}</dd></div></dl></AdminReferenceDialog>}
  </section>;
}

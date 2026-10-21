"use client";

import { useCallback, useMemo, useState, type FormEvent } from "react";
import { LockKeyhole, Plus, Search, X, UserX } from "lucide-react";
import { AeckPagination } from "./aeck-ui";
import LoadingIndicator from "./loading-indicator";
import type { AdminProfileRow } from "./admin-types";

type SortKey = "name" | "code" | "courses" | "status";
type SortDir = "asc" | "desc";

const PAGE_SIZE = 20;

function avatarInitials(name: string) {
  return name.split(" ").slice(-2).map(w => w[0]).join("").toUpperCase();
}

export default function AdminStudents({
  students,
  enrollmentCount,
  loading,
  truncated,
  onNotice,
  onReload,
}: {
  students: AdminProfileRow[];
  enrollmentCount: Record<string, number>;
  loading: boolean;
  truncated: boolean;
  onNotice: (message: string) => void;
  onReload: () => Promise<void>;
}) {
  const [searchTerm, setSearchTerm] = useState("");
  const [page, setPage] = useState(1);
  const [sortKey, setSortKey] = useState<SortKey>("name");
  const [sortDir, setSortDir] = useState<SortDir>("asc");

  // Create student modal
  const [modal, setModal] = useState(false);
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newStudentPassword, setNewStudentPassword] = useState("");
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [createError, setCreateError] = useState("");

  // Password modal
  const [passwordStudent, setPasswordStudent] = useState<AdminProfileRow | null>(null);
  const [adminStudentPassword, setAdminStudentPassword] = useState("");
  const [adminStudentPasswordConfirm, setAdminStudentPasswordConfirm] = useState("");
  const [studentPasswordError, setStudentPasswordError] = useState("");
  const [savingStudentPassword, setSavingStudentPassword] = useState(false);

  const toggleSort = useCallback((key: SortKey) => {
    setSortKey(key);
    setSortDir(sortKey === key ? (sortDir === "asc" ? "desc" : "asc") : "asc");
    setPage(1);
  }, [sortDir, sortKey]);

  const filtered = useMemo(() => {
    const q = searchTerm.trim().toLocaleLowerCase("vi");
    const base = q
      ? students.filter(s => `${s.full_name} ${s.student_code} ${s.email}`.toLocaleLowerCase("vi").includes(q))
      : students;

    const sorted = [...base].sort((a, b) => {
      let cmp = 0;
      switch (sortKey) {
        case "name": cmp = a.full_name.localeCompare(b.full_name, "vi"); break;
        case "code": cmp = a.student_code.localeCompare(b.student_code); break;
        case "courses": cmp = (enrollmentCount[a.id] ?? 0) - (enrollmentCount[b.id] ?? 0); break;
        case "status": cmp = a.status.localeCompare(b.status); break;
      }
      return sortDir === "desc" ? -cmp : cmp;
    });
    return sorted;
  }, [searchTerm, students, sortKey, sortDir, enrollmentCount]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));
  const safePage = Math.min(page, totalPages);
  const pageStudents = filtered.slice((safePage - 1) * PAGE_SIZE, safePage * PAGE_SIZE);

  function openCreateModal() {
    setCreateError("");
    setModal(true);
  }

  function closeCreateModal() {
    setModal(false);
  }

  async function createStudent(event: FormEvent) {
    event.preventDefault();
    setCreateError("");
    setCreatingStudent(true);
    try {
      const { authenticatedFetch } = await import("../lib/auth-client");
      const response = await authenticatedFetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), password: newStudentPassword, fullName: newFullName.trim() }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Không thể tạo học viên.");
      setModal(false);
      setNewFullName("");
      setNewEmail("");
      setNewStudentPassword("");
      onNotice("Đã tạo tài khoản học viên.");
      await onReload();
    } catch (value) {
      setCreateError(value instanceof Error ? value.message : "Không thể tạo học viên. Hãy thử lại.");
    } finally {
      setCreatingStudent(false);
    }
  }

  function openStudentPassword(student: AdminProfileRow) {
    setPasswordStudent(student);
    setAdminStudentPassword("");
    setAdminStudentPasswordConfirm("");
    setStudentPasswordError("");
  }

  function closeStudentPassword() {
    if (savingStudentPassword) return;
    setPasswordStudent(null);
    setAdminStudentPassword("");
    setAdminStudentPasswordConfirm("");
    setStudentPasswordError("");
  }

  async function changeStudentPassword(event: FormEvent) {
    event.preventDefault();
    setStudentPasswordError("");
    if (!passwordStudent) { setStudentPasswordError("Không tìm thấy học viên."); return; }
    if (adminStudentPassword.length < 8) { setStudentPasswordError("Mật khẩu phải có ít nhất 8 ký tự."); return; }
    if (adminStudentPassword !== adminStudentPasswordConfirm) { setStudentPasswordError("Mật khẩu xác nhận không khớp."); return; }
    setSavingStudentPassword(true);
    try {
      const { authenticatedFetch } = await import("../lib/auth-client");
      const response = await authenticatedFetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: passwordStudent.id, password: adminStudentPassword }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Không thể đổi mật khẩu học viên.");
      const studentLabel = `${passwordStudent.student_code} — ${passwordStudent.full_name}`;
      setPasswordStudent(null);
      setAdminStudentPassword("");
      setAdminStudentPasswordConfirm("");
      onNotice(`Đã đổi mật khẩu cho ${studentLabel}.`);
    } catch (value) {
      setStudentPasswordError(value instanceof Error ? value.message : "Không thể đổi mật khẩu học viên. Hãy thử lại.");
    } finally {
      setSavingStudentPassword(false);
    }
  }

  function sortIndicator(key: SortKey) {
    if (sortKey !== key) return "";
    return sortDir === "asc" ? " ↑" : " ↓";
  }

  return (
    <>
      <section className="section-card student-manager">
        <div className="section-head">
          <div>
            <h2>Quản lý học viên</h2>
            <p className="muted">Dữ liệu tài khoản, email và khóa học từ Supabase.</p>
          </div>
          <button type="button" className="primary-btn small" onClick={openCreateModal}>
            <Plus /> Thêm học viên
          </button>
        </div>

        {truncated && (
          <p className="student-data-warning" role="status" aria-live="polite">
            Danh sách email chưa chắc đầy đủ vì máy chủ đã chạm giới hạn phân trang.
          </p>
        )}

        <label className="search wide student-search">
          <Search />
          <input
            type="search"
            value={searchTerm}
            onChange={e => { setSearchTerm(e.target.value); setPage(1); }}
            placeholder="Tìm theo tên, mã học viên hoặc email…"
            aria-label="Tìm học viên theo tên, mã hoặc email"
          />
          {searchTerm && (
            <button type="button" onClick={() => { setSearchTerm(""); setPage(1); }} aria-label="Xóa từ khóa">
              <X />
            </button>
          )}
        </label>
        <div className="student-search-hint">Có thể nhập toàn bộ hoặc một phần địa chỉ email.</div>

        <div className="admin-table student-table">
          <div className="table-row table-title">
            <span className="sortable-header" role="button" tabIndex={0} onClick={() => toggleSort("name")} onKeyDown={e => e.key === "Enter" && toggleSort("name")}>
              Học viên / Email{sortIndicator("name")}
            </span>
            <span className="sortable-header" role="button" tabIndex={0} onClick={() => toggleSort("code")} onKeyDown={e => e.key === "Enter" && toggleSort("code")}>
              Mã{sortIndicator("code")}
            </span>
            <span className="sortable-header" role="button" tabIndex={0} onClick={() => toggleSort("courses")} onKeyDown={e => e.key === "Enter" && toggleSort("courses")}>
              Khóa học{sortIndicator("courses")}
            </span>
            <span className="sortable-header" role="button" tabIndex={0} onClick={() => toggleSort("status")} onKeyDown={e => e.key === "Enter" && toggleSort("status")}>
              Trạng thái{sortIndicator("status")}
            </span>
            <span>Thao tác</span>
          </div>

          {loading ? (
            <LoadingIndicator label="Đang tải dữ liệu…" />
          ) : pageStudents.length ? (
            pageStudents.map(student => (
              <div className="table-row" key={student.id}>
                <span>
                  <i className="mini-avatar">{avatarInitials(student.full_name)}</i>
                  <span className="student-name-email">
                    <b>{student.full_name}</b>
                    <small>{student.email || "Chưa có email"}</small>
                  </span>
                </span>
                <span>{student.student_code}</span>
                <span>{enrollmentCount[student.id] ?? 0} khóa</span>
                <span>
                  <i className={student.status === "active" ? "active-dot" : "locked-dot"} />
                  {" "}{student.status === "active" ? "Hoạt động" : "Đã khóa"}
                </span>
                <span>
                  <button
                    type="button"
                    className="student-password-btn"
                    aria-label={`Đổi mật khẩu cho ${student.full_name}`}
                    onClick={() => openStudentPassword(student)}
                  >
                    <LockKeyhole /> Đổi mật khẩu
                  </button>
                </span>
              </div>
            ))
          ) : (
            <div className="overview-empty">
              <UserX className="empty-icon" size={48} strokeWidth={1} style={{ opacity: 0.5, marginBottom: 8 }} />
              <br />
              Không tìm thấy học viên phù hợp.
            </div>
          )}
        </div>

        {!loading && filtered.length > PAGE_SIZE && (
          <AeckPagination
            page={safePage}
            hasNextPage={safePage < totalPages}
            onPrevious={() => setPage(p => Math.max(1, p - 1))}
            onNext={() => setPage(p => Math.min(totalPages, p + 1))}
          />
        )}
      </section>

      {/* Create student modal */}
      {modal && (
        <div className="modal-shade">
          <form className="modal" role="dialog" aria-modal="true" aria-labelledby="create-student-title" onSubmit={createStudent}>
            <div className="section-head">
              <div>
                <span className="eyebrow">TÀI KHOẢN MỚI</span>
                <h2 id="create-student-title">Thêm học viên</h2>
              </div>
              <button type="button" className="icon-btn" aria-label="Đóng hộp thoại thêm học viên" onClick={closeCreateModal}>
                <X aria-hidden="true" />
              </button>
            </div>
            <label htmlFor="new-student-name">
              Họ và tên
              <input id="new-student-name" name="fullName" autoComplete="name" value={newFullName} onChange={e => setNewFullName(e.target.value)} placeholder="Nguyễn Văn A" required />
            </label>
            <label htmlFor="new-student-email">
              Email
              <input id="new-student-email" name="email" type="email" autoComplete="email" spellCheck={false} value={newEmail} onChange={e => setNewEmail(e.target.value)} placeholder="hocvien@example.com" required />
            </label>
            <label htmlFor="new-student-password">
              Mật khẩu ban đầu
              <input id="new-student-password" name="password" type="password" autoComplete="new-password" value={newStudentPassword} onChange={e => setNewStudentPassword(e.target.value)} placeholder="Tối thiểu 8 ký tự" minLength={8} required />
            </label>
            {createError && <p className="form-error" role="alert">{createError}</p>}
            <p className="info-note">Mã học viên tiếp theo được Supabase tạo tự động theo dạng REMIX000001.</p>
            <button type="submit" className="primary-btn" disabled={creatingStudent}>
              {creatingStudent ? "Đang tạo…" : "Tạo tài khoản"}
            </button>
          </form>
        </div>
      )}

      {/* Password modal */}
      {passwordStudent && (
        <div className="modal-shade">
          <form className="modal password-modal" role="dialog" aria-modal="true" aria-labelledby="student-password-title" onSubmit={changeStudentPassword}>
            <div className="section-head">
              <div>
                <span className="eyebrow">BẢO MẬT HỌC VIÊN</span>
                <h2 id="student-password-title">Đổi mật khẩu</h2>
              </div>
              <button type="button" className="icon-btn" aria-label="Đóng hộp thoại đổi mật khẩu" onClick={closeStudentPassword} disabled={savingStudentPassword}>
                <X aria-hidden="true" />
              </button>
            </div>
            <div className="student-password-identity">
              <span className="mini-avatar">{avatarInitials(passwordStudent.full_name)}</span>
              <div>
                <b>{passwordStudent.full_name}</b>
                <small>{passwordStudent.student_code}</small>
              </div>
            </div>
            <label htmlFor="admin-student-password">
              Mật khẩu mới
              <input id="admin-student-password" name="password" type="password" autoComplete="new-password" value={adminStudentPassword} onChange={e => setAdminStudentPassword(e.target.value)} placeholder="Tối thiểu 8 ký tự" minLength={8} required autoFocus />
            </label>
            <label htmlFor="admin-student-password-confirm">
              Xác nhận mật khẩu
              <input id="admin-student-password-confirm" name="passwordConfirmation" type="password" autoComplete="new-password" value={adminStudentPasswordConfirm} onChange={e => setAdminStudentPasswordConfirm(e.target.value)} placeholder="Nhập lại mật khẩu mới" minLength={8} required />
            </label>
            {studentPasswordError && <p className="form-error" role="alert">{studentPasswordError}</p>}
            <p className="info-note">Học viên có thể đăng nhập ngay bằng mật khẩu mới sau khi cập nhật.</p>
            <button type="submit" className="primary-btn" disabled={savingStudentPassword}>
              {savingStudentPassword ? "Đang cập nhật…" : "Cập nhật mật khẩu"}
            </button>
          </form>
        </div>
      )}
    </>
  );
}

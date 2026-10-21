"use client";

import { useMemo, type CSSProperties, type MouseEvent } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ChevronRight, Download, ExternalLink, Library, List, Plus, Search, Table2, X } from "lucide-react";
import LoadingIndicator from "./loading-indicator";
import { filterAndSortAdminCourses, type AdminCourseSort, type AdminCourseStatus } from "./admin-course-catalog";
import type { AdminCourseRow } from "./admin-types";
import { AdminReferenceDataTable, ReferencePagination, type ReferenceColumn } from "./admin-reference-data-table";
import { ADMIN_CATALOG_PAGE_SIZE, readAdminCatalogLocation, updateAdminCatalogLocation, type AdminCatalogLocation } from "./admin-catalog-location";
import { formatUiDate } from "./ui-format";
import { downloadCsv } from "../lib/download-csv";
import "./admin-reference-data-table.css";

type AdminContentListProps = {
  courses: AdminCourseRow[];
  lessonsPerCourse: Record<string, number>;
  loading: boolean;
  error: string;
  onRetry: () => void;
  onOpenCourse: (courseId: string) => void;
  onCreate: () => void;
};

function courseColorStyle(value: string | null | undefined) {
  const color = /^#[0-9a-f]{6}$/i.test(value ?? "") ? value : "var(--brand-red)";
  return { "--course-color": color } as CSSProperties;
}

export default function AdminContentList({ courses, lessonsPerCourse, loading, error, onRetry, onOpenCourse, onCreate }: AdminContentListProps) {
  const searchParams = useSearchParams();
  const { q: searchTerm, status, sort, view, page } = readAdminCatalogLocation(searchParams);
  const hasFilters = Boolean(searchTerm.trim()) || status !== "all" || sort !== "order";
  const visibleCourses = useMemo(
    () => filterAndSortAdminCourses(courses, { query: searchTerm, status, sort }),
    [courses, searchTerm, status, sort],
  );

  const safePage = Math.min(page, Math.max(1, Math.ceil(visibleCourses.length / ADMIN_CATALOG_PAGE_SIZE)));
  const pageRows = visibleCourses.slice((safePage - 1) * ADMIN_CATALOG_PAGE_SIZE, safePage * ADMIN_CATALOG_PAGE_SIZE);

  function updateLocation(patch: Partial<AdminCatalogLocation>, replace = false) {
    const query = updateAdminCatalogLocation(window.location.search, patch);
    const destination = `${window.location.pathname}${query ? `?${query}` : ""}${window.location.hash}`;
    // Next's native history integration keeps useSearchParams and Back/Forward in sync.
    if (replace) window.history.replaceState(null, "", destination);
    else window.history.pushState(null, "", destination);
  }

  function resetFilters() { updateLocation({ q: "", status: "all", sort: "order", page: 1 }); }
  function openCourse(event: MouseEvent<HTMLAnchorElement>, courseId: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpenCourse(courseId);
  }
  function exportCourses() {
    downloadCsv("danh-muc-khoa-hoc.csv", [
      ["Mã khóa học", "Tên khóa học", "Mô tả", "Trạng thái", "Số bài học", "Ngày tạo"],
      ...visibleCourses.map(course => [course.id, course.title, course.description, course.published ? "Đã xuất bản" : "Bản nháp", lessonsPerCourse[course.id] ?? 0, formatUiDate(course.created_at, "")]),
    ]);
  }
  // CoursesPage.tsx in the supplied frontend defines these same source columns.
  // Only fields available in AdminCourseRow are displayed; no mock exam types/groups.
  const columns: ReferenceColumn<AdminCourseRow>[] = [
    { key: "course", title: "Khóa học", className: "admin-source-course-column", render: course => <div className="admin-source-course-cell">
      <span className="admin-source-course-cover" style={courseColorStyle(course.cover_color)}>
        <Library aria-hidden="true" size={20} />
        {course.cover_url && (
          // Course covers support arbitrary existing storage hosts, just like the list view.
          // eslint-disable-next-line @next/next/no-img-element
          <img src={course.cover_url} alt="" width={48} height={48} loading="lazy" decoding="async" onError={event => { event.currentTarget.hidden = true; }} />
        )}
      </span>
      <span><Link href={`/admin/content/courses/${encodeURIComponent(course.id)}`} onClick={event => openCourse(event, course.id)}>{course.title}</Link>{course.description && <details><summary>Mô tả khóa học</summary><p>{course.description}</p></details>}</span>
    </div> },
    { key: "status", title: "Trạng thái", render: course => <span className={`admin-content-catalog-status${course.published ? " is-published" : ""}`}>{course.published ? "Đã xuất bản" : "Bản nháp"}</span> },
    { key: "lessons", title: "Số bài học", render: course => <span>{lessonsPerCourse[course.id] ?? 0}</span> },
    { key: "created", title: "Ngày tạo", render: course => formatUiDate(course.created_at, "Chưa có") },
    { key: "actions", title: "Thao tác", align: "right", render: course => <Link className="admin-source-course-action" href={`/admin/content/courses/${encodeURIComponent(course.id)}`} onClick={event => openCourse(event, course.id)} aria-label={`Quản lý khóa học ${course.title}`}>Quản lý <ChevronRight size={16} aria-hidden="true" /></Link> },
  ];

  return (
    <section className="section-card admin-content-catalog" aria-labelledby="admin-content-catalog-title">
      <div className="section-head admin-content-catalog-head">
        <div>
          <h2 id="admin-content-catalog-title">Quản lý nội dung</h2>
          <p className="muted">Khóa học được chia theo Phần → Bài → Bài giảng / tài liệu.</p>
        </div>
        <div className="admin-source-catalog-actions">
          <Link href="/courses" className="outline-btn"><ExternalLink aria-hidden="true" /> Xem trang khóa học</Link>
          <button type="button" className="outline-btn" onClick={exportCourses} disabled={loading || Boolean(error) || !visibleCourses.length} title="Xuất tất cả kết quả đã lọc trong danh sách đã tải"><Download aria-hidden="true" /> Xuất CSV</button>
          <button type="button" className="primary-btn small" onClick={onCreate}><Plus aria-hidden="true" /> Tạo khóa học</button>
        </div>
      </div>

      <div className="admin-content-catalog-controls">
        <div className="admin-content-catalog-field admin-content-catalog-search">
          <label htmlFor="admin-content-catalog-query">Tìm khóa học</label>
          <span className="admin-content-catalog-search-input">
            <Search aria-hidden="true" />
            <input
              id="admin-content-catalog-query"
              name="q"
              type="search"
              value={searchTerm}
              onChange={event => updateLocation({ q: event.target.value, page: 1 }, true)}
              placeholder="Tên hoặc mô tả khóa học"
              autoComplete="off"
            />
            {searchTerm && (
              <button type="button" aria-label="Xóa từ khóa tìm kiếm" onClick={() => updateLocation({ q: "", page: 1 })}>
                <X aria-hidden="true" />
              </button>
            )}
          </span>
        </div>
        <label className="admin-content-catalog-field">
          <span>Trạng thái</span>
          <select name="status" value={status} onChange={event => updateLocation({ status: event.target.value as AdminCourseStatus, page: 1 })}>
            <option value="all">Tất cả</option>
            <option value="published">Đã xuất bản</option>
            <option value="draft">Bản nháp</option>
          </select>
        </label>
        <label className="admin-content-catalog-field">
          <span>Sắp xếp</span>
          <select name="sort" value={sort} onChange={event => updateLocation({ sort: event.target.value as AdminCourseSort, page: 1 })}>
            <option value="order">Thứ tự khóa học</option>
            <option value="newest">Mới tạo trước</option>
            <option value="title">Tên A–Z</option>
          </select>
        </label>
      </div>

      <div className="admin-content-catalog-summary">
        <p role="status" aria-live="polite">
          {loading ? "Đang tải khóa học…" : courses.length ? `Hiển thị ${visibleCourses.length} / ${courses.length} khóa học${error ? " · Dữ liệu có thể chưa cập nhật" : ""}` : error ? "Không thể hiển thị danh sách." : "Hiển thị 0 / 0 khóa học"}
        </p>
        {hasFilters && <button type="button" onClick={resetFilters}>Đặt lại bộ lọc</button>}
        <div className="admin-source-catalog-view" role="group" aria-label="Cách hiển thị khóa học">
          <button type="button" aria-pressed={view === "table"} onClick={() => updateLocation({ view: "table" })}><Table2 size={16} aria-hidden="true" /> Bảng</button>
          <button type="button" aria-pressed={view === "list"} onClick={() => updateLocation({ view: "list" })}><List size={16} aria-hidden="true" /> Danh sách</button>
        </div>
      </div>

      {!loading && error && courses.length > 0 && (
        <div className="admin-content-catalog-warning" role="alert">
          <p>Không thể cập nhật khóa học: {error}</p>
          <button type="button" className="outline-btn" onClick={onRetry}>Thử lại</button>
        </div>
      )}

      {loading ? (
        <div className="admin-content-catalog-feedback"><LoadingIndicator label="Đang tải dữ liệu…" /></div>
      ) : error && courses.length === 0 ? (
        <div className="admin-content-catalog-feedback" role="alert">
          <h3>Không tải được khóa học</h3>
          <p>{error}</p>
          <button type="button" className="outline-btn" onClick={onRetry}>Thử lại</button>
        </div>
      ) : visibleCourses.length && view === "table" ? (
        <AdminReferenceDataTable columns={columns} rows={pageRows} rowKey={course => course.id} caption="Danh mục khóa học" page={safePage} pageSize={ADMIN_CATALOG_PAGE_SIZE} total={visibleCourses.length} onPageChange={nextPage => updateLocation({ page: nextPage })} />
      ) : visibleCourses.length ? (
        <>
        <div className="content-admin-grid admin-content-catalog-list">
          {pageRows.map(course => (
            <article key={course.id}>
              <div className="tiny-cover" style={courseColorStyle(course.cover_color)}>
                {course.cover_url ? (
                  // Cover URLs are supplied by existing course data and can be external hosts.
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={course.cover_url} alt="" width={320} height={180} loading="lazy" decoding="async" />
                ) : (
                  <Library aria-hidden="true" />
                )}
              </div>
              <div className="admin-content-catalog-copy">
                <div className="admin-content-catalog-title-line">
                  <h3>{course.title}</h3>
                  <span className={course.published ? "admin-content-catalog-status is-published" : "admin-content-catalog-status"}>
                    {course.published ? "Đã xuất bản" : "Bản nháp"}
                  </span>
                </div>
                {course.description && <p className="admin-content-catalog-description">{course.description}</p>}
                <p className="admin-content-catalog-meta">{lessonsPerCourse[course.id] ?? 0} bài học</p>
              </div>
              <button type="button" className="outline-btn admin-content-catalog-open" onClick={() => onOpenCourse(course.id)} aria-label={`Quản lý khóa học ${course.title}`}>
                Quản lý <ChevronRight aria-hidden="true" />
              </button>
            </article>
          ))}
        </div>
        <ReferencePagination page={safePage} pageSize={ADMIN_CATALOG_PAGE_SIZE} total={visibleCourses.length} onPageChange={nextPage => updateLocation({ page: nextPage })} />
        </>
      ) : (
        <div className="admin-content-catalog-feedback">
          <Library aria-hidden="true" />
          <h3>{hasFilters ? "Không tìm thấy khóa học phù hợp" : "Chưa có khóa học nào"}</h3>
          <p>{hasFilters ? "Thử từ khóa hoặc trạng thái khác để tìm khóa học." : "Tạo khóa học đầu tiên để bắt đầu quản lý nội dung."}</p>
          {hasFilters ? <button type="button" className="outline-btn" onClick={resetFilters}>Đặt lại bộ lọc</button> : <button type="button" className="outline-btn" onClick={onCreate}>Tạo khóa học</button>}
        </div>
      )}
    </section>
  );
}

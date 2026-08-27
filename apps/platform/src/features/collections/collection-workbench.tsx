import type {
  PlatformRecord,
  PlatformRecordStatus,
  PlatformResource,
} from "@aeck/contracts";
import { useQuery } from "@tanstack/react-query";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Columns3,
  LayoutGrid,
  Pencil,
  Plus,
  RefreshCw,
  Search,
  Trash2,
  X,
  type LucideIcon,
} from "lucide-react";
import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { Link } from "react-router-dom";

import { platformCollectionQuery } from "../../api/platform-api.ts";
import { LoadingPanel } from "../../components/ui/loading-panel.tsx";
import { QueryError } from "../../components/ui/query-error.tsx";
import { categoriesForRecords, filterCollectionRecords } from "./collection-utils.ts";
import { upsertCollectionRecord } from "./collection-state.ts";
import "../../styles/collection-workbench.css";

export type WorkbenchAction = {
  label: string;
  path: string;
  kind?: "primary" | "secondary";
  external?: boolean;
};

type CollectionWorkbenchProps = {
  resource: PlatformResource;
  title: string;
  description: string;
  icon: LucideIcon;
  createLabel?: string;
  defaultView?: "table" | "cards";
  actions?: WorkbenchAction[];
  allowCreate?: boolean;
  allowEdit?: boolean;
  allowDelete?: boolean;
  onOpenRecord?: (record: PlatformRecord) => string | null;
};

const statusLabels: Record<PlatformRecordStatus, string> = {
  active: "Đang hoạt động",
  inactive: "Tạm dừng",
  draft: "Bản nháp",
  published: "Đã xuất bản",
  scheduled: "Đã lên lịch",
  pending: "Chờ xử lý",
  processing: "Đang xử lý",
  completed: "Hoàn tất",
  failed: "Có lỗi",
  archived: "Đã lưu trữ",
  locked: "Đã khóa",
};

function formatUpdatedAt(value: string | null) {
  if (!value) return "Chưa cập nhật";
  return new Intl.DateTimeFormat("vi-VN", {
    dateStyle: "short",
    timeStyle: "short",
    timeZone: "Asia/Ho_Chi_Minh",
  }).format(new Date(value));
}

function newRecord(resource: PlatformResource): PlatformRecord {
  return {
    id: `${resource}-${crypto.randomUUID()}`,
    title: "",
    description: "",
    status: "draft",
    category: "",
    updatedAt: new Date().toISOString(),
    owner: "",
    tags: [],
    metrics: [],
    metadata: {},
  };
}

function RecordEditor({
  record,
  open,
  onClose,
  onSave,
}: {
  record: PlatformRecord;
  open: boolean;
  onClose: () => void;
  onSave: (record: PlatformRecord) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [draft, setDraft] = useState(record);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  const submit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    onSave({ ...draft, updatedAt: new Date().toISOString() });
  };

  return (
    <dialog
      ref={dialogRef}
      className="aeck-record-dialog"
      aria-labelledby="aeck-record-dialog-title"
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClose={onClose}
    >
      <form method="dialog" onSubmit={submit}>
        <header>
          <div>
            <span>Thông tin bản ghi</span>
            <h2 id="aeck-record-dialog-title">{record?.title ? "Cập nhật bản ghi" : "Tạo bản ghi mới"}</h2>
          </div>
          <button type="button" aria-label="Đóng cửa sổ" onClick={onClose}><X aria-hidden="true" /></button>
        </header>
        <div className="aeck-record-form-grid">
          <label className="aeck-field aeck-field-wide">
            <span>Tên hiển thị</span>
            <input value={draft.title} onChange={(event) => setDraft({ ...draft, title: event.target.value })} required autoFocus />
          </label>
          <label className="aeck-field">
            <span>Danh mục</span>
            <input value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value })} placeholder="Ví dụ: TSA" />
          </label>
          <label className="aeck-field">
            <span>Trạng thái</span>
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as PlatformRecordStatus })}>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label className="aeck-field aeck-field-wide">
            <span>Người phụ trách / liên hệ</span>
            <input value={draft.owner} onChange={(event) => setDraft({ ...draft, owner: event.target.value })} />
          </label>
          <label className="aeck-field aeck-field-wide">
            <span>Mô tả</span>
            <textarea rows={4} value={draft.description} onChange={(event) => setDraft({ ...draft, description: event.target.value })} />
          </label>
          <label className="aeck-field aeck-field-wide">
            <span>Nhãn (phân cách bằng dấu phẩy)</span>
            <input value={draft.tags.join(", ")} onChange={(event) => setDraft({ ...draft, tags: event.target.value.split(",").map((tag) => tag.trim()).filter(Boolean) })} />
          </label>
        </div>
        <footer>
          <button type="button" className="aeck-button-secondary" onClick={onClose}>Hủy</button>
          <button type="submit" className="aeck-button-primary"><Check aria-hidden="true" />Lưu thay đổi</button>
        </footer>
      </form>
    </dialog>
  );
}

function RecordMetrics({ record }: { record: PlatformRecord }) {
  if (!record.metrics.length) return <span className="aeck-cell-muted">Không có chỉ số</span>;
  return (
    <div className="aeck-record-metrics">
      {record.metrics.slice(0, 3).map((metric) => (
        <span key={metric.label}><small>{metric.label}</small><strong>{metric.value}</strong></span>
      ))}
    </div>
  );
}

function WorkbenchActionLink({ action }: { action: WorkbenchAction }) {
  const className = action.kind === "primary" ? "aeck-button-primary" : "aeck-button-secondary";
  if (action.external) {
    return <a className={className} href={action.path}>{action.label}<ArrowUpRight aria-hidden="true" /></a>;
  }
  return <Link className={className} to={action.path}>{action.label}<ChevronRight aria-hidden="true" /></Link>;
}

export function CollectionWorkbench({
  resource,
  title,
  description,
  icon: Icon,
  createLabel = "Tạo mới",
  defaultView = "table",
  actions = [],
  allowCreate = true,
  allowEdit = true,
  allowDelete = true,
  onOpenRecord,
}: CollectionWorkbenchProps) {
  const query = useQuery(platformCollectionQuery(resource));
  const [recordsOverride, setRecordsOverride] = useState<PlatformRecord[] | null>(null);
  const [searchQuery, setSearchQuery] = useState("");
  const [status, setStatus] = useState<PlatformRecordStatus | "all">("all");
  const [category, setCategory] = useState("all");
  const [view, setView] = useState(defaultView);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [editingRecord, setEditingRecord] = useState<PlatformRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [announcement, setAnnouncement] = useState("");

  const records = recordsOverride ?? query.data?.records ?? [];
  const categories = useMemo(() => categoriesForRecords(records), [records]);
  const filtered = useMemo(
    () => filterCollectionRecords(records, { query: searchQuery, status, category }),
    [category, records, searchQuery, status],
  );
  const selectedCount = selected.size;
  const allVisibleSelected = filtered.length > 0 && filtered.every((record) => selected.has(String(record.id)));

  if (query.isPending) return <LoadingPanel label={`Đang tải ${title.toLocaleLowerCase("vi")}…`} />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;

  const openCreate = () => {
    setEditingRecord(newRecord(resource));
    setEditorOpen(true);
  };
  const openEdit = (record: PlatformRecord) => {
    setEditingRecord(record);
    setEditorOpen(true);
  };
  const saveRecord = (record: PlatformRecord) => {
    const existed = records.some((item) => String(item.id) === String(record.id));
    setRecordsOverride((current) =>
      upsertCollectionRecord(current ?? query.data?.records ?? [], record),
    );
    setEditorOpen(false);
    setAnnouncement(existed ? `Đã cập nhật ${record.title}.` : `Đã tạo ${record.title}.`);
  };
  const deleteRecords = (ids: Set<string>) => {
    if (!ids.size) return;
    if (!window.confirm(`Xóa ${ids.size} bản ghi đã chọn khỏi bản xem trước?`)) return;
    setRecordsOverride((current) =>
      (current ?? query.data?.records ?? []).filter(
        (record) => !ids.has(String(record.id)),
      ),
    );
    setSelected(new Set());
    setAnnouncement(`Đã xóa ${ids.size} bản ghi khỏi bản xem trước.`);
  };
  const toggleSelection = (id: string) => {
    setSelected((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  return (
    <div className="aeck-collection-page">
      <header className="aeck-collection-heading">
        <div className="aeck-collection-title">
          <span aria-hidden="true"><Icon /></span>
          <div><h1>{title}</h1><p>{description}</p></div>
        </div>
        <div className="aeck-heading-actions">
          {actions.map((action) => <WorkbenchActionLink key={`${action.path}-${action.label}`} action={action} />)}
          {allowCreate ? <button type="button" className="aeck-button-primary" onClick={openCreate}><Plus aria-hidden="true" />{createLabel}</button> : null}
        </div>
      </header>

      {query.data.summary.length ? (
        <section className="aeck-summary-strip" aria-label="Tóm tắt">
          {query.data.summary.map((metric) => (
            <article key={metric.label} data-tone={metric.tone ?? "neutral"}>
              <span>{metric.label}</span><strong>{metric.value}</strong>
            </article>
          ))}
        </section>
      ) : null}

      <section className="aeck-workbench" aria-labelledby="aeck-record-list-title">
        <div className="aeck-workbench-toolbar">
          <h2 id="aeck-record-list-title">Danh sách <span>{filtered.length}</span></h2>
          <div className="aeck-workbench-controls">
            <label className="aeck-workbench-search">
              <Search aria-hidden="true" />
              <span className="aeck-sr-only">Tìm trong danh sách</span>
              <input type="search" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} placeholder="Tìm theo tên, mã hoặc người phụ trách…" />
            </label>
            <label>
              <span className="aeck-sr-only">Lọc theo trạng thái</span>
              <select value={status} onChange={(event) => setStatus(event.target.value as PlatformRecordStatus | "all")}>
                <option value="all">Mọi trạng thái</option>
                {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </select>
            </label>
            <label>
              <span className="aeck-sr-only">Lọc theo danh mục</span>
              <select value={category} onChange={(event) => setCategory(event.target.value)}>
                <option value="all">Mọi danh mục</option>
                {categories.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <div className="aeck-view-toggle" aria-label="Kiểu hiển thị">
              <button type="button" aria-label="Hiển thị dạng bảng" aria-pressed={view === "table"} onClick={() => setView("table")}><Columns3 aria-hidden="true" /></button>
              <button type="button" aria-label="Hiển thị dạng thẻ" aria-pressed={view === "cards"} onClick={() => setView("cards")}><LayoutGrid aria-hidden="true" /></button>
            </div>
            <button type="button" className="aeck-icon-button" aria-label="Làm mới dữ liệu" onClick={() => void query.refetch()}><RefreshCw aria-hidden="true" /></button>
          </div>
        </div>

        {selectedCount ? (
          <div className="aeck-selection-bar" role="status">
            <strong>Đã chọn {selectedCount} bản ghi</strong>
            <button type="button" onClick={() => setSelected(new Set())}>Bỏ chọn</button>
            {allowDelete ? <button type="button" className="is-danger" onClick={() => deleteRecords(selected)}><Trash2 aria-hidden="true" />Xóa đã chọn</button> : null}
          </div>
        ) : null}

        {!filtered.length ? (
          <div className="aeck-workbench-empty">
            <Search aria-hidden="true" /><h3>Không có kết quả phù hợp</h3><p>Thử đổi từ khóa hoặc bỏ bớt điều kiện lọc.</p>
            <button type="button" onClick={() => { setSearchQuery(""); setStatus("all"); setCategory("all"); }}>Xóa bộ lọc</button>
          </div>
        ) : view === "table" ? (
          <div className="aeck-table-scroll" tabIndex={0} aria-label="Bảng dữ liệu; có thể cuộn ngang trên màn hình hẹp">
            <table className="aeck-data-table">
              <thead><tr>
                <th className="aeck-check-column"><input type="checkbox" aria-label="Chọn tất cả bản ghi đang hiển thị" checked={allVisibleSelected} onChange={() => setSelected(allVisibleSelected ? new Set() : new Set(filtered.map((record) => String(record.id))))} /></th>
                <th>Thông tin</th><th>Trạng thái</th><th>Chỉ số</th><th>Cập nhật</th><th className="aeck-actions-column">Thao tác</th>
              </tr></thead>
              <tbody>{filtered.map((record) => {
                const detailPath = onOpenRecord?.(record) ?? null;
                return (
                  <tr key={record.id} data-selected={selected.has(String(record.id)) || undefined}>
                    <td><input type="checkbox" aria-label={`Chọn ${record.title}`} checked={selected.has(String(record.id))} onChange={() => toggleSelection(String(record.id))} /></td>
                    <td><div className="aeck-record-identity"><strong title={record.title}>{record.title}</strong><span>{record.category || "Chưa phân loại"}{record.owner ? ` · ${record.owner}` : ""}</span><p>{record.description || "Chưa có mô tả."}</p></div></td>
                    <td><span className="aeck-status" data-status={record.status}>{statusLabels[record.status]}</span></td>
                    <td><RecordMetrics record={record} /></td>
                    <td><time dateTime={record.updatedAt ?? undefined}>{formatUpdatedAt(record.updatedAt)}</time></td>
                    <td><div className="aeck-row-actions">
                      {detailPath ? <Link to={detailPath} aria-label={`Mở ${record.title}`}><ChevronRight aria-hidden="true" /></Link> : null}
                      {allowEdit ? <button type="button" aria-label={`Sửa ${record.title}`} onClick={() => openEdit(record)}><Pencil aria-hidden="true" /></button> : null}
                      {allowDelete ? <button type="button" className="is-danger" aria-label={`Xóa ${record.title}`} onClick={() => deleteRecords(new Set([String(record.id)]))}><Trash2 aria-hidden="true" /></button> : null}
                    </div></td>
                  </tr>
                );
              })}</tbody>
            </table>
          </div>
        ) : (
          <div className="aeck-record-grid">
            {filtered.map((record) => {
              const detailPath = onOpenRecord?.(record) ?? null;
              return (
                <article key={record.id} className="aeck-record-card">
                  <header><span className="aeck-status" data-status={record.status}>{statusLabels[record.status]}</span><input type="checkbox" aria-label={`Chọn ${record.title}`} checked={selected.has(String(record.id))} onChange={() => toggleSelection(String(record.id))} /></header>
                  <div><span className="aeck-record-category">{record.category || "Chưa phân loại"}</span><h3>{record.title}</h3><p>{record.description || "Chưa có mô tả."}</p></div>
                  <RecordMetrics record={record} />
                  <footer><time dateTime={record.updatedAt ?? undefined}>{formatUpdatedAt(record.updatedAt)}</time><div className="aeck-row-actions">{detailPath ? <Link to={detailPath} aria-label={`Mở ${record.title}`}><ChevronRight aria-hidden="true" /></Link> : null}{allowEdit ? <button type="button" aria-label={`Sửa ${record.title}`} onClick={() => openEdit(record)}><Pencil aria-hidden="true" /></button> : null}{allowDelete ? <button type="button" className="is-danger" aria-label={`Xóa ${record.title}`} onClick={() => deleteRecords(new Set([String(record.id)]))}><Trash2 aria-hidden="true" /></button> : null}</div></footer>
                </article>
              );
            })}
          </div>
        )}
      </section>

      <p className="aeck-sr-only" role="status" aria-live="polite">{announcement}</p>
      {editorOpen && editingRecord ? (
        <RecordEditor
          key={`${editingRecord.id}-${editingRecord.updatedAt ?? "new"}`}
          record={editingRecord}
          open
          onClose={() => setEditorOpen(false)}
          onSave={saveRecord}
        />
      ) : null}
    </div>
  );
}

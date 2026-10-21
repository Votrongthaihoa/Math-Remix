"use client";

// Adapted from D:\fbbbbbbbbbbbbb\admin-dashboard\src\components\DataTable.tsx.
// Keep the source's column renderer and pagination contract, with scoped styles,
// native table semantics and the current application's loading/empty states.
import type { ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";

export interface ReferenceColumn<T> {
  key: string;
  title: string;
  render: (row: T) => ReactNode;
  className?: string;
  align?: "left" | "right";
}

export function ReferencePagination({ page, pageSize, total, onPageChange, label = "Phân trang khóa học" }: {
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
  label?: string;
}) {
  if (!total) return null;
  const pages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(page, 1), pages);
  const start = (safePage - 1) * pageSize + 1;
  const end = Math.min(total, safePage * pageSize);
  return <nav className="admin-source-table-pagination" aria-label={label}>
    <span role="status">Hiển thị <strong>{start}–{end}</strong> trong <strong>{total.toLocaleString("vi-VN")}</strong> kết quả</span>
    <div className="admin-source-pagination-controls">
      <button type="button" aria-label="Trang trước" disabled={safePage <= 1} onClick={() => onPageChange(safePage - 1)}><ChevronLeft size={16} aria-hidden="true" /></button>
      <span>Trang <strong>{safePage}</strong> / {pages}</span>
      <button type="button" aria-label="Trang sau" disabled={safePage >= pages} onClick={() => onPageChange(safePage + 1)}><ChevronRight size={16} aria-hidden="true" /></button>
    </div>
  </nav>;
}

export function AdminReferenceDataTable<T>({ columns, rows, rowKey, caption, page, pageSize, total, onPageChange, paginationLabel }: {
  columns: ReferenceColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  caption: string;
  paginationLabel?: string;
  page: number;
  pageSize: number;
  total: number;
  onPageChange: (page: number) => void;
}) {
  return <div className="admin-source-data-table-card">
    <table className="admin-source-data-table" role="table" aria-label={caption}>
      <thead role="rowgroup"><tr role="row">{columns.map(column => <th scope="col" role="columnheader" key={column.key} className={column.className}>{column.title}</th>)}</tr></thead>
      <tbody role="rowgroup">{rows.map(row => <tr role="row" key={rowKey(row)}>{columns.map(column => <td role="cell" key={column.key} className={`${column.align === "right" ? "admin-source-cell-right" : ""} ${column.className ?? ""}`}>
        <span className="admin-source-mobile-label" aria-hidden="true">{column.title}</span>
        <div className="admin-source-cell-value">{column.render(row)}</div>
      </td>)}</tr>)}</tbody>
    </table>
    <ReferencePagination page={page} pageSize={pageSize} total={total} onPageChange={onPageChange} label={paginationLabel} />
  </div>;
}

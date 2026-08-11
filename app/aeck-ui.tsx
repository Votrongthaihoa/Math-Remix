"use client";

import {
  useEffect,
  useId,
  useRef,
  type ButtonHTMLAttributes,
  type HTMLAttributes,
  type InputHTMLAttributes,
  type ReactNode,
} from "react";
import { AlertCircle, ChevronRight, LoaderCircle, Search, X } from "lucide-react";
import "./aeck-ui.css";

type ButtonVariant = "primary" | "secondary" | "quiet" | "danger";
type ButtonSize = "sm" | "md";
type StatusTone = "neutral" | "info" | "success" | "warning" | "danger";

function classes(...values: Array<string | false | null | undefined>) {
  return values.filter(Boolean).join(" ");
}

export function AeckPageHeader({ kicker, title, description, actions, className }: { kicker?: string; title: string; description?: string; actions?: ReactNode; className?: string }) {
  return <header className={classes("aeck-page-header", className)}>
    <div className="aeck-page-header-copy">{kicker && <span className="aeck-kicker">{kicker}</span>}<h1>{title}</h1>{description && <p>{description}</p>}</div>
    {actions && <div className="aeck-page-header-actions">{actions}</div>}
  </header>;
}

export function AeckSectionHeader({ title, description, actions, id }: { title: string; description?: string; actions?: ReactNode; id?: string }) {
  return <header className="aeck-section-header"><div><h2 id={id}>{title}</h2>{description && <p>{description}</p>}</div>{actions && <div className="aeck-section-actions">{actions}</div>}</header>;
}

export function AeckButton({ variant = "secondary", size = "md", className, type = "button", children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { variant?: ButtonVariant; size?: ButtonSize }) {
  return <button type={type} className={classes("aeck-button", `aeck-button-${variant}`, `aeck-button-${size}`, className)} {...props}>{children}</button>;
}

export function AeckIconButton({ label, className, children, ...props }: ButtonHTMLAttributes<HTMLButtonElement> & { label: string }) {
  return <button type="button" className={classes("aeck-icon-button", className)} aria-label={label} {...props}>{children}</button>;
}

export function AeckNavItem({ href, active = false, icon, children, className, onClick }: { href: string; active?: boolean; icon?: ReactNode; children: ReactNode; className?: string; onClick?: React.MouseEventHandler<HTMLAnchorElement> }) {
  return <a href={href} className={classes("aeck-nav-item", active && "active", className)} aria-current={active ? "page" : undefined} onClick={onClick}>{icon}<span>{children}</span></a>;
}

export function AeckSearchField({ label = "Tìm kiếm", className, ...props }: InputHTMLAttributes<HTMLInputElement> & { label?: string }) {
  const id = useId();
  return <label className={classes("aeck-search-field", className)} htmlFor={props.id ?? id}><Search aria-hidden="true" /><span className="sr-only">{label}</span><input {...props} id={props.id ?? id} type="search" /></label>;
}

export function AeckFilterToolbar({ children, resultText, className }: { children: ReactNode; resultText?: string; className?: string }) {
  return <div className={classes("aeck-filter-toolbar", className)}>{children}{resultText && <span className="aeck-result-count" role="status" aria-live="polite">{resultText}</span>}</div>;
}

export function AeckCard({ className, interactive = false, ...props }: HTMLAttributes<HTMLElement> & { interactive?: boolean }) {
  return <article className={classes("aeck-card", interactive && "aeck-card-interactive", className)} {...props} />;
}

export function AeckStatCard({ label, value, detail, icon, tone = "neutral" }: { label: string; value: ReactNode; detail?: string; icon?: ReactNode; tone?: StatusTone }) {
  return <article className="aeck-stat-card"><span className={classes("aeck-stat-icon", `aeck-tone-${tone}`)}>{icon}</span><div><small>{label}</small><strong>{value}</strong>{detail && <p>{detail}</p>}</div></article>;
}

export function AeckBadge({ children, tone = "neutral", className }: { children: ReactNode; tone?: StatusTone; className?: string }) {
  return <span className={classes("aeck-badge", `aeck-tone-${tone}`, className)}><i aria-hidden="true" />{children}</span>;
}

export const AeckStatus = AeckBadge;

export function AeckField({ label, htmlFor, help, error, required, children, className }: { label: string; htmlFor: string; help?: string; error?: string; required?: boolean; children: ReactNode; className?: string }) {
  const helpId = `${htmlFor}-help`;
  const errorId = `${htmlFor}-error`;
  return <div className={classes("aeck-field", className)}><label htmlFor={htmlFor}>{label}{required && <span aria-hidden="true"> *</span>}</label>{children}{help && <small id={helpId}>{help}</small>}{error && <p id={errorId} role="alert">{error}</p>}</div>;
}

export function AeckDialog({ open, onClose, title, description, children, footer, busy = false }: { open: boolean; onClose: () => void; title: string; description?: string; children: ReactNode; footer?: ReactNode; busy?: boolean }) {
  const ref = useRef<HTMLDialogElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
      window.requestAnimationFrame(() => (dialog.querySelector<HTMLElement>("[data-dialog-autofocus], button, input, select, textarea, a[href]") ?? dialog).focus());
    } else if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="aeck-dialog" aria-labelledby={titleId} aria-describedby={description ? descriptionId : undefined} aria-busy={busy} onCancel={event => { event.preventDefault(); if (!busy) onClose(); }} onMouseDown={event => { if (event.target === event.currentTarget && !busy) onClose(); }}>
    <div className="aeck-dialog-surface"><header><div><h2 id={titleId}>{title}</h2>{description && <p id={descriptionId}>{description}</p>}</div><AeckIconButton label="Đóng hộp thoại" onClick={onClose} disabled={busy}><X aria-hidden="true" /></AeckIconButton></header><div className="aeck-dialog-body">{children}</div>{footer && <footer>{footer}</footer>}</div>
  </dialog>;
}

export function AeckDrawer({ open, onClose, title, children }: { open: boolean; onClose: () => void; title: string; children: ReactNode }) {
  return <AeckDialog open={open} onClose={onClose} title={title}><div className="aeck-drawer-content">{children}</div></AeckDialog>;
}

export function AeckMenu({ label, children }: { label: ReactNode; children: ReactNode }) {
  return <details className="aeck-menu"><summary>{label}</summary><div className="aeck-menu-panel">{children}</div></details>;
}

export function AeckDataList({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={classes("aeck-data-list", className)} role="list">{children}</div>;
}

export function AeckTable({ label, children }: { label: string; children: ReactNode }) {
  return <div className="aeck-table-wrap" tabIndex={0} role="region" aria-label={label}><table>{children}</table></div>;
}

export function AeckPagination({ page, hasNextPage, onPrevious, onNext }: { page: number; hasNextPage: boolean; onPrevious: () => void; onNext: () => void }) {
  return <nav className="aeck-pagination" aria-label="Phân trang"><AeckButton size="sm" onClick={onPrevious} disabled={page <= 1}>Trang trước</AeckButton><span>Trang <b>{page}</b></span><AeckButton size="sm" onClick={onNext} disabled={!hasNextPage}>Trang sau</AeckButton></nav>;
}

export function AeckEmptyState({ title, description, action, icon }: { title: string; description: string; action?: ReactNode; icon?: ReactNode }) {
  return <div className="aeck-state aeck-empty-state">{icon && <span>{icon}</span>}<h3>{title}</h3><p>{description}</p>{action}</div>;
}

export function AeckLoadingState({ label = "Đang tải…" }: { label?: string }) {
  return <div className="aeck-state" role="status" aria-live="polite"><LoaderCircle className="aeck-spinner" aria-hidden="true" /><p>{label}</p></div>;
}

export function AeckErrorState({ title = "Không thể tải dữ liệu", description, onRetry }: { title?: string; description: string; onRetry?: () => void }) {
  return <div className="aeck-state aeck-error-state" role="alert"><AlertCircle aria-hidden="true" /><h3>{title}</h3><p>{description}</p>{onRetry && <AeckButton onClick={onRetry}>Thử lại <ChevronRight aria-hidden="true" /></AeckButton>}</div>;
}

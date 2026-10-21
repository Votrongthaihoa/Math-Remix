"use client";

import { useEffect, useId, useRef, type ReactNode } from "react";
import { X } from "lucide-react";
import "./admin-reference-dialog.css";

/** Source Dialog interaction adapted to native modal focus/inert behavior.
 * Only used by non-exam roster, public media and audit surfaces. */
export default function AdminReferenceDialog({ title, onClose, children }: { title: string; onClose: () => void; children: ReactNode }) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    const dialog = ref.current;
    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialog?.showModal();
    return () => { dialog?.close(); if (trigger?.isConnected) trigger.focus(); };
  }, []);
  return <dialog ref={ref} className="admin-reference-dialog" aria-labelledby={titleId} onCancel={event => { event.preventDefault(); onClose(); }}>
    <header><h2 id={titleId}>{title}</h2><button className="admin-reference-dialog-close" type="button" onClick={onClose} aria-label={`Đóng ${title.toLocaleLowerCase("vi")}`}><X aria-hidden="true" size={20} /></button></header>
    <div className="admin-reference-dialog-body">{children}</div>
  </dialog>;
}

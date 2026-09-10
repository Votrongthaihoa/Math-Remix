"use client";

import { useEffect, useId, useRef, type SyntheticEvent } from "react";
import "./aeck-confirm-dialog.css";

export type AeckConfirmAction = { label: string; onClick: () => void; disabled?: boolean };

export type AeckConfirmDialogProps = {
  title: string;
  description: string;
  errorMessage?: string;
  primaryAction: AeckConfirmAction;
  secondaryAction?: AeckConfirmAction;
  open?: boolean;
  onClose?: () => void;
};

export default function AeckConfirmDialog({ title, description, errorMessage, primaryAction, secondaryAction, open = true, onClose }: AeckConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();
  const errorId = useId();

  useEffect(() => { onCloseRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    let focusFrame: number | null = null;
    if (open && !dialog.open) {
      previousFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      dialog.showModal();
      focusFrame = window.requestAnimationFrame(() => primaryButtonRef.current?.focus());
    } else if (!open && dialog.open) {
      dialog.close();
      previousFocusRef.current?.focus();
      previousFocusRef.current = null;
    }
    return () => {
      if (focusFrame !== null) window.cancelAnimationFrame(focusFrame);
      if (dialog.open) dialog.close();
      const previousFocus = previousFocusRef.current;
      previousFocusRef.current = null;
      previousFocus?.focus();
    };
  }, [open]);

  function handleCancel(event: SyntheticEvent<HTMLDialogElement>) {
    event.preventDefault();
    onCloseRef.current?.();
  }

  return <dialog ref={dialogRef} className="aeck-confirm-dialog" aria-modal="true" aria-labelledby={titleId} aria-describedby={errorMessage ? `${descriptionId} ${errorId}` : descriptionId} onCancel={handleCancel}>
    <div className="aeck-confirm-dialog__text">
      <h2 id={titleId} className="aeck-confirm-dialog__title">{title}</h2>
      <p id={descriptionId} className="aeck-confirm-dialog__description">{description}</p>
      {errorMessage ? <p id={errorId} className="aeck-confirm-dialog__error" role="alert">{errorMessage}</p> : null}
    </div>
    <div className="aeck-confirm-dialog__actions">
      {secondaryAction ? <button type="button" className="aeck-confirm-dialog__action aeck-confirm-dialog__action--secondary" disabled={secondaryAction.disabled} onClick={secondaryAction.onClick}>{secondaryAction.label}</button> : null}
      <button ref={primaryButtonRef} type="button" className="aeck-confirm-dialog__action aeck-confirm-dialog__action--primary" disabled={primaryAction.disabled} onClick={primaryAction.onClick}>{primaryAction.label}</button>
    </div>
  </dialog>;
}

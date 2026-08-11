"use client";

import { useEffect, useId, useRef } from "react";
import type { SyntheticEvent } from "react";
import "./macos-alert.css";

export type MacAlertAction = {
  label: string;
  onClick: () => void;
  disabled?: boolean;
};

export type MacAlertProps = {
  title: string;
  description: string;
  primaryAction: MacAlertAction;
  secondaryAction?: MacAlertAction;
  open?: boolean;
  onClose?: () => void;
};

/**
 * A small product-shell alert based on the local macOS reference.
 * The parent owns the open state and action side effects.
 */
export default function MacAlert({
  title,
  description,
  primaryAction,
  secondaryAction,
  open = true,
  onClose,
}: MacAlertProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const primaryButtonRef = useRef<HTMLButtonElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const onCloseRef = useRef(onClose);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;

    let focusFrame: number | null = null;

    if (open && !dialog.open) {
      const activeElement = document.activeElement;
      previousFocusRef.current = activeElement instanceof HTMLElement ? activeElement : null;
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

  return (
    <dialog
      ref={dialogRef}
      className="mac-alert"
      aria-modal="true"
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={handleCancel}
    >
      <div className="mac-alert__text">
        <h2 id={titleId} className="mac-alert__title">
          {title}
        </h2>
        <p id={descriptionId} className="mac-alert__description">
          {description}
        </p>
      </div>

      <div className="mac-alert__actions">
        {secondaryAction ? (
          <button
            type="button"
            className="mac-alert__action mac-alert__action--secondary"
            disabled={secondaryAction.disabled}
            onClick={secondaryAction.onClick}
          >
            {secondaryAction.label}
          </button>
        ) : null}
        <button
          ref={primaryButtonRef}
          type="button"
          className="mac-alert__action mac-alert__action--primary"
          disabled={primaryAction.disabled}
          onClick={primaryAction.onClick}
        >
          {primaryAction.label}
        </button>
      </div>
    </dialog>
  );
}

"use client";

import { useEffect, useRef, type RefObject } from "react";

const FOCUSABLE = [
  "a[href]",
  "button:not([disabled])",
  "input:not([disabled]):not([type=\"hidden\"])",
  "select:not([disabled])",
  "textarea:not([disabled])",
  "[tabindex]:not([tabindex=\"-1\"])",
].join(",");

function focusableIn(container: HTMLElement) {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE))
    .filter(element => element.getAttribute("aria-hidden") !== "true");
}

/**
 * Keeps keyboard focus inside an admin dialog and returns it to the trigger.
 * The hook is intentionally small so existing authoring forms keep their
 * submit and close behavior unchanged.
 */
export function useAdminDialogFocus<T extends HTMLElement = HTMLElement>(open: boolean, onClose: () => void): RefObject<T | null> {
  const dialogRef = useRef<T | null>(null);
  const closeRef = useRef(onClose);
  useEffect(() => {
    closeRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    if (!open) return;

    const trigger = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const dialog = dialogRef.current
      ?? document.querySelector<HTMLElement>(".modal-shade .modal, .security-detail-panel");
    if (!dialog) return;

    const addedRole = !dialog.hasAttribute("role");
    const addedModal = !dialog.hasAttribute("aria-modal");
    const addedTabIndex = !dialog.hasAttribute("tabindex");
    let addedLabel = false;
    let addedLabelledBy = false;

    if (addedRole) dialog.setAttribute("role", "dialog");
    if (addedModal) dialog.setAttribute("aria-modal", "true");
    if (addedTabIndex) dialog.setAttribute("tabindex", "-1");
    if (!dialog.hasAttribute("aria-label") && !dialog.hasAttribute("aria-labelledby")) {
      const heading = dialog.querySelector<HTMLElement>("h1, h2, h3");
      if (heading) {
        if (!heading.id) heading.id = "admin-dialog-heading-" + Math.random().toString(36).slice(2, 8);
        dialog.setAttribute("aria-labelledby", heading.id);
        addedLabelledBy = true;
      } else {
        dialog.setAttribute("aria-label", "Hộp thoại");
        addedLabel = true;
      }
    }

    const frame = window.requestAnimationFrame(() => {
      const first = dialog.querySelector<HTMLElement>("[data-dialog-autofocus]") ?? focusableIn(dialog)[0];
      (first ?? dialog).focus();
    });

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;

      const focusable = focusableIn(dialog);
      if (!focusable.length) {
        event.preventDefault();
        dialog.focus();
        return;
      }

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };

    document.addEventListener("keydown", handleKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      document.removeEventListener("keydown", handleKeyDown);
      if (addedRole && dialog.getAttribute("role") === "dialog") dialog.removeAttribute("role");
      if (addedModal && dialog.getAttribute("aria-modal") === "true") dialog.removeAttribute("aria-modal");
      if (addedTabIndex && dialog.getAttribute("tabindex") === "-1") dialog.removeAttribute("tabindex");
      if (addedLabel) dialog.removeAttribute("aria-label");
      if (addedLabelledBy) dialog.removeAttribute("aria-labelledby");
      if (trigger?.isConnected) trigger.focus();
    };
  }, [open]);

  return dialogRef;
}

"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import "./event-overlay.css";

type EventTrigger = { src?: string; title?: string } | string | null;
const allowedEventPath = /^\/(?:event_[a-z0-9_-]+|events\/[a-z0-9_/-]+)(?:\/|$)/i;

function safeEventSource(value: EventTrigger) {
  const raw = typeof value === "string" ? value : value?.src;
  if (!raw) return "/event_30_4/index.html";
  try {
    const url = new URL(raw, window.location.origin);
    if (url.origin !== window.location.origin) return "/event_30_4/index.html";
    if (!allowedEventPath.test(url.pathname)) return "/event_30_4/index.html";
    return `${url.pathname}${url.search}${url.hash}`;
  } catch { return "/event_30_4/index.html"; }
}

export default function EventOverlay() {
  const [event, setEvent] = useState<{ src: string; title: string } | null>(null);
  const frameRef = useRef<HTMLIFrameElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const restoreFocusRef = useRef<HTMLElement | null>(null);
  const close = useCallback(() => {
    setEvent(null);
    window.requestAnimationFrame(() => restoreFocusRef.current?.focus({ preventScroll: true }));
  }, []);
  useEffect(() => {
    const trigger = (value: Event) => {
      const detail = (value as CustomEvent<EventTrigger>).detail;
      restoreFocusRef.current = document.activeElement instanceof HTMLElement ? document.activeElement : null;
      setEvent({ src: safeEventSource(detail), title: typeof detail === "object" && detail?.title ? detail.title : "Sự kiện AECK" });
    };
    const finish = (value: MessageEvent) => {
      if (value.origin !== window.location.origin || value.source !== frameRef.current?.contentWindow) return;
      const data = value.data;
      if (data === "EVENT_FINISHED" || (data && typeof data === "object" && data.type === "EVENT_FINISHED")) close();
    };
    window.addEventListener("triggerEvent", trigger);
    window.addEventListener("message", finish);
    return () => { window.removeEventListener("triggerEvent", trigger); window.removeEventListener("message", finish); };
  }, [close]);
  useEffect(() => {
    if (!event) return;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const frame = window.requestAnimationFrame(() => closeButtonRef.current?.focus({ preventScroll: true }));
    const onKeyDown = (keyboardEvent: KeyboardEvent) => {
      if (keyboardEvent.key !== "Escape") return;
      keyboardEvent.preventDefault();
      close();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener("keydown", onKeyDown);
      document.body.style.overflow = previousOverflow;
    };
  }, [close, event]);
  if (!event) return null;
  return <div className="aeck-event-overlay" role="dialog" aria-modal="true" aria-labelledby="aeck-event-overlay-title">
    <h2 className="sr-only" id="aeck-event-overlay-title">{event.title}</h2>
    <iframe ref={frameRef} src={event.src} title={event.title} allow="autoplay; fullscreen" />
    <button ref={closeButtonRef} type="button" className="aeck-event-overlay-close" onClick={close} aria-label="Bỏ qua sự kiện"><X aria-hidden="true" /><span>Bỏ qua</span></button>
  </div>;
}

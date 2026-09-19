"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import { useAuthStore } from "../lib/auth-store";
import EventOverlay from "./event-overlay";

type SystemEvent = { type?: string; sessionId?: string; src?: string; title?: string };

function realtimeUrl() {
  const configured = process.env.NEXT_PUBLIC_REALTIME_URL?.trim();
  // No legacy AECK host is assumed. Realtime is opt-in and must point at the
  // deployment's own Socket.IO-compatible endpoint.
  if (!configured) return "";
  try {
    const url = new URL(configured);
    if (!["ws:", "wss:"].includes(url.protocol)) return "";
    if (url.hostname === "aeck.vn" || url.hostname.endsWith(".aeck.vn")) return "";
    return url.toString();
  } catch {
    return "";
  }
}

export default function RealtimeSystemEvents() {
  const pathname = usePathname();
  const token = useAuthStore(state => state.token);
  const logout = useAuthStore(state => state.logout);
  useEffect(() => {
    const endpoint = realtimeUrl();
    if (!endpoint || !token || typeof WebSocket === "undefined") return;
    let socket: WebSocket | null = null;
    let timer: number | undefined;
    try {
      const url = new URL(endpoint);
      url.searchParams.set("transport", "websocket");
      socket = new WebSocket(url);
    } catch {
      return;
    }
    const handle = (event: MessageEvent) => {
      let payload: SystemEvent;
      try {
        if (typeof event.data === "string" && event.data.startsWith("42")) {
          const packet = JSON.parse(event.data.slice(2)) as unknown;
          payload = Array.isArray(packet) ? packet[1] as SystemEvent : packet as SystemEvent;
        } else payload = typeof event.data === "string" ? JSON.parse(event.data) as SystemEvent : event.data as SystemEvent;
      } catch { return; }
      if (!payload?.type) return;
      window.dispatchEvent(new CustomEvent("triggerEvent", { detail: payload }));
      if (payload.type === "account_locked") timer = window.setTimeout(() => { void logout(); }, 3_000);
      if (payload.type === "session_revoked" && payload.sessionId && payload.sessionId === window.sessionStorage.getItem("remix.security.learning-session.v1")) timer = window.setTimeout(() => { void logout(); }, 4_000);
    };
    socket.addEventListener("open", () => { try { socket?.send(`40${JSON.stringify({ auth: { token } })}`); } catch { /* socket closed during handshake */ } });
    socket.addEventListener("message", handle);
    return () => { if (timer) window.clearTimeout(timer); socket?.removeEventListener("message", handle); socket?.close(); };
  }, [logout, pathname, token]);
  return <EventOverlay />;
}

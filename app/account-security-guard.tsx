"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, LockKeyhole } from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import {
  getOrCreateSecurityDeviceId,
  isSecurityUuid,
  persistSecuritySessionId,
  readSecuritySessionId,
  securityDeviceInfo,
  type SecuritySessionReply,
} from "../lib/security-session-client";

type ActivityType = "lesson" | "video" | "pdf" | "quiz" | "exam";

function remainingLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const rest = seconds % 60;
  return `${days ? `${days} ngày ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export default function AccountSecurityGuard({ activityType, resourceId }: { activityType: ActivityType; resourceId: string }) {
  const [state, setState] = useState<"checking" | "allowed" | "blocked">("checking");
  const [reply, setReply] = useState<SecuritySessionReply>({});
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const sessionId = useRef<string | null>(null);
  const deviceId = useRef<string>("");
  const info = useMemo(() => securityDeviceInfo(), []);

  const callSecurity = useCallback(async (action: "start" | "heartbeat" | "stop" | "status") => {
    const response = await authenticatedFetch("/api/security/session", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ action, sessionId: sessionId.current, deviceId: deviceId.current, activityType, resourceId, ...info }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as SecuritySessionReply;
    if (!response.ok && !payload.code) throw new Error(payload.message || payload.reason || "Không thể kiểm tra phiên học.");
    return payload;
  }, [activityType, info, resourceId]);

  const start = useCallback(async () => {
    setError("");
    try {
      const payload = await callSecurity("start");
      setReply(payload);
      if (payload.allowed && (isSecurityUuid(payload.sessionId) || payload.exempt)) {
        sessionId.current = persistSecuritySessionId(payload.sessionId);
        setState("allowed");
      } else setState("blocked");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể kiểm tra phiên học.");
      setState("blocked");
    }
  }, [callSecurity]);

  useEffect(() => {
    deviceId.current = getOrCreateSecurityDeviceId();
    sessionId.current = readSecuritySessionId();
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize the server-backed guard on mount
    void start();
    return () => {
      if (sessionId.current) {
        // Access token cannot be attached to sendBeacon, so the session is only
        // dropped locally; the stale row expires server-side after five minutes.
        persistSecuritySessionId(null);
      }
    };
  }, [start]);

  useEffect(() => {
    if (state !== "allowed") return;
    const heartbeat = async () => {
      if (document.visibilityState !== "visible") return;
      const payload = await callSecurity("heartbeat").catch(() => null);
      if (!payload) return;
      setReply(payload);
      if (!payload.allowed) setState("blocked");
    };
    const timer = window.setInterval(() => void heartbeat(), 60_000);
    const onVisible = () => { if (document.visibilityState === "visible") void heartbeat(); };
    document.addEventListener("visibilitychange", onVisible);
    return () => { window.clearInterval(timer); document.removeEventListener("visibilitychange", onVisible); };
  }, [callSecurity, state]);

  useEffect(() => {
    if (!reply.bannedUntil || !reply.serverTime) return;
    const offset = new Date(reply.serverTime).getTime() - Date.now();
    const update = () => setRemaining(Math.max(0, new Date(reply.bannedUntil!).getTime() - (Date.now() + offset)));
    update();
    const timer = window.setInterval(update, 1000);
    return () => window.clearInterval(timer);
  }, [reply.bannedUntil, reply.serverTime]);

  if (state === "allowed") return reply.warning?.message ? <div className="security-inline-warning"><AlertTriangle />{reply.warning.message}</div> : null;
  return <div className="security-gate" role="dialog" aria-modal="true">
    <section className="security-gate-card">
      <div className="security-gate-icon blocked"><LockKeyhole /></div>
      {state === "checking" ? <><h2>Đang kiểm tra phiên học</h2><p>Hệ thống đang xác minh tài khoản và thiết bị.</p></> : <>
        <span className="security-kicker">BẢO MẬT TÀI KHOẢN</span><h2>{reply.code?.includes("BANNED") ? "Tài khoản đang bị khóa" : "Không thể mở nội dung"}</h2><p>{reply.reason || reply.message || error}</p>
        {reply.bannedUntil && <div className="security-ban-time"><small>Thời gian còn lại</small><b>{remainingLabel(remaining)}</b><span>Có thể truy cập lại lúc {new Date(reply.bannedUntil).toLocaleString("vi-VN")}</span></div>}
        {reply.violationNumber ? <p>Mức vi phạm: <b>Lần {reply.violationNumber}</b></p> : null}
        {reply.eventCode && <code>{reply.eventCode}</code>}
        {!reply.code?.includes("PERMANENT") && (!reply.bannedUntil || remaining === 0) && <button className="security-primary" onClick={() => void start()}>Kiểm tra lại</button>}
      </>}
      {error && <p className="security-error">{error}</p>}
    </section>
  </div>;
}

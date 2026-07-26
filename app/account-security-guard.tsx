"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AlertTriangle, LockKeyhole, Mail, ShieldCheck } from "lucide-react";
import { supabase } from "../lib/supabase";

type ActivityType = "lesson" | "video" | "pdf" | "quiz" | "exam";
type SecurityReply = {
  allowed?: boolean;
  code?: string;
  message?: string;
  reason?: string;
  sessionId?: string;
  requiresOtp?: boolean;
  email?: string;
  bannedUntil?: string | null;
  serverTime?: string;
  violationNumber?: number;
  eventCode?: string | null;
  warning?: { message?: string } | null;
};

const DEVICE_KEY = "remix.security.device-id.v1";
const SESSION_KEY = "remix.security.learning-session.v1";

function deviceInfo() {
  const ua = navigator.userAgent;
  const browser = /Edg\//.test(ua) ? "Microsoft Edge" : /Chrome\//.test(ua) ? "Google Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Trình duyệt khác";
  const operatingSystem = /Windows/.test(ua) ? "Windows" : /Android/.test(ua) ? "Android" : /iPhone|iPad/.test(ua) ? "iOS/iPadOS" : /Mac OS/.test(ua) ? "macOS" : /Linux/.test(ua) ? "Linux" : "Hệ điều hành khác";
  return { browser, operatingSystem, deviceName: `${browser} trên ${operatingSystem}` };
}

function getDeviceId() {
  let value = localStorage.getItem(DEVICE_KEY);
  if (!value || !/^[0-9a-f-]{36}$/i.test(value)) {
    value = crypto.randomUUID();
    localStorage.setItem(DEVICE_KEY, value);
  }
  return value;
}

function remainingLabel(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor(seconds % 86400 / 3600);
  const minutes = Math.floor(seconds % 3600 / 60);
  const rest = seconds % 60;
  return `${days ? `${days} ngày ` : ""}${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}:${String(rest).padStart(2, "0")}`;
}

export default function AccountSecurityGuard({ activityType, resourceId }: { activityType: ActivityType; resourceId: string }) {
  const [state, setState] = useState<"checking" | "allowed" | "otp" | "blocked">("checking");
  const [reply, setReply] = useState<SecurityReply>({});
  const [otp, setOtp] = useState("");
  const [otpSent, setOtpSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [remaining, setRemaining] = useState(0);
  const sessionId = useRef<string | null>(null);
  const deviceId = useRef<string>("");
  const info = useMemo(() => typeof navigator === "undefined" ? { browser: "", operatingSystem: "", deviceName: "" } : deviceInfo(), []);

  const callSecurity = useCallback(async (action: "start" | "heartbeat" | "stop" | "verify-device" | "status") => {
    if (!supabase) throw new Error("Chưa cấu hình Supabase.");
    const { data } = await supabase.auth.getSession();
    if (!data.session) throw new Error("Phiên đăng nhập đã hết hạn.");
    const response = await fetch("/api/security/session", {
      method: "POST",
      headers: { authorization: `Bearer ${data.session.access_token}`, "content-type": "application/json" },
      body: JSON.stringify({ action, sessionId: sessionId.current, deviceId: deviceId.current, activityType, resourceId, ...info }),
      cache: "no-store",
    });
    const payload = await response.json().catch(() => ({})) as SecurityReply;
    if (!response.ok && !payload.code) throw new Error(payload.message || payload.reason || "Không thể kiểm tra phiên học.");
    return payload;
  }, [activityType, info, resourceId]);

  const start = useCallback(async () => {
    setError("");
    try {
      const payload = await callSecurity("start");
      setReply(payload);
      if (payload.allowed && payload.sessionId) {
        sessionId.current = payload.sessionId;
        sessionStorage.setItem(SESSION_KEY, payload.sessionId);
        setState("allowed");
      } else if (payload.requiresOtp) setState("otp");
      else setState("blocked");
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể kiểm tra phiên học.");
      setState("blocked");
    }
  }, [callSecurity]);

  useEffect(() => {
    deviceId.current = getDeviceId();
    sessionId.current = sessionStorage.getItem(SESSION_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect -- initialize the server-backed guard on mount
    void start();
    return () => {
      if (sessionId.current && navigator.sendBeacon) {
        // Access token cannot be attached to sendBeacon; the stale session expires server-side after five minutes.
        sessionStorage.removeItem(SESSION_KEY);
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
      if (!payload.allowed) setState(payload.requiresOtp ? "otp" : "blocked");
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

  async function sendOtp() {
    if (!supabase) return;
    setBusy(true); setError("");
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email || reply.email;
    const { error: sendError } = email ? await supabase.auth.signInWithOtp({ email, options: { shouldCreateUser: false } }) : { error: new Error("Không tìm thấy email tài khoản.") };
    setBusy(false);
    if (sendError) { setError(sendError.message.includes("rate limit") ? "Bạn đã yêu cầu mã quá nhiều lần. Vui lòng chờ rồi thử lại." : sendError.message); return; }
    setOtpSent(true);
  }

  async function verifyOtp() {
    if (!supabase) return;
    setBusy(true); setError("");
    const { data } = await supabase.auth.getUser();
    const email = data.user?.email || reply.email;
    if (!email) { setError("Không tìm thấy email tài khoản."); setBusy(false); return; }
    const { error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp.trim(), type: "email" });
    if (verifyError) { setError("Mã xác minh không đúng hoặc đã hết hạn."); setBusy(false); return; }
    const verified = await callSecurity("verify-device").catch(value => ({ allowed: false, message: value instanceof Error ? value.message : "Không thể xác minh thiết bị." }));
    setBusy(false);
    if (!verified.allowed) { setError(verified.message || "Không thể xác minh thiết bị."); return; }
    setOtp(""); setOtpSent(false);
    await start();
  }

  if (state === "allowed") return reply.warning?.message ? <div className="security-inline-warning"><AlertTriangle />{reply.warning.message}</div> : null;
  return <div className="security-gate" role="dialog" aria-modal="true">
    <section className="security-gate-card">
      <div className={`security-gate-icon ${state === "otp" ? "verify" : "blocked"}`}>{state === "otp" ? <ShieldCheck /> : <LockKeyhole />}</div>
      {state === "checking" ? <><h2>Đang kiểm tra phiên học</h2><p>Hệ thống đang xác minh tài khoản và thiết bị.</p></> : state === "otp" ? <>
        <span className="security-kicker">XÁC MINH THIẾT BỊ</span><h2>Kiểm tra email của bạn</h2><p>{reply.message || "Thiết bị mới cần được xác minh trước khi truy cập nội dung học."}</p>
        {!otpSent ? <button className="security-primary" disabled={busy} onClick={() => void sendOtp()}><Mail />{busy ? "Đang gửi…" : "Gửi mã xác minh"}</button> : <><label>Mã gồm 6 chữ số<input inputMode="numeric" autoComplete="one-time-code" maxLength={8} value={otp} onChange={event => setOtp(event.target.value.replace(/\D/g, ""))} /></label><button className="security-primary" disabled={busy || otp.length < 6} onClick={() => void verifyOtp()}>{busy ? "Đang xác minh…" : "Xác minh và tiếp tục"}</button><button className="security-link" disabled={busy} onClick={() => void sendOtp()}>Gửi lại mã</button></>}
      </> : <>
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

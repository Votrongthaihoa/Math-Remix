"use client";

import Link from "next/link";
import { MailCheck, X } from "lucide-react";
import { usePathname } from "next/navigation";
import { useState } from "react";
import { useAuthStore } from "../lib/auth-store";
import "./email-verification-banner.css";

const hiddenPrefixes = ["/assessment", "/exam/confirm-info", "/exam/test", "/exam-room/", "/exam/"];

export default function EmailVerificationBanner() {
  const pathname = usePathname();
  const user = useAuthStore(state => state.user);
  const [dismissed, setDismissed] = useState(false);
  const hidden = hiddenPrefixes.some(prefix => pathname === prefix || pathname.startsWith(prefix));
  if (hidden || dismissed || !user || user.emailVerified === true) return null;
  return <aside className="aeck-email-verification-banner" role="status" aria-label="Xác thực email">
    <MailCheck aria-hidden="true" />
    <p><strong>Hãy xác thực email của bạn</strong><span>Chúng tôi sẽ dùng email đã xác thực để bảo vệ tài khoản và kết quả học tập.</span></p>
    <Link href="/profile?verifyEmail=1">Xác thực ngay</Link>
    <button type="button" onClick={() => setDismissed(true)} aria-label="Đóng nhắc xác thực email"><X aria-hidden="true" /></button>
  </aside>;
}

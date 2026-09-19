"use client";

import { useEffect, useRef, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuthStore } from "../lib/auth-store";
import { AeckLoadingState } from "./aeck-ui";
import EmailVerificationBanner from "./email-verification-banner";
import RealtimeSystemEvents from "./realtime-system-events";

export default function PrivateRoute({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const initialized = useRef(false);
  const isLoading = useAuthStore(state => state.isLoading);
  const isAuthenticated = useAuthStore(state => state.isAuthenticated);
  const initialize = useAuthStore(state => state.initialize);
  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    void initialize();
  }, [initialize]);
  useEffect(() => {
    if (isLoading || isAuthenticated) return;
    const returnTo = `${pathname}${window.location.search}${window.location.hash}`;
    // Keep authentication same-origin. The app owns the login route and must
    // not silently redirect users to a legacy AECK host that is not part of
    // this deployment.
    router.replace(`/login?redirect=${encodeURIComponent(returnTo)}`);
  }, [isAuthenticated, isLoading, pathname, router]);
  if (isLoading || !isAuthenticated) return <div className="aeck-private-route-loading"><AeckLoadingState label="Đang kiểm tra phiên đăng nhập…" /></div>;
  return <><EmailVerificationBanner /><RealtimeSystemEvents />{children}</>;
}

"use client";

import Script from "next/script";
import { useCallback, useEffect, useId, useRef } from "react";
import "./turnstile-login.css";

type TurnstileWidgetId = string;

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      size: "flexible" | "compact";
      callback: (token: string) => void;
      "expired-callback": () => void;
      "error-callback": () => void;
    },
  ) => TurnstileWidgetId;
  reset: (widgetId: TurnstileWidgetId) => void;
  remove?: (widgetId: TurnstileWidgetId) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

const siteKey = process.env.NEXT_PUBLIC_TURNSTILE_SITE_KEY ?? "";

export default function TurnstileChallenge({
  action,
  onTokenChange,
  resetSignal,
}: {
  action: "login" | "password_reset";
  onTokenChange: (token: string) => void;
  resetSignal: number;
}) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const widgetIdRef = useRef<TurnstileWidgetId | null>(null);
  const helpId = useId();

  const renderWidget = useCallback(() => {
    if (!siteKey || !containerRef.current || widgetIdRef.current || !window.turnstile) return;
    widgetIdRef.current = window.turnstile.render(containerRef.current, {
      sitekey: siteKey,
      action,
      size: window.matchMedia("(max-width: 480px)").matches ? "compact" : "flexible",
      callback: onTokenChange,
      "expired-callback": () => onTokenChange(""),
      "error-callback": () => onTokenChange(""),
    });
  }, [action, onTokenChange]);

  useEffect(() => {
    renderWidget();
    return () => {
      if (widgetIdRef.current && window.turnstile?.remove) {
        window.turnstile.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [renderWidget]);

  useEffect(() => {
    if (!widgetIdRef.current || !window.turnstile) return;
    window.turnstile.reset(widgetIdRef.current);
    onTokenChange("");
  }, [onTokenChange, resetSignal]);

  if (!siteKey) {
    return <p className="login-turnstile-config-error" role="alert">Xác minh chống spam chưa được cấu hình.</p>;
  }

  return (
    <div className="login-turnstile" role="group" aria-label="Xác minh chống spam" aria-describedby={helpId}>
      <Script
        src="https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit"
        strategy="afterInteractive"
        onReady={renderWidget}
      />
      <div ref={containerRef} className="login-turnstile-widget" />
      <p id={helpId} className="login-turnstile-help">Hoàn tất bước xác minh trước khi đăng nhập.</p>
    </div>
  );
}

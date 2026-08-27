import {
  forwardRef,
  useEffect,
  useImperativeHandle,
  useRef,
} from "react";

type TurnstileApi = {
  render: (
    container: HTMLElement,
    options: {
      sitekey: string;
      action: string;
      theme: "light";
      size: "flexible";
      callback: (token: string) => void;
      "error-callback": () => void;
      "expired-callback": () => void;
      "timeout-callback": () => void;
    },
  ) => string;
  remove: (widgetId: string) => void;
  reset: (widgetId: string) => void;
};

declare global {
  interface Window {
    turnstile?: TurnstileApi;
  }
}

let scriptPromise: Promise<TurnstileApi> | null = null;

function loadTurnstile() {
  if (window.turnstile) return Promise.resolve(window.turnstile);
  if (scriptPromise) return scriptPromise;

  scriptPromise = new Promise<TurnstileApi>((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(
      'script[data-aeck-turnstile="true"]',
    );
    const script = existing ?? document.createElement("script");
    const onLoad = () => {
      if (window.turnstile) resolve(window.turnstile);
      else reject(new Error("Turnstile không khởi tạo được."));
    };
    const onError = () => reject(new Error("Không thể tải Turnstile."));

    script.addEventListener("load", onLoad, { once: true });
    script.addEventListener("error", onError, { once: true });
    if (!existing) {
      script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
      script.async = true;
      script.defer = true;
      script.dataset.aeckTurnstile = "true";
      document.head.appendChild(script);
    }
  }).catch((error) => {
    scriptPromise = null;
    throw error;
  });

  return scriptPromise;
}

export type TurnstileWidgetHandle = {
  reset: () => void;
  focus: () => void;
};

type TurnstileWidgetProps = {
  siteKey: string;
  onTokenChange: (token: string) => void;
  onUnavailable: (message: string) => void;
};

export const TurnstileWidget = forwardRef<
  TurnstileWidgetHandle,
  TurnstileWidgetProps
>(function TurnstileWidget({ siteKey, onTokenChange, onUnavailable }, ref) {
  const containerRef = useRef<HTMLDivElement>(null);
  const widgetIdRef = useRef<string | null>(null);

  useImperativeHandle(ref, () => ({
    reset: () => {
      if (widgetIdRef.current && window.turnstile) {
        window.turnstile.reset(widgetIdRef.current);
      }
      onTokenChange("");
    },
    focus: () => containerRef.current?.focus(),
  }), [onTokenChange]);

  useEffect(() => {
    let active = true;
    let mountedApi: TurnstileApi | null = null;
    loadTurnstile()
      .then((api) => {
        if (!active || !containerRef.current) return;
        mountedApi = api;
        widgetIdRef.current = api.render(containerRef.current, {
          sitekey: siteKey,
          action: "signup",
          theme: "light",
          size: "flexible",
          callback: onTokenChange,
          "error-callback": () => {
            onTokenChange("");
            onUnavailable("Không thể xác minh chống spam. Vui lòng thử lại.");
          },
          "expired-callback": () => onTokenChange(""),
          "timeout-callback": () => onTokenChange(""),
        });
      })
      .catch((reason) => {
        if (active) {
          onUnavailable(
            reason instanceof Error
              ? reason.message
              : "Không thể tải xác minh chống spam.",
          );
        }
      });

    return () => {
      active = false;
      if (mountedApi && widgetIdRef.current) {
        mountedApi.remove(widgetIdRef.current);
      }
      widgetIdRef.current = null;
    };
  }, [onTokenChange, onUnavailable, siteKey]);

  return (
    <div
      ref={containerRef}
      className="aeck-turnstile-widget"
      aria-label="Xác minh chống spam"
      tabIndex={-1}
    />
  );
});

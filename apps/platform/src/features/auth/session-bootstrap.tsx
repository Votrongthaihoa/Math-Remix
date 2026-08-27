import { useEffect, useState, type ReactNode } from "react";

import { getPreviewSession } from "../../api/auth-api.ts";
import { shouldAutoStartPreviewSession } from "../../api/preview-session.ts";
import { authStore } from "../../store/auth-store.ts";

export function SessionBootstrap({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(() => authStore.persist.hasHydrated());

  useEffect(() => {
    const finish = () => {
      if (
        !authStore.getState().isAuthenticated &&
        shouldAutoStartPreviewSession(import.meta.env.VITE_PREVIEW_AUTO_SESSION)
      ) {
        const preview = getPreviewSession();
        if (preview) authStore.getState().login(preview.token, preview.user);
      }
      setReady(true);
    };

    if (authStore.persist.hasHydrated()) {
      finish();
      return;
    }
    return authStore.persist.onFinishHydration(finish);
  }, []);

  if (!ready) {
    return (
      <main className="aeck-app-loading" aria-busy="true" aria-live="polite">
        <img src="/aeck-mark.svg" alt="" width="48" height="52" />
        <p>Đang mở không gian học tập…</p>
      </main>
    );
  }

  return children;
}

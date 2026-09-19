"use client";

import { useEffect } from "react";
import { AeckErrorState } from "./aeck-ui";

export default function ErrorBoundary({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  useEffect(() => { console.error(error); }, [error]);
  return <main className="aeck-error-boundary"><AeckErrorState title="Đã có lỗi xảy ra" description={error.message || "Không thể tải trang này."} onRetry={reset} /></main>;
}

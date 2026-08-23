import { Suspense } from "react";
import PlatformApp from "./platform";
import LoadingIndicator from "./loading-indicator";

export default function Home() {
  return (
    <Suspense fallback={<LoadingIndicator label="Đang tải trang…" fullPage />}>
      <PlatformApp />
    </Suspense>
  );
}

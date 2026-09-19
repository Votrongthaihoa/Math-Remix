import { Suspense } from "react";
import LoadingIndicator from "../../../loading-indicator";
import PlatformApp from "../../../platform";

export default function AdminQuestionBankDedupPage() {
  return (
    <Suspense fallback={<LoadingIndicator label="Đang tải trang…" fullPage />}>
      <PlatformApp initialAdminRoute />
    </Suspense>
  );
}

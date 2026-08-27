import { ArrowUpRight, LoaderCircle } from "lucide-react";
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

import { legacyUrl } from "./legacy-url.ts";

export function LegacyRouteBridge({ path }: { path?: string }) {
  const location = useLocation();
  const target = legacyUrl(path ?? `${location.pathname}${location.search}${location.hash}`);

  useEffect(() => {
    window.location.replace(target);
  }, [target]);

  return (
    <main className="aeck-legacy-bridge" aria-busy="true" aria-live="polite">
      <LoaderCircle aria-hidden="true" />
      <div><h1>Đang mở giao diện chuyên biệt</h1><p>Phần làm bài, kết quả và trình soạn đề cũ được giữ nguyên hoàn toàn.</p></div>
      <a href={target}>Mở ngay <ArrowUpRight aria-hidden="true" /></a>
    </main>
  );
}

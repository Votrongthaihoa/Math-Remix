"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { authenticatedFetch } from "../../lib/auth-client";

type SectionRouteTarget = "test" | "confirm" | "result";

type SectionRouteBridgeProps = {
  sectionId: string;
  target: SectionRouteTarget;
};

type BridgeState =
  | { status: "loading" }
  | { status: "error"; message: string };

const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}";

function isExpectedCanonicalPath(path: unknown, sectionId: string, target: SectionRouteTarget): path is string {
  if (typeof path !== "string") return false;
  if (target === "result") return new RegExp(`^/exam/result/${UUID_PATTERN}$`, "i").test(path);
  const suffix = target === "confirm" ? "/confirm" : "";
  const match = path.match(new RegExp(`^/exam/${UUID_PATTERN}/section/(${UUID_PATTERN})${suffix}$`, "i"));
  return match?.[1]?.toLocaleLowerCase("en-US") === sectionId.toLocaleLowerCase("en-US");
}

export default function SectionExamRouteBridge({ sectionId, target }: SectionRouteBridgeProps) {
  const router = useRouter();
  const errorHeading = useRef<HTMLHeadingElement>(null);
  const [state, setState] = useState<BridgeState>({ status: "loading" });

  useEffect(() => {
    const controller = new AbortController();
    async function resolveRoute() {
      try {
        const query = new URLSearchParams({ sectionId, target });
        const response = await authenticatedFetch(`/api/exams/section-route?${query}`, {
          cache: "no-store",
          signal: controller.signal,
        });
        const payload = await response.json().catch(() => null) as { path?: unknown; error?: unknown } | null;
        if (controller.signal.aborted) return;
        const canonicalPath = payload?.path;
        if (!response.ok || !isExpectedCanonicalPath(canonicalPath, sectionId, target)) {
          const message = typeof payload?.error === "string" && payload.error.trim()
            ? payload.error
            : "Không thể mở trang bài thi này.";
          setState({ status: "error", message });
          return;
        }
        router.replace(canonicalPath);
      } catch {
        if (controller.signal.aborted) return;
        setState({
          status: "error",
          message: "Không thể kết nối để mở trang bài thi này. Vui lòng thử lại.",
        });
      }
    }
    void resolveRoute();
    return () => controller.abort();
  }, [router, sectionId, target]);

  useEffect(() => {
    if (state.status === "error") errorHeading.current?.focus();
  }, [state.status]);

  const resultTarget = target === "result";
  if (state.status === "loading") {
    return (
      <main aria-busy="true" aria-labelledby="section-route-title">
        <h1 id="section-route-title">{resultTarget ? "Đang mở kết quả" : "Đang mở bài thi"}</h1>
        <p role="status">Vui lòng chờ trong giây lát.</p>
      </main>
    );
  }

  return (
    <main aria-labelledby="section-route-error-title">
      <h1 id="section-route-error-title" ref={errorHeading} tabIndex={-1}>Không thể mở trang bài thi</h1>
      <p role="alert">{state.message}</p>
      <Link href="/exam">Quay lại phòng thi</Link>
    </main>
  );
}

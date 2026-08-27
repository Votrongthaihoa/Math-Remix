import { Suspense } from "react";
import PlatformApp from "../platform";
import LoadingIndicator from "../loading-indicator";
import { notFound } from "next/navigation";

const staticRoutes = new Set(["dashboard", "exam-room", "courses", "exam-history", "search", "tkb", "profile", "admin", "forgot-password", "reset-password"]);
const uuidSegment = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const guestTokenSegment = /^[A-Za-z0-9_-]{10,100}$/;

export default async function CatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const validStaticRoute = slug.length === 1 && staticRoutes.has(slug[0]);
  const validDetailRoute = slug.length === 2 && (slug[0] === "courses" || slug[0] === "lessons") && Boolean(slug[1]);
  const validDirectGuestExamRoute = slug.length === 2 && slug[0] === "exam" && guestTokenSegment.test(slug[1]) && !uuidSegment.test(slug[1]);
  const validExamRoute = slug.length === 2 && slug[0] === "exam-room" && Boolean(slug[1])
    || slug.length === 2 && slug[0] === "exam" && uuidSegment.test(slug[1])
    || slug.length === 3 && slug[0] === "exam" && slug[1] === "result" && Boolean(slug[2])
    || slug.length >= 4 && slug[0] === "exam" && Boolean(slug[1]) && slug[2] === "section" && Boolean(slug[3]) && (slug.length === 4 || slug.length === 5 && slug[4] === "confirm");
  const validLegacyGuestExamRoute = slug.length === 3 && slug[0] === "guest" && slug[1] === "exam" && guestTokenSegment.test(slug[2]);
  const validGuestExamRoute = validDirectGuestExamRoute || validLegacyGuestExamRoute;
  const adminTabs = new Set(["students", "content", "hls-vault", "exams", "question-bank", "sessions", "upload", "enrollments", "security"]);
  const validAdminRoute = slug[0] === "admin" && (
    slug.length === 1
    || slug.length === 2 && adminTabs.has(slug[1])
    || slug.length === 3 && slug[1] === "sessions" && slug[2] === "new"
    || slug.length === 4 && slug[1] === "sessions" && Boolean(slug[2]) && slug[3] === "results"
    || slug.length === 4 && slug[1] === "content" && slug[2] === "courses" && Boolean(slug[3])
  );
  const validAdminExamRoute = slug[0] === "admin" && slug[1] === "exams" && (
    slug.length === 2
    || slug.length === 3 && slug[2] !== "rooms"
    || slug.length === 4 && slug[2] !== "rooms" && slug[3] === "preview"
     || slug.length === 4 && slug[2] !== "rooms" && (slug[3] === "access" || slug[3] === "policy")
    || slug.length === 4 && slug[2] === "rooms" && Boolean(slug[3])
    || slug.length === 5 && slug[2] === "rooms" && Boolean(slug[3]) && slug[4] === "edit"
    || slug.length === 6 && slug[2] === "rooms" && Boolean(slug[3]) && slug[4] === "exams" && slug[5] === "new"
    || slug.length === 5 && slug[2] !== "rooms" && slug[3] === "questions" && Boolean(slug[4])
    || slug.length === 6 && slug[2] !== "rooms" && slug[3] === "sections" && Boolean(slug[4]) && (slug[5] === "editor" || slug[5] === "preview")
  );
  if (!validStaticRoute && !validDetailRoute && !validExamRoute && !validGuestExamRoute && !validAdminRoute && !validAdminExamRoute) notFound();
  const standaloneAdminPreview = slug[0] === "admin" && slug[1] === "exams" && (
    slug.length === 4 && slug[3] === "preview"
    || slug.length === 6 && slug[2] !== "rooms" && slug[3] === "sections" && Boolean(slug[4]) && slug[5] === "preview"
  );
  const guestToken = validDirectGuestExamRoute ? slug[1] : validLegacyGuestExamRoute ? slug[2] : undefined;
  return (
    <Suspense fallback={<LoadingIndicator label="Đang tải trang…" fullPage />}>
      <PlatformApp initialAdminRoute={slug[0] === "admin"} initialStandaloneAdminPreview={standaloneAdminPreview} initialGuestToken={guestToken} />
    </Suspense>
  );
}

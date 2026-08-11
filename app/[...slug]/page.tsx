import PlatformApp from "../platform";
import { notFound } from "next/navigation";

const staticRoutes = new Set(["dashboard", "exam-room", "courses", "exam-history", "profile", "admin", "forgot-password", "reset-password"]);

export default async function CatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const validStaticRoute = slug.length === 1 && staticRoutes.has(slug[0]);
  const validDetailRoute = slug.length === 2 && (slug[0] === "courses" || slug[0] === "lessons") && Boolean(slug[1]);
  const validExamRoute = slug.length === 2 && (slug[0] === "exam-room" || slug[0] === "exam") && Boolean(slug[1])
    || slug.length === 3 && slug[0] === "exam" && slug[1] === "result" && Boolean(slug[2])
    || slug.length >= 4 && slug[0] === "exam" && Boolean(slug[1]) && slug[2] === "section" && Boolean(slug[3]) && (slug.length === 4 || slug.length === 5 && slug[4] === "confirm");
  const validGuestExamRoute = slug.length === 3 && slug[0] === "guest" && slug[1] === "exam" && Boolean(slug[2]);
  const adminTabs = new Set(["students", "content", "exams", "question-bank", "sessions", "upload", "enrollments", "security"]);
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
  return <PlatformApp initialAdminRoute={slug[0] === "admin"} initialStandaloneAdminPreview={standaloneAdminPreview} initialGuestToken={validGuestExamRoute ? slug[2] : undefined} />;
}

import { Suspense } from "react";
import type { Metadata } from "next";
import PlatformApp from "../platform";
import LoadingIndicator from "../loading-indicator";
import { notFound, redirect } from "next/navigation";
import { adminPrototypeRedirectPath, legacyAdminRedirectPath } from "../admin-route-map";
import AeckPublicSite from "../aeck-public-site";
import { AECK_PUBLIC_ROUTES, type AeckPublicRoute } from "../aeck-public-routes";
import articleDocuments from "../aeck-public-articles.json";
import legalDocuments from "../aeck-public-legal.json";
import supplementalLegalDocuments from "../aeck-public-legal-secondary";
import { targetRouteRedirect } from "../target-route-aliases";

const staticRoutes = new Set(["login", "dashboard", "exam-room", "courses", "exam-history", "progress", "search", "tkb", "profile", "admin", "forgot-password", "reset-password"]);
const publicRoutes = new Set<string>(AECK_PUBLIC_ROUTES);
const uuidSegment = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const guestTokenSegment = /^[A-Za-z0-9_-]{10,100}$/;
const legacyAdminPrefixes = [
  "question-bank", "item/create", "exam-management", "assessment-management", "exam-room-management",
  "admin-session-wizard",
  "user-management", "group-user-management", "course-management", "media-management", "exam-result-management",
  "irt-exam-management", "evidence-registration-management", "subscription-package-management", "shipment-management",
  "tkb-management", "ilearn-management", "admin-log", "watermark-trace", "server-health",
  "admin/all",
];

const publicMetadata: Record<string, { title: string; description: string }> = {
  "giao-vien": { title: "Đội ngũ giáo viên | AECK", description: "Đội ngũ giáo viên và cố vấn đồng hành cùng học viên AECK." },
  "goi-hoc-tap": { title: "Gói học tập | AECK", description: "Các gói học tập mở khóa khóa học và phòng luyện thi AECK." },
  "dang-ky-minh-chung": { title: "Đăng ký minh chứng | AECK", description: "Đăng ký tham gia và gửi minh chứng cho các chương trình AECK." },
  ...Object.fromEntries(Object.entries(articleDocuments).map(([slug, document]) => [slug, { title: `${document.title} | AECK`, description: document.intro }])),
  ...Object.fromEntries(Object.entries(legalDocuments).map(([slug, document]) => [slug, { title: `${document.title} | AECK`, description: document.title }])),
  ...Object.fromEntries(Object.entries(supplementalLegalDocuments).map(([slug, document]) => [slug, { title: `${document.title} | AECK`, description: document.intro }])),
};

export async function generateMetadata({ params }: { params: Promise<{ slug: string[] }> }): Promise<Metadata> {
  const { slug } = await params;
  const item = slug.length === 1 ? publicMetadata[slug[0]] : undefined;
  return item ?? {};
}

export default async function CatchAllPage({ params, searchParams }: { params: Promise<{ slug: string[] }>; searchParams: Promise<Record<string, string | string[] | undefined>> }) {
  const [{ slug }, queryValues] = await Promise.all([params, searchParams]);
  const query = new URLSearchParams();
  const requestedTab = queryValues.tab;
  if (typeof requestedTab === "string") query.set("tab", requestedTab);
  const adminPrototypeAlias = adminPrototypeRedirectPath(slug, queryValues);
  if (adminPrototypeAlias) redirect(adminPrototypeAlias);
  const targetAlias = targetRouteRedirect(slug, queryValues);
  if (targetAlias === "/profile" && query.get("tab") === "courses") redirect("/profile?tab=courses");
  if (targetAlias) redirect(targetAlias);
  const publicRoute = slug.length === 1 && publicRoutes.has(slug[0]) ? slug[0] as AeckPublicRoute : null;
  if (publicRoute) return <AeckPublicSite route={publicRoute} />;
  const validStaticRoute = slug.length === 1 && staticRoutes.has(slug[0]);
  const validDetailRoute = slug.length === 2 && (slug[0] === "courses" || slug[0] === "lessons") && Boolean(slug[1]);
  const validDirectGuestExamRoute = slug.length === 2 && slug[0] === "exam" && guestTokenSegment.test(slug[1]) && !uuidSegment.test(slug[1]);
  const validExamRoute = slug.length === 2 && slug[0] === "exam-room" && Boolean(slug[1])
    || slug.length === 2 && slug[0] === "exam" && uuidSegment.test(slug[1])
    || slug.length === 3 && slug[0] === "exam" && slug[1] === "result" && Boolean(slug[2])
    || slug.length >= 4 && slug[0] === "exam" && Boolean(slug[1]) && slug[2] === "section" && Boolean(slug[3]) && (slug.length === 4 || slug.length === 5 && slug[4] === "confirm");
  const validLegacyGuestExamRoute = slug.length === 3 && slug[0] === "guest" && slug[1] === "exam" && guestTokenSegment.test(slug[2]);
  const validGuestExamRoute = validDirectGuestExamRoute || validLegacyGuestExamRoute;
  const validLegacyExamResultRoute = slug.length === 2 && slug[0] === "exam-result" && Boolean(slug[1]);
  const adminTabs = new Set(["students", "content", "hls-vault", "exams", "question-bank", "sessions", "timetable", "upload", "enrollments", "security", "audit", "capabilities", "server-health"]);
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
  const legacyAdminPath = slug.join("/");
  const validRootLegacyAdminRoute = legacyAdminPrefixes.some(prefix => legacyAdminPath === prefix || legacyAdminPath.startsWith(`${prefix}/`));
  if (!validStaticRoute && !validDetailRoute && !validExamRoute && !validGuestExamRoute && !validLegacyExamResultRoute && !validAdminRoute && !validAdminExamRoute && !validRootLegacyAdminRoute) notFound();
  if (validLegacyExamResultRoute) redirect(`/exam/result/${encodeURIComponent(slug[1])}`);
  if (validRootLegacyAdminRoute) {
    const destination = legacyAdminRedirectPath(`/${legacyAdminPath}`);
    if (destination) redirect(destination);
  }
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

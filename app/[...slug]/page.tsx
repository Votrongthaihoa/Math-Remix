import PlatformApp from "../platform";
import { notFound } from "next/navigation";

const staticRoutes = new Set(["dashboard", "exam-room", "courses", "exam-history", "profile", "admin", "forgot-password", "reset-password"]);

export default async function CatchAllPage({ params }: { params: Promise<{ slug: string[] }> }) {
  const { slug } = await params;
  const validStaticRoute = slug.length === 1 && staticRoutes.has(slug[0]);
  const validDetailRoute = slug.length === 2 && (slug[0] === "courses" || slug[0] === "lessons") && Boolean(slug[1]);
  const validExamRoute = slug.length === 2 && (slug[0] === "exam-room" || slug[0] === "exam") && Boolean(slug[1])
    || slug.length === 3 && slug[0] === "exam" && slug[1] === "result" && Boolean(slug[2]);
  if (!validStaticRoute && !validDetailRoute && !validExamRoute) notFound();
  return <PlatformApp />;
}

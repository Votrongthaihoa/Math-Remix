const EXAM_TYPE_SEGMENT = /^[a-z0-9-]+$/i;

export function targetRouteRedirect(slug: readonly string[]): string | null {
  if (slug.length === 1 && slug[0] === "history") return "/exam-history";
  if (slug.length === 1 && slug[0] === "portal") return "/profile";

  if (slug.length === 3 && slug[0] === "course" && slug[1] === "study" && slug[2]) {
    return `/lessons/${encodeURIComponent(slug[2])}`;
  }

  if (slug.length === 2 && slug[0] === "exam-rooms" && EXAM_TYPE_SEGMENT.test(slug[1])) {
    return `/exam-room?examType=${encodeURIComponent(slug[1].toUpperCase())}`;
  }

  return null;
}

const EXAM_TYPE_SEGMENT = /^[a-z0-9-]+$/i;

type TargetRouteQuery = Record<string, string | readonly string[] | undefined>;

function singleQueryValue(value: string | readonly string[] | undefined) {
  return typeof value === "string" ? value.trim() : "";
}

export function targetRouteRedirect(slug: readonly string[], query: TargetRouteQuery = {}): string | null {
  if (slug.length === 1 && slug[0] === "history") return "/exam-history";
  if (slug.length === 2 && slug[0] === "history" && slug[1] === "result") {
    const attemptId = singleQueryValue(query.attemptId) || singleQueryValue(query.id);
    return attemptId ? `/exam/result/${encodeURIComponent(attemptId)}` : "/exam-history";
  }
  if (slug.length === 1 && slug[0] === "portal") return "/profile";

  if (slug.length === 3 && slug[0] === "course" && slug[1] === "study" && slug[2]) {
    const courseId = slug[2];
    const lessonId = singleQueryValue(query.lessonId);
    // The target path segment identifies the course. A selected lesson, when
    // present, is carried separately in the query string.
    return lessonId
      ? `/lessons/${encodeURIComponent(lessonId)}`
      : `/courses/${encodeURIComponent(courseId)}`;
  }

  if (slug.length === 2 && slug[0] === "exam-rooms" && EXAM_TYPE_SEGMENT.test(slug[1])) {
    return `/exam-room?examType=${encodeURIComponent(slug[1].toUpperCase())}`;
  }

  return null;
}

export const courseTimetableHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

export const courseTimetableUuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
export const courseDeliveryModes = ["online", "offline", "hybrid", "self_study"] as const;
export type CourseDeliveryMode = typeof courseDeliveryModes[number];

export function errorResponse(message: string, status = 400) {
  return Response.json({ error: message }, { status, headers: courseTimetableHeaders });
}

export function textValue(value: unknown, max: number, fallback = "") {
  return typeof value === "string" ? value.trim().slice(0, max) : fallback;
}

export function nullableText(value: unknown, max: number) {
  const normalized = textValue(value, max);
  return normalized || null;
}

export function isoDate(value: unknown) {
  if (typeof value !== "string" || !value.trim()) return null;
  const timestamp = Date.parse(value);
  return Number.isFinite(timestamp) ? new Date(timestamp).toISOString() : null;
}

export function boundedDateRange(params: URLSearchParams) {
  const now = Date.now();
  const fallbackFrom = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const fallbackTo = new Date(now + 31 * 24 * 60 * 60 * 1000);
  const from = isoDate(params.get("from")) ?? fallbackFrom.toISOString();
  const to = isoDate(params.get("to")) ?? fallbackTo.toISOString();
  const fromMs = Date.parse(from);
  const toMs = Date.parse(to);
  if (toMs <= fromMs) return { ok: false as const, error: "Khoảng thời gian lịch không hợp lệ." };
  if (toMs - fromMs > 62 * 24 * 60 * 60 * 1000) return { ok: false as const, error: "Chỉ được tải tối đa 62 ngày lịch mỗi lần." };
  return { ok: true as const, from, to };
}

export function deliveryMode(value: unknown, fallback: CourseDeliveryMode = "self_study"): CourseDeliveryMode {
  return typeof value === "string" && (courseDeliveryModes as readonly string[]).includes(value) ? value as CourseDeliveryMode : fallback;
}

export function safeMeetingUrl(value: unknown) {
  const normalized = nullableText(value, 2000);
  if (!normalized) return null;
  try {
    const parsed = new URL(normalized);
    if (!['http:', 'https:'].includes(parsed.protocol)) return null;
    return parsed.toString();
  } catch {
    return null;
  }
}

export function eventPayload(row: Record<string, unknown>, courseTitle: string, lessonTitle?: string | null) {
  const startAt = String(row.start_at ?? "");
  const endAt = String(row.end_at ?? "");
  const eventKind = String(row.event_kind ?? "live") as "live" | "lesson";
  const mode = String(row.delivery_mode ?? "self_study") as CourseDeliveryMode;
  const canJoin = eventKind === "live" && (mode === "online" || mode === "hybrid");
  return {
    id: String(row.id),
    courseId: String(row.course_id),
    courseTitle,
    lessonId: row.lesson_id ? String(row.lesson_id) : null,
    lessonTitle: lessonTitle || null,
    title: String(row.title ?? ""),
    description: String(row.description ?? ""),
    startAt,
    endAt,
    instructor: String(row.instructor ?? "") || null,
    deliveryMode: mode,
    eventKind,
    source: String(row.source ?? "manual") as "manual" | "generated",
    status: String(row.status ?? "scheduled") as "scheduled" | "cancelled",
    published: Boolean(row.published),
    canJoin,
    joinPath: canJoin ? `/api/timetable/${encodeURIComponent(String(row.id))}/join` : null,
  };
}

export const EXAM_MONITOR_EVENT_TYPES = [
  "visibility_hidden",
  "visibility_visible",
  "fullscreen_exit",
  "fullscreen_enter",
  "window_blur",
  "window_focus",
  "copy",
  "paste",
  "cut",
  "context_menu",
] as const;

export type ExamMonitorEventType = typeof EXAM_MONITOR_EVENT_TYPES[number];
export type ExamMonitorEvent = { type?: string; at?: string };

const EVENT_TYPES = new Set<string>(EXAM_MONITOR_EVENT_TYPES);
const EXIT_CLUSTER_MS = 2_000;

export function safeExamMonitorEvents(value: unknown, limit = 20): ExamMonitorEventType[] {
  const values = Array.isArray(value) ? value : [value];
  return values
    .filter((item): item is ExamMonitorEventType => typeof item === "string" && EVENT_TYPES.has(item))
    .slice(0, Math.max(0, limit));
}

export function examMonitorEventLabel(type: unknown) {
  const labels: Record<string, string> = {
    visibility_hidden: "Rời tab hoặc ẩn trang",
    visibility_visible: "Quay lại tab thi",
    fullscreen_exit: "Thoát toàn màn hình",
    fullscreen_enter: "Vào lại toàn màn hình",
    window_blur: "Mất focus cửa sổ",
    window_focus: "Lấy lại focus",
    copy: "Sao chép",
    paste: "Dán",
    cut: "Cắt",
    context_menu: "Mở menu chuột phải",
  };
  return labels[String(type)] ?? String(type || "Sự kiện");
}

type TimedEvent = { type: string; at: string; time: number; sourceIndex: number };
type Interval = { start: number; end: number; durationMs: number };

function timedEvents(value: unknown): TimedEvent[] {
  if (!Array.isArray(value)) return [];
  return value.flatMap((raw, sourceIndex) => {
    if (!raw || typeof raw !== "object" || Array.isArray(raw)) return [];
    const event = raw as Record<string, unknown>;
    const type = typeof event.type === "string" ? event.type : "";
    const at = typeof event.at === "string" ? event.at : "";
    const time = new Date(at).getTime();
    return type && Number.isFinite(time) ? [{ type, at, time, sourceIndex }] : [];
  }).sort((left, right) => left.time - right.time || left.sourceIndex - right.sourceIndex);
}

function pairedIntervals(events: TimedEvent[], startType: string, endType: string) {
  const intervals: Interval[] = [];
  let start: number | null = null;
  for (const event of events) {
    if (event.type === startType) {
      if (start === null) start = event.time;
      continue;
    }
    if (event.type !== endType || start === null || event.time < start) continue;
    intervals.push({ start, end: event.time, durationMs: event.time - start });
    start = null;
  }
  return intervals;
}

function mergedIntervals(intervals: Interval[]) {
  const sorted = [...intervals].sort((left, right) => left.start - right.start || left.end - right.end);
  const merged: Interval[] = [];
  for (const interval of sorted) {
    const previous = merged.at(-1);
    if (!previous || interval.start > previous.end) {
      merged.push({ ...interval });
      continue;
    }
    previous.end = Math.max(previous.end, interval.end);
    previous.durationMs = previous.end - previous.start;
  }
  return merged;
}

function suspectedAppSwitches(events: TimedEvent[]) {
  const exits = events.filter(event => ["window_blur", "visibility_hidden", "fullscreen_exit"].includes(event.type));
  const clusters: Array<{ start: number; end: number; types: Set<string> }> = [];
  for (const event of exits) {
    const previous = clusters.at(-1);
    if (!previous || event.time - previous.end > EXIT_CLUSTER_MS) {
      clusters.push({ start: event.time, end: event.time, types: new Set([event.type]) });
      continue;
    }
    previous.end = event.time;
    previous.types.add(event.type);
  }
  return clusters.filter(cluster => cluster.types.has("window_blur")
    && (cluster.types.has("visibility_hidden") || cluster.types.has("fullscreen_exit"))).length;
}

export function analyzeExamMonitorEvents(value: unknown) {
  const events = timedEvents(value);
  const visibilityIntervals = pairedIntervals(events, "visibility_hidden", "visibility_visible");
  const focusIntervals = pairedIntervals(events, "window_blur", "window_focus");
  const fullscreenIntervals = pairedIntervals(events, "fullscreen_exit", "fullscreen_enter");
  const attentionIntervals = mergedIntervals([...visibilityIntervals, ...focusIntervals]);
  const attentionAwayMs = attentionIntervals.reduce((sum, interval) => sum + interval.durationMs, 0);
  const fullscreenAwayMs = fullscreenIntervals.reduce((sum, interval) => sum + interval.durationMs, 0);
  return {
    eventCount: events.length,
    tabExits: events.filter(event => event.type === "visibility_hidden").length,
    fullscreenExits: events.filter(event => event.type === "fullscreen_exit").length,
    focusLosses: events.filter(event => event.type === "window_blur").length,
    suspectedAppSwitches: suspectedAppSwitches(events),
    attentionAwayMs,
    longestAttentionAwayMs: attentionIntervals.reduce((longest, interval) => Math.max(longest, interval.durationMs), 0),
    fullscreenAwayMs,
  };
}

export function examMonitorEventDuration(value: unknown, sourceIndex: number) {
  const events = timedEvents(value);
  const start = events.find(event => event.sourceIndex === sourceIndex);
  if (!start) return 0;
  const endType = start.type === "visibility_hidden"
    ? "visibility_visible"
    : start.type === "window_blur"
      ? "window_focus"
      : start.type === "fullscreen_exit"
        ? "fullscreen_enter"
        : "";
  if (!endType) return 0;
  const end = events.find(event => event.time >= start.time && event.type === endType);
  return end ? Math.max(0, end.time - start.time) : 0;
}

export function formatExamMonitorDuration(milliseconds: number) {
  const totalSeconds = Math.max(0, Math.round(milliseconds / 1_000));
  if (milliseconds > 0 && totalSeconds === 0) return "dưới 1 giây";
  if (totalSeconds < 60) return `${totalSeconds} giây`;
  const hours = Math.floor(totalSeconds / 3_600);
  const minutes = Math.floor(totalSeconds % 3_600 / 60);
  const seconds = totalSeconds % 60;
  if (hours) return `${hours} giờ ${minutes} phút ${seconds} giây`;
  return seconds ? `${minutes} phút ${seconds} giây` : `${minutes} phút`;
}

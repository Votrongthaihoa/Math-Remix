export type ScheduleLesson = {
  id: string;
  title: string;
  chapterSortOrder: number;
  sortOrder: number;
};

export type LessonScheduleInput = {
  startDate: string;
  weekdays: number[];
  startTime: string;
  durationMinutes: number;
  lessonIds?: string[];
};

export type GeneratedLessonEvent = {
  lessonId: string;
  title: string;
  startAt: string;
  endAt: string;
};

const DEFAULT_TIME_ZONE = "Asia/Ho_Chi_Minh";
const DATE_PATTERN = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_PATTERN = /^(\d{2}):(\d{2})$/;

function assertDate(value: string) {
  const match = DATE_PATTERN.exec(value);
  if (!match) throw new Error("Ngày bắt đầu không hợp lệ.");
  const year = Number(match[1]);
  const month = Number(match[2]);
  const day = Number(match[3]);
  const check = new Date(Date.UTC(year, month - 1, day));
  if (check.getUTCFullYear() !== year || check.getUTCMonth() !== month - 1 || check.getUTCDate() !== day) {
    throw new Error("Ngày bắt đầu không hợp lệ.");
  }
  return { year, month, day };
}

function assertTime(value: string) {
  const match = TIME_PATTERN.exec(value);
  if (!match) throw new Error("Giờ bắt đầu không hợp lệ.");
  const hour = Number(match[1]);
  const minute = Number(match[2]);
  if (hour > 23 || minute > 59) throw new Error("Giờ bắt đầu không hợp lệ.");
  return { hour, minute };
}

function isoWeekday(year: number, month: number, day: number) {
  const weekday = new Date(Date.UTC(year, month - 1, day)).getUTCDay();
  return weekday === 0 ? 7 : weekday;
}

function addWallMinutes(value: { year: number; month: number; day: number; hour: number; minute: number }, minutes: number) {
  const wall = new Date(Date.UTC(value.year, value.month - 1, value.day, value.hour, value.minute));
  wall.setUTCMinutes(wall.getUTCMinutes() + minutes);
  return {
    year: wall.getUTCFullYear(),
    month: wall.getUTCMonth() + 1,
    day: wall.getUTCDate(),
    hour: wall.getUTCHours(),
    minute: wall.getUTCMinutes(),
  };
}

function formatWall(value: { year: number; month: number; day: number; hour: number; minute: number }) {
  return `${String(value.year).padStart(4, "0")}-${String(value.month).padStart(2, "0")}-${String(value.day).padStart(2, "0")}T${String(value.hour).padStart(2, "0")}:${String(value.minute).padStart(2, "0")}:00`;
}

function timeZoneOffsetMinutes(wall: string, timeZone: string) {
  const instant = new Date(`${wall}Z`);
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, timeZoneName: "shortOffset" }).formatToParts(instant);
  const zone = parts.find(part => part.type === "timeZoneName")?.value ?? "GMT";
  const match = /^GMT(?:([+-])(\d{1,2})(?::(\d{2}))?)?$/.exec(zone);
  if (!match) throw new Error(`Không xác định được múi giờ ${timeZone}.`);
  if (!match[1]) return 0;
  const minutes = Number(match[2]) * 60 + Number(match[3] ?? 0);
  return match[1] === "+" ? minutes : -minutes;
}

function toUtcIso(value: { year: number; month: number; day: number; hour: number; minute: number }, timeZone: string) {
  const wall = formatWall(value);
  const wallMs = Date.parse(`${wall}Z`);
  const utcMs = wallMs - timeZoneOffsetMinutes(wall, timeZone) * 60_000;
  return new Date(utcMs).toISOString();
}

export function normalizeWeekdays(value: unknown): number[] {
  return [...new Set((Array.isArray(value) ? value : []).filter(item => Number.isInteger(item) && item >= 1 && item <= 7))]
    .sort((left, right) => left - right);
}

function orderedLessons(lessons: ScheduleLesson[], selectedIds?: string[]) {
  const selected = selectedIds?.length ? new Set(selectedIds) : null;
  if (selected) {
    const available = new Set(lessons.map(lesson => lesson.id));
    if ([...selected].some(id => !available.has(id))) throw new Error("Có bài học không thuộc khóa học đã chọn.");
  }
  const result = lessons
    .filter(lesson => !selected || selected.has(lesson.id))
    .toSorted((left, right) => left.chapterSortOrder - right.chapterSortOrder || left.sortOrder - right.sortOrder || left.id.localeCompare(right.id));
  if (!result.length) throw new Error("Chưa chọn bài học hợp lệ để xếp lịch.");
  return result;
}

export function generateLessonSchedule(
  lessons: ScheduleLesson[],
  input: LessonScheduleInput,
  timeZone = DEFAULT_TIME_ZONE,
): GeneratedLessonEvent[] {
  const startDate = assertDate(input.startDate);
  const startTime = assertTime(input.startTime);
  const weekdays = normalizeWeekdays(input.weekdays);
  if (!weekdays.length) throw new Error("Hãy chọn ít nhất một ngày học trong tuần.");
  if (!Number.isInteger(input.durationMinutes) || input.durationMinutes < 5 || input.durationMinutes > 24 * 60) {
    throw new Error("Thời lượng mỗi buổi phải từ 5 đến 1.440 phút.");
  }

  const ordered = orderedLessons(lessons, input.lessonIds);
  let cursor = startDate;
  return ordered.map(lesson => {
    let daysAhead = 0;
    while (!weekdays.includes(isoWeekday(cursor.year, cursor.month, cursor.day)) && daysAhead < 7) {
      const next = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day + 1));
      cursor = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
      daysAhead += 1;
    }
    if (daysAhead > 6) throw new Error("Không thể xếp lịch theo các ngày đã chọn.");
    const start = { ...cursor, ...startTime };
    const end = addWallMinutes(start, input.durationMinutes);
    const event = {
      lessonId: lesson.id,
      title: lesson.title,
      startAt: toUtcIso(start, timeZone),
      endAt: toUtcIso(end, timeZone),
    };
    const next = new Date(Date.UTC(cursor.year, cursor.month - 1, cursor.day + 1));
    cursor = { year: next.getUTCFullYear(), month: next.getUTCMonth() + 1, day: next.getUTCDate() };
    return event;
  });
}

export const courseScheduleTimeZone = DEFAULT_TIME_ZONE;

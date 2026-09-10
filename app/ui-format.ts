const VIETNAM_TIME_ZONE = "Asia/Ho_Chi_Minh";

const dateFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  timeZone: VIETNAM_TIME_ZONE,
});

const dateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  year: "numeric",
  hour: "2-digit",
  minute: "2-digit",
  timeZone: VIETNAM_TIME_ZONE,
});

const shortDateTimeFormatter = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "short",
  timeStyle: "short",
  timeZone: VIETNAM_TIME_ZONE,
});

const activityDateFormatter = new Intl.DateTimeFormat("vi-VN", {
  weekday: "long",
  day: "numeric",
  month: "long",
  year: "numeric",
  timeZone: VIETNAM_TIME_ZONE,
});

const timeFormatter = new Intl.DateTimeFormat("vi-VN", {
  hour: "2-digit",
  minute: "2-digit",
  timeZone: VIETNAM_TIME_ZONE,
});

const monthDayFormatter = new Intl.DateTimeFormat("vi-VN", {
  day: "2-digit",
  month: "2-digit",
  timeZone: VIETNAM_TIME_ZONE,
});

const weekdayFormatter = new Intl.DateTimeFormat("vi-VN", {
  weekday: "short",
  timeZone: VIETNAM_TIME_ZONE,
});

const numberFormatter = new Intl.NumberFormat("vi-VN", {
  maximumFractionDigits: 1,
});

function parsedDate(value: string | Date | null | undefined) {
  if (!value) return null;
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date : null;
}

function datePart(date: Date, type: Intl.DateTimeFormatPartTypes) {
  return dateFormatter.formatToParts(date).find(part => part.type === type)?.value ?? "";
}

export function formatUiDate(value: string | Date | null | undefined, fallback = "Chưa rõ thời gian") {
  const date = parsedDate(value);
  return date ? dateFormatter.format(date) : fallback;
}

export function formatUiWeekRange(start: string | Date | null | undefined, end: string | Date | null | undefined, fallback = "Chưa rõ thời gian") {
  const startDate = parsedDate(start);
  const endDate = parsedDate(end);
  if (!startDate || !endDate) return fallback;
  const startLabel = `${datePart(startDate, "day")}/${datePart(startDate, "month")}`;
  const endLabel = `${datePart(endDate, "day")}/${datePart(endDate, "month")}/${datePart(endDate, "year")}`;
  return `${startLabel} – ${endLabel}`;
}

export function formatUiDateTime(value: string | Date | null | undefined, fallback = "Chưa rõ thời gian") {
  const date = parsedDate(value);
  return date ? dateTimeFormatter.format(date) : fallback;
}

export function formatUiShortDateTime(value: string | Date | null | undefined, fallback = "Chưa rõ thời gian") {
  const date = parsedDate(value);
  return date ? shortDateTimeFormatter.format(date) : fallback;
}

export function formatUiActivityDate(value: string | Date | null | undefined, fallback = "Chưa rõ thời gian") {
  const date = parsedDate(value);
  return date ? activityDateFormatter.format(date) : fallback;
}

export function formatUiTime(value: string | Date | null | undefined, fallback = "Chưa rõ thời gian") {
  const date = parsedDate(value);
  return date ? timeFormatter.format(date) : fallback;
}

export function formatUiMonthDay(value: string | Date | null | undefined, fallback = "Chưa rõ thời gian") {
  const date = parsedDate(value);
  return date ? monthDayFormatter.format(date) : fallback;
}

export function formatUiWeekday(value: string | Date | null | undefined, fallback = "—") {
  const date = parsedDate(value);
  return date ? weekdayFormatter.format(date) : fallback;
}

export function formatUiNumber(value: number | null | undefined, fallback = "—") {
  return typeof value === "number" && Number.isFinite(value) ? numberFormatter.format(value) : fallback;
}

export function isValidUiDate(value: string | Date | null | undefined) {
  return Boolean(parsedDate(value));
}

export const UI_TIME_ZONE = VIETNAM_TIME_ZONE;

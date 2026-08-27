export type TimetableLike = { id: string; startsAt: string; title: string };

export type TimetableGroup<T extends TimetableLike = TimetableLike> = {
  key: string;
  label: string;
  entries: T[];
};

const vietnamDate = new Intl.DateTimeFormat("vi-VN", {
  dateStyle: "full",
  timeZone: "Asia/Ho_Chi_Minh",
});

function dayKey(value: string) {
  const date = new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Ho_Chi_Minh", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(value));
  return date;
}

export function groupTimetableByDay<T extends TimetableLike>(entries: T[]): TimetableGroup<T>[] {
  const groups = new Map<string, T[]>();
  for (const entry of entries) {
    const key = dayKey(entry.startsAt);
    const current = groups.get(key) ?? [];
    current.push(entry);
    groups.set(key, current);
  }
  return [...groups.entries()].sort(([left], [right]) => left.localeCompare(right)).map(([key, dayEntries]) => ({
    key,
    label: vietnamDate.format(new Date(`${key}T12:00:00+07:00`)),
    entries: [...dayEntries].sort((left, right) => Date.parse(left.startsAt) - Date.parse(right.startsAt)),
  }));
}

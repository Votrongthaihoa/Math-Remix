import type { AdminProfileRow } from "./admin-types";

export type RosterStatus = "all" | "active" | "locked";
export type RosterSort = "name" | "code" | "courses" | "newest";
export type RosterEnrollment = "all" | "assigned" | "unassigned";

export function normalizeRosterText(value: string) {
  return value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/[đĐ]/g, "d").toLocaleLowerCase("vi").trim();
}

export function filterRoster(students: readonly AdminProfileRow[], counts: Record<string, number>, query: string, status: RosterStatus, enrollment: RosterEnrollment, sort: RosterSort) {
  const term = normalizeRosterText(query);
  return students.filter(student => {
    const count = counts[student.id] ?? 0;
    return (status === "all" || student.status === status)
      && (enrollment === "all" || (enrollment === "assigned" ? count > 0 : count === 0))
      && (!term || normalizeRosterText(`${student.full_name} ${student.student_code} ${student.email}`).includes(term));
  }).sort((a, b) => {
    if (sort === "courses") return (counts[b.id] ?? 0) - (counts[a.id] ?? 0) || a.full_name.localeCompare(b.full_name, "vi");
    if (sort === "newest") return (Date.parse(b.created_at) || 0) - (Date.parse(a.created_at) || 0);
    return (sort === "code" ? a.student_code : a.full_name).localeCompare(sort === "code" ? b.student_code : b.full_name, "vi", { numeric: true });
  });
}

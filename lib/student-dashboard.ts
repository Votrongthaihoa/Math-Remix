export type DashboardAttempt = {
  id: string;
  title?: string | null;
  score?: number | null;
  correct_answers?: number | null;
  total_questions?: number | null;
  submitted_at?: string | null;
  status?: string | null;
};

export type DashboardAttemptSummary = {
  completed: DashboardAttempt[];
  currentYear: DashboardAttempt[];
  recent: DashboardAttempt[];
  top: DashboardAttempt[];
  monthly: number[];
};

export type DashboardActivityDay = {
  dateKey: string;
  count: number;
  inYear: boolean;
};

function submittedTime(attempt: DashboardAttempt) {
  const time = attempt.submitted_at ? Date.parse(attempt.submitted_at) : Number.NaN;
  return Number.isFinite(time) ? time : Number.NEGATIVE_INFINITY;
}

function isCompleted(attempt: DashboardAttempt) {
  return attempt.status !== "in_progress" && submittedTime(attempt) !== Number.NEGATIVE_INFINITY;
}

function dateKey(date: Date) {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}

export function buildActivityCalendar(
  year: number,
  attempts: readonly DashboardAttempt[],
): DashboardActivityDay[] {
  const activity = new Map<string, number>();
  attempts.filter(isCompleted).forEach(attempt => {
    const date = new Date(submittedTime(attempt));
    if (date.getFullYear() !== year) return;
    const key = dateKey(date);
    activity.set(key, (activity.get(key) ?? 0) + 1);
  });

  const firstDayOffset = new Date(year, 0, 1).getDay();
  const dayCount = Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
  const weekCount = Math.ceil((firstDayOffset + dayCount) / 7);
  return Array.from({ length: weekCount * 7 }, (_, index) => {
    const date = new Date(year, 0, 1 - firstDayOffset + index);
    const inYear = date.getFullYear() === year;
    const currentDateKey = dateKey(date);
    return { dateKey: currentDateKey, count: inYear ? activity.get(currentDateKey) ?? 0 : 0, inYear };
  });
}

export function summarizeDashboardAttempts(
  attempts: readonly DashboardAttempt[],
  now = new Date(),
): DashboardAttemptSummary {
  const completed = attempts.filter(isCompleted).slice();
  const recent = completed
    .slice()
    .sort((left, right) => submittedTime(right) - submittedTime(left))
    .slice(0, 5);
  const top = completed
    .slice()
    .sort((left, right) => Number(right.score ?? 0) - Number(left.score ?? 0))
    .slice(0, 5);
  const currentYear = completed.filter(attempt => new Date(submittedTime(attempt)).getFullYear() === now.getFullYear());
  const monthly = Array.from({ length: 12 }, () => 0);
  currentYear.forEach(attempt => {
    const month = new Date(submittedTime(attempt)).getMonth();
    if (month >= 0 && month < 12) monthly[month] += 1;
  });

  return { completed, currentYear, recent, top, monthly };
}

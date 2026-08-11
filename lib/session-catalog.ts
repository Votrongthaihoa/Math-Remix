export type SessionState = "upcoming" | "open" | "ended" | "disabled";

export type SessionWindow = {
  starts_at: string;
  ends_at: string;
  enabled: boolean;
};

export function sessionState(session: SessionWindow, now = Date.now()): SessionState {
  if (!session.enabled) return "disabled";
  const startsAt = Date.parse(session.starts_at);
  const endsAt = Date.parse(session.ends_at);
  if (!Number.isFinite(startsAt) || !Number.isFinite(endsAt)) return "disabled";
  if (now < startsAt) return "upcoming";
  if (now <= endsAt) return "open";
  return "ended";
}

export function sessionStateLabel(state: SessionState) {
  switch (state) {
    case "upcoming": return "Sắp diễn ra";
    case "open": return "Đang mở";
    case "ended": return "Đã kết thúc";
    case "disabled": return "Đã đóng";
  }
}

export function normalizeSessionLimit(value: string | null | undefined, fallback = 30, maximum = 50) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(maximum, Math.max(1, Math.floor(parsed)));
}

export function sessionSearchText(values: Array<string | null | undefined>) {
  return values.filter(Boolean).join(" ").trim().toLocaleLowerCase("vi");
}

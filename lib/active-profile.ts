export type ActiveProfileState = {
  status?: string | null;
  account_status?: string | null;
  banned_until?: string | null;
};

/**
 * Mirrors the repository's active-account rule without trusting UI state.
 * A temporary ban only stops being active after a valid server timestamp has
 * passed; malformed or missing account state fails closed.
 */
export function isActiveProfileState(profile: ActiveProfileState | null | undefined, now = Date.now()) {
  if (!profile || profile.status !== "active") return false;
  if (profile.account_status === "active") return true;
  if (profile.account_status !== "temporarily_banned" || !profile.banned_until) return false;
  const bannedUntil = new Date(profile.banned_until).getTime();
  return Number.isFinite(bannedUntil) && bannedUntil <= now;
}

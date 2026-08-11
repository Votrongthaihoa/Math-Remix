import type { SupabaseClient } from "@supabase/supabase-js";

type RateLimitRow = {
  allowed?: boolean;
  retry_after_seconds?: number;
  denials_last_minute?: number;
};

let missingMigrationWarningShown = false;

export type RequestBudget = {
  allowed: boolean;
  retryAfterSeconds: number;
  ready: boolean;
  denialsLastMinute: number;
};

/**
 * Consume one server-side token. During a rolling deploy the application can
 * start before migration 021 reaches the database; keep that transition
 * backward-compatible by degrading only for the known missing-function case.
 * Set RATE_LIMIT_REQUIRE_DB=1 after applying the migration to fail closed.
 */
export async function consumeRequestBudget(
  admin: SupabaseClient,
  scope: string,
  subjectHash: string,
  options: { capacity: number; refillSeconds: number; cost?: number },
): Promise<RequestBudget> {
  const { data, error } = await admin.rpc("consume_request_budget", {
    target_scope: scope,
    target_subject_hash: subjectHash,
    target_capacity: options.capacity,
    target_refill_seconds: options.refillSeconds,
    target_cost: options.cost ?? 1,
  });
  if (error) {
    const detail = `${error.code ?? ""} ${error.message ?? ""}`;
    const missingFunction = /PGRST202|consume_request_budget|schema cache|function.+does not exist/i.test(detail);
    if (missingFunction && process.env.RATE_LIMIT_REQUIRE_DB !== "1") {
      if (!missingMigrationWarningShown) {
        missingMigrationWarningShown = true;
        console.warn("[rate-limit] migration 021 is not available; continuing in degraded mode");
      }
      return { allowed: true, retryAfterSeconds: 0, ready: false, denialsLastMinute: 0 };
    }
    return { allowed: false, retryAfterSeconds: 60, ready: false, denialsLastMinute: 0 };
  }
  const row = (Array.isArray(data) ? data[0] : data) as RateLimitRow | undefined;
  return {
    allowed: row?.allowed === true,
    retryAfterSeconds: Math.max(1, Math.min(3600, Number(row?.retry_after_seconds) || 1)),
    ready: true,
    denialsLastMinute: Math.max(0, Number(row?.denials_last_minute) || 0),
  };
}

export const SERVER_HEALTH_CHECK_TIMEOUT_MS = 5_000;

export type HealthCheckStatus = "healthy" | "degraded" | "not_configured";

export type HealthCheckResult = {
  ok: boolean;
  detail: string;
};

export type HealthCheck = {
  id: string;
  label: string;
  status: HealthCheckStatus;
  detail: string;
  durationMs?: number;
};

export type HealthIntegration = {
  configured: boolean;
};

class HealthCheckTimeoutError extends Error {
  constructor() {
    super("Health check timed out.");
    this.name = "HealthCheckTimeoutError";
  }
}

class HealthCheckCancelledError extends Error {
  constructor() {
    super("Health check cancelled.");
    this.name = "HealthCheckCancelledError";
  }
}

export async function timedCheck(
  id: string,
  label: string,
  check: (signal: AbortSignal) => Promise<HealthCheckResult>,
  timeoutMs = SERVER_HEALTH_CHECK_TIMEOUT_MS,
  parentSignal?: AbortSignal,
): Promise<HealthCheck> {
  const started = Date.now();
  const controller = new AbortController();
  let timeoutId: ReturnType<typeof setTimeout> | undefined;
  let didTimeout = false;
  const abortFromParent = () => controller.abort(parentSignal?.reason);
  if (parentSignal?.aborted) {
    return {
      id,
      label,
      status: "degraded",
      detail: "Không thể hoàn tất kiểm tra lúc này.",
      durationMs: Date.now() - started,
    };
  }
  const abortPromise = new Promise<never>((_, reject) => {
    const rejectWhenAborted = () => reject(new HealthCheckCancelledError());
    if (controller.signal.aborted) rejectWhenAborted();
    else controller.signal.addEventListener("abort", rejectWhenAborted, { once: true });
  });
  // The check may throw before Promise.race is constructed. Keep the
  // cancellation branch observed even in that synchronous-failure path.
  void abortPromise.catch(() => undefined);
  if (parentSignal) {
    parentSignal.addEventListener("abort", abortFromParent, { once: true });
    if (parentSignal.aborted) controller.abort(parentSignal.reason);
  }

  try {
    const timeout = new Promise<never>((_, reject) => {
      timeoutId = setTimeout(() => {
        didTimeout = true;
        controller.abort();
        reject(new HealthCheckTimeoutError());
      }, Math.max(1, timeoutMs));
    });
    const checkPromise = Promise.resolve().then(() => check(controller.signal));
    const result = await Promise.race([checkPromise, timeout, abortPromise]);
    return {
      id,
      label,
      status: result.ok ? "healthy" : "degraded",
      detail: result.detail,
      durationMs: Date.now() - started,
    };
  } catch (error) {
    const timedOut = error instanceof HealthCheckTimeoutError || didTimeout;
    return {
      id,
      label,
      status: "degraded",
      detail: timedOut ? "Kiểm tra quá thời gian cho phép." : "Không thể hoàn tất kiểm tra lúc này.",
      durationMs: Date.now() - started,
    };
  } finally {
    if (timeoutId !== undefined) clearTimeout(timeoutId);
    parentSignal?.removeEventListener("abort", abortFromParent);
    controller.abort();
  }
}

export function aggregateHealthStatus(
  checks: readonly Pick<HealthCheck, "status">[],
  integrations: readonly HealthIntegration[],
): "healthy" | "degraded" {
  if (!checks.length || !integrations.length) return "degraded";
  const checksHealthy = checks.every(check => check.status === "healthy");
  const integrationsConfigured = integrations.every(integration => integration.configured);
  return checksHealthy && integrationsConfigured ? "healthy" : "degraded";
}

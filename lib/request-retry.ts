export type RetryableRequestError = Error & {
  status?: number;
  retryAfterMs?: number;
};

export type RetryOptions = {
  maxRetries?: number;
  baseDelayMs?: number;
  maxDelayMs?: number;
  shouldRetry?: (error: unknown) => boolean;
};

function errorStatus(error: unknown) {
  if (!error || typeof error !== "object") return undefined;
  const value = (error as { status?: unknown }).status;
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

export function retryAfterMilliseconds(value: string | null | undefined) {
  const raw = value?.trim() ?? "";
  if (!raw) return 0;
  const seconds = Number(raw);
  if (Number.isFinite(seconds)) return Math.max(0, Math.min(30_000, Math.round(seconds * 1000)));
  const timestamp = Date.parse(raw);
  return Number.isFinite(timestamp) ? Math.max(0, Math.min(30_000, timestamp - Date.now())) : 0;
}

export function isRetryableRequestError(error: unknown) {
  if (error && typeof error === "object" && (error as { name?: unknown }).name === "AbortError") return false;
  const status = errorStatus(error);
  if (status === undefined) return true;
  return status === 408 || status === 425 || status === 429 || status >= 500;
}

function retryDelay(error: unknown, attempt: number, baseDelayMs: number, maxDelayMs: number) {
  if (error && typeof error === "object") {
    const serverDelay = (error as { retryAfterMs?: unknown }).retryAfterMs;
    if (typeof serverDelay === "number" && Number.isFinite(serverDelay) && serverDelay > 0) return Math.min(maxDelayMs, serverDelay);
  }
  const exponential = Math.min(maxDelayMs, baseDelayMs * (2 ** attempt));
  const jitter = Math.round(exponential * (0.85 + Math.random() * 0.3));
  return Math.min(maxDelayMs, jitter);
}

export async function retryWithBackoff<T>(operation: () => Promise<T>, options: RetryOptions = {}) {
  const maxRetries = Math.max(0, Math.min(5, Math.floor(options.maxRetries ?? 2)));
  const baseDelayMs = Math.max(50, Math.min(5_000, Math.floor(options.baseDelayMs ?? 250)));
  const maxDelayMs = Math.max(baseDelayMs, Math.min(30_000, Math.floor(options.maxDelayMs ?? 4_000)));
  const shouldRetry = options.shouldRetry ?? isRetryableRequestError;
  let attempt = 0;
  while (true) {
    try {
      return await operation();
    } catch (error) {
      if (attempt >= maxRetries || !shouldRetry(error)) throw error;
      await new Promise(resolve => setTimeout(resolve, retryDelay(error, attempt, baseDelayMs, maxDelayMs)));
      attempt += 1;
    }
  }
}

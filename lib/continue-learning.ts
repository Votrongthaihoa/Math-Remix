export type ContinueLearningFallback = {
  lessonId: string;
  resourceId?: string;
  updatedAt: string;
};

type StoredContinueLearningFallback = ContinueLearningFallback & { version: 1 };

function validId(value: unknown) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= 180;
}

export type ContinueLearningItem = ContinueLearningFallback & {
  lessonTitle: string;
  courseTitle: string;
  resourceTitle?: string;
};

export function parseContinueLearningPayload(value: unknown): { item: ContinueLearningItem | null } | null {
  if (!value || typeof value !== "object" || Array.isArray(value) || !("item" in value)) return null;
  const item = value.item;
  if (item === null) return { item: null };
  if (!item || typeof item !== "object" || Array.isArray(item)) return null;
  if (!("lessonId" in item) || !validId(item.lessonId) || !("updatedAt" in item) || !validTimestamp(item.updatedAt)
    || !("lessonTitle" in item) || typeof item.lessonTitle !== "string"
    || !("courseTitle" in item) || typeof item.courseTitle !== "string"
    || ("resourceId" in item && item.resourceId !== undefined && !validId(item.resourceId))
    || ("resourceTitle" in item && item.resourceTitle !== undefined && typeof item.resourceTitle !== "string")) return null;
  return { item: {
    lessonId: item.lessonId as string, updatedAt: item.updatedAt as string,
    lessonTitle: item.lessonTitle, courseTitle: item.courseTitle,
    ...("resourceId" in item && typeof item.resourceId === "string" ? { resourceId: item.resourceId } : {}),
    ...("resourceTitle" in item && typeof item.resourceTitle === "string" ? { resourceTitle: item.resourceTitle } : {}),
  } };
}

export type ContinueLearningResult = {
  status: "ready" | "fallback" | "error";
  item: ContinueLearningItem | null;
};

/** A bounded request even when the injected transport ignores abort signals. */
export async function loadContinueLearningResult(options: {
  request: (signal: AbortSignal) => Promise<Response>;
  readFallback: () => string | null;
  signal: AbortSignal;
  timeoutMs?: number;
}): Promise<ContinueLearningResult> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  let cancel = () => {};
  const interrupted = new Promise<never>((_, reject) => {
    cancel = () => { controller.abort(); reject(new DOMException("Cancelled", "AbortError")); };
    options.signal.addEventListener("abort", cancel, { once: true });
    if (options.signal.aborted) cancel();
    timer = setTimeout(() => { controller.abort(); reject(new Error("Continue learning timeout")); }, options.timeoutMs ?? 15_000);
  });
  try {
    const result = await Promise.race([interrupted, options.signal.aborted ? interrupted : (async (): Promise<ContinueLearningResult | null> => {
      const response = await options.request(controller.signal);
      if (!response.ok && response.status < 500) return { status: "error", item: null };
      if (!response.ok) return null;
      const parsed = parseContinueLearningPayload(await response.json());
      return parsed ? { status: "ready", item: parsed.item } : null;
    })()]);
    if (options.signal.aborted) throw new DOMException("Cancelled", "AbortError");
    if (result) return result;
  } catch (error) {
    if (options.signal.aborted) throw error;
  } finally {
    clearTimeout(timer);
    options.signal.removeEventListener("abort", cancel);
  }
  const fallback = readContinueLearningFallback(options.readFallback);
  return fallback
    ? { status: "fallback", item: { ...fallback, lessonTitle: "Bài học đang học", courseTitle: "Tiếp tục từ thiết bị này" } }
    : { status: "error", item: null };
}

function validTimestamp(value: unknown) {
  return typeof value === "string" && !Number.isNaN(Date.parse(value));
}

export function serializeContinueLearningFallback(value: ContinueLearningFallback) {
  const stored: StoredContinueLearningFallback = {
    version: 1,
    lessonId: value.lessonId,
    ...(value.resourceId ? { resourceId: value.resourceId } : {}),
    updatedAt: value.updatedAt,
  };
  return JSON.stringify(stored);
}

export function parseContinueLearningFallback(value: string | null): ContinueLearningFallback | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(value) as Record<string, unknown>;
    if (Object.keys(parsed).some(key => !["version", "lessonId", "resourceId", "updatedAt"].includes(key))) return null;
    if (parsed.version !== 1 || !validId(parsed.lessonId) || (parsed.resourceId !== undefined && !validId(parsed.resourceId)) || !validTimestamp(parsed.updatedAt)) return null;
    return {
      lessonId: parsed.lessonId as string,
      ...(typeof parsed.resourceId === "string" ? { resourceId: parsed.resourceId } : {}),
      updatedAt: parsed.updatedAt as string,
    };
  } catch {
    return null;
  }
}

export function continueLearningStorageKey(userId: string) {
  return `aeck.continue-learning.v1:${userId}`;
}

// Storage access itself may throw in privacy-restricted browser contexts.
export function readContinueLearningFallback(read: () => string | null) {
  try {
    return parseContinueLearningFallback(read());
  } catch {
    return null;
  }
}

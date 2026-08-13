import { activeSessionToken, authenticatedFetch } from "./auth-client";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;
const MAX_MEMORY_CACHED_IMAGES = 24;
const protectedImageBlobs = new Map<string, Promise<Blob>>();
let protectedImageSessionToken = "";
const EXAM_IMAGE_URL_PATTERN = /(?:https?:\/\/[^\s{}"'<>]+)?\/api\/exam-images\/[^\s{}"'<>]+/gi;

/**
 * Keep the original bytes and filename. The server validates the actual
 * format before storing it; the browser must not rasterize SVG or recompress
 * PNG/JPEG uploads into WebP.
 */
export async function prepareImageFile(file: File) {
  if (!file.size || file.size > MAX_SOURCE_BYTES) throw new Error("Ảnh đầu vào phải nhỏ hơn 12 MB.");
  return file;
}

export async function adminImageFetch(input: RequestInfo | URL, init?: RequestInit) {
  return authenticatedFetch(input, init);
}

export function isAuthenticatedExamImage(url: string) {
  if (url.startsWith("/api/exam-images/")) return true;
  if (typeof window === "undefined") return false;
  try {
    const parsed = new URL(url, window.location.href);
    if (!parsed.pathname.startsWith("/api/exam-images/")) return false;
    return parsed.origin === window.location.origin
      || parsed.hostname === "api.mathremix.pro.vn";
  } catch {
    return false;
  }
}

export async function loadAuthenticatedExamImage(url: string) {
  // Scope the in-memory entry to the current auth session. A logout/login in
  // the same tab must never reuse a protected blob fetched by another account.
  const token = await activeSessionToken();
  if (protectedImageSessionToken !== token) {
    protectedImageBlobs.clear();
    protectedImageSessionToken = token;
  }
  const cached = protectedImageBlobs.get(url);
  if (cached) return cached;

  const request = authenticatedFetch(url, {
    headers: { accept: "image/*" },
    cache: "default",
  }).then(async response => {
    if (!response.ok) throw new Error("image request failed");
    const blob = await response.blob();
    if (!blob.size) throw new Error("empty image");
    return blob;
  }).catch(error => {
    protectedImageBlobs.delete(url);
    throw error;
  });

  protectedImageBlobs.set(url, request);
  if (protectedImageBlobs.size > MAX_MEMORY_CACHED_IMAGES) {
    const oldest = protectedImageBlobs.keys().next().value;
    if (oldest && oldest !== url) protectedImageBlobs.delete(oldest);
  }
  return request;
}

function collectAuthenticatedImageUrls(value: unknown, urls: Set<string>) {
  if (typeof value === "string") {
    for (const match of value.matchAll(EXAM_IMAGE_URL_PATTERN)) {
      const url = match[0];
      if (isAuthenticatedExamImage(url)) urls.add(url);
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach(item => collectAuthenticatedImageUrls(item, urls));
    return;
  }
  if (value && typeof value === "object") {
    Object.values(value as Record<string, unknown>).forEach(item => collectAuthenticatedImageUrls(item, urls));
  }
}

export function preloadAuthenticatedExamImages(content: unknown, limit = 10) {
  if (typeof window === "undefined") return;
  const urls = new Set<string>();
  collectAuthenticatedImageUrls(content, urls);
  [...urls].slice(0, Math.max(0, limit)).forEach(url => {
    void loadAuthenticatedExamImage(url).catch(() => undefined);
  });
}

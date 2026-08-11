import { authenticatedFetch } from "./auth-client";

const MAX_SOURCE_BYTES = 12 * 1024 * 1024;

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

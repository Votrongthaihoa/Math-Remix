import { hlsVideoId } from "./hls-vault.ts";

const playlistPath = /^(?:index|master|(?:1080p|720p)\/index)\.m3u8$/;
const segmentPath = /^(?:seg|(?:1080p|720p)\/seg)_[0-9]{1,10}\.ts$/;
// Keep this within the validation contract of consume_request_budget. A
// segment upload consumes one token, and the one-second refill lets a long
// but legitimate encode continue as Graph uploads complete.
export const HLS_UPLOAD_RATE_LIMIT = { capacity: 1000, refillSeconds: 1 } as const;
// Keep multipart requests below the practical serverless request-body limit;
// the browser encoder uses a short HLS duration so segments stay below this.
export const MAX_HLS_UPLOAD_BYTES = 4 * 1024 * 1024;

export function clearAttachedBytes(bytes: Uint8Array) {
  if (bytes.byteLength > 0) bytes.fill(0);
}

export function hlsUploadPath(videoId: string, relativePath: string) {
  if (!hlsVideoId(videoId)) throw new Error("Mã video HLS không hợp lệ.");
  const normalized = relativePath.trim().replace(/^\/+/, "");
  if (!playlistPath.test(normalized) && !segmentPath.test(normalized)) throw new Error("Chỉ được tải manifest và segment HLS hợp lệ.");
  return normalized;
}

export function hlsUploadContentType(relativePath: string) {
  return relativePath.toLowerCase().endsWith(".m3u8")
    ? "application/vnd.apple.mpegurl"
    : "video/mp2t";
}

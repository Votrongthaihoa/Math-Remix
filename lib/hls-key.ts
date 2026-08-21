const HLS_VIDEO_ID = /^[A-Za-z0-9_-]{1,80}$/;

function hexBytes(value: string) {
  const normalized = value.trim();
  if (normalized.length < 64 || normalized.length % 2 !== 0 || !/^[0-9a-f]+$/i.test(normalized)) {
    throw new Error("HLS key secret is not configured");
  }
  const bytes = new Uint8Array(normalized.length / 2);
  for (let index = 0; index < bytes.length; index += 1) {
    bytes[index] = Number.parseInt(normalized.slice(index * 2, index * 2 + 2), 16);
  }
  return bytes;
}

/** Derive the per-video AES-128 HLS key without exposing the master secret. */
export async function deriveHlsMediaKey(masterHex: string, videoId: string) {
  if (!HLS_VIDEO_ID.test(videoId)) throw new Error("Invalid HLS video id");
  const master = hexBytes(masterHex);
  const key = await crypto.subtle.importKey("raw", master, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const digest = await crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`hls-key:v1:${videoId}`));
  return new Uint8Array(digest).slice(0, 16);
}

export function hlsMediaKeyFromEnvironment(videoId: string) {
  return deriveHlsMediaKey(process.env.MEDIA_MASTER_KEY_HEX || "", videoId);
}

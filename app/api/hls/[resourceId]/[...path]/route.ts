import { contentServer } from "../../../../../lib/content-server";
import { verifyContentToken } from "../../../../../lib/content-token";
import { rewriteHlsManifest } from "../../../../../lib/hls-vault";
import { getHlsOriginRedirect, hlsVideoId } from "../../../../../lib/microsoft-graph-hls";
import { guardResourceAccess } from "../../../../../lib/resource-access-server";
import { activeAccount, type SecurityProfile } from "../../../../../lib/security-server";

type RouteContext = { params: Promise<{ resourceId: string; path: string[] }> };
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;

function noStore(extra: HeadersInit = {}) {
  return {
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    ...extra,
  };
}

function jsonError(error: string, status: number) {
  return Response.json({ error }, { status, headers: noStore() });
}

function safeRelativePath(value: string) {
  if (!value || value.length > 800 || value.includes("\\") || value.includes("\0")) return false;
  const parts = value.split("/");
  return !parts.some(part => !part || part === "." || part === ".." || /[\u0000-\u001f\u007f:]/.test(part));
}

async function readLimited(response: Response) {
  if (!response.body) return "";
  const contentLength = Number(response.headers.get("content-length"));
  if (Number.isFinite(contentLength) && contentLength > MAX_MANIFEST_BYTES) throw new Error("HLS manifest too large");
  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    while (true) {
      const next = await reader.read();
      if (next.done) break;
      total += next.value.byteLength;
      if (total > MAX_MANIFEST_BYTES) {
        await reader.cancel("manifest_too_large");
        throw new Error("HLS manifest too large");
      }
      chunks.push(next.value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength; }
  return new TextDecoder().decode(bytes);
}

function mediaKey(masterHex: string, videoId: string) {
  if (!/^[0-9a-fA-F]+$/.test(masterHex) || masterHex.length % 2 || masterHex.length < 64) throw new Error("HLS key secret is not configured");
  const master = new Uint8Array(masterHex.length / 2);
  for (let i = 0; i < master.length; i += 1) master[i] = Number.parseInt(masterHex.slice(i * 2, i * 2 + 2), 16);
  return crypto.subtle.importKey("raw", master, { name: "HMAC", hash: "SHA-256" }, false, ["sign"])
    .then(key => crypto.subtle.sign("HMAC", key, new TextEncoder().encode(`hls-key:v1:${videoId}`)))
    .then(value => new Uint8Array(value).slice(0, 16));
}

export async function GET(request: Request, context: RouteContext) {
  if (request.method !== "GET") return jsonError("method_not_allowed", 405);
  const config = contentServer();
  if (!config.ok) return config.response;
  const { admin, tokenSecret } = config;
  const params = await context.params;
  const token = new URL(request.url).searchParams.get("t") || "";
  const payload = await verifyContentToken(token, tokenSecret);
  if (!payload || payload.rid !== params.resourceId) return jsonError("invalid_content_token", 401);
  const { data: profile } = await admin.from("profiles").select("id,role,status,account_status,violation_count,banned_at,banned_until,ban_reason,ban_event_id").eq("id", payload.sub).maybeSingle();
  if (!profile || !activeAccount(profile as SecurityProfile)) return jsonError("account_inactive", 423);
  const access = await guardResourceAccess(admin, payload.sub, profile as SecurityProfile, params.resourceId, "view");
  if (!access.ok) return access.response;
  const resource = access.resource;
  const metadata = resource.provider_metadata ?? {};
  const videoId = hlsVideoId(metadata.hlsVideoId);
  if (resource.resource_type !== "hls_vault" || metadata.playbackMode !== "hls-vault" || !videoId) return jsonError("hls_resource_not_found", 404);
  let relative: string;
  try { relative = params.path.map(value => decodeURIComponent(value)).join("/"); }
  catch { return jsonError("invalid_hls_path", 400); }
  if (!safeRelativePath(relative)) return jsonError("invalid_hls_path", 400);
  try {
    if (relative === "key") {
      const key = await mediaKey(process.env.MEDIA_MASTER_KEY_HEX || "", videoId);
      return new Response(key, { status: 200, headers: noStore({ "content-type": "application/octet-stream" }) });
    }
    const origin = await getHlsOriginRedirect(videoId, relative, admin);
    if (!relative.toLowerCase().endsWith(".m3u8")) return Response.redirect(origin, 302);
    const source = await fetch(origin, { headers: { accept: "application/vnd.apple.mpegurl,text/plain,*/*" }, cache: "no-store" });
    if (!source.ok) return jsonError("hls_manifest_unavailable", 502);
    const rewritten = rewriteHlsManifest(await readLimited(source), params.resourceId, relative, token);
    return new Response(rewritten, { status: 200, headers: noStore({ "content-type": "application/vnd.apple.mpegurl; charset=utf-8" }) });
  } catch (error) {
    console.error("[hls] request failed", { resourceId: params.resourceId, relative, error: error instanceof Error ? error.message : "unknown_error" });
    return jsonError("hls_playback_unavailable", 502);
  }
}

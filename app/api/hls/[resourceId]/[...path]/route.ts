import { contentServer } from "../../../../../lib/content-server";
import { verifyContentToken } from "../../../../../lib/content-token";
import { hlsMediaKeyFromEnvironment } from "../../../../../lib/hls-key";
import { HLS_PLAYBACK_RATE_LIMIT, rewriteHlsManifest } from "../../../../../lib/hls-vault";
import { getHlsOriginRedirect, hlsVideoId } from "../../../../../lib/microsoft-graph-hls";
import { consumeRequestBudget } from "../../../../../lib/rate-limit-server";
import { guardResourceAccess } from "../../../../../lib/resource-access-server";
import { activeAccount, hashedRequestIp, type SecurityProfile } from "../../../../../lib/security-server";

type RouteContext = { params: Promise<{ resourceId: string; path: string[] }> };
const MAX_MANIFEST_BYTES = 4 * 1024 * 1024;
const PRODUCTION_WEB_ORIGINS = new Set([
  "https://mathremix.pro.vn",
  "https://www.mathremix.pro.vn",
]);

function allowedWebOrigin(value: string) {
  if (PRODUCTION_WEB_ORIGINS.has(value)) return value;
  try {
    const url = new URL(value);
    if ((url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1")) return value;
  } catch {
    // Ignore malformed or untrusted origins.
  }
  return "";
}

function corsHeaders(request: Request, extra: HeadersInit = {}) {
  const origin = allowedWebOrigin(request.headers.get("origin") || "");
  return {
    "cache-control": "private, no-store, max-age=0",
    "x-content-type-options": "nosniff",
    "access-control-allow-credentials": "true",
    "access-control-allow-methods": "GET, OPTIONS",
    "access-control-allow-headers": "Content-Type, Authorization, X-Supabase-Access-Token, x-content-token",
    ...(origin ? { "access-control-allow-origin": origin, vary: "Origin" } : {}),
    ...extra,
  };
}

export async function OPTIONS(request: Request) {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
}


function jsonError(request: Request, error: string, status: number) {
  return Response.json({ error }, { status, headers: corsHeaders(request) });
}

async function playbackSubjectHash(userId: string, resourceId: string, request: Request) {
  const ipHash = await hashedRequestIp(request);
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(`hls-playback:${userId}:${resourceId}:${ipHash}`));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, "0")).join("");
}

async function recordPlaybackThrottle(admin: Parameters<typeof guardResourceAccess>[0], userId: string, resourceId: string, relative: string, request: Request, denials: number) {
  const { error } = await admin.from("security_events").insert({
    user_id: userId,
    event_type: "warning",
    risk_score: Math.min(90, 40 + denials * 5),
    reason: "HLS playback traffic was throttled.",
    evidence: {
      resourceId,
      path: relative.slice(0, 240),
      denialCount: denials,
      userAgent: (request.headers.get("user-agent") || "").slice(0, 180),
    },
  });
  if (error) console.warn("[hls] could not record playback throttle", { code: error.code, message: error.message });
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

export async function GET(request: Request, context: RouteContext) {
  if (request.method !== "GET") return jsonError(request, "method_not_allowed", 405);
  const config = contentServer();
  if (!config.ok) return config.response;
  const { admin, tokenSecret } = config;
  const params = await context.params;
  const token = new URL(request.url).searchParams.get("t") || "";
  const payload = await verifyContentToken(token, tokenSecret);
  if (!payload || payload.rid !== params.resourceId) return jsonError(request, "invalid_content_token", 401);
  const { data: profile } = await admin.from("profiles").select("id,role,status,account_status,violation_count,banned_at,banned_until,ban_reason,ban_event_id").eq("id", payload.sub).maybeSingle();
  if (!profile || !activeAccount(profile as SecurityProfile)) return jsonError(request, "account_inactive", 423);
  const access = await guardResourceAccess(admin, payload.sub, profile as SecurityProfile, params.resourceId, "view");
  if (!access.ok) return access.response;
  const resource = access.resource;
  const metadata = resource.provider_metadata ?? {};
  const videoId = hlsVideoId(metadata.hlsVideoId);
  if (resource.resource_type !== "hls_vault" || metadata.playbackMode !== "hls-vault" || !videoId) return jsonError(request, "hls_resource_not_found", 404);
  let relative: string;
  try { relative = params.path.map(value => decodeURIComponent(value)).join("/"); }
  catch { return jsonError(request, "invalid_hls_path", 400); }
  if (!safeRelativePath(relative)) return jsonError(request, "invalid_hls_path", 400);
  const isManifest = relative.toLowerCase().endsWith(".m3u8");
  const isSegment = relative.toLowerCase().endsWith(".ts");
  if (isSegment && request.headers.has("range")) return jsonError(request, "range_not_supported", 416);
  try {
    const budget = await consumeRequestBudget(admin, "hls-playback", await playbackSubjectHash(payload.sub, params.resourceId, request), HLS_PLAYBACK_RATE_LIMIT);
    if (!budget.allowed) {
      if (budget.denialsLastMinute <= 1) await recordPlaybackThrottle(admin, payload.sub, params.resourceId, relative, request, budget.denialsLastMinute);
      return Response.json({ error: "HLS playback rate limited", code: "HLS_PLAYBACK_RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...corsHeaders(request), "retry-after": String(budget.retryAfterSeconds) } });
    }
    if (relative === "key") {
      const key = await hlsMediaKeyFromEnvironment(videoId);
      return new Response(key, { status: 200, headers: corsHeaders(request, { "content-type": "application/octet-stream" }) });
    }
    const origin = await getHlsOriginRedirect(videoId, relative, admin);
    const source = await fetch(origin, { headers: { accept: "application/vnd.apple.mpegurl,text/plain,*/*" }, cache: "no-store" });
    if (!source.ok) return jsonError(request, isManifest ? "hls_manifest_unavailable" : "hls_segment_unavailable", 502);
    if (!isManifest) {
      return new Response(source.body, { status: 200, headers: corsHeaders(request, {
        "content-type": source.headers.get("content-type") || (isSegment ? "video/mp2t" : "application/octet-stream"),
        "content-disposition": "inline",
      }) });
    }
    const rewritten = rewriteHlsManifest(await readLimited(source), params.resourceId, relative, token);
    return new Response(rewritten, { status: 200, headers: corsHeaders(request, { "content-type": "application/vnd.apple.mpegurl; charset=utf-8" }) });
  } catch (error) {
    console.error("[hls] request failed", { resourceId: params.resourceId, relative, error: error instanceof Error ? error.message : "unknown_error" });
    return jsonError(request, "hls_playback_unavailable", 502);
  }
}





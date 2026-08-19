import { contentServer } from "../../../lib/content-server";
import { verifyContentToken } from "../../../lib/content-token";
import { jsonBodyError, readJsonBody } from "../../../lib/http-server";
import { guardResourceAccess } from "../../../lib/resource-access-server";
import { ensureActiveAccount } from "../../../lib/security-server";
import { inspectMicrosoftGraphVideo, MicrosoftGraphError, resolveMicrosoftGraphPlayback } from "../../../lib/microsoft-graph-server";

function youtubeSource(url: string) {
  try {
    const parsed = new URL(url);
    const id = parsed.hostname.includes("youtu.be") ? parsed.pathname.slice(1) : parsed.searchParams.get("v") || parsed.pathname.split("/").filter(Boolean).pop() || "";
    const start = Number(parsed.searchParams.get("t") || parsed.searchParams.get("start") || 0) || 0;
    return /^[a-zA-Z0-9_-]{6,20}$/.test(id) ? { id, start: Math.max(0, start) } : null;
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  const config = contentServer();
  if (!config.ok) return config.response;
  const { admin, tokenSecret } = config;

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const parsedBody = await readJsonBody<{ videoToken?: string }>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400 });
  const body = parsedBody.body;
  if (!body.videoToken) return Response.json({ error: "Thiếu token nội dung." }, { status: 400 });

  const security = await ensureActiveAccount(request, admin);
  if (!security.ok) return security.response;
  const auth = { user: security.user };
  const payload = await verifyContentToken(body.videoToken, tokenSecret);
  if (!payload || payload.sub !== auth.user.id) return Response.json({ error: "Token nội dung không hợp lệ hoặc đã hết hạn." }, { status: 403 });

  const access = await guardResourceAccess(admin, security.user.id, security.profile, payload.rid, "view");
  if (!access.ok) return access.response;
  const resource = access.resource;

  let responseBody: Record<string, string | number>;
  if (resource.resource_type === "youtube") {
    const source = youtubeSource(resource.resource_url);
    if (!source) return Response.json({ error: "Liên kết YouTube không hợp lệ." }, { status: 422 });
    responseBody = { type: resource.resource_type, title: resource.title, youtubeId: source.id, start: source.start };
  } else if (resource.resource_type === "hls_vault") {
    const hlsVideoId = typeof resource.provider_metadata?.hlsVideoId === "string" ? resource.provider_metadata.hlsVideoId : "";
    if (resource.provider_metadata?.playbackMode !== "hls-vault" || !/^[A-Za-z0-9_-]{1,80}$/.test(hlsVideoId)) return Response.json({ error: "Video HLS chưa được cấu hình." }, { status: 422 });
    responseBody = {
      type: resource.resource_type,
      title: resource.title,
      playbackUrl: `/api/hls/${encodeURIComponent(resource.id)}/master.m3u8?t=${encodeURIComponent(body.videoToken)}`,
      playbackMode: "hls-vault",
      mimeType: "application/vnd.apple.mpegurl",
    };
  } else if (resource.resource_type === "onedrive_video") {
    try {
      let driveId = resource.provider_drive_id ?? "";
      let itemId = resource.provider_item_id ?? "";
      let mimeType = typeof resource.provider_metadata?.mimeType === "string" ? resource.provider_metadata.mimeType : "video/mp4";
      if (!driveId || !itemId) {
        const metadata = await inspectMicrosoftGraphVideo(resource.resource_url, admin);
        driveId = metadata.driveId;
        itemId = metadata.itemId;
        mimeType = metadata.mimeType;
        const { error } = await admin.from("lesson_resources").update({
          provider: metadata.provider,
          provider_drive_id: metadata.driveId,
          provider_item_id: metadata.itemId,
          provider_metadata: metadata.providerMetadata,
        }).eq("id", resource.id);
        if (error) console.warn("[video-token] could not persist resolved Microsoft item", { code: error.code, message: error.message });
      }
      const playbackUrl = await resolveMicrosoftGraphPlayback(driveId, itemId, admin);
      responseBody = { type: resource.resource_type, title: resource.title, playbackUrl, playbackMode: "native", mimeType };
    } catch (error) {
      if (error instanceof MicrosoftGraphError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: { "cache-control": "private, no-store, max-age=0" } });
      return Response.json({ error: "Không thể mở liên kết video Microsoft." }, { status: 502, headers: { "cache-control": "private, no-store, max-age=0" } });
    }
  } else {
    responseBody = { type: resource.resource_type, title: resource.title, protectedContent: "pdf" };
  }

  return Response.json(responseBody, {
    headers: {
      "cache-control": "private, no-store, max-age=0",
      "referrer-policy": "same-origin",
      "x-content-type-options": "nosniff",
    },
  });
}

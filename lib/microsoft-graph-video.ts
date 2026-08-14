import { encodeMicrosoftSharingUrl, parseMicrosoftShareUrl, type MicrosoftShareProvider } from "./microsoft-share-url.ts";

type GraphConfig = { tenantId: string; clientId: string; clientSecret: string };
type GraphToken = { value: string; expiresAt: number };
type GraphVideo = {
  id?: string;
  name?: string;
  size?: number;
  webUrl?: string;
  file?: { mimeType?: string };
  video?: { duration?: number; width?: number; height?: number };
  parentReference?: { driveId?: string; driveType?: string };
  "@microsoft.graph.downloadUrl"?: string;
};

export type MicrosoftVideoMetadata = {
  provider: MicrosoftShareProvider;
  providerLabel: string;
  shareUrl: string;
  driveId: string;
  itemId: string;
  name: string;
  mimeType: string;
  size: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  webUrl: string | null;
};

export type MicrosoftPlayback = MicrosoftVideoMetadata & { playbackUrl: string; resolvedAt: string };

const GRAPH_ORIGIN = "https://graph.microsoft.com/v1.0";
const TOKEN_SKEW_MS = 60_000;
const PLAYBACK_CACHE_MS = 90_000;
const MAX_PLAYBACK_CACHE = 100;
let tokenCache: GraphToken | null = null;
let tokenRequest: Promise<GraphToken> | null = null;
const playbackCache = new Map<string, { value: MicrosoftPlayback; expiresAt: number }>();
const playbackRequests = new Map<string, Promise<MicrosoftPlayback>>();

export class MicrosoftGraphVideoError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 502, code = "MICROSOFT_GRAPH_ERROR") {
    super(message);
    this.name = "MicrosoftGraphVideoError";
    this.status = status;
    this.code = code;
  }
}

function graphConfig(): GraphConfig {
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() ?? "";
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? "";
  if (!tenantId || !clientId || !clientSecret) {
    throw new MicrosoftGraphVideoError("Máy chủ chưa được cấu hình kết nối Microsoft Graph.", 503, "MICROSOFT_GRAPH_NOT_CONFIGURED");
  }
  if (!/^[0-9a-z._-]+$/i.test(tenantId) || !/^[0-9a-f-]{36}$/i.test(clientId)) {
    throw new MicrosoftGraphVideoError("Cấu hình Microsoft Graph không hợp lệ.", 503, "MICROSOFT_GRAPH_INVALID_CONFIG");
  }
  return { tenantId, clientId, clientSecret };
}

async function graphToken(fetcher: typeof fetch): Promise<GraphToken> {
  if (tokenCache && tokenCache.expiresAt - TOKEN_SKEW_MS > Date.now()) return tokenCache;
  if (tokenRequest) return tokenRequest;
  tokenRequest = (async () => {
    const config = graphConfig();
    const response = await fetcher(`https://login.microsoftonline.com/${encodeURIComponent(config.tenantId)}/oauth2/v2.0/token`, {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
      body: new URLSearchParams({
        client_id: config.clientId,
        client_secret: config.clientSecret,
        scope: "https://graph.microsoft.com/.default",
        grant_type: "client_credentials",
      }),
      cache: "no-store",
    });
    const body = await response.json().catch(() => null) as { access_token?: string; expires_in?: number; error_description?: string } | null;
    if (!response.ok || !body?.access_token) {
      console.error("[microsoft-graph] token exchange failed", { status: response.status });
      throw new MicrosoftGraphVideoError("Không thể xác thực với Microsoft Graph. Hãy kiểm tra cấu hình ứng dụng Microsoft.", 503, "MICROSOFT_AUTH_FAILED");
    }
    tokenCache = { value: body.access_token, expiresAt: Date.now() + Math.max(60, Number(body.expires_in) || 3600) * 1000 };
    return tokenCache;
  })().finally(() => { tokenRequest = null; });
  return tokenRequest;
}

async function graphGet(path: string, fetcher: typeof fetch) {
  const token = await graphToken(fetcher);
  const response = await fetcher(`${GRAPH_ORIGIN}${path}`, {
    headers: { authorization: `Bearer ${token.value}`, accept: "application/json", prefer: "redeemSharingLinkIfNecessary" },
    cache: "no-store",
  });
  const body = await response.json().catch(() => null) as (GraphVideo & { error?: { code?: string; message?: string } }) | null;
  if (!response.ok || !body) {
    console.warn("[microsoft-graph] drive item lookup failed", { status: response.status, code: body?.error?.code });
    if (response.status === 401 || response.status === 403) {
      throw new MicrosoftGraphVideoError("Ứng dụng Microsoft chưa có quyền đọc video này hoặc link không thuộc tenant đã kết nối.", 422, "MICROSOFT_ACCESS_DENIED");
    }
    if (response.status === 404) throw new MicrosoftGraphVideoError("Không tìm thấy video từ liên kết Microsoft này.", 404, "MICROSOFT_VIDEO_NOT_FOUND");
    throw new MicrosoftGraphVideoError("Microsoft tạm thời chưa trả được thông tin video. Hãy thử lại.", 502);
  }
  return body;
}

function videoMetadata(item: GraphVideo, shareUrl: string, fallbackProvider: MicrosoftShareProvider): MicrosoftVideoMetadata {
  const mimeType = item.file?.mimeType?.toLowerCase() ?? "";
  if (!item.id || !item.parentReference?.driveId) throw new MicrosoftGraphVideoError("Microsoft không trả về định danh ổn định cho video.", 422, "MICROSOFT_ITEM_ID_MISSING");
  if (!mimeType.startsWith("video/") && !item.video) throw new MicrosoftGraphVideoError("Liên kết Microsoft này không trỏ tới một file video.", 422, "MICROSOFT_NOT_A_VIDEO");
  const driveType = item.parentReference.driveType?.toLowerCase();
  const provider = driveType === "personal" ? "onedrive_personal" : fallbackProvider === "microsoft_short_link" ? "onedrive_business" : fallbackProvider;
  return {
    provider,
    providerLabel: provider === "sharepoint" ? "SharePoint" : provider === "onedrive_personal" ? "OneDrive Personal" : "OneDrive for Business",
    shareUrl,
    driveId: item.parentReference.driveId,
    itemId: item.id,
    name: item.name?.trim() || "Video bài giảng",
    mimeType: mimeType || "video/mp4",
    size: Number.isFinite(item.size) ? Number(item.size) : null,
    durationMs: Number.isFinite(item.video?.duration) ? Number(item.video?.duration) : null,
    width: Number.isFinite(item.video?.width) ? Number(item.video?.width) : null,
    height: Number.isFinite(item.video?.height) ? Number(item.video?.height) : null,
    webUrl: item.webUrl || null,
  };
}

const graphSelect = encodeURIComponent("id,name,size,webUrl,file,video,parentReference,@microsoft.graph.downloadUrl");

export async function inspectMicrosoftShareVideo(shareUrl: string, fetcher: typeof fetch = fetch): Promise<MicrosoftVideoMetadata> {
  const parsed = parseMicrosoftShareUrl(shareUrl);
  if (!parsed) throw new MicrosoftGraphVideoError("Hãy dùng link chia sẻ HTTPS của OneDrive hoặc SharePoint.", 400, "INVALID_MICROSOFT_SHARE_URL");
  if (parsed.provider === "onedrive_personal") {
    throw new MicrosoftGraphVideoError("OneDrive Personal cần kết nối Microsoft dạng người dùng. Hiện hệ thống chỉ hỗ trợ OneDrive for Business và SharePoint.", 422, "ONEDRIVE_PERSONAL_REQUIRES_DELEGATED_AUTH");
  }
  const token = encodeMicrosoftSharingUrl(parsed.url);
  const item = await graphGet(`/shares/${encodeURIComponent(token)}/driveItem?$select=${graphSelect}`, fetcher);
  const metadata = videoMetadata(item, parsed.url, parsed.provider);
  if (metadata.provider === "onedrive_personal") {
    throw new MicrosoftGraphVideoError("OneDrive Personal cần kết nối Microsoft dạng người dùng. Hiện hệ thống chỉ hỗ trợ OneDrive for Business và SharePoint.", 422, "ONEDRIVE_PERSONAL_REQUIRES_DELEGATED_AUTH");
  }
  return metadata;
}

function trimPlaybackCache() {
  const now = Date.now();
  for (const [key, entry] of playbackCache) if (entry.expiresAt <= now) playbackCache.delete(key);
  while (playbackCache.size >= MAX_PLAYBACK_CACHE) playbackCache.delete(playbackCache.keys().next().value as string);
}

export async function resolveMicrosoftVideoPlayback(input: {
  shareUrl: string;
  driveId?: string | null;
  itemId?: string | null;
  forceRefresh?: boolean;
}, fetcher: typeof fetch = fetch): Promise<MicrosoftPlayback> {
  const parsed = parseMicrosoftShareUrl(input.shareUrl);
  if (!parsed) throw new MicrosoftGraphVideoError("Liên kết video Microsoft đã lưu không hợp lệ.", 422, "INVALID_MICROSOFT_SHARE_URL");
  const key = input.driveId && input.itemId ? `${input.driveId}:${input.itemId}` : parsed.url;
  trimPlaybackCache();
  const cached = playbackCache.get(key);
  if (!input.forceRefresh && cached && cached.expiresAt > Date.now()) return cached.value;
  const pending = playbackRequests.get(key);
  if (!input.forceRefresh && pending) return pending;

  const request = (async () => {
    let metadata: MicrosoftVideoMetadata;
    let item: GraphVideo;
    if (input.driveId && input.itemId) {
      const driveId = encodeURIComponent(input.driveId);
      const itemId = encodeURIComponent(input.itemId);
      item = await graphGet(`/drives/${driveId}/items/${itemId}?$select=${graphSelect}`, fetcher);
      metadata = videoMetadata(item, parsed.url, parsed.provider);
    } else {
      metadata = await inspectMicrosoftShareVideo(parsed.url, fetcher);
      item = await graphGet(`/drives/${encodeURIComponent(metadata.driveId)}/items/${encodeURIComponent(metadata.itemId)}?$select=${graphSelect}`, fetcher);
    }
    const playbackUrl = item["@microsoft.graph.downloadUrl"];
    if (!playbackUrl || !/^https:\/\//i.test(playbackUrl)) throw new MicrosoftGraphVideoError("Microsoft chưa cung cấp URL phát video cho file này.", 502, "MICROSOFT_PLAYBACK_URL_MISSING");
    const value = { ...metadata, playbackUrl, resolvedAt: new Date().toISOString() };
    playbackCache.set(key, { value, expiresAt: Date.now() + PLAYBACK_CACHE_MS });
    return value;
  })().finally(() => { playbackRequests.delete(key); });
  playbackRequests.set(key, request);
  return request;
}

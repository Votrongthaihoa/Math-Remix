import type { SupabaseClient } from "@supabase/supabase-js";
import { hlsOriginPath, hlsVaultFolderPath, hlsVideoId } from "./hls-vault.ts";
import { hlsUploadContentType, hlsUploadPath, MAX_HLS_UPLOAD_BYTES } from "./hls-upload.ts";
import { encodeMicrosoftSharingUrl, parseMicrosoftShareUrl, type MicrosoftShareProvider } from "./microsoft-share-url.ts";

const GRAPH_ROOT = "https://graph.microsoft.com/v1.0";
const DEFAULT_REDIRECT_URI = "https://www.mathremix.pro.vn/api/admin/microsoft/callback";
const CONNECTION_ID = 1;
const TOKEN_REFRESH_SKEW_MS = 2 * 60 * 1000;
const OAUTH_STATE_TTL_MS = 10 * 60 * 1000;
const GRAPH_SCOPES = [
  "openid",
  "profile",
  "offline_access",
  "https://graph.microsoft.com/User.Read",
  "https://graph.microsoft.com/Files.ReadWrite",
];
const DOWNLOAD_HOST_SUFFIXES = ["files.1drv.com", "1drv.com", "sharepoint.com", "sharepointonline.com"];

type StoredMicrosoftProvider = Exclude<MicrosoftShareProvider, "microsoft_short_link">;

type MicrosoftConfig = {
  tenantId: string;
  clientId: string;
  clientSecret: string;
  encryptionKey: CryptoKey;
  redirectUri: string;
};

type GraphConnectionRow = {
  id: number;
  tenant_id: string;
  provider_account_id: string;
  provider_principal: string | null;
  access_token_ciphertext: string;
  refresh_token_ciphertext: string;
  access_token_expires_at: string;
  scope: string;
};

type OAuthState = {
  connectedBy: string;
  returnTo: string;
  codeVerifier: string;
  expiresAt: number;
  nonce: string;
};

type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  error?: string;
  error_description?: string;
};

type GraphDriveItem = {
  id?: string;
  name?: string;
  size?: number;
  webUrl?: string;
  file?: { mimeType?: string };
  folder?: { childCount?: number };
  video?: { duration?: number; width?: number; height?: number };
  parentReference?: { driveId?: string };
  error?: { code?: string; message?: string };
};

export type MicrosoftGraphVideoMetadata = {
  provider: StoredMicrosoftProvider;
  providerLabel: string;
  shareUrl: string;
  name: string;
  mimeType: string;
  size: number | null;
  durationMs: number | null;
  width: number | null;
  height: number | null;
  playbackMode: "native";
  driveId: string;
  itemId: string;
  providerMetadata: Record<string, string | number | null>;
};

export class MicrosoftGraphError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 502, code = "MICROSOFT_GRAPH_ERROR") {
    super(message);
    this.name = "MicrosoftGraphError";
    this.status = status;
    this.code = code;
  }
}

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/=+$/g, "").replace(/\+/g, "-").replace(/\//g, "_");
}

function base64UrlToBytes(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function randomBase64Url(byteLength: number) {
  const bytes = new Uint8Array(byteLength);
  crypto.getRandomValues(bytes);
  return bytesToBase64Url(bytes);
}

async function encryptionKey(value: string) {
  let bytes: Uint8Array;
  try { bytes = base64UrlToBytes(value.trim()); }
  catch { throw new MicrosoftGraphError("Khóa mã hóa Microsoft không hợp lệ.", 503, "MICROSOFT_CONFIGURATION_REQUIRED"); }
  if (bytes.byteLength !== 32) throw new MicrosoftGraphError("Khóa mã hóa Microsoft phải có đúng 32 byte.", 503, "MICROSOFT_CONFIGURATION_REQUIRED");
  return crypto.subtle.importKey("raw", Uint8Array.from(bytes).buffer, "AES-GCM", false, ["encrypt", "decrypt"]);
}

async function config(): Promise<MicrosoftConfig> {
  const tenantId = process.env.MICROSOFT_TENANT_ID?.trim() ?? "";
  const clientId = process.env.MICROSOFT_CLIENT_ID?.trim() ?? "";
  const clientSecret = process.env.MICROSOFT_CLIENT_SECRET?.trim() ?? "";
  const keyValue = process.env.MICROSOFT_TOKEN_ENCRYPTION_KEY?.trim() ?? "";
  const redirectUri = process.env.MICROSOFT_REDIRECT_URI?.trim() || DEFAULT_REDIRECT_URI;
  if (!tenantId || !clientId || !clientSecret || !keyValue) {
    throw new MicrosoftGraphError("Máy chủ Microsoft Graph chưa được cấu hình đầy đủ.", 503, "MICROSOFT_CONFIGURATION_REQUIRED");
  }
  let parsedRedirect: URL;
  try { parsedRedirect = new URL(redirectUri); }
  catch { throw new MicrosoftGraphError("Redirect URI Microsoft không hợp lệ.", 503, "MICROSOFT_CONFIGURATION_REQUIRED"); }
  if (parsedRedirect.protocol !== "https:" || parsedRedirect.username || parsedRedirect.password) {
    throw new MicrosoftGraphError("Redirect URI Microsoft phải dùng HTTPS.", 503, "MICROSOFT_CONFIGURATION_REQUIRED");
  }
  return { tenantId, clientId, clientSecret, encryptionKey: await encryptionKey(keyValue), redirectUri: parsedRedirect.toString() };
}

async function encrypt(value: string, key: CryptoKey, purpose: string) {
  const iv = new Uint8Array(12);
  crypto.getRandomValues(iv);
  const ciphertext = await crypto.subtle.encrypt(
    { name: "AES-GCM", iv, additionalData: new TextEncoder().encode(purpose) },
    key,
    new TextEncoder().encode(value),
  );
  return `v1.${bytesToBase64Url(iv)}.${bytesToBase64Url(new Uint8Array(ciphertext))}`;
}

async function decrypt(value: string, key: CryptoKey, purpose: string) {
  const [version, ivValue, ciphertextValue] = value.split(".");
  if (version !== "v1" || !ivValue || !ciphertextValue) throw new Error("invalid ciphertext");
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: base64UrlToBytes(ivValue), additionalData: new TextEncoder().encode(purpose) },
    key,
    base64UrlToBytes(ciphertextValue),
  );
  return new TextDecoder().decode(plaintext);
}

function safeReturnTo(value: string | undefined) {
  const candidate = value?.trim() ?? "";
  return candidate.startsWith("/admin/") && !candidate.startsWith("//") && candidate.length <= 1000
    ? candidate
    : "/admin/content";
}

async function sha256Base64Url(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return bytesToBase64Url(new Uint8Array(digest));
}

export async function createMicrosoftAuthorizationUrl(connectedBy: string, returnTo?: string) {
  const settings = await config();
  const codeVerifier = randomBase64Url(48);
  const state: OAuthState = {
    connectedBy,
    returnTo: safeReturnTo(returnTo),
    codeVerifier,
    expiresAt: Date.now() + OAUTH_STATE_TTL_MS,
    nonce: randomBase64Url(18),
  };
  const encryptedState = await encrypt(JSON.stringify(state), settings.encryptionKey, "microsoft-oauth-state-v1");
  const authorize = new URL(`https://login.microsoftonline.com/${encodeURIComponent(settings.tenantId)}/oauth2/v2.0/authorize`);
  authorize.searchParams.set("client_id", settings.clientId);
  authorize.searchParams.set("response_type", "code");
  authorize.searchParams.set("redirect_uri", settings.redirectUri);
  authorize.searchParams.set("response_mode", "query");
  authorize.searchParams.set("scope", GRAPH_SCOPES.join(" "));
  authorize.searchParams.set("state", encryptedState);
  authorize.searchParams.set("code_challenge", await sha256Base64Url(codeVerifier));
  authorize.searchParams.set("code_challenge_method", "S256");
  authorize.searchParams.set("prompt", "select_account");
  return authorize.toString();
}

async function readOAuthState(value: string, settings: MicrosoftConfig): Promise<OAuthState> {
  try {
    const state = JSON.parse(await decrypt(value, settings.encryptionKey, "microsoft-oauth-state-v1")) as OAuthState;
    if (!state.connectedBy || !state.codeVerifier || !state.nonce || state.expiresAt < Date.now()) throw new Error("expired state");
    return { ...state, returnTo: safeReturnTo(state.returnTo) };
  } catch {
    throw new MicrosoftGraphError("Phiên kết nối Microsoft không hợp lệ hoặc đã hết hạn.", 400, "MICROSOFT_OAUTH_STATE_INVALID");
  }
}

async function tokenRequest(settings: MicrosoftConfig, parameters: Record<string, string>, fetcher: typeof fetch) {
  const body = new URLSearchParams({ client_id: settings.clientId, client_secret: settings.clientSecret, ...parameters });
  const response = await fetcher(`https://login.microsoftonline.com/${encodeURIComponent(settings.tenantId)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded", accept: "application/json" },
    body,
    cache: "no-store",
  });
  const payload = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !payload.access_token) {
    console.error("[microsoft-graph] token request rejected", { status: response.status, code: payload.error });
    throw new MicrosoftGraphError("Microsoft từ chối cấp phiên truy cập. Hãy kết nối lại tài khoản Microsoft.", 502, "MICROSOFT_TOKEN_REJECTED");
  }
  return payload;
}

async function loadConnection(admin: SupabaseClient) {
  const { data, error } = await admin.from("microsoft_graph_connections")
    .select("id,tenant_id,provider_account_id,provider_principal,access_token_ciphertext,refresh_token_ciphertext,access_token_expires_at,scope")
    .eq("id", CONNECTION_ID)
    .maybeSingle();
  if (error) {
    console.error("[microsoft-graph] connection lookup failed", { code: error.code, message: error.message });
    throw new MicrosoftGraphError("Kho kết nối Microsoft chưa sẵn sàng.", 503, "MICROSOFT_CONNECTION_STORE_UNAVAILABLE");
  }
  if (!data) throw new MicrosoftGraphError("Quản trị viên cần kết nối tài khoản Microsoft trước.", 409, "MICROSOFT_CONNECTION_REQUIRED");
  return data as GraphConnectionRow;
}

async function refreshAccessToken(admin: SupabaseClient, row: GraphConnectionRow, settings: MicrosoftConfig, fetcher: typeof fetch) {
  let refreshToken: string;
  try { refreshToken = await decrypt(row.refresh_token_ciphertext, settings.encryptionKey, "microsoft-refresh-token-v1"); }
  catch { throw new MicrosoftGraphError("Phiên Microsoft đã hỏng. Hãy kết nối lại tài khoản.", 409, "MICROSOFT_CONNECTION_REQUIRED"); }
  const token = await tokenRequest(settings, {
    grant_type: "refresh_token",
    refresh_token: refreshToken,
    scope: GRAPH_SCOPES.join(" "),
  }, fetcher);
  const nextRefreshToken = token.refresh_token || refreshToken;
  const expiresAt = new Date(Date.now() + Math.max(60, Number(token.expires_in) || 3600) * 1000).toISOString();
  const { error } = await admin.from("microsoft_graph_connections").update({
    access_token_ciphertext: await encrypt(token.access_token!, settings.encryptionKey, "microsoft-access-token-v1"),
    refresh_token_ciphertext: await encrypt(nextRefreshToken, settings.encryptionKey, "microsoft-refresh-token-v1"),
    access_token_expires_at: expiresAt,
    scope: token.scope || row.scope,
    updated_at: new Date().toISOString(),
  }).eq("id", CONNECTION_ID);
  if (error) throw new MicrosoftGraphError("Không thể cập nhật phiên Microsoft an toàn.", 503, "MICROSOFT_CONNECTION_STORE_UNAVAILABLE");
  return token.access_token!;
}

async function accessToken(admin: SupabaseClient, forceRefresh: boolean, fetcher: typeof fetch) {
  const settings = await config();
  const row = await loadConnection(admin);
  if (row.tenant_id !== settings.tenantId) throw new MicrosoftGraphError("Tài khoản Microsoft thuộc sai tenant.", 409, "MICROSOFT_CONNECTION_REQUIRED");
  if (!forceRefresh && new Date(row.access_token_expires_at).getTime() > Date.now() + TOKEN_REFRESH_SKEW_MS) {
    try { return await decrypt(row.access_token_ciphertext, settings.encryptionKey, "microsoft-access-token-v1"); }
    catch { /* Refresh below. */ }
  }
  return refreshAccessToken(admin, row, settings, fetcher);
}

async function graphFetch(admin: SupabaseClient, url: string, init: RequestInit, fetcher: typeof fetch) {
  let response = await fetcher(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${await accessToken(admin, false, fetcher)}` } });
  if (response.status !== 401) return response;
  void response.body?.cancel().catch(() => undefined);
  response = await fetcher(url, { ...init, headers: { ...init.headers, authorization: `Bearer ${await accessToken(admin, true, fetcher)}` } });
  return response;
}

function encodedGraphPath(path: string) {
  return path.split("/").map(encodeURIComponent).join("/");
}

function graphFailure(response: Response, fallback: string, payload: GraphDriveItem = {}) {
  const status = response.status >= 400 && response.status < 500 ? response.status : 502;
  return new MicrosoftGraphError(fallback, status, payload.error?.code || "MICROSOFT_HLS_UPLOAD_FAILED");
}

async function graphItemAtPath(path: string, admin: SupabaseClient, fetcher: typeof fetch) {
  const response = await graphFetch(admin, `${GRAPH_ROOT}/me/drive/root:/${encodedGraphPath(path)}:`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  }, fetcher);
  const payload = await response.json().catch(() => ({})) as GraphDriveItem;
  if (response.status === 404) return null;
  if (!response.ok) throw graphFailure(response, "Microsoft không thể đọc thư mục HLS.", payload);
  return payload;
}

async function graphRootId(admin: SupabaseClient, fetcher: typeof fetch) {
  const response = await graphFetch(admin, `${GRAPH_ROOT}/me/drive/root?$select=id`, {
    headers: { accept: "application/json" },
    cache: "no-store",
  }, fetcher);
  const payload = await response.json().catch(() => ({})) as GraphDriveItem;
  if (!response.ok || !payload.id) throw graphFailure(response, "Microsoft không thể mở OneDrive.", payload);
  return payload.id;
}

async function createGraphFolder(parentId: string, name: string, admin: SupabaseClient, fetcher: typeof fetch) {
  const url = parentId === "root"
    ? `${GRAPH_ROOT}/me/drive/root/children`
    : `${GRAPH_ROOT}/me/drive/items/${encodeURIComponent(parentId)}/children`;
  const response = await graphFetch(admin, url, {
    method: "POST",
    headers: { accept: "application/json", "content-type": "application/json" },
    body: JSON.stringify({
      name,
      folder: {},
      "@microsoft.graph.conflictBehavior": "fail",
    }),
    cache: "no-store",
  }, fetcher);
  const payload = await response.json().catch(() => ({})) as GraphDriveItem;
  if (response.status === 409) return null;
  if (!response.ok || !payload.id) throw graphFailure(response, "Microsoft không thể tạo thư mục HLS.", payload);
  return payload.id;
}

/** Ensure the stable VideoVault/<videoId>/single-rendition folder exists. */
export async function ensureMicrosoftGraphHlsFolders(videoId: string, admin: SupabaseClient, fetcher: typeof fetch = fetch) {
  if (!hlsVideoId(videoId)) throw new MicrosoftGraphError("Mã video HLS không hợp lệ.", 400, "INVALID_HLS_VIDEO_ID");
  const folderPath = hlsVaultFolderPath(videoId);
  const rootId = await graphRootId(admin, fetcher);
  let parentId = rootId;
  let currentPath = "";
  for (const part of folderPath.split("/")) {
    currentPath = currentPath ? `${currentPath}/${part}` : part;
    const existing = await graphItemAtPath(currentPath, admin, fetcher);
    if (existing?.id) {
      if (!existing.folder) throw new MicrosoftGraphError("Một đường dẫn HLS trên OneDrive không phải thư mục.", 409, "MICROSOFT_HLS_PATH_CONFLICT");
      parentId = existing.id;
      continue;
    }
    const createdId = await createGraphFolder(parentId, part, admin, fetcher);
    if (createdId) {
      parentId = createdId;
      continue;
    }
    const conflicted = await graphItemAtPath(currentPath, admin, fetcher);
    if (!conflicted?.id || !conflicted.folder) throw new MicrosoftGraphError("Microsoft không thể xác nhận thư mục HLS.", 409, "MICROSOFT_HLS_PATH_CONFLICT");
    parentId = conflicted.id;
  }
  return { folderPath, ready: true as const };
}

/** Upload one already-encoded HLS file without persisting a Graph URL or token. */
export async function uploadMicrosoftGraphHlsFile(videoId: string, relativePath: string, bytes: ArrayBuffer, admin: SupabaseClient, fetcher: typeof fetch = fetch) {
  const path = hlsUploadPath(videoId, relativePath);
  if (!bytes.byteLength || bytes.byteLength > MAX_HLS_UPLOAD_BYTES) throw new MicrosoftGraphError("File HLS vượt quá giới hạn cho phép.", 413, "HLS_FILE_TOO_LARGE");
  const originPath = hlsOriginPath(videoId, path);
  const response = await graphFetch(admin, `${GRAPH_ROOT}/me/drive/root:/${encodedGraphPath(originPath)}:/content`, {
    method: "PUT",
    headers: { accept: "application/json", "content-type": hlsUploadContentType(path) },
    body: bytes as unknown as BodyInit,
    cache: "no-store",
  }, fetcher);
  const payload = await response.json().catch(() => ({})) as GraphDriveItem;
  if (!response.ok) throw graphFailure(response, "Microsoft từ chối file HLS.", payload);
  return { path, size: bytes.byteLength, uploaded: true as const };
}

export async function completeMicrosoftAuthorization(admin: SupabaseClient, code: string, stateValue: string, fetcher: typeof fetch = fetch) {
  const settings = await config();
  const state = await readOAuthState(stateValue, settings);
  const { data: profile } = await admin.from("profiles").select("id,role,status,account_status").eq("id", state.connectedBy).maybeSingle();
  if (!profile || profile.role !== "admin" || profile.status !== "active" || profile.account_status !== "active") {
    throw new MicrosoftGraphError("Tài khoản khởi tạo kết nối không còn quyền quản trị hoạt động.", 403, "MICROSOFT_ADMIN_REQUIRED");
  }
  const token = await tokenRequest(settings, {
    grant_type: "authorization_code",
    code,
    redirect_uri: settings.redirectUri,
    code_verifier: state.codeVerifier,
    scope: GRAPH_SCOPES.join(" "),
  }, fetcher);
  if (!token.refresh_token) throw new MicrosoftGraphError("Microsoft không cấp refresh token. Hãy kết nối lại và chấp thuận offline_access.", 502, "MICROSOFT_REFRESH_TOKEN_MISSING");
  const meResponse = await fetcher(`${GRAPH_ROOT}/me?$select=id,userPrincipalName,mail`, {
    headers: { authorization: `Bearer ${token.access_token}`, accept: "application/json" },
    cache: "no-store",
  });
  const me = await meResponse.json().catch(() => ({})) as { id?: string; userPrincipalName?: string; mail?: string };
  if (!meResponse.ok || !me.id) throw new MicrosoftGraphError("Không thể đọc danh tính tài khoản Microsoft đã kết nối.", 502, "MICROSOFT_IDENTITY_FAILED");
  const now = new Date().toISOString();
  const { error } = await admin.from("microsoft_graph_connections").upsert({
    id: CONNECTION_ID,
    tenant_id: settings.tenantId,
    provider_account_id: me.id,
    provider_principal: me.userPrincipalName || me.mail || null,
    access_token_ciphertext: await encrypt(token.access_token!, settings.encryptionKey, "microsoft-access-token-v1"),
    refresh_token_ciphertext: await encrypt(token.refresh_token, settings.encryptionKey, "microsoft-refresh-token-v1"),
    access_token_expires_at: new Date(Date.now() + Math.max(60, Number(token.expires_in) || 3600) * 1000).toISOString(),
    scope: token.scope || GRAPH_SCOPES.join(" "),
    connected_by: state.connectedBy,
    connected_at: now,
    updated_at: now,
  }, { onConflict: "id" });
  if (error) {
    console.error("[microsoft-graph] connection save failed", { code: error.code, message: error.message });
    throw new MicrosoftGraphError("Không thể lưu kết nối Microsoft an toàn.", 503, "MICROSOFT_CONNECTION_STORE_UNAVAILABLE");
  }
  return { returnTo: state.returnTo, principal: me.userPrincipalName || me.mail || "Microsoft" };
}

function storedProvider(primary: MicrosoftShareProvider, webUrl?: string): StoredMicrosoftProvider {
  const resolved = webUrl ? parseMicrosoftShareUrl(webUrl)?.provider : undefined;
  const candidate = resolved && resolved !== "microsoft_short_link" ? resolved : primary;
  return candidate === "microsoft_short_link" ? "onedrive_personal" : candidate;
}

function providerLabel(provider: StoredMicrosoftProvider) {
  if (provider === "sharepoint") return "SharePoint";
  if (provider === "onedrive_business") return "OneDrive for Business";
  return "OneDrive Personal";
}

export async function inspectMicrosoftGraphVideo(shareUrl: string, admin: SupabaseClient, fetcher: typeof fetch = fetch): Promise<MicrosoftGraphVideoMetadata> {
  const parsed = parseMicrosoftShareUrl(shareUrl);
  if (!parsed) throw new MicrosoftGraphError("Hãy dùng liên kết chia sẻ HTTPS của OneDrive hoặc SharePoint.", 400, "INVALID_MICROSOFT_SHARE_URL");
  const shareId = encodeMicrosoftSharingUrl(parsed.url);
  const requestUrl = `${GRAPH_ROOT}/shares/${encodeURIComponent(shareId)}/driveItem?$select=id,name,size,webUrl,file,video,parentReference`;
  const response = await graphFetch(admin, requestUrl, {
    headers: { accept: "application/json", prefer: "redeemSharingLinkIfNecessary" },
    cache: "no-store",
  }, fetcher);
  const item = await response.json().catch(() => ({})) as GraphDriveItem;
  if (!response.ok) {
    console.error("[microsoft-graph] share resolution rejected", { status: response.status, code: item.error?.code });
    throw new MicrosoftGraphError("Microsoft không cho tài khoản đã kết nối đọc link này. Hãy kiểm tra link và quyền chia sẻ.", response.status === 404 ? 404 : 422, "MICROSOFT_SHARE_UNAVAILABLE");
  }
  const driveId = item.parentReference?.driveId?.trim() ?? "";
  const itemId = item.id?.trim() ?? "";
  const mimeType = item.file?.mimeType?.trim().toLowerCase() ?? "";
  if (!driveId || !itemId) throw new MicrosoftGraphError("Microsoft không trả về định danh ổ đĩa ổn định.", 422, "MICROSOFT_ITEM_ID_MISSING");
  if (!mimeType.startsWith("video/")) throw new MicrosoftGraphError("Liên kết Microsoft không trỏ tới file video.", 422, "MICROSOFT_NOT_VIDEO");
  const provider = storedProvider(parsed.provider, item.webUrl);
  const durationMs = Number.isFinite(item.video?.duration) ? Number(item.video?.duration) : null;
  const width = Number.isFinite(item.video?.width) ? Number(item.video?.width) : null;
  const height = Number.isFinite(item.video?.height) ? Number(item.video?.height) : null;
  const size = Number.isFinite(item.size) ? Number(item.size) : null;
  const name = item.name?.trim() || "Video Microsoft";
  return {
    provider,
    providerLabel: providerLabel(provider),
    shareUrl: parsed.url,
    name,
    mimeType,
    size,
    durationMs,
    width,
    height,
    playbackMode: "native",
    driveId,
    itemId,
    providerMetadata: { name, mimeType, size, durationMs, width, height, webUrl: item.webUrl || "" },
  };
}

export function isAllowedMicrosoftDownloadUrl(value: string) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "https:" || parsed.username || parsed.password || parsed.port) return false;
    const host = parsed.hostname.toLowerCase().replace(/\.$/, "");
    return DOWNLOAD_HOST_SUFFIXES.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
  } catch { return false; }
}

export async function resolveMicrosoftGraphPlayback(driveId: string, itemId: string, admin: SupabaseClient, fetcher: typeof fetch = fetch) {
  if (!driveId.trim() || !itemId.trim()) throw new MicrosoftGraphError("Video Microsoft thiếu định danh phát.", 422, "MICROSOFT_ITEM_ID_MISSING");
  const requestUrl = `${GRAPH_ROOT}/drives/${encodeURIComponent(driveId)}/items/${encodeURIComponent(itemId)}/content`;
  const response = await graphFetch(admin, requestUrl, {
    redirect: "manual",
    headers: { accept: "video/*,application/octet-stream;q=0.9" },
    cache: "no-store",
  }, fetcher);
  const location = response.headers.get("location") ?? "";
  const redirected = response.status >= 300 && response.status < 400 && location;
  void response.body?.cancel().catch(() => undefined);
  if (!redirected || !isAllowedMicrosoftDownloadUrl(location)) {
    throw new MicrosoftGraphError("Microsoft không trả về URL phát video hợp lệ.", 502, "MICROSOFT_PLAYBACK_URL_REJECTED");
  }
  return location;
}

export async function resolveMicrosoftGraphPathPlayback(path: string, admin: SupabaseClient, fetcher: typeof fetch = fetch) {
  const normalized = path.replace(/^\/+|\/+$/g, "");
  if (!normalized || normalized.length > 1000 || normalized.split("/").some(part => !part || part === "." || part === ".." || /[\\\0\u0000-\u001f\u007f]/.test(part))) {
    throw new MicrosoftGraphError("Đường dẫn OneDrive không hợp lệ.", 400, "MICROSOFT_PATH_INVALID");
  }
  const encodedPath = normalized.split("/").map(encodeURIComponent).join("/");
  const response = await graphFetch(admin, `${GRAPH_ROOT}/me/drive/root:/${encodedPath}:/content`, { redirect: "manual", headers: { accept: "*/*" }, cache: "no-store" }, fetcher);
  const location = response.headers.get("location") ?? "";
  const redirected = response.status >= 300 && response.status < 400 && location;
  void response.body?.cancel().catch(() => undefined);
  if (!redirected || !isAllowedMicrosoftDownloadUrl(location)) throw new MicrosoftGraphError("Microsoft không trả về URL phát hợp lệ.", 502, "MICROSOFT_PLAYBACK_URL_REJECTED");
  return location;
}

export async function microsoftConnectionStatus(admin: SupabaseClient) {
  try {
    const row = await loadConnection(admin);
    return { connected: true as const, principal: row.provider_principal };
  } catch (error) {
    if (error instanceof MicrosoftGraphError && error.code === "MICROSOFT_CONNECTION_REQUIRED") return { connected: false as const, principal: null };
    throw error;
  }
}

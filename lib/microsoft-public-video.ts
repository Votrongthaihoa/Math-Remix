import { parseMicrosoftShareUrl, type MicrosoftShareProvider } from "./microsoft-share-url.ts";

export type MicrosoftPublicPlaybackMode = "native" | "embed";

export type MicrosoftPublicVideoMetadata = {
  provider: MicrosoftShareProvider;
  providerLabel: string;
  shareUrl: string;
  playbackUrl: string;
  playbackMode: MicrosoftPublicPlaybackMode;
  name: string;
  mimeType: string;
  size: number | null;
  durationMs: null;
  width: null;
  height: null;
};

type PlaybackCandidate = {
  url: string;
  mode: MicrosoftPublicPlaybackMode;
};

const MAX_REDIRECTS = 6;
const VIDEO_EXTENSION = /\.(?:mp4|m4v|mov|webm|ogv|avi|wmv|mkv)(?:$|[?#])/i;
const MICROSOFT_PUBLIC_HOSTS = [
  "1drv.ms",
  "onedrive.live.com",
  "sharepoint.com",
  "sharepointonline.com",
  "1drv.com",
  "files.1drv.com",
  "storage.live.com",
];
const MICROSOFT_SIGN_IN_HOSTS = ["login.live.com", "login.microsoftonline.com"];

export class MicrosoftPublicVideoError extends Error {
  status: number;
  code: string;

  constructor(message: string, status = 422, code = "MICROSOFT_PUBLIC_VIDEO_ERROR") {
    super(message);
    this.name = "MicrosoftPublicVideoError";
    this.status = status;
    this.code = code;
  }
}

function supportedRedirectHost(hostname: string) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return MICROSOFT_PUBLIC_HOSTS.some(suffix => host === suffix || host.endsWith(`.${suffix}`));
}

function playbackCandidate(value: string): PlaybackCandidate {
  const parsed = parseMicrosoftShareUrl(value);
  if (!parsed) {
    throw new MicrosoftPublicVideoError(
      "Hãy dùng liên kết chia sẻ HTTPS của OneDrive hoặc SharePoint.",
      400,
      "INVALID_MICROSOFT_SHARE_URL",
    );
  }

  const url = new URL(parsed.url);
  if (url.hostname.toLowerCase() === "onedrive.live.com") {
    if (/^\/embed\/?$/i.test(url.pathname)) return { url: url.toString(), mode: "embed" };
    if (!/^\/download\/?$/i.test(url.pathname)) {
      const resourceId = url.searchParams.get("resid") || url.searchParams.get("id");
      if (resourceId) {
        const download = new URL("https://onedrive.live.com/download");
        download.searchParams.set("resid", resourceId);
        const authKey = url.searchParams.get("authkey");
        if (authKey) download.searchParams.set("authkey", authKey);
        return { url: download.toString(), mode: "native" };
      }
    }
  }

  url.searchParams.set("download", "1");
  return { url: url.toString(), mode: "native" };
}

function cancelBody(response: Response) {
  void response.body?.cancel().catch(() => undefined);
}

async function requestFollowingMicrosoftRedirects(url: string, fetcher: typeof fetch) {
  let current = new URL(url);
  for (let redirectCount = 0; redirectCount <= MAX_REDIRECTS; redirectCount += 1) {
    if (MICROSOFT_SIGN_IN_HOSTS.some(host => current.hostname.toLowerCase() === host || current.hostname.toLowerCase().endsWith(`.${host}`))) {
      throw new MicrosoftPublicVideoError(
        "Video chưa được chia sẻ công khai. Trong OneDrive, hãy chọn ‘Anyone with the link’ rồi dán lại liên kết.",
        422,
        "MICROSOFT_PUBLIC_LINK_REQUIRED",
      );
    }
    if (!supportedRedirectHost(current.hostname)) {
      throw new MicrosoftPublicVideoError(
        "Liên kết Microsoft chuyển hướng tới máy chủ không được hỗ trợ.",
        422,
        "MICROSOFT_PUBLIC_REDIRECT_REJECTED",
      );
    }
    const response = await fetcher(current, {
      method: "GET",
      redirect: "manual",
      headers: { accept: "video/*,application/octet-stream;q=0.9,text/html;q=0.2" },
      cache: "no-store",
    });
    if (response.status < 300 || response.status >= 400) return { response, finalUrl: current.toString() };
    const location = response.headers.get("location");
    cancelBody(response);
    if (!location) break;
    current = new URL(location, current);
  }
  throw new MicrosoftPublicVideoError(
    "Liên kết Microsoft chuyển hướng quá nhiều lần.",
    422,
    "MICROSOFT_PUBLIC_REDIRECT_LIMIT",
  );
}

function filenameFromHeaders(response: Response, fallbackUrl: string) {
  const disposition = response.headers.get("content-disposition") ?? "";
  const encoded = disposition.match(/filename\*=UTF-8''([^;]+)/i)?.[1];
  if (encoded) {
    try { return decodeURIComponent(encoded).trim(); }
    catch { /* Fall back to the regular filename or URL. */ }
  }
  const quoted = disposition.match(/filename="([^"]+)"/i)?.[1];
  if (quoted?.trim()) return quoted.trim();
  const unquoted = disposition.match(/filename=([^;]+)/i)?.[1];
  if (unquoted?.trim()) return unquoted.trim();
  const pathname = new URL(fallbackUrl).pathname;
  const lastSegment = pathname.split("/").filter(Boolean).pop();
  if (lastSegment && VIDEO_EXTENSION.test(lastSegment)) {
    try { return decodeURIComponent(lastSegment); }
    catch { return lastSegment; }
  }
  return "Video OneDrive";
}

function providerLabel(provider: MicrosoftShareProvider) {
  if (provider === "sharepoint") return "SharePoint";
  if (provider === "onedrive_business") return "OneDrive for Business";
  if (provider === "onedrive_personal") return "OneDrive Personal";
  return "OneDrive";
}

function publicContentLooksPlayable(response: Response, mode: MicrosoftPublicPlaybackMode, filename: string) {
  if (!response.ok && response.status !== 206) return false;
  const contentType = (response.headers.get("content-type") ?? "").toLowerCase();
  if (mode === "embed") return contentType.includes("text/html");
  if (contentType.startsWith("video/")) return true;
  return contentType.includes("application/octet-stream") && VIDEO_EXTENSION.test(filename);
}

export function resolvePublicMicrosoftPlayback(value: string) {
  return playbackCandidate(value);
}

export async function inspectPublicMicrosoftVideo(value: string, fetcher: typeof fetch = fetch): Promise<MicrosoftPublicVideoMetadata> {
  const parsed = parseMicrosoftShareUrl(value);
  if (!parsed) {
    throw new MicrosoftPublicVideoError(
      "Hãy dùng liên kết chia sẻ HTTPS của OneDrive hoặc SharePoint.",
      400,
      "INVALID_MICROSOFT_SHARE_URL",
    );
  }

  let candidate = playbackCandidate(parsed.url);
  let probe = await requestFollowingMicrosoftRedirects(candidate.url, fetcher);
  let filename = filenameFromHeaders(probe.response, probe.finalUrl);

  if (!publicContentLooksPlayable(probe.response, candidate.mode, filename) && parsed.provider === "microsoft_short_link") {
    const resolvedCandidate = playbackCandidate(probe.finalUrl);
    if (resolvedCandidate.url !== candidate.url) {
      cancelBody(probe.response);
      candidate = resolvedCandidate;
      probe = await requestFollowingMicrosoftRedirects(candidate.url, fetcher);
      filename = filenameFromHeaders(probe.response, probe.finalUrl);
    }
  }

  const playable = publicContentLooksPlayable(probe.response, candidate.mode, filename);
  const mimeType = (probe.response.headers.get("content-type") ?? "").split(";", 1)[0].trim().toLowerCase();
  const contentLength = Number(probe.response.headers.get("content-length"));
  cancelBody(probe.response);

  if (!playable) {
    if (probe.response.status === 401 || probe.response.status === 403 || mimeType.includes("text/html")) {
      throw new MicrosoftPublicVideoError(
        "Video chưa được chia sẻ công khai. Trong OneDrive, hãy chọn ‘Anyone with the link’ rồi dán lại liên kết.",
        422,
        "MICROSOFT_PUBLIC_LINK_REQUIRED",
      );
    }
    throw new MicrosoftPublicVideoError(
      "Liên kết công khai này không trả về một file video có thể phát.",
      422,
      "MICROSOFT_PUBLIC_NOT_VIDEO",
    );
  }

  return {
    provider: parsed.provider,
    providerLabel: providerLabel(parsed.provider),
    shareUrl: parsed.url,
    playbackUrl: candidate.url,
    playbackMode: candidate.mode,
    name: filename,
    mimeType: mimeType || (candidate.mode === "embed" ? "text/html" : "video/mp4"),
    size: Number.isFinite(contentLength) && contentLength >= 0 ? contentLength : null,
    durationMs: null,
    width: null,
    height: null,
  };
}

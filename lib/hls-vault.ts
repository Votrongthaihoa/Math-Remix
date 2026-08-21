export function hlsVideoId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
}

// A normal player requests a small burst at startup and then roughly one
// segment per HLS duration. Bulk downloaders consume the burst immediately;
// the refill rate then makes the gateway reject sustained parallel fetching.
export const HLS_PLAYBACK_RATE_LIMIT = { capacity: 48, refillSeconds: 4 } as const;

function safeRelativePath(value: string) {
  if (!value || value.length > 800 || value.includes("\\") || value.includes("\0")) return false;
  const parts = value.split("/");
  return !parts.some(part => !part || part === "." || part === ".." || /[\u0000-\u001f\u007f:]/.test(part));
}

function normalizePath(value: string) {
  const output: string[] = [];
  for (const part of value.split("/")) {
    if (!part || part === ".") continue;
    if (part === "..") {
      if (!output.length) throw new Error("HLS path escapes video root");
      output.pop();
    } else output.push(part);
  }
  return output.join("/");
}

function encodedPath(value: string) {
  return value.split("/").map(encodeURIComponent).join("/");
}

export function rewriteHlsManifest(text: string, resourceId: string, currentRelative: string, token: string) {
  const currentParts = currentRelative.split("/");
  currentParts.pop();
  const currentDir = currentParts.join("/");
  const tokenQuery = `t=${encodeURIComponent(token)}`;
  const mapUri = (value: string) => {
    const uri = value.trim();
    if (/^https:\/\/hls-key\.invalid\/key\//i.test(uri)) return `/api/hls/${encodeURIComponent(resourceId)}/key?${tokenQuery}`;
    if (/^[a-z][a-z0-9+.-]*:/i.test(uri) || uri.startsWith("//")) throw new Error("External HLS URI is not allowed");
    const clean = uri.split("#", 1)[0].split("?", 1)[0];
    const resolved = normalizePath(`${currentDir}/${clean}`);
    if (!safeRelativePath(resolved)) throw new Error("Unsafe HLS URI");
    return `/api/hls/${encodeURIComponent(resourceId)}/${encodedPath(resolved)}?${tokenQuery}`;
  };
  return text.split(/\r?\n/).map(line => {
    if (!line) return line;
    if (line.startsWith("#")) return line.replace(/URI="([^"]+)"/g, (_match, uri: string) => `URI="${mapUri(uri)}"`);
    return mapUri(line);
  }).join("\n");
}

export function hlsOriginPath(videoId: string, relativePath: string) {
  const clean = relativePath.replace(/^\/+/, "");
  if (!hlsVideoId(videoId) || !clean || clean.length > 800 || clean.includes("\\") || clean.includes("\0")) throw new Error("Invalid HLS path");
  const parts = clean.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || /[\u0000-\u001f\u007f:]/.test(part))) throw new Error("Invalid HLS path");
  const root = (process.env.ONEDRIVE_HLS_ROOT || "VideoVault").trim().replace(/^\/+|\/+$/g, "") || "VideoVault";
  return `${root}/${videoId}/${parts.join("/")}`;
}

export function hlsVaultFolderPath(videoId: string) {
  if (!hlsVideoId(videoId)) throw new Error("Invalid HLS video id");
  const root = (process.env.ONEDRIVE_HLS_ROOT || "VideoVault").trim().replace(/^\/+|\/+$/g, "") || "VideoVault";
  if (!safeRelativePath(root)) throw new Error("Invalid HLS root");
  return `${root}/${videoId}`;
}

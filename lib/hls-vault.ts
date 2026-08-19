export function hlsVideoId(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_-]{1,80}$/.test(value) ? value : null;
}

export function hlsOriginPath(videoId: string, relativePath: string) {
  const clean = relativePath.replace(/^\/+/, "");
  if (!hlsVideoId(videoId) || !clean || clean.length > 800 || clean.includes("\\") || clean.includes("\0")) throw new Error("Invalid HLS path");
  const parts = clean.split("/");
  if (parts.some(part => !part || part === "." || part === ".." || /[\u0000-\u001f\u007f:]/.test(part))) throw new Error("Invalid HLS path");
  const root = (process.env.ONEDRIVE_HLS_ROOT || "VideoVault").trim().replace(/^\/+|\/+$/g, "") || "VideoVault";
  return `${root}/${videoId}/${parts.join("/")}`;
}

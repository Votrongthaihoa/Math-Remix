import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMicrosoftGraphPathPlayback } from "./microsoft-graph-server";
import { hlsOriginPath, hlsVideoId } from "./hls-vault";
export { hlsOriginPath, hlsVideoId } from "./hls-vault";

function hlsRoot() {
  return (process.env.ONEDRIVE_HLS_ROOT || "VideoVault").trim().replace(/^\/+|\/+$/g, "") || "VideoVault";
}

export async function getHlsOriginRedirect(videoId: string, relativePath: string, admin: SupabaseClient) {
  return resolveMicrosoftGraphPathPlayback(hlsOriginPath(videoId, relativePath), admin);
}

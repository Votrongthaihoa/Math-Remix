import type { SupabaseClient } from "@supabase/supabase-js";
import { resolveMicrosoftGraphPathPlayback } from "./microsoft-graph-server";
import { hlsOriginPath } from "./hls-vault";
export { hlsOriginPath, hlsVideoId } from "./hls-vault";

export async function getHlsOriginRedirect(videoId: string, relativePath: string, admin: SupabaseClient) {
  return resolveMicrosoftGraphPathPlayback(hlsOriginPath(videoId, relativePath), admin);
}

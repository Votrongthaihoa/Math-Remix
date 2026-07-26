import { createClient, type SupabaseClient } from "@supabase/supabase-js";

// One place to read the content-server configuration.
//
// VIDEO_TOKEN_SECRET used to fall back to SUPABASE_SERVICE_ROLE_KEY. A
// deployment that simply forgot the variable kept working while encrypting
// every content token with the database's full-access key: self-consistent,
// silent, and impossible to notice from the outside. Missing configuration is
// now refused, and the specific variable is named in the server log so the
// cause is visible without guesswork.
export function contentServer():
  | { ok: true; admin: SupabaseClient; tokenSecret: string }
  | { ok: false; response: Response } {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tokenSecret = process.env.VIDEO_TOKEN_SECRET;

  if (!url || !serviceKey || !tokenSecret) {
    const missing = ([
      ["NEXT_PUBLIC_SUPABASE_URL", url],
      ["SUPABASE_SERVICE_ROLE_KEY", serviceKey],
      ["VIDEO_TOKEN_SECRET", tokenSecret],
    ] as const).filter(([, value]) => !value).map(([name]) => name);
    console.error(`[content-server] Thiếu biến môi trường bắt buộc: ${missing.join(", ")}`);
    return {
      ok: false,
      response: Response.json({ error: "Chưa cấu hình máy chủ nội dung." }, { status: 503, headers: { "cache-control": "private, no-store" } }),
    };
  }

  return { ok: true, admin: createClient(url, serviceKey, { auth: { persistSession: false } }), tokenSecret };
}

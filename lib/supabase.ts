import { createClient } from "@supabase/supabase-js";

const browserEnv = (import.meta as ImportMeta & {
  env?: Record<string, string | undefined>;
}).env;

const url = browserEnv?.NEXT_PUBLIC_SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const key = browserEnv?.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY ?? "";

export const supabase = url && key ? createClient(url, key) : null;

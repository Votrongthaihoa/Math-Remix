import app from "../worker/app.ts";

type VercelPlatformEnv = {
  DATA_MODE: string;
  LEGACY_API_ORIGIN: string;
  PUBLIC_SIGNUP_ENABLED: string;
  OPERATIONS_INTEGRATIONS_ENABLED: string;
  TURNSTILE_HOSTNAMES: string;
  TURNSTILE_SECRET: string;
  SUPABASE_URL: string;
  SUPABASE_PUBLISHABLE_KEY: string;
};

function runtimeEnv(): VercelPlatformEnv {
  return {
    DATA_MODE: process.env.DATA_MODE ?? "preview",
    LEGACY_API_ORIGIN: process.env.LEGACY_API_ORIGIN ?? "",
    PUBLIC_SIGNUP_ENABLED: process.env.PUBLIC_SIGNUP_ENABLED ?? "true",
    OPERATIONS_INTEGRATIONS_ENABLED:
      process.env.OPERATIONS_INTEGRATIONS_ENABLED ?? "true",
    TURNSTILE_HOSTNAMES: process.env.TURNSTILE_HOSTNAMES ?? "",
    TURNSTILE_SECRET: process.env.TURNSTILE_SECRET ?? "",
    SUPABASE_URL: process.env.SUPABASE_URL ?? "",
    SUPABASE_PUBLISHABLE_KEY:
      process.env.SUPABASE_PUBLISHABLE_KEY ?? "",
  };
}

function workerRequest(request: Request) {
  const url = new URL(request.url);
  const forwardedPath = url.searchParams.get("path")?.replace(/^\/+/, "") ?? "";
  url.pathname = `/api/${forwardedPath}`;
  url.searchParams.delete("path");
  return new Request(url, request);
}

const handler = {
  fetch(request: Request) {
    return app.fetch(workerRequest(request), runtimeEnv());
  },
};

export default handler;

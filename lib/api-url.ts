const PRODUCTION_API_ORIGIN = "https://api.mathremix.pro.vn";

function configuredApiOrigin() {
  const value = process.env.NEXT_PUBLIC_API_URL?.trim();
  if (!value) return "";
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return "";
    return url.origin;
  } catch {
    return "";
  }
}

function productionBrowserApiOrigin() {
  if (typeof window === "undefined") return "";
  const hostname = window.location.hostname.toLowerCase();
  return hostname === "mathremix.pro.vn" || hostname.endsWith(".mathremix.pro.vn")
    ? PRODUCTION_API_ORIGIN
    : "";
}

/**
 * Route application API calls through the dedicated production hostname.
 * Local development remains same-origin unless NEXT_PUBLIC_API_URL is set.
 */
export function apiRequestUrl(input: RequestInfo | URL): RequestInfo | URL {
  if (typeof input !== "string" || !/^\/api(?:[/?#]|$)/.test(input)) return input;
  const origin = configuredApiOrigin() || productionBrowserApiOrigin();
  return origin ? `${origin}${input}` : input;
}

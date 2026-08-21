import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

const API_HOSTNAME = "api.mathremix.pro.vn";
const HLS_ENCODER_PATH = "/admin/hls-vault";
const HLS_ENCODER_HEADERS = {
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-opener-policy": "same-origin",
};

const PRODUCTION_WEB_ORIGINS = new Set([
  "https://mathremix.pro.vn",
  "https://www.mathremix.pro.vn",
]);

const CORS_HEADERS = {
  "access-control-allow-headers": "Authorization, Content-Type, Range, X-Supabase-Access-Token",
  "access-control-allow-methods": "GET, HEAD, POST, PUT, PATCH, DELETE, OPTIONS",
  "access-control-allow-credentials": "true",
  "access-control-max-age": "86400",
};

function isAllowedOrigin(origin: string) {
  if (PRODUCTION_WEB_ORIGINS.has(origin)) return true;
  try {
    const url = new URL(origin);
    return (url.protocol === "http:" || url.protocol === "https:")
      && (url.hostname === "localhost" || url.hostname === "127.0.0.1");
  } catch {
    return false;
  }
}

function addCorsHeaders(response: NextResponse, origin: string) {
  response.headers.set("access-control-allow-origin", origin);
  response.headers.set("vary", "Origin");
  for (const [name, value] of Object.entries(CORS_HEADERS)) response.headers.set(name, value);
  return response;
}

function isApiPath(pathname: string) {
  return pathname === "/api" || pathname.startsWith("/api/");
}

function apiHostNotFound() {
  return NextResponse.json({ error: "Not Found" }, {
    status: 404,
    headers: {
      "cache-control": "private, no-store",
      "content-security-policy": "default-src 'none'; frame-ancestors 'none'",
      "x-content-type-options": "nosniff",
    },
  });
}

function isolatedHlsEncoderPage(request: NextRequest) {
  return request.method === "GET"
    && request.nextUrl.pathname === HLS_ENCODER_PATH
    && request.nextUrl.searchParams.get("isolated") === "1";
}

export function proxy(request: NextRequest) {
  const apiPath = isApiPath(request.nextUrl.pathname);

  // The dedicated API hostname must never render the website, login, account
  // recovery, static assets, or any other application page.
  if (request.nextUrl.hostname.toLowerCase() === API_HOSTNAME && !apiPath) {
    return apiHostNotFound();
  }
  if (isolatedHlsEncoderPage(request)) {
    const response = NextResponse.next();
    for (const [name, value] of Object.entries(HLS_ENCODER_HEADERS)) response.headers.set(name, value);
    return response;
  }
  if (!apiPath) return NextResponse.next();

  const origin = request.headers.get("origin") ?? "";

  // Leave non-browser OPTIONS requests to each route's existing handler.
  if (!origin) return NextResponse.next();
  if (!isAllowedOrigin(origin)) {
    if (request.method === "OPTIONS") {
      return NextResponse.json({ error: "Origin không được phép." }, {
        status: 403,
        headers: { "cache-control": "private, no-store", vary: "Origin" },
      });
    }
    return NextResponse.next();
  }

  if (request.method === "OPTIONS") {
    return addCorsHeaders(new NextResponse(null, { status: 204 }), origin);
  }
  return addCorsHeaders(NextResponse.next(), origin);
}

export const config = {
  matcher: "/:path*",
};

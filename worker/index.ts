/** Cloudflare Worker entry point for the vinext-starter template. */
import { handleImageOptimization, DEFAULT_DEVICE_SIZES, DEFAULT_IMAGE_SIZES } from "vinext/server/image-optimization";
import handler from "vinext/server/app-router-entry";
import type { D1Database } from "@cloudflare/workers-types";

interface Env {
  // vinext drives ASSETS with DOM Request/Response, not the workers-types
  // Fetcher, whose Request carries Cloudflare-only properties.
  ASSETS: { fetch(request: Request): Promise<Response> };
  DB: D1Database;
  IMAGES: {
    input(stream: ReadableStream): {
      transform(options: Record<string, unknown>): {
        output(options: { format: string; quality: number }): Promise<{ response(): Response }>;
      };
    };
  };
}

interface ExecutionContext {
  waitUntil(promise: Promise<unknown>): void;
  passThroughOnException(): void;
}

const HLS_ENCODER_PATH = "/admin/hls-vault";
const BASE_SECURITY_HEADERS = {
  "x-content-type-options": "nosniff",
  "referrer-policy": "strict-origin-when-cross-origin",
  "permissions-policy": "camera=(), microphone=(), geolocation=(), payment=(), usb=()",
  "x-frame-options": "SAMEORIGIN",
};
const HLS_ENCODER_HEADERS = {
  "cross-origin-embedder-policy": "require-corp",
  "cross-origin-opener-policy": "same-origin",
};

function withHeaders(response: Response, extraHeaders: Record<string, string>) {
  const headers = new Headers(response.headers);
  for (const [name, value] of Object.entries(extraHeaders)) headers.set(name, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

// Image security config. SVG sources with .svg extension auto-skip the
// optimization endpoint on the client side (served directly, no proxy).
// To route SVGs through the optimizer (with security headers), set
// dangerouslyAllowSVG: true in next.config.js and uncomment below:
// const imageConfig: ImageConfig = { dangerouslyAllowSVG: true };

const worker = {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname === "/_vinext/image") {
      const allowedWidths = [...DEFAULT_DEVICE_SIZES, ...DEFAULT_IMAGE_SIZES];
      const response = await handleImageOptimization(request, {
        fetchAsset: (path) => env.ASSETS.fetch(new Request(new URL(path, request.url))),
        transformImage: async (body, { width, format, quality }) => {
          const result = await env.IMAGES.input(body).transform(width > 0 ? { width } : {}).output({ format, quality });
          return result.response();
        },
      }, allowedWidths);
      return withHeaders(response, BASE_SECURITY_HEADERS);
    }

    const response = await handler.fetch(request, env, ctx);
    if (request.method === "GET" && url.pathname === HLS_ENCODER_PATH && url.searchParams.get("isolated") === "1") return withHeaders(response, { ...BASE_SECURITY_HEADERS, ...HLS_ENCODER_HEADERS });
    return withHeaders(response, BASE_SECURITY_HEADERS);
  },
};

export default worker;

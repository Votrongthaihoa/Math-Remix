const PUBLIC_PREFIXES = new Set(["admin-images", "public-videos"]);

const corsHeaders = {
  "access-control-allow-origin": "*",
  "access-control-allow-methods": "GET, HEAD, OPTIONS",
  "access-control-allow-headers": "Range, If-None-Match, If-Modified-Since",
  "access-control-expose-headers": "Accept-Ranges, Content-Length, Content-Range, ETag",
};

function publicObjectKey(pathname: string) {
  try {
    const parts = pathname
      .split("/")
      .filter(Boolean)
      .map((part) => decodeURIComponent(part));
    if (parts.length < 2 || !PUBLIC_PREFIXES.has(parts[0])) return null;
    if (parts.some((part) => !part || part === "." || part === ".." || /[\\/\0]/.test(part))) return null;
    return parts.join("/");
  } catch {
    return null;
  }
}

function responseHeaders(object: R2Object) {
  const headers = new Headers(corsHeaders);
  object.writeHttpMetadata(headers);
  headers.set("accept-ranges", "bytes");
  headers.set("etag", object.httpEtag);
  headers.set("x-content-type-options", "nosniff");
  headers.set("cross-origin-resource-policy", "cross-origin");
  headers.set("referrer-policy", "no-referrer");
  if (!headers.has("cache-control")) headers.set("cache-control", "public, max-age=86400");
  return headers;
}

function normalizedRange(range: R2Range | undefined, size: number) {
  if (!range) return null;
  if ("suffix" in range && typeof range.suffix === "number") {
    const length = Math.min(range.suffix, size);
    return { offset: size - length, length };
  }
  const offset = "offset" in range && typeof range.offset === "number" ? range.offset : 0;
  const length = "length" in range && typeof range.length === "number"
    ? range.length
    : Math.max(0, size - offset);
  return { offset, length };
}

function missingResponse(status = 404) {
  return new Response(status === 404 ? "Media not found" : null, {
    status,
    headers: {
      ...corsHeaders,
      "cache-control": "public, max-age=60",
      "content-type": "text/plain; charset=utf-8",
      "x-content-type-options": "nosniff",
    },
  });
}

async function mediaResponse(request: Request, env: Env, key: string) {
  if (request.method === "HEAD") {
    const object = await env.MEDIA_BUCKET.head(key);
    if (!object) return missingResponse();
    const headers = responseHeaders(object);
    headers.set("content-length", String(object.size));
    return new Response(null, { status: 200, headers });
  }

  const object = await env.MEDIA_BUCKET.get(key, {
    onlyIf: request.headers,
    range: request.headers,
  });
  if (!object) return missingResponse();

  const headers = responseHeaders(object);
  if (!("body" in object)) {
    const notModified = request.headers.has("if-none-match") || request.headers.has("if-modified-since");
    return new Response(null, { status: notModified ? 304 : 412, headers });
  }

  const range = normalizedRange(object.range, object.size);
  if (range && request.headers.has("range")) {
    headers.set("content-length", String(range.length));
    headers.set("content-range", `bytes ${range.offset}-${range.offset + range.length - 1}/${object.size}`);
    return new Response(object.body, { status: 206, headers });
  }

  headers.set("content-length", String(object.size));
  return new Response(object.body, { status: 200, headers });
}

export default {
  async fetch(request, env): Promise<Response> {
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: corsHeaders });
    }
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response("Method not allowed", {
        status: 405,
        headers: { ...corsHeaders, allow: "GET, HEAD, OPTIONS" },
      });
    }
    if (url.pathname === "/" || url.pathname === "") {
      return new Response("REMIX Education media gateway", {
        status: 200,
        headers: {
          ...corsHeaders,
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff",
        },
      });
    }

    const key = publicObjectKey(url.pathname);
    if (!key) return missingResponse();

    try {
      return await mediaResponse(request, env, key);
    } catch (error) {
      console.error(JSON.stringify({
        event: "media_fetch_failed",
        method: request.method,
        pathname: url.pathname,
        error: error instanceof Error ? error.message : "unknown_error",
      }));
      return new Response("Unable to load media", {
        status: 500,
        headers: {
          ...corsHeaders,
          "cache-control": "no-store",
          "content-type": "text/plain; charset=utf-8",
          "x-content-type-options": "nosniff",
        },
      });
    }
  },
} satisfies ExportedHandler<Env>;

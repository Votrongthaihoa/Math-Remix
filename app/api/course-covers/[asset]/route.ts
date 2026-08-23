import { loadR2Object } from "../../../../lib/r2-server";
import {
  courseCoverKey,
  COURSE_COVER_MAX_STORED_BYTES,
  imageResponseContentType,
  safeImageAsset,
} from "../../../../lib/course-covers-server";

const headers = {
  "cache-control": "public, max-age=31536000, immutable",
  "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
  "cross-origin-resource-policy": "cross-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

type RouteContext = { params: Promise<{ asset: string }> };

function decodeAsset(value: string) {
  try {
    return safeImageAsset(decodeURIComponent(value));
  } catch {
    return null;
  }
}

export async function GET(_request: Request, context: RouteContext) {
  const params = await context.params;
  const assetName = decodeAsset(params.asset ?? "");
  if (!assetName) return new Response(null, { status: 404, headers });
  try {
    const image = await loadR2Object(courseCoverKey(assetName), COURSE_COVER_MAX_STORED_BYTES);
    return new Response(image.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        ...headers,
        "content-type": imageResponseContentType(image.contentType, assetName),
        "content-disposition": "inline",
        "content-length": String(image.bytes.byteLength),
      },
    });
  } catch {
    return new Response(null, { status: 404, headers });
  }
}

export async function HEAD(request: Request, context: RouteContext) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, headers: response.headers });
}

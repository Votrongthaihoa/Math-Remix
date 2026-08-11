import { loadR2Object } from "../../../../lib/r2-server";
import {
  EXAM_IMAGE_MAX_STORED_BYTES,
  imageResponseContentType,
  publicImageHeaders,
  publicImageKey,
  safeImageAsset,
} from "../../../../lib/exam-images-server";

type ImageRouteContext = { params: Promise<{ asset: string }> };

export async function GET(_request: Request, context: ImageRouteContext) {
  const params = await context.params;
  const assetName = safeImageAsset(decodeURIComponent(params.asset ?? ""));
  if (!assetName) return new Response(null, { status: 404, headers: publicImageHeaders });

  try {
    const image = await loadR2Object(publicImageKey(assetName), EXAM_IMAGE_MAX_STORED_BYTES);
    return new Response(image.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        ...publicImageHeaders,
        "content-type": imageResponseContentType(image.contentType, assetName),
        "content-disposition": "inline",
        "content-length": String(image.bytes.byteLength),
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: publicImageHeaders });
  }
}

export async function HEAD(request: Request, context: ImageRouteContext) {
  const response = await GET(request, context);
  return new Response(null, { status: response.status, headers: response.headers });
}

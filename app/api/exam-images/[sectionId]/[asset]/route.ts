import { loadR2Object } from "../../../../../lib/r2-server";
import {
  EXAM_IMAGE_MAX_STORED_BYTES,
  EXAM_IMAGE_SECTION_PATTERN,
  examImageAssetHeaders,
  examImageHeaders,
  examImageKey,
  imageResponseContentType,
  loadExamSectionAccess,
  requireActiveExamUser,
  safeImageAsset,
} from "../../../../../lib/exam-images-server";

type ImageRouteContext = { params: Promise<{ sectionId: string; asset: string }> };

export async function GET(request: Request, context: ImageRouteContext) {
  const authentication = await requireActiveExamUser(request);
  if (!authentication.ok) return authentication.response;

  const params = await context.params;
  const sectionId = decodeURIComponent(params.sectionId ?? "");
  const assetName = safeImageAsset(decodeURIComponent(params.asset ?? ""));
  if (!EXAM_IMAGE_SECTION_PATTERN.test(sectionId) || !assetName) return new Response(null, { status: 404, headers: examImageHeaders });

  // Active admins already passed server-side account and role validation. They
  // may preview draft assets, so skip the student-only section/exam/room
  // visibility waterfall. Students still require the complete access check.
  if (authentication.user.role !== "admin") {
    const access = await loadExamSectionAccess(authentication.admin, authentication.user, sectionId);
    if (!access) return new Response(null, { status: 404, headers: examImageHeaders });
  }

  try {
    const image = await loadR2Object(examImageKey(sectionId, assetName), EXAM_IMAGE_MAX_STORED_BYTES);
    return new Response(image.bytes as unknown as BodyInit, {
      status: 200,
      headers: {
        ...examImageAssetHeaders,
        "content-type": imageResponseContentType(image.contentType, assetName),
        "content-disposition": "inline",
        "content-length": String(image.bytes.byteLength),
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: examImageHeaders });
  }
}

export async function HEAD(request: Request, context: ImageRouteContext) {
  const response = await GET(request, context);
  await response.body?.cancel().catch(() => undefined);
  return new Response(null, { status: response.status, headers: response.headers });
}

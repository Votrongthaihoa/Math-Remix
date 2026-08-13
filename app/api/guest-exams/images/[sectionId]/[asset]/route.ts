import { streamR2Object } from "../../../../../../lib/r2-server";
import {
  EXAM_IMAGE_MAX_STORED_BYTES,
  examImageAssetHeaders,
  examImageHeaders,
  examImageKey,
  imageResponseContentType,
  safeImageAsset,
} from "../../../../../../lib/exam-images-server";
import {
  guestCookieName,
  guestServerClient,
  readCookie,
  requestClientHash,
  sha256,
  slotPhase,
} from "../../../../../../lib/guest-exam-server";
import { consumeRequestBudget } from "../../../../../../lib/rate-limit-server";

type ImageRouteContext = { params: Promise<{ sectionId: string; asset: string }> };

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const guestImageHeaders = {
  ...examImageHeaders,
  "cross-origin-resource-policy": "cross-origin",
};
const guestImageAssetHeaders = {
  ...examImageAssetHeaders,
  "cross-origin-resource-policy": "cross-origin",
};

async function guestImageAccess(request: Request, attemptId: string, sectionId: string) {
  const admin = guestServerClient();
  if (!admin || !UUID_PATTERN.test(attemptId) || !UUID_PATTERN.test(sectionId)) return null;
  const { data: attempt } = await admin
    .from("guest_exam_attempts")
    .select("id,slot_id,exam_id,status,session_hash")
    .eq("id", attemptId)
    .maybeSingle();
  if (!attempt || !["in_progress", "submitted"].includes(String(attempt.status))) return null;

  const [{ data: slot }, { data: section }] = await Promise.all([
    admin
      .from("exam_access_slots")
      .select("id,exam_id,section_id,starts_at,ends_at,grace_period_minutes,enabled")
      .eq("id", attempt.slot_id)
      .eq("exam_id", attempt.exam_id)
      .maybeSingle(),
    admin
      .from("exam_sections")
      .select("id")
      .eq("id", sectionId)
      .eq("exam_id", attempt.exam_id)
      .maybeSingle(),
  ]);
  if (!slot || (slot.section_id && slot.section_id !== sectionId)) return null;
  if (!section) return null;

  const session = readCookie(request, guestCookieName(slot.id));
  if (!session || (await sha256(session)) !== attempt.session_hash) return null;
  const phase = slotPhase(slot);
  if (attempt.status === "in_progress" && !["open", "grace"].includes(phase)) return null;
  return admin;
}

async function handleImage(request: Request, context: ImageRouteContext) {
  const params = await context.params;
  const sectionId = decodeURIComponent(params.sectionId ?? "");
  const assetName = safeImageAsset(decodeURIComponent(params.asset ?? ""));
  const attemptId = new URL(request.url).searchParams.get("attemptId")?.trim() ?? "";
  if (!assetName) return new Response(null, { status: 404, headers: guestImageHeaders });

  const admin = await guestImageAccess(request, attemptId, sectionId);
  if (!admin) return new Response(null, { status: 404, headers: guestImageHeaders });
  const budget = await consumeRequestBudget(
    admin,
    "guest_image",
    await requestClientHash(request, { attemptId, sectionId }),
    { capacity: 120, refillSeconds: 1 },
  );
  const rateLimitHeaders = {
    ...guestImageHeaders,
    "content-type": "application/json; charset=utf-8",
    "retry-after": String(budget.retryAfterSeconds),
  };
  if (!budget.ready && !budget.allowed) return new Response(JSON.stringify({ error: "Dịch vụ bảo vệ kíp thi chưa sẵn sàng." }), { status: 503, headers: rateLimitHeaders });
  if (!budget.allowed) return new Response(JSON.stringify({ error: "Quá nhiều yêu cầu ảnh. Hãy thử lại sau." }), { status: 429, headers: rateLimitHeaders });
  try {
    const image = await streamR2Object(examImageKey(sectionId, assetName), EXAM_IMAGE_MAX_STORED_BYTES);
    return new Response(image.body, {
      status: 200,
      headers: {
        ...guestImageAssetHeaders,
        "content-type": imageResponseContentType(image.contentType, assetName),
        "content-disposition": "inline",
        "content-length": String(image.contentLength),
      },
    });
  } catch {
    return new Response(null, { status: 404, headers: guestImageHeaders });
  }
}

export async function GET(request: Request, context: ImageRouteContext) {
  return handleImage(request, context);
}

export async function HEAD(request: Request, context: ImageRouteContext) {
  const response = await handleImage(request, context);
  await response.body?.cancel().catch(() => undefined);
  return new Response(null, { status: response.status, headers: response.headers });
}

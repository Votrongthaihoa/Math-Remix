import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { inspectMicrosoftShareVideo, MicrosoftGraphVideoError } from "../../../../lib/microsoft-graph-video";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";
import { ensureActiveAccount, hashedRequestIp } from "../../../../lib/security-server";

const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

async function getAdmin(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return { error: security.response };
  if (security.profile.role !== "admin") return { error: Response.json({ error: "Không có quyền quản trị." }, { status: 403, headers: noStore }) };
  return { admin: security.admin, user: security.user };
}

function graphError(error: unknown) {
  if (error instanceof MicrosoftGraphVideoError) return Response.json({ error: error.message, code: error.code }, { status: error.status, headers: noStore });
  console.error("[lesson-videos] unexpected Microsoft resolver error", error);
  return Response.json({ error: "Không thể kiểm tra video Microsoft lúc này." }, { status: 502, headers: noStore });
}

export async function POST(request: Request) {
  const authorization = await getAdmin(request);
  if ("error" in authorization) return authorization.error;
  try {
    const budget = await consumeRequestBudget(authorization.admin, "admin-lesson-videos", `${authorization.user.id}:${await hashedRequestIp(request)}`, { capacity: 20, refillSeconds: 30 });
    if (!budget.allowed) return Response.json({ error: "Bạn kiểm tra video quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStore, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });
  }
  const parsedBody = await readJsonBody<{ action?: "inspect" | "create"; shareUrl?: string; lessonId?: string; title?: string }>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400, headers: noStore });
  const { action, shareUrl = "", lessonId = "", title = "" } = parsedBody.body;
  if (action !== "inspect" && action !== "create") return Response.json({ error: "Yêu cầu video không hợp lệ." }, { status: 400, headers: noStore });

  let metadata;
  try { metadata = await inspectMicrosoftShareVideo(shareUrl); }
  catch (error) { return graphError(error); }
  if (action === "inspect") return Response.json({ metadata }, { headers: noStore });
  if (!uuid.test(lessonId)) return Response.json({ error: "Bài học không hợp lệ." }, { status: 400, headers: noStore });

  const { data: lesson, error: lessonError } = await authorization.admin.from("lessons").select("id").eq("id", lessonId).maybeSingle();
  if (lessonError || !lesson) return Response.json({ error: "Không tìm thấy bài học đã chọn." }, { status: 404, headers: noStore });
  const { data: siblings, error: siblingError } = await authorization.admin.from("lesson_resources").select("sort_order").eq("lesson_id", lessonId);
  if (siblingError) return Response.json({ error: siblingError.message }, { status: 400, headers: noStore });
  const sortOrder = (siblings ?? []).reduce((highest, item) => Math.max(highest, Number(item.sort_order) || 0), -1) + 1;
  const { data: resource, error } = await authorization.admin.from("lesson_resources").insert({
    lesson_id: lessonId,
    title: title.trim().slice(0, 240) || metadata.name.slice(0, 240),
    resource_type: "onedrive_video",
    resource_url: metadata.shareUrl,
    allow_download: false,
    sort_order: sortOrder,
    provider: metadata.provider,
    provider_drive_id: metadata.driveId,
    provider_item_id: metadata.itemId,
    provider_metadata: { name: metadata.name, mimeType: metadata.mimeType, size: metadata.size, durationMs: metadata.durationMs, width: metadata.width, height: metadata.height, webUrl: metadata.webUrl },
  }).select("id,lesson_id,title,resource_type,resource_url,allow_download,sort_order,provider,provider_drive_id,provider_item_id,provider_metadata").single();
  if (error || !resource) return Response.json({ error: error?.message || "Không thể lưu video vào bài học." }, { status: 400, headers: noStore });
  return Response.json({ resource, metadata }, { status: 201, headers: noStore });
}

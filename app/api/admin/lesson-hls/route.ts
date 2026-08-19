import { jsonBodyError, readJsonBody } from "../../../../lib/http-server";
import { consumeRequestBudget } from "../../../../lib/rate-limit-server";
import { ensureActiveAccount, hashedRequestIp } from "../../../../lib/security-server";

const noStore = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const videoIdPattern = /^[A-Za-z0-9_-]{1,80}$/;

export async function POST(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  if (security.profile.role !== "admin") return Response.json({ error: "Không có quyền quản trị." }, { status: 403, headers: noStore });
  try {
    const budget = await consumeRequestBudget(security.admin, "admin-lesson-hls", `${security.user.id}:${await hashedRequestIp(request)}`, { capacity: 20, refillSeconds: 30 });
    if (!budget.allowed) return Response.json({ error: "Bạn thao tác quá nhanh. Hãy thử lại sau.", code: "RATE_LIMITED", retryAfter: budget.retryAfterSeconds }, { status: 429, headers: { ...noStore, "retry-after": String(budget.retryAfterSeconds) } });
  } catch {
    return Response.json({ error: "Máy chủ bảo mật chưa được cấu hình đầy đủ.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });
  }
  const parsed = await readJsonBody<{ lessonId?: string; title?: string; videoId?: string }>(request);
  if (!parsed.ok) return Response.json(jsonBodyError(parsed.error), { status: parsed.error === "payload_too_large" ? 413 : 400, headers: noStore });
  const lessonId = parsed.body.lessonId?.trim() || "";
  const videoId = parsed.body.videoId?.trim() || "";
  if (!uuid.test(lessonId) || !videoIdPattern.test(videoId)) return Response.json({ error: "Mã bài học hoặc mã video không hợp lệ." }, { status: 400, headers: noStore });
  const { data: lesson } = await security.admin.from("lessons").select("id").eq("id", lessonId).maybeSingle();
  if (!lesson) return Response.json({ error: "Không tìm thấy bài học đã chọn." }, { status: 404, headers: noStore });
  const { data: siblings, error: siblingError } = await security.admin.from("lesson_resources").select("sort_order").eq("lesson_id", lessonId);
  if (siblingError) return Response.json({ error: siblingError.message }, { status: 400, headers: noStore });
  const sortOrder = (siblings ?? []).reduce((highest, item) => Math.max(highest, Number(item.sort_order) || 0), -1) + 1;
  const { data: resource, error } = await security.admin.from("lesson_resources").insert({
    lesson_id: lessonId,
    title: parsed.body.title?.trim().slice(0, 240) || `Video HLS ${videoId}`,
    resource_type: "hls_vault",
    resource_url: `hls://${videoId}`,
    allow_download: false,
    sort_order: sortOrder,
    provider: "onedrive_personal",
    provider_metadata: { playbackMode: "hls-vault", hlsVideoId: videoId },
  }).select("id,lesson_id,title,resource_type,resource_url,allow_download,sort_order,provider,provider_metadata").single();
  if (error || !resource) return Response.json({ error: error?.message || "Không thể lưu video HLS." }, { status: 400, headers: noStore });
  return Response.json({ resource }, { status: 201, headers: noStore });
}

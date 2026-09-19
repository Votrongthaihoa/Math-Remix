import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { aggregateHealthStatus, timedCheck, type HealthCheck } from "../../../../lib/admin-server-health";
import { microsoftGraphConfigurationReady } from "../../../../lib/microsoft-graph-server";
import { securityAdminClient } from "../../../../lib/security-server";

const noStore = { "cache-control": "private, no-store" };

function configured(...values: Array<string | undefined>) {
  return values.every(value => Boolean(value?.trim()));
}

export async function GET(request: Request) {
  const admin = securityAdminClient();
  if (!admin) return Response.json({ error: "Chưa cấu hình máy chủ bảo mật.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });

  try {
    const authentication = await ensureAdminPermission(request, "server-health", admin);
    if (!authentication.ok) return authentication.response;

    const started = Date.now();
    const checks: HealthCheck[] = await Promise.all([
      timedCheck("profiles", "Hồ sơ người dùng", async signal => {
        const result = await admin.from("profiles").select("id", { count: "exact", head: true }).abortSignal(signal);
        return { ok: !result.error, detail: result.error ? "Bảng profiles phản hồi lỗi." : `${result.count ?? 0} hồ sơ có thể truy vấn.` };
      }, undefined, request.signal),
      timedCheck("courses", "Kho khóa học", async signal => {
        const result = await admin.from("courses").select("id", { count: "exact", head: true }).abortSignal(signal);
        return { ok: !result.error, detail: result.error ? "Bảng courses phản hồi lỗi." : `${result.count ?? 0} khóa học trong hệ thống.` };
      }, undefined, request.signal),
      timedCheck("exam_rooms", "Phòng khảo thí", async signal => {
        const result = await admin.from("exam_rooms").select("id", { count: "exact", head: true }).abortSignal(signal);
        return { ok: !result.error, detail: result.error ? "Bảng exam_rooms phản hồi lỗi." : `${result.count ?? 0} phòng thi trong hệ thống.` };
      }, undefined, request.signal),
    ]);

    const integrations = [
      {
        id: "supabase-auth",
        label: "Supabase Auth",
        configured: configured(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY),
        detail: "Xác thực token server-side bằng getUser.",
      },
      {
        id: "r2-media",
        label: "R2 Media",
        configured: configured(process.env.R2_ACCOUNT_ID, process.env.R2_ACCESS_KEY_ID, process.env.R2_SECRET_ACCESS_KEY, process.env.R2_BUCKET_NAME),
        detail: "Kho ảnh/PDF/HLS tùy flow đã bật.",
      },
      {
        id: "microsoft-graph",
        label: "Microsoft Graph",
        configured: microsoftGraphConfigurationReady(),
        detail: "Nguồn video Microsoft trong lesson resource.",
      },
      {
        id: "legacy-aeck",
        label: "Legacy AECK API",
        configured: configured(process.env.LEGACY_AECK_API_URL, process.env.LEGACY_AECK_API_TOKEN),
        detail: "Cần URL và token/exchange riêng cho IRT, iLearn, gói học và giao hàng.",
      },
    ];
    const status = aggregateHealthStatus(checks, integrations);
    return Response.json({ status, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, checks, integrations }, { status: 200, headers: noStore });
  } catch {
    return Response.json({ error: "Không thể kiểm tra sức khỏe server. Hãy thử lại.", code: "HEALTH_CHECK_FAILED" }, { status: 503, headers: noStore });
  }
}

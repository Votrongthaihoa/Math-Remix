import { securityAdminClient, ensureActiveAccount } from "../../../../lib/security-server";

const noStore = { "cache-control": "private, no-store" };

type CheckResult = {
  id: string;
  label: string;
  status: "healthy" | "degraded" | "not_configured";
  detail: string;
  durationMs?: number;
};

async function timedCheck(id: string, label: string, check: () => Promise<{ ok: boolean; detail: string }>): Promise<CheckResult> {
  const started = Date.now();
  try {
    const result = await check();
    return { id, label, status: result.ok ? "healthy" : "degraded", detail: result.detail, durationMs: Date.now() - started };
  } catch {
    return { id, label, status: "degraded", detail: "Không thể hoàn tất kiểm tra lúc này.", durationMs: Date.now() - started };
  }
}

function configured(...values: Array<string | undefined>) {
  return values.every(value => Boolean(value?.trim()));
}

export async function GET(request: Request) {
  const admin = securityAdminClient();
  if (!admin) return Response.json({ error: "Chưa cấu hình máy chủ bảo mật.", code: "SECURITY_CONFIGURATION_REQUIRED" }, { status: 503, headers: noStore });

  try {
    const authentication = await ensureActiveAccount(request, admin);
    if (!authentication.ok) return authentication.response;
    if (authentication.profile.role !== "admin") {
      return Response.json({ error: "Bạn không có quyền xem tình trạng hệ thống.", code: "ADMIN_REQUIRED" }, { status: 403, headers: noStore });
    }

    const started = Date.now();
    const checks = await Promise.all([
      timedCheck("profiles", "Hồ sơ người dùng", async () => {
        const result = await admin.from("profiles").select("id", { count: "exact", head: true });
        return { ok: !result.error, detail: result.error ? "Bảng profiles phản hồi lỗi." : `${result.count ?? 0} hồ sơ có thể truy vấn.` };
      }),
      timedCheck("courses", "Kho khóa học", async () => {
        const result = await admin.from("courses").select("id", { count: "exact", head: true });
        return { ok: !result.error, detail: result.error ? "Bảng courses phản hồi lỗi." : `${result.count ?? 0} khóa học trong hệ thống.` };
      }),
      timedCheck("exam_rooms", "Phòng khảo thí", async () => {
        const result = await admin.from("exam_rooms").select("id", { count: "exact", head: true });
        return { ok: !result.error, detail: result.error ? "Bảng exam_rooms phản hồi lỗi." : `${result.count ?? 0} phòng thi trong hệ thống.` };
      }),
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
        configured: configured(process.env.MICROSOFT_CLIENT_ID, process.env.MICROSOFT_CLIENT_SECRET, process.env.MICROSOFT_REDIRECT_URI),
        detail: "Nguồn video Microsoft trong lesson resource.",
      },
      {
        id: "legacy-aeck",
        label: "Legacy AECK API",
        configured: configured(process.env.LEGACY_AECK_API_URL, process.env.LEGACY_AECK_API_TOKEN),
        detail: "Cần URL và token/exchange riêng cho IRT, iLearn, gói học và giao hàng.",
      },
    ];
    const status = checks.some(check => check.status === "degraded") ? "degraded" : "healthy";
    return Response.json({ status, checkedAt: new Date().toISOString(), latencyMs: Date.now() - started, checks, integrations }, { status: 200, headers: noStore });
  } catch {
    return Response.json({ error: "Không thể kiểm tra sức khỏe server. Hãy thử lại.", code: "HEALTH_CHECK_FAILED" }, { status: 503, headers: noStore });
  }
}

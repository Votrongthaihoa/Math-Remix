import { ensureActiveAccount } from "../../../../lib/security-server";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

export async function GET(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  const result = await security.admin
    .from("profiles")
    .select("full_name,student_code")
    .eq("id", security.user.id)
    .maybeSingle();
  if (result.error || !result.data) {
    return Response.json(
      { error: "Không thể tải thông tin tài khoản." },
      { status: 503, headers: privateHeaders },
    );
  }
  return Response.json({
    profile: {
      full_name: String(result.data.full_name ?? ""),
      student_code: String(result.data.student_code ?? ""),
      role: security.profile.role,
      email: security.user.email ?? "",
    },
  }, { headers: privateHeaders });
}

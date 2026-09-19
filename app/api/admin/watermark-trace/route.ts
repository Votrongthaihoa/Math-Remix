import { PDFDocument } from "pdf-lib";
import { ensureAdminPermission } from "../../../../lib/admin-authorization-server";
import { MULTIPART_OVERHEAD_BYTES, readMultipartFormData } from "../../../../lib/http-server";
import { parseWatermarkTrace, watermarkTraceSecret } from "../../../../lib/watermark-trace";

export const MAX_TRACE_FILE_BYTES = 50 * 1024 * 1024;
const headers = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

function response(body: Record<string, unknown>, status = 200) {
  return Response.json(body, { status, headers });
}

export async function POST(request: Request) {
  const security = await ensureAdminPermission(request, "system-admin");
  if (!security.ok) return security.response;

  const multipart = await readMultipartFormData(request, MAX_TRACE_FILE_BYTES + MULTIPART_OVERHEAD_BYTES);
  if (!multipart.ok) return response({ error: multipart.error === "payload_too_large" ? "Tệp vượt quá giới hạn 50 MB." : "Tệp tải lên không hợp lệ." }, multipart.error === "payload_too_large" ? 413 : 400);
  const form = multipart.form;
  const file = form.get("file");
  if (!(file instanceof File)) return response({ error: "Hãy chọn một tệp PDF hoặc ảnh cần truy vết." }, 400);
  if (!file.size || file.size > MAX_TRACE_FILE_BYTES) return response({ error: "Tệp không được rỗng hoặc vượt quá 50 MB." }, 413);
  const contentType = file.type.toLowerCase();
  if (contentType && contentType !== "application/pdf" && !contentType.startsWith("image/") && contentType !== "text/plain") {
    return response({ error: "Chỉ hỗ trợ PDF, ảnh hoặc tệp marker dạng văn bản." }, 415);
  }

  const bytes = new Uint8Array(await file.arrayBuffer());
  const isPdf = new TextDecoder("latin1").decode(bytes.subarray(0, 5)) === "%PDF-" || contentType === "application/pdf";
  if (isPdf) {
    try {
      await PDFDocument.load(bytes, { ignoreEncryption: true, updateMetadata: false });
    } catch {
      return Response.json({ error: "Tệp PDF không hợp lệ hoặc đã bị hỏng." }, { status: 422, headers });
    }
  }

  const secret = watermarkTraceSecret();
  const result = await parseWatermarkTrace(bytes, secret);
  if (result.status !== "matched") {
    return Response.json({
      matched: false,
      reason: result.reason,
      visibleEmails: result.visibleEmails,
      message: result.reason === "visible_only"
        ? "Tệp chỉ còn watermark hiển thị; không thể xác nhận danh tính an toàn."
        : "Không tìm thấy marker watermark hợp lệ trong tệp.",
    }, { status: 422, headers });
  }

  const [profileResult, authResult] = await Promise.all([
    security.admin.from("profiles").select("id,full_name,student_code").eq("id", result.claims.userId).maybeSingle(),
    security.admin.auth.admin.getUserById(result.claims.userId),
  ]);
  if (profileResult.error) return response({ error: "Không thể đối chiếu hồ sơ người dùng." }, 503);
  if (!profileResult.data && !authResult.data.user) return response({ error: "Marker hợp lệ nhưng tài khoản không còn tồn tại." }, 404);

  return response({
    matched: true,
    marker: result.marker,
    attribution: {
      userId: result.claims.userId,
      fullName: profileResult.data?.full_name ?? null,
      studentCode: profileResult.data?.student_code ?? null,
      email: authResult.data.user?.email ?? null,
      resourceId: result.claims.resourceId,
      issuedAt: result.claims.issuedAt,
      ipHash: result.claims.ipHash,
    },
  });
}

export async function GET() {
  return response({ error: "Dùng POST multipart/form-data với trường file." }, 405);
}

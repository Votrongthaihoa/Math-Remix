import { ensureActiveAccount } from "../../../../lib/security-server";

const headers = { "cache-control": "private, no-store, max-age=0", "x-content-type-options": "nosniff" };
const maxBytes = 10 * 1024 * 1024;

export async function POST(request: Request) {
  const security = await ensureActiveAccount(request);
  if (!security.ok) return security.response;
  const form = await request.formData().catch(() => null);
  const file = form?.get("file");
  if (!(file instanceof File) || !file.type.startsWith("image/")) return Response.json({ error: "Hãy tải lên một tệp ảnh." }, { status: 400, headers });
  if (file.size > maxBytes) return Response.json({ error: "Ảnh không được vượt quá 10 MB." }, { status: 413, headers });
  const providerUrl = process.env.OCR_PROVIDER_URL?.trim();
  if (!providerUrl) return Response.json({ error: "OCR chưa được cấu hình trong runtime này.", code: "OCR_PROVIDER_UNAVAILABLE" }, { status: 501, headers });
  const forward = new FormData();
  forward.set("file", file, file.name || "question-image");
  try {
    const response = await fetch(providerUrl, { method: "POST", headers: process.env.OCR_PROVIDER_TOKEN ? { authorization: `Bearer ${process.env.OCR_PROVIDER_TOKEN}` } : undefined, body: forward });
    const payload = await response.json().catch(() => null);
    return Response.json(payload ?? { error: "OCR provider trả về dữ liệu không hợp lệ." }, { status: response.ok ? 200 : 502, headers });
  } catch {
    return Response.json({ error: "Không thể kết nối OCR provider." }, { status: 502, headers });
  }
}

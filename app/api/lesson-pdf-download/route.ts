import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { contentServer } from "../../../lib/content-server";
import { verifyContentToken } from "../../../lib/content-token";
import { guardResourceAccess } from "../../../lib/resource-access-server";
import { jsonBodyError, readJsonBody } from "../../../lib/http-server";
import { ensureActiveAccount } from "../../../lib/security-server";
import { loadPdfBytes } from "../../../lib/r2-server";

const MAX_PDF_BYTES = 50 * 1024 * 1024;

function downloadTimestamp() {
  return new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Ho_Chi_Minh",
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hour12: false,
  }).format(new Date()).replace(",", "");
}

function safeFilename(value: string) {
  return `${value.replace(/\.pdf$/i, "").replace(/[^a-zA-Z0-9._ -]+/g, "-").trim() || "tai-lieu"}-watermarked.pdf`;
}

async function addWatermark(source: Uint8Array, email: string, timestamp: string) {
  const pdf = await PDFDocument.load(source, { ignoreEncryption: true, updateMetadata: false });
  const font = await pdf.embedFont(StandardFonts.Helvetica);
  const mark = `${email} | ${timestamp} GMT+7`;
  const footer = `Downloaded by ${email} | ${timestamp} GMT+7`;

  for (const page of pdf.getPages()) {
    const { width, height } = page.getSize();
    const fontSize = Math.max(9, Math.min(15, width / 38));
    const markWidth = font.widthOfTextAtSize(mark, fontSize);
    const stepX = Math.max(markWidth + 70, width * .58);
    const stepY = Math.max(100, height * .25);
    for (let y = height * .12; y < height; y += stepY) {
      for (let x = -width * .12; x < width; x += stepX) {
        page.drawText(mark, {
          x,
          y,
          size: fontSize,
          font,
          color: rgb(.74, .06, .12),
          opacity: .14,
          rotate: degrees(-30),
        });
      }
    }
    page.drawText(footer, {
      x: 14,
      y: 10,
      size: Math.max(7, Math.min(9, width / 70)),
      font,
      color: rgb(.35, .35, .35),
      opacity: .72,
    });
  }

  pdf.setProducer("REMIX Education");
  pdf.setModificationDate(new Date());
  return pdf.save({ useObjectStreams: false });
}

export async function POST(request: Request) {
  const config = contentServer();
  if (!config.ok) return config.response;
  const { admin, tokenSecret } = config;

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const parsedBody = await readJsonBody<{ videoToken?: string }>(request);
  if (!parsedBody.ok) return Response.json(jsonBodyError(parsedBody.error), { status: parsedBody.error === "payload_too_large" ? 413 : 400 });
  const body = parsedBody.body;
  if (!body.videoToken) return Response.json({ error: "Thiếu token nội dung." }, { status: 400 });

  const security = await ensureActiveAccount(request, admin);
  if (!security.ok) return security.response;
  const auth = { user: security.user };
  if (!auth.user.email) return Response.json({ error: "Tài khoản chưa có email." }, { status: 400 });

  const payload = await verifyContentToken(body.videoToken, tokenSecret);
  if (!payload || payload.sub !== auth.user.id) return Response.json({ error: "Token nội dung không hợp lệ hoặc đã hết hạn." }, { status: 403 });
  const access = await guardResourceAccess(admin, security.user.id, security.profile, payload.rid, "download");
  if (!access.ok) return access.response;
  const resource = access.resource;
  if (resource.resource_type === "youtube") return Response.json({ error: "Không tìm thấy tài liệu PDF." }, { status: 404 });

  let source: Uint8Array;
  try { source = await loadPdfBytes(resource.resource_url, MAX_PDF_BYTES); }
  catch (error) { return Response.json({ error: error instanceof Error ? error.message : "Không thể tải PDF nguồn." }, { status: 502 }); }
  if (new TextDecoder().decode(source.slice(0, 5)) !== "%PDF-") return Response.json({ error: "Nguồn tải xuống không phải PDF hợp lệ." }, { status: 422 });

  try {
    const output = await addWatermark(source, auth.user.email, downloadTimestamp());
    const filename = safeFilename(resource.title);
    const body = output.buffer.slice(output.byteOffset, output.byteOffset + output.byteLength) as ArrayBuffer;
    return new Response(body, {
      headers: {
        "content-type": "application/pdf",
        "content-disposition": `attachment; filename="${filename}"; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "cache-control": "private, no-store, max-age=0",
        "x-content-type-options": "nosniff",
      },
    });
  } catch {
    return Response.json({ error: "Không thể đóng watermark vào PDF này." }, { status: 422 });
  }
}

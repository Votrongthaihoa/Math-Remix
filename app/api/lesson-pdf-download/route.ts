import { createClient } from "@supabase/supabase-js";
import { degrees, PDFDocument, rgb, StandardFonts } from "pdf-lib";
import { verifyContentToken } from "../../../lib/content-token";

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
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tokenSecret = process.env.VIDEO_TOKEN_SECRET || serviceKey;
  if (!url || !serviceKey || !tokenSecret) return Response.json({ error: "Chưa cấu hình máy chủ nội dung." }, { status: 503 });

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const body = await request.json() as { videoToken?: string };
  if (!body.videoToken) return Response.json({ error: "Thiếu token nội dung." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: auth } = await admin.auth.getUser(accessToken);
  if (!auth.user?.email) return Response.json({ error: "Phiên đăng nhập không hợp lệ hoặc tài khoản chưa có email." }, { status: 401 });
  const { data: profile } = await admin.from("profiles").select("status").eq("id", auth.user.id).single();
  if (profile?.status !== "active") return Response.json({ error: "Tài khoản không hoạt động." }, { status: 403 });

  const payload = await verifyContentToken(body.videoToken, tokenSecret);
  if (!payload || payload.sub !== auth.user.id) return Response.json({ error: "Token nội dung không hợp lệ hoặc đã hết hạn." }, { status: 403 });
  const { data: resource } = await admin.from("lesson_resources").select("id,title,resource_type,resource_url,allow_download").eq("id", payload.rid).single();
  if (!resource || resource.resource_type === "youtube") return Response.json({ error: "Không tìm thấy tài liệu PDF." }, { status: 404 });
  if (!resource.allow_download) return Response.json({ error: "Tài liệu này không được phép tải xuống." }, { status: 403 });

  const sourceResponse = await fetch(resource.resource_url, { headers: { accept: "application/pdf" } });
  if (!sourceResponse.ok) return Response.json({ error: "Không thể tải PDF nguồn." }, { status: 502 });
  const declaredSize = Number(sourceResponse.headers.get("content-length") || 0);
  if (declaredSize > MAX_PDF_BYTES) return Response.json({ error: "PDF vượt quá giới hạn 50 MB." }, { status: 413 });
  const source = new Uint8Array(await sourceResponse.arrayBuffer());
  if (source.byteLength > MAX_PDF_BYTES) return Response.json({ error: "PDF vượt quá giới hạn 50 MB." }, { status: 413 });
  if (new TextDecoder().decode(source.slice(0, 5)) !== "%PDF-") return Response.json({ error: "Nguồn tải xuống không phải PDF hợp lệ." }, { status: 422 });

  try {
    const output = await addWatermark(source, auth.user.email, downloadTimestamp());
    const filename = safeFilename(resource.title);
    return new Response(output, {
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

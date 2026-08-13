import type { SupabaseClient } from "@supabase/supabase-js";
import { ensureActiveAccount, securityAdminClient, type SecurityProfile } from "./security-server";
import { createR2ReadUrl } from "./r2-server";

export const EXAM_IMAGE_MAX_UPLOAD_BYTES = 12 * 1024 * 1024;
export const EXAM_IMAGE_MAX_STORED_BYTES = 8 * 1024 * 1024;
export const EXAM_IMAGE_SECTION_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
// The extension is derived from the uploaded image MIME type/name. Do not
// keep this as a short hard-coded list: browsers expose many valid image
// types (BMP, TIFF, HEIC, JXL, ICO, ...), and R2 can safely store them all.
export const EXAM_IMAGE_ASSET_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(?:[a-z0-9][a-z0-9-]{0,15})$/i;

export const examImageHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
  "cross-origin-resource-policy": "same-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

// Question assets are immutable UUID-named objects. Cache only successful
// asset responses (not admin JSON or error responses) in the candidate's own
// browser, with auth state included in the cache key.
export const examImageAssetHeaders = {
  ...examImageHeaders,
  "cache-control": "private, max-age=300, stale-while-revalidate=60",
  vary: "authorization, x-supabase-access-token, cookie, origin",
};

export const publicImageHeaders = {
  "cache-control": "public, max-age=31536000, immutable",
  "content-security-policy": "default-src 'none'; img-src 'self' data:; style-src 'unsafe-inline'",
  "cross-origin-resource-policy": "cross-origin",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
};

type ExamIdentity = { id: string; role: "student" | "admin" };

export async function requireActiveExamUser(request: Request) {
  const admin = securityAdminClient();
  if (!admin) {
    return { ok: false as const, response: Response.json({ error: "Chưa cấu hình máy chủ khảo thí." }, { status: 503, headers: examImageHeaders }) };
  }
  const security = await ensureActiveAccount(request, admin);
  if (!security.ok) return { ok: false as const, response: security.response };
  return {
    ok: true as const,
    admin,
    user: { id: security.user.id, role: security.profile.role === "admin" ? "admin" : "student" } satisfies ExamIdentity,
    profile: security.profile,
  };
}

export async function requireExamImageAdmin(request: Request) {
  const authentication = await requireActiveExamUser(request);
  if (!authentication.ok) return authentication;
  if (authentication.user.role !== "admin") {
    return { ok: false as const, response: Response.json({ error: "Chỉ quản trị viên mới được tải ảnh đề thi." }, { status: 403, headers: examImageHeaders }) };
  }
  return authentication;
}

export async function loadExamSectionAccess(
  admin: SupabaseClient,
  user: ExamIdentity,
  sectionId: string,
) {
  if (!EXAM_IMAGE_SECTION_PATTERN.test(sectionId)) return null;
  const { data: section } = await admin.from("exam_sections").select("id,exam_id").eq("id", sectionId).maybeSingle();
  if (!section) return null;
  const { data: exam } = await admin.from("exams").select("id,room_id,published").eq("id", section.exam_id).maybeSingle();
  if (!exam) return null;
  const { data: room } = await admin.from("exam_rooms").select("id,published,access_mode").eq("id", exam.room_id).maybeSingle();
  if (!room) return null;
  if (user.role === "admin") return { section, exam, room };
  if (!room.published || !exam.published) return null;
  if (room.access_mode === "open") return { section, exam, room };
  const { data: enrollment } = await admin
    .from("exam_room_enrollments")
    .select("room_id")
    .eq("room_id", room.id)
    .eq("student_id", user.id)
    .maybeSingle();
  return enrollment ? { section, exam, room } : null;
}

export function examImageKey(sectionId: string, assetName: string) {
  return `exam-images/${sectionId}/${assetName}`;
}

export function examImageUrl(sectionId: string, assetName: string) {
  return `/api/exam-images/${encodeURIComponent(sectionId)}/${encodeURIComponent(assetName)}`;
}

export function publicImageKey(assetName: string) {
  return `admin-images/${assetName}`;
}

const PUBLIC_IMAGE_PATH_PREFIX = "admin-images";

export function publicImageBaseUrl() {
  const value = process.env.R2_PUBLIC_URL?.trim();
  if (!value) return null;
  try {
    const url = new URL(value);
    if (url.protocol !== "http:" && url.protocol !== "https:") return null;
    return url.toString().replace(/\/+$/, "");
  } catch {
    return null;
  }
}

export async function publicImageUrl(assetName: string) {
  const baseUrl = publicImageBaseUrl();
  if (baseUrl) return `${baseUrl}/${PUBLIC_IMAGE_PATH_PREFIX}/${encodeURIComponent(assetName)}`;
  return createR2ReadUrl(publicImageKey(assetName));
}

const IMAGE_CONTENT_TYPES = {
  jpeg: "image/jpeg",
  png: "image/png",
  apng: "image/apng",
  gif: "image/gif",
  webp: "image/webp",
  svg: "image/svg+xml",
  avif: "image/avif",
  bmp: "image/bmp",
  tiff: "image/tiff",
  heic: "image/heic",
  heif: "image/heif",
  jxl: "image/jxl",
  jp2: "image/jp2",
  qoi: "image/qoi",
  ico: "image/x-icon",
  psd: "image/vnd.adobe.photoshop",
  xcf: "image/x-xcf",
} as const;

type StoredImageContentType = string;

const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  jpg: IMAGE_CONTENT_TYPES.jpeg,
  jpeg: IMAGE_CONTENT_TYPES.jpeg,
  jpe: IMAGE_CONTENT_TYPES.jpeg,
  jfif: IMAGE_CONTENT_TYPES.jpeg,
  png: IMAGE_CONTENT_TYPES.png,
  apng: IMAGE_CONTENT_TYPES.apng,
  gif: IMAGE_CONTENT_TYPES.gif,
  webp: IMAGE_CONTENT_TYPES.webp,
  svg: IMAGE_CONTENT_TYPES.svg,
  avif: IMAGE_CONTENT_TYPES.avif,
  bmp: IMAGE_CONTENT_TYPES.bmp,
  dib: IMAGE_CONTENT_TYPES.bmp,
  tif: IMAGE_CONTENT_TYPES.tiff,
  tiff: IMAGE_CONTENT_TYPES.tiff,
  heic: IMAGE_CONTENT_TYPES.heic,
  heics: IMAGE_CONTENT_TYPES.heic,
  heif: IMAGE_CONTENT_TYPES.heif,
  heifs: IMAGE_CONTENT_TYPES.heif,
  jxl: IMAGE_CONTENT_TYPES.jxl,
  jp2: IMAGE_CONTENT_TYPES.jp2,
  j2k: IMAGE_CONTENT_TYPES.jp2,
  jpf: IMAGE_CONTENT_TYPES.jp2,
  jpx: IMAGE_CONTENT_TYPES.jp2,
  jpm: IMAGE_CONTENT_TYPES.jp2,
  qoi: IMAGE_CONTENT_TYPES.qoi,
  ico: IMAGE_CONTENT_TYPES.ico,
  cur: IMAGE_CONTENT_TYPES.ico,
  mng: "image/x-mng",
  pcx: "image/x-pcx",
  tga: "image/x-tga",
  dds: "image/vnd-ms.dds",
  psd: "image/vnd.adobe.photoshop",
  xcf: "image/x-xcf",
  emf: "image/emf",
  wmf: "image/wmf",
  ras: "image/x-cmu-raster",
};

const IMAGE_EXTENSION_PATTERN = /^[a-z0-9][a-z0-9-]{0,15}$/i;

function ascii(bytes: Uint8Array, from: number, to: number) {
  return String.fromCharCode(...bytes.slice(from, to));
}

function hasBytes(bytes: Uint8Array, values: number[]) {
  return values.every((value, index) => bytes[index] === value);
}

function detectImageContentType(bytes: Uint8Array): StoredImageContentType | null {
  if (hasBytes(bytes, [0xff, 0xd8, 0xff])) return IMAGE_CONTENT_TYPES.jpeg;
  if (hasBytes(bytes, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return IMAGE_CONTENT_TYPES.png;
  if (ascii(bytes, 0, 6) === "GIF87a" || ascii(bytes, 0, 6) === "GIF89a") return IMAGE_CONTENT_TYPES.gif;
  if (ascii(bytes, 0, 4) === "RIFF" && ascii(bytes, 8, 12) === "WEBP") return IMAGE_CONTENT_TYPES.webp;
  if (ascii(bytes, 0, 2) === "BM") return IMAGE_CONTENT_TYPES.bmp;
  if (ascii(bytes, 0, 4) === "II*\u0000" || ascii(bytes, 0, 4) === "MM\u0000*") return IMAGE_CONTENT_TYPES.tiff;
  if (hasBytes(bytes, [0x00, 0x00, 0x01, 0x00]) || hasBytes(bytes, [0x00, 0x00, 0x02, 0x00])) return IMAGE_CONTENT_TYPES.ico;
  if (hasBytes(bytes, [0xff, 0x0a]) || ascii(bytes, 0, 4) === "\u0000\u0000\u0000\u000c" && ascii(bytes, 4, 8) === "JXL ") return IMAGE_CONTENT_TYPES.jxl;
  if (ascii(bytes, 0, 4) === "qoif") return IMAGE_CONTENT_TYPES.qoi;
  if (ascii(bytes, 0, 4) === "8BPS") return IMAGE_CONTENT_TYPES.psd;
  if (ascii(bytes, 0, 4) === "gimp") return IMAGE_CONTENT_TYPES.xcf;
  if (ascii(bytes, 4, 8) === "ftyp") {
    const brand = ascii(bytes, 8, 12).toLowerCase();
    if (["avif", "avis"].includes(brand)) return IMAGE_CONTENT_TYPES.avif;
    if (["heic", "heix", "hevc", "hevx"].includes(brand)) return IMAGE_CONTENT_TYPES.heic;
    if (["heif", "heis", "mif1", "msf1"].includes(brand)) return IMAGE_CONTENT_TYPES.heif;
  }
  const text = new TextDecoder().decode(bytes.slice(0, Math.min(bytes.byteLength, 4096))).replace(/^\uFEFF/, "").trim();
  if (/<svg(?:\s|>)/i.test(text)) return IMAGE_CONTENT_TYPES.svg;
  return null;
}

function contentTypeFromFileName(fileName: string) {
  const extension = fileName.toLowerCase().match(/\.([a-z0-9][a-z0-9-]{0,15})$/)?.[1];
  if (!extension || !IMAGE_EXTENSION_PATTERN.test(extension)) return null;
  return IMAGE_MIME_BY_EXTENSION[extension] ?? `image/${extension}`;
}

export function normalizeImageContentType(value: string | null | undefined): StoredImageContentType | null {
  const type = value?.split(";", 1)[0]?.trim().toLowerCase();
  if (!type || type === "image/*" || !/^image\/[a-z0-9][a-z0-9.+-]*$/i.test(type)) return null;
  const aliases: Record<string, string> = {
    "image/jpg": IMAGE_CONTENT_TYPES.jpeg,
    "image/pjpeg": IMAGE_CONTENT_TYPES.jpeg,
    "image/x-png": IMAGE_CONTENT_TYPES.png,
    "image/tif": IMAGE_CONTENT_TYPES.tiff,
    "image/ico": IMAGE_CONTENT_TYPES.ico,
    "image/vnd.microsoft.icon": IMAGE_CONTENT_TYPES.ico,
  };
  return aliases[type] ?? type;
}

export function imageContentTypeFromAsset(assetName: string) {
  return contentTypeFromFileName(assetName);
}

export function imageExtensionForContentType(contentType: StoredImageContentType, fileName = "") {
  const fileExtension = fileName.toLowerCase().match(/\.([a-z0-9][a-z0-9-]{0,15})$/)?.[1];
  if (fileExtension && IMAGE_EXTENSION_PATTERN.test(fileExtension)) return fileExtension;
  if (contentType === IMAGE_CONTENT_TYPES.jpeg) return "jpg";
  const subtype = contentType.slice("image/".length).toLowerCase();
  const extension = subtype === "svg+xml" ? "svg" : subtype.split(/[.+]/, 1)[0];
  return IMAGE_EXTENSION_PATTERN.test(extension) ? extension : "img";
}

export function imageResponseContentType(storedType: string | null | undefined, assetName: string) {
  return normalizeImageContentType(storedType) ?? imageContentTypeFromAsset(assetName) ?? "application/octet-stream";
}

export function validateImageUpload(bytes: Uint8Array, declaredType: string | null | undefined, fileName = "") {
  if (!bytes.byteLength) return { ok: false as const, error: "File ảnh rỗng." };
  const detectedType = detectImageContentType(bytes);
  const contentType = normalizeImageContentType(declaredType) ?? contentTypeFromFileName(fileName) ?? detectedType;
  if (!contentType) return { ok: false as const, error: "Chỉ hỗ trợ các định dạng ảnh." };

  if (contentType === IMAGE_CONTENT_TYPES.svg) {
    const source = new TextDecoder().decode(bytes);
    if (!/<svg(?:\s|>)/i.test(source)) return { ok: false as const, error: "File SVG không hợp lệ." };
    if (/<!doctype|<script\b|<iframe\b|<object\b|<embed\b|<foreignobject\b|\son[a-z0-9_-]+\s*=|javascript\s*:/i.test(source)) {
      return { ok: false as const, error: "SVG chứa nội dung không an toàn." };
    }
  } else if (detectedType && !compatibleImageTypes(detectedType, contentType)) {
    return { ok: false as const, error: "Định dạng file không khớp với nội dung ảnh." };
  }

  return {
    ok: true as const,
    bytes,
    contentType,
    extension: imageExtensionForContentType(contentType, fileName),
  };
}

function compatibleImageTypes(detectedType: string, declaredType: string) {
  if (detectedType === declaredType) return true;
  // APNG has the regular PNG signature; the MIME type is the only reliable
  // distinction available without decoding the PNG chunks.
  return (detectedType === IMAGE_CONTENT_TYPES.png && declaredType === IMAGE_CONTENT_TYPES.apng)
    || (detectedType === IMAGE_CONTENT_TYPES.apng && declaredType === IMAGE_CONTENT_TYPES.png);
}

export function safeImageAsset(value: unknown) {
  const asset = String(value ?? "");
  return EXAM_IMAGE_ASSET_PATTERN.test(asset) ? asset : null;
}

export type ExamImageSecurityProfile = SecurityProfile;

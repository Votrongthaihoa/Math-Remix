import { DeleteObjectCommand, GetObjectCommand, HeadObjectCommand, PutObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";

const R2_SCHEME = "r2:";

export function r2Config() {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

export function r2Client() {
  const config = r2Config();
  if (!config) return null;
  return {
    bucket: config.bucket,
    client: new S3Client({
      region: "auto",
      endpoint: `https://${config.accountId}.r2.cloudflarestorage.com`,
      credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
    }),
  };
}

export function r2Reference(key: string) {
  const config = r2Config();
  if (!config) throw new Error("R2 chưa được cấu hình.");
  const encodedKey = key.split("/").map(part => encodeURIComponent(part)).join("/");
  return `r2://${config.bucket}/${encodedKey}`;
}

export function r2Key(reference: string) {
  if (!reference.startsWith(`${R2_SCHEME}//`)) return null;
  try {
    const parsed = new URL(reference);
    const config = r2Config();
    if (!config || parsed.hostname !== config.bucket) return null;
    const key = parsed.pathname.split("/").filter(Boolean).map(part => decodeURIComponent(part)).join("/");
    return key && !key.includes("..") ? key : null;
  } catch {
    return null;
  }
}

export async function createPdfUpload(key: string) {
  const r2 = r2Client();
  if (!r2) throw new Error("R2 chưa được cấu hình trong .env.local.");
  const uploadUrl = await getSignedUrl(r2.client, new PutObjectCommand({
    Bucket: r2.bucket,
    Key: key,
    ContentType: "application/pdf",
    CacheControl: "private, no-store",
  }), { expiresIn: 120 });
  return { uploadUrl, reference: r2Reference(key), expiresIn: 120 };
}

export async function verifyPdfObject(key: string, expectedSize: number, maxBytes: number) {
  const r2 = r2Client();
  if (!r2) throw new Error("R2 chưa được cấu hình trong .env.local.");
  const result = await r2.client.send(new HeadObjectCommand({ Bucket: r2.bucket, Key: key }));
  const size = Number(result.ContentLength ?? 0);
  if (!size || size !== expectedSize || size > maxBytes) throw new Error("Kích thước PDF trên R2 không hợp lệ.");
  if (result.ContentType && result.ContentType !== "application/pdf") throw new Error("Object tải lên không phải PDF.");
  return r2Reference(key);
}

export async function deleteR2Object(key: string) {
  const r2 = r2Client();
  if (!r2) throw new Error("R2 chưa được cấu hình trong .env.local.");
  await r2.client.send(new DeleteObjectCommand({ Bucket: r2.bucket, Key: key }));
}

export async function loadPdfBytes(reference: string, maxBytes: number) {
  const key = r2Key(reference);
  if (key) {
    const r2 = r2Client();
    if (!r2) throw new Error("R2 chưa được cấu hình trong .env.local.");
    const result = await r2.client.send(new GetObjectCommand({ Bucket: r2.bucket, Key: key }));
    const declaredSize = Number(result.ContentLength ?? 0);
    if (declaredSize > maxBytes) throw new Error("PDF vượt quá giới hạn dung lượng.");
    if (!result.Body) throw new Error("R2 trả về nội dung rỗng.");
    const bytes = await result.Body.transformToByteArray();
    if (!bytes.byteLength || bytes.byteLength > maxBytes) throw new Error("PDF không có dữ liệu hoặc vượt quá giới hạn.");
    return new Uint8Array(bytes);
  }

  const response = await fetch(reference, { headers: { accept: "application/pdf", "accept-encoding": "identity" }, redirect: "follow", cache: "no-store" });
  if (!response.ok || !response.body) throw new Error("Không thể tải PDF nguồn.");
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > maxBytes) throw new Error("PDF vượt quá giới hạn dung lượng.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > maxBytes) throw new Error("PDF không có dữ liệu hoặc vượt quá giới hạn.");
  return bytes;
}

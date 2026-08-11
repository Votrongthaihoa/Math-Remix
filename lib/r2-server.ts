const R2_SCHEME = "r2:";
const R2_REGION = "auto";
const R2_SERVICE = "s3";
const MAX_PRESIGNED_URL_SECONDS = 7 * 24 * 60 * 60;
const encoder = new TextEncoder();

export type R2Config = {
  accountId: string;
  accessKeyId: string;
  secretAccessKey: string;
  bucket: string;
};

export function r2Config(): R2Config | null {
  const accountId = process.env.R2_ACCOUNT_ID?.trim();
  const accessKeyId = process.env.R2_ACCESS_KEY_ID?.trim();
  const secretAccessKey = process.env.R2_SECRET_ACCESS_KEY?.trim();
  const bucket = process.env.R2_BUCKET_NAME?.trim();
  if (!accountId || !accessKeyId || !secretAccessKey || !bucket) return null;
  return { accountId, accessKeyId, secretAccessKey, bucket };
}

// Kept as a small compatibility wrapper for callers that used the old SDK
// client factory. R2 requests are signed with fetch below so Vite never has
// to bundle the Node/browser variants of the AWS SDK together.
export function r2Client() {
  return r2Config();
}

function requireR2() {
  const config = r2Client();
  if (!config) throw new Error("R2 chưa được cấu hình trong .env.local.");
  return config;
}

function safePresignedExpiry(expiresIn: number) {
  return Math.min(MAX_PRESIGNED_URL_SECONDS, Math.max(1, Math.floor(expiresIn)));
}

function awsEncode(value: string) {
  const bytes = encoder.encode(value);
  let result = "";
  for (const byte of bytes) {
    const character = String.fromCharCode(byte);
    if ((byte >= 0x30 && byte <= 0x39)
      || (byte >= 0x41 && byte <= 0x5a)
      || (byte >= 0x61 && byte <= 0x7a)
      || character === "-" || character === "_" || character === "." || character === "~") {
      result += character;
    } else {
      result += `%${byte.toString(16).toUpperCase().padStart(2, "0")}`;
    }
  }
  return result;
}

function canonicalPath(config: R2Config, key: string) {
  const encodedBucket = awsEncode(config.bucket);
  const encodedKey = key
    .split("/")
    .map((part) => awsEncode(part))
    .join("/");
  return `/${encodedBucket}${encodedKey ? `/${encodedKey}` : ""}`;
}

function canonicalQuery(entries: Array<[string, string]>) {
  return entries
    .map(([name, value]) => [awsEncode(name), awsEncode(value)] as const)
    .sort(([leftName, leftValue], [rightName, rightValue]) => leftName.localeCompare(rightName) || leftValue.localeCompare(rightValue))
    .map(([name, value]) => `${name}=${value}`)
    .join("&");
}

function canonicalHeaderValue(value: string) {
  return value.trim().replace(/\s+/g, " ");
}

function canonicalHeaders(headers: Record<string, string>) {
  const normalized = Object.entries(headers)
    .map(([name, value]) => [name.toLowerCase(), canonicalHeaderValue(value)] as const)
    .sort(([left], [right]) => left.localeCompare(right));
  return {
    value: normalized.map(([name, value]) => `${name}:${value}\n`).join(""),
    signed: normalized.map(([name]) => name).join(";"),
  };
}

function bytesToHex(bytes: Uint8Array) {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}

async function sha256Hex(value: string | Uint8Array) {
  const bytes = typeof value === "string" ? encoder.encode(value) : value;
  const digest = await crypto.subtle.digest("SHA-256", bytes as unknown as BufferSource);
  return bytesToHex(new Uint8Array(digest));
}

async function hmac(key: Uint8Array, value: string) {
  const cryptoKey = await crypto.subtle.importKey(
    "raw",
    key as unknown as BufferSource,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"],
  );
  const signature = await crypto.subtle.sign("HMAC", cryptoKey, encoder.encode(value) as unknown as BufferSource);
  return new Uint8Array(signature);
}

async function signingKey(secretAccessKey: string, dateStamp: string) {
  const dateKey = await hmac(encoder.encode(`AWS4${secretAccessKey}`), dateStamp);
  const regionKey = await hmac(dateKey, R2_REGION);
  const serviceKey = await hmac(regionKey, R2_SERVICE);
  return hmac(serviceKey, "aws4_request");
}

function amzTimestamp(date: Date) {
  return date.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}Z$/, "Z");
}

function dateStamp(timestamp: string) {
  return timestamp.slice(0, 8);
}

function endpoint(config: R2Config) {
  return `https://${config.accountId}.r2.cloudflarestorage.com`;
}

type R2RequestOptions = {
  method: string;
  key: string;
  query?: Array<[string, string]>;
  headers?: Record<string, string>;
  body?: Uint8Array;
};

async function signedR2Request(config: R2Config, options: R2RequestOptions) {
  const timestamp = amzTimestamp(new Date());
  const requestDate = dateStamp(timestamp);
  const host = new URL(endpoint(config)).host;
  const body = options.body ?? new Uint8Array();
  const payloadHash = await sha256Hex(body);
  const headers: Record<string, string> = {
    host,
    "x-amz-content-sha256": payloadHash,
    "x-amz-date": timestamp,
    ...options.headers,
  };
  const headerSet = canonicalHeaders(headers);
  const query = canonicalQuery(options.query ?? []);
  const requestPath = canonicalPath(config, options.key);
  const canonicalRequest = [
    options.method.toUpperCase(),
    requestPath,
    query,
    headerSet.value,
    headerSet.signed,
    payloadHash,
  ].join("\n");
  const scope = `${requestDate}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  const signature = bytesToHex(await hmac(await signingKey(config.secretAccessKey, requestDate), stringToSign));
  const authorization = `AWS4-HMAC-SHA256 Credential=${config.accessKeyId}/${scope}, SignedHeaders=${headerSet.signed}, Signature=${signature}`;
  const requestHeaders = { ...headers, authorization };
  const url = `${endpoint(config)}${requestPath}${query ? `?${query}` : ""}`;
  return fetch(url, {
    method: options.method,
    headers: requestHeaders,
    body: options.method === "GET" || options.method === "HEAD" || options.method === "DELETE"
      ? undefined
      : body as unknown as BodyInit,
  });
}

type PresignedOptions = {
  expiresIn: number;
  headers?: Record<string, string>;
};

async function createPresignedR2Url(config: R2Config, method: string, key: string, options: PresignedOptions) {
  const timestamp = amzTimestamp(new Date());
  const requestDate = dateStamp(timestamp);
  const scope = `${requestDate}/${R2_REGION}/${R2_SERVICE}/aws4_request`;
  const host = new URL(endpoint(config)).host;
  const signedHeaderValues: Record<string, string> = { host, ...options.headers };
  const headerSet = canonicalHeaders(signedHeaderValues);
  const queryEntries: Array<[string, string]> = [
    ["X-Amz-Algorithm", "AWS4-HMAC-SHA256"],
    ["X-Amz-Credential", `${config.accessKeyId}/${scope}`],
    ["X-Amz-Date", timestamp],
    ["X-Amz-Expires", String(safePresignedExpiry(options.expiresIn))],
    ["X-Amz-SignedHeaders", headerSet.signed],
  ];
  const query = canonicalQuery(queryEntries);
  const requestPath = canonicalPath(config, key);
  const canonicalRequest = [
    method.toUpperCase(),
    requestPath,
    query,
    headerSet.value,
    headerSet.signed,
    "UNSIGNED-PAYLOAD",
  ].join("\n");
  const stringToSign = [
    "AWS4-HMAC-SHA256",
    timestamp,
    scope,
    await sha256Hex(canonicalRequest),
  ].join("\n");
  queryEntries.push(["X-Amz-Signature", bytesToHex(await hmac(await signingKey(config.secretAccessKey, requestDate), stringToSign))]);
  const finalQuery = canonicalQuery(queryEntries);
  return `${endpoint(config)}${requestPath}?${finalQuery}`;
}

async function throwR2ResponseError(response: Response): Promise<never> {
  const body = await response.text().catch(() => "");
  const code = body.match(/<Code>([^<]+)<\/Code>/i)?.[1];
  const message = body.match(/<Message>([^<]+)<\/Message>/i)?.[1];
  const detail = code && message ? `${code}: ${message}` : code || message || body.slice(0, 240).trim();
  throw new Error(`R2 request failed (${response.status})${detail ? `: ${detail}` : "."}`);
}

function decodeXml(value: string) {
  return value.replace(/&(#x[0-9a-f]+|#\d+|amp|lt|gt|quot|apos);/gi, (_match, entity: string) => {
    if (entity.toLowerCase() === "amp") return "&";
    if (entity.toLowerCase() === "lt") return "<";
    if (entity.toLowerCase() === "gt") return ">";
    if (entity.toLowerCase() === "quot") return '"';
    if (entity.toLowerCase() === "apos") return "'";
    const code = entity.toLowerCase().startsWith("#x")
      ? Number.parseInt(entity.slice(2), 16)
      : Number.parseInt(entity.slice(1), 10);
    return Number.isFinite(code) ? String.fromCodePoint(code) : _match;
  });
}

function xmlValue(xml: string, tag: string) {
  const value = xml.match(new RegExp(`<${tag}>([\\s\\S]*?)</${tag}>`, "i"))?.[1];
  return value === undefined ? null : decodeXml(value);
}

export function r2Reference(key: string) {
  const config = r2Config();
  if (!config) throw new Error("R2 chưa được cấu hình.");
  const encodedKey = key.split("/").map((part) => encodeURIComponent(part)).join("/");
  return `${R2_SCHEME}//${config.bucket}/${encodedKey}`;
}

export function r2Key(reference: string) {
  if (!reference.startsWith(`${R2_SCHEME}//`)) return null;
  try {
    const parsed = new URL(reference);
    const config = r2Config();
    if (!config || parsed.hostname !== config.bucket) return null;
    const key = parsed.pathname.split("/").filter(Boolean).map((part) => decodeURIComponent(part)).join("/");
    return key && !key.includes("..") ? key : null;
  } catch {
    return null;
  }
}

export async function createPdfUpload(key: string) {
  const config = requireR2();
  const uploadUrl = await createPresignedR2Url(config, "PUT", key, {
    expiresIn: 120,
    headers: { "content-type": "application/pdf" },
  });
  return { uploadUrl, reference: r2Reference(key), expiresIn: 120 };
}

export async function putR2Object(
  key: string,
  body: Uint8Array,
  contentType: string,
  cacheControl = "private, no-store",
  metadata?: Record<string, string>,
) {
  const config = requireR2();
  const headers: Record<string, string> = {
    "content-type": contentType,
    "cache-control": cacheControl,
  };
  for (const [name, value] of Object.entries(metadata ?? {})) {
    headers[`x-amz-meta-${name.toLowerCase()}`] = value;
  }
  const response = await signedR2Request(config, { method: "PUT", key, headers, body });
  if (!response.ok) await throwR2ResponseError(response);
}

export async function loadR2Object(key: string, maxBytes: number) {
  const config = requireR2();
  const response = await signedR2Request(config, { method: "GET", key });
  if (!response.ok) await throwR2ResponseError(response);
  const declaredSize = Number(response.headers.get("content-length") ?? 0);
  if (declaredSize > maxBytes) throw new Error("Object R2 vượt quá giới hạn dung lượng.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > maxBytes) throw new Error("Object R2 không có dữ liệu hoặc vượt quá giới hạn dung lượng.");
  return {
    bytes,
    contentType: response.headers.get("content-type") ?? "application/octet-stream",
    cacheControl: response.headers.get("cache-control"),
  };
}

export const R2_PRESIGNED_URL_EXPIRES_SECONDS = MAX_PRESIGNED_URL_SECONDS;

export async function createR2ReadUrl(key: string, expiresIn = R2_PRESIGNED_URL_EXPIRES_SECONDS) {
  return createPresignedR2Url(requireR2(), "GET", key, { expiresIn });
}

export async function verifyPdfObject(key: string, expectedSize: number, maxBytes: number) {
  const config = requireR2();
  const response = await signedR2Request(config, { method: "HEAD", key });
  if (!response.ok) await throwR2ResponseError(response);
  const size = Number(response.headers.get("content-length") ?? 0);
  if (!size || size !== expectedSize || size > maxBytes) throw new Error("Kích thước PDF trên R2 không hợp lệ.");
  const contentType = response.headers.get("content-type");
  if (contentType && contentType.split(";", 1)[0].trim().toLowerCase() !== "application/pdf") {
    throw new Error("Object tải lên không phải PDF.");
  }
  return r2Reference(key);
}

export async function deleteR2Object(key: string) {
  const response = await signedR2Request(requireR2(), { method: "DELETE", key });
  if (!response.ok) await throwR2ResponseError(response);
}

export type R2ObjectInfo = {
  key: string;
  size: number;
  lastModified: string | null;
};

export async function listR2Objects(prefix: string): Promise<R2ObjectInfo[]> {
  const config = requireR2();
  const objects: R2ObjectInfo[] = [];
  let continuationToken: string | undefined;
  do {
    const query: Array<[string, string]> = [["list-type", "2"], ["prefix", prefix]];
    if (continuationToken) query.push(["continuation-token", continuationToken]);
    const response = await signedR2Request(config, { method: "GET", key: "", query });
    if (!response.ok) await throwR2ResponseError(response);
    const xml = await response.text();
    for (const content of xml.match(/<Contents>[\s\S]*?<\/Contents>/gi) ?? []) {
      const key = xmlValue(content, "Key");
      if (!key) continue;
      const size = Number(xmlValue(content, "Size") ?? 0);
      const lastModified = xmlValue(content, "LastModified");
      objects.push({ key, size, lastModified });
    }
    continuationToken = xmlValue(xml, "IsTruncated")?.toLowerCase() === "true"
      ? xmlValue(xml, "NextContinuationToken") ?? undefined
      : undefined;
  } while (continuationToken);
  return objects;
}

export async function loadPdfBytes(reference: string, maxBytes: number) {
  const key = r2Key(reference);
  if (key) return (await loadR2Object(key, maxBytes)).bytes;

  const response = await fetch(reference, {
    headers: { accept: "application/pdf", "accept-encoding": "identity" },
    redirect: "follow",
    cache: "no-store",
  });
  if (!response.ok || !response.body) throw new Error("Không thể tải PDF nguồn.");
  const declaredSize = Number(response.headers.get("content-length") || 0);
  if (declaredSize > maxBytes) throw new Error("PDF vượt quá giới hạn dung lượng.");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (!bytes.byteLength || bytes.byteLength > maxBytes) throw new Error("PDF không có dữ liệu hoặc vượt quá giới hạn dung lượng.");
  return bytes;
}

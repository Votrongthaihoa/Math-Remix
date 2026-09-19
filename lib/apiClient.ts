import { activeSessionToken, trySsoRefresh } from "./auth-client";
import { apiRequestUrl } from "./api-url";

type FetchTransport = (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>;
type MaybePromise<T> = T | Promise<T>;

export type EncryptedPayloadEnvelope = {
  encrypted: true;
  version: "2.0" | "3.0";
  encryptedKey: string;
  encryptedData: string;
  iv?: string;
  additionalData?: string;
};

type UnwrappedKey = CryptoKey | Uint8Array | ArrayBuffer | { key: CryptoKey | Uint8Array | ArrayBuffer; iv?: Uint8Array | ArrayBuffer };
type PayloadDecryptOptions = {
  privateKey?: CryptoKey;
  key?: CryptoKey | Uint8Array | ArrayBuffer;
  unwrapKey?: (encryptedKey: Uint8Array, envelope: EncryptedPayloadEnvelope) => MaybePromise<UnwrappedKey>;
  compression?: string | null;
};

export type ApiRequestOptions = Omit<RequestInit, "body" | "method"> & {
  /** Encrypt this request with the client-level payload protector. */
  encrypt?: boolean;
  /** Disable the single auth retry for this request. */
  retryOnAuthFailure?: boolean;
};

export type ApiClientOptions = {
  fetch?: FetchTransport;
  baseUrl?: string;
  retryOnAuthFailure?: boolean;
  getAccessToken?: () => MaybePromise<string | null>;
  refreshAccessToken?: () => MaybePromise<unknown>;
  getClientId?: () => string | null;
  encryptPayload?: (payload: unknown) => MaybePromise<unknown>;
  decryptPayload?: (payload: unknown, response: Response) => MaybePromise<unknown>;
};

export type ApiClient = {
  request: (method: string, url: string, body?: unknown, options?: ApiRequestOptions) => Promise<Response>;
  GET: (url: string, options?: ApiRequestOptions) => Promise<Response>;
  POST: (url: string, body?: unknown, options?: ApiRequestOptions) => Promise<Response>;
  PUT: (url: string, body?: unknown, options?: ApiRequestOptions) => Promise<Response>;
  DELETE: (url: string, options?: ApiRequestOptions) => Promise<Response>;
  PATCH: (url: string, body?: unknown, options?: ApiRequestOptions) => Promise<Response>;
  POSTMultipart: (url: string, body: FormData, options?: ApiRequestOptions) => Promise<Response>;
};

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

function cryptoApi() {
  const value = globalThis.crypto;
  if (!value?.subtle) throw new Error("Web Crypto không khả dụng trong môi trường hiện tại.");
  return value;
}

function base64UrlEncode(value: ArrayBuffer | Uint8Array) {
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  const encoded = typeof btoa === "function" ? btoa(binary) : Buffer.from(bytes).toString("base64");
  return encoded.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlDecode(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = typeof atob === "function" ? atob(normalized) : Buffer.from(normalized, "base64").toString("binary");
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function isCryptoKey(value: unknown): value is CryptoKey {
  return typeof CryptoKey !== "undefined" && value instanceof CryptoKey;
}

async function importSymmetricKey(value: CryptoKey | Uint8Array | ArrayBuffer, algorithm: "AES-GCM" | "AES-CBC") {
  if (isCryptoKey(value)) return value;
  const bytes = value instanceof Uint8Array ? value : new Uint8Array(value);
  if (![16, 24, 32].includes(bytes.byteLength)) throw new Error(`Khóa ${algorithm} phải dài 128, 192 hoặc 256 bit.`);
  return cryptoApi().subtle.importKey("raw", bytes as BufferSource, { name: algorithm }, false, ["decrypt"]);
}

async function unwrapEnvelopeKey(envelope: EncryptedPayloadEnvelope, options: PayloadDecryptOptions, algorithm: "AES-GCM" | "AES-CBC") {
  const wrapped = base64UrlDecode(envelope.encryptedKey);
  let unwrapped: UnwrappedKey | undefined = options.key;
  if (!unwrapped && options.unwrapKey) unwrapped = await options.unwrapKey(wrapped, envelope);
  if (!unwrapped && options.privateKey) {
    if (options.privateKey.algorithm.name !== "RSA-OAEP") {
      throw new Error("Chỉ khóa RSA-OAEP được hỗ trợ bởi Web Crypto; legacy RSA PKCS#1 cần bộ giải mã tương thích phía ứng dụng.");
    }
    unwrapped = await cryptoApi().subtle.decrypt({ name: "RSA-OAEP" }, options.privateKey, wrapped as BufferSource);
  }
  if (!unwrapped) throw new Error("Thiếu khóa giải mã payload.");
  const material = typeof unwrapped === "object" && "key" in unwrapped ? unwrapped : { key: unwrapped };
  return { key: await importSymmetricKey(material.key, algorithm), iv: material.iv };
}

async function decompressIfNeeded(value: Uint8Array, compression?: string | null) {
  if (compression?.toLocaleLowerCase("en-US") !== "gzip") return value;
  if (typeof DecompressionStream === "undefined") throw new Error("Môi trường hiện tại không hỗ trợ giải nén gzip an toàn.");
  const stream = new Blob([value as BlobPart]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function parsePlaintext(value: Uint8Array) {
  const text = textDecoder.decode(value);
  try { return JSON.parse(text) as unknown; } catch { return text; }
}

/** Decrypt the preferred RSA-OAEP + AES-GCM v3 response envelope. */
export async function decryptV3Payload(envelope: EncryptedPayloadEnvelope, options: PayloadDecryptOptions = {}) {
  if (envelope.version !== "3.0") throw new Error("Payload không phải envelope v3.");
  if (!envelope.iv) throw new Error("Envelope v3 thiếu IV.");
  const { key } = await unwrapEnvelopeKey(envelope, options, "AES-GCM");
  const algorithm: AesGcmParams = { name: "AES-GCM", iv: base64UrlDecode(envelope.iv) as BufferSource, tagLength: 128 };
  if (envelope.additionalData) algorithm.additionalData = base64UrlDecode(envelope.additionalData) as BufferSource;
  const plaintext = await cryptoApi().subtle.decrypt(algorithm, key, base64UrlDecode(envelope.encryptedData) as BufferSource);
  return parsePlaintext(await decompressIfNeeded(new Uint8Array(plaintext), options.compression));
}

/**
 * Decrypt a legacy AES-CBC v2 response. The caller must supply an explicit
 * unwrap function when the upstream still uses RSA PKCS#1 v1.5; Web Crypto
 * intentionally does not implement that obsolete padding mode.
 */
export async function decryptV2Payload(envelope: EncryptedPayloadEnvelope, options: PayloadDecryptOptions = {}) {
  if (envelope.version !== "2.0") throw new Error("Payload không phải envelope v2.");
  const material = await unwrapEnvelopeKey(envelope, options, "AES-CBC");
  const iv = envelope.iv ? base64UrlDecode(envelope.iv) : material.iv ? new Uint8Array(material.iv) : null;
  if (!iv || iv.byteLength !== 16) throw new Error("Envelope v2 thiếu IV AES-CBC 128 bit.");
  const plaintext = await cryptoApi().subtle.decrypt({ name: "AES-CBC", iv: iv as BufferSource }, material.key, base64UrlDecode(envelope.encryptedData) as BufferSource);
  return parsePlaintext(await decompressIfNeeded(new Uint8Array(plaintext), options.compression));
}

/** Encrypt a request as an RSA-OAEP wrapped AES-GCM v3 envelope. */
export async function encryptV3Payload(payload: unknown, serverPublicKey: CryptoKey, additionalData?: Uint8Array) {
  if (serverPublicKey.algorithm.name !== "RSA-OAEP") throw new Error("Server public key phải dùng RSA-OAEP.");
  const webCrypto = cryptoApi();
  const aesKey = await webCrypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt"]);
  const iv = webCrypto.getRandomValues(new Uint8Array(12));
  const algorithm: AesGcmParams = { name: "AES-GCM", iv: iv as BufferSource, tagLength: 128 };
  if (additionalData) algorithm.additionalData = additionalData as BufferSource;
  const ciphertext = await webCrypto.subtle.encrypt(algorithm, aesKey, textEncoder.encode(JSON.stringify(payload)));
  const rawKey = await webCrypto.subtle.exportKey("raw", aesKey);
  const encryptedKey = await webCrypto.subtle.encrypt({ name: "RSA-OAEP" }, serverPublicKey, rawKey);
  return {
    encrypted: true,
    version: "3.0",
    encryptedKey: base64UrlEncode(encryptedKey),
    iv: base64UrlEncode(iv),
    encryptedData: base64UrlEncode(ciphertext),
    ...(additionalData ? { additionalData: base64UrlEncode(additionalData) } : {}),
  } satisfies EncryptedPayloadEnvelope;
}

function persistedClientId() {
  if (typeof window === "undefined") return null;
  try {
    const key = "mathremix.pro_client_id";
    const existing = window.localStorage.getItem(key)?.trim();
    if (existing) return existing;
    const created = cryptoApi().randomUUID();
    window.localStorage.setItem(key, created);
    return created;
  } catch { return null; }
}

function resolveUrl(url: string, baseUrl: string) {
  if (!baseUrl || /^(?:https?:)?\/\//i.test(url)) return apiRequestUrl(url);
  return apiRequestUrl(`${baseUrl.replace(/\/$/, "")}/${url.replace(/^\//, "")}`);
}

function copyResponse(response: Response, payload: unknown) {
  const headers = new Headers(response.headers);
  headers.set("content-type", "application/json; charset=utf-8");
  headers.delete("content-length");
  return new Response(JSON.stringify(payload), { status: response.status, statusText: response.statusText, headers });
}

async function decryptResponse(response: Response, decryptPayload?: ApiClientOptions["decryptPayload"]) {
  if (!decryptPayload || response.status === 204 || !response.headers.get("content-type")?.includes("json")) return response;
  const payload = await response.clone().json().catch(() => null) as unknown;
  if (!payload || typeof payload !== "object" || !("encrypted" in payload) || (payload as { encrypted?: unknown }).encrypted !== true) return response;
  return copyResponse(response, await decryptPayload(payload, response));
}

function serializeBody(body: unknown, headers: Headers) {
  if (body === undefined || body === null) return undefined;
  if (body instanceof FormData || body instanceof URLSearchParams || body instanceof Blob || typeof body === "string" || body instanceof ArrayBuffer || ArrayBuffer.isView(body)) {
    if (body instanceof FormData) headers.delete("content-type");
    return body as BodyInit;
  }
  headers.set("content-type", "application/json");
  return JSON.stringify(body);
}

export function createApiClient(options: ApiClientOptions = {}): ApiClient {
  const transport = options.fetch ?? globalThis.fetch?.bind(globalThis);
  if (!transport) throw new Error("Fetch API không khả dụng trong môi trường hiện tại.");
  const baseUrl = options.baseUrl?.trim() ?? "";
  let refreshPromise: Promise<unknown> | null = null;

  const refreshOnce = () => {
    if (!refreshPromise) {
      refreshPromise = Promise.resolve(options.refreshAccessToken?.()).catch(() => null).finally(() => { refreshPromise = null; });
    }
    return refreshPromise;
  };

  async function request(method: string, url: string, body?: unknown, requestOptions: ApiRequestOptions = {}) {
    const normalizedMethod = method.toUpperCase();
    const { encrypt = false, retryOnAuthFailure = options.retryOnAuthFailure ?? true, ...init } = requestOptions;
    const headers = new Headers(init.headers);
    headers.set("accept", "application/json");
    const token = (await options.getAccessToken?.())?.trim();
    if (token) {
      headers.set("authorization", `Bearer ${token}`);
      headers.set("x-supabase-access-token", token);
    }
    if (typeof window !== "undefined") {
      try {
        const deviceId = window.localStorage.getItem("remix.security.device-id.v1")?.trim() ?? "";
        const securitySessionId = window.sessionStorage.getItem("remix.security.learning-session.v1")?.trim() ?? "";
        if (/^[0-9a-f-]{36}$/i.test(deviceId)) headers.set("x-remix-device-id", deviceId);
        if (/^[0-9a-f-]{36}$/i.test(securitySessionId)) headers.set("x-remix-security-session-id", securitySessionId);
      } catch {
        // Storage is optional; server-side authentication still applies.
      }
    }
    const clientId = options.getClientId?.();
    if (clientId) headers.set("x-client-id", clientId);
    if (encrypt && body instanceof FormData) {
      throw new Error("Payload multipart không hỗ trợ mã hóa envelope.");
    }
    if (encrypt && !options.encryptPayload) {
      throw new Error("Yêu cầu mã hóa nhưng API client chưa được cấu hình bộ mã hóa payload.");
    }
    const protectedBody = encrypt ? await options.encryptPayload!(body) : body;
    const serializedBody = normalizedMethod === "GET" || normalizedMethod === "HEAD" ? undefined : serializeBody(protectedBody, headers);
    const requestInit: RequestInit = { ...init, method: normalizedMethod, headers, body: serializedBody };
    let response = await transport(resolveUrl(url, baseUrl), requestInit);
    const retryableAuthFailure = response.status === 401
      || response.status === 403 && (normalizedMethod === "GET" || normalizedMethod === "HEAD");
    if (retryableAuthFailure && retryOnAuthFailure) {
      await refreshOnce();
      const refreshedToken = (await options.getAccessToken?.())?.trim();
      // A permission 403 or an unsuccessful refresh must not duplicate a
      // mutating request. Replay only when refresh produced a new token that
      // can actually change the authorization outcome.
      if (refreshedToken && refreshedToken !== token) {
        const retryHeaders = new Headers(headers);
        retryHeaders.set("authorization", `Bearer ${refreshedToken}`);
        retryHeaders.set("x-supabase-access-token", refreshedToken);
        response = await transport(resolveUrl(url, baseUrl), { ...requestInit, headers: retryHeaders });
      }
    }
    return decryptResponse(response, options.decryptPayload);
  }

  return {
    request,
    GET: (url, requestOptions) => request("GET", url, undefined, requestOptions),
    POST: (url, body, requestOptions) => request("POST", url, body, requestOptions),
    PUT: (url, body, requestOptions) => request("PUT", url, body, requestOptions),
    DELETE: (url, requestOptions) => request("DELETE", url, undefined, requestOptions),
    PATCH: (url, body, requestOptions) => request("PATCH", url, body, requestOptions),
    POSTMultipart: (url, body, requestOptions) => request("POST", url, body, requestOptions),
  };
}

const defaultClient = createApiClient({
  getAccessToken: activeSessionToken,
  refreshAccessToken: trySsoRefresh,
  getClientId: persistedClientId,
});

export const GET = defaultClient.GET;
export const POST = defaultClient.POST;
export const PUT = defaultClient.PUT;
export const DELETE = defaultClient.DELETE;
export const PATCH = defaultClient.PATCH;
export const POSTMultipart = defaultClient.POSTMultipart;

// Compatibility aliases from the analyzed reference bundle.
export const i = GET;
export const o = POST;
export const c = PUT;
export const r = DELETE;
export const a = PATCH;
export const s = POSTMultipart;

export default defaultClient;

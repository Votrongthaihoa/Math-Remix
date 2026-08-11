export type ExamEnvelopeKind = "question" | "result";

export type ExamEnvelopeBinding = {
  version: 1;
  kind: ExamEnvelopeKind;
  attemptId: string;
  sectionId: string | null;
  index: number | null;
  nonce: string;
  expiresAt: string;
};

export type EncryptedExamEnvelope = {
  version: 1;
  algorithm: "ECDH-P256+HKDF-SHA256+A256GCM";
  serverPublicKey: JsonWebKey;
  salt: string;
  iv: string;
  aad: string;
  ciphertext: string;
  expiresAt: string;
};

export type ExpectedExamEnvelope = Omit<ExamEnvelopeBinding, "version" | "expiresAt">;

const encoder = new TextEncoder();
const decoder = new TextDecoder();
const BASE64URL_PATTERN = /^[A-Za-z0-9_-]+$/;

function bytesToBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function base64UrlToBytes(value: string, maxBytes = 2 * 1024 * 1024) {
  if (!value || !BASE64URL_PATTERN.test(value) || value.length > Math.ceil(maxBytes * 4 / 3) + 8) {
    throw new Error("Phong bì dữ liệu bài thi không hợp lệ.");
  }
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  if (binary.length > maxBytes) throw new Error("Phong bì dữ liệu bài thi vượt quá giới hạn.");
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function randomBytes(length: number) {
  const value = new Uint8Array(length);
  crypto.getRandomValues(value);
  return value;
}

export function createExamRequestNonce() {
  return bytesToBase64Url(randomBytes(18));
}

export function validateExamPublicKey(value: unknown): asserts value is JsonWebKey {
  if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Khóa phiên bài thi không hợp lệ.");
  const key = value as JsonWebKey;
  if (key.kty !== "EC" || key.crv !== "P-256" || typeof key.x !== "string" || typeof key.y !== "string") {
    throw new Error("Khóa phiên bài thi không hợp lệ.");
  }
  if (!BASE64URL_PATTERN.test(key.x) || !BASE64URL_PATTERN.test(key.y) || key.x.length > 64 || key.y.length > 64) {
    throw new Error("Khóa phiên bài thi không hợp lệ.");
  }
}

export async function createExamClientKeyPair() {
  return crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
}

export async function exportExamPublicKey(keyPair: CryptoKeyPair) {
  const publicKey = await crypto.subtle.exportKey("jwk", keyPair.publicKey);
  validateExamPublicKey(publicKey);
  return publicKey;
}

async function importPeerPublicKey(key: JsonWebKey) {
  validateExamPublicKey(key);
  return crypto.subtle.importKey("jwk", key, { name: "ECDH", namedCurve: "P-256" }, false, []);
}

async function deriveEnvelopeKey(privateKey: CryptoKey, peerPublicKey: CryptoKey, salt: Uint8Array, kind: ExamEnvelopeKind) {
  const sharedSecret = await crypto.subtle.deriveBits({ name: "ECDH", public: peerPublicKey }, privateKey, 256);
  const hkdfKey = await crypto.subtle.importKey("raw", sharedSecret, "HKDF", false, ["deriveKey"]);
  return crypto.subtle.deriveKey({
    name: "HKDF",
    hash: "SHA-256",
    salt: salt as BufferSource,
    info: encoder.encode(`remix-exam-content:v1:${kind}`),
  }, hkdfKey, { name: "AES-GCM", length: 256 }, false, ["encrypt", "decrypt"]);
}

export async function encryptExamPayload<T>(payload: T, clientPublicKey: JsonWebKey, binding: ExamEnvelopeBinding): Promise<EncryptedExamEnvelope> {
  validateExamPublicKey(clientPublicKey);
  const clientKey = await importPeerPublicKey(clientPublicKey);
  const serverKeyPair = await crypto.subtle.generateKey({ name: "ECDH", namedCurve: "P-256" }, false, ["deriveBits"]);
  const serverPublicKey = await crypto.subtle.exportKey("jwk", serverKeyPair.publicKey);
  const salt = randomBytes(16);
  const iv = randomBytes(12);
  const aadBytes = encoder.encode(JSON.stringify(binding));
  const key = await deriveEnvelopeKey(serverKeyPair.privateKey, clientKey, salt, binding.kind);
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aadBytes, tagLength: 128 }, key, encoder.encode(JSON.stringify(payload)));
  return {
    version: 1,
    algorithm: "ECDH-P256+HKDF-SHA256+A256GCM",
    serverPublicKey,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    aad: bytesToBase64Url(aadBytes),
    ciphertext: bytesToBase64Url(new Uint8Array(ciphertext)),
    expiresAt: binding.expiresAt,
  };
}

export async function decryptExamPayload<T>(envelope: EncryptedExamEnvelope, privateKey: CryptoKey, expected: ExpectedExamEnvelope): Promise<T> {
  if (envelope.version !== 1 || envelope.algorithm !== "ECDH-P256+HKDF-SHA256+A256GCM") {
    throw new Error("Phiên bản mã hóa đề thi không được hỗ trợ.");
  }
  const aadBytes = base64UrlToBytes(envelope.aad, 4096);
  let binding: ExamEnvelopeBinding;
  try {
    binding = JSON.parse(decoder.decode(aadBytes)) as ExamEnvelopeBinding;
  } catch {
    throw new Error("Thông tin xác thực dữ liệu bài thi không hợp lệ.");
  }
  if (binding.version !== 1
    || binding.kind !== expected.kind
    || binding.attemptId !== expected.attemptId
    || binding.sectionId !== expected.sectionId
    || binding.index !== expected.index
    || binding.nonce !== expected.nonce
    || binding.expiresAt !== envelope.expiresAt) {
    throw new Error("Dữ liệu bài thi không thuộc yêu cầu hiện tại.");
  }
  const expiresAt = new Date(binding.expiresAt).getTime();
  if (!Number.isFinite(expiresAt) || expiresAt + 30_000 < Date.now()) throw new Error("Dữ liệu bài thi đã hết hạn.");
  const serverKey = await importPeerPublicKey(envelope.serverPublicKey);
  const salt = base64UrlToBytes(envelope.salt, 64);
  const iv = base64UrlToBytes(envelope.iv, 32);
  if (salt.byteLength !== 16 || iv.byteLength !== 12) throw new Error("Tham số mã hóa đề thi không hợp lệ.");
  const key = await deriveEnvelopeKey(privateKey, serverKey, salt, binding.kind);
  try {
    const plaintext = await crypto.subtle.decrypt({ name: "AES-GCM", iv: iv as BufferSource, additionalData: aadBytes, tagLength: 128 }, key, base64UrlToBytes(envelope.ciphertext));
    return JSON.parse(decoder.decode(plaintext)) as T;
  } catch {
    throw new Error("Không thể xác thực hoặc giải mã dữ liệu bài thi.");
  }
}

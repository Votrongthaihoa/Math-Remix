export type CryptoEnvelopeV3 = {
  encrypted: true;
  version: "3.0";
  encryptedKey: string;
  iv: string;
  encryptedData: string;
  compression?: "gzip";
};

export type CryptoEnvelopeV2 = {
  encrypted: true;
  version?: "1.0" | "2.0";
  encryptedKey?: string;
  encryptedData?: string;
  data?: string;
  compression?: "gzip";
};

export type CryptoEnvelope = CryptoEnvelopeV3 | CryptoEnvelopeV2;

const CRYPTO_DATABASE = "aeck-crypto";
const CRYPTO_STORE = "keys";
const KEY_PAIR_ID = "keypair-v3";

export class CryptoSessionMissingError extends Error {
  readonly code = "CRYPTO_SESSION_MISSING";

  constructor(message = "Phiên bảo mật đã hết hạn. Vui lòng đăng nhập lại để cấp khóa mới.") {
    super(message);
    this.name = "CryptoSessionMissingError";
  }
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

function encodeBase64(value: ArrayBuffer) {
  const bytes = new Uint8Array(value);
  let binary = "";
  const chunkSize = 32_768;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  }
  return btoa(binary);
}

async function decodeJsonBuffer(buffer: ArrayBuffer, compression?: "gzip") {
  if (compression === "gzip") {
    if (typeof DecompressionStream !== "function") {
      throw new Error("Trình duyệt không hỗ trợ giải nén response bảo mật.");
    }
    const stream = new Blob([buffer]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text()) as unknown;
  }
  return JSON.parse(new TextDecoder().decode(buffer)) as unknown;
}

export async function decryptV3Envelope(
  envelope: CryptoEnvelopeV3,
  privateKey: CryptoKey,
) {
  const rawAesKey = await crypto.subtle.decrypt(
    { name: "RSA-OAEP" },
    privateKey,
    decodeBase64(envelope.encryptedKey),
  );
  const aesKey = await crypto.subtle.importKey(
    "raw",
    rawAesKey,
    { name: "AES-GCM" },
    false,
    ["decrypt"],
  );
  const clearBuffer = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: decodeBase64(envelope.iv) },
    aesKey,
    decodeBase64(envelope.encryptedData),
  );
  return decodeJsonBuffer(clearBuffer, envelope.compression);
}

function openCryptoDatabase() {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new CryptoSessionMissingError());
  }
  return new Promise<IDBDatabase>((resolve, reject) => {
    const request = indexedDB.open(CRYPTO_DATABASE, 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(CRYPTO_STORE)) {
        request.result.createObjectStore(CRYPTO_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function readCryptoKeyPair() {
  const database = await openCryptoDatabase();
  try {
    return await new Promise<CryptoKeyPair | null>((resolve, reject) => {
      const request = database
        .transaction(CRYPTO_STORE, "readonly")
        .objectStore(CRYPTO_STORE)
        .get(KEY_PAIR_ID);
      request.onsuccess = () => {
        const value = request.result as Partial<CryptoKeyPair> | undefined;
        resolve(value?.privateKey && value.publicKey ? value as CryptoKeyPair : null);
      };
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

async function writeCryptoKeyPair(keyPair: CryptoKeyPair) {
  const database = await openCryptoDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const request = database
        .transaction(CRYPTO_STORE, "readwrite")
        .objectStore(CRYPTO_STORE)
        .put(keyPair, KEY_PAIR_ID);
      request.onsuccess = () => resolve();
      request.onerror = () => reject(request.error);
    });
  } finally {
    database.close();
  }
}

export async function createCryptoV3KeyPair() {
  if (!globalThis.isSecureContext || !crypto?.subtle) {
    throw new Error("Thiết bị không hỗ trợ Web Crypto trong ngữ cảnh bảo mật.");
  }
  const keyPair = await crypto.subtle.generateKey(
    {
      name: "RSA-OAEP",
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: "SHA-256",
    },
    false,
    ["encrypt", "decrypt"],
  );
  await writeCryptoKeyPair(keyPair);
  return keyPair;
}

export async function exportCryptoV3PublicKey(keyPair: CryptoKeyPair) {
  return encodeBase64(await crypto.subtle.exportKey("spki", keyPair.publicKey));
}

export function isCryptoEnvelope(value: unknown): value is CryptoEnvelope {
  return Boolean(
    value &&
      typeof value === "object" &&
      "encrypted" in value &&
      (value as { encrypted?: unknown }).encrypted === true,
  );
}

export async function decryptCryptoEnvelope(value: unknown) {
  if (!isCryptoEnvelope(value)) return value;
  if (value.version === "3.0") {
    const keyPair = await readCryptoKeyPair();
    if (!keyPair) throw new CryptoSessionMissingError();
    return decryptV3Envelope(value, keyPair.privateKey);
  }
  const { decryptV2Envelope } = await import("./crypto-v2.ts");
  return decryptV2Envelope(value);
}

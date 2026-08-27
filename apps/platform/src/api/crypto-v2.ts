import CryptoJS from "crypto-js";

import type { CryptoEnvelopeV2 } from "./crypto-envelope.ts";
import { CryptoSessionMissingError } from "./crypto-envelope.ts";

const LEGACY_STORAGE_KEY = "aeck_client_private_key_encrypted";
const LEGACY_STORAGE_SECRET = "c994d3dfac9ce8f2f37c6f7a5fccae1c";

function legacyPrivateKey() {
  if (typeof localStorage === "undefined") return null;
  const encrypted = localStorage.getItem(LEGACY_STORAGE_KEY);
  if (!encrypted) return null;
  try {
    const value = CryptoJS.AES.decrypt(encrypted, LEGACY_STORAGE_SECRET).toString(CryptoJS.enc.Utf8);
    return value || null;
  } catch {
    return null;
  }
}

function bytesToWordArray(bytes: Uint8Array) {
  const words: number[] = [];
  for (let index = 0; index < bytes.length; index += 4) {
    words.push(
      ((bytes[index] ?? 0) << 24) |
        ((bytes[index + 1] ?? 0) << 16) |
        ((bytes[index + 2] ?? 0) << 8) |
        (bytes[index + 3] ?? 0),
    );
  }
  return CryptoJS.lib.WordArray.create(words, bytes.length);
}

function wordArrayToBytes(wordArray: CryptoJS.lib.WordArray) {
  const bytes = new Uint8Array(wordArray.sigBytes);
  for (let index = 0; index < wordArray.sigBytes; index += 1) {
    bytes[index] = (wordArray.words[index >>> 2] ?? 0) >>> (24 - (index % 4) * 8) & 0xff;
  }
  return bytes;
}

async function decodeLegacyPayload(clear: CryptoJS.lib.WordArray, compression?: "gzip") {
  if (compression === "gzip") {
    if (typeof DecompressionStream !== "function") {
      throw new Error("Trình duyệt không hỗ trợ giải nén response bảo mật.");
    }
    const bytes = wordArrayToBytes(clear);
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
    return JSON.parse(await new Response(stream).text()) as unknown;
  }
  const text = clear.toString(CryptoJS.enc.Utf8);
  if (!text) throw new Error("Không thể giải mã dữ liệu AES v2.");
  return JSON.parse(text) as unknown;
}

export async function decryptV2Envelope(envelope: CryptoEnvelopeV2) {
  const privateKey = legacyPrivateKey();
  if (!privateKey) throw new CryptoSessionMissingError();

  if (envelope.version === "2.0" && envelope.encryptedKey && envelope.encryptedData) {
    const { JSEncrypt } = await import("jsencrypt");
    const rsa = new JSEncrypt();
    rsa.setPrivateKey(privateKey);
    const material = rsa.decrypt(envelope.encryptedKey);
    if (!material) throw new CryptoSessionMissingError();

    const combined = Uint8Array.from(atob(material), (character) => character.charCodeAt(0));
    if (combined.length < 48) throw new Error("Khóa phiên v2 không hợp lệ.");
    const aesKey = bytesToWordArray(combined.slice(0, 32));
    const iv = bytesToWordArray(combined.slice(32, 48));
    const clear = CryptoJS.AES.decrypt(envelope.encryptedData, aesKey, {
      iv,
      mode: CryptoJS.mode.CBC,
      padding: CryptoJS.pad.Pkcs7,
    });
    return decodeLegacyPayload(clear, envelope.compression);
  }

  if (envelope.data) {
    const clear = CryptoJS.AES.decrypt(envelope.data, LEGACY_STORAGE_SECRET);
    return decodeLegacyPayload(clear, envelope.compression);
  }

  throw new Error("Response bảo mật v2 không hợp lệ.");
}

export type WatermarkTraceClaims = {
  userId: string;
  resourceId: string;
  issuedAt: string;
  ipHash: string;
};

export type WatermarkTraceResult =
  | { status: "matched"; marker: string; claims: WatermarkTraceClaims }
  | { status: "unmatched"; reason: "no_marker" | "invalid_marker" | "secret_unconfigured" | "visible_only"; visibleEmails: string[] };

const markerPrefix = "AECK-WM1:";
const markerPattern = /AECK-WM1:([A-Za-z0-9_-]{24,1024})/g;
const emailPattern = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function sign(payload: string, secret: string) {
  const key = await crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return toBase64Url(new Uint8Array(await crypto.subtle.sign("HMAC", key, encoder.encode(payload))));
}

function equalBytes(left: string, right: string) {
  if (left.length !== right.length) return false;
  let difference = 0;
  for (let index = 0; index < left.length; index += 1) difference |= left.charCodeAt(index) ^ right.charCodeAt(index);
  return difference === 0;
}

function safeClaims(value: unknown): WatermarkTraceClaims | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  const userId = typeof record.userId === "string" ? record.userId.trim() : "";
  const resourceId = typeof record.resourceId === "string" ? record.resourceId.trim() : "";
  const issuedAt = typeof record.issuedAt === "string" ? record.issuedAt.trim() : "";
  const ipHash = typeof record.ipHash === "string" ? record.ipHash.trim() : "";
  if (!userId || !resourceId || !issuedAt || !ipHash || !Number.isFinite(Date.parse(issuedAt))) return null;
  return { userId: userId.slice(0, 120), resourceId: resourceId.slice(0, 180), issuedAt, ipHash: ipHash.slice(0, 128) };
}

export async function createWatermarkTraceMarker(claims: WatermarkTraceClaims, secret: string) {
  if (!secret.trim()) throw new Error("WATERMARK_TRACE_SECRET is not configured.");
  const safe = safeClaims(claims);
  if (!safe) throw new Error("Invalid watermark trace claims.");
  const payload = toBase64Url(encoder.encode(JSON.stringify(safe)));
  const signature = await sign(payload, secret);
  return `${markerPrefix}${toBase64Url(encoder.encode(JSON.stringify({ payload, signature })))}`;
}

export async function parseWatermarkTrace(bytes: Uint8Array, secret: string): Promise<WatermarkTraceResult> {
  const source = new TextDecoder("latin1").decode(bytes);
  const visibleEmails = [...new Set(source.match(emailPattern) ?? [])].slice(0, 10);
  if (!secret.trim()) return { status: "unmatched", reason: "secret_unconfigured", visibleEmails };
  const matches = [...source.matchAll(markerPattern)];
  if (!matches.length) return { status: "unmatched", reason: visibleEmails.length ? "visible_only" : "no_marker", visibleEmails };

  for (const match of matches) {
    try {
      const envelope = JSON.parse(new TextDecoder().decode(fromBase64Url(match[1]))) as { payload?: unknown; signature?: unknown };
      if (typeof envelope.payload !== "string" || typeof envelope.signature !== "string") continue;
      const expected = await sign(envelope.payload, secret);
      if (!equalBytes(expected, envelope.signature)) continue;
      const claims = safeClaims(JSON.parse(new TextDecoder().decode(fromBase64Url(envelope.payload))));
      if (claims) return { status: "matched", marker: `${markerPrefix}${match[1]}`, claims };
    } catch {
      // Continue scanning. A copied or partially stripped marker must never
      // be treated as a positive attribution.
    }
  }
  return { status: "unmatched", reason: "invalid_marker", visibleEmails };
}

export function watermarkTraceSecret() {
  return process.env.WATERMARK_TRACE_SECRET?.trim()
    || process.env.VIDEO_TOKEN_SECRET?.trim()
    || process.env.CONTENT_TOKEN_SECRET?.trim()
    || "";
}

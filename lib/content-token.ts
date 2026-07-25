type ContentTokenPayload = {
  rid: string;
  sub: string;
  exp: number;
  iat: number;
};

const encoder = new TextEncoder();

function toBase64Url(bytes: Uint8Array) {
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(normalized);
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

async function getKey(secret: string, usages: KeyUsage[]) {
  return crypto.subtle.importKey("raw", encoder.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, usages);
}

export async function signContentToken(resourceId: string, userId: string, secret: string, lifetimeSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const header = toBase64Url(encoder.encode(JSON.stringify({ alg: "HS256", typ: "JWT" })));
  const payload = toBase64Url(encoder.encode(JSON.stringify({ rid: resourceId, sub: userId, iat: now, exp: now + lifetimeSeconds })));
  const unsigned = `${header}.${payload}`;
  const signature = await crypto.subtle.sign("HMAC", await getKey(secret, ["sign"]), encoder.encode(unsigned));
  return `${unsigned}.${toBase64Url(new Uint8Array(signature))}`;
}

export async function verifyContentToken(token: string, secret: string): Promise<ContentTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3) return null;
  const unsigned = `${parts[0]}.${parts[1]}`;
  const valid = await crypto.subtle.verify("HMAC", await getKey(secret, ["verify"]), fromBase64Url(parts[2]), encoder.encode(unsigned));
  if (!valid) return null;
  try {
    const payload = JSON.parse(new TextDecoder().decode(fromBase64Url(parts[1]))) as ContentTokenPayload;
    if (!payload.rid || !payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

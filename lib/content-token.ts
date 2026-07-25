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
  const digest = await crypto.subtle.digest("SHA-256", encoder.encode(secret));
  return crypto.subtle.importKey("raw", digest, { name: "AES-GCM" }, false, usages);
}

export async function signContentToken(resourceId: string, userId: string, secret: string, lifetimeSeconds = 300) {
  const now = Math.floor(Date.now() / 1000);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const plaintext = encoder.encode(JSON.stringify({ rid: resourceId, sub: userId, iat: now, exp: now + lifetimeSeconds }));
  const encrypted = await crypto.subtle.encrypt({ name: "AES-GCM", iv }, await getKey(secret, ["encrypt"]), plaintext);
  return `v1.${toBase64Url(iv)}.${toBase64Url(new Uint8Array(encrypted))}`;
}

export async function verifyContentToken(token: string, secret: string): Promise<ContentTokenPayload | null> {
  const parts = token.split(".");
  if (parts.length !== 3 || parts[0] !== "v1") return null;
  try {
    const decrypted = await crypto.subtle.decrypt({ name: "AES-GCM", iv: fromBase64Url(parts[1]) }, await getKey(secret, ["decrypt"]), fromBase64Url(parts[2]));
    const payload = JSON.parse(new TextDecoder().decode(decrypted)) as ContentTokenPayload;
    if (!payload.rid || !payload.sub || !payload.exp || payload.exp <= Math.floor(Date.now() / 1000)) return null;
    return payload;
  } catch {
    return null;
  }
}

type TurnstileVerificationOptions = {
  token: string;
  remoteIp?: string;
  secret: string;
  expectedAction: string;
  allowedHostnames: Set<string>;
  fetcher?: typeof fetch;
};

type TurnstileResult =
  | { ok: true; hostname: string }
  | { ok: false; reason: "configuration" | "invalid_token" | "network" | "rejected" | "action_mismatch" | "hostname_mismatch" };

export async function verifyTurnstile({
  token,
  remoteIp,
  secret,
  expectedAction,
  allowedHostnames,
  fetcher = fetch,
}: TurnstileVerificationOptions): Promise<TurnstileResult> {
  if (!secret || !expectedAction || !allowedHostnames.size) return { ok: false, reason: "configuration" };
  if (!token || token.length > 2048) return { ok: false, reason: "invalid_token" };
  let response: Response;
  try {
    response = await fetcher("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ secret, response: token, ...(remoteIp ? { remoteip: remoteIp } : {}) }),
      signal: AbortSignal.timeout(10_000),
    });
    if (!response.ok) return { ok: false, reason: "network" };
  } catch {
    return { ok: false, reason: "network" };
  }
  const result = await response.json().catch(() => null) as { success?: unknown; action?: unknown; hostname?: unknown } | null;
  if (!result?.success) return { ok: false, reason: "rejected" };
  if (result.action !== expectedAction) return { ok: false, reason: "action_mismatch" };
  if (typeof result.hostname !== "string" || !allowedHostnames.has(result.hostname)) return { ok: false, reason: "hostname_mismatch" };
  return { ok: true, hostname: result.hostname };
}

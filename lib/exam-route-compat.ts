/** Add the dynamic section id to the consolidated exam API payload. */
export async function requestWithSectionId(request: Request, sectionId: string, defaults: Record<string, unknown> = {}) {
  const raw = await request.text();
  let parsed: Record<string, unknown> = {};
  try {
    const value = JSON.parse(raw) as unknown;
    if (value && typeof value === "object" && !Array.isArray(value)) parsed = value as Record<string, unknown>;
  } catch {
    // Preserve an invalid payload so the delegated route returns its normal
    // JSON validation error instead of silently accepting it.
    return new Request(request, { body: raw });
  }
  const headers = new Headers(request.headers);
  headers.set("content-type", "application/json");
  return new Request(request, {
    headers,
    body: JSON.stringify({ ...parsed, ...defaults, sectionId }),
  });
}

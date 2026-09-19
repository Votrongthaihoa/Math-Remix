import { expect, test as base, type BrowserContext } from "@playwright/test";

type RequestEvidence = { method: string; origin: string; pathname: string; kind: string };
type Boundary = {
  blocked: RequestEvidence[];
  synthetic: RequestEvidence[];
  expectedBlocked: string[];
  restoreStudent: () => Promise<void>;
};

export const test = base.extend<{ boundary: Boundary }>({
  boundary: [async ({ context, baseURL }, runFixture, testInfo) => {
    if (!baseURL || !["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname)) {
      throw new Error("Public/admin synthetic tests require an explicit loopback base URL");
    }
    const appOrigin = new URL(baseURL).origin;
    const configured = process.env.NEXT_PUBLIC_SUPABASE_URL || "https://synthetic.supabase.test";
    const authOrigin = new URL(configured).origin;
    if (new URL(authOrigin).hostname !== "synthetic.supabase.test") {
      throw new Error("Public/admin fixture only accepts NEXT_PUBLIC_SUPABASE_URL=https://synthetic.supabase.test");
    }
    const blocked: RequestEvidence[] = [];
    const synthetic: RequestEvidence[] = [];
    const unexpected: RequestEvidence[] = [];
    const expectedBlocked: string[] = [];
    const user = { id: "public-fixture-student", email: "student@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
    const record = (method: string, url: URL, kind: string) => ({ method, origin: url.origin, pathname: url.pathname, kind });
    await context.route("**/*", async route => {
      const req = route.request();
      const url = new URL(req.url());
      const evidence = record(req.method(), url, req.resourceType());
      const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
      if (url.origin === authOrigin) {
        synthetic.push(evidence);
        if (req.method() === "GET" && url.pathname === "/auth/v1/user") return json(user);
        if (req.method() === "POST" && url.pathname === "/auth/v1/logout") return route.fulfill({ status: 204 });
        if (req.method() === "GET" && url.pathname === "/rest/v1/profiles") return json({ id: user.id, full_name: "Học viên tổng hợp", student_code: "SYNTHETIC", role: "student", status: "active", account_status: "active", banned_until: null });
        if (req.method() === "GET" && url.pathname === "/rest/v1/course_enrollments") return json([]);
        unexpected.push(evidence);
        return route.abort("blockedbyclient");
      }
      if (url.origin !== appOrigin) {
        blocked.push(evidence);
        return route.abort("blockedbyclient");
      }
      // Never let a same-origin API handler proxy a request to a real backend.
      // These scenarios need no application API, writes, or exam content.
      if (url.pathname.startsWith("/api/")) {
        unexpected.push(evidence);
        return route.abort("blockedbyclient");
      }
      return route.continue();
    });
    await context.routeWebSocket("**/*", socket => {
      const url = new URL(socket.url());
      const httpOrigin = `${url.protocol === "wss:" ? "https:" : "http:"}//${url.host}`;
      if (httpOrigin === appOrigin) { socket.connectToServer(); return; }
      blocked.push(record("WEBSOCKET", url, "websocket"));
      socket.close();
    });
    const restoreStudent = () => installStudentSession(context, configured, user);
    try {
      await runFixture({ blocked, synthetic, expectedBlocked, restoreStudent });
    } finally {
      await testInfo.attach("outbound-network-boundary", { body: JSON.stringify({ blocked, synthetic, unexpected }, null, 2), contentType: "application/json" });
      expect(unexpected, "Unexpected API/auth calls were aborted, never sent to a backend").toEqual([]);
      expect(blocked.map(item => `${item.origin}${item.pathname}`), "External browser requests were aborted; only the explicit guard self-test may occur").toEqual(expectedBlocked);
    }
  }, { auto: true }],
});

async function installStudentSession(context: BrowserContext, configured: string, user: Record<string, unknown>) {
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const access_token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expires_at, role: "authenticated" })}.synthetic-signature`;
  await context.addInitScript(({ key, value }) => localStorage.setItem(key, JSON.stringify(value)), {
    key: `sb-${new URL(configured).hostname.split(".")[0]}-auth-token`,
    value: { access_token, refresh_token: "synthetic-no-service-token", expires_at, expires_in: 3600, token_type: "bearer", user },
  });
}

export { expect };

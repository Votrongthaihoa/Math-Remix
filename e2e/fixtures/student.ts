import { type BrowserContext } from "@playwright/test";

export const course = { id: "flow-course", title: "Tư duy Toán học TSA", description: "Khóa học tổng hợp thử nghiệm", cover_url: null, cover_color: "red", published: true };
export const chapter = { id: "flow-chapter", course_id: course.id, title: "Hàm số", sort_order: 0 };
export const lesson = { id: "flow-lesson", chapter_id: chapter.id, title: "Bài học thử nghiệm", description: "", published: true, sort_order: 0 };
export const continueItem = { lessonId: lesson.id, lessonTitle: lesson.title, courseTitle: course.title, updatedAt: "2026-09-10T08:00:00Z" };
export const resources = [
  { id: "flow-resource-a", title: "Tài liệu tổng hợp thử nghiệm", resource_type: "storage_pdf", allow_download: false, sort_order: 0, videoToken: "synthetic-a" },
  { id: "flow-resource-b", title: "Tài liệu bổ sung thử nghiệm", resource_type: "storage_pdf", allow_download: false, sort_order: 1, videoToken: "synthetic-b" },
];
type FixtureState = {
  payload: unknown; status: number; raw: string | null; delay: number;
  lessonStatus: number; lessonError: string; chapterStatus: number;
  resourceStatus: number; resourceError: string; resources: typeof resources;
  tokenStatus: number; tokenError: string;
  blockedRequests: string[]; externalResponses: string[]; apiRequests: string[];
};
const installed = new WeakMap<BrowserContext, FixtureState>();
export const studentFixtureState = (context: BrowserContext) => installed.get(context);

/** Entirely synthetic browser fixture. No requests may reach production APIs. */
export async function installStudentFixture(context: BrowserContext, baseURL: string) {
  const configured = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!configured) throw new Error("Student fixture requires NEXT_PUBLIC_SUPABASE_URL matching the test build");
  const origin = new URL(baseURL).origin;
  if (!["localhost", "127.0.0.1", "[::1]"].includes(new URL(baseURL).hostname)) throw new Error("Student fixtures only run on loopback");
  const authOrigin = new URL(configured).origin;
  if (!/\.(test|invalid)$/.test(new URL(configured).hostname)) throw new Error("Student fixtures require an explicit synthetic .test or .invalid auth origin");
  const expires_at = Math.floor(Date.now() / 1000) + 3600;
  const user = { id: "flow-student", email: "student@example.test", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" };
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString("base64url");
  const token = `${encode({ alg: "HS256", typ: "JWT" })}.${encode({ sub: user.id, exp: expires_at, role: "authenticated" })}.mock-signature`;
  await context.addInitScript(({ key, session }) => { localStorage.setItem(key, JSON.stringify(session)); }, {
    key: `sb-${new URL(configured).hostname.split(".")[0]}-auth-token`,
    session: { access_token: token, refresh_token: "synthetic", expires_at, expires_in: 3600, token_type: "bearer", user },
  });
  const state: FixtureState = {
    payload: { item: null }, status: 200, raw: null, delay: 0,
    lessonStatus: 200, lessonError: "Không tìm thấy bài học thử nghiệm.", chapterStatus: 200,
    resourceStatus: 200, resourceError: "Không thể tải nội dung bài học thử nghiệm.", resources: [],
    tokenStatus: 404, tokenError: "Không tìm thấy tài liệu thử nghiệm.",
    blockedRequests: [], externalResponses: [], apiRequests: [],
  };
  installed.set(context, state);
  context.on("response", response => {
    const url = new URL(response.url());
    if (![origin, authOrigin].includes(url.origin)) state.externalResponses.push(`${url.origin}${url.pathname}`);
  });
  await context.routeWebSocket("**/*", socket => {
    const url = new URL(socket.url());
    if (["localhost", "127.0.0.1", "[::1]"].includes(url.hostname)) socket.connectToServer();
    else { state.blockedRequests.push(`${url.origin}${url.pathname}`); socket.close(); }
  });
  await context.route("**/*", async route => {
    const url = new URL(route.request().url());
    const json = (body: unknown, status = 200) => route.fulfill({ status, contentType: "application/json", body: JSON.stringify(body) });
    // Check origin BEFORE endpoint dispatch: an external /api path must not be
    // silently fulfilled or allowed to reach a real service.
    if (![origin, authOrigin].includes(url.origin)) {
      state.blockedRequests.push(`${url.origin}${url.pathname}`);
      return route.abort("blockedbyclient");
    }
    if (url.origin === authOrigin) {
      if (url.pathname === "/auth/v1/user") return json(user);
      if (url.pathname.startsWith("/auth/")) return json({ error: "Synthetic auth endpoint unavailable" }, 401);
      const table = url.pathname.replace("/rest/v1/", "");
      if (table === "profiles") return json({ ...user, full_name: "Học viên thử nghiệm", student_code: "TEST001", status: "active", role: "student" });
      if (table === "course_enrollments") return json([{ course_id: course.id, courses: course }]);
      if (table === "courses") return json([course]);
      if (table === "chapters") {
        // The shell first asks only for ids to compute course counts, then the
        // course-detail surface asks for title/order. Fail only the latter so
        // this fixture exercises CourseDetail's retry state instead of hiding
        // the course during bootstrap.
        const select = url.searchParams.get("select") ?? "";
        const isCourseDetailQuery = select.includes("title");
        return !isCourseDetailQuery || state.chapterStatus === 200
          ? json([chapter])
          : json({ code: "SYNTHETIC", message: "Không thể tải chương thử nghiệm." }, state.chapterStatus);
      }
      if (table === "lessons") {
        if (state.lessonStatus !== 200) return json({ code: "SYNTHETIC", message: state.lessonError }, state.lessonStatus);
        return json(url.searchParams.has("id") ? { ...lesson, chapters: { ...chapter, courses: { title: course.title } } } : [lesson]);
      }
      return json([]);
    }
    // Includes any configured separate API origin; do not forward credentials.
    if (url.pathname.startsWith("/api/")) {
      state.apiRequests.push(`${route.request().method()} ${url.pathname}${url.search}`);
      if (url.pathname === "/api/learning/continue") {
        if (route.request().method() === "POST") { state.payload = { item: continueItem }; return json({ ok: true }); }
        const snapshot = { ...state };
        if (snapshot.delay) await new Promise(resolve => setTimeout(resolve, snapshot.delay));
        return snapshot.raw === null ? json(snapshot.payload, snapshot.status) : route.fulfill({ status: snapshot.status, contentType: "application/json", body: snapshot.raw });
      }
      if (url.pathname === "/api/security/session") return json({ allowed: true, exempt: true, serverTime: new Date().toISOString() });
      if (url.pathname === "/api/exams") return json({ rooms: [], exams: [], attempts: [] });
      if (url.pathname === "/api/lesson-resources") return state.resourceStatus === 200
        ? json({ resources: state.resources, curriculum: [{ ...chapter, lessons: [{ ...lesson, resources: state.resources }] }] })
        : json({ error: state.resourceError }, state.resourceStatus);
      if (url.pathname === "/api/video-token") return json({ error: state.tokenError }, state.tokenStatus);
      return json({ error: "Unimplemented synthetic endpoint" }, 404);
    }
    if (url.origin !== origin) return route.abort();
    return route.continue();
  });
  return state;
}

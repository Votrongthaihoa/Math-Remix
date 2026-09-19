import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("product shell navigation exposes state and keyboard menu behavior", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /className="header-sidebar-toggle"[\s\S]*?aria-controls="main-sidebar"/);
  assert.match(platform, /id="account-menu"/);
  assert.match(platform, /className="account-dropdown"/);
  assert.match(platform, /data-account-menu-item/);
  assert.match(platform, /event\.key === "ArrowDown"/);
  assert.match(platform, /className=\{`student-nav-primary/);
  assert.doesNotMatch(platform, /className=\{`student-nav-disclosure/);
  assert.match(platform, /!examRunnerSurface && !protectedProductSurface && <a className="skip-link"/);
  assert.match(platform, /const currentView = viewFromPath\(pathname\)/);
  assert.doesNotMatch(platform, /const \[view, setView\]/);
  assert.match(platform, /const lastFocusedRouteRef = useRef<string \| null>\(null\)/);
  assert.match(platform, /const popstateNavigationRef = useRef\(false\)/);
  assert.match(platform, /if \(!preserveScrollPosition\) window\.scrollTo/);
  assert.match(platform, /previousPath === null \|\| previousPath === pathname \|\| uiRouteMode === "protected"/);
  assert.match(platform, /element\.inert = true/);
  assert.match(platform, /const original = element\.inert;/);
  assert.match(platform, /element\.inert = original;/);
  assert.match(platform, /aria-label="Vị trí hiện tại"/);
});

test("student sidebar routes directly to the room and course catalogues", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /<Link key="exams" href="\/exam-room"/);
  assert.match(platform, /<Link key="courses" href="\/courses"/);
  assert.doesNotMatch(platform, /availableExamTypes\.map\(type =>/);
  assert.doesNotMatch(platform, /student-nav-children/);
  assert.doesNotMatch(platform, /\["HSA", "QDA", "BCA"\] as const/);
});

test("course shell removes demo copy and exposes cover management", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");
  const coverRoute = await readFile(new URL("../app/api/admin/course-covers/route.ts", import.meta.url), "utf8");
  const publicCoverRoute = await readFile(new URL("../app/api/course-covers/[asset]/route.ts", import.meta.url), "utf8");

  assert.doesNotMatch(platform, /LEARNING SERIES/);
  assert.match(platform, /courseCoverPicker|course-cover-upload/);
  assert.match(platform, /course-covers/);
  assert.match(platform, /detail \? 960 : 640/);
  assert.match(platform, /detail \? 540 : 360/);
  assert.match(coverRoute, /export async function POST/);
  assert.match(coverRoute, /export async function DELETE/);
  assert.match(coverRoute, /putR2Object/);
  assert.match(coverRoute, /deleteR2Object/);
  assert.match(coverRoute, /readJsonBody<\{ courseId\?: unknown \}>\(request, 8 \* 1024\)/);
  assert.match(coverRoute, /payload_too_large/);
  assert.match(coverRoute, /readMultipartFormData\(request, COURSE_COVER_MAX_UPLOAD_BYTES \+ MULTIPART_OVERHEAD_BYTES\)/);
  assert.match(coverRoute, /consumeRequestBudget/);
  assert.match(coverRoute, /retry-after/);
  assert.match(platform, /onError=\{\(\) => setCoverPreviewErrorUrl\(coverUrl\)\}/);
  assert.match(publicCoverRoute, /function decodeAsset/);
});

test("admin course builder navigation preserves the selected course deep link", async () => {
  const [platform, routeMap] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-route-map.ts", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /function navigateAdmin\(path: string\)/);
  assert.match(platform, /setManagedCourseId\(adminCourseIdFromPath\(path\)\)/);
  assert.match(routeMap, /function adminCourseIdFromPath/);
  assert.match(routeMap, /admin\/content\/courses/);
});

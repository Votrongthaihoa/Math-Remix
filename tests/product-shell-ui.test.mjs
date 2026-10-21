import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("product-shell UX layer stays outside protected exam UI", async () => {
  const css = await readFile(new URL("../app/product-shell-ux.css", import.meta.url), "utf8");

  assert.match(css, /\.ui-shell\.student-app\.product-shell/);
  assert.match(css, /\.ui-shell\.admin-app\.product-shell/);
  assert.doesNotMatch(css, /\.exam-shell|\.exam-room|\.guest-exam|\.question-bank/);
});

test("AECK tokens and primitives are isolated from protected exam surfaces", async () => {
  const [css, components] = await Promise.all([
    readFile(new URL("../app/aeck-ui.css", import.meta.url), "utf8"),
    readFile(new URL("../app/aeck-ui.tsx", import.meta.url), "utf8"),
  ]);

  const selectors = css
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .match(/[^{}]+(?=\{)/g)
    ?.flatMap(group => group.split(",").map(selector => selector.trim())) ?? [];
  const productShellSelectors = selectors.filter(selector => selector.includes(".product-shell"));

  assert.ok(productShellSelectors.length > 0);
  productShellSelectors.forEach(selector => {
    assert.ok(selector.includes(".ui-optimized-surface") || selector.includes(".ui-optimized-chrome"), selector);
    if (selector.includes(".ui-optimized-chrome")) {
      assert.doesNotMatch(selector, /\.main-content|\.product-content-surface/);
    }
  });
  assert.doesNotMatch(
    selectors.join("\n"),
    /\.(?:exam-|question-|answer-|exam-result|review-|solution-|admin-exam-|guest-exam)[\w-]*/i,
  );
  assert.match(css, /--aeck-primary: #b5122b/);
  assert.match(css, /--aeck-focus: #b5122b/);
  assert.match(css, /\.dashboard-next-step-action[\s\S]*?background: var\(--aeck-primary\)/);
  assert.match(css, /\.overview-list-card \.dot\.blue[\s\S]*?background: var\(--aeck-primary\)/);
  assert.doesNotMatch(css, /(^|\n)\s*(button|input|textarea|select|body|h1)\s*[{,]/m);
  assert.match(components, /AeckPageHeader/);
  assert.match(components, /AeckDialog/);
  assert.match(components, /AeckPagination/);
});

test("student activity month labels have a narrow-screen fallback", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /heatmap-month-short/);
  assert.match(platform, /aria-label=\{`Tháng \$\{index \+ 1\}`\}/);
  assert.match(platform, /role="img" aria-label=\{`Biểu đồ hoạt động năm/);
  assert.doesNotMatch(platform, /aria-label=\{inYear \? detail/);
});

test("dashboard provides one semantic next-step action without entering protected exam UI", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-shell-ux.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /const nextStep = nextRoom/);
  assert.match(platform, /<Link className="dashboard-next-step-action"/);
  assert.match(platform, /<h1>\{profile\.full_name\}<\/h1>/);
  assert.match(platform, /<b>Bài thi IRT<\/b>/);
  assert.match(css, /\.dashboard-next-step-action/);
  assert.match(css, /\.student-app\.product-shell:not\(\.protected-exam-surface\) \.dashboard-next-step/);
});

test("product-shell smoke can focus on requested routes without unrelated interactions", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /SMOKE_EXTENDED_INTERACTIONS/);
  assert.match(smoke, /const focusedAudit = requestedRoutes\.size > 0/);
  assert.match(smoke, /!focusedAudit \|\| requestedRoutes\.has\("student-exam-list"\)/);
  assert.match(smoke, /if \(extendedInteractions\) \{/);
  assert.match(smoke, /SMOKE_RESOURCE_MODAL/);
  assert.match(smoke, /inspectCourseResourceModal/);
});

test("protected UI regression uses the four repository validation viewports", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /const protectedRegressionWidths = \[1440, 768, 390, 320\]/);
  assert.match(smoke, /for \(const \[widthIndex, width\] of protectedRegressionWidths\.entries\(\)\)/);
  assert.match(smoke, /inspect\(name, path, width, width === 1440 \|\| width === 390, expectedSurface, widthIndex > 0\)/);
  assert.match(smoke, /\["protected-guest-exam", "\/exam\/mock-guest-token-12345", "\.guest-exam-page"\]/);
  assert.match(smoke, /\["protected-legacy-guest-exam", "\/guest\/exam\/mock-guest-token-12345", "\.guest-exam-page"\]/);
  for (const name of [
    "protected-account-exam-dashboard",
    "protected-account-exam-confirm",
    "protected-account-exam-runner",
    "protected-exam-result",
    "protected-admin-exam-catalog",
    "protected-admin-room-new",
    "protected-admin-room-workspace",
    "protected-admin-room-edit",
    "protected-admin-exam-new",
    "protected-admin-exam-workspace",
    "protected-admin-exam-access",
    "protected-admin-exam-policy",
    "protected-admin-question-new",
    "protected-admin-question-edit",
    "protected-admin-section-editor",
    "protected-admin-exam-preview",
    "protected-admin-section-preview",
    "protected-admin-session-results",
  ]) assert.ok(smoke.includes(`"${name}"`), `protected smoke missing ${name}`);
  assert.match(smoke, /if \(authenticated && protectedAuditRequested\)/);
  assert.match(smoke, /expectedSurface/);
  assert.match(smoke, /requestUrl\.pathname === "\/api\/guest-exams"/);
  assert.match(smoke, /requestUrl\.pathname === "\/api\/exams\/content"/);
  assert.match(smoke, /requestUrl\.pathname === "\/api\/exams\/result-content"/);
  assert.match(smoke, /requestUrl\.pathname === "\/api\/admin\/exam-content"/);
  assert.match(smoke, /\.guest-exam-page/);
});

test("standalone admin previews expose the protected visual marker without changing preview internals", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /admin-exam-preview-host protected-exam-surface/);
  assert.match(platform, /standaloneAdminPreview[\s\S]*?<AdminExamManager/);
});

test("browser smoke retries snapshots interrupted by intentional route reloads", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /function isNavigationSnapshotRace/);
  assert.match(smoke, /Execution context was destroyed/);
  assert.match(smoke, /for \(let attempt = 0; attempt < 3; attempt \+= 1\)/);
  assert.match(smoke, /await page\.waitForLoadState\("domcontentloaded"\)/);
});

test("courses use native links and curriculum list semantics", async () => {
  const [platform, productCss] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-ui-v2.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /<Link className="course-card-action flex flex-col flex-1 text-inherit no-underline" href=\{href\}/);
  assert.doesNotMatch(platform, /<button className="course-card-action"/);
  assert.match(platform, /<ul className="ant-list-items m-0 p-0 list-none">/);
  assert.match(platform, /<li className="ant-list-item[^"]*" key=\{lesson\.id\}><Link/);
  assert.match(productCss, /\.course-part-lessons > li > a/);
});

test("student shell exposes URL-backed shortcuts and functional course view modes", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-shell-ux.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /className="dashboard-shortcuts"/);
  assert.match(platform, /href="\/courses"/);
  assert.match(platform, /href="\/progress"/);
  assert.match(platform, /href="\/tkb"/);
  assert.match(platform, /const courseView = searchParams\.get\("view"\) === "list"/);
  assert.match(platform, /router\.push\(`\$\{pathname\}\$\{nextQuery/);
  assert.match(platform, /course-list-view/);
  assert.match(css, /\.dashboard-shortcuts-grid/);
  assert.match(css, /\.course-view-toggle/);
  assert.match(css, /\.reference-course-grid\.course-list-view\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/s);
  assert.match(css, /\.course-list-view\s*>\s*\.ant-card\s*>\s*\.course-card-action\s*\{[^}]*display:\s*grid;[^}]*grid-template-columns:\s*minmax\(180px,\s*250px\)\s*minmax\(0,\s*1fr\);/s);
  assert.match(css, /@media \(max-width: 420px\)\s*\{[\s\S]*?\.course-list-view\s*>\s*\.ant-card\s*>\s*\.course-card-action\s*\{[^}]*grid-template-columns:\s*minmax\(0,\s*1fr\);/);
});

test("admin quick actions connect to real modals and routes", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/product-shell-ux.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /className="admin-quick-actions"/);
  assert.match(platform, /setModal\(true\)/);
  assert.match(platform, /setCourseModal\(true\)/);
  assert.match(platform, /href="\/admin\/sessions\/new"/);
  assert.match(platform, /href="\/admin\/upload"/);
  assert.match(css, /\.admin-quick-actions-grid/);
  assert.match(css, /\.admin-quick-action/);
  assert.match(css, /\.admin-workflow-strip > a/);
});

test("public registration stays inside the AECK app", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account-auth-reference.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /className="login-signup-link"/);
  assert.match(platform, /href="\/login\?intent=register"/);
  assert.match(platform, /function SignupPage/);
  assert.match(platform, /supabase\.auth\.signUp\(/);
  assert.match(platform, /authMode === "signup"[\s\S]*?Đăng ký tài khoản \| AECK/);
  assert.doesNotMatch(platform, /account\.aeck\.vn\/signup/);
  assert.match(css, /\.login-page\.ui-auth-surface\.account-auth-reference \.login-signup-link/);
  assert.doesNotMatch(platform, /className="login-portal-switch"/);
});

test("registration validation identifies and focuses the field that needs correction", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account-auth-reference.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /type SignupErrorField = "name" \| "password" \| "confirmPassword" \| null/);
  assert.match(platform, /function focusSignupField/);
  assert.match(platform, /useEffect\(\(\) => \{[\s\S]*?document\.getElementById\(`signup-\$\{p\.signupErrorField === "confirmPassword" \? "confirm-password" : p\.signupErrorField\}`\)\?\.focus\(\)/);
  assert.match(platform, /aria-invalid=\{p\.signupErrorField === "confirmPassword" \? true : undefined\}/);
  assert.match(platform, /aria-describedby=\{p\.signupErrorField === "confirmPassword" \? "signup-confirm-password-error" : undefined\}/);
  assert.match(platform, /id="signup-confirm-password-error" className="login-field-error" role="alert"/);
  assert.ok((platform.match(/setSignupErrorField\(null\)/g) ?? []).length >= 4);
  assert.match(css, /\.login-field-error/);
});

test("account menu identifies the session and completes local sign-out even when revocation is unconfirmed", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account-learning-polish.css", import.meta.url), "utf8"),
  ]);
  const accountMenuCss = css.slice(0, css.indexOf("/* Alpha reference student sidebar"));

  assert.match(platform, /async function logoutFromAccountMenu/);
  assert.match(platform, /signOut\(\{ scope: "local" \}\)/);
  assert.match(platform, /let logoutWarning = false/);
  assert.match(platform, /logoutWarning=1/);
  assert.match(platform, /router\.replace\(logoutDestination\)/);
  assert.match(platform, /className="account-dropdown-identity"/);
  assert.match(platform, /signingOut \? "Đang đăng xuất…" : "Đăng xuất"/);
  assert.match(css, /\.app-shell\.ui-shell\.product-shell[^\n]*\.account-dropdown-identity/);
  assert.match(css, /--learning-danger:\s*#b4232f/);
  assert.match(css, /background:\s*var\(--alpha-accent-selected\)/);
  assert.doesNotMatch(accountMenuCss, /#158a39|#127534|#18231c/);
  assert.doesNotMatch(css, /\.exam-shell|\.question|\.answer|\.result|\.review|\.solution/);
});

test("account menu opens from arrow keys and closes when focus leaves", async () => {
  const [platform, smoke] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /handleAccountTriggerKeyDown/);
  assert.match(platform, /event\.key === "ArrowDown" \|\| event\.key === "ArrowUp"/);
  assert.match(platform, /document\.addEventListener\("focusin", closeOnFocusOutside\)/);
  assert.match(platform, /document\.removeEventListener\("focusin", closeOnFocusOutside\)/);
  assert.match(smoke, /const accountMenuPath = mockRole === "admin" \? "\/admin" : "\/dashboard"/);
  assert.match(smoke, /if \(mockRole === "admin"[\s\S]*?await inspectAccountMenu\(\)/);
});

test("learner reference topbar uses the supplied name-only trigger while admin keeps its avatar", async () => {
  const [learningCss, referenceCss] = await Promise.all([
    readFile(new URL("../app/account-learning-polish.css", import.meta.url), "utf8"),
    readFile(new URL("../app/student-reference-fidelity.css", import.meta.url), "utf8"),
  ]);

  assert.match(referenceCss, /> \.topbar \.account-trigger > \.account-avatar\s*\{[^}]*display:\s*none;/s);
  assert.match(learningCss, /\.app-shell\.ui-shell\.admin-app\.product-shell\.alpha-reference-surface \.account-trigger > \.account-avatar/);
  assert.match(learningCss, /display:\s*grid/);
});

test("account menu stacking context stays above product content", async () => {
  const css = await readFile(new URL("../app/account-learning-polish.css", import.meta.url), "utf8");

  assert.match(css, /\.app-shell\.ui-shell\.product-shell:not\(\.protected-exam-surface\) > \.topbar\s*\{[^}]*z-index:\s*80/s);
});

test("lesson viewer gives video and documents a complete learning hierarchy", async () => {
  const [platform, player, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account-learning-polish.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /className="study-lesson-context"/);
  assert.match(platform, /id="study-lesson-title"/);
  assert.doesNotMatch(platform, /className="study-resource-meta"/);
  assert.match(platform, /aria-live="polite"/);
  assert.match(player, /className="secure-viewer-state error" role="alert"/);
  assert.match(player, /onRetry=\{retryVideoSource\}/);
  assert.match(css, /\.real-lesson-page \.lesson-layout/);
  assert.match(css, /@media \(max-width: 1199px\)/);
});

test("browser smoke renders real lesson video and PDF resource states", async () => {
  const smoke = await readFile(new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url), "utf8");

  assert.match(smoke, /requestUrl\.pathname === "\/api\/lesson-resources"/);
  assert.match(smoke, /requestUrl\.pathname === "\/api\/video-token"/);
  assert.match(smoke, /requestUrl\.pathname === "\/api\/resource-content"/);
  assert.match(smoke, /requestUrl\.pathname === "\/api\/security\/session"/);
  assert.match(smoke, /expectedMockFailureMessages/);
  assert.match(smoke, /lessonContext === `Bài \$\{mockLessonRows\[0\]\.sort_order \+ 1\}: \$\{mockLessonRows\[0\]\.title\}`/);
  assert.match(smoke, /inspectLessonResources/);
});

test("course detail exposes a clear first learning action", async () => {
  const [platform, css] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/account-learning-polish.css", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /const firstCourseLesson = courseLessons\[0\]/);
  assert.match(platform, /className="course-study-primary-action"/);
  assert.match(platform, /Bắt đầu học/);
  assert.match(platform, /className="course-study-facts"/);
  assert.match(css, /\.course-study-primary-action/);
});

test("course content loaders always settle and ignore superseded routes", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /async function loadCourseContent\(\)[\s\S]*?try \{[\s\S]*?finally \{\s*if \(!cancelled\) setLoadingContent\(false\);/);
  assert.match(platform, /async function loadLesson\(\)[\s\S]*?resourceResult\.json\(\)\.catch\(\(\) => null\)[\s\S]*?finally \{\s*if \(!cancelled\) setLessonLoading\(false\);/);
  assert.match(platform, /setLesson\(null\); setResources\(\[\]\); setCurriculum\(\[\]\); setSelectedResourceId\(""\);/);
  assert.match(platform, /const accessToken = await activeSessionToken\(\)\.catch\(\(\) => null\);\s*if \(cancelled\) return;/);
});

test("secure lesson viewer cancels stale requests and owns temporary downloads", async () => {
  const player = await readFile(new URL("../app/video-player.tsx", import.meta.url), "utf8");

  assert.match(player, /const pendingDownloadUrlsRef = useRef\(new Map<string, number>\(\)\)/);
  assert.match(player, /for \(const \[url, timer\] of pendingDownloadUrlsRef\.current\)[\s\S]*?window\.clearTimeout\(timer\);[\s\S]*?URL\.revokeObjectURL\(url\);/);
  assert.match(player, /const \{ data: userData \} = await supabase\.auth\.getUser\(accessToken\);\s*if \(cancelled\) return;\s*const accountEmail = userData\.user\?\.email\?\.trim\(\);[\s\S]*?setWatermarkEmail\(accountEmail\);/);
  assert.ok((player.match(/const controller = new AbortController\(\);/g) ?? []).length >= 3);
  assert.ok((player.match(/signal: controller\.signal/g) ?? []).length >= 3);
  assert.ok((player.match(/controller\.abort\(\)/g) ?? []).length >= 3);
});

test("history empty states announce filter results", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /<EmptyState icon=\{History\}[\s\S]*?role="status" ariaLive="polite"/);
});

test("dashboard list dots align with the center of their linked labels", async () => {
  const css = await readFile(new URL("../app/text-overflow-polish.css", import.meta.url), "utf8");

  assert.match(css, /\.overview-list-card li,[\s\S]*?align-items: center;/);
  assert.match(css, /\.overview-list-card li > \.dot[\s\S]*?margin-top: 0;/);
});

test("collapsed admin logo is centered on the vertical sidebar", async () => {
  const css = await readFile(new URL("../app/admin-product-shell.css", import.meta.url), "utf8");

  assert.match(css, /\.ui-shell\.admin-app\.product-shell:not\(\.sidebar-expanded\) \.header-brand\s*\{[\s\S]*?width:\s*84px;[\s\S]*?margin-inline-start:\s*-34px;[\s\S]*?justify-content:\s*center;/);
});

test("mobile admin drawer centers its logo without covering the close button", async () => {
  const css = await readFile(new URL("../app/admin-product-shell.css", import.meta.url), "utf8");

  assert.match(css, /@media \(max-width: 767px\)[\s\S]*?\.ui-shell\.admin-app\.product-shell \.mobile-sidebar-head\s*\{[\s\S]*?position:\s*relative;[\s\S]*?justify-content:\s*flex-end;[\s\S]*?\.ui-shell\.admin-app\.product-shell \.mobile-sidebar-brand\s*\{[\s\S]*?position:\s*absolute;[\s\S]*?inset-inline-start:\s*50%;[\s\S]*?width:\s*min\(200px,\s*calc\(100%\s*-\s*120px\)\);[\s\S]*?transform:\s*translateX\(-50%\);[\s\S]*?\.ui-shell\.admin-app\.product-shell \.mobile-sidebar-brand img\s*\{[\s\S]*?width:\s*100%;[\s\S]*?\.ui-shell\.admin-app\.product-shell \.mobile-sidebar-close\s*\{[\s\S]*?position:\s*relative;[\s\S]*?z-index:\s*1;/);
});

test("admin student roster reports bounded email pagination and keeps mobile actions compact", async () => {
  const [platform, css, roster] = await Promise.all([
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-source-reference.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-student-roster.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(platform, /const \[adminUsersTruncated, setAdminUsersTruncated\] = useState\(false\)/);
  assert.match(platform, /tab === "students" && <AdminStudentRoster[\s\S]*?truncated=\{adminUsersTruncated\}/);
  assert.match(roster, /truncated && <p className="student-data-warning"/);
  assert.match(roster, /aria-label=\{`Đổi mật khẩu cho \$\{student\.full_name\}`\}/);
  assert.match(css, /@media \(max-width: 575px\)[\s\S]*?student-table \.student-password-btn[\s\S]*?width: 36px[\s\S]*?font-size: 0/);
  assert.match(css, /student-table \.student-password-btn[\s\S]*?:not\(\.protected-exam-surface\)/);
});

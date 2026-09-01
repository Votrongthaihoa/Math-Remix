import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const platformUrl = new URL("../app/platform.tsx", import.meta.url);
const learningCssUrl = new URL("../app/account-learning-polish.css", import.meta.url);
const smokeUrl = new URL("../scripts/product-shell-ui-smoke.mjs", import.meta.url);

test("lesson routes expose an isolated study-mode product shell", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /currentView === "lesson" \? "study-mode" : ""/);
});

test("lesson curriculum exposes an accessible mobile sheet trigger", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /className="study-curriculum-trigger"/);
  assert.match(source, /aria-controls="lesson-curriculum-panel"/);
  assert.match(source, /aria-expanded=\{curriculumOpen\}/);
});

test("curriculum sheet lifecycle matches the 1199px responsive layout", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /matchMedia\("\(max-width: 1199px\)"\)/);
});

test("study mode uses the measured 80/288 shell and 400px curriculum", async () => {
  const css = await readFile(learningCssUrl, "utf8");

  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\)\s*\{[\s\S]*?--study-sidebar-collapsed:\s*80px;[\s\S]*?--study-sidebar-expanded:\s*288px;/);
  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\)[\s\S]*?\.lesson-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) var\(--study-curriculum-width\);[\s\S]*?gap:\s*32px;/);
});

test("study shell remaps legacy brand red aliases to the green study palette", async () => {
  const css = await readFile(learningCssUrl, "utf8");
  const studyRoot = css.slice(css.indexOf(".app-shell.ui-shell.student-app.product-shell.study-mode:not(.protected-exam-surface) {"));

  assert.match(studyRoot, /--red:\s*var\(--study-accent\);/);
  assert.match(studyRoot, /--red-dark:\s*var\(--study-accent-hover\);/);
});

test("tablet study layout keeps an accessible global navigation trigger", async () => {
  const css = await readFile(learningCssUrl, "utf8");
  const compactStart = css.indexOf("@media (max-width: 1199px)");
  const mobileStart = css.indexOf("@media (max-width: 575px)", compactStart);
  const compactCss = css.slice(compactStart, mobileStart);

  assert.match(compactCss, /\.study-mobile-menu\s*\{[\s\S]*?display:\s*grid;/);
});

test("study mode starts with the compact rail", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /const \[studySidebarOpen, setStudySidebarOpen\] = useState\(false\)/);
});

test("study mode does not expose a desktop sidebar resize control", async () => {
  const [source, css] = await Promise.all([
    readFile(platformUrl, "utf8"),
    readFile(learningCssUrl, "utf8"),
  ]);

  assert.doesNotMatch(source, /className="study-sidebar-toggle"/);
  assert.doesNotMatch(css, /\.study-sidebar-toggle/);
});

test("study sidebar state is isolated from the wider product shell", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /const \[productSidebarOpen, setProductSidebarOpen\] = useState\(true\)/);
  assert.match(source, /const \[studySidebarOpen, setStudySidebarOpen\] = useState\(false\)/);
  assert.match(source, /currentView === "lesson" \? studySidebarOpen : productSidebarOpen/);
});

test("lesson data resolves the active course in the global sidebar", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /onCourseResolved\(chapter\?\.course_id \?\? ""\)/);
  assert.match(source, /currentView === "lesson" \? resolvedLessonCourseId : routeCourseId/);
});

test("study chrome leaves the first 72px to the lesson breadcrumb", async () => {
  const css = await readFile(learningCssUrl, "utf8");

  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\)\s*>\s*\.topbar\s*\{[^}]*display:\s*none;/s);
  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\)[\s\S]*?\.lesson-breadcrumb\s*\{[^}]*min-height:\s*72px;[^}]*height:\s*72px;/);
});

test("only study mode renders a dedicated sidebar brand beneath the hidden topbar", async () => {
  const [source, css] = await Promise.all([
    readFile(platformUrl, "utf8"),
    readFile(learningCssUrl, "utf8"),
  ]);

  assert.match(source, /currentView === "lesson"\s*&&\s*<Link className="student-sidebar-brand"/);
  assert.match(css, /:not\(\.study-mode\)[\s\S]*?>\s*\.sidebar\s+nav\.student-sidebar-nav\s*\{[^}]*padding:\s*112px 0 16px;/);
});

test("expanded product sidebar follows the flat Alpha reference geometry", async () => {
  const css = await readFile(learningCssUrl, "utf8");

  assert.match(css, /\.alpha-reference-surface:not\(\.protected-exam-surface\)[\s\S]*?\.student-sidebar-nav\s*>\s*\.student-nav-primary,\s*[\s\S]*?\.student-sidebar-nav\s*>\s*\.student-nav-disclosure\s*>\s*summary\s*\{[^}]*padding:\s*12px 16px 12px 24px;[^}]*border-inline-end:\s*3px solid transparent;[^}]*border-radius:\s*0;/);
  assert.match(css, /\.student-sidebar-nav\s*>\s*\.student-nav-disclosure\s*>\s*summary\s*\{[^}]*padding:\s*12px 16px 12px 24px;[^}]*border-inline-end:\s*3px solid transparent;[^}]*font-weight:\s*400;/);
  assert.match(css, /\.student-sidebar-nav\s*>\s*\.student-nav-disclosure\s*>\s*summary\s*\{[^}]*min-height:\s*48px;/);
  assert.match(css, /\.student-nav-primary\.active,\s*[\s\S]*?\.student-nav-disclosure\.active-parent\s*>\s*summary\s*\{[^}]*border-inline-end-color:\s*#158a39;[^}]*background:\s*#f0fdf4;[^}]*color:\s*#158a39;/);
  assert.match(css, /\.student-nav-children\s*\{[^}]*margin:\s*0;[^}]*padding:\s*8px 0;[^}]*border-inline-start:\s*0;[^}]*background:\s*rgba\(249,\s*250,\s*251,\s*\.5\);/);
});

test("compact course navigation opens the reference-style flyout", async () => {
  const [source, css] = await Promise.all([
    readFile(platformUrl, "utf8"),
    readFile(learningCssUrl, "utf8"),
  ]);

  assert.match(source, /const \[compactNavPopover, setCompactNavPopover\] = useState<"exams" \| "courses" \| null>\(null\)/);
  assert.match(source, /compact-nav-popover-open/);
  assert.match(source, /aria-expanded=\{sidebarOpen \|\| mobileOpen \? undefined : compactNavPopover === "courses"\}/);
  assert.match(source, /className="compact-nav-popover"/);
  assert.match(css, /\.compact-nav-popover\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?inset-inline-start:\s*104px;[\s\S]*?width:\s*224px;[\s\S]*?padding:\s*8px 0;[\s\S]*?border-radius:\s*8px;/);
});

test("study video affordances do not render a decorative circle", async () => {
  const source = await readFile(platformUrl, "utf8");
  const studySource = source.slice(source.indexOf("function LessonViewer"), source.indexOf("function ExamHistory"));

  assert.doesNotMatch(studySource, /<CirclePlay\b/);
  assert.match(studySource, /<Play\b/);
});

test("study context omits duplicate resource metadata below the player", async () => {
  const source = await readFile(platformUrl, "utf8");
  const studySource = source.slice(source.indexOf("function LessonViewer"), source.indexOf("function ExamHistory"));

  assert.doesNotMatch(studySource, /className="study-resource-meta"/);
  assert.match(studySource, /<h1 id="study-lesson-title">\{formatLessonTitle\(lesson\.title, lesson\.sort_order\)\}<\/h1>/);
});

test("study browser QA verifies the compact course flyout without replacing the player", async () => {
  const smoke = await readFile(smokeUrl, "utf8");

  assert.match(smoke, /compactFlyoutGeometry/);
  assert.match(smoke, /compactFlyoutStable/);
  assert.match(smoke, /Compact course flyout failed/);
  assert.doesNotMatch(smoke, /\.study-sidebar-toggle/);
});

test("study mobile global menu explicitly places focus inside after opening", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /currentView === "lesson"[\s\S]*?requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(\(\) =>[\s\S]*?#main-sidebar\.mobile-open \.mobile-sidebar-close/);
});

test("study mobile global menu restores the trigger after dialog cleanup", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /closeMobileMenu[\s\S]*?currentView === "lesson"[\s\S]*?requestAnimationFrame\(\(\) => window\.requestAnimationFrame\(restoreFocus\)\)/);
});

test("compact study navigation preserves course and lesson label hierarchy", async () => {
  const css = await readFile(learningCssUrl, "utf8");

  assert.match(css, /\.study-lesson-navigation\s*>\s*:where\(a, span\)\s*>\s*span\s*\{[^}]*flex-direction:\s*column;/s);
  assert.match(css, />\s*\.main-content\.product-content-surface\s+\.lesson-breadcrumb\s+\.breadcrumb-course\s*\{[^}]*display:\s*block;/s);
});

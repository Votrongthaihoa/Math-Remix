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

test("lesson curriculum exposes an accessible compact drawer trigger", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /className="study-curriculum-trigger"/);
  assert.match(source, /aria-controls="lesson-curriculum-panel"/);
  assert.match(source, /aria-expanded=\{curriculumOpen\}/);
});

test("curriculum drawer lifecycle is limited to the 1024px through 1199px layout", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /matchMedia\("\(min-width: 1024px\) and \(max-width: 1199px\)"\)/);
  assert.match(source, /const closeOutsideDrawer = \(event: MediaQueryListEvent\) => \{[\s\S]*?if \(!event\.matches\) setCurriculumOpen\(false\);/);
  assert.match(source, /if \(!drawerViewport\.matches\) return;/);
});

test("compact curriculum drawer keeps focus on its close action after opening", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /const focusCurriculumClose = useCallback\(\(\) => \{[\s\S]*?data-dialog-autofocus[\s\S]*?focus\(\{ preventScroll: true \}\)/);
  assert.match(source, /useEffect\(\(\) => \{[\s\S]*?if \(!curriculumOpen\) return;[\s\S]*?focusCurriculumClose\(\);[\s\S]*?\}, \[curriculumOpen, focusCurriculumClose\]\)/);
});

test("study mode uses the measured 80/288 shell and 400px curriculum", async () => {
  const css = await readFile(learningCssUrl, "utf8");

  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\)\s*\{[\s\S]*?--study-sidebar-collapsed:\s*80px;[\s\S]*?--study-sidebar-expanded:\s*288px;/);
  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\)[\s\S]*?\.lesson-layout\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\) var\(--study-curriculum-width\);[\s\S]*?gap:\s*32px;/);
});

test("study mode preserves the measured HTML player and curriculum geometry", async () => {
  const css = await readFile(learningCssUrl, "utf8");

  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\) \.real-lesson-page\s*\{[^}]*width:\s*min\(100%,\s*1700px\);[^}]*max-width:\s*1700px;/);
  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\) \.real-lesson-page \.viewer-card\s*\{[^}]*overflow:\s*hidden;[^}]*border:\s*0;[^}]*border-radius:\s*12px;[^}]*background:\s*#111827;[^}]*box-shadow:\s*0 10px 15px -3px rgba\(0,\s*0,\s*0,\s*\.1\),\s*0 4px 6px -4px rgba\(0,\s*0,\s*0,\s*\.1\);/);
  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\) \.lesson-viewer-surface\.is-video\s*\{[^}]*aspect-ratio:\s*16\s*\/\s*9;/);
  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\) \.real-lesson-page \.curriculum-panel\s*\{[^}]*position:\s*sticky;[^}]*top:\s*96px;[^}]*width:\s*var\(--study-curriculum-width\);[^}]*max-height:\s*85dvh;[^}]*border-radius:\s*12px;[^}]*box-shadow:\s*0 1px 2px rgba\(0,\s*0,\s*0,\s*\.05\);/);
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

test("study curriculum stays inline at 1023px and below", async () => {
  const css = await readFile(learningCssUrl, "utf8");
  const inlineStart = css.indexOf("@media (max-width: 1023px)");
  const phoneStart = css.indexOf("@media (max-width: 575px)", inlineStart);
  const inlineCss = css.slice(inlineStart, phoneStart);

  assert.ok(inlineStart >= 0, "missing the inline curriculum breakpoint");
  assert.match(inlineCss, /\.study-curriculum-trigger,[\s\S]*?\.curriculum-sheet-shade,[\s\S]*?\.curriculum-panel-close\s*\{[\s\S]*?display:\s*none;/);
  assert.match(inlineCss, /\.real-lesson-page \.curriculum-panel\s*\{[\s\S]*?position:\s*static;[\s\S]*?visibility:\s*visible;[\s\S]*?width:\s*100%;[\s\S]*?height:\s*auto;[\s\S]*?transform:\s*none;[\s\S]*?pointer-events:\s*auto;/);
  assert.match(inlineCss, /\.lesson-nav\s*>\s*\.lesson-curriculum-list\s*\{[\s\S]*?overflow-y:\s*visible;/);
});

test("inline curriculum layout hides previous and next lesson navigation", async () => {
  const css = await readFile(learningCssUrl, "utf8");
  const inlineStart = css.indexOf("@media (max-width: 1023px)");
  const phoneStart = css.indexOf("@media (max-width: 575px)", inlineStart);
  const inlineCss = css.slice(inlineStart, phoneStart);

  assert.match(inlineCss, /\.app-shell\.ui-shell\.student-app\.product-shell\.study-mode:not\(\.protected-exam-surface\) \.study-lesson-navigation\s*\{[^}]*display:\s*none;/);
});

test("phone study layout hides previous and next lesson navigation", async () => {
  const css = await readFile(learningCssUrl, "utf8");

  assert.match(css, /\.study-mode:not\(\.protected-exam-surface\) \.study-lesson-navigation\s*\{[\s\S]*?display:\s*none;/);
});

test("desktop study layout shows previous and next lesson navigation", async () => {
  const css = await readFile(learningCssUrl, "utf8");
  const phoneStart = css.indexOf("@media (max-width: 575px)");
  const baseCss = css.slice(0, phoneStart);
  const phoneCss = css.slice(phoneStart);

  assert.match(
    baseCss,
    /\.app-shell\.ui-shell\.student-app\.product-shell\.study-mode:not\(\.protected-exam-surface\) \.study-lesson-navigation\s*\{[^}]*display:\s*grid;/,
  );
  assert.match(
    phoneCss,
    /\.app-shell\.ui-shell\.student-app\.product-shell\.study-mode:not\(\.protected-exam-surface\) \.study-lesson-navigation\s*\{[^}]*display:\s*none;/,
  );
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

test("study video affordances keep the reference picker circle and compact curriculum icon", async () => {
  const source = await readFile(platformUrl, "utf8");
  const studySource = source.slice(source.indexOf("function LessonViewer"), source.indexOf("function ExamHistory"));

  assert.match(studySource, /<CirclePlay\b/);
  assert.match(studySource, /<Play\b/);
});

test("phone study context names the selected resource and its lesson", async () => {
  const source = await readFile(platformUrl, "utf8");
  const studySource = source.slice(source.indexOf("function LessonViewer"), source.indexOf("function ExamHistory"));

  assert.doesNotMatch(studySource, /className="study-resource-meta"/);
  assert.match(studySource, /<h1 id="study-lesson-title">\{selectedResource\?\.title \|\| formatLessonTitle\(lesson\.title, lesson\.sort_order\)\}<\/h1>/);
  assert.match(studySource, /<p>\{formatLessonTitle\(lesson\.title, lesson\.sort_order\)\}<\/p>/);
});

test("a newly opened lesson waits for an explicit resource selection", async () => {
  const source = await readFile(platformUrl, "utf8");
  const studySource = source.slice(source.indexOf("function LessonViewer"), source.indexOf("function ExamHistory"));

  assert.match(studySource, /setSelectedResourceId\(nextResources\.some\(resource => resource\.id === requestedResource\) \? requestedResource : ""\)/);
  assert.match(studySource, /const selectedResource = resources\.find\(resource => resource\.id === selectedResourceId\);/);
  assert.doesNotMatch(studySource, /selectedResourceId\) \?\? resources\[0\]/);
});

test("the initial lesson state uses the picker markup copied from the HTML reference", async () => {
  const source = await readFile(platformUrl, "utf8");
  const studySource = source.slice(source.indexOf("function LessonViewer"), source.indexOf("function ExamHistory"));

  assert.match(studySource, /lesson-resource-picker flex-1 w-full overflow-hidden/);
  assert.match(studySource, /w-full min-h-\[50vh\] md:min-h-\[60vh\] rounded-xl bg-white border border-gray-200 shadow-sm p-8 md:p-12 flex flex-col justify-center/);
  assert.match(studySource, /Bài học này bao gồm \{resources\.length\} nội dung\. Vui lòng chọn một mục bên dưới để bắt đầu học\./);
  assert.match(studySource, /lesson-resource-picker-grid grid grid-cols-1 md:grid-cols-2 gap-4/);
  assert.match(studySource, /lesson-resource-choice flex items-center gap-4 p-4 rounded-xl border border-gray-200 bg-gray-50 hover:bg-white hover:border-\[#158a39\] hover:shadow-md transition-all cursor-pointer group\/card/);
});

test("the copied resource picker does not have a second hand-written CSS implementation", async () => {
  const css = await readFile(learningCssUrl, "utf8");

  assert.doesNotMatch(css, /\.lesson-resource-picker(?:-copy|-grid)?\s*\{/);
  assert.doesNotMatch(css, /\.lesson-resource-choice(?:-icon)?(?:\s|:|>)*\{/);
});

test("course catalogue and detail use the supplied HTML reference classes", async () => {
  const source = await readFile(platformUrl, "utf8");

  assert.match(source, /w-full min-h-\[calc\(100vh-120px\)\] bg-transparent/);
  assert.match(source, /grid grid-cols-\[repeat\(auto-fill,minmax\(280px,1fr\)\)\] gap-6/);
  assert.match(source, /ant-card ant-card-bordered ant-card-hoverable cursor-pointer overflow-hidden rounded-2xl border-0 shadow-sm hover:shadow-xl transition-all duration-300 transform hover:-translate-y-1 flex flex-col h-full min-h-\[350px\]/);
  assert.match(source, /flex flex-col lg:flex-row flex-1 gap-8 pt-2 items-start/);
  assert.match(source, /w-full aspect-video rounded-xl overflow-hidden bg-gray-900 relative flex items-center justify-center shadow-lg/);
  assert.match(source, /w-full lg:w-\[400px\] shrink-0/);
  assert.match(source, /bg-white rounded-xl shadow-sm border border-gray-100 flex flex-col h-auto lg:max-h-\[85vh\] lg:sticky lg:top-24/);
});

test("course detail starts with every curriculum section collapsed", async () => {
  const source = await readFile(platformUrl, "utf8");
  const detailSource = source.slice(source.indexOf("function CourseDetail"), source.indexOf("function LessonViewer"));

  assert.doesNotMatch(detailSource, /<details[^>]*\sopen=/);
});

test("study browser QA verifies the compact course flyout without replacing the player", async () => {
  const smoke = await readFile(smokeUrl, "utf8");

  assert.match(smoke, /compactFlyoutGeometry/);
  assert.match(smoke, /compactFlyoutStable/);
  assert.match(smoke, /Compact course flyout failed/);
  assert.doesNotMatch(smoke, /\.study-sidebar-toggle/);
});

test("study browser QA covers inline curriculum and the bounded compact drawer", async () => {
  const smoke = await readFile(smokeUrl, "utf8");

  assert.match(smoke, /width >= 1024 && width <= 1199/);
  assert.match(smoke, /student-study-curriculum-inline/);
  assert.match(smoke, /panelFollowsViewer/);
  assert.match(smoke, /backgroundInteractive/);
  assert.match(smoke, /bodyUnlocked/);
});

test("study browser QA captures the picker before opening a resource", async () => {
  const smoke = await readFile(smokeUrl, "utf8");

  assert.match(smoke, /\.lesson-resource-picker/);
  assert.match(smoke, /playerAbsentBeforeSelection/);
  assert.match(smoke, /student-lesson-picker-\$\{width\}\.png/);
});

test("browser QA captures every supplied course reference state", async () => {
  const smoke = await readFile(smokeUrl, "utf8");

  assert.match(smoke, /student-courses-expanded-1440\.png/);
  assert.match(smoke, /student-courses-collapsed-1440\.png/);
  assert.match(smoke, /student-course-detail-collapsed-1440\.png/);
  assert.match(smoke, /student-course-detail-part-1-open-1440\.png/);
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

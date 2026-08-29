import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { test } from "node:test";

const platformUrl = new URL("../app/platform.tsx", import.meta.url);
const stylesUrl = new URL("../app/product-ui-v2.css", import.meta.url);

test("student navigation uses deep links while resource selection remains an action", async () => {
  const platform = await readFile(platformUrl, "utf8");

  assert.match(platform, /href=\{`\/courses\/\$\{encodeURIComponent\(String\(c\.id\)\)\}`\}/);
  assert.match(platform, /<Link className=\{lesson\.published\?"published":"draft"\} href=\{`\/lessons\//);
  assert.match(platform, /className="curriculum-lesson-title" href=\{`\/lessons\//);
  assert.match(platform, /className="curriculum-resource" href=\{`\/lessons\//);
  assert.match(platform, /<button type="button"[^>]*className=\{`curriculum-resource/);
});

test("course search is URL-backed and announces the filtered result count", async () => {
  const [platform, styles] = await Promise.all([
    readFile(platformUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(platform, /const searchParams = useSearchParams\(\)/);
  assert.match(platform, /const \[courseSearch, setCourseSearch\] = useState\(routeCourseSearch\)/);
  assert.match(platform, /window\.setTimeout\(\(\) =>/);
  assert.match(platform, /onChange=\{event=>setCourseSearch\(event\.target\.value\)\}/);
  assert.match(platform, /router\.replace\(`\$\{pathname\}/);
  assert.match(platform, /className="course-search-status" role="status" aria-live="polite"/);
  assert.match(styles, /@media \(max-width: 1024px\)[\s\S]*?\.courses-toolbar[\s\S]*?flex-direction: column/);
  assert.match(styles, /@media \(max-width: 1024px\)[\s\S]*?\.course-search[\s\S]*?width: 100%/);
});

test("admin password recovery preserves its portal context", async () => {
  const platform = await readFile(platformUrl, "utf8");

  assert.match(platform, /router\.push\("\/forgot-password\?from=admin"\)/);
  assert.match(platform, /shellSearchParams\.get\("from"\) === "admin"/);
  assert.match(platform, /returnToAdmin=\{loginContext === "admin"\}/);
  assert.match(platform, /reset-password\$\{returnToAdmin \? "\?from=admin" : ""\}/);
});

test("optimized routes update the document title and loading failures stay actionable", async () => {
  const [platform, styles] = await Promise.all([
    readFile(platformUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(platform, /if \(uiRouteMode !== "optimized-content"\) return;[\s\S]*?const authenticationRequired = !signedIn[\s\S]*?const appliedTitle = optimizedDocumentTitle\(pathname, authenticationRequired\);[\s\S]*?document\.title = appliedTitle/);
  assert.match(platform, /authenticationRequired\) return pathname\.startsWith\("\/admin"\) \? "Đăng nhập quản trị \| Remix Education" : "Đăng nhập \| Remix Education"/);
  assert.match(platform, /if \(document\.title === appliedTitle\) document\.title = previousTitle/);
  assert.match(platform, /<CourseCurriculumSkeleton \/>/);
  assert.match(platform, /<LessonViewerSkeleton \/>/);
  assert.match(platform, /setContentReloadVersion\(version => version \+ 1\)/);
  assert.match(platform, /setLessonReloadVersion\(version => version \+ 1\)/);
  assert.match(platform, />Đăng nhập lại<\/Link>/);
  assert.match(styles, /\.student-content-skeleton/);
});

test("activity has a compact monthly view and profile statistics use completed attempts in the current year", async () => {
  const [platform, styles] = await Promise.all([
    readFile(platformUrl, "utf8"),
    readFile(stylesUrl, "utf8"),
  ]);

  assert.match(platform, /className="activity-mobile-summary"/);
  assert.match(platform, /const completedYearAttempts = attempts\.filter/);
  assert.match(platform, /const averageScore = completedYearAttempts\.length/);
  assert.match(styles, /\.activity-mobile-summary/);
  assert.match(styles, /@media \(max-width: 600px\)/);
  assert.match(styles, /\.activity-mobile-summary[\s\S]*?clip-path: inset\(50%\)/);
});

test("profile name editing is a labelled form with accessible feedback", async () => {
  const platform = await readFile(platformUrl, "utf8");

  assert.match(platform, /<form className="profile-card details profile-details-form" onSubmit=\{saveProfile\}/);
  assert.match(platform, /id="profile-full-name" name="fullName" autoComplete="name"/);
  assert.match(platform, /aria-invalid=\{Boolean\(profileError && !draftName\.trim\(\)\)\}/);
  assert.match(platform, /aria-describedby=\{profileFeedbackId\}/);
  assert.match(platform, /profileNameInputRef\.current\?\.focus\(\)/);
  assert.match(platform, /id="profile-name-error"[^>]*role="alert"/);
  assert.match(platform, /id="profile-name-success"[^>]*role="status" aria-live="polite"/);
});

test("new student styles require both the optimized route and content surface boundaries", async () => {
  const styles = await readFile(stylesUrl, "utf8");
  const selectors = styles
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .match(/[^{}]+(?=\{)/g)
    ?.map(selector => selector.trim()) ?? [];

  assert.ok(selectors.length > 0);
  selectors.forEach(selector => {
    if (selector.startsWith("@")) return;
    assert.match(selector, /\.ui-shell\.student-app\[data-ui-mode="optimized-content"\]/);
    assert.match(selector, /> \.main-content\.product-content-surface/);
  });
  assert.doesNotMatch(styles, /\.(?:exam-|question-|answer-|exam-result|review-|solution-|admin-exam-|guest-exam)[\w-]*/i);
});

test("mobile lesson breadcrumbs retain the current lesson", async () => {
  const styles = await readFile(stylesUrl, "utf8");

  assert.match(styles, /@media \(max-width: 575px\)[\s\S]*?\.breadcrumb-current[\s\S]*?display: block/);
});

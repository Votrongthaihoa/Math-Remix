import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public image library keeps load failures separate from the empty state", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.match(component, /const \[libraryError, setLibraryError\] = useState\(""\);/);
  assert.match(component, /setLibraryError\(""\);/);
  assert.match(component, /setLibraryError\(value instanceof Error \? value\.message/);
  assert.match(component, /libraryError \? [\s\S]*?Thử lại/);
  assert.match(component, /!images\.length \? \(libraryError \? null : <div className="admin-upload-empty">/);
});

test("private image deletion uses the accessible MacAlert confirmation", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.doesNotMatch(component, /window\.confirm/);
  assert.match(component, /const \[pendingExamImage, setPendingExamImage\] = useState<ExamUploadedImage \| null>\(null\);/);
  assert.match(component, /pendingExamImage \? <MacAlert/);
  assert.match(component, /removeExamImage\(pendingExamImage\)/);
  assert.match(component, /onClick=\{\(\) => requestExamImageRemoval\(image\)\}/);
});

test("upload controls and metadata formatting stay accessible and date-safe", async () => {
  const component = await readFile(new URL("../app/admin-upload.tsx", import.meta.url), "utf8");

  assert.match(component, /aria-label="Chọn ảnh để tải lên"/);
  assert.match(component, /<button type="submit" className="primary-btn admin-upload-submit"/);
  assert.match(component, /Number\.isNaN\(date\.getTime\(\)\)/);
});

test("lesson PDF upload validates course ownership and binds confirmation path", async () => {
  const route = await readFile(new URL("../app/api/admin/lesson-files/route.ts", import.meta.url), "utf8");

  assert.match(route, /select\("id,chapters\(course_id\)"\)/);
  assert.match(route, /chapter\?\.course_id !== courseId/);
  assert.match(route, /path\.startsWith\(`\$\{courseId\}\/\$\{lessonId\}\//);
  assert.match(route, /consumeRequestBudget/);
});

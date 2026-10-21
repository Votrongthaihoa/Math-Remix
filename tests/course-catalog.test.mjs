import assert from "node:assert/strict";
import test from "node:test";
import {
  COURSE_CATEGORIES,
  courseCategoryCounts,
  courseCategoryFromParams,
  courseCategoryIds,
  courseCategoryLabel,
  courseCategoryParams,
  matchesCourseCategory,
  resetCourseCatalogParams,
  searchCourseText,
  sortCourseCatalog,
  visibleCourseCategories,
} from "../lib/course-catalog.ts";

test("course categories recognize six source exam labels without partial-word matches", () => {
  for (const id of ["TSA", "HSA", "THPT", "QDA", "BCA", "VSAT"]) {
    assert.deepEqual(courseCategoryIds({ title: `[2K9 - ${id}] Toán` }), [id]);
  }
  assert.deepEqual(courseCategoryIds({ title: "Toán - đánh giá tư duy" }), ["TSA"]);
  assert.deepEqual(courseCategoryIds({ title: "Ôn tập Bộ Công an" }), ["BCA"]);
  assert.deepEqual(courseCategoryIds({ title: "Luyện V-SAT" }), ["VSAT"]);
  assert.deepEqual(courseCategoryIds({ title: "THPTQG Toán" }), ["THPT"]);
  assert.deepEqual(courseCategoryIds({ title: "WhatsApp · HSAology · ABCABC" }), []);
});

test("QDA and BCA stay distinct from HSA while source DGNL links cover the umbrella", () => {
  const qda = { title: "QDA", description: "Khoá Đánh giá năng lực" };
  const bca = { title: "BCA - ĐGNL" };
  assert.deepEqual(courseCategoryIds(qda), ["QDA"]);
  assert.deepEqual(courseCategoryIds(bca), ["BCA"]);
  assert.equal(matchesCourseCategory(qda, "HSA"), false);
  assert.equal(matchesCourseCategory(bca, "HSA"), false);
  assert.equal(matchesCourseCategory(qda, "DGNL"), true);
  assert.equal(matchesCourseCategory(bca, "DGNL"), true);
  assert.deepEqual(courseCategoryIds({ title: "ĐGNL tổng hợp" }), ["HSA"]);
});

test("shared foundation and multi-exam courses retain matching counts without duplicate courses", () => {
  const foundation = { title: "Nền tảng: Toán", description: null };
  const courses = [foundation, { title: "TSA HSA Toán" }, { title: "THPT Toán" }, { title: "QDA BCA Văn" }];
  for (const { id } of COURSE_CATEGORIES) assert.equal(matchesCourseCategory(foundation, id), true);
  assert.deepEqual(courseCategoryCounts(courses), { ALL: 4, TSA: 2, HSA: 2, THPT: 2, QDA: 2, BCA: 2, VSAT: 1, DGNL: 3 });
  assert.deepEqual(courseCategoryCounts([]), { ALL: 0, TSA: 0, HSA: 0, THPT: 0, QDA: 0, BCA: 0, VSAT: 0, DGNL: 0 });
});

test("catalogue query parsing supports source aliases and preserves existing URL priority", () => {
  const cases = [
    ["", "ALL"], ["examType=TSA", "TSA"], ["category=thpt", "THPT"],
    ["category=all&workspace=bca", "BCA"], ["category=dgnl", "DGNL"],
    ["examType=THPTQG", "THPT"], ["category=v-sat", "VSAT"],
    ["examType=HSA&workspace=tsa", "HSA"], ["examType=ALL&category=tsa", "ALL"],
    ["examType=unknown&category=qda", "QDA"], ["category=unknown", "ALL"],
  ];
  for (const [query, expected] of cases) assert.equal(courseCategoryFromParams(new URLSearchParams(query)), expected, query);
});

test("changing category retains search and list view but removes competing source aliases", () => {
  const original = new URLSearchParams("category=all&workspace=thpt&q=Toán&view=list&other=keep");
  const next = courseCategoryParams(original, "BCA");
  assert.equal(next.get("q"), "Toán");
  assert.equal(next.get("view"), "list");
  assert.equal(next.get("other"), "keep");
  assert.equal(next.has("workspace"), false);
  assert.equal(next.has("category"), false);
  assert.equal(courseCategoryFromParams(next), "BCA");
  assert.equal(courseCategoryFromParams(courseCategoryParams(original, "ALL")), "ALL");
  assert.equal(original.get("workspace"), "thpt");
});

test("new tabs appear only for detected or requested exam types, not untagged shared courses", () => {
  const shared = [{ title: "Nền tảng Toán" }];
  assert.deepEqual(visibleCourseCategories(shared).map(item => item.id), ["ALL"]);
  assert.deepEqual(visibleCourseCategories([...shared, { title: "QDA Văn" }], "VSAT").map(item => item.id), ["ALL", "QDA", "VSAT"]);
  assert.equal(visibleCourseCategories([], "DGNL").at(-1).id, "DGNL");
  assert.match(courseCategoryLabel("THPT"), /THPT/);
  assert.match(courseCategoryLabel("DGNL"), /QDA/);
});

test("catalogue sorts titles in Vietnamese order without mutating the existing order", () => {
  const courses = [{ title: "Tóan 10" }, { title: "Ánh sáng" }, { title: "Toán 2" }];
  assert.deepEqual(sortCourseCatalog(courses, "default"), courses);
  assert.deepEqual(sortCourseCatalog(courses, "title-asc").map(course => course.title), ["Ánh sáng", "Toán 2", "Tóan 10"]);
  assert.deepEqual(sortCourseCatalog(courses, "title-desc").map(course => course.title), ["Tóan 10", "Toán 2", "Ánh sáng"]);
  assert.equal(courses[0].title, "Tóan 10");
});

test("reset drops all catalogue filters while retaining list view and unrelated URL data", () => {
  const next = resetCourseCatalogParams(new URLSearchParams("q=toan&examType=HSA&category=tsa&workspace=thpt&sort=title-asc&view=list&other=keep"));
  for (const filter of ["q", "examType", "category", "workspace", "sort"]) assert.equal(next.has(filter), false, filter);
  assert.equal(next.get("view"), "list");
  assert.equal(next.get("other"), "keep");
});

test("catalogue searches handle Vietnamese diacritics and composed Unicode consistently", () => {
  assert.equal(searchCourseText("  ĐÁNH   GIÁ NĂNG LỰC \n"), "danh gia nang luc");
  assert.equal(searchCourseText("Toán"), searchCourseText("Toán".normalize("NFD")));
  assert.equal(searchCourseText("TƯ DUY Toán").includes(searchCourseText("tu duy toan")), true);
});

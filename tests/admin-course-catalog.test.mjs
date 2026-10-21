import assert from "node:assert/strict";
import test from "node:test";
import { filterAndSortAdminCourses } from "../app/admin-course-catalog.ts";

const courses = [
  { id: "b", title: "Đánh giá năng lực", description: "HSA nền tảng", published: true, sort_order: 2, created_at: "2026-08-02T00:00:00Z" },
  { id: "c", title: "Toán tư duy", description: "Luyện TSA", published: false, sort_order: 1, created_at: "2026-09-02T00:00:00Z" },
  { id: "a", title: "Ôn tập THPT", description: "Toán và Văn", published: true, sort_order: 3, created_at: "2026-07-02T00:00:00Z" },
];

const options = (query = "", status = "all", sort = "order") => ({ query, status, sort });
const ids = rows => rows.map(course => course.id);

test("admin catalogue searches titles and descriptions without Vietnamese accents", () => {
  assert.deepEqual(ids(filterAndSortAdminCourses(courses, options("DANH GIA NANG LUC"))), ["b"]);
  assert.deepEqual(ids(filterAndSortAdminCourses(courses, options("  toan   va van  "))), ["a"]);
  assert.deepEqual(ids(filterAndSortAdminCourses(courses, options("luyen tsa"))), ["c"]);
  assert.deepEqual(ids(filterAndSortAdminCourses(courses, options("missing"))), []);
});

test("admin catalogue combines status and sort without mutating Supabase order", () => {
  assert.deepEqual(ids(filterAndSortAdminCourses(courses, options())), ["c", "b", "a"]);
  assert.deepEqual(ids(filterAndSortAdminCourses(courses, options("", "published"))), ["b", "a"]);
  assert.deepEqual(ids(filterAndSortAdminCourses(courses, options("toan", "draft"))), ["c"]);
  assert.deepEqual(ids(filterAndSortAdminCourses(courses, options("", "all", "newest"))), ["c", "b", "a"]);
  assert.deepEqual(ids(filterAndSortAdminCourses(courses, options("", "all", "title"))), ["b", "a", "c"]);
  assert.deepEqual(ids(courses), ["b", "c", "a"]);
});

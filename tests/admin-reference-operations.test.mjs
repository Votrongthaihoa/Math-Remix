import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { filterRoster, normalizeRosterText } from "../app/admin-roster-query.ts";
import { filterPublicMedia } from "../app/admin-public-media-query.ts";

const students = Object.freeze([
  Object.freeze({ id: "a", full_name: "Nguyễn Đặng Ánh", student_code: "HV2", email: "anh@example.test", status: "active", role: "student", created_at: "2026-01-02" }),
  Object.freeze({ id: "b", full_name: "Bình", student_code: "HV10", email: "binh@example.test", status: "locked", role: "student", created_at: "invalid" }),
  Object.freeze({ id: "c", full_name: "Chi", student_code: "HV1", email: "chi@example.test", status: "active", role: "student", created_at: "2026-01-03" }),
]);
const counts = Object.freeze({ a: 2, b: 1 });
const ids = rows => rows.map(row => row.id);
const roster = (query = "", status = "all", enrollment = "all", sort = "name") => filterRoster(students, counts, query, status, enrollment, sort);

test("roster search handles Vietnamese accents, decomposed text, codes and emails", () => {
  assert.equal(normalizeRosterText("  NGUYỄN ĐẶNG ÁNH  "), "nguyen dang anh");
  for (const query of ["nguyen dang", "Nguyễn Đặng".normalize("NFD"), "HV2", "ANH@example.test"]) assert.deepEqual(ids(roster(query)), ["a"]);
  assert.deepEqual(roster("not-found"), []);
});

test("roster combines status and enrollment and treats absent counts as zero", () => {
  assert.deepEqual(ids(roster("", "active", "assigned")), ["a"]);
  assert.deepEqual(ids(roster("", "active", "unassigned")), ["c"]);
  assert.deepEqual(ids(roster("", "locked", "assigned")), ["b"]);
  assert.deepEqual(roster("", "locked", "unassigned"), []);
});

test("roster sorts copies naturally, by count and by date with invalid dates last", () => {
  assert.deepEqual(ids(roster("", "all", "all", "code")), ["c", "a", "b"]);
  assert.deepEqual(ids(roster("", "all", "all", "courses")), ["a", "b", "c"]);
  assert.deepEqual(ids(roster("", "all", "all", "newest")), ["c", "a", "b"]);
  assert.deepEqual(ids(students), ["a", "b", "c"]);
  assert.deepEqual(filterRoster([], {}, "", "all", "all", "name"), []);
});

const images = Object.freeze([
  Object.freeze({ assetName: "Ảnh Đẹp 10.png", used: true, size: 100, lastModified: null }),
  Object.freeze({ assetName: "Ảnh Đẹp 2.png", used: false, size: 200, lastModified: "2026-01-02" }),
  Object.freeze({ assetName: "Ảnh Đẹp 1.png", used: false, size: 50, lastModified: "invalid" }),
]);
const names = rows => rows.map(row => row.assetName);

test("media combines accent-insensitive search and usage without mutating loaded data", () => {
  assert.deepEqual(names(filterPublicMedia(images, " ANH dep ", "used", "default")), [images[0].assetName]);
  assert.deepEqual(names(filterPublicMedia(images, "Ảnh Đẹp", "unused", "default")), [images[1].assetName, images[2].assetName]);
  assert.deepEqual(filterPublicMedia(images, "not-found", "all", "default"), []);
  assert.notEqual(filterPublicMedia(images, "", "all", "default"), images);
});

test("media sorts filenames naturally and handles absent/invalid modification dates", () => {
  assert.deepEqual(names(filterPublicMedia(images, "", "all", "name")), [images[2].assetName, images[1].assetName, images[0].assetName]);
  for (const sort of ["largest", "newest"]) assert.deepEqual(names(filterPublicMedia(images, "", "all", sort)), [images[1].assetName, images[0].assetName, images[2].assetName]);
  assert.deepEqual(names(images), ["Ảnh Đẹp 10.png", "Ảnh Đẹp 2.png", "Ảnh Đẹp 1.png"]);
  assert.deepEqual(filterPublicMedia([], "", "all", "largest"), []);
});

test("operations ports are scoped non-exam UI and retain existing backend handlers", async () => {
  for (const file of ["admin-student-roster.css", "admin-public-media-reference.css", "admin-reference-dialog.css"]) {
    const css = await readFile(new URL(`../app/${file}`, import.meta.url), "utf8");
    assert.match(css, /\.ui-shell\.admin-app\.product-shell:not\(\.protected-exam-surface\)/);
    assert.doesNotMatch(css, /!important|#[0-9a-f]{3,8}\b/i);
  }
  const rosterSource = await readFile(new URL("../app/admin-student-roster.tsx", import.meta.url), "utf8");
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(rosterSource, /mock-api|localStorage|fetch\(|supabase\./);
  assert.match(platform, /<AdminStudentRoster/);
  assert.match(rosterSource, /onClick=\{onCreate\}/);
  assert.match(rosterSource, /onPassword\(student\)/);
  assert.match(rosterSource, /disabled=\{loading \|\| Boolean\(error\) \|\| !filtered.length\}/);
});

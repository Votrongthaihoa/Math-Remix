import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { readAdminCatalogLocation, updateAdminCatalogLocation, ADMIN_CATALOG_PAGE_SIZE } from "../app/admin-catalog-location.ts";
import { serializeCsv } from "../lib/download-csv.ts";
import { adminPrototypeRedirectPath } from "../app/admin-route-map.ts";

test("source catalogue uses 10 rows and normalizes untrusted URL values", () => {
  assert.equal(ADMIN_CATALOG_PAGE_SIZE, 10);
  assert.deepEqual(readAdminCatalogLocation(new URLSearchParams("q=To%C3%A1n&status=draft&sort=title&view=list&page=3")), { q: "Toán", status: "draft", sort: "title", view: "list", page: 3 });
  for (const page of ["-1", "0", "abc", "Infinity", "1.5", "9007199254740992"]) {
    assert.deepEqual(readAdminCatalogLocation(new URLSearchParams(`status=archived&sort=bad&view=bad&page=${page}`)), { q: "", status: "all", sort: "order", view: "table", page: 1 });
  }
});

test("catalogue URL updates preserve unrelated query fields and remove defaults", () => {
  const query = updateAdminCatalogLocation("tag=a&tag=b&page=4&q=old&view=list", { q: "Luyện & học", page: 1 });
  const params = new URLSearchParams(query);
  assert.deepEqual(params.getAll("tag"), ["a", "b"]);
  assert.equal(params.get("q"), "Luyện & học");
  assert.equal(params.get("view"), "list");
  assert.equal(params.has("page"), false);
  assert.equal(updateAdminCatalogLocation("q=a&status=draft&sort=title", { q: "", status: "all", sort: "order" }), "");
});

test("source CSV export preserves Vietnamese, commas, quotes and multiline values", () => {
  assert.equal(serializeCsv([["Tên", "Mô tả"], ['Toán, "TSA"', "Dòng 1\nDòng 2"], [null, 2]]), '\ufeff"Tên","Mô tả"\r\n"Toán, ""TSA""","Dòng 1\nDòng 2"\r\n"","2"');
});

test("CSV export neutralizes formula injection including whitespace prefixes", () => {
  for (const value of ["=HYPERLINK(1)", "+SUM(1)", "@SUM(1)", "-1+2", "\t=1", "\r\n @SUM(1)"]) assert.equal(serializeCsv([[value]]), `\ufeff"'${value}"`);
  assert.equal(serializeCsv([[-2, "Bài - 2"]]), '\ufeff"-2","Bài - 2"');
});

test("non-exam prototype routes reach existing native admin screens without changing protected routing", () => {
  for (const [path, target] of [["course-management", "content"], ["user-management", "students"], ["group-user-management", "enrollments"], ["access", "enrollments"], ["media-management", "upload"]]) {
    assert.equal(adminPrototypeRedirectPath(["admin", path], { q: "Toán" }), `/admin/${target}?q=To%C3%A1n`);
  }
  assert.equal(adminPrototypeRedirectPath(["admin", "course-management", "a/b"]), "/admin/content/courses/a%2Fb");
  for (const path of ["exam-management", "exam-types", "question-bank", "ilearn-management", "media-management/folder"]) assert.equal(adminPrototypeRedirectPath(["admin", ...path.split("/")]), null);
});

test("ported components remain isolated from exams and mock backend persistence", async () => {
  const css = await readFile(new URL("../app/admin-reference-data-table.css", import.meta.url), "utf8");
  const source = await readFile(new URL("../app/admin-content-list.tsx", import.meta.url), "utf8");
  assert.match(css, /\.ui-shell\.admin-app\.product-shell:not\(\.protected-exam-surface\) \.admin-content-catalog/);
  assert.doesNotMatch(source, /mock-api|localStorage|sessionStorage|server\.aeck\.vn/);
  assert.match(source, /visibleCourses\.map\(course => \[course\.id/);
  assert.match(source, /window\.history\.replaceState/);
  assert.match(source, /window\.history\.pushState/);
  assert.match(source, /disabled=\{loading \|\| Boolean\(error\) \|\| !visibleCourses\.length\}/);
});

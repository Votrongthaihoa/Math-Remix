import assert from "node:assert/strict";
import test from "node:test";
import { resolveStudentReturnTo } from "../lib/student-return-to.ts";

test("student return destination preserves supported public/student query and fragment", () => {
  for (const route of ["/goi-hoc-tap", "/dang-ky-minh-chung", "/courses?examType=HSA", "/lessons/lesson-1?resource=res-1#player", "/courses/course-1", "/profile?tab=courses"]) {
    assert.equal(resolveStudentReturnTo(route), route);
  }
});
test("student return destination rejects external, privileged and malformed routes", () => {
  for (const route of [null, {}, "https://evil.test", "//evil.test", "/\\evil.test", "/%5cevil.test", "/%2f%2fevil.test", "/login", "/callback", "/api/exams", "/admin", "/exam-room", "/exam/result/id", "/unknown", "/lessons/%", "/lessons/id\n", "/courses/id/extra"]) {
    assert.equal(resolveStudentReturnTo(route), "/dashboard", String(route));
  }
});

const accepted = [
  ["root", "/", "/"], ["dashboard query and hash", "/dashboard?tab=week#today", "/dashboard?tab=week#today"],
  ...["courses", "exam-history", "progress", "search", "tkb", "profile", "giao-vien", "dieu-khoan-dich-vu", "chinh-sach-bao-mat"].map(route => [route, `/${route}`, `/${route}`]),
  ["course detail", "/courses/course-123?view=lessons#chapter-2", "/courses/course-123?view=lessons#chapter-2"],
  ["lesson detail", "/lessons/lesson-123?resource=res-456#player", "/lessons/lesson-123?resource=res-456#player"],
  ["encoded Vietnamese identifier", "/courses/%C4%91%E1%BA%A1i-s%E1%BB%91", "/courses/%C4%91%E1%BA%A1i-s%E1%BB%91"],
  ["query is data, not a second redirect", "/courses?next=https%3A%2F%2Fevil.test", "/courses?next=https%3A%2F%2Fevil.test"],
];

for (const [name, input, expected] of accepted) {
  test(`return path permits ${name}`, () => assert.equal(resolveStudentReturnTo(input), expected));
}

const rejected = [
  ["undefined", undefined], ["boolean", true], ["number", 123], ["array", ["/courses"]],
  ["boxed string", new String("/courses")], ["function", () => "/courses"], ["symbol", Symbol("route")],
  ["empty", ""], ["relative", "courses"], ["javascript scheme", "javascript:alert(1)"],
  ["external with credentials", "https://student.invalid@evil.test/courses"],
  ["protocol relative", "//evil.test/courses"], ["triple slash", "///evil.test"],
  ["encoded slash authority", "/%2F%2Fevil.test"], ["encoded leading slash", "/%2Fdashboard"],
  ["encoded nested slash", "/courses/a%2Fb"], ["double encoded slash", "/lessons/a%252Fb"],
  ["bad percent", "/courses/%"], ["incomplete percent", "/courses/%2"],
  ["invalid percent digits", "/courses/%GG"], ["invalid UTF-8", "/courses/%C0%AF"],
  ["raw backslash", "/courses/a\\b"], ["encoded backslash", "/lessons/a%5Cb"],
  ["space", "/courses/a b"], ["encoded space", "/courses/a%20b"],
  ["raw null", "/courses/a\u0000b"], ["encoded null", "/courses/a%00b"],
  ["tab", "/courses/a\tb"], ["encoded tab", "/courses/a%09b"],
  ["carriage return", "/courses/a\rb"], ["newline", "/courses/a\nb"],
  ["encoded newline", "/courses/a%0Ab"], ["delete character", "/courses/a\u007fb"],
  ["encoded delete character", "/courses/a%7Fb"], ["control in query", "/courses?x=a\nb"],
  ["admin detail", "/admin/users"], ["encoded admin", "/%61dmin"],
  ["api", "/api/learning/continue"], ["auth", "/auth"], ["auth callback", "/auth/callback?code=fake"],
  ["login", "/login?next=/courses"], ["callback", "/callback?code=fake"],
  ["guest exam", "/guest-exam"], ["exam room", "/exam-room?id=fake"],
  ["result", "/exam/result/fake"], ["review", "/exam-review/fake"],
  ["admin question bank", "/admin-question-bank"], ["nested lesson path", "/lessons/a/review"],
  ["empty detail id", "/courses/"], ["unknown", "/not-a-route"],
  ["normalized traversal to admin", "/courses/../admin"],
];

for (const [name, input] of rejected) {
  test(`return path rejects ${name}`, () => assert.equal(resolveStudentReturnTo(input), "/dashboard"));
}

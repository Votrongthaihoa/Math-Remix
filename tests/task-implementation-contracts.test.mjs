import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("AECK shell and admin contracts stay scoped to the product surfaces", async () => {
  const [layout, theme, guard, adminPage, statsRoute, csp] = await Promise.all([
    source("app/layout.tsx"),
    source("app/theme.css"),
    source("app/auth-guard.tsx"),
    source("app/admin-dashboard/admin-dashboard-client.tsx"),
    source("app/api/dashboard/stats/route.ts"),
    source("next.config.ts"),
  ]);
  assert.match(layout, /import "\.\/theme\.css"/);
  assert.match(layout, /<body className="aeck-theme">/);
  assert.match(theme, /--aeck-brand:\s*#cd1627/);
  assert.match(theme, /prefers-reduced-motion/);
  assert.match(guard, /router\.replace\(`\/login\?returnTo=/);
  assert.match(adminPage, /\/api\/dashboard\/stats/);
  assert.match(statsRoute, /profile\.role !== "admin"/);
  assert.match(statsRoute, /count:\s*"exact"/);
  assert.match(csp, /Content-Security-Policy/);
  assert.match(csp, /script-src[^\n]+https:\/\/cdn\.vidstack\.io[^\n]+https:\/\/cdn\.jsdelivr\.net/);
  assert.match(csp, /style-src[^\n]+https:\/\/cdn\.vidstack\.io/);
  assert.match(csp, /worker-src 'self' blob: https:\/\/cdn\.jsdelivr\.net/);
  assert.match(csp, /frame-ancestors 'self'/);
});

test("authentication fallbacks stay on the local deployment", async () => {
  const [route, apiUrl] = await Promise.all([
    source("app/private-route.tsx"),
    source("lib/api-url.ts"),
  ]);
  assert.match(route, /router\.replace\(`\/login\?redirect=/);
  assert.doesNotMatch(route, /aeck\.vn|wss?:\/\//i);
  assert.match(apiUrl, /hostname === "aeck\.vn"/);
  assert.match(apiUrl, /endsWith\("\.aeck\.vn"\)/);
});

test("exam section compatibility endpoints delegate to the protected engine", async () => {
  const [content, draft, result] = await Promise.all([
    source("app/api/exams/[sectionId]/content/route.ts"),
    source("app/api/exams/[sectionId]/draft/route.ts"),
    source("app/api/exams/[sectionId]/result-content/route.ts"),
  ]);
  assert.match(content, /postExamContent/);
  assert.match(draft, /action: "progress"/);
  assert.match(result, /postResultContent/);
  for (const route of [content, draft, result]) assert.match(route, /requestWithSectionId/);
});

test("question-bank LaTeX import previews and saves only selected valid questions", async () => {
  const [component, route, preview, styles] = await Promise.all([
    source("app/admin-question-bank.tsx"),
    source("app/api/admin/question-banks/route.ts"),
    source("lib/question-bank-latex.ts"),
    source("app/admin-question-bank.css"),
  ]);
  assert.match(component, /accept="\.tex,text\/x-tex"/);
  assert.match(component, /buildLatexQuestionPreview/);
  assert.match(component, /has-error/);
  assert.match(styles, /\.question-bank-latex-preview-item\.has-error/);
  assert.match(component, /selectedLatexIndexes/);
  assert.match(component, /validLatexItems\.filter\(item => selectedLatexIndexes\.has\(item\.index\)\)\.map\(item => item\.index\)/);
  assert.match(component, /const importIndexes = selectedLatexValidIndexes/);
  assert.match(component, /importIndexes,/);
  assert.match(component, /Đã chọn \$\{selectedLatexValidIndexes\.length\}\/\$\{validLatexItems\.length\} câu hợp lệ\./);
  assert.match(component, /Lưu \$\{selectedLatexValidIndexes\.length\} câu đã chọn/);
  assert.match(route, /action === "import_latex"/);
  assert.match(route, /const selected = preview\.items\.filter\(item => requestedIndexes\.includes\(item\.index\)\)/);
  assert.match(route, /rollback|delete\(\)\.in/s);
  assert.match(preview, /katex\.renderToString/);
});

test("question-bank keeps content validation and exam-reuse protections on the server", async () => {
  const route = await source("app/api/admin/question-banks/route.ts");

  assert.match(route, /function invalidQuestionContentResponse[\s\S]*code:\s*"invalid_question_content"[\s\S]*status:\s*422/s);
  assert.match(route, /if \(action === "create_item" \|\| action === "update_item"\) \{[\s\S]*const contentValidation = validateQuestionBankContent\(body\.content\);[\s\S]*if \(!contentValidation\.valid\) return invalidQuestionContentResponse\(contentValidation\.fieldErrors\);/s);
  assert.match(route, /const semanticInvalid = selected\.flatMap\(item => \{[\s\S]*validateQuestionBankContent\([\s\S]*code:\s*"invalid_question_content"[\s\S]*status:\s*422/s);
  assert.match(route, /const invalidSourceItems = sourceItems\.flatMap\(item => item\.validation\.valid[\s\S]*code:\s*"invalid_question_content"[\s\S]*status:\s*422/s);
  assert.match(route, /if \(action === "seed_from_section" \|\| action === "attach_to_exam"\) \{[\s\S]*ensureAdminPermission\(request, "exams", admin\)[\s\S]*if \(!examSecurity\.ok\) return examSecurity\.response;/s);
  assert.match(route, /if \(targetExam\.data\.published === true\) return errorResponse\([\s\S]*?, 409\);/s);
  assert.match(route, /if \(invalidItems\.length\) return invalidQuestionContentResponse\(\{\}, invalidItems\);/);
});

test("question-bank blocks an unreviewed near duplicate and exposes an explicit admin confirmation", async () => {
  const [component, route, styles] = await Promise.all([
    source("app/admin-question-bank.tsx"),
    source("app/api/admin/question-banks/route.ts"),
    source("app/admin-question-bank.css"),
  ]);
  assert.match(component, /PotentialDuplicateError/);
  assert.match(component, /Rà soát câu hỏi gần giống/);
  assert.match(component, /Đã rà soát, vẫn lưu/);
  assert.match(component, /saveItem\(true\)/);
  assert.match(route, /findPotentialDuplicatesForItem/);
  assert.match(route, /potential_duplicates/);
  assert.match(route, /allowPotentialDuplicates !== true/);
  assert.match(styles, /\.question-bank-duplicate-review/);
});

test("question-bank preserves authoring work, retries a failed bank load, and explains rejected attach items", async () => {
  const [component, styles] = await Promise.all([
    source("app/admin-question-bank.tsx"),
    source("app/admin-question-bank.css"),
  ]);

  assert.match(component, /selectedBankLoadError/);
  assert.match(component, /Tải lại ngân hàng/);
  assert.match(component, /retrySelectedBank/);
  assert.match(component, /window\.addEventListener\("beforeunload", warnBeforeUnload\)/);
  assert.match(component, /confirmDiscard\("Bạn có bản nháp, lựa chọn hoặc nội dung chưa lưu/);
  assert.match(component, /correctAnswer: answerInputValue\(item\.correct_answer, item\.question_type\)/);
  assert.match(component, /itemForm\.questionType === "inline" \? <textarea/);
  assert.match(component, /Mỗi đáp án một dòng; dấu phẩy trong số thập phân được giữ nguyên/);
  assert.match(component, /invalidItemsFrom\(payload\.invalidItems\)/);
  assert.match(component, /selectedAttachInvalidItems/);
  assert.match(component, /Bỏ chọn hoặc sửa các câu dưới đây rồi thử lại/);
  assert.match(styles, /\.question-bank-attach-invalid/);
});

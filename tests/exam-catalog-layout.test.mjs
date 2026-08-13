import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("learner room catalog keeps a fixed three/two/one-column slot layout", async () => {
  const css = await readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8");

  assert.match(css, /\.exam-room-page \.exam-room-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);[\s\S]*?align-items:\s*stretch;/);
  assert.match(css, /@media\s*\(max-width:\s*1100px\)[\s\S]*?\.exam-room-page \.exam-room-grid\s*\{[\s\S]*?grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.exam-room-page \.exam-room-grid[\s\S]*?grid-template-columns:\s*1fr;/);
  assert.doesNotMatch(css, /\.exam-room-page \.exam-room-grid\s*\{[^}]*grid-template-columns:\s*repeat\(auto-fit/);
});

test("room catalog tags and titles share a centered, long-text-safe axis", async () => {
  const [studentCss, adminCss, overflowCss] = await Promise.all([
    readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-macos.css", import.meta.url), "utf8"),
    readFile(new URL("../app/text-overflow-polish.css", import.meta.url), "utf8"),
  ]);

  assert.match(studentCss, /\.exam-room-page \.reference-room-card-title\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*text-align:\s*center;/);
  assert.match(studentCss, /\.exam-room-page \.exam-type-badge\s*\{[^}]*align-self:\s*center;[^}]*white-space:\s*nowrap;[^}]*word-break:\s*normal;/);
  assert.match(adminCss, /\.workspace-page:has\(\.room-catalog-grid\) \.reference-room-card-title\s*\{[^}]*align-items:\s*center;[^}]*justify-content:\s*center;[^}]*text-align:\s*center;/);
  assert.match(overflowCss, /\.reference-room-card-title h2\s*\{[^}]*overflow-wrap:\s*break-word;[^}]*text-align:\s*center;[^}]*word-break:\s*normal;/);
});

test("exam package cards stay in one fixed-width vertical column", async () => {
  const css = await readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8");

  assert.match(css, /\.exam-list-page \.exam-list-grid\s*\{[^}]*grid-template-columns:\s*minmax\(0, 520px\);[^}]*justify-content:\s*start;/);
  assert.doesNotMatch(css, /\.exam-list-page \.exam-list-grid\s*\{[^}]*repeat\(auto-fit/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.exam-list-page \.exam-list-grid[\s\S]*?grid-template-columns:\s*1fr;/);
});

test("attempt history dialog exposes real result links and responsive summaries", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/exam-room.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /function ExamAttemptHistoryDialog/);
  assert.match(source, /role="dialog" aria-modal="true"/);
  assert.match(source, /href=\{`\/exam\/result\/\$\{encodeURIComponent\(attempt\.id\)\}`\}/);
  assert.match(source, /history\.length \? `Xem lịch sử \(\$\{history\.length\}\)` : "Chưa có lịch sử"/);
  assert.match(source, /disabled=\{!history\.length\}/);
  assert.match(css, /\.exam-attempt-history-list\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media\s*\(max-width:\s*767px\)[\s\S]*?\.exam-attempt-history-list\s*\{[^}]*grid-template-columns:\s*1fr;/);
});

test("independent-subject results return to the room package instead of the subject selector", async () => {
  const source = await readFile(new URL("../app/exam-room.tsx", import.meta.url), "utf8");
  const resultBranch = source.slice(source.indexOf("<ThptqgResult"), source.indexOf("const answerMap", source.indexOf("<ThptqgResult")));

  assert.match(resultBranch, /onBack=\{\(\) => navigate\(`\/exam-room\/\$\{encodeURIComponent\(data\.room\.id\)\}`\)\}/);
  assert.doesNotMatch(resultBranch, /onBack=\{\(\) => navigate\(examListPath\(data\.exam\.id/);
  assert.match(resultBranch, /onRetake=\{\(\) => subjectSection && navigate\(examSectionPath\(data\.exam\.id, subjectSection\.id, "practice", "confirm"\)\)\}/);
});

test("pre-exam enhancements: roving tabindex, ModeDialog access, Escape, inert cleanup, and resume button label", async () => {
  const source = await readFile(new URL("../app/exam-room.tsx", import.meta.url), "utf8");

  // 1. Roving tabindex arrow behavior:
  assert.match(source, /onKeyDown=\{handleKeyDown\}/);
  assert.match(source, /tabIndex=\{typeFilter === "ALL" \? 0 : -1\}/);
  assert.match(source, /tabIndex=\{typeFilter === type \? 0 : -1\}/);

  // 2. ModeDialog accessible name / describedby:
  assert.match(source, /aria-labelledby="exam-mode-title"/);
  assert.match(source, /aria-describedby="exam-mode-desc"/);

  // 3. Escape key down listener:
  assert.match(source, /if \(event\.key === "Escape"\)/);

  // 4. Inert background elements clean-up & preservation check:
  assert.match(source, /const original = element\.inert;/);
  assert.match(source, /element\.inert = original;/);

  // 5. Active attempt resume label:
  assert.match(source, /active \? "Tiếp tục làm bài" : "Bắt đầu làm bài"/);
  assert.match(source, /className=\{`reference-exam-start \$\{active \? "is-resume" : ""\}\`/);

  // 6. Valid HTML semantic structuring of options cards:
  assert.match(source, /<div className="exam-mode-option-card">/);
  assert.match(source, /<div className="exam-mode-option-card is-simulation">/);
  assert.match(source, /<button type="button" className="exam-mode-action-btn"/);
});

import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("learner catalog uses the exact supplied crimson product language", async () => {
  const css = await readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8");

  assert.match(css, /\.ui-shell\.student-app\.product-shell\[data-ui-mode="optimized-chrome-only"\]/);
  assert.match(css, /--catalog-primary:\s*#cd1627/);
  assert.match(css, /--catalog-primary-hover:\s*#b91c2b/);
  assert.match(css, /--catalog-primary-soft:\s*#fff1f2/);
  assert.match(css, /:where\(a, button, input\):focus-visible/);
  assert.doesNotMatch(css, /--catalog-blue|#(?:007aff|0066d6|1d4ed8|1e40af|eff6ff|dbeafe)/i);
  assert.doesNotMatch(css, /rgba\((?:0,\s*122,\s*255|29,\s*78,\s*216|30,\s*64,\s*175|0,\s*102,\s*214|88,\s*86,\s*214)/i);
  assert.doesNotMatch(css, /\.sidebar nav button/);
  assert.doesNotMatch(css, /(?:-webkit-)?backdrop-filter/);
});

test("exam catalog start actions keep the exact supplied red over shared shell styles", async () => {
  const css = await readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8");

  assert.match(
    css,
    /\.ui-shell\.student-app\.product-shell\.learner-red-theme\[data-ui-mode="optimized-chrome-only"\][^\{]*\.reference-room-start,[\s\S]*?\.reference-exam-start\s*\{[^}]*border-color:\s*#cd1627[^}]*background:\s*#cd1627[^}]*color:\s*#fff/s,
  );
});

test("exam-list footer follows the supplied narrow card stack", async () => {
  const css = await readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8");

  assert.match(
    css,
    /@media\s*\(max-width:\s*575px\)[\s\S]*?\.exam-list-page \.reference-exam-card-footer\s*\{[^}]*align-items:\s*stretch;[^}]*flex-direction:\s*column;/,
  );
  assert.match(
    css,
    /@media\s*\(max-width:\s*575px\)[\s\S]*?\.exam-list-page \.reference-exam-start\s*\{[^}]*width:\s*100%;/,
  );
});

test("learner room catalog follows the supplied one-two-three column breakpoints", async () => {
  const css = await readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8");

  assert.match(css, /\.exam-room-page \.exam-room-grid\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*gap:\s*20px;/s);
  assert.match(css, /@media \(min-width:\s*1024px\)[\s\S]*?\.exam-room-page \.exam-room-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(min-width:\s*1536px\)[\s\S]*?\.exam-room-page \.exam-room-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
});

test("room catalog titles keep the supplied left alignment and long-text safety", async () => {
  const css = await readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8");

  assert.match(css, /\.exam-room-page \.reference-room-card-title\s*\{[^}]*display:\s*block;[^}]*text-align:\s*start;/s);
  assert.match(css, /\.exam-room-page \.reference-room-card-title h2\s*\{[^}]*overflow-wrap:\s*break-word;[^}]*text-align:\s*start;[^}]*word-break:\s*normal;/s);
});

test("learner room and exam cards do not render invented type badges", async () => {
  const source = await readFile(new URL("../app/exam-room.tsx", import.meta.url), "utf8");
  const catalog = source.slice(source.indexOf("function ExamRoomCatalog"), source.indexOf("function ExamAttemptHistoryDialog"));

  assert.doesNotMatch(catalog, /exam-type-badge|reference-paper-label/);
});

test("exam package cards follow the supplied one-two-three column breakpoints", async () => {
  const css = await readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8");

  assert.match(css, /\.exam-list-page \.exam-list-grid\s*\{[^}]*grid-template-columns:\s*1fr;[^}]*gap:\s*24px;/s);
  assert.match(css, /@media \(min-width:\s*1024px\)[\s\S]*?\.exam-list-page \.exam-list-grid\s*\{[^}]*grid-template-columns:\s*repeat\(2, minmax\(0, 1fr\)\);/);
  assert.match(css, /@media \(min-width:\s*1536px\)[\s\S]*?\.exam-list-page \.exam-list-grid\s*\{[^}]*grid-template-columns:\s*repeat\(3, minmax\(0, 1fr\)\);/);
});

test("attempt history dialog exposes real result links and responsive summaries", async () => {
  const [source, css] = await Promise.all([
    readFile(new URL("../app/exam-room.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/exam-catalog-redesign.css", import.meta.url), "utf8"),
  ]);

  assert.match(source, /function ExamAttemptHistoryDialog/);
  assert.match(source, /role="dialog" aria-modal="true"/);
  assert.match(source, /href=\{`\/exam\/result\/\$\{encodeURIComponent\(attempt\.id\)\}`\}/);
  assert.match(source, />\s*Xem đáp án\s*</);
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

test("pre-exam enhancements keep the reference catalog and accessible mode dialog", async () => {
  const source = await readFile(new URL("../app/exam-room.tsx", import.meta.url), "utf8");

  // 1. The supplied catalog has no invented type-filter rail:
  assert.doesNotMatch(source, /typeFilter|exam-room-type-filters|availableTypes/);

  // 2. ModeDialog accessible name / describedby:
  assert.match(source, /aria-labelledby="exam-mode-title"/);
  assert.match(source, /aria-describedby="exam-mode-desc"/);

  // 3. Escape key down listener:
  assert.match(source, /if \(event\.key === "Escape"\)/);

  // 4. Inert background elements clean-up & preservation check:
  assert.match(source, /const original = element\.inert;/);
  assert.match(source, /element\.inert = original;/);

  // 5. Active attempt keeps the compact reference action label:
  assert.match(source, /active \? "Tiếp tục" : "Bắt đầu"/);
  assert.match(source, /className=\{`reference-exam-start \$\{active \? "is-resume" : ""\}\`/);

  // 6. Valid HTML semantic structuring of options cards:
  assert.match(source, /<div className="exam-mode-option-card">/);
  assert.match(source, /<div className="exam-mode-option-card is-simulation">/);
  assert.match(source, /<button type="button" className="exam-mode-action-btn"/);
});

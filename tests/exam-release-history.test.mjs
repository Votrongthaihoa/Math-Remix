import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("result release policy never exposes a hidden score or answer review", async () => {
  const { examReleaseVisibility, normalizeExamPolicy } = await import("../lib/exam-policy.ts");
  const policy = normalizeExamPolicy({
    mode: "official",
    release: { score: "never", answers: "after_submit", solutions: "after_submit" },
  }, { examType: "TSA", audience: "account" });
  assert.deepEqual(examReleaseVisibility(policy, { status: "submitted", score: 85 }), {
    scoreVisible: false,
    answersVisible: false,
    solutionsVisible: false,
  });
});

test("manual account release unlocks only after the exam release timestamp", async () => {
  const { examReleaseVisibility, normalizeExamPolicy } = await import("../lib/exam-policy.ts");
  const policy = normalizeExamPolicy({
    mode: "official",
    release: { score: "manual", answers: "manual", solutions: "manual" },
  }, { examType: "HSA", audience: "account" });
  const releaseAt = "2026-08-08T10:00:00.000Z";
  assert.equal(examReleaseVisibility(policy, { status: "submitted", score: 50 }, { releasedAt: releaseAt }, Date.parse("2026-08-08T09:59:59.000Z")).scoreVisible, false);
  assert.deepEqual(examReleaseVisibility(policy, { status: "submitted", score: 50 }, { releasedAt: releaseAt }, Date.parse("2026-08-08T10:00:00.000Z")), {
    scoreVisible: true,
    answersVisible: true,
    solutionsVisible: true,
  });
});

test("exam-code randomization is reproducible and validates the requested code", async () => {
  const { createAttemptPolicy, examCodes, isExamCodeAllowed, normalizeExamPolicy, prepareQuestionIdentityForPolicy } = await import("../lib/exam-policy.ts");
  const policy = normalizeExamPolicy({
    mode: "official",
    randomization: {
      shuffleQuestions: true,
      shuffleOptions: true,
      randomizationMode: "exam_code",
      examCodeCount: 4,
      seedStrategy: "attempt",
    },
  }, { examType: "THPTQG", audience: "guest" });
  assert.deepEqual(examCodes(policy), ["101", "102", "103", "104"]);
  assert.equal(isExamCodeAllowed(policy, "102"), true);
  assert.equal(isExamCodeAllowed(policy, "999"), false);

  const first = createAttemptPolicy(policy, { examCode: "102" });
  const second = createAttemptPolicy(policy, { examCode: "102" });
  assert.equal(first.randomization.seed, second.randomization.seed);
  const rows = [
    { id: "q1", section_id: "s1", passage: "", optionValues: ["A", "B", "C"] },
    { id: "q2", section_id: "s1", passage: "", optionValues: ["A", "B", "C"] },
    { id: "q3", section_id: "s1", passage: "", optionValues: ["A", "B", "C"] },
  ];
  assert.deepEqual(
    prepareQuestionIdentityForPolicy(rows, first),
    prepareQuestionIdentityForPolicy(rows, second),
  );
});

test("result content is snapshot-ordered and only exposes release-safe projections", async () => {
  const [resultRoute, guestRoute, examRoom] = await Promise.all([
    source("app/api/exams/result-content/route.ts"),
    source("app/api/guest-exams/route.ts"),
    source("app/exam-room.tsx"),
  ]);
  assert.match(resultRoute, /applyQuestionSnapshotOrder\(sourceQuestions, context\.attempt\.question_order, context\.attempt\.option_order\)/);
  assert.match(resultRoute, /correct_answers: visibility\.scoreVisible \? correctAnswers : null/);
  assert.match(resultRoute, /score: visibility\.scoreVisible \? score : null/);
  assert.match(resultRoute, /questions: visibility\.answersVisible \? projectResultQuestions\(questions\) : \[\]/);
  assert.match(resultRoute, /delete safeQuestion\.latex_source/);
  assert.match(resultRoute, /resultVisibility: visibility/);
  assert.match(guestRoute, /isExamCodeAllowed\(policy, body\.examCode\)/);
  assert.match(guestRoute, /exam_code: requestedExamCode/);
  assert.match(examRoom, /resultVisibility/);
  assert.match(examRoom, /sectionsForReview/);
});

test("TSA answer preview and released review keep the dedicated TSA review renderer", async () => {
  const [workspace, examRoom, reviewPreview] = await Promise.all([
    source("app/admin-exam-workspace.tsx"),
    source("app/exam-room.tsx"),
    source("components/remixstudyedu/RemixStudyEduReviewPreview.tsx"),
  ]);
  assert.match(workspace, /isTsaPreview\s*&&\s*mode\s*===\s*"answer"\s*\?\s*<RemixStudyEduReviewPreview/);
  assert.match(examRoom, /isHsaResult\s*\?\s*<LearnerExamPreview[\s\S]*?:\s*<RemixStudyEduReviewPreview/);
  assert.match(examRoom, /attemptAnswers=\{reviewAnswers\}[\s\S]*?correctAnswers=\{reviewKeys\}[\s\S]*?resultMode/);
  assert.match(reviewPreview, /className=\{`tsa-review-page/);
});

test("the shared learner renderer keeps non-TSA review details inside the existing question geometry", async () => {
  const [mathExam, learnerPreview] = await Promise.all([
    source("components/remixstudyedu/MathExam.jsx"),
    source("components/remixstudyedu/LearnerExamPreview.tsx"),
  ]);
  assert.match(mathExam, /answerPreview\s*=\s*false[\s\S]*?reviewStatuses\s*=\s*\[\][\s\S]*?correctAnswers\s*=\s*\{\}[\s\S]*?solutions\s*=\s*\[\]/);
  assert.match(mathExam, /hideEmptyReadOnlyBlanks=\{answerPreview\}/);
  assert.match(mathExam, /<MathReviewDetails[\s\S]*?correctAnswer=\{correctAnswers\[question\.id\]\}[\s\S]*?solution=\{solutions\[globalIndex\]\}/);
  assert.match(mathExam, /className=\{`math-question-card[\s\S]*?review-\$\{currentReviewStatus\}/);
  assert.doesNotMatch(learnerPreview, /<details className="learner-preview-solution"/);
});

test("TSA answer review renders the candidate watermark behind question content", async () => {
  const [review, previewCss, overrides] = await Promise.all([
    source("components/remixstudyedu/RemixStudyEduReviewPreview.tsx"),
    source("components/remixstudyedu/tsa-review-preview.css"),
    source("components/remixstudyedu/tsa-result-overrides.css"),
  ]);
  assert.match(review, /buildTsaReviewWatermark|tsa-review-watermark-image/);
  assert.match(previewCss, /\.tsa-review-preview-page\.has-watermark::before[\s\S]*?background-image:var\(--tsa-review-watermark-image\)/);
  assert.doesNotMatch(previewCss, /\.tsa-review-preview-page\.has-watermark \.tsa-review-question[\s\S]*?background-image:var\(--tsa-review-watermark-image\)/);
  assert.doesNotMatch(overrides, /tsa-review-watermark-image/);
});

test("TSA answer review repeats the candidate watermark across the full review surface", async () => {
  const previewCss = await source("components/remixstudyedu/tsa-review-preview.css");
  assert.match(previewCss, /\.tsa-review-preview-page\.has-watermark::before\s*\{[\s\S]*?background-repeat:repeat;[\s\S]*?background-size:340px 190px;/);
  assert.match(previewCss, /\.tsa-review-preview-page\.has-watermark \.tsa-review-passage-pane,[\s\S]*?\.tsa-review-preview-page\.has-watermark \.tsa-review-questions-pane,[\s\S]*?background-color:transparent;/);
});

test("TSA answer review uses one outer watermark layer beneath all review content", async () => {
  const previewCss = await source("components/remixstudyedu/tsa-review-preview.css");
  assert.match(previewCss, /\.tsa-review-preview-page\.has-watermark\s*\{[\s\S]*?position:relative;[\s\S]*?isolation:isolate;/);
  assert.match(previewCss, /\.tsa-review-preview-page\.has-watermark::before\s*\{[\s\S]*?position:absolute;[\s\S]*?inset:0;[\s\S]*?z-index:0;[\s\S]*?pointer-events:none;[\s\S]*?background-image:var\(--tsa-review-watermark-image\);/);
  assert.match(previewCss, /\.tsa-review-preview-page\.has-watermark\s*>\s*\*\s*\{[\s\S]*?z-index:1;/);
  assert.match(previewCss, /\.tsa-review-preview-page\.has-watermark\s*>\s*:not\(\.tsa-review-panel\)\s*\{[\s\S]*?position:relative;/);
  assert.doesNotMatch(previewCss, /\.tsa-review-preview-page\.has-watermark \.tsa-review-question[\s\S]*?background-image:var\(--tsa-review-watermark-image\)/);
});

test("answer review hides surplus empty blanks and keeps the THPTQG footer geometry unchanged", async () => {
  const [review, mathExam, thptqgRenderer, thptqgStyles] = await Promise.all([
    source("components/remixstudyedu/RemixStudyEduReviewPreview.tsx"),
    source("components/remixstudyedu/MathExam.jsx"),
    source("components/thptqg/ThptqgExamRenderer.tsx"),
    source("components/thptqg/thptqg.css"),
  ]);
  assert.match(review, /<QuestionAnswer[\s\S]*?readOnly[\s\S]*?hideEmptyReadOnlyBlanks/);
  assert.match(mathExam, /hideEmptyReadOnlyBlanks\s*=\s*false/);
  assert.match(mathExam, /if\s*\(readOnly\s*&&\s*hideEmptyReadOnlyBlanks\)\s*return null/);
  assert.match(thptqgRenderer, /previewMode === "answer" \? " is-answer-review" : ""/);
  assert.match(thptqgStyles, /\.thptqg-question-strip-buttons\{\s*width:max-content;\s*min-width:100%;\s*height:40px;\s*display:flex;/);
  assert.match(thptqgStyles, /\.thptqg-question-strip-buttons button\{\s*position:relative;\s*width:40px;\s*min-width:40px;\s*max-width:40px;\s*height:40px;/);
  assert.doesNotMatch(thptqgStyles, /\.thptqg-exam-shell\.is-answer-review \.thptqg-question-strip-buttons/);
  assert.match(thptqgStyles, /\.thptqg-exam-shell \.thptqg-footer-nav,\s*\.thptqg-exam-shell \.thptqg-question-strip-buttons button\s*\{[\s\S]*?font-size:clamp\(12px,1\.5vw,14px\);[\s\S]*?font-weight:500/);
  assert.match(thptqgStyles, /\.thptqg-exam-shell \.thptqg-question-strip-buttons button\s*\{\s*padding:0;\s*white-space:nowrap/);
});

test("keeps THPTQG answer cards above the watermark layer", async () => {
  const thptqgStyles = await source("components/thptqg/thptqg.css");
  assert.match(thptqgStyles, /\.thptqg-exam-shell\.is-answer-review \.thptqg-question-card,\s*\.thptqg-exam-shell\.is-result-review \.thptqg-question-card\s*\{\s*position:relative;\s*z-index:1;/);
});

test("renders the THPTQG watermark on answer cards without replacing their white surface", async () => {
  const thptqgStyles = await source("components/thptqg/thptqg.css");
  assert.match(thptqgStyles, /\.thptqg-exam-shell\.is-answer-review \.thptqg-question-card,[\s\S]*?background:#fff;[\s\S]*?background-image:var\(--thptqg-watermark-image\);/);
});

test("released answer review preserves authored numbering and choice columns without exposing LaTeX", async () => {
  const [resultRoute, examRoom, review, thptqgStyles] = await Promise.all([
    source("app/api/exams/result-content/route.ts"),
    source("app/exam-room.tsx"),
    source("components/remixstudyedu/RemixStudyEduReviewPreview.tsx"),
    source("components/thptqg/thptqg.css"),
  ]);
  assert.match(resultRoute, /function projectResultQuestions/);
  assert.match(resultRoute, /option_columns:\s*metadata\.optionColumns/);
  assert.match(resultRoute, /_displayNumber:\s*displayNumber/);
  assert.match(resultRoute, /_partInstruction:\s*partInstruction/);
  assert.match(resultRoute, /delete safeQuestion\.latex_source/);
  assert.match(examRoom, /option_columns:\s*question\.option_columns/);
  assert.match(examRoom, /displayNumber:\s*question\._displayNumber/);
  assert.match(review, /if \(item\.displayNumber\) return \{ number: item\.displayNumber, partInstruction: item\.partInstruction \}/);
  assert.match(thptqgStyles, /\.thptqg-options\.math-choice-list\.columns-3[\s\S]*?grid-template-columns:repeat\(3,minmax\(0,1fr\)\)/);

});

test("exam history cleanup is admin-only, audited, and not callable through the browser table grant", async () => {
  const [migration, route, workspace] = await Promise.all([
    source("supabase/migrations/029_exam_history_admin_cleanup.sql"),
    source("app/api/admin/exam-history/route.ts"),
    source("app/admin-exam-workspace.tsx"),
  ]);
  assert.match(migration, /revoke delete on table public\.exam_attempts from anon, authenticated/i);
  assert.match(migration, /'delete_exam_history'/);
  assert.match(route, /security\.profile\.role !== "admin"/);
  assert.match(route, /confirm !== true/);
  assert.match(route, /startExamAdminAudit/);
  assert.match(route, /from\("exam_attempts"\)\.delete\(\)/);
  assert.doesNotMatch(workspace, /from\("exam_attempts"\)\.delete\(\)/);
  assert.match(workspace, /\/api\/admin\/exam-history/);
});

test("authenticated manual release has a forward-only database column and audited admin action", async () => {
  const [migration, policyRoute, resultRoute, contentServer] = await Promise.all([
    source("supabase/migrations/030_exam_results_release.sql"),
    source("app/api/admin/exam-policy/route.ts"),
    source("app/api/exams/result-content/route.ts"),
    source("lib/exam-content-server.ts"),
  ]);
  assert.match(migration, /add column if not exists results_released_at timestamptz/i);
  assert.match(policyRoute, /action\?: .*release_results/);
  assert.match(policyRoute, /action: "release_exam_results"/);
  assert.match(resultRoute, /releasedAt: context\.exam\.results_released_at/);
  assert.match(contentServer, /results_released_at/);
});

test("monitoring dashboard reports answered progress and factual event timeline", async () => {
  const [route, component] = await Promise.all([
    source("app/api/admin/exam-operations/route.ts"),
    source("app/admin-exam-operations.tsx"),
  ]);
  assert.match(route, /autosaveErrors/);
  assert.match(route, /network_state.*failed.*conflict/s);
  assert.match(component, /function answerCount/);
  assert.match(component, /answerCount\(attempt\.answers\)/);
  assert.match(component, /operation-monitor-details/);
});

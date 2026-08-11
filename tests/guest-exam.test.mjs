import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  answerVisibility,
  guestAttemptDeadline,
  hashGuestPassword,
  isGuestExportWindowValid,
  normalizeGuestSettings,
  prepareQuestionsForPolicy,
  publicGuestQuestion,
  slotPhase,
  verifyGuestPassword,
} from "../lib/guest-exam-server.ts";
import { normalizeExamPolicy } from "../lib/exam-policy.ts";
import {
  HSA_STRUCTURE_PROFILES,
  HSA_SCIENCE_SUBJECTS,
  VSAT_SUBJECT_TEMPLATES,
  defaultHsaStructureConfig,
  hsaTotalDuration,
  isIndependentSubjectExamType,
  normalizeExamType,
  normalizeHsaStructureConfig,
} from "../lib/exam-config.ts";
import {
  buildGuestIdentityColumns,
  identityDisplayName,
} from "../lib/guest-identity.ts";

test("guest kíp phases and server-side attempt deadline are bounded", () => {
  const slot = { enabled: true, starts_at: "2026-01-01T09:00:00.000Z", ends_at: "2026-01-01T10:00:00.000Z", grace_period_minutes: 30 };
  const start = Date.parse("2026-01-01T09:00:00.000Z");
  assert.equal(slotPhase(slot, start - 1), "upcoming");
  assert.equal(slotPhase(slot, start), "open");
  assert.equal(slotPhase(slot, Date.parse("2026-01-01T10:10:00.000Z")), "grace");
  assert.equal(slotPhase(slot, Date.parse("2026-01-01T10:31:00.000Z")), "closed");
  assert.equal(guestAttemptDeadline({ duration_minutes: 195 }, slot, "2026-01-01T09:30:00.000Z"), "2026-01-01T10:30:00.000Z");
  assert.equal(guestAttemptDeadline({ duration_minutes: 195 }, slot, "2026-01-01T09:30:00.000Z", undefined, 300), "2026-01-01T10:35:00.000Z");
});

test("optional export windows allow a zero-minute grace period", () => {
  const endsAt = "2026-01-01T10:00:00.000Z";
  assert.equal(isGuestExportWindowValid(endsAt, 0), true);
  assert.equal(isGuestExportWindowValid(endsAt, 0, null, null), true);
  assert.equal(isGuestExportWindowValid(endsAt, 30, "2026-01-01T10:01:00.000Z", null), true);
  assert.equal(isGuestExportWindowValid(endsAt, 0, "2026-01-01T10:01:00.000Z", null), false);
  assert.equal(isGuestExportWindowValid(endsAt, 30, "2026-01-01T10:01:00.000Z", "2026-01-01T10:01:00.000Z"), false);
});

test("guest settings and public question projection remove authoring secrets", () => {
  const settings = normalizeGuestSettings({ identityFields: [{ key: "Tên trường", label: "Tên trường", type: "email", required: true }, { key: "Tên trường", label: "trùng", required: false }] });
  assert.equal(settings.identityFields.length, 1);
  assert.equal(settings.identityFields[0].type, "email");
  const question = publicGuestQuestion({
    id: "q1",
    section_id: "s1",
    prompt: "Câu hỏi",
    question_type: "single",
    options: [{ value: "A", label: "Một", correct: true }, { value: "B", label: "Hai" }],
    points: 1,
    sort_order: 0,
    latex_source: "\\begin{ex} \\True A \\end{ex}",
  });
  assert.deepEqual(question.options, [{ value: "A", label: "Một" }, { value: "B", label: "Hai" }]);
  assert.doesNotMatch(JSON.stringify(question), /latex_source|correct|\\True/);
  const guestImage = publicGuestQuestion({
    id: "q2",
    section_id: "s1",
    prompt: "Có ảnh",
    question_type: "single",
    options: [],
    points: 1,
    sort_order: 1,
    media_url: "/api/exam-images/11111111-1111-4111-8111-111111111111/22222222-2222-4222-8222-222222222222.png",
  }, "33333333-3333-4333-8333-333333333333");
  assert.match(guestImage.media_url, /\/api\/guest-exams\/images\/11111111-1111-4111-8111-111111111111\/22222222-2222-4222-8222-222222222222\.png\?attemptId=33333333-3333-4333-8333-333333333333/);
});

test("THPTQG guest shuffling preserves part markers and selectable option identity", () => {
  const latexSingle = (part, prompt) => `${part ? `\\phan${part}\n` : ""}\\begin{ex}${prompt}\\choice{A}{B}{C}{D}\\end{ex}`;
  const latexTrueFalse = (part, prompt) => `${part ? `\\phan${part}\n` : ""}\\begin{ex}${prompt}\\choiceTF{A}{B}{C}{D}\\end{ex}`;
  const questions = [
    { id: "p1-q1", section_id: "math", prompt: "1", question_type: "single", options: [], points: 0.25, sort_order: 0, latex_source: latexSingle(1, "P1Q1") },
    { id: "p1-q2", section_id: "math", prompt: "2", question_type: "single", options: [], points: 0.25, sort_order: 1, latex_source: latexSingle(null, "P1Q2") },
    { id: "p1-q3", section_id: "math", prompt: "3", question_type: "single", options: [], points: 0.25, sort_order: 2, latex_source: latexSingle(null, "P1Q3") },
    { id: "p2-q1", section_id: "math", prompt: "4", question_type: "true_false", options: [], points: 1, sort_order: 3, latex_source: latexTrueFalse(2, "P2Q1") },
    { id: "p2-q2", section_id: "math", prompt: "5", question_type: "true_false", options: [], points: 1, sort_order: 4, latex_source: latexTrueFalse(null, "P2Q2") },
    { id: "p3-q1", section_id: "math", prompt: "6", question_type: "text", options: [], points: 0.5, sort_order: 5, latex_source: "\\phan3\n\\begin{ex}P3Q1\\shortans{1}\\end{ex}" },
    { id: "p3-q2", section_id: "math", prompt: "7", question_type: "text", options: [], points: 0.5, sort_order: 6, latex_source: "\\begin{ex}P3Q2\\shortans{2}\\end{ex}" },
  ];
  const policy = normalizeExamPolicy({
    randomization: { enabled: true, shuffleQuestions: true, shuffleOptions: true, randomizationMode: "per_attempt", seedStrategy: "attempt", seed: "guest-thptqg-seed" },
  }, { examType: "THPTQG", audience: "guest" });
  const prepared = prepareQuestionsForPolicy(questions, policy);
  const publicQuestions = prepared.questions.map(question => publicGuestQuestion(question));

  assert.deepEqual(publicQuestions.flatMap((question, index) => question.part ? [[index, question.part]] : []), [[0, 1], [3, 2], [5, 3]]);
  assert.deepEqual(new Set(prepared.questionOrder.slice(0, 3)), new Set(["p1-q1", "p1-q2", "p1-q3"]));
  assert.deepEqual(new Set(prepared.questionOrder.slice(3, 5)), new Set(["p2-q1", "p2-q2"]));
  assert.equal(prepared.optionOrder["p1-q1"].length, 4);
  assert.deepEqual(prepared.optionOrder["p2-q1"], []);
});

test("guest answer visibility follows release and threshold settings", () => {
  const slot = { results_released_at: null, ends_at: "2026-01-01T10:00:00.000Z" };
  assert.deepEqual(answerVisibility({ showScore: "after_slot", showAnswers: "threshold", scoreThreshold: 70, answerThreshold: 80 }, slot, 75, Date.parse("2026-01-01T09:59:00.000Z")), { scoreVisible: false, answersVisible: false });
  assert.deepEqual(answerVisibility({ showScore: "after_slot", showAnswers: "threshold", scoreThreshold: 70, answerThreshold: 80 }, slot, 85, Date.parse("2026-01-01T10:01:00.000Z")), { scoreVisible: true, answersVisible: true });
  assert.deepEqual(answerVisibility({ showScore: "never", showAnswers: "after_submit", scoreThreshold: 0, answerThreshold: 0 }, slot, 100, Date.parse("2026-01-01T09:00:00.000Z")), { scoreVisible: false, answersVisible: false });
  assert.deepEqual(answerVisibility({ showScore: "after_slot", showAnswers: "after_submit", scoreThreshold: 0, answerThreshold: 0 }, slot, 100, Date.parse("2026-01-01T09:00:00.000Z")), { scoreVisible: false, answersVisible: false });
  assert.deepEqual(answerVisibility({ showScore: "after_submit", showAnswers: "never", scoreThreshold: 0, answerThreshold: 0 }, slot, 100, Date.parse("2026-01-01T09:00:00.000Z")), { scoreVisible: true, answersVisible: false });
});

test("guest slot passwords are salted and backward-compatible", async () => {
  const stored = await hashGuestPassword("mat-khau-thu-nghiem");
  assert.match(stored, /^pbkdf2\$120000\$/);
  assert.equal(await verifyGuestPassword("mat-khau-thu-nghiem", stored), true);
  assert.equal(await verifyGuestPassword("sai", stored), false);
});

test("HSA 2026 is the official baseline while 2027 remains editable proposal metadata", () => {
  assert.equal(HSA_STRUCTURE_PROFILES["HSA-2026"].official, true);
  assert.equal(hsaTotalDuration(defaultHsaStructureConfig("HSA-2026")), 195);
  assert.equal(defaultHsaStructureConfig("HSA-2026").max_points, 150);
  assert.deepEqual(defaultHsaStructureConfig("HSA-2026").selection.subjects, ["vatly", "hoahoc", "sinhhoc"]);
  assert.equal(HSA_SCIENCE_SUBJECTS.length, 5);
  assert.equal(HSA_STRUCTURE_PROFILES["HSA-2027"].official, false);
  const custom = normalizeHsaStructureConfig({ version: "CUSTOM", sections: [{ title: "Phần thử nghiệm", duration_minutes: 42, question_count: 12, structure: "Tùy chỉnh" }] });
  assert.equal(custom.version, "CUSTOM");
  assert.equal(custom.sections[0].duration_minutes, 42);
});

test("V-SAT is modeled as independent subject exams", () => {
  assert.equal(isIndependentSubjectExamType("VSAT"), true);
  assert.equal(normalizeExamType("SVAT"), "VSAT");
  assert.equal(VSAT_SUBJECT_TEMPLATES.length, 8);
  assert.equal(VSAT_SUBJECT_TEMPLATES.every(subject => subject.question_count === 25), true);
  assert.equal(VSAT_SUBJECT_TEMPLATES.find(subject => subject.code === "nguvan")?.duration_minutes, 90);
  assert.equal(isIndependentSubjectExamType("HSA"), false);
});

test("guest identity uses the configured full-name field and preserves historical input columns", () => {
  const fields = [
    { key: "class_name", label: "Lớp", required: true },
    { key: "ho_ten", label: "Họ và tên", required: true },
  ];
  const identity = { class_name: "12A1", ho_ten: "Nguyễn Minh An", school_code: "THPT-01" };
  assert.equal(identityDisplayName(identity, fields), "Nguyễn Minh An");
  assert.deepEqual(
    buildGuestIdentityColumns(
      fields,
      [{ identityFields: [{ key: "ma_du_thi", label: "Mã dự thi" }] }],
      [identity],
    ).map(column => column.key),
    ["class_name", "ho_ten", "ma_du_thi", "school_code"],
  );
});

test("guest access migrations define admin-only attempts, structure profiles, and throttling", async () => {
  const [guestMigration, structureMigration, sectionMigration, rateMigration, schema] = await Promise.all([
    readFile(new URL("../supabase/migrations/017_guest_exam_slots.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/018_exam_structure_profiles.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/020_guest_slot_sections.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/migrations/021_request_rate_limits.sql", import.meta.url), "utf8"),
    readFile(new URL("../supabase/schema.sql", import.meta.url), "utf8"),
  ]);
  assert.match(guestMigration, /create table if not exists public\.exam_access_slots/i);
  assert.match(guestMigration, /create table if not exists public\.guest_exam_attempts/i);
  assert.match(guestMigration, /using \(public\.is_admin\(\)\)/i);
  assert.match(structureMigration, /structure_config jsonb/i);
  assert.match(sectionMigration, /add column if not exists section_id/i);
  assert.match(rateMigration, /consume_request_budget/i);
  assert.match(rateMigration, /grant execute on function public\.consume_request_budget.*service_role/is);
  assert.match(schema, /guest_exam_attempts/i);
  assert.match(schema, /structure_config jsonb/i);
  assert.match(schema, /consume_request_budget/i);
});

test("THPTQG guest links reuse the authenticated runner and safe result review", async () => {
  const [guestModule, guestApi, resultComponent, confirmation, thptqgCss] = await Promise.all([
    readFile(new URL("../app/guest-exam.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest-exams/route.ts", import.meta.url), "utf8"),
    readFile(new URL("../components/thptqg/GuestThptqgResult.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/thptqg/ThptqgConfirmation.tsx", import.meta.url), "utf8"),
    readFile(new URL("../components/thptqg/thptqg.css", import.meta.url), "utf8"),
  ]);
  assert.match(guestModule, /GuestThptqgConfirmation/);
  assert.match(guestModule, /ThptqgExamRenderer/);
  assert.match(guestModule, /ExamFullscreenGuard/);
  assert.match(guestModule, /resetQuestionIndex/);
  assert.match(confirmation, /tsa-math-remix-logo thptqg-confirmation-wordmark/);
  assert.match(confirmation, /aria-label="MATH REMIX"/);
  assert.match(confirmation, /HƯỚNG DẪN DỰ THI THPTQG/);
  assert.match(confirmation, /Phần I: 12 câu trắc nghiệm 4 lựa chọn/);
  assert.match(confirmation, /đúng 1 ý được 0,10 điểm; 2 ý được 0,25 điểm; 3 ý được 0,50 điểm; cả 4 ý được 1,00 điểm/);
  assert.match(confirmation, /Phần III: 6 câu trả lời ngắn, mỗi câu đúng được 0,50 điểm/);
  assert.match(thptqgCss, /\.thptqg-confirmation-logo \.thptqg-confirmation-wordmark\s*\{[^}]*color:#004aad/);
  assert.match(thptqgCss, /@font-face\s*\{[^}]*font-family:MathRemixBrand;[^}]*MathRemix\.ttf/);
  assert.match(thptqgCss, /\.thptqg-confirmation-logo \.thptqg-confirmation-wordmark\s*\{[^}]*font-family:MathRemixBrand,sans-serif/);
  assert.match(guestApi, /question: publicQuestions\[index\]/);
  assert.match(guestApi, /identity: safeIdentity/);
  assert.match(guestApi, /context_menu/);
  assert.match(guestModule, /resetQuestionIndex=\{meta\.settings\.resetQuestionIndex\}/);
  assert.match(resultComponent, /resultReview/);
  assert.match(resultComponent, /Xem lại đáp án/);
});

test("guest exam images carry the kíp cookie across the production API origin", async () => {
  const [mathExam, thptqgRenderer, imageRoute] = await Promise.all([
    readFile(new URL("../components/remixstudyedu/MathExam.jsx", import.meta.url), "utf8"),
    readFile(new URL("../components/thptqg/ThptqgExamRenderer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest-exams/images/[sectionId]/[asset]/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(mathExam, /export function isGuestExamImage/);
  assert.match(mathExam, /parsed\.hostname === "api\.mathremix\.pro\.vn"/);
  assert.match(mathExam, /guestImage\s*\?\s*await fetch\(url,\s*\{[\s\S]*?credentials: "include"/);
  assert.match(mathExam, /:\s*await authenticatedFetch\(url/);
  assert.match(thptqgRenderer, /crossOrigin=\{isGuestExamImage\(question\.media_url\) \? "use-credentials" : undefined\}/);
  assert.match(imageRoute, /const guestImageHeaders = \{[\s\S]*?"cross-origin-resource-policy": "cross-origin"/);
  assert.match(imageRoute, /headers: guestImageHeaders/);
});

test("THPTQG timeout finalizes a delayed guest attempt without trusting late edits", async () => {
  const [renderer, guestApi] = await Promise.all([
    readFile(new URL("../components/thptqg/ThptqgExamRenderer.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/api/guest-exams/route.ts", import.meta.url), "utf8"),
  ]);
  assert.match(renderer, /deadlineAtRef = useRef<number \| null>\(null\)/);
  assert.match(renderer, /deadlineAtRef\.current = Date\.now\(\) \+ Math\.max\(0, initialRemainingSeconds\) \* 1_000/);
  assert.match(renderer, /Math\.ceil\(\(deadlineAt - Date\.now\(\)\) \/ 1_000\)/);
  assert.match(renderer, /document\.addEventListener\("visibilitychange", updateRemainingTime\)/);
  assert.match(renderer, /secondsLeft > 0 \|\| autoSubmitted\.current/);
  assert.match(renderer, /submitRef\.current\(answersRef\.current\)/);
  assert.match(guestApi, /body\.action !== "submit" && \(currentPhase === "disabled" \|\| pastDeadline\)/);
  assert.match(guestApi, /safeAnswers\(pastDeadline \|\| currentPhase === "disabled" \? current\.attempt\.answers : body\.answers\)/);
});

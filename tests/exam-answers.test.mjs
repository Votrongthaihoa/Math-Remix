import assert from "node:assert/strict";
import test from "node:test";

import { answersMatch, buildAnswerKeySnapshot, normalizeAnswerMap, readAnswerKeySnapshot, scoreExamQuestions, scoreExamQuestionsForContext, scoreExamQuestionsWithOverrides, scoreExamQuestionsWithOverridesForContext } from "../lib/exam-answers.ts";
import { THPTQG_SUBJECT_TEMPLATES } from "../lib/exam-config.ts";
import { positionalOptionParts } from "../lib/exam-option-display.ts";

test("keeps A-D positional while shuffled content retains its scoring identity", () => {
  const shuffled = [
    { value: "C", label: "Gamma" },
    { value: "A", label: "Alpha" },
    { value: "D", label: "Delta" },
    { value: "B", label: "Beta" },
  ].map((option, index) => positionalOptionParts(option, index));

  assert.deepEqual(shuffled.map(option => option.displayLabel), ["A", "B", "C", "D"]);
  assert.deepEqual(shuffled.map(option => option.label), ["Gamma", "Alpha", "Delta", "Beta"]);
  assert.deepEqual(shuffled.map(option => option.value), ["C", "A", "D", "B"]);
  assert.deepEqual(
    scoreExamQuestions(
      [{ id: "single", question_type: "single" }],
      { single: shuffled[0].value },
      new Map([["single", "C"]]),
    ),
    { correctAnswers: 1, totalQuestions: 1, score: 100 },
  );
});

test("uses the attempt option snapshot as the stable identity for string options", () => {
  const displayed = positionalOptionParts("Gamma", 0, "C");
  assert.deepEqual(displayed, { value: "C", displayLabel: "A", label: "Gamma" });
});

test("scores single and multiple choice answers consistently", () => {
  const questions = [
    { id: "single", question_type: "single" },
    { id: "multiple", question_type: "multiple" },
  ];
  const result = scoreExamQuestions(
    questions,
    { single: " b ", multiple: ["C", "A"] },
    new Map([
      ["single", "B"],
      ["multiple", ["A", "C"]],
    ]),
  );
  assert.deepEqual(result, { correctAnswers: 2, totalQuestions: 2, score: 100 });
  assert.equal(answersMatch(["C", "A"], ["A", "C"]), true);
});

test("keeps ordered answer types order-sensitive", () => {
  for (const question_type of ["inline", "true_false", "ordering", "drag_drop"]) {
    const result = scoreExamQuestions(
      [{ id: question_type, question_type }],
      { [question_type]: ["A", "B"] },
      new Map([[question_type, ["B", "A"]]]),
    );
    assert.equal(result.correctAnswers, 0, question_type);
    assert.equal(answersMatch(["A", "B"], ["B", "A"], true), false, question_type);
  }
});

test("does not score unanswered values, missing keys, or an empty exam", () => {
  const result = scoreExamQuestions(
    [
      { id: "empty", question_type: "single" },
      { id: "missing-key", question_type: "single" },
      { id: "answered", question_type: "single" },
    ],
    { empty: "", answered: "A" },
    new Map([
      ["empty", "A"],
      ["answered", "A"],
    ]),
  );
  assert.deepEqual(result, { correctAnswers: 1, totalQuestions: 3, score: 33 });
  assert.deepEqual(scoreExamQuestions([], {}, new Map()), { correctAnswers: 0, totalQuestions: 0, score: 0 });
});

test("normalizes answer payloads and bounds untrusted values", () => {
  const tooMany = Object.fromEntries(Array.from({ length: 2_050 }, (_, index) => [`q-${index}`, "A"]));
  tooMany["bad-object"] = { answer: "A" };
  tooMany["long-key-" + "x".repeat(200)] = "A";
  const normalized = normalizeAnswerMap(tooMany);
  assert.equal(Object.keys(normalized).length, 2_000);
  assert.equal(normalized["bad-object"], undefined);
  assert.equal(normalized["q-0"], "A");
  assert.deepEqual(normalizeAnswerMap({ q: ["A", 4, "B"] }), { q: ["A", "B"] });
});

test("versioned scoring supports accepted answers, void, and award-all", () => {
  const questions = [
    { id: "accepted", question_type: "single" },
    { id: "voided", question_type: "single" },
    { id: "awarded", question_type: "single" },
  ];
  const result = scoreExamQuestionsWithOverrides(
    questions,
    { accepted: "C", voided: "A" },
    new Map([["accepted", "B"], ["voided", "A"], ["awarded", "D"]]),
    new Map([
      ["accepted", { override_mode: "accept_multiple", accepted_answers: ["B", "C"] }],
      ["voided", { override_mode: "void_question" }],
      ["awarded", { override_mode: "award_all" }],
    ]),
  );
  assert.deepEqual(result, { correctAnswers: 2, totalQuestions: 2, voidedQuestions: 1, score: 100 });
});

test("answer key snapshots round-trip without changing answer semantics", () => {
  const snapshot = buildAnswerKeySnapshot([
    { question_id: "q1", correct_answer: ["A", "C"], explanation: "Giải thích" },
    { question_id: "q2", correct_answer: "B", explanation: "" },
  ]);
  const entries = readAnswerKeySnapshot(snapshot);
  assert.deepEqual(entries.get("q1"), { correct_answer: ["A", "C"], explanation: "Giải thích" });
  assert.deepEqual(new Map([...entries].map(([id, value]) => [id, value.correct_answer])), new Map([["q1", ["A", "C"]], ["q2", "B"]]));
});

function perfectThptqgExam({ single, trueFalse, short }) {
  const questions = [];
  const answers = {};
  const keys = new Map();
  const add = (prefix, count, question_type, answer) => {
    for (let index = 1; index <= count; index += 1) {
      const id = `${prefix}-${index}`;
      questions.push({ id, question_type });
      answers[id] = answer;
      keys.set(id, answer);
    }
  };
  add("single", single, "single", "A");
  add("tf", trueFalse, "true_false", ["true", "false", "true", "false"]);
  add("short", short, "text", "42");
  return { questions, answers, keys };
}

test("applies the THPTQG 10-point rubric for every subject group", () => {
  const cases = [
    [{ single: 12, trueFalse: 4, short: 6 }, { subjectCode: "toan" }],
    [{ single: 18, trueFalse: 4, short: 6 }, { subjectTitle: "Sinh học" }],
    [{ single: 24, trueFalse: 4, short: 0 }, { subjectCode: "gdktpl" }],
    [{ single: 40, trueFalse: 0, short: 0 }, { subjectTitle: "Tiếng Pháp" }],
  ];
  for (const [shape, subject] of cases) {
    const exam = perfectThptqgExam(shape);
    assert.deepEqual(
      scoreExamQuestionsForContext(exam.questions, exam.answers, exam.keys, { examType: "THPTQG", ...subject }),
      { correctAnswers: exam.questions.length, totalQuestions: exam.questions.length, score: 10 },
    );
  }
});

test("awards progressive THPTQG true-false points per matching statement", () => {
  const correct = ["true", "false", "true", "false"];
  const questions = Array.from({ length: 4 }, (_, index) => ({ id: `tf-${index + 1}`, question_type: "true_false" }));
  const answers = {
    "tf-1": ["true", "false", "true", "false"],
    "tf-2": ["true", "false", "true", "true"],
    "tf-3": ["true", "false", "false", "true"],
    "tf-4": ["true", "true", "false", "true"],
  };
  const keys = new Map(questions.map(question => [question.id, correct]));
  assert.deepEqual(
    scoreExamQuestionsForContext(questions, answers, keys, { examType: "THPTQG", subjectCode: "vatly" }),
    { correctAnswers: 1, totalQuestions: 4, score: 1.85 },
  );
});

test("uses the distinct THPTQG short-answer weights and no Part III for social or language subjects", () => {
  const questions = [{ id: "short", question_type: "text" }];
  const answers = { short: "42" };
  const keys = new Map([["short", "42"]]);
  assert.equal(scoreExamQuestionsForContext(questions, answers, keys, { examType: "THPTQG", subjectCode: "toan" }).score, 0.5);
  assert.equal(scoreExamQuestionsForContext(questions, answers, keys, { examType: "THPTQG", subjectCode: "hoahoc" }).score, 0.25);
  assert.equal(scoreExamQuestionsForContext(questions, answers, keys, { examType: "THPTQG", subjectCode: "congnghe" }).score, 0);
  assert.equal(scoreExamQuestionsForContext(questions, answers, keys, { examType: "THPTQG", subjectCode: "tiengtrung" }).score, 0);
});

test("keeps the Tin học THPTQG template at 24 multiple-choice plus 4 true-false questions", () => {
  const computing = THPTQG_SUBJECT_TEMPLATES.find(subject => subject.code === "tinhoc");
  assert.equal(computing?.question_count, 28);
  assert.match(computing?.structure ?? "", /24 câu nhiều lựa chọn; 4 câu Đúng\/Sai/);
});

test("keeps non-THPTQG scoring unchanged and caps malformed THPTQG papers at 10", () => {
  const exam = perfectThptqgExam({ single: 41, trueFalse: 0, short: 0 });
  assert.equal(scoreExamQuestionsForContext(exam.questions, exam.answers, exam.keys, { examType: "OTHER", subjectCode: "tienganh" }).score, 100);
  assert.equal(scoreExamQuestionsForContext(exam.questions, exam.answers, exam.keys, { examType: "THPTQG", subjectCode: "tienganh" }).score, 10);
});

test("keeps THPTQG points when an administrator regrades with overrides", () => {
  const questions = [
    { id: "tf", question_type: "true_false" },
    { id: "awarded", question_type: "single" },
    { id: "voided", question_type: "single" },
  ];
  const result = scoreExamQuestionsWithOverridesForContext(
    questions,
    { tf: ["true", "false", "true", "true"] },
    new Map([
      ["tf", ["true", "false", "true", "false"]],
      ["awarded", "A"],
      ["voided", "B"],
    ]),
    new Map([
      ["awarded", { override_mode: "award_all" }],
      ["voided", { override_mode: "void_question" }],
    ]),
    { examType: "THPTQG", subjectTitle: "Địa lí" },
  );
  assert.deepEqual(result, { correctAnswers: 1, totalQuestions: 2, voidedQuestions: 1, score: 0.75 });
});

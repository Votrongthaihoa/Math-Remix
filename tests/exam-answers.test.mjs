import assert from "node:assert/strict";
import test from "node:test";

import { answersMatch, buildAnswerKeySnapshot, normalizeAnswerMap, readAnswerKeySnapshot, scoreExamQuestions, scoreExamQuestionsWithOverrides } from "../lib/exam-answers.ts";

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

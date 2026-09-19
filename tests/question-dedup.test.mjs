import assert from "node:assert/strict";
import test from "node:test";

import { findDuplicateGroups, findPotentialDuplicates, normalizeQuestionText, questionSimilarity } from "../lib/question-dedup.ts";

test("question dedup normalizes Vietnamese whitespace/diacritics and scores near copies", () => {
  assert.equal(normalizeQuestionText("  Hà Nội  "), "ha noi");
  assert.ok(questionSimilarity("Tính tổng 2 + 2", "Tinh tong 2+2") > 0.8);
  const groups = findDuplicateGroups([
    { id: "a", prompt: "Tính tổng 2 + 2" },
    { id: "b", prompt: "Tinh tong 2+2" },
    { id: "c", prompt: "Một câu hỏi khác" },
  ], 0.8);
  assert.deepEqual(groups.map(group => group.itemIds), [["a", "b"]]);
});

test("question dedup returns an ordered review list for a draft and excludes its current item", () => {
  const matches = findPotentialDuplicates(
    { prompt: "Tính tổng 2 + 2", questionType: "single" },
    [
      { id: "current", prompt: "Tính tổng 2 + 2", questionType: "single" },
      { id: "exact", prompt: "Tinh tong 2+2", questionType: "single" },
      { id: "other-type", prompt: "Tính tổng 2 + 2", questionType: "multiple" },
      { id: "different", prompt: "Giải phương trình bậc hai", questionType: "single" },
    ],
    { threshold: 0.8, excludeItemId: "current" },
  );

  assert.deepEqual(matches, [{ id: "exact", prompt: "Tinh tong 2+2", questionType: "single", similarity: 1 }]);
});

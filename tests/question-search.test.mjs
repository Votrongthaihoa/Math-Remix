import assert from "node:assert/strict";
import test from "node:test";

test("question search UI exposes similarity badges and all supported detail modes", async () => {
  const source = await (await import("node:fs/promises")).readFile(new URL("../components/question-search.tsx", import.meta.url), "utf8");
  assert.match(source, /QuestionDetail/);
  assert.match(source, /SimilarityScore/);
  for (const type of ["single", "multiple", "true_false", "matching", "short_answer", "inline_dropdown", "group"]) assert.match(source, new RegExp(type));
  assert.match(source, /scan-question/);
  assert.match(source, /MathRendererContent/);
});

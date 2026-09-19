import assert from "node:assert/strict";
import test from "node:test";
import { buildLatexQuestionPreview } from "../lib/question-bank-latex.ts";

test("builds a question-bank preview from a LaTeX document", () => {
  const preview = buildLatexQuestionPreview(String.raw`\begin{ex}
Giá trị của $\frac{1}{2}$ là gì?
\choice{\True $0.5$}{$1$}
\end{ex}`);

  assert.equal(preview.items.length, 1);
  assert.equal(preview.items[0]?.question_type, "single");
  assert.equal(preview.items[0]?.correct_answer, "A");
  assert.deepEqual(preview.items[0]?.errors, []);
});

test("marks invalid KaTeX commands in the preview", () => {
  const preview = buildLatexQuestionPreview(String.raw`\begin{ex}
Biểu thức $\definitelyNotAKaTeXCommand{x}$.
\choice{\True A}{B}
\end{ex}`);

  assert.equal(preview.items.length, 1);
  assert.match(preview.items[0]?.errors.join(" ") ?? "", /KaTeX|không|lỗi/i);
});

test("converts multiple \\cham answers into an ordered inline question", () => {
  const preview = buildLatexQuestionPreview(String.raw`\begin{ex}
Điền \cham{a} và \cham{b}.
\end{ex}`);

  const item = preview.items[0];
  assert.equal(preview.fileError, "");
  assert.equal(preview.items.length, 1);
  assert.equal(item?.question_type, "inline");
  assert.equal(item?.prompt, "Điền ____ và ____.");
  assert.deepEqual(item?.correct_answer, ["a", "b"]);
  assert.deepEqual(item?.errors, []);
});

test("marks plain multi-blank inline questions without answer keys as semantic errors", () => {
  const preview = buildLatexQuestionPreview(String.raw`\begin{ex}
Điền ____ và ____.
\end{ex}`);

  const item = preview.items[0];
  assert.equal(preview.fileError, "");
  assert.equal(preview.items.length, 1);
  assert.equal(item?.question_type, "inline");
  assert.deepEqual(item?.correct_answer, []);
  assert.match(item?.errors.join(" ") ?? "", /đáp án không rỗng cho từng ô trống/i);
});

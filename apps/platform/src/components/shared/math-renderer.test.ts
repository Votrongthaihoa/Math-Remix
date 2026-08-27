import assert from "node:assert/strict";
import test from "node:test";

import { normalizeEditorHtml } from "./math-content.ts";

test("MathRenderer cleanup removes empty CKEditor paragraphs without changing real content", () => {
  const cleaned = normalizeEditorHtml(
    "<p><br></p><p>  <br /> </p><p>Cho biểu thức \\[x^2 + 1\\]</p><p>&nbsp;</p>",
  );

  assert.equal(cleaned, "<p>Cho biểu thức \\[x^2 + 1\\]</p>");
});

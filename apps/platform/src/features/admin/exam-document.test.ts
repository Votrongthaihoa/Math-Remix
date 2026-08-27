import assert from "node:assert/strict";
import test from "node:test";

import { createExamSaveRequest, isEditConflict } from "./exam-document.ts";

test("exam builder saves with revision and content hash and recognizes 409 edit conflicts", async () => {
  const request = await createExamSaveRequest({
    examId: "exam-1",
    revision: 4,
    title: "Đề TSA số 01",
    authoritativeHtml: "<p>Nội dung chuẩn</p>",
    normalizedSections: [],
    lexicalJson: { root: { children: [] } },
  });

  assert.equal(request.method, "PUT");
  assert.equal(request.headers.get("if-match-revision"), "4");
  assert.match(request.headers.get("if-match-content-hash") ?? "", /^[a-f0-9]{64}$/);
  assert.equal(isEditConflict({ status: 409, code: "EDIT_CONFLICT" }), true);
});

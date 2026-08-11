import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

const seed = readFileSync(new URL("../supabase/migrations/008_seed_tsa_response_exam.sql", import.meta.url), "utf8");
const schema = readFileSync(new URL("../supabase/migrations/007_exam_question_formats.sql", import.meta.url), "utf8");

test("seeds all 100 visible questions from the three supplied TSA responses", () => {
  assert.equal((seed.match(/insert into public\.exam_questions/g) ?? []).length, 100);
  assert.match(seed, /Đề Toán Số 01/);
  assert.match(seed, /Đề Đọc Hiểu Số 01/);
  assert.match(seed, /Đề Khoa Học Số 1/);
});

test("supports every observed interactive question format", () => {
  for (const type of ["single", "multiple", "text", "inline", "true_false", "ordering", "drag_drop"]) {
    assert.match(schema, new RegExp(`'${type}'`));
  }
  assert.match(seed, /'true_false'/);
  assert.match(seed, /'ordering'/);
  assert.match(seed, /'drag_drop'/);
});

test("generated seed contains no answer keys or authentication material", () => {
  assert.doesNotMatch(seed, /insert into public\.exam_question_keys/i);
  assert.doesNotMatch(seed, /authorization|access_token|refresh_token|cookie|password/i);
});

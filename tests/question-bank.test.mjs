import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("question bank normalizes difficulty, tags, and question content", async () => {
  const { normalizeDifficulty, normalizeQuestionBankContent, normalizeTags } = await import("../lib/question-bank.ts");
  assert.equal(normalizeDifficulty(" vd "), "VD");
  assert.equal(normalizeDifficulty("expert"), null);
  assert.deepEqual(normalizeTags("hàm số, đạo hàm, hàm số"), ["hàm số", "đạo hàm"]);
  assert.deepEqual(normalizeQuestionBankContent({
    prompt: "  Câu hỏi  ",
    question_type: "multiple",
    options: [{ value: "A", label: "Đúng" }],
    media_url: " ",
  }), {
    prompt: "Câu hỏi",
    question_type: "multiple",
    options: [{ value: "A", label: "Đúng" }],
    correct_answer: null,
    explanation: "",
    passage: null,
    media_url: null,
    instruction: null,
    solution_source: "",
  });
});

test("question bank selects only the current version for each item", async () => {
  const { selectCurrentVersions } = await import("../lib/question-bank.ts");
  const selected = selectCurrentVersions(
    [{ id: "item-1", current_version: 2 }, { id: "item-2", current_version: 1 }],
    [{ item_id: "item-1", version: 1 }, { item_id: "item-1", version: 2 }, { item_id: "item-2", version: 1 }],
  );
  assert.deepEqual(selected, [{ item_id: "item-1", version: 2 }, { item_id: "item-2", version: 1 }]);
});

test("question bank migration protects answers and adds exam snapshots", async () => {
  const [migration, schema, route] = await Promise.all([
    source("supabase/migrations/040_question_bank.sql"),
    source("supabase/schema.sql"),
    source("app/api/admin/question-banks/route.ts"),
  ]);
  assert.match(migration, /create table if not exists public\.question_banks/i);
  assert.match(migration, /create table if not exists public\.question_bank_item_versions/i);
  assert.match(migration, /source_item_id uuid references public\.question_bank_items/i);
  assert.match(migration, /revoke all on table public\.question_banks[\s\S]*from public, anon, authenticated/i);
  assert.match(schema, /question_bank_item_versions/i);
  assert.match(route, /ensureActiveAccount/);
  assert.match(route, /action === "attach_to_exam"/);
  assert.match(route, /source_item_version/);
});


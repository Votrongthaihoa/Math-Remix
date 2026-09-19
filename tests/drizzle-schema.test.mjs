import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("Drizzle schema exposes the product contracts used by the app", async () => {
  const source = await readFile(new URL("../db/schema.ts", import.meta.url), "utf8");
  assert.match(source, /from ['"]drizzle-orm\/pg-core['"]/);
  for (const table of [
    "profiles",
    "question_banks",
    "question_bank_items",
    "question_item_versions",
    "exam_rooms",
    "exam_sections",
    "exam_sessions",
    "session_attempts",
    "courses",
    "course_chapters",
    "course_lessons",
    "lesson_resources",
    "course_enrollments",
    "timetable_slots",
    "security_events",
  ]) {
    assert.match(source, new RegExp(`export const ${table}\\s*=`), `missing ${table}`);
  }
});

test("Drizzle schema uses canonical Supabase relations and keeps legacy names as aliases", async () => {
  const schema = await import("../db/schema.ts");
  const tableNameSymbol = Symbol.for("drizzle:Name");
  const tableNames = new Set(
    Object.values(schema)
      .filter(value => value && typeof value === "object" && tableNameSymbol in value)
      .map(value => value[tableNameSymbol]),
  );

  for (const table of [
    "profiles",
    "trusted_devices",
    "user_sessions",
    "device_verification_challenges",
    "security_events",
    "account_violations",
    "admin_actions",
    "courses",
    "chapters",
    "lessons",
    "lesson_resources",
    "course_enrollments",
    "question_banks",
    "question_bank_nodes",
    "question_bank_items",
    "question_bank_item_versions",
    "exam_rooms",
    "exams",
    "exam_sections",
    "exam_questions",
    "exam_question_keys",
    "exam_attempts",
    "exam_access_slots",
    "guest_exam_attempts",
    "exam_content_grants",
    "exam_content_rate_limits",
    "request_rate_limits",
    "exam_admin_audit_logs",
    "exam_attempt_adjustments",
    "exam_attempt_grants",
    "exam_scoring_versions",
    "exam_question_overrides",
    "exam_regrade_runs",
    "exam_policy_presets",
    "exam_templates",
    "exam_slot_candidates",
    "course_schedule_rules",
    "course_schedule_events",
    "microsoft_graph_connections",
  ]) {
    assert.ok(tableNames.has(table), `missing canonical table ${table}`);
  }

  for (const legacy of ["course_chapters", "course_lessons", "question_item_versions", "exam_sessions", "session_attempts", "timetable_slots"]) {
    assert.ok(!tableNames.has(legacy), `legacy alias must not create ${legacy}`);
  }

  assert.equal(schema.course_chapters, schema.chapters);
  assert.equal(schema.course_lessons, schema.lessons);
  assert.equal(schema.question_item_versions, schema.question_bank_item_versions);
  assert.equal(schema.exam_sessions, schema.exam_access_slots);
  assert.equal(schema.session_attempts, schema.exam_attempts);
  assert.equal(schema.timetable_slots, schema.course_schedule_events);
});

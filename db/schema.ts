import {
  bigint,
  boolean,
  date,
  doublePrecision,
  index,
  integer,
  jsonb,
  numeric,
  pgTable,
  primaryKey,
  smallint,
  text,
  time,
  timestamp,
  unique,
  uuid,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

/**
 * Mirrors the final table names and columns in supabase/schema.sql and the
 * ordered Supabase migrations. Compatibility exports at the bottom point to
 * canonical tables; they do not create legacy tables that are absent from
 * Supabase.
 */

export const student_sequences = pgTable("student_sequences", {
  singleton: boolean("singleton").primaryKey().default(true),
  last_value: bigint("last_value", { mode: "number" }).notNull().default(0),
});

export const profiles = pgTable("profiles", {
  id: uuid("id").primaryKey(),
  student_code: text("student_code").notNull().unique(),
  full_name: text("full_name").notNull(),
  role: text("role").notNull().default("student"),
  status: text("status").notNull().default("active"),
  account_status: text("account_status").notNull().default("active"),
  violation_count: integer("violation_count").notNull().default(0),
  banned_at: timestamp("banned_at", { withTimezone: true }),
  banned_until: timestamp("banned_until", { withTimezone: true }),
  ban_reason: text("ban_reason"),
  ban_event_id: bigint("ban_event_id", { mode: "number" }),
  banned_by: uuid("banned_by"),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const trusted_devices = pgTable(
  "trusted_devices",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    device_id: text("device_id").notNull(),
    device_name: text("device_name"),
    browser: text("browser"),
    operating_system: text("operating_system"),
    trusted_by_admin: boolean("trusted_by_admin").notNull().default(false),
    verified_at: timestamp("verified_at", { withTimezone: true }),
    last_used_at: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    user_device_unique: unique("trusted_devices_user_device_key").on(table.user_id, table.device_id),
    user_active_idx: index("trusted_devices_user_active_idx").on(table.user_id, table.revoked_at, table.last_used_at),
  }),
);

export const user_sessions = pgTable(
  "user_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    user_id: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    auth_session_id: text("auth_session_id"),
    device_id: text("device_id").notNull(),
    activity_type: text("activity_type").notNull().default("idle"),
    current_resource_id: text("current_resource_id"),
    ip_hash: text("ip_hash"),
    country_code: text("country_code"),
    region_code: text("region_code"),
    city: text("city"),
    latitude: doublePrecision("latitude"),
    longitude: doublePrecision("longitude"),
    risk_score: integer("risk_score").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    last_seen_at: timestamp("last_seen_at", { withTimezone: true }).notNull().defaultNow(),
    revoked_at: timestamp("revoked_at", { withTimezone: true }),
  },
  table => ({
    active_idx: index("user_sessions_active_idx").on(table.user_id, table.last_seen_at),
    device_idx: index("user_sessions_device_idx").on(table.user_id, table.device_id, table.last_seen_at),
  }),
);

export const device_verification_challenges = pgTable("device_verification_challenges", {
  id: uuid("id").primaryKey().defaultRandom(),
  user_id: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  device_id: text("device_id").notNull(),
  initial_auth_session_id: text("initial_auth_session_id"),
  expires_at: timestamp("expires_at", { withTimezone: true }).notNull().default(sql`now() + interval '15 minutes'`),
  verified_at: timestamp("verified_at", { withTimezone: true }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const security_events = pgTable(
  "security_events",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    user_id: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    event_type: text("event_type").notNull(),
    risk_score: integer("risk_score").notNull().default(0),
    reason: text("reason").notNull(),
    device_id: text("device_id"),
    conflicting_device_id: text("conflicting_device_id"),
    distance_km: numeric("distance_km"),
    evidence: jsonb("evidence").notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    reviewed_at: timestamp("reviewed_at", { withTimezone: true }),
    reviewed_by: uuid("reviewed_by").references(() => profiles.id),
    review_result: text("review_result"),
  },
  table => ({
    user_date_idx: index("security_events_user_date_idx").on(table.user_id, table.created_at),
  }),
);

export const account_violations = pgTable(
  "account_violations",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    user_id: uuid("user_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    violation_number: integer("violation_number").notNull(),
    violation_type: text("violation_type").notNull(),
    reason: text("reason").notNull(),
    security_event_id: bigint("security_event_id", { mode: "number" }).references(() => security_events.id, { onDelete: "set null" }),
    ban_started_at: timestamp("ban_started_at", { withTimezone: true }),
    ban_ends_at: timestamp("ban_ends_at", { withTimezone: true }),
    permanent: boolean("permanent").notNull().default(false),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    cancelled_at: timestamp("cancelled_at", { withTimezone: true }),
    cancelled_by: uuid("cancelled_by").references(() => profiles.id),
    cancellation_reason: text("cancellation_reason"),
  },
  table => ({
    user_date_idx: index("account_violations_user_date_idx").on(table.user_id, table.created_at),
  }),
);

export const admin_actions = pgTable(
  "admin_actions",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    admin_id: uuid("admin_id").notNull().references(() => profiles.id),
    target_user_id: uuid("target_user_id").notNull().references(() => profiles.id),
    action: text("action").notNull(),
    reason: text("reason"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    target_date_idx: index("admin_actions_target_date_idx").on(table.target_user_id, table.created_at),
  }),
);

export const courses = pgTable(
  "courses",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    cover_url: text("cover_url"),
    cover_color: text("cover_color").notNull().default("#cd1627"),
    published: boolean("published").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    sort_idx: index("courses_sort_idx").on(table.sort_order, table.created_at),
  }),
);

export const chapters = pgTable(
  "chapters",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    course_id: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    sort_order: integer("sort_order").notNull().default(0),
  },
  table => ({
    course_sort_idx: index("chapters_course_sort_idx").on(table.course_id, table.sort_order),
  }),
);

export const lessons = pgTable(
  "lessons",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    chapter_id: uuid("chapter_id").notNull().references(() => chapters.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    published: boolean("published").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
  },
  table => ({
    chapter_sort_idx: index("lessons_chapter_sort_idx").on(table.chapter_id, table.sort_order),
  }),
);

export const lesson_resources = pgTable(
  "lesson_resources",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    lesson_id: uuid("lesson_id").notNull().references(() => lessons.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    resource_type: text("resource_type").notNull(),
    resource_url: text("resource_url").notNull(),
    allow_download: boolean("allow_download").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    provider: text("provider"),
    provider_drive_id: text("provider_drive_id"),
    provider_item_id: text("provider_item_id"),
    provider_metadata: jsonb("provider_metadata").notNull().default(sql`'{}'::jsonb`),
  },
  table => ({
    lesson_sort_idx: index("lesson_resources_lesson_sort_idx").on(table.lesson_id, table.sort_order),
  }),
);

export const course_enrollments = pgTable(
  "course_enrollments",
  {
    student_id: uuid("student_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    course_id: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    assigned_at: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    pk: primaryKey({ columns: [table.student_id, table.course_id], name: "course_enrollments_pkey" }),
  }),
);

export const question_banks = pgTable(
  "question_banks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    name: text("name").notNull(),
    subject_code: text("subject_code").notNull().default(""),
    grade: text("grade").notNull().default(""),
    curriculum: text("curriculum").notNull().default(""),
    description: text("description").notNull().default(""),
    status: text("status").notNull().default("draft"),
    created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    updated_idx: index("question_banks_updated_idx").on(table.updated_at),
  }),
);

export const question_bank_nodes = pgTable(
  "question_bank_nodes",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bank_id: uuid("bank_id").notNull().references(() => question_banks.id, { onDelete: "cascade" }),
    parent_id: uuid("parent_id"),
    title: text("title").notNull(),
    node_type: text("node_type").notNull().default("topic"),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    bank_sort_idx: index("question_bank_nodes_bank_sort_idx").on(table.bank_id, table.parent_id, table.sort_order),
    bank_parent_title_unique: unique("question_bank_nodes_bank_parent_title_key").on(table.bank_id, table.parent_id, table.title),
  }),
);

export const question_bank_items = pgTable(
  "question_bank_items",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    bank_id: uuid("bank_id").notNull().references(() => question_banks.id, { onDelete: "cascade" }),
    node_id: uuid("node_id").references(() => question_bank_nodes.id, { onDelete: "set null" }),
    current_version: integer("current_version").notNull().default(1),
    difficulty: text("difficulty"),
    tags: text("tags").array().notNull().default(sql`'{}'::text[]`),
    status: text("status").notNull().default("active"),
    created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    lookup_idx: index("question_bank_items_lookup_idx").on(table.bank_id, table.status, table.difficulty, table.updated_at),
    node_idx: index("question_bank_items_node_idx").on(table.node_id, table.status),
  }),
);

export const question_bank_item_versions = pgTable(
  "question_bank_item_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    item_id: uuid("item_id").notNull().references(() => question_bank_items.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    prompt: text("prompt").notNull(),
    question_type: text("question_type").notNull().default("single"),
    options: jsonb("options").notNull().default(sql`'[]'::jsonb`),
    correct_answer: jsonb("correct_answer").notNull().default(sql`'null'::jsonb`),
    explanation: text("explanation").notNull().default(""),
    passage: text("passage"),
    media_url: text("media_url"),
    instruction: text("instruction"),
    solution_source: text("solution_source").notNull().default(""),
    created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    item_version_unique: unique("question_bank_item_versions_item_version_key").on(table.item_id, table.version),
    lookup_idx: index("question_bank_item_versions_lookup_idx").on(table.item_id, table.version),
  }),
);

export const exam_rooms = pgTable(
  "exam_rooms",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    exam_type: text("exam_type").notNull().default("TSA"),
    access_mode: text("access_mode").notNull().default("open"),
    registration_start: timestamp("registration_start", { withTimezone: true }),
    registration_end: timestamp("registration_end", { withTimezone: true }),
    exam_start: timestamp("exam_start", { withTimezone: true }),
    exam_end: timestamp("exam_end", { withTimezone: true }),
    published: boolean("published").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    sort_idx: index("exam_rooms_sort_idx").on(table.sort_order, table.created_at),
  }),
);

export const exams = pgTable(
  "exams",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    room_id: uuid("room_id").notNull().references(() => exam_rooms.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    dashboard_title: text("dashboard_title").notNull().default("KỲ THI TỐT NGHIỆP THPT 2027"),
    exam_type: text("exam_type").notNull().default("TSA"),
    mode: text("mode").notNull().default("free"),
    duration_minutes: integer("duration_minutes").notNull().default(90),
    settings: jsonb("settings").notNull().default(sql`'{}'::jsonb`),
    structure_config: jsonb("structure_config").notNull().default(sql`'{}'::jsonb`),
    results_released_at: timestamp("results_released_at", { withTimezone: true }),
    published: boolean("published").notNull().default(false),
    sort_order: integer("sort_order").notNull().default(0),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    room_sort_idx: index("exams_room_sort_idx").on(table.room_id, table.sort_order),
    results_released_idx: index("exams_results_released_idx").on(table.results_released_at),
  }),
);

export const exam_sections = pgTable(
  "exam_sections",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exam_id: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    duration_minutes: integer("duration_minutes"),
    subject_code: text("subject_code"),
    source_latex: text("source_latex").notNull().default(""),
    sort_order: integer("sort_order").notNull().default(0),
  },
  table => ({
    exam_sort_idx: index("exam_sections_exam_sort_idx").on(table.exam_id, table.sort_order),
    exam_subject_idx: index("exam_sections_exam_subject_idx").on(table.exam_id, table.subject_code),
  }),
);

export const exam_questions = pgTable(
  "exam_questions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    section_id: uuid("section_id").notNull().references(() => exam_sections.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    question_type: text("question_type").notNull().default("single"),
    options: jsonb("options").notNull().default(sql`'[]'::jsonb`),
    points: numeric("points").notNull().default(sql`1`),
    sort_order: integer("sort_order").notNull().default(0),
    passage: text("passage"),
    media_url: text("media_url"),
    instruction: text("instruction"),
    latex_source: text("latex_source").notNull().default(""),
    solution_source: text("solution_source").notNull().default(""),
    source_item_id: uuid("source_item_id").references(() => question_bank_items.id, { onDelete: "set null" }),
    source_item_version: integer("source_item_version"),
  },
  table => ({
    section_sort_idx: index("exam_questions_section_sort_idx").on(table.section_id, table.sort_order),
    source_item_idx: index("exam_questions_source_item_idx").on(table.source_item_id, table.source_item_version),
  }),
);

export const exam_question_keys = pgTable("exam_question_keys", {
  question_id: uuid("question_id").primaryKey().references(() => exam_questions.id, { onDelete: "cascade" }),
  correct_answer: jsonb("correct_answer").notNull(),
  explanation: text("explanation").notNull().default(""),
});

export const exam_room_enrollments = pgTable(
  "exam_room_enrollments",
  {
    room_id: uuid("room_id").notNull().references(() => exam_rooms.id, { onDelete: "cascade" }),
    student_id: uuid("student_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    assigned_at: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    pk: primaryKey({ columns: [table.room_id, table.student_id], name: "exam_room_enrollments_pkey" }),
  }),
);

export const exam_attempts = pgTable(
  "exam_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    student_id: uuid("student_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    score: numeric("score").notNull().default(sql`0`),
    correct_answers: integer("correct_answers").notNull().default(0),
    total_questions: integer("total_questions").notNull().default(0),
    status: text("status").notNull().default("completed"),
    submitted_at: timestamp("submitted_at", { withTimezone: true }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    exam_id: uuid("exam_id").references(() => exams.id, { onDelete: "set null" }),
    mode: text("mode").notNull().default("practice"),
    answers: jsonb("answers").notNull().default(sql`'{}'::jsonb`),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    duration_seconds: integer("duration_seconds"),
    section_id: uuid("section_id").references(() => exam_sections.id, { onDelete: "set null" }),
    policy_snapshot: jsonb("policy_snapshot").notNull().default(sql`'{}'::jsonb`),
    policy_version: integer("policy_version").notNull().default(1),
    answer_key_snapshot: jsonb("answer_key_snapshot").notNull().default(sql`'{}'::jsonb`),
    question_order: jsonb("question_order").notNull().default(sql`'[]'::jsonb`),
    option_order: jsonb("option_order").notNull().default(sql`'{}'::jsonb`),
    flagged_questions: jsonb("flagged_questions").notNull().default(sql`'[]'::jsonb`),
    exam_code: text("exam_code"),
    progress_version: integer("progress_version").notNull().default(0),
    time_extension_seconds: integer("time_extension_seconds").notNull().default(0),
    network_state: text("network_state").notNull().default("online"),
    scoring_version: integer("scoring_version").notNull().default(1),
    original_score: numeric("original_score"),
    original_correct_answers: integer("original_correct_answers"),
    original_total_questions: integer("original_total_questions"),
    monitor_events: jsonb("monitor_events").notNull().default(sql`'[]'::jsonb`),
  },
  table => ({
    exam_student_idx: index("exam_attempts_exam_student_idx").on(table.exam_id, table.student_id, table.started_at),
    exam_section_student_idx: index("exam_attempts_exam_section_student_idx").on(table.exam_id, table.section_id, table.student_id, table.started_at),
    progress_idx: index("exam_attempts_progress_idx").on(table.exam_id, table.student_id, table.progress_version),
    monitor_idx: index("exam_attempts_monitor_idx").on(table.exam_id, table.status, table.started_at),
  }),
);

export const exam_access_slots = pgTable(
  "exam_access_slots",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exam_id: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    name: text("name").notNull().default("Kíp thi"),
    token_hash: text("token_hash").notNull().unique(),
    token_hint: text("token_hint").notNull().default(""),
    starts_at: timestamp("starts_at", { withTimezone: true }).notNull(),
    ends_at: timestamp("ends_at", { withTimezone: true }).notNull(),
    grace_period_minutes: integer("grace_period_minutes").notNull().default(30),
    password_hash: text("password_hash"),
    enabled: boolean("enabled").notNull().default(true),
    results_released_at: timestamp("results_released_at", { withTimezone: true }),
    export_open_at: timestamp("export_open_at", { withTimezone: true }),
    export_close_at: timestamp("export_close_at", { withTimezone: true }),
    section_id: uuid("section_id").references(() => exam_sections.id, { onDelete: "set null" }),
    created_by: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    exam_window_idx: index("exam_access_slots_exam_window_idx").on(table.exam_id, table.starts_at, table.ends_at),
    section_idx: index("exam_access_slots_section_idx").on(table.section_id),
  }),
);

export const guest_exam_attempts = pgTable(
  "guest_exam_attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slot_id: uuid("slot_id").notNull().references(() => exam_access_slots.id, { onDelete: "cascade" }),
    exam_id: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    session_hash: text("session_hash").notNull(),
    client_hash: text("client_hash").notNull().default(""),
    guest_identity: jsonb("guest_identity").notNull().default(sql`'{}'::jsonb`),
    answers: jsonb("answers").notNull().default(sql`'{}'::jsonb`),
    question_order: jsonb("question_order").notNull().default(sql`'[]'::jsonb`),
    option_order: jsonb("option_order").notNull().default(sql`'{}'::jsonb`),
    config_snapshot: jsonb("config_snapshot").notNull().default(sql`'{}'::jsonb`),
    policy_snapshot: jsonb("policy_snapshot").notNull().default(sql`'{}'::jsonb`),
    policy_version: integer("policy_version").notNull().default(1),
    answer_key_snapshot: jsonb("answer_key_snapshot").notNull().default(sql`'{}'::jsonb`),
    monitor_events: jsonb("monitor_events").notNull().default(sql`'[]'::jsonb`),
    progress_version: integer("progress_version").notNull().default(0),
    score: numeric("score"),
    correct_answers: integer("correct_answers").notNull().default(0),
    total_questions: integer("total_questions").notNull().default(0),
    status: text("status").notNull().default("in_progress"),
    started_at: timestamp("started_at", { withTimezone: true }).notNull().defaultNow(),
    submitted_at: timestamp("submitted_at", { withTimezone: true }),
    duration_seconds: integer("duration_seconds"),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    exam_code: text("exam_code"),
    flagged_questions: jsonb("flagged_questions").notNull().default(sql`'[]'::jsonb`),
    time_extension_seconds: integer("time_extension_seconds").notNull().default(0),
    network_state: text("network_state").notNull().default("online"),
    scoring_version: integer("scoring_version").notNull().default(1),
    original_score: numeric("original_score"),
    original_correct_answers: integer("original_correct_answers"),
    original_total_questions: integer("original_total_questions"),
  },
  table => ({
    slot_date_idx: index("guest_exam_attempts_slot_date_idx").on(table.slot_id, table.started_at),
    session_idx: index("guest_exam_attempts_session_idx").on(table.slot_id, table.session_hash, table.started_at),
    client_idx: index("guest_exam_attempts_client_idx").on(table.slot_id, table.client_hash, table.started_at),
    exam_code_idx: index("guest_exam_attempts_exam_code_idx").on(table.slot_id, table.exam_code),
  }),
);

export const exam_content_grants = pgTable(
  "exam_content_grants",
  {
    attempt_id: uuid("attempt_id").notNull().references(() => exam_attempts.id, { onDelete: "cascade" }),
    student_id: uuid("student_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
    section_id: uuid("section_id").notNull().references(() => exam_sections.id, { onDelete: "cascade" }),
    content_ref: text("content_ref").notNull(),
    first_granted_at: timestamp("first_granted_at", { withTimezone: true }).notNull().defaultNow(),
    last_granted_at: timestamp("last_granted_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    pk: primaryKey({ columns: [table.attempt_id, table.section_id, table.content_ref], name: "exam_content_grants_pkey" }),
    student_date_idx: index("exam_content_grants_student_date_idx").on(table.student_id, table.last_granted_at),
  }),
);

export const exam_content_rate_limits = pgTable("exam_content_rate_limits", {
  attempt_id: uuid("attempt_id").primaryKey().references(() => exam_attempts.id, { onDelete: "cascade" }),
  student_id: uuid("student_id").notNull().references(() => profiles.id, { onDelete: "cascade" }),
  tokens: numeric("tokens").notNull().default(sql`8`),
  last_refill_at: timestamp("last_refill_at", { withTimezone: true }).notNull().defaultNow(),
  denial_window_started_at: timestamp("denial_window_started_at", { withTimezone: true }),
  denial_count: integer("denial_count").notNull().default(0),
  blocked_until: timestamp("blocked_until", { withTimezone: true }),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const request_rate_limits = pgTable(
  "request_rate_limits",
  {
    scope: text("scope").notNull(),
    subject_hash: text("subject_hash").notNull(),
    tokens: numeric("tokens").notNull().default(sql`10`),
    last_refill_at: timestamp("last_refill_at", { withTimezone: true }).notNull().defaultNow(),
    denial_window_started_at: timestamp("denial_window_started_at", { withTimezone: true }),
    denial_count: integer("denial_count").notNull().default(0),
    blocked_until: timestamp("blocked_until", { withTimezone: true }),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    pk: primaryKey({ columns: [table.scope, table.subject_hash], name: "request_rate_limits_pkey" }),
    updated_idx: index("request_rate_limits_updated_idx").on(table.updated_at),
  }),
);

export const exam_admin_audit_logs = pgTable(
  "exam_admin_audit_logs",
  {
    id: bigint("id", { mode: "number" }).generatedAlwaysAsIdentity().primaryKey(),
    admin_id: uuid("admin_id"),
    exam_id: uuid("exam_id").references(() => exams.id, { onDelete: "set null" }),
    room_id: uuid("room_id").references(() => exam_rooms.id, { onDelete: "set null" }),
    slot_id: uuid("slot_id").references(() => exam_access_slots.id, { onDelete: "set null" }),
    action: text("action").notNull(),
    status: text("status").notNull().default("started"),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    completed_at: timestamp("completed_at", { withTimezone: true }),
  },
  table => ({
    exam_date_idx: index("exam_admin_audit_logs_exam_date_idx").on(table.exam_id, table.created_at),
    room_date_idx: index("exam_admin_audit_logs_room_date_idx").on(table.room_id, table.created_at),
    slot_date_idx: index("exam_admin_audit_logs_slot_date_idx").on(table.slot_id, table.created_at),
    admin_date_idx: index("exam_admin_audit_logs_admin_date_idx").on(table.admin_id, table.created_at),
  }),
);

export const exam_attempt_adjustments = pgTable(
  "exam_attempt_adjustments",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attempt_kind: text("attempt_kind").notNull(),
    attempt_id: uuid("attempt_id").notNull(),
    exam_id: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    slot_id: uuid("slot_id").references(() => exam_access_slots.id, { onDelete: "cascade" }),
    student_id: uuid("student_id").references(() => profiles.id, { onDelete: "cascade" }),
    extension_seconds: integer("extension_seconds").notNull().default(0),
    reason: text("reason").notNull(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    attempt_idx: index("exam_attempt_adjustments_attempt_idx").on(table.attempt_kind, table.attempt_id, table.created_at),
  }),
);

export const exam_attempt_grants = pgTable(
  "exam_attempt_grants",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exam_id: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    slot_id: uuid("slot_id").references(() => exam_access_slots.id, { onDelete: "cascade" }),
    student_id: uuid("student_id").references(() => profiles.id, { onDelete: "cascade" }),
    client_hash: text("client_hash"),
    candidate_code: text("candidate_code"),
    additional_attempts: integer("additional_attempts").notNull().default(1),
    consumed_attempts: integer("consumed_attempts").notNull().default(0),
    reason: text("reason").notNull(),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    account_idx: index("exam_attempt_grants_account_idx").on(table.exam_id, table.student_id, table.consumed_attempts),
    guest_idx: index("exam_attempt_grants_guest_idx").on(table.exam_id, table.slot_id, table.client_hash, table.consumed_attempts),
  }),
);

export const exam_scoring_versions = pgTable(
  "exam_scoring_versions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exam_id: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    version: integer("version").notNull(),
    status: text("status").notNull().default("draft"),
    reason: text("reason").notNull(),
    created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    applied_at: timestamp("applied_at", { withTimezone: true }),
  },
  table => ({
    exam_version_unique: unique("exam_scoring_versions_exam_version_key").on(table.exam_id, table.version),
    exam_idx: index("exam_scoring_versions_exam_idx").on(table.exam_id, table.version),
  }),
);

export const exam_question_overrides = pgTable(
  "exam_question_overrides",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    scoring_version_id: uuid("scoring_version_id").notNull().references(() => exam_scoring_versions.id, { onDelete: "cascade" }),
    question_id: uuid("question_id").notNull().references(() => exam_questions.id, { onDelete: "cascade" }),
    override_mode: text("override_mode").notNull(),
    accepted_answers: jsonb("accepted_answers").notNull().default(sql`'[]'::jsonb`),
    reason: text("reason").notNull(),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    version_question_unique: unique("exam_question_overrides_version_question_key").on(table.scoring_version_id, table.question_id),
    question_idx: index("exam_question_overrides_question_idx").on(table.question_id, table.scoring_version_id),
  }),
);

export const exam_regrade_runs = pgTable(
  "exam_regrade_runs",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    exam_id: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    scoring_version_id: uuid("scoring_version_id").notNull().references(() => exam_scoring_versions.id, { onDelete: "restrict" }),
    status: text("status").notNull().default("preview"),
    attempt_count: integer("attempt_count").notNull().default(0),
    affected_count: integer("affected_count").notNull().default(0),
    summary: jsonb("summary").notNull().default(sql`'{}'::jsonb`),
    reason: text("reason").notNull(),
    created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    applied_at: timestamp("applied_at", { withTimezone: true }),
  },
  table => ({
    exam_idx: index("exam_regrade_runs_exam_idx").on(table.exam_id, table.created_at),
  }),
);

export const exam_policy_presets = pgTable("exam_policy_presets", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  slug: text("slug").notNull().unique(),
  policy: jsonb("policy").notNull().default(sql`'{}'::jsonb`),
  is_system: boolean("is_system").notNull().default(false),
  created_by: uuid("created_by").references(() => profiles.id, { onDelete: "set null" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exam_templates = pgTable("exam_templates", {
  id: uuid("id").primaryKey().defaultRandom(),
  name: text("name").notNull(),
  exam_type: text("exam_type").notNull().default("CUSTOM"),
  profile_config: jsonb("profile_config").notNull().default(sql`'{}'::jsonb`),
  policy: jsonb("policy").notNull().default(sql`'{}'::jsonb`),
  source_exam_id: uuid("source_exam_id").references(() => exams.id, { onDelete: "set null" }),
  created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const exam_slot_candidates = pgTable(
  "exam_slot_candidates",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    slot_id: uuid("slot_id").notNull().references(() => exam_access_slots.id, { onDelete: "cascade" }),
    exam_id: uuid("exam_id").notNull().references(() => exams.id, { onDelete: "cascade" }),
    candidate_code: text("candidate_code").notNull(),
    full_name: text("full_name").notNull().default(""),
    class_name: text("class_name").notNull().default(""),
    school: text("school").notNull().default(""),
    metadata: jsonb("metadata").notNull().default(sql`'{}'::jsonb`),
    created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    slot_candidate_unique: unique("exam_slot_candidates_slot_candidate_key").on(table.slot_id, table.candidate_code),
    lookup_idx: index("exam_slot_candidates_lookup_idx").on(table.slot_id, table.candidate_code),
  }),
);

export const course_schedule_rules = pgTable("course_schedule_rules", {
  id: uuid("id").primaryKey().defaultRandom(),
  course_id: uuid("course_id").notNull().unique().references(() => courses.id, { onDelete: "cascade" }),
  start_date: date("start_date", { mode: "string" }).notNull(),
  weekdays: smallint("weekdays").array().notNull(),
  start_time: time("start_time").notNull(),
  duration_minutes: integer("duration_minutes").notNull(),
  time_zone: text("time_zone").notNull().default("Asia/Ho_Chi_Minh"),
  created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
  created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const course_schedule_events = pgTable(
  "course_schedule_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    course_id: uuid("course_id").notNull().references(() => courses.id, { onDelete: "cascade" }),
    lesson_id: uuid("lesson_id").references(() => lessons.id, { onDelete: "cascade" }),
    title: text("title").notNull(),
    description: text("description").notNull().default(""),
    start_at: timestamp("start_at", { withTimezone: true }).notNull(),
    end_at: timestamp("end_at", { withTimezone: true }).notNull(),
    instructor: text("instructor").notNull().default(""),
    delivery_mode: text("delivery_mode").notNull().default("self_study"),
    meeting_url: text("meeting_url"),
    event_kind: text("event_kind").notNull(),
    source: text("source").notNull(),
    generation_batch_id: uuid("generation_batch_id"),
    status: text("status").notNull().default("scheduled"),
    published: boolean("published").notNull().default(false),
    created_by: uuid("created_by").notNull().references(() => profiles.id, { onDelete: "restrict" }),
    created_at: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  table => ({
    lesson_unique: unique("course_schedule_events_lesson_unique").on(table.lesson_id),
    course_start_idx: index("course_schedule_events_course_start_idx").on(table.course_id, table.start_at),
    visible_start_idx: index("course_schedule_events_visible_start_idx").on(table.start_at, table.end_at),
  }),
);

export const microsoft_graph_connections = pgTable("microsoft_graph_connections", {
  id: smallint("id").primaryKey().default(1),
  tenant_id: text("tenant_id").notNull(),
  provider_account_id: text("provider_account_id").notNull(),
  provider_principal: text("provider_principal"),
  access_token_ciphertext: text("access_token_ciphertext").notNull(),
  refresh_token_ciphertext: text("refresh_token_ciphertext").notNull(),
  access_token_expires_at: timestamp("access_token_expires_at", { withTimezone: true }).notNull(),
  scope: text("scope").notNull().default(""),
  connected_by: uuid("connected_by"),
  connected_at: timestamp("connected_at", { withTimezone: true }).notNull().defaultNow(),
  updated_at: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Compatibility exports retained for the original task brief. These aliases
// point at canonical tables instead of creating fake legacy relations.
/** @deprecated use chapters */
export const course_chapters = chapters;
/** @deprecated use lessons */
export const course_lessons = lessons;
/** @deprecated use question_bank_item_versions */
export const question_item_versions = question_bank_item_versions;
/** @deprecated use exam_access_slots */
export const exam_sessions = exam_access_slots;
/** @deprecated use exam_attempts */
export const session_attempts = exam_attempts;
/** @deprecated use course_schedule_events */
export const timetable_slots = course_schedule_events;

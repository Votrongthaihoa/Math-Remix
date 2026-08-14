import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260814003030_onedrive_lesson_video_resources.sql", import.meta.url);

test("OneDrive resource migration is forward-only and stores stable metadata only", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /alter table public\.lesson_resources/);
  assert.match(migration, /'onedrive_video'/);
  assert.match(migration, /provider_drive_id text/);
  assert.match(migration, /provider_item_id text/);
  assert.match(migration, /provider_metadata jsonb not null default '\{\}'::jsonb/);
  assert.doesNotMatch(migration, /drop table|truncate|delete\s+from|insert\s+into/i);
  assert.doesNotMatch(migration, /download_url\s+text|access_token|refresh_token|client_secret/i);
});

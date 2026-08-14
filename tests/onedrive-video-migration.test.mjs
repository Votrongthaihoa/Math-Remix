import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260814003030_onedrive_lesson_video_resources.sql", import.meta.url);

test("OneDrive public-link migration is forward-only and does not add credential storage", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /alter table public\.lesson_resources/);
  assert.match(migration, /'onedrive_video'/);
  assert.match(migration, /stable public Microsoft playback URL/i);
  assert.doesNotMatch(migration, /drop table|truncate|delete\s+from|insert\s+into/i);
  assert.doesNotMatch(migration, /download_url\s+text|access_token\s+text|refresh_token\s+text|client_secret\s+text/i);
});

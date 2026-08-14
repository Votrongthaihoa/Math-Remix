import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const migrationUrl = new URL("../supabase/migrations/20260814003030_onedrive_lesson_video_resources.sql", import.meta.url);
const graphMigrationUrl = new URL("../supabase/migrations/20260814021906_microsoft_graph_delegated_connection.sql", import.meta.url);

test("OneDrive public-link migration is forward-only and does not add credential storage", async () => {
  const migration = await readFile(migrationUrl, "utf8");
  assert.match(migration, /alter table public\.lesson_resources/);
  assert.match(migration, /'onedrive_video'/);
  assert.match(migration, /stable public Microsoft playback URL/i);
  assert.doesNotMatch(migration, /drop table|truncate|delete\s+from|insert\s+into/i);
  assert.doesNotMatch(migration, /download_url\s+text|access_token\s+text|refresh_token\s+text|client_secret\s+text/i);
});

test("Microsoft Graph connection migration stores ciphertext behind a server-only boundary", async () => {
  const [migration, deployCheck] = await Promise.all([
    readFile(graphMigrationUrl, "utf8"),
    readFile(new URL("../scripts/deploy-readiness-check.mjs", import.meta.url), "utf8"),
  ]);
  assert.match(migration, /create table public\.microsoft_graph_connections/);
  assert.match(migration, /access_token_ciphertext text not null/);
  assert.match(migration, /refresh_token_ciphertext text not null/);
  assert.match(migration, /enable row level security/);
  assert.match(migration, /force row level security/);
  assert.match(migration, /revoke all on table public\.microsoft_graph_connections from public, anon, authenticated/);
  assert.match(migration, /grant select, insert, update, delete on table public\.microsoft_graph_connections to service_role/);
  assert.match(migration, /has_table_privilege\('anon', 'public\.microsoft_graph_connections', 'select'\)/);
  assert.match(migration, /Microsoft Graph connection table is exposed to browser roles/);
  assert.doesNotMatch(migration, /\baccess_token\s+text|\brefresh_token\s+text|client_secret/i);
  assert.doesNotMatch(migration, /drop table|truncate|delete\s+from/i);
  assert.match(deployCheck, /"microsoft_graph_connections"/);
});

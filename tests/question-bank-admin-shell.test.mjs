import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("question bank uses the source admin presentation without the macOS workspace label", async () => {
  const [component, sourceTheme] = await Promise.all([
    readFile(new URL("../app/admin-question-bank.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-source-reference.css", import.meta.url), "utf8"),
  ]);

  assert.doesNotMatch(component, /macOS WORKSPACE/i);
  assert.match(sourceTheme, /\.source-admin-shell:not\(\.protected-exam-surface\) \.question-bank-page/);
  assert.match(sourceTheme, /\.question-bank-status\.active[\s\S]*?background:\s*var\(--source-accent-soft\);[\s\S]*?color:\s*var\(--source-accent-hover\);/);
});

test("question-bank refresh explicitly scopes brand tokens and flat authoring chrome", async () => {
  const [component, workspace, theme] = await Promise.all([
    readFile(new URL("../app/admin-question-bank.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/admin-question-bank-workspace.css", import.meta.url), "utf8"),
    readFile(new URL("../app/red-white-theme.css", import.meta.url), "utf8"),
  ]);
  assert.match(component, /question-bank-page question-bank-workspace/);
  assert.match(theme, /\.ui-shell\.admin-app\.product-shell:has\(\.question-bank-page\.question-bank-workspace\)/);
  assert.match(workspace, /^\.app-shell\.ui-shell\.admin-app\.product-shell:has\(> \.main-content \.question-bank-page\.question-bank-workspace\)/m);
  assert.doesNotMatch(workspace, /#[\da-f]{3,8}\b|backdrop-filter:\s*blur|\.exam-shell|\.guest-exam|\.admin-exam-workspace/i);
  assert.match(workspace, /background: var\(--brand-white\)/);
  assert.match(workspace, /white-space: pre-wrap; overflow-wrap: anywhere/);
  assert.match(component, /<fieldset className="question-bank-editor-section" disabled=\{itemSaving\}>/);
  assert.match(component, /Xóa bộ lọc/);
  assert.ok(component.indexOf('aria-label="Chủ đề trong ngân hàng"') < component.indexOf('className="question-bank-stage"'));
});

test("question-bank detail keeps the parent item id when merging its current version", async () => {
  const route = await readFile(new URL("../app/api/admin/question-banks/route.ts", import.meta.url), "utf8");

  assert.match(route, /const normalizedItems = \(itemsResult\.data \?\? \[\]\)\.map\(item => \{[\s\S]*return version \? \{ \...item, \...version, id: item\.id \} : item;/);
});

test("question-bank attach refuses selections above the server limit instead of truncating them", async () => {
  const route = await readFile(new URL("../app/api/admin/question-banks/route.ts", import.meta.url), "utf8");

  assert.match(route, /const MAX_ATTACH_ITEMS = 200/);
  assert.match(route, /const itemIds = idList\(body\.itemIds, MAX_ATTACH_ITEMS \+ 1\)/);
  assert.match(route, /code: "item_limit_exceeded"/);
});

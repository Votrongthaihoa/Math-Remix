import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("system event overlay validates its source and restores keyboard focus", async () => {
  const source = await readFile(new URL("../app/event-overlay.tsx", import.meta.url), "utf8");
  assert.match(source, /url\.origin !== window\.location\.origin/);
  assert.match(source, /allowedEventPath\.test\(url\.pathname\)/);
  assert.match(source, /value\.origin !== window\.location\.origin/);
  assert.match(source, /value\.source !== frameRef\.current\?\.contentWindow/);
  assert.match(source, /keyboardEvent\.key !== "Escape"/);
  assert.match(source, /closeButtonRef\.current\?\.focus/);
  assert.match(source, /restoreFocusRef\.current\?\.focus/);
  assert.match(source, /aria-modal="true"/);
  assert.match(source, /aria-labelledby=/);
});

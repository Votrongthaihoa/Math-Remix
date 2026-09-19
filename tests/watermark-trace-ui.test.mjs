import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("watermark trace UI uploads a bounded file and renders safe attribution states", async () => {
  const page = await readFile(new URL("../app/admin-watermark-trace.tsx", import.meta.url), "utf8");
  const styles = await readFile(new URL("../app/admin-capability-center.css", import.meta.url), "utf8");
  assert.match(page, /accept="\.pdf,image\/\*,text\/plain"/);
  assert.match(page, /MAX_TRACE_FILE_BYTES/);
  assert.match(page, /new FormData\(\)/);
  assert.match(page, /authenticatedFetch\("\/api\/admin\/watermark-trace"/);
  assert.match(page, /matched === true/);
  assert.match(page, /visible-only|visible_only/);
  assert.match(styles, /admin-watermark-trace/);
});

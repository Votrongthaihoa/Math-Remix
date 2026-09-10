import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("alpha student dashboard is a native product-surface component", async () => {
  const [component, platform] = await Promise.all([
    readFile(new URL("../app/student-dashboard.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/platform.tsx", import.meta.url), "utf8"),
  ]);

  assert.match(component, /data-testid="student-dashboard"/);
  assert.match(component, /className="alpha-dashboard-summary"/);
  assert.match(component, /className="alpha-dashboard-resource-grid"/);
  assert.match(component, /className="alpha-dashboard-activity"/);
  assert.match(component, /className="alpha-dashboard-continue"/);
  assert.match(component, /Tiếp tục học/);
  assert.match(component, /href={`\/exam\/result\/\$\{encodeURIComponent\(item\.id\)\}`}/);
  assert.match(platform, /<StudentDashboard/);
});

test("student dashboard exposes a recoverable loading failure state", async () => {
  const component = await readFile(new URL("../app/student-dashboard.tsx", import.meta.url), "utf8");

  assert.match(component, /aria-busy=\{loading\}/);
  assert.match(component, /role="alert"/);
  assert.match(component, /onRetry/);
});

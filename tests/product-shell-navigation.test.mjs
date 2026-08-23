import { readFile } from "node:fs/promises";
import { test } from "node:test";
import assert from "node:assert/strict";

test("product shell navigation exposes state and keyboard menu behavior", async () => {
  const platform = await readFile(new URL("../app/platform.tsx", import.meta.url), "utf8");

  assert.match(platform, /className="header-sidebar-toggle"[\s\S]*?aria-controls="main-sidebar"/);
  assert.match(platform, /id="account-menu"/);
  assert.match(platform, /className="account-dropdown"/);
  assert.match(platform, /data-account-menu-item/);
  assert.match(platform, /event\.key === "ArrowDown"/);
  assert.match(platform, /className=\{`student-nav-primary/);
  assert.match(platform, /className=\{`student-nav-disclosure/);
  assert.match(platform, /!examRunnerSurface && !protectedProductSurface && <a className="skip-link"/);
  assert.match(platform, /const currentView = viewFromPath\(pathname\)/);
  assert.doesNotMatch(platform, /const \[view, setView\]/);
  assert.match(platform, /const lastFocusedRouteRef = useRef<string \| null>\(null\)/);
  assert.match(platform, /const popstateNavigationRef = useRef\(false\)/);
  assert.match(platform, /if \(!preserveScrollPosition\) window\.scrollTo/);
  assert.match(platform, /previousPath === null \|\| previousPath === pathname \|\| uiRouteMode === "protected"/);
  assert.match(platform, /element\.inert = true/);
  assert.match(platform, /const original = element\.inert;/);
  assert.match(platform, /element\.inert = original;/);
  assert.match(platform, /aria-label="Vị trí hiện tại"/);
});

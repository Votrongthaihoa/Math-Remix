import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("package exposes explicit coverage and evidence entrypoints", async () => {
  const packageJson = JSON.parse(await source("package.json"));
  for (const script of ["coverage:p0", "coverage:runtime", "coverage:all", "evidence:manifest"]) {
    assert.equal(typeof packageJson.scripts?.[script], "string", `missing npm script ${script}`);
  }
  assert.match(packageJson.scripts["coverage:p0"], /run-node-coverage\.mjs p0/);
  assert.match(packageJson.scripts["coverage:runtime"], /run-node-coverage\.mjs runtime/);
  assert.match(packageJson.scripts["coverage:all"], /run-node-coverage\.mjs all/);
  assert.match(packageJson.scripts["evidence:manifest"], /generate-test-evidence-manifest\.mjs/);
});

test("quality workflow is synthetic, pinned, and preserves release evidence", async () => {
  const workflow = await source(".github/workflows/quality.yml");
  for (const pin of [
    "actions/checkout@11d5960a326750d5838078e36cf38b85af677262",
    "actions/setup-node@49933ea5288caeca8642d1e84afbd3f7d6820020",
    "actions/upload-artifact@ea165f8d65b6e75b540449e92b4886f43607fa02",
  ]) assert.match(workflow, new RegExp(pin.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")), `action is not pinned: ${pin}`);
  assert.match(workflow, /NEXT_PUBLIC_SUPABASE_URL:\s+https:\/\/synthetic\.supabase\.test/);
  assert.match(workflow, /WRANGLER_ENV_FILE:\s+e2e\/fixtures\/synthetic-worker\.env/);
  assert.doesNotMatch(workflow, /E2E_ADMIN_(?:EMAIL|PASSWORD)|SUPABASE_SERVICE_ROLE|Authorization:/i);
  for (const project of ["chromium", "tablet-768", "mobile-390", "mobile-360", "mobile-320", "webkit"]) assert.match(workflow, new RegExp(`project(?:=| in )[^\\n]*${project}`), `missing browser project ${project}`);
  assert.match(workflow, /P0 coverage release gate/);
  assert.match(workflow, /continue-on-error:\s+true[\s\S]*coverage:runtime/);
  assert.match(workflow, /artifacts\/coverage\//);
  assert.match(workflow, /audit\/coverage-source-manifest\.json/);
  assert.match(workflow, /if:\s+always\(\)/);
});

test("Playwright matrix names the required responsive widths and evidence reporters", async () => {
  const config = await source("playwright.config.ts");
  for (const project of ["chromium", "tablet-768", "mobile-390", "mobile-360", "mobile-320", "webkit"]) assert.match(config, new RegExp(`name: \"${project}\"`));
  for (const width of [1440, 768, 390, 360, 320]) assert.match(config, new RegExp(`width: ${width}`));
  assert.match(config, /retries:\s+process\.env\.CI \? 1 : 0/);
  assert.match(config, /failOnFlakyTests:\s+Boolean\(process\.env\.CI\)/);
  assert.match(config, /trace:\s+process\.env\.CI \? "on-first-retry" : "retain-on-failure"/);
  assert.match(config, /screenshot:\s+"only-on-failure"/);
  assert.match(config, /PW_REPORT_ROOT \?\? "playwright-report"/);
  assert.match(config, /PW_JSON_OUTPUT \?\? "test-results\/results\.json"/);
  assert.match(config, /reporter: \[\["list"\], \["html"/);
  assert.match(config, /outputFolder: htmlReportDirectory/);
  assert.match(config, /outputFile: jsonReportFile/);
  assert.match(await source(".github/workflows/quality.yml"), /PW_REPORT_ROOT="playwright-report\/\$\{project\}"/);
  assert.match(await source(".github/workflows/quality.yml"), /PW_JSON_OUTPUT="test-results\/\$\{project\}\/results\.json"/);
});

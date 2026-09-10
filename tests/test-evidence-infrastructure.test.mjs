import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import test from "node:test";
import evidenceReporter, { buildNodeArguments, COVERAGE_GROUPS, evaluateEvidence } from "../scripts/run-node-coverage.mjs";
import { classifyTestEvidence, generateManifest, parseGitStatus, riskTier } from "../scripts/generate-test-evidence-manifest.mjs";

const coverage = { files: [{ path: "lib/example.ts" }], totals: { lines: 95, branches: 85, functions: 95 }, thresholds: { lines: 90, branches: 80, functions: 90 } };
const counts = { tests: 4, passed: 4, failed: 0, cancelled: 0, skipped: 0, todo: 0 };

test("coverage groups are explicit and P0 thresholds bind exactly the three critical modules", () => {
  assert.deepEqual(Object.keys(COVERAGE_GROUPS), ["all", "p0", "runtime"]);
  assert.equal(COVERAGE_GROUPS.p0.tests.length, 3);
  assert.deepEqual(COVERAGE_GROUPS.p0.include, ["lib/content-token.ts", "lib/resource-access-server.ts", "lib/exam-preflight-server.ts"]);
  const args = buildNodeArguments("p0", "artifacts/coverage/p0");
  for (const expected of ["--experimental-strip-types", "--experimental-test-coverage", "--test-reporter=spec", "--test-reporter=lcov", "--test-coverage-lines=90", "--test-coverage-branches=80", "--test-coverage-functions=90"]) assert.ok(args.includes(expected), expected);
  assert.deepEqual(args.slice(-3), COVERAGE_GROUPS.p0.tests);
  assert.throws(() => buildNodeArguments("missing", "unused"), /Unknown coverage group/);
});

test("coverage status cannot label TODO, skipped, missing, failed, or low coverage as PASS", () => {
  assert.equal(evaluateEvidence({ counts, coverage }), "PASS");
  assert.equal(evaluateEvidence({ counts: { ...counts, todo: 1 }, coverage }), "BLOCKED_BY_TODO");
  assert.equal(evaluateEvidence({ counts: { ...counts, skipped: 1 }, coverage }), "BLOCKED_BY_SKIPPED");
  assert.equal(evaluateEvidence({ counts: { ...counts, failed: 1 }, coverage }), "FAIL");
  assert.equal(evaluateEvidence({ counts: { ...counts, cancelled: 1 }, coverage }), "FAIL");
  assert.equal(evaluateEvidence({ counts, coverage, childSuccess: false }), "FAIL");
  assert.equal(evaluateEvidence({ counts: null, coverage }), "INCOMPLETE");
  assert.equal(evaluateEvidence({ counts, coverage: null }), "INCOMPLETE");
  assert.equal(evaluateEvidence({ counts: { ...counts, tests: 0 }, coverage }), "INCOMPLETE");
  assert.equal(evaluateEvidence({ counts, coverage, expectedSources: ["lib/missing.ts"] }), "INCOMPLETE");
  assert.equal(evaluateEvidence({ counts, coverage: { ...coverage, totals: { ...coverage.totals, branches: 79 } } }), "BELOW_THRESHOLD");
});

test("runtime coverage thresholds are configurable while production include scope remains broad", () => {
  const args = buildNodeArguments("runtime", "artifacts/runtime", { lines: 80, branches: 70, functions: 80 });
  assert.ok(args.includes("--test-coverage-lines=80"));
  assert.ok(args.includes("--test-coverage-include=app/**"));
  assert.ok(args.includes("--test-coverage-include=worker/**"));
  assert.equal(COVERAGE_GROUPS.runtime.tests.length, 10);
});

test("native JSON reporter retains counts/coverage but drops error and console payloads", async () => {
  async function* events() {
    yield { type: "test:stderr", data: { message: "SYNTHETIC_SECRET_MUST_NOT_BE_RETAINED" } };
    yield { type: "test:coverage", data: { summary: {
      workingDirectory: process.cwd(), files: [{ path: path.join(process.cwd(), "lib", "example.ts"), coveredLinePercent: 100, coveredBranchPercent: 100, coveredFunctionPercent: 100 }],
      totals: { coveredLinePercent: 100, coveredBranchPercent: 100, coveredFunctionPercent: 100 }, thresholds: { line: 90, branch: 80, function: 90 },
    } } };
    yield { type: "test:summary", data: { success: true, counts: { ...counts, todo: 1 } } };
  }
  let output = "";
  for await (const chunk of evidenceReporter(events())) output += chunk;
  const result = JSON.parse(output);
  assert.equal(result.status, "BLOCKED_BY_TODO");
  assert.equal(result.counts.todo, 1);
  assert.equal(result.coverage.files[0].path, "lib/example.ts");
  assert.equal(output.includes("SYNTHETIC_SECRET"), false);
  assert.equal(output.includes(process.cwd()), false);
});

test("manifest separates direct import candidates from static source references and unknown browser mappings", () => {
  const sourcePaths = new Set(["lib/direct.ts", "app/static.tsx", "lib/dynamic.ts"]);
  const evidence = classifyTestEvidence("tests/example.test.mjs", `import { value } from "../lib/direct.ts"; const x = await import(\`../lib/dynamic.ts?case=1\`); readFile("app/static.tsx");`, sourcePaths);
  assert.deepEqual(evidence.directImportCandidates, ["lib/direct.ts", "lib/dynamic.ts"]);
  assert.deepEqual(evidence.sourceReferenceCandidates, ["app/static.tsx"]);
  assert.equal(evidence.evidenceType, "mixed_direct_import_and_source_reference");
  assert.match(evidence.browserMapping, /^unknown/);
  assert.equal(classifyTestEvidence("e2e/example.spec.ts", "", sourcePaths).kind, "browser_test_definition");
});

test("manifest risk tiers are explicitly conservative path heuristics", () => {
  assert.equal(riskTier("lib/content-token.ts"), "P0");
  assert.equal(riskTier("lib/resource-access-server.ts"), "P0");
  assert.equal(riskTier("workers/media/src/index.ts"), "P1");
  assert.equal(riskTier("components/card.tsx"), "P2");
});

test("git status parser emits paths/status only and handles rename records", () => {
  assert.deepEqual(parseGitStatus(" M lib/a.ts\0R  lib/new.ts\0lib/old.ts\0?? tests/new.test.mjs\0"), [
    { status: "M", path: "lib/a.ts" }, { status: "R", path: "lib/new.ts" }, { status: "??", path: "tests/new.test.mjs" },
  ]);
  assert.equal(parseGitStatus(null), null);
});

test("manifest inventories synthetic source/test files without copying contents or claiming execution", async t => {
  const root = await mkdtemp(path.join(os.tmpdir(), "aeck-evidence-test-"));
  t.after(() => rm(root, { recursive: true, force: true }));
  for (const directory of ["lib", "tests", "e2e", "workers/media/node_modules"]) await mkdir(path.join(root, directory), { recursive: true });
  await writeFile(path.join(root, "lib", "content-token.ts"), 'export const secret = "SYNTHETIC_DO_NOT_COPY";');
  await writeFile(path.join(root, "tests", "token.test.mjs"), 'import "../lib/content-token.ts";');
  await writeFile(path.join(root, "e2e", "token.spec.ts"), "// A definition is not a browser run.");
  await writeFile(path.join(root, "workers", "media", "node_modules", "ignored.js"), "ignore");
  await writeFile(path.join(root, "package-lock.json"), "{}");
  const manifest = await generateManifest(root, { includeGithub: false, includeGit: false });
  assert.equal(manifest.sources.length, 1);
  assert.equal(manifest.tests.length, 2);
  assert.deepEqual(manifest.sources[0].directImportTests, ["tests/token.test.mjs"]);
  assert.equal(manifest.sources[0].executionStatus, "unknown_requires_run_artifact");
  assert.match(manifest.lockfile.sha256, /^[a-f0-9]{64}$/);
  assert.equal(manifest.qualityRun.status, "not_requested");
  assert.equal(JSON.stringify(manifest).includes("SYNTHETIC_DO_NOT_COPY"), false);
  assert.equal(JSON.stringify(manifest).includes(root), false);
});

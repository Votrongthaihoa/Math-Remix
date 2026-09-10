import { spawn } from "node:child_process";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const COVERAGE_GROUPS = {
  all: { tests: ["tests/*.test.mjs"], include: ["app/**", "lib/**", "components/**", "worker/**", "workers/**"], thresholds: null },
  p0: {
    tests: ["tests/content-token.test.mjs", "tests/resource-access-server.test.mjs", "tests/exam-preflight-server.test.mjs"],
    include: ["lib/content-token.ts", "lib/resource-access-server.ts", "lib/exam-preflight-server.ts"],
    thresholds: { lines: 90, branches: 80, functions: 90 },
  },
  runtime: {
    tests: ["tests/http-server.test.mjs", "tests/request-retry.test.mjs", "tests/rate-limit.test.mjs", "tests/auth-client.test.mjs", "tests/api-url.test.mjs", "tests/security-server.test.mjs", "tests/hls-route-behavior.test.mjs", "tests/hls-vault.test.mjs", "tests/media-worker-behavior.test.mjs", "tests/worker-entry-behavior.test.mjs"],
    include: ["app/**", "lib/**", "worker/**", "workers/**"],
    thresholds: { lines: 85, branches: 75, functions: 85 },
  },
};

export function buildNodeArguments(groupName, outputDirectory, thresholds = COVERAGE_GROUPS[groupName]?.thresholds) {
  const group = COVERAGE_GROUPS[groupName];
  if (!group) throw new Error("Unknown coverage group; use all, p0, or runtime.");
  const args = ["--experimental-strip-types", "--experimental-test-coverage", "--test",
    "--test-reporter=spec", "--test-reporter-destination=stdout",
    "--test-reporter=lcov", `--test-reporter-destination=${path.join(outputDirectory, "lcov.info")}`,
    `--test-reporter=${import.meta.url}`, `--test-reporter-destination=${path.join(outputDirectory, "summary.json")}`,
    ...group.include.map(pattern => `--test-coverage-include=${pattern}`),
  ];
  if (thresholds) {
    for (const metric of ["lines", "branches", "functions"]) args.push(`--test-coverage-${metric}=${thresholds[metric]}`);
  }
  return [...args, ...group.tests];
}

export function evaluateEvidence({ counts, coverage, childSuccess = true, expectedSources = [] }) {
  if (!counts || !coverage || !counts.tests) return "INCOMPLETE";
  if (!childSuccess || counts.failed || counts.cancelled) return "FAIL";
  if (counts.todo) return "BLOCKED_BY_TODO";
  if (counts.skipped) return "BLOCKED_BY_SKIPPED";
  const files = new Set(coverage.files.map(file => file.path));
  if (expectedSources.some(file => !files.has(file))) return "INCOMPLETE";
  const limits = coverage.thresholds ?? {};
  const totals = coverage.totals;
  if (totals.lines < (limits.lines ?? 0) || totals.branches < (limits.branches ?? 0) || totals.functions < (limits.functions ?? 0)) return "BELOW_THRESHOLD";
  return "PASS";
}

export function sanitizeCoverage(summary) {
  const relative = value => path.relative(summary.workingDirectory, value).split(path.sep).join("/");
  const percents = value => ({ lines: value.coveredLinePercent, branches: value.coveredBranchPercent, functions: value.coveredFunctionPercent });
  return {
    files: summary.files.map(file => ({ path: relative(file.path), ...percents(file) })),
    totals: percents(summary.totals),
    thresholds: { lines: summary.thresholds?.line ?? 0, branches: summary.thresholds?.branch ?? 0, functions: summary.thresholds?.function ?? 0 },
  };
}

// Native custom reporter: deliberately omit assertions, stack traces, console
// output, environment values, and synthetic payloads from the JSON artifact.
export default async function* evidenceReporter(events) {
  let counts = null;
  let coverage = null;
  let success = false;
  for await (const event of events) {
    if (event.type === "test:summary") {
      counts = event.data.counts;
      success = event.data.success;
    }
    if (event.type === "test:coverage") coverage = sanitizeCoverage(event.data.summary);
  }
  const result = { schemaVersion: 1, status: evaluateEvidence({ counts, coverage, childSuccess: success }), counts, coverage };
  yield `${JSON.stringify(result, null, 2)}\n`;
}

function readThresholds(args, defaults) {
  const override = args.find(arg => arg.startsWith("--thresholds="));
  if (!override) return defaults;
  const values = override.slice("--thresholds=".length).split(",").map(Number);
  if (values.length !== 3 || values.some(value => !Number.isFinite(value) || value < 0 || value > 100)) throw new Error("Thresholds must be lines,branches,functions percentages between 0 and 100.");
  return { lines: values[0], branches: values[1], functions: values[2] };
}

export async function runCoverage(args = process.argv.slice(2)) {
  const groupName = args.find(arg => !arg.startsWith("--")) ?? "all";
  const group = COVERAGE_GROUPS[groupName];
  if (!group) throw new Error("Unknown coverage group; use all, p0, or runtime.");
  const thresholds = readThresholds(args, group.thresholds);
  const outputArgument = args.find(arg => arg.startsWith("--output="));
  const outputDirectory = path.resolve(REPOSITORY_ROOT, outputArgument?.slice("--output=".length) ?? `artifacts/coverage/${groupName}`);
  await mkdir(outputDirectory, { recursive: true });
  // Clear only this run's bounded output files so a crashed run cannot inherit
  // a prior green summary. No directory removal or worktree cleanup occurs.
  await writeFile(path.join(outputDirectory, "summary.json"), "");
  await writeFile(path.join(outputDirectory, "lcov.info"), "");
  const exitCode = await new Promise(resolve => {
    const child = spawn(process.execPath, buildNodeArguments(groupName, outputDirectory, thresholds), { cwd: REPOSITORY_ROOT, stdio: "inherit" });
    child.once("error", () => resolve(1));
    child.once("exit", code => resolve(code ?? 1));
  });
  let summary;
  try { summary = JSON.parse(await readFile(path.join(outputDirectory, "summary.json"), "utf8")); }
  catch { summary = { schemaVersion: 1, status: "INCOMPLETE", counts: null, coverage: null }; }
  summary.group = groupName;
  summary.runtime = process.version;
  summary.generatedAt = new Date().toISOString();
  summary.tests = group.tests;
  summary.coverageScope = "Loaded production modules only; unexecuted files are not coverage evidence.";
  summary.childExitCode = exitCode;
  summary.configuredThresholds = thresholds;
  summary.status = evaluateEvidence({ counts: summary.counts, coverage: summary.coverage, childSuccess: exitCode === 0, expectedSources: groupName === "p0" ? group.include : [] });
  await writeFile(path.join(outputDirectory, "summary.json"), `${JSON.stringify(summary, null, 2)}\n`);
  process.stdout.write(`Coverage evidence: ${summary.status} (${path.relative(REPOSITORY_ROOT, outputDirectory).split(path.sep).join("/")}/summary.json)\n`);
  return summary.status === "PASS" ? 0 : 1;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  runCoverage().then(code => { process.exitCode = code; }).catch(() => {
    process.stderr.write("Coverage runner failed; check group/options and local runtime support.\n");
    process.exitCode = 1;
  });
}

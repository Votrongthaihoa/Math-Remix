import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const REPOSITORY_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SOURCE_ROOTS = ["app", "lib", "components", "worker", "workers"];
const EXCLUDED_DIRECTORIES = new Set(["node_modules", ".next", "dist", ".git", ".wrangler", "coverage", "artifacts"]);
const normalize = value => value.split(path.sep).join("/");

async function inventory(root, folder) {
  let entries;
  try { entries = await readdir(path.join(root, folder), { withFileTypes: true }); }
  catch (error) { if (error.code === "ENOENT") return []; throw error; }
  const result = [];
  for (const entry of entries) {
    if (entry.isSymbolicLink()) continue;
    const relative = normalize(path.join(folder, entry.name));
    if (entry.isDirectory() && !EXCLUDED_DIRECTORIES.has(entry.name)) result.push(...await inventory(root, relative));
    else if (entry.isFile() && /\.(?:[cm]?[jt]sx?|css)$/.test(entry.name)) result.push(relative);
  }
  return result.sort();
}

export function riskTier(sourcePath) {
  if (/(?:auth|security|content-token|resource-access|exam-preflight|rate-limit|account|submit|answer|result|guest-exam|exam-room)/i.test(sourcePath)) return "P0";
  if (/^(?:worker|workers)\//.test(sourcePath) || /(?:api\/|hls|video|retry|http-server|session|upload|exam)/i.test(sourcePath)) return "P1";
  return "P2";
}

export function classifyTestEvidence(testPath, source, sourcePaths) {
  const imported = new Set();
  const referenced = new Set();
  // Static inventory only: an import establishes a candidate direct execution
  // link, not that the test passed or asserted all behavior of that module.
  const patterns = [
    /\bfrom\s*["']([^"']+)["']/g,
    /\bimport\s*["']([^"']+)["']/g,
    /\bimport\s*\(\s*["'`]([^"'`]+)["'`]/g,
  ];
  for (const pattern of patterns) {
    for (const match of source.matchAll(pattern)) {
      const specifier = match[1].split("?")[0];
      if (!specifier.startsWith(".")) continue;
      const resolved = path.posix.normalize(path.posix.join(path.posix.dirname(testPath), specifier));
      if (sourcePaths.has(resolved)) imported.add(resolved);
    }
  }
  for (const sourcePath of sourcePaths) if (source.includes(sourcePath)) referenced.add(sourcePath);
  return {
    path: testPath,
    kind: testPath.startsWith("e2e/") ? "browser_test_definition" : "node_test_definition",
    directImportCandidates: [...imported].sort(),
    sourceReferenceCandidates: [...referenced].filter(value => !imported.has(value)).sort(),
    evidenceType: imported.size ? (referenced.size > imported.size ? "mixed_direct_import_and_source_reference" : "direct_import") : referenced.size ? "source_static_reference" : "unmapped",
    browserMapping: "unknown_not_inferred_from_names_or_source",
    executionStatus: "unknown_requires_run_artifact",
  };
}

function command(root, executable, args) {
  try { return execFileSync(executable, args, { cwd: root, encoding: "utf8", timeout: 12_000, windowsHide: true, stdio: ["ignore", "pipe", "ignore"] }).trimEnd(); }
  catch { return null; }
}

export function parseGitStatus(raw) {
  if (raw === null) return null;
  const pieces = raw.split("\0");
  const entries = [];
  for (let index = 0; index < pieces.length; index += 1) {
    const record = pieces[index];
    if (!record) continue;
    // porcelain -z rename records include a second path; no contents or diffs.
    const status = record.slice(0, 2);
    entries.push({ status: status.trim(), path: normalize(record.slice(3)) });
    if (/[RC]/.test(status)) index += 1;
  }
  return entries;
}

async function readCoverageEvidence(root) {
  const result = [];
  for (const group of ["all", "p0", "runtime"]) {
    try {
      const summary = JSON.parse(await readFile(path.join(root, "artifacts", "coverage", group, "summary.json"), "utf8"));
      result.push({ path: `artifacts/coverage/${group}/summary.json`, status: summary.status ?? "unknown", counts: summary.counts ?? null, runtime: summary.runtime ?? null, generatedAt: summary.generatedAt ?? null, coverage: summary.coverage?.totals ?? null, freshness: "not_proven_for_current_tree" });
    } catch { result.push({ path: `artifacts/coverage/${group}/summary.json`, status: "missing_or_invalid" }); }
  }
  return result;
}

export async function generateManifest(root = REPOSITORY_ROOT, { includeGithub = true, includeGit = true } = {}) {
  const sources = (await Promise.all(SOURCE_ROOTS.map(folder => inventory(root, folder)))).flat().sort();
  const sourcePaths = new Set(sources);
  const testPaths = [...await inventory(root, "tests"), ...await inventory(root, "e2e")].filter(value => /\.(?:test|spec)\.[cm]?[jt]sx?$/.test(value)).sort();
  const tests = [];
  for (const testPath of testPaths) tests.push(classifyTestEvidence(testPath, await readFile(path.join(root, testPath), "utf8"), sourcePaths));
  let lockfileSha256 = null;
  try { lockfileSha256 = createHash("sha256").update(await readFile(path.join(root, "package-lock.json"))).digest("hex"); } catch { /* Explicitly unknown. */ }
  let qualityRun = { status: includeGithub ? "unavailable" : "not_requested" };
  if (includeGithub) {
    const raw = command(root, "gh", ["run", "list", "--workflow", "quality.yml", "--limit", "1", "--json", "status,conclusion,headSha"]);
    if (raw !== null) {
      try {
        const latest = JSON.parse(raw)[0];
        qualityRun = latest ? { status: latest.status, conclusion: latest.conclusion, headSha: latest.headSha, scope: "latest_workflow_run_not_necessarily_current_commit" } : { status: "no_runs" };
      } catch { qualityRun = { status: "unavailable" }; }
    }
  }
  return {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    runtime: { node: process.version, platform: process.platform, architecture: process.arch },
    git: { commit: includeGit ? command(root, "git", ["rev-parse", "HEAD"]) : null, changes: includeGit ? parseGitStatus(command(root, "git", ["status", "--porcelain=v1", "-z", "--untracked-files=all"])) : null },
    lockfile: { path: "package-lock.json", sha256: lockfileSha256 },
    qualityRun,
    coverageRuns: await readCoverageEvidence(root),
    boundaries: ["Inventory and import/reference mapping are static evidence, not proof of behavioral coverage.", "Risk tiers are path-based triage heuristics requiring human review.", "Browser route-to-test mapping remains unknown until actual browser evidence is recorded.", "No source bodies, environment values, credentials, request payloads, or git diffs are retained.", "Live production services are not contacted; optional gh lookup reads CI workflow status only."],
    sources: sources.map(sourcePath => ({
      path: sourcePath, riskTier: riskTier(sourcePath),
      directImportTests: tests.filter(item => item.directImportCandidates.includes(sourcePath)).map(item => item.path),
      sourceReferenceTests: tests.filter(item => item.sourceReferenceCandidates.includes(sourcePath)).map(item => item.path),
      browserMapping: "unknown", executionStatus: "unknown_requires_run_artifact",
    })),
    tests,
  };
}

export async function writeManifest(args = process.argv.slice(2)) {
  const outputArgument = args.find(arg => arg.startsWith("--output="));
  const output = path.resolve(REPOSITORY_ROOT, outputArgument?.slice("--output=".length) ?? "artifacts/test-evidence-manifest.json");
  const manifest = await generateManifest(REPOSITORY_ROOT, { includeGithub: !args.includes("--skip-gh") });
  await mkdir(path.dirname(output), { recursive: true });
  await writeFile(output, `${JSON.stringify(manifest, null, 2)}\n`);
  process.stdout.write(`Evidence manifest: ${normalize(path.relative(REPOSITORY_ROOT, output))} (${manifest.sources.length} sources, ${manifest.tests.length} test definitions)\n`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  writeManifest().catch(() => { process.stderr.write("Evidence manifest generation failed; no diagnostic payload was retained.\n"); process.exitCode = 1; });
}

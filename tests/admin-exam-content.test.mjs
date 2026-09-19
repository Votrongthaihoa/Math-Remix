import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const source = path => readFile(new URL(`../${path}`, import.meta.url), "utf8");

test("admin exam workspace reads protected content through an authenticated server route", async () => {
  const [route, workspace] = await Promise.all([
    source("app/api/admin/exam-content/route.ts"),
    source("app/admin-exam-workspace.tsx"),
  ]);

  assert.match(route, /ensureAdminPermission\(request, "exams"\)/);
  assert.doesNotMatch(route, /security\.profile\.role !== "admin"/);
  assert.match(route, /Promise\.all\(\[/);
  assert.match(route, /from\("exam_sections"\)/);
  assert.match(route, /from\("exam_questions"\)/);
  assert.match(route, /from\("exam_question_keys"\)/);
  assert.match(route, /private, no-store/);
  assert.match(workspace, /authenticatedFetch\("\/api\/admin\/exam-content"/);
  assert.match(route, /searchParams\.get\("examId"\)/);
  assert.match(route, /from\("exams"\)\.select\(EXAM_SELECT\)\.eq\("id", examId\)/);
  assert.match(workspace, /authenticatedFetch\(`\/api\/admin\/exam-content\?examId=\$\{encodeURIComponent\(examId\)\}`/);

  const loadStart = workspace.indexOf("const load = useCallback");
  const loadEnd = workspace.indexOf("const isPreviewRoute", loadStart);
  const loadSource = workspace.slice(loadStart, loadEnd);
  assert.doesNotMatch(loadSource, /supabase\.from\("exam_questions"\)/);
  assert.doesNotMatch(loadSource, /supabase\.from\("exam_question_keys"\)/);

  const previewLoadStart = workspace.indexOf("async function loadLiveExamPreviewDraft");
  const previewLoadEnd = workspace.indexOf("function signalExamPreviewRefresh", previewLoadStart);
  const previewLoadSource = workspace.slice(previewLoadStart, previewLoadEnd);
  assert.doesNotMatch(previewLoadSource, /supabase\.from\("exam_sections"\)/);
  assert.doesNotMatch(previewLoadSource, /supabase\.from\("exam_questions"\)/);
  assert.doesNotMatch(previewLoadSource, /supabase\.from\("exam_question_keys"\)/);
});

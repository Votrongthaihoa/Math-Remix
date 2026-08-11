import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import test from "node:test";

import { buildHsaQuestionGroups, buildHsaQuestionLoadPlan, filterHsaQuestionsForCombination, getHsaCombination, HSA_COMBINATIONS, hsaSubjectCodeFromLatex, replaceHsaPart3SubjectBank, splitHsaPart3SubjectBanks } from "../lib/hsa-exam.ts";
import { parseBaidocQuestionEntries, parseLatexQuestion, splitLatexQuestions } from "../lib/exam-latex.ts";
import { extractHsaPartSource, hsaPartForSectionTitle } from "../lib/hsa-latex-template.ts";
import { isPassageSection } from "../lib/exam-config.ts";

test("groups consecutive HSA questions that share an information passage", () => {
  const groups = buildHsaQuestionGroups([
    { id: "q1", _groupId: "passage-0", _groupContent: "Đoạn đọc" },
    { id: "q2", _groupId: "passage-0", _groupContent: "Đoạn đọc" },
    { id: "q3" },
    { id: "q4", _groupId: "passage-3", _groupContent: "Bảng số liệu" },
  ]);

  assert.deepEqual(groups.map((group) => ({ id: group.id, questionIds: group.questions.map((question) => question.id) })), [
    { id: "passage-0", questionIds: ["q1", "q2"] },
    { id: "question-q3", questionIds: ["q3"] },
    { id: "passage-3", questionIds: ["q4"] },
  ]);
  assert.equal(groups[0]?.content, "Đoạn đọc");
});

test("exposes the observed HSA combination catalog", () => {
  assert.deepEqual(HSA_COMBINATIONS.map(item => item.code), ["Q01", "Q02", "Q03", "Q04", "Q05", "Q06", "Q07", "Q08", "Q09", "Q10", "Q21"]);
  assert.deepEqual(getHsaCombination("q08")?.subjects, ["vatly", "lichsu", "dialy"]);
  assert.equal(getHsaCombination("Q21")?.mode, "english");
});

test("matches the observed single-column HSA combination option geometry", () => {
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(css, /\.hsa-combination-options\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)/);
  assert.match(css, /\.hsa-combination-option\s*\{[\s\S]*?min-height:\s*60px;[\s\S]*?border:\s*2px solid #78b68a;[\s\S]*?border-radius:\s*8px;[\s\S]*?background:\s*#eef8f1/);
});

test("shows the HSA combination picker only when Part 3 is waiting to start", () => {
  const room = readFileSync(new URL("../app/exam-room.tsx", import.meta.url), "utf8");

  assert.match(room, /const hsaPart3SelectionPending\s*=\s*isHsa[\s\S]*?HSA_PART3_SELECTION_PENDING_KEY/);
  assert.match(room, /if \(isHsa\) return <ExamLayout><HsaConfirmation[\s\S]*?showCombinationPicker=\{hsaPart3SelectionPending/);
  assert.doesNotMatch(room, /if \(isHsa\) return <ExamLayout><div className="hsa-session-page">\s*<HsaCombinationPicker/);
});

test("keeps the server pending marker and sends the chosen code only when Part 3 starts", () => {
  const room = readFileSync(new URL("../app/exam-room.tsx", import.meta.url), "utf8");

  assert.match(room, /const pendingHsaPart3Start\s*=\s*isHsa\s*&&\s*Boolean\(attempt\?\.answers\?\.\[HSA_PART3_SELECTION_PENDING_KEY\]\)/);
  assert.match(room, /hsaSelectionCode:\s*pendingHsaPart3Start\s*\?\s*selectedCombination\.code\s*:\s*undefined/);
  assert.match(room, /const mergedAnswers\s*=\s*response\.attempt\.answers\s*\?\?\s*\{\s*\.\.\.answers,\s*\.\.\.sectionAnswers\s*\}/);
});

test("keeps a filled drag-and-drop slot dashed while the candidate is answering", () => {
  const css = readFileSync(new URL("../components/remixstudyedu/math-exam.css", import.meta.url), "utf8");

  assert.match(css, /\.drag-blank\.filled\s*\{\s*border-style:dashed;\s*border-color:#d1d5db;\s*color:#1f2937;\s*background:#fff;/);
  assert.match(css, /\.drag-blank\.filled\.answer-green-box\s*\{[\s\S]*?border-style:solid;/);
  assert.doesNotMatch(css, /\.drag-blank\.filled\s*\{\s*border-style:solid;\s*border-color:#1980ff/);
});

test("keeps encrypted question loading placeholders silent", () => {
  const renderer = readFileSync(new URL("../components/remixstudyedu/MathExam.jsx", import.meta.url), "utf8");
  const hsaRenderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");

  assert.doesNotMatch(renderer, /Đang giải mã nội dung câu hỏi/);
  assert.doesNotMatch(hsaRenderer, /Đang tải câu hỏi/);
  assert.match(renderer, /<div className="math-encrypted-skeleton"><i\/><i\/><i\/><\/div>/);
  assert.match(hsaRenderer, /question\._loadError\s*&&\s*<span role="alert">\{question\._loadError\}<\/span>/);
});

test("centers the HSA session flow and keeps the continue action reachable", () => {
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(css, /\.hsa-session-page\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?overflow-y:\s*auto;/);
  assert.match(css, /\.hsa-session-page \.tsa-session-page\s*\{[\s\S]*?height:\s*auto;[\s\S]*?overflow:\s*visible;/);
});

test("starts HSA without making fullscreen a hard requirement", () => {
  const room = readFileSync(new URL("../app/exam-room.tsx", import.meta.url), "utf8");
  const hsaDetection = room.indexOf("const isHsa = normalizeExamType(bundle.room.exam_type)");
  const fullscreenGate = room.indexOf('if (mode === "exam" && !isHsa && !await enterExamFullscreen())');

  assert.ok(hsaDetection >= 0, "HSA must be identified before applying the fullscreen policy");
  assert.ok(fullscreenGate > hsaDetection, "the fullscreen gate must explicitly exclude HSA");
  assert.match(room, /\{mode === "exam" && <><AccountSecurityGuard[^>]+\/>\{!isHsa && <ExamFullscreenGuard \/>\}<\/>\}/);
});

test("matches the alpha HSA confirmation layout and countdown", () => {
  const room = readFileSync(new URL("../app/exam-room.tsx", import.meta.url), "utf8");
  const confirmation = readFileSync(new URL("../components/remixstudyedu/HsaConfirmation.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");

  assert.match(room, /if \(isHsa\) return <ExamLayout><HsaConfirmation/);
  assert.match(confirmation, /const HSA_CONFIRMATION_SECONDS = 60/);
  assert.match(confirmation, /src="\/logo_hsa\.svg" alt="HSA"/);
  assert.match(confirmation, />Phần này tự động bắt đầu sau 60 giây\.<\/p>/);
  assert.match(confirmation, /className="hsa-confirmation-mark is-h">H/);
  assert.match(confirmation, /className="hsa-confirmation-mark is-s">S/);
  assert.match(confirmation, /className="hsa-confirmation-mark is-a">A/);
  assert.match(css, /\.hsa-confirmation-page\s*\{[\s\S]*?width:\s*100%;[\s\S]*?height:\s*100%;[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?overflow-y:\s*auto;/);
});

test("centers the HSA confirmation over the shared exam background", () => {
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(css, /\.hsa-confirmation-page\s*\{[\s\S]*?align-items:\s*center;[\s\S]*?justify-content:\s*center;[\s\S]*?background:[\s\S]*?url\(["']?\/thi-tsa-bg\.jpg["']?\)\s*center\s*\/\s*cover\s*no-repeat;/);
  assert.match(css, /\.hsa-confirmation-panel\s*\{[\s\S]*?margin-inline:\s*auto;/);
});

test("caps the HSA clock to the current section deadline", () => {
  const room = readFileSync(new URL("../app/exam-room.tsx", import.meta.url), "utf8");

  assert.match(room, /const sectionRemaining = Math\.max\(0, total - elapsed\)/);
  assert.match(room, /const serverRemaining = Math\.max\(0, Math\.ceil\(\(serverDeadline - Date\.now\(\)\) \/ 1000\)\)/);
  assert.match(room, /return Math\.min\(sectionRemaining, serverRemaining\)/);
});

test("keeps HSA progress bridge callbacks stable across parent renders", () => {
  const adapter = readFileSync(new URL("../components/remixstudyedu/ExamRendererAdapter.tsx", import.meta.url), "utf8");

  assert.match(adapter, /const handleProgress = useCallback\([\s\S]*?convertAnswersForApi\(questions, progress\.answers\)[\s\S]*?\[onProgress, questions\]\)/);
  assert.match(adapter, /const handleSubmit = useCallback\([\s\S]*?convertAnswersForApi\(questions, submission\.answers\)[\s\S]*?\[onSubmit, questions\]\)/);
  assert.match(adapter, /onProgress: handleProgress,[\s\S]*?onSubmit: handleSubmit/);
});

test("does not retrigger HSA progress solely because a callback reference changed", () => {
  const renderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");

  assert.match(renderer, /const onProgressRef = useRef\(onProgress\);[\s\S]*?onProgressRef\.current = onProgress;/);
  assert.match(renderer, /onProgressRef\.current\?\.\(\{ partId:[\s\S]*?\}\);[\s\S]*?\}, \[answers, currentIndex, marked, part\?\.id, partData\?\.time, remaining, visited\]\);/);
  assert.doesNotMatch(renderer, /\[answers, currentIndex, marked, onProgress,/);
});

test("filters a tagged Part 3 bank without changing legacy untagged questions", () => {
  const questions = [
    { id: "fixed", section_id: "part-1", latex_source: "\\begin{ex}fixed\\end{ex}" },
    { id: "ly", section_id: "part-3", latex_source: "% hsa-subject: vatly\n\\begin{ex}ly\\end{ex}" },
    { id: "su", section_id: "part-3", latex_source: "% hsa-subject: lichsu\n\\begin{ex}su\\end{ex}" },
    { id: "anh", section_id: "part-3", latex_source: "% HSA_SUBJECT: tienganh\n\\begin{ex}anh\\end{ex}" },
  ];
  assert.equal(hsaSubjectCodeFromLatex(questions[2].latex_source), "lichsu");
  assert.deepEqual(
    filterHsaQuestionsForCombination(questions, getHsaCombination("Q08"), "part-3").map(question => question.id),
    ["fixed", "ly", "su"],
  );
  assert.equal(filterHsaQuestionsForCombination([{ id: "legacy", section_id: "part-3", latex_source: "\\begin{ex}legacy\\end{ex}" }], getHsaCombination("Q21"), "part-3").length, 1);
});

test("builds a subject-scoped HSA question load plan after combination selection", () => {
  const plan = buildHsaQuestionLoadPlan([
    { id: "part-1", sort_order: 0 },
    { id: "part-2", sort_order: 1 },
    { id: "part-3", sort_order: 2 },
  ], getHsaCombination("Q08"));

  assert.deepEqual(plan, {
    fixedSectionIds: ["part-1", "part-2"],
    part3SectionId: "part-3",
    subjects: ["vatly", "lichsu", "dialy"],
  });
});

test("defers the HSA Part 3 snapshot until the pending attempt starts that part", () => {
  const route = readFileSync(new URL("../app/api/exams/route.ts", import.meta.url), "utf8");
  assert.match(route, /buildHsaQuestionLoadPlan/);
  assert.match(route, /deferHsaPart3:\s*isHsa/);
  assert.match(route, /if \(isHsa && hsaPart3SelectionPending\(existing\.answers/);
  assert.match(route, /question_order:\s*\[\.\.\.existingQuestionOrder,\s*\.\.\.preparedPart3\.questionOrder\]/);
  assert.match(route, /answer_key_snapshot:\s*\{\s*\.\.\.existingAnswerKeySnapshot,\s*\.\.\.part3AnswerKeySnapshot\s*\}/);
  assert.match(route, /Promise\.all\(loadPlan\.subjects\.map/);
  assert.match(route, /\.ilike\("latex_source",\s*`%hsa%subject%\$\{subject\}%`\)/);
});

test("loads in-progress and result content from the selected-question snapshot", () => {
  const contentRoute = readFileSync(new URL("../app/api/exams/content/route.ts", import.meta.url), "utf8");
  const resultRoute = readFileSync(new URL("../app/api/exams/result-content/route.ts", import.meta.url), "utf8");
  for (const route of [contentRoute, resultRoute]) {
    assert.match(route, /questionIdsFromSnapshot/);
    assert.match(route, /\.in\("id",\s*snapshotQuestionIds\)/);
  }
});

test("ships a complete original HSA LaTeX fixture with every subject bank", () => {
  const source = readFileSync(new URL("../examples/hsa/hsa-full-set.tex", import.meta.url), "utf8");
  const parts = [...source.matchAll(/\\phan([123])/g)].map(match => ({ marker: match[1], index: match.index ?? 0 }));
  const counts = Object.fromEntries(parts.map((part, index) => {
    const end = parts[index + 1]?.index ?? source.length;
    return [part.marker, (source.slice(part.index, end).match(/\\begin\s*\{ex\}/g) ?? []).length];
  }));
  assert.deepEqual(counts, { "1": 50, "2": 50, "3": 135 });
  for (const [code, expected] of [["vatly", 17], ["hoahoc", 17], ["sinhhoc", 17], ["lichsu", 17], ["dialy", 17], ["tienganh", 50]]) {
    assert.equal((source.match(new RegExp(`^%\\s*hsa[-_\\s]?subject\\s*:\\s*${code}\\s*$`, "gmi")) ?? []).length, expected, code);
  }
});

test("the full fixture parses into usable question formats", () => {
  const source = readFileSync(new URL("../examples/hsa/hsa-full-set.tex", import.meta.url), "utf8");
  const parsed = splitLatexQuestions(source).map(parseLatexQuestion);
  assert.equal(parsed.length, 235);
  assert.equal(parsed.filter(question => question.questionType === "true_false").length, 0);
  assert.equal(parsed.filter(question => question.questionType === "text").length, 11);
  assert.ok(parsed.every(question => question.options.length >= 2 || question.questionType === "text"));
});

test("keeps HSA \\cham on the shared TSA short-answer pipeline", () => {
  const parsed = parseLatexQuestion(String.raw`\begin{ex}
Giá trị của $m$ là \cham{42}.
\loigiai{Suy ra $m=42$.}
\end{ex}`);
  const adapter = readFileSync(new URL("../components/remixstudyedu/ExamRendererAdapter.tsx", import.meta.url), "utf8");
  const renderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");
  const mathExam = readFileSync(new URL("../components/remixstudyedu/MathExam.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");

  assert.equal(parsed.questionType, "text");
  assert.equal(parsed.correctAnswer, "42");
  assert.match(parsed.prompt, /____/);
  assert.match(adapter, /case "text":\s*case "inline":\s*return \{ \.\.\.base, type: "fill_in_blank"/);
  assert.match(renderer, /QuestionAnswer[\s\S]*?from "\.\/MathExam\.jsx"/);
  assert.match(mathExam, /question\.type === "fill_in_blank"[\s\S]*?className="math-blank-input"/);
  assert.match(css, /\.hsa-question-body \.math-blank-input\s*\{[\s\S]*?border:\s*1px solid #3b82f6;[\s\S]*?background:\s*#8be78d/);
});

test("keeps the green answer box around HSA short answers in answer review", () => {
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(css, /\.hsa-answer-preview \.hsa-question-body \.math-blank-answer\.answer-green-box\s*\{[\s\S]*?border:\s*1px solid #22c55e;[\s\S]*?background:\s*#f0fdf4;[\s\S]*?color:\s*#166534/);
});

test("keeps the audited HSA numeric answer keys internally correct", () => {
  const source = readFileSync(new URL("../examples/hsa/hsa-full-set.tex", import.meta.url), "utf8");
  const math = parseBaidocQuestionEntries(extractHsaPartSource(source, 1)).map(entry => parseLatexQuestion(entry.source));
  const correctLabel = question => question.options.find(option => option.value === question.correctAnswer)?.label;
  assert.equal(correctLabel(math[11]), "$\\dfrac{10}{21}$");
  assert.equal(correctLabel(math[17]), "$(2;1;0)$");
  assert.equal(correctLabel(math[19]), "$2\\sqrt5$");
  assert.equal(math[26].correctAnswer, "23");
  assert.equal(correctLabel(math[36]), "$(2;2;4)$");
  assert.equal(correctLabel(math[49]), "$13$ giờ");

  const physics = parseBaidocQuestionEntries(extractHsaPartSource(source, 3))
    .filter(entry => hsaSubjectCodeFromLatex(entry.source) === "vatly")
    .map(entry => parseLatexQuestion(entry.source));
  assert.equal(correctLabel(physics[4]), "$3$");
});

test("the HSA fixture matches the observed question-format and passage matrix", () => {
  const source = readFileSync(new URL("../examples/hsa/hsa-full-set.tex", import.meta.url), "utf8");
  const entriesFor = part => parseBaidocQuestionEntries(extractHsaPartSource(source, part));
  const formats = entries => entries.map(entry => parseLatexQuestion(entry.source).questionType);
  const groupedRanges = entries => {
    const ranges = [];
    let start = -1;
    let passage = null;
    entries.forEach((entry, index) => {
      if (entry.passage && entry.passage === passage) return;
      if (passage) ranges.push([start + 1, index]);
      passage = entry.passage;
      start = entry.passage ? index : -1;
    });
    if (passage) ranges.push([start + 1, entries.length]);
    return ranges;
  };

  const math = entriesFor(1);
  assert.deepEqual(
    formats(math).map((format, index) => format === "text" ? index + 1 : null).filter(Boolean),
    [14, 23, 25, 27, 29, 30, 32, 34, 40, 47],
  );
  assert.deepEqual(groupedRanges(math), [[48, 50]]);

  const literature = entriesFor(2);
  assert.ok(formats(literature).every(format => format === "single"));
  assert.deepEqual(groupedRanges(literature), [[16, 20], [21, 25], [36, 40], [41, 45], [46, 50]]);

  const part3 = entriesFor(3);
  const subjects = Object.fromEntries(["vatly", "hoahoc", "sinhhoc", "lichsu", "dialy", "tienganh"].map(code => [
    code,
    part3.filter(entry => hsaSubjectCodeFromLatex(entry.source) === code),
  ]));
  assert.deepEqual(formats(subjects.vatly).map((format, index) => format === "text" ? index + 1 : null).filter(Boolean), [3]);
  for (const code of ["hoahoc", "sinhhoc", "lichsu", "dialy", "tienganh"]) {
    assert.ok(formats(subjects[code]).every(format => format === "single"), code);
  }
  assert.deepEqual(groupedRanges(subjects.vatly), [[15, 17]]);
  assert.deepEqual(groupedRanges(subjects.hoahoc), [[12, 14]]);
  assert.deepEqual(groupedRanges(subjects.sinhhoc), [[1, 3]]);
  assert.deepEqual(groupedRanges(subjects.lichsu), [[12, 14], [15, 17]]);
  assert.deepEqual(groupedRanges(subjects.dialy), [[15, 17]]);
  assert.deepEqual(groupedRanges(subjects.tienganh), [[31, 35], [36, 40], [41, 45]]);
});

test("uses subject-local question ranges in every HSA Part 3 passage instruction", () => {
  const source = extractHsaPartSource(readFileSync(new URL("../examples/hsa/hsa-full-set.tex", import.meta.url), "utf8"), 3);
  assert.doesNotMatch(source, /\{start\}|\{end\}/);
  for (const range of ["15 - 17", "12 - 14", "1 - 3", "31 to 35", "36 to 40", "41 to 45"]) {
    assert.match(source, new RegExp(range));
  }
});

test("splits and replaces one HSA Part 3 subject without changing the combined source", () => {
  const source = extractHsaPartSource(readFileSync(new URL("../examples/hsa/hsa-full-set.tex", import.meta.url), "utf8"), 3);
  const banks = splitHsaPart3SubjectBanks(source);
  assert.deepEqual(banks.map(bank => [bank.code, bank.questionCount]), [
    ["vatly", 17],
    ["hoahoc", 17],
    ["sinhhoc", 17],
    ["lichsu", 17],
    ["dialy", 17],
    ["tienganh", 50],
  ]);
  assert.ok(banks.every(bank => splitLatexQuestions(bank.source).every(question => hsaSubjectCodeFromLatex(question) === bank.code)));

  const physics = banks[0];
  const marker = "% ghi chú kiểm thử tab Vật lí";
  const replaced = replaceHsaPart3SubjectBank(source, "vatly", `${physics.source}\n${marker}\n`);
  assert.match(replaced, new RegExp(marker));
  assert.equal(splitHsaPart3SubjectBanks(replaced).find(bank => bank.code === "hoahoc")?.source, banks[1].source);
});

test("renders subject-scoped LaTeX tabs while keeping the HSA preview source combined", () => {
  const workspace = readFileSync(new URL("../app/admin-exam-workspace.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/admin-exam-workspace.css", import.meta.url), "utf8");
  assert.match(workspace, /className="hsa-subject-editor-tabs"/);
  assert.match(workspace, /role="tablist"\s+aria-label="Chọn môn soạn HSA Phần 3"/);
  assert.match(workspace, /replaceHsaPart3SubjectBank\(source,\s*activeHsaSubjectBank\.code/);
  assert.match(workspace, /<textarea[\s\S]*?value=\{editorSource\}/);
  assert.match(css, /\.hsa-subject-editor-tabs\s*\{/);
  assert.match(css, /\.hsa-subject-editor-tablist\s*\{/);
});

test("expands the HSA authoring sidebar into separately editable subject entries", () => {
  const workspace = readFileSync(new URL("../app/admin-exam-workspace.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../app/admin-exam-workspace.css", import.meta.url), "utf8");
  assert.match(workspace, /const hsaAuthoringEntries\s*=/);
  assert.match(workspace, /HSA_PART3_SUBJECTS\.map\(subject\s*=>/);
  assert.match(workspace, /aria-label=\{isHsa \? "Cấu trúc soạn HSA theo từng môn"/);
  assert.match(workspace, /hsa-authoring-subject-entry/);
  assert.match(workspace, /hsaSubjectCodeFromLatex\(question\.latex_source\)/);
  assert.match(workspace, /\?subject=\$\{subject\.code\}/);
  assert.match(workspace, /new URLSearchParams\(window\.location\.search\)\.get\("subject"\)/);
  assert.match(css, /\.hsa-authoring-subject-entry\s*\{/);
  assert.doesNotMatch(workspace, /className="hsa-part3-subject-workspace"/);
});

test("scopes HSA Part 3 passage detection to the active subject editor", () => {
  const workspace = readFileSync(new URL("../app/admin-exam-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /const editorParsedBaidocs = useMemo<ParsedBaidoc\[\]>\(\(\) => editorHasBaidocSyntax \? parseBaidocDocument\(editorSource\) : \[\], \[editorHasBaidocSyntax, editorSource\]\);/);
  assert.match(workspace, /const editorDraftQuestionCount = activeHsaSubjectBank\?\.questionCount \?\? draftQuestionCount;/);
  assert.match(workspace, /editorParsedBaidocs\.length \? `\$\{editorParsedBaidocs\.length\} ngữ liệu · \$\{editorDraftQuestionCount\} câu hỏi`/);
});

test("the full HSA fixture includes review solutions across every part and subject bank", () => {
  const source = readFileSync(new URL("../examples/hsa/hsa-full-set.tex", import.meta.url), "utf8");
  const blocks = [...source.matchAll(/\\begin\s*\{ex\}([\s\S]*?)\\end\s*\{ex\}/g)].map(match => match[1]);
  assert.ok(blocks.filter(block => /\\loigiai\s*\{/.test(block)).length >= 10);
  const part2Index = source.indexOf("\\phan2");
  const part3Index = source.indexOf("\\phan3");
  assert.match(source.slice(0, part2Index), /\\loigiai\s*\{/);
  assert.match(source.slice(part2Index, part3Index), /\\loigiai\s*\{/);
  for (const code of ["vatly", "hoahoc", "sinhhoc", "lichsu", "dialy", "tienganh"]) {
    const subjectBlocks = blocks.filter(block => new RegExp(`^\\s*%\\s*hsa-subject:\\s*${code}\\s*$`, "mi").test(block));
    assert.ok(subjectBlocks.some(block => /\\loigiai\s*\{/.test(block)), code);
  }
});

test("selects the matching HSA fixture block for the LaTeX section editor", () => {
  const source = readFileSync(new URL("../examples/hsa/hsa-full-set.tex", import.meta.url), "utf8");
  const part = hsaPartForSectionTitle("Khoa học hoặc Tiếng Anh (tự chọn)");
  assert.equal(part, 3);
  assert.equal(hsaPartForSectionTitle("Khoa hoc hoac Tieng Anh (tu chon)"), 3);
  const sectionSource = extractHsaPartSource(source, part);
  assert.match(sectionSource, /^\\phan3/m);
  assert.equal((sectionSource.match(/\\begin\s*\{ex\}/g) ?? []).length, 135);
  assert.equal(hsaPartForSectionTitle("Phần không phải HSA"), null);
});

test("keeps HSA Part 3 as standalone questions while preserving TSA science passages", () => {
  assert.equal(isPassageSection("Khoa học hoặc Tiếng Anh (tự chọn)", "HSA"), false);
  assert.equal(isPassageSection("Văn học - Ngôn ngữ", "HSA"), true);
  assert.equal(isPassageSection("Tư duy Khoa học", "TSA"), true);
});

test("routes the full HSA author preview through the HSA exam renderer", () => {
  const learnerPreview = readFileSync(new URL("../components/remixstudyedu/LearnerExamPreview.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../app/admin-exam-workspace.tsx", import.meta.url), "utf8");
  assert.match(learnerPreview, /import HsaExamRenderer from "\.\/HsaExamRenderer\.jsx"/);
  assert.match(learnerPreview, /examType = "TSA"/);
  assert.match(learnerPreview, /examType\.trim\(\)\.toUpperCase\(\) === "HSA"/);
  assert.match(workspace, /examType=\{draft\.examType\}/);
});

test("isolates the responsive two-row header to HSA author preview", () => {
  const renderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../app/admin-exam-workspace.tsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(renderer, /previewMode = false/);
  assert.match(renderer, /hsa-preview-mode/);
  assert.match(workspace, /hsaLayout=\{isHsaPreview\}/);
  assert.match(workspace, /hsa-preview-header-extras/);
  assert.match(css, /\.hsa-exam-page\.hsa-preview-mode/);
});

test("matches the observed HSA test-room shell geometry", () => {
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(css, /grid-template-columns:\s*minmax\(0,\s*1fr\)\s+120px/);
  assert.match(css, /grid-template-rows:\s*66px\s+35px\s+minmax\(0,\s*1fr\)/);
  assert.match(css, /\.hsa-exam-header\s*{[\s\S]*?grid-column:\s*1;[\s\S]*?background:\s*#f3f4f6/);
  assert.match(css, /\.hsa-exam-brand img\s*{[\s\S]*?width:\s*auto;[\s\S]*?height:\s*40px/);
  assert.match(css, /\.hsa-question-nav button\s*{[\s\S]*?border-radius:\s*9999px;[\s\S]*?background:\s*#6b7280/);
  assert.match(css, /\.hsa-question-content\s*{[\s\S]*?width:\s*100%;[\s\S]*?max-width:\s*none/);
  assert.match(css, /\.hsa-answer-panel\s*{[\s\S]*?grid-row:\s*1\s*\/\s*4/);
});

test("places the HSA end action after the question content", () => {
  const renderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");
  assert.match(renderer, /className="hsa-question-footer"/);
  assert.match(renderer, />KẾT THÚC<\/button>/);
  assert.doesNotMatch(renderer, /className="hsa-submit-button"/);
});

test("matches the observed HSA submit confirmation controls", () => {
  const renderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(renderer, /className="hsa-submit-close"[\s\S]*?aria-label="Đóng xác nhận nộp bài"/);
  assert.match(css, /\.hsa-submit-count\s*{[\s\S]*?background:\s*#ffb800/);
  assert.match(css, /\.hsa-submit-actions button:first-child\s*{[\s\S]*?background:\s*#21438d/);
  assert.match(css, /\.hsa-submit-actions button\.primary\s*{[\s\S]*?background:\s*#dd2e2e/);
});

test("keeps HSA answer preview on the HSA renderer", () => {
  const learnerPreview = readFileSync(new URL("../components/remixstudyedu/LearnerExamPreview.tsx", import.meta.url), "utf8");
  const workspace = readFileSync(new URL("../app/admin-exam-workspace.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(workspace, /const useLearnerRenderer/);
  assert.match(workspace, /<LearnerExamPreview[\s\S]*?mode=\{mode\}/);
  assert.match(learnerPreview, /answerPreview=\{mode\s*===\s*"answer"\}/);
});

test("uses the shared HSA answer renderer for released result review", () => {
  const examRoom = readFileSync(new URL("../app/exam-room.tsx", import.meta.url), "utf8");
  assert.match(examRoom, /isHsaResult\s*\?\s*<LearnerExamPreview[\s\S]*?mode="answer"[\s\S]*?examType="HSA"[\s\S]*?:\s*<RemixStudyEduReviewPreview/);
});

test("keeps candidate correctness in the shared HSA result renderer", () => {
  const examRoom = readFileSync(new URL("../app/exam-room.tsx", import.meta.url), "utf8");
  const learnerPreview = readFileSync(new URL("../components/remixstudyedu/LearnerExamPreview.tsx", import.meta.url), "utf8");
  const renderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");
  assert.match(examRoom, /const hsaReviewStatuses\s*=\s*reviewQuestions\.map\(question\s*=>/);
  assert.match(examRoom, /reviewStatuses=\{hsaReviewStatuses\}/);
  assert.match(learnerPreview, /reviewStatuses=\{mode\s*===\s*"answer"\s*\?\s*reviewStatuses\s*:\s*undefined\}/);
  assert.match(renderer, /reviewStatuses\s*=\s*\[\]/);
  assert.match(renderer, /answerPreview\s*\?\s*` status-\$\{status\}`\s*:\s*""/);
  assert.match(renderer, /const status\s*=\s*answerPreview\s*\?\s*reviewStatusFor\(question,\s*index,\s*answers,\s*reviewStatuses\)/);
});

test("filters only the HSA answer preview by combination while exam preview stays combined", () => {
  const workspace = readFileSync(new URL("../app/admin-exam-workspace.tsx", import.meta.url), "utf8");
  assert.match(workspace, /const \[hsaAnswerCombinationCode,\s*setHsaAnswerCombinationCode\]/);
  assert.match(workspace, /isHsaPreview\s*&&\s*mode\s*===\s*"answer"\s*&&\s*activeIndex\s*===\s*2/);
  assert.match(workspace, /hsaSubjectCodeFromLatex\(item\.parsed\.source\)/);
  assert.match(workspace, /previewItems=\{previewQuestions\}/);
  assert.match(workspace, /aria-label="Tổ hợp đáp án HSA"/);
});

test("gives every HSA answer-review question a solution control", () => {
  const learnerPreview = readFileSync(new URL("../components/remixstudyedu/LearnerExamPreview.tsx", import.meta.url), "utf8");
  assert.match(learnerPreview, /const hsaSolutionItems\s*=\s*solutionItems\.map/);
  assert.match(learnerPreview, /Đáp án đúng:/);
  assert.match(learnerPreview, /solutions=\{isHsaPreview\s*&&\s*mode\s*===\s*"answer"\s*\?\s*hsaSolutionItems\s*:\s*solutionItems\}/);
});

test("keeps HSA answer review on the test-taking geometry", () => {
  const renderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(css, /\.hsa-exam-page\s*\{[\s\S]*?grid-template-columns:\s*minmax\(0,\s*1fr\)\s+120px;[\s\S]*?grid-template-rows:\s*66px\s+35px\s+minmax\(0,\s*1fr\)/);
  assert.doesNotMatch(css, /\.hsa-exam-page\.hsa-answer-preview\s*\{[^}]*grid-template-(?:columns|rows)/);
  assert.doesNotMatch(css, /\.hsa-answer-preview \.hsa-question\s*\{[^}]*padding:\s*24px/);
  assert.doesNotMatch(css, /\.hsa-answer-preview \.hsa-question-body \.math-choice-option\s*\{[^}]*min-height:\s*70px/);
  assert.match(css, /\.hsa-exam-page \.math-choice-option::before/);
  assert.match(renderer, /<div className="hsa-exam-title"><strong>/);
  assert.doesNotMatch(renderer, /HsaReviewCandidate/);
  assert.doesNotMatch(renderer, /reviewPanelVisible/);
  assert.match(renderer, /<aside className="hsa-answer-panel"/);
  assert.doesNotMatch(renderer, /\{!answerPreview\s*&&\s*<aside className="hsa-answer-panel"/);
  assert.match(renderer, /hideEmptyReadOnlyBlanks=\{answerPreview\}/);
  assert.match(css, /\.hsa-review-solution\s*>\s*button\s*\{[\s\S]*?background:\s*#078d35/);
});

test("does not duplicate the legacy solution drawer beneath HSA review", () => {
  const learnerPreview = readFileSync(new URL("../components/remixstudyedu/LearnerExamPreview.tsx", import.meta.url), "utf8");
  assert.doesNotMatch(learnerPreview, /learner-preview-solution/);
});

test("maps the supplied HSA, TSA, and THPTQG logos to their exam renderers", () => {
  const renderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");
  const learnerPreview = readFileSync(new URL("../components/remixstudyedu/LearnerExamPreview.tsx", import.meta.url), "utf8");
  const adapter = readFileSync(new URL("../components/remixstudyedu/ExamRendererAdapter.tsx", import.meta.url), "utf8");
  const tsaRenderer = readFileSync(new URL("../components/remixstudyedu/MathExam.jsx", import.meta.url), "utf8");
  const thptqgRenderer = readFileSync(new URL("../components/thptqg/ThptqgExamRenderer.tsx", import.meta.url), "utf8");
  const hsaLogo = readFileSync(new URL("../public/logo_hsa.svg", import.meta.url), "utf8");
  const tsaLogo = readFileSync(new URL("../public/logo_tsa.svg", import.meta.url), "utf8");
  const thptqgLogo = readFileSync(new URL("../public/logo_thptqg.svg", import.meta.url), "utf8");
  assert.match(renderer, /logoSrc\s*=\s*"\/logo_hsa\.svg"/);
  assert.match(renderer, /<img src=\{logoSrc\} alt="HSA"/);
  assert.match(learnerPreview, /isHsaPreview\s*\?\s*"\/logo_hsa\.svg"/);
  assert.match(adapter, /logoSrc="\/logo_hsa\.svg"/);
  assert.match(tsaRenderer, /logoSrc\s*=\s*"\/logo_tsa\.svg"/);
  assert.match(tsaRenderer, /<img src=\{logoSrc\} alt="TSA"/);
  assert.match(thptqgRenderer, /src="\/logo_thptqg\.svg" alt="THPTQG"/);
  for (const logo of [hsaLogo, tsaLogo, thptqgLogo]) {
    assert.match(logo, /width="2079"/);
    assert.match(logo, /height="780"/);
    assert.match(logo, /viewBox="0 0 1559\.25 585\.000005"/);
  }
  assert.match(hsaLogo, /fill="#087a22"/);
  assert.match(tsaLogo, /fill="#ff3131"/);
  assert.match(thptqgLogo, /fill="#0a328c"/);
});

test("keeps the established HSA solution-toggle pattern", () => {
  const renderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");
  const hsaCss = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(renderer, /className="hsa-review-solution"[\s\S]*?<span>Lời giải<\/span><svg[\s\S]*?<path d=\{solutionOpen\s*\?/);
  assert.match(hsaCss, /\.hsa-review-solution\s*>\s*button\s*>\s*svg\s*\{[\s\S]*?stroke:\s*currentColor;[\s\S]*?stroke-width:\s*2/);
  assert.doesNotMatch(renderer, /<span aria-hidden="true">⌃<\/span>/);
});

test("lets HSA author preview inspect the submit dialog without unlocking other read-only runners", () => {
  const renderer = readFileSync(new URL("../components/remixstudyedu/HsaExamRenderer.jsx", import.meta.url), "utf8");
  assert.match(renderer, /const canPreviewSubmit\s*=\s*!readOnly\s*\|\|\s*previewMode/);
  assert.match(renderer, /if\s*\(submitting\s*\|\|\s*!canPreviewSubmit\)\s*return/);
  assert.match(renderer, /if\s*\(canPreviewSubmit\)\s*setShowSubmit\("manual"\)/);
});

test("keeps the HSA preview dock clear of the end-of-test action", () => {
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(css, /\.hsa-exam-page\.hsa-preview-mode \.hsa-question-footer\s*\{[\s\S]*?min-height:\s*220px;[\s\S]*?padding-bottom:\s*132px/);
});

test("keeps the HSA preview dock above the answer-review stacking contexts", () => {
  const css = readFileSync(new URL("../components/remixstudyedu/hsa-exam.css", import.meta.url), "utf8");
  assert.match(css, /\.hsa-exam-page\.hsa-preview-mode \.hsa-preview-header-extras\s*\{[\s\S]*?position:\s*fixed;[\s\S]*?z-index:\s*210/);
  assert.match(css, /\.hsa-review-watermarks\s*\{[\s\S]*?z-index:\s*5/);
});

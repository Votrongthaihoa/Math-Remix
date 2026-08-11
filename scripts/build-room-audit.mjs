import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, statSync, writeFileSync } from "node:fs";
import { extname, join, resolve } from "node:path";
import { analyzeCaptures, CAPTURE_IDS } from "./analyze-room-captures.mjs";

const referenceRoot = resolve(process.argv[2] || "C:/Users/LENOVO/Desktop/Trial/Test/room");
const auditRoot = resolve(process.argv[3] || "audit");
const attachmentRoot = "C:/Users/LENOVO/.codex/attachments";
const capturePaths = CAPTURE_IDS.map(id => join(attachmentRoot, id, "pasted-text.txt"));
mkdirSync(auditRoot, { recursive: true });

const referenceNames = ["index-IpwJzEAT.css", "index-rqS3kNQ4.js", "output.css"];
const source = Object.fromEntries(referenceNames.map(name => [name, readFileSync(join(referenceRoot, name), "utf8")]));
const captures = analyzeCaptures(capturePaths);
const sha256 = value => createHash("sha256").update(value).digest("hex");
const writeJson = (name, value) => writeFileSync(join(auditRoot, name), `${JSON.stringify(value, null, 2)}\n`, "utf8");
const writeText = (name, value) => writeFileSync(join(auditRoot, name), `${value.trim()}\n`, "utf8");
const escapeHtml = value => String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");

const uniqueCaptures = captures.filter(capture => !capture.duplicateOf);
const captureSummary = captures.map(capture => ({
  captureId: capture.captureId,
  bytes: capture.bytes,
  sourceSha256: capture.sourceSha256,
  duplicateOf: capture.duplicateOf,
  classification: capture.classification,
  viewport: capture.viewport,
  controls: {
    buttons: capture.structure.buttonCount,
    inputs: capture.structure.inputCount,
    inputTypes: capture.structure.inputTypes,
    images: capture.structure.imageCount,
    tables: capture.structure.tableCount,
  },
  safeLabels: capture.safeLabelHits,
  sanitization: {
    scriptsRemoved: capture.scriptsRemoved,
    extensionReferencesRemoved: capture.extensionArtifactsRemoved,
    arbitraryTextStored: false,
    formValuesStored: false,
  },
}));

const captureCounts = uniqueCaptures.reduce((map, capture) => {
  for (const state of capture.classification) map[state] = (map[state] ?? 0) + 1;
  return map;
}, {});

const domTree = {
  evidenceBoundary: {
    directChromeObservation: "Package/list semantic DOM was observed before the site protection redirected the page.",
    userSuppliedHtml: "16 serialized HTML captures were parsed; one is byte-for-byte duplicate, leaving 15 unique captures.",
    sanitization: "Extension scripts, all script bodies, arbitrary text, account values, form values, UUID-like application values and response/session material are not reproduced.",
    liveUnavailable: "A clean live outerHTML/getComputedStyle/network-body capture was unavailable after protection activated; no bypass was attempted.",
  },
  observedTrees: [
    {
      state: "list/search",
      source: "direct semantic DOM observation",
      tree: {
        tag: "document",
        children: [
          { tag: "aside", role: "navigation", children: ["Logo", "Trang chủ", "Đánh giá tư duy", "Đánh giá năng lực", "Tra cứu sách", "Lịch sử làm bài", "Tài khoản", "Câu hỏi thường gặp", "Thoát"] },
          { tag: "header", role: "banner", children: ["menu controls", "[REDACTED_USER]"] },
          { tag: "main", children: ["Quay lại danh sách gói đề", "Gói đề: Phòng Luyện Miễn Phí", "Tìm kiếm đề thi...", "Đề Số 01", "Đang mở", "3 Phần", "Miễn phí", "23/6/2026", "Xem lịch sử", "Vào làm"] },
        ],
      },
    },
    {
      state: "confirmation",
      source: "sanitized user-supplied serialized DOM",
      tree: { tag: "main", children: ["Xác nhận thông tin dự thi", "Thời gian làm bài", { tag: "button", text: "Bắt đầu thi" }] },
    },
    {
      state: "exam-room",
      source: "sanitized user-supplied serialized DOM + reference bundle",
      tree: {
        tag: "main",
        children: [
          { tag: "section", role: "question content", children: ["question prompt", "interactive answer control", "previous/next controls"] },
          { tag: "aside", role: "candidate and navigation", children: ["Thông tin thí sinh", "Thời gian còn lại", "question index buttons", "Nộp bài"] },
        ],
      },
      capturedQuestionStates: captureCounts,
    },
    {
      state: "completion/recommendations",
      source: "sanitized user-supplied serialized DOM",
      tree: { tag: "main", children: ["completion state", "recommended practice cards", { tag: "button", text: "Làm ngay" }, { tag: "link", text: "Về trang luyện đề" }] },
    },
  ],
  captures: captureSummary,
};

const elements = [
  { region: "page heading", observedText: "Gói đề: Phòng Luyện Miễn Phí", selectorEvidence: "PartListPage h1", className: "text-lg lg:text-xl font-semibold text-gray-900", source: "bundle + directly observed DOM" },
  { region: "search", observedText: "Tìm kiếm đề thi...", selectorEvidence: "PartListPage input[type='text']", className: "w-full pl-10 pr-4 py-2 text-sm border border-gray-300 rounded-lg focus:ring-2 focus:ring-[#902d2d] focus:border-[#902d2d] outline-none", source: "bundle + directly observed placeholder" },
  { region: "part card", observedText: "Đề Số 01", selectorEvidence: "PartListRow root", className: "bg-white rounded-xl p-5 shadow-sm border border-gray-100 flex flex-col md:flex-row items-center gap-4 hover:shadow-lg transition-all duration-300 group", source: "bundle + directly observed DOM" },
  { region: "start button", observedText: "Vào làm", selectorEvidence: "PartListRow final action", className: "text-white text-sm font-bold px-6 py-2.5 rounded-lg shadow-sm transition-all hover:-translate-y-0.5 bg-[#cc3232]", source: "bundle + directly observed DOM" },
  { region: "confirmation submit", observedText: "Bắt đầu thi", selectorEvidence: "confirmation capture button", className: "w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded transition-colors mb-4", source: "user-supplied serialized DOM" },
  { region: "exam sidebar", observedText: "Thông tin thí sinh", selectorEvidence: "ExamSidebar", className: "bg-white flex flex-col h-screen; inner p-4 lg:py-6 lg:px-[15px] md:w-[480px]", source: "bundle + repeated serialized DOM" },
  { region: "single-choice option", observedText: "[REDACTED_OPTION_TEXT]", selectorEvidence: "SingleChoiceQuestion option marker", className: "w-8 h-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all bg-[#E8E8E8]", source: "user-supplied serialized DOM" },
  { region: "true/false matrix control", observedText: "Đúng / Sai", selectorEvidence: "TrueFalseQuestion row control", className: "w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all bg-[#E8E8E8]", source: "user-supplied serialized DOM" },
  { region: "fill-in-blank input", observedText: "[REDACTED_FORM_VALUE]", selectorEvidence: "FillInBlankQuestion input[type='text']", className: "inline mx-1 px-1 py-0 border-b-2 border-blue-400 focus:border-blue-600 focus:outline-none text-center font-medium", source: "user-supplied serialized DOM" },
  { region: "drag/drop item", observedText: "[REDACTED_ITEM_TEXT]", selectorEvidence: "DragAndDropQuestion [draggable='true']", className: "px-3 py-1 text-center rounded text-[#23282c] text-sm font-medium cursor-move transition-all select-none bg-gray-100", source: "user-supplied serialized DOM" },
  { region: "submit button", observedText: "Nộp bài", selectorEvidence: "ExamSidebar submit trigger", className: "bg-[#CE1628] hover:bg-[#ce5964] text-white h-[44px] px-3 lg:px-4 rounded-md", source: "bundle + repeated serialized DOM" },
  { region: "submit modal", observedText: "Làm bài tiếp / Nộp bài thi", selectorEvidence: "SubmitModal", className: "fixed inset-0 bg-black bg-opacity-50 z-50; panel max-w-md bg-white rounded-lg", source: "reference bundle; modal not present in supplied captures" },
];

const computedStyles = {
  status: "Derived from exact utility classes in the reference bundle and supplied serialized DOM. These are not represented as live getComputedStyle output.",
  breakpoints: { sm: "640px", md: "768px", lg: "1024px", xl: "1280px", "2xl": "1536px" },
  viewportEvidence: "Serialized DOM contains responsive utility classes but no viewport dimensions; desktop/tablet/mobile capture assignment would be speculative.",
  regions: {
    pageHeading: { fontSize: "18px; 20px at >=1024", lineHeight: "28px", fontWeight: 600, color: "rgb(17,24,39)" },
    partCard: { display: "flex", flexDirection: "column; row at >=768", padding: "20px", gap: "16px", background: "#fff", border: "1px solid rgb(243,244,246)", borderRadius: "12px", transition: "all 300ms" },
    examSidebar: { width: "480px at >=768", height: "100vh", background: "#fff", padding: "16px; 24px 15px at >=1024" },
    singleChoiceMarker: { width: "32px", height: "32px", borderWidth: "2px", borderRadius: "9999px", unselectedBackground: "#E8E8E8", selectedBackground: "#1980FF (bundle-proven; not present in supplied captures)" },
    trueFalseMarker: { width: "28px; 32px at >=640", height: "28px; 32px at >=640", borderRadius: "9999px", unselectedBackground: "#E8E8E8" },
    fillBlank: { display: "inline", marginInline: "4px", paddingInline: "4px", borderBottom: "2px solid rgb(96,165,250)", textAlign: "center", fontWeight: 500 },
    dragItem: { padding: "4px 12px", borderRadius: "4px", color: "#23282c", fontSize: "14px", cursor: "move", background: "rgb(243,244,246)" },
    submitButton: { height: "44px", background: "#CE1628", hoverBackground: "#ce5964", borderRadius: "6px", color: "#fff" },
    submitOverlay: { position: "fixed", inset: 0, zIndex: 50, background: "rgba(0,0,0,.5)", panelMaxWidth: "448px" },
  },
  pseudoElements: { status: "No route-specific ::before/::after rule was verified; only global/vendor pseudo selectors were found." },
};

const stylesheetRows = [
  { urlOrFile: "index-IpwJzEAT.css", size: statSync(join(referenceRoot, "index-IpwJzEAT.css")).size, sha256: sha256(source["index-IpwJzEAT.css"]), kind: "Tailwind/vendor/KaTeX bundle", classification: "same-application reference variant; exact network match not proven" },
  { urlOrFile: "index-9eYssA5U.css", kind: "stylesheet referenced by saved HTML", classification: "network-era filename only; file absent locally" },
  { urlOrFile: "output.css", size: statSync(join(referenceRoot, "output.css")).size, sha256: sha256(source["output.css"]), kind: "HTML document saved with .css extension", classification: "reference document, not a stylesheet" },
];

const scriptRows = [
  { urlOrFile: "index-rqS3kNQ4.js", size: statSync(join(referenceRoot, "index-rqS3kNQ4.js")).size, sha256: sha256(source["index-rqS3kNQ4.js"]), framework: "React + React Router + Axios-style apiClient + KaTeX + Tailwind utilities", classification: "same-application reference variant; exact network match not proven", sourceMap: null },
  { urlOrFile: "/assets/index-CvGeGVj1.js", kind: "module script referenced by saved HTML", classification: "different hashed build; absent locally", sourceMap: null },
  { urlOrFile: "/disable-devtool.js", kind: "site protection script referenced by saved HTML", classification: "observed protection; file absent locally" },
  { urlOrFile: "chrome-extension://…", kind: "browser-extension injection in supplied captures", classification: "removed from every audit artifact" },
];

const redactAssetIdentifiers = value => value.replace(/\b[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi, "[REDACTED_ASSET_ID]");
const assetMatches = [...new Set((source["index-rqS3kNQ4.js"].match(/\/(?:assets\/)?[A-Za-z0-9_./+-]+\.(?:png|jpg|jpeg|svg|webp|woff2?|ttf)/g) ?? []).map(redactAssetIdentifiers))].sort();
const cssAssets = [...new Set((source["index-IpwJzEAT.css"].match(/\/assets\/[A-Za-z0-9_./+-]+\.(?:woff2?|ttf|png|jpg|svg|webp)/g) ?? []).map(redactAssetIdentifiers))].sort();

const networkRequests = {
  captureStatus: "unavailable_after_site_protection",
  observedRedirect: "https://theajack.github.io/disable-devtool/404.html?h=hethonglab.com",
  excludedCapture: "All requests from the accidental localhost reload were discarded.",
  sensitiveHeadersStored: false,
  endpointsFromReferenceBundle: [
    { method: "GET", endpoint: "/bags/public", trigger: "PartListPage list state; page_size=6, type=tsa, optional search" },
    { method: "GET", endpoint: "/bags/:id", trigger: "Select a package; response supplies metadata and parts" },
    { method: "GET", endpoint: "/parts", trigger: "Unbagged part listing/filtering" },
    { method: "GET", endpoint: "/parts/tags", trigger: "PartListPage mount" },
    { method: "POST", endpoint: "/parts/:id/start", trigger: "Vào làm; success navigates to /phan-thi-tsa/:attempt.id" },
    { method: "GET", endpoint: "/attempts/parts/:id/history", trigger: "Xem lịch sử" },
    { method: "POST", endpoint: "/attempts/:id/submit", trigger: "Confirm submit" },
    { method: "POST", endpoint: "/attempts/:id/next", trigger: "Move to next part" },
  ],
};

const networkResponses = {
  redactionPolicy: "No cookie, Authorization value, credential, session identifier, password, personal account text or form answer is stored.",
  actualBodiesStored: false,
  reason: "Attaching developer tooling activated the site's protection redirect before a clean origin response capture completed; no bypass was attempted.",
  schemasInferredFromReferenceBundle: {
    publicBags: { status: "boolean", data: { bags: "array", total: "number", total_pages: "number" } },
    bagDetail: { status: "boolean", data: { id: "string", name: "string", description: "string|null", metadata: "object|null", parts: "array" } },
    startPart: { status: "boolean", attempt: { id: "[REDACTED_SESSION_IDENTIFIER]" }, message: "string?" },
  },
};

const sourceMaps = {
  found: [],
  checks: [
    { file: "index-rqS3kNQ4.js", sourceMappingURL: false },
    { file: "index-IpwJzEAT.css", sourceMappingURL: false },
    { file: "output.css (HTML)", referencedModule: "/assets/index-CvGeGVj1.js", sourceMapReference: false },
  ],
};

const localFiles = referenceNames.map(name => ({
  relativePath: name,
  extension: extname(name),
  size: statSync(join(referenceRoot, name)).size,
  sha256: sha256(source[name]),
  classification: name === "output.css" ? "reference document (HTML mislabeled as CSS)" : "same-application reference variant; exact current-network hash unavailable",
  modified: false,
}));

const stateChanges = [
  { action: "type search", source: "bundle", state: "debounced after 500ms", request: "GET /bags/public with search in bag mode", dom: "cards/rows and result count update" },
  { action: "select bag", source: "bundle", state: "bag -> parts, loading", request: "GET /bags/:id", dom: "package heading and part rows replace the bag grid" },
  { action: "Vào làm", source: "bundle + observed list DOM", state: "start request", request: "POST /parts/:id/start", dom: "navigate to /phan-thi-tsa/:attempt.id" },
  { action: "confirm candidate information", source: "supplied confirmation DOM + bundle", state: "confirmation -> question interface", request: "not captured", dom: "Bắt đầu thi action is replaced by exam content/sidebar" },
  { action: "select single answer", source: "bundle + supplied unselected DOM", state: "answers[questionId]=[optionIndex]", request: "not proven at selection time", dom: "marker changes from #E8E8E8 to bundle-defined #1980FF" },
  { action: "enter blank", source: "supplied DOM + bundle", state: "text answer changes", request: "not proven at input time", dom: "inline underlined input value changes; values are redacted in audit" },
  { action: "drag answer", source: "supplied DOM + bundle", state: "ordered/matched answer changes", request: "not proven at drag time", dom: "draggable gray item moves between/order within drop areas" },
  { action: "select true/false row", source: "supplied DOM + bundle", state: "row answer changes", request: "not proven at selection time", dom: "28px/32px circular control changes selection state" },
  { action: "open submit modal", source: "bundle", state: "local isOpen=true", request: "none", dom: "fixed black 50% overlay and confirmation panel mount" },
  { action: "confirm submit", source: "bundle", state: "modal closes then finish handler", request: "POST /attempts/:id/submit", dom: "result or next-part state" },
  { action: "responsive layout", source: "bundle + serialized responsive classes", state: "viewport-dependent", request: "none", dom: "base/sm/md/lg utilities alter dimensions and sidebar visibility; capture viewport itself is unknown" },
];

const captureRowsHtml = captureSummary.map(capture => `<tr><td>${escapeHtml(capture.captureId)}</td><td>${escapeHtml(capture.classification.join(", "))}</td><td>${capture.controls.buttons}</td><td>${capture.controls.inputs}</td><td>${escapeHtml(capture.duplicateOf ?? "—")}</td></tr>`).join("\n");
writeText("rendered-dom.html", `
<!doctype html>
<html lang="vi">
<head><meta charset="utf-8"><title>Sanitized Hethonglab TSA DOM audit</title></head>
<body>
  <h1>Sanitized composite DOM evidence</h1>
  <p>This is a privacy-safe semantic reconstruction from direct observation, the supplied serialized DOM captures and verified bundle classes. It is not represented as a live post-protection outerHTML dump.</p>
  <main>
    <section data-state="list-search"><h2>Gói đề: Phòng Luyện Miễn Phí</h2><input type="search" placeholder="Tìm kiếm đề thi..." value="[REDACTED]"><article><h3>Đề Số 01</h3><p>Đang mở · 3 Phần · Miễn phí · 23/6/2026</p><button>Xem lịch sử</button><button>Vào làm</button></article></section>
    <section data-state="confirmation"><h2>Xác nhận thông tin dự thi</h2><p>Thời gian làm bài</p><button class="w-full bg-red-600 hover:bg-red-700 text-white font-medium py-3 rounded transition-colors mb-4">Bắt đầu thi</button></section>
    <section data-state="exam-room"><article data-region="question"><p>[REDACTED_QUESTION_TEXT]</p><div data-question-type="single-choice" class="w-8 h-8 rounded-full border-2 cursor-pointer flex items-center justify-center transition-all bg-[#E8E8E8]">[REDACTED]</div><input data-question-type="fill-blank" class="inline mx-1 px-1 py-0 border-b-2 border-blue-400 focus:border-blue-600 focus:outline-none text-center font-medium" value="[REDACTED_FORM_VALUE]"><div data-question-type="drag-drop" draggable="true" class="px-3 py-1 text-center rounded text-[#23282c] text-sm font-medium cursor-move transition-all select-none bg-gray-100">[REDACTED_ITEM_TEXT]</div><button data-question-type="true-false" class="w-7 h-7 sm:w-8 sm:h-8 rounded-full flex items-center justify-center transition-all bg-[#E8E8E8]">[REDACTED]</button></article><aside><h2>Thông tin thí sinh</h2><p>Thời gian còn lại</p><nav>[REDACTED_QUESTION_INDEXES]</nav><button>Nộp bài</button></aside></section>
    <section data-state="completion"><h2>Kết thúc</h2><article><button>Làm ngay</button></article><a>Về trang luyện đề</a></section>
  </main>
  <h2>Capture classification</h2>
  <table><thead><tr><th>Capture</th><th>State</th><th>Buttons</th><th>Inputs</th><th>Duplicate of</th></tr></thead><tbody>${captureRowsHtml}</tbody></table>
</body>
</html>`);

writeJson("dom-tree.json", domTree);
writeJson("elements.json", elements);
writeJson("computed-styles.json", computedStyles);
writeJson("stylesheets.json", stylesheetRows);
writeJson("scripts.json", scriptRows);
writeJson("assets.json", { assets: [...new Set([...assetMatches, ...cssAssets])], note: "URLs extracted from the local reference variant; binary assets were not copied." });
writeJson("network-requests.json", networkRequests);
writeJson("network-responses.json", networkResponses);
writeJson("source-maps.json", sourceMaps);
writeJson("local-reference-files.json", localFiles);
writeJson("ui-state-changes.json", stateChanges);
writeJson("capture-analysis.json", { generatedFromUserSuppliedHtml: true, captures: captureSummary });

writeText("component-analysis.md", `
# Component analysis — Hethonglab TSA practice

## Evidence boundary

- Direct observation: the redacted semantic tree of the package/part list page.
- Supplied DOM evidence: 16 serialized HTML captures, 15 unique by SHA-256, covering confirmation, the exam room, several question controls and completion/recommendation state.
- Executed-code evidence: component/service bodies extracted from the supplied \`index-rqS3kNQ4.js\` application variant.
- CSS evidence: exact utility classes from both the captures and reference bundle, matched against \`index-IpwJzEAT.css\`.
- Unavailable: clean live CDP outerHTML, live computed styles and response bodies because attachment activated the site's protection redirect. No bypass was attempted.

## Component hierarchy

\`\`\`text
App -> BrowserRouter -> LayoutLab
  -> /lab/tsa/luyen-de -> LuyenDePage / PartListPage
     -> bag grid or PartListRow[] -> ResultModal
  -> /phan-thi-tsa/:id -> PartInterface
     -> ConfirmationStep
     -> renderQuestionByType
        -> SingleChoiceQuestion | MultipleChoiceQuestion | FillInBlankQuestion
        -> DragAndDropQuestion | TrueFalseQuestion | MatchingQuestion
     -> ExamSidebar -> SubmitModal
  -> completion/result state -> recommended practice cards
\`\`\`

## Verified interaction states

- Confirmation: full-width red **Bắt đầu thi** action.
- Single choice: 32px circular marker with 2px border; unselected capture state is \`#E8E8E8\`.
- Fill blank: inline text input with a 2px blue bottom border.
- Drag/drop: gray, rounded, \`cursor-move\` items with native \`draggable=true\` in the supplied snapshots.
- True/false matrix: 28px circular controls, growing to 32px at the \`sm\` breakpoint.
- Sidebar: candidate block, timer, question navigation and red **Nộp bài** action.

The captures do not contain reliable viewport dimensions. They prove responsive \`sm/md/lg\` rules, not whether a particular serialization was desktop, tablet or mobile. The selected-answer blue \`#1980FF\` is verified from the bundle, while the supplied question captures show unselected markers.

## State and behavior

\`PartListPage\` owns search, 500ms debouncing, tags, topic/status filters, page, bag/part mode, selected bag, loading/error, result-modal state and pagination. Selecting a bag fetches \`/bags/:id\`; **Vào làm** posts to \`/parts/:id/start\` and navigates to \`/phan-thi-tsa/:attempt.id\`.

\`flattenQuestions\` preserves reading passages as non-numbered structural rows and assigns sequential display indexes to child questions. \`renderQuestionByType\` dispatches the six verified interactive types. The sidebar excludes passage rows from the total, uses a 480px width from the \`md\` breakpoint and opens \`SubmitModal\`.
`);

writeText("final-report.md", `
# Final audit report — Hethonglab TSA practice UI

## Outcome

The audit combines direct semantic observation, 16 user-supplied serialized HTML captures and the read-only local application bundle. One supplied capture is an exact duplicate, so 15 unique states/documents remain. Extension injections and all scripts were excluded from capture-derived artifacts; account text, form values, application identifiers and response/session material were not retained.

## Captured UI coverage

The supplied DOM directly confirms the candidate confirmation screen, repeated exam-room/sidebar structure, single-choice controls, true/false matrix controls, inline fill-in blanks, native draggable answer chips, and a completion/recommendation page. The reference bundle additionally proves multiple-choice and matching renderers plus the submit modal. Capture viewport dimensions were not embedded, so desktop/tablet/mobile labels are intentionally left unknown; responsive utilities themselves are documented.

## Protection boundary

A clean live outerHTML/getComputedStyle/network-response capture was not available after developer-tool attachment caused the site to redirect through its protection page. No protection was bypassed. No request was altered to expand access. No hidden answer data, credential, cookie, Authorization value or sensitive session material was read or stored. The accidental localhost network capture was discarded.

## Local reference classification

- \`index-rqS3kNQ4.js\`: same application family and contains matching TSA components, but differs from the saved HTML's \`index-CvGeGVj1.js\`; it is a version variant, not a proven exact current-network match.
- \`index-IpwJzEAT.css\`: matching Tailwind/KaTeX styling, but the saved HTML references \`index-9eYssA5U.css\`; it is likewise a version variant.
- \`output.css\`: an HTML document saved under a CSS extension. It references the other hashed build and \`/disable-devtool.js\`.

The reference directory was read only and was not modified.
`);

const requiredArtifacts = [
  "rendered-dom.html", "dom-tree.json", "elements.json", "computed-styles.json", "stylesheets.json", "scripts.json", "assets.json",
  "network-requests.json", "network-responses.json", "source-maps.json", "local-reference-files.json", "ui-state-changes.json",
  "component-analysis.md", "final-report.md",
];

console.log(JSON.stringify({
  auditRoot,
  requiredArtifacts: requiredArtifacts.length,
  supplementalArtifacts: ["capture-analysis.json"],
  captures: captures.length,
  uniqueCaptures: uniqueCaptures.length,
  assets: [...new Set([...assetMatches, ...cssAssets])].length,
}, null, 2));

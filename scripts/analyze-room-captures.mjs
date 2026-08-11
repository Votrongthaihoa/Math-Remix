import { createHash } from "node:crypto";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { basename, dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

export const CAPTURE_IDS = [
  "cce1a942-fe3c-4dc0-89c6-02a8f7cf5033",
  "ced7dc81-e725-412c-8a4e-4f0791897846",
  "684f5331-3568-4573-a001-f7d840fa93f8",
  "bb834f89-a7b4-45a5-acfc-4cc442cc67ba",
  "b275a6d2-a79a-4bef-a0a2-a901730a144a",
  "2617a484-64fb-4b0d-b078-e2a6bf51031f",
  "e0a24432-2050-4cfc-86ff-c0f4bbef0bb4",
  "5d64b6e0-65a7-41ab-9948-116560ff867b",
  "70814c0a-e3e8-4beb-b707-3404ed72b9cc",
  "4d260063-14c3-436c-b991-046668c1709f",
  "5262dbce-c17e-4777-9b6f-813fa67bc579",
  "9f1deadd-8560-40b4-9fa5-7056b0408f6b",
  "9c0b5359-7c5c-4098-9932-507b56c5cdf2",
  "9eec1b5b-1025-4731-b722-e6f3d3a3ae46",
  "32a25b28-8358-4a05-a182-feb1f11ce6ad",
  "fe0efbc5-b2c7-48a7-8a6d-628117496623",
];

const defaultCaptureRoot = "C:/Users/LENOVO/.codex/attachments";
const paths = process.argv.slice(2).length > 0
  ? process.argv.slice(2)
  : CAPTURE_IDS.map(id => join(defaultCaptureRoot, id, "pasted-text.txt"));

const sha256 = value => createHash("sha256").update(value).digest("hex");
const decodeEntities = value => value
  .replace(/&#(\d+);/g, (_, value) => String.fromCodePoint(Number(value)))
  .replace(/&#x([\da-f]+);/gi, (_, value) => String.fromCodePoint(Number.parseInt(value, 16)))
  .replace(/&nbsp;/gi, " ")
  .replace(/&amp;/gi, "&")
  .replace(/&lt;/gi, "<")
  .replace(/&gt;/gi, ">")
  .replace(/&quot;/gi, "\"")
  .replace(/&#39;|&apos;/gi, "'");

const stripAccents = value => value.normalize("NFD").replace(/[\u0300-\u036f]/g, "").replace(/đ/g, "d").replace(/Đ/g, "D");
const normalize = value => decodeEntities(value).replace(/\s+/g, " ").trim();
const tagText = (html, tag) => [...html.matchAll(new RegExp(`<${tag}\\b[^>]*>([\\s\\S]*?)<\\/${tag}>`, "gi"))]
  .map(match => normalize(match[1].replace(/<[^>]+>/g, " ")))
  .filter(Boolean);
const attributeValues = (html, attribute) => [...html.matchAll(new RegExp(`\\s${attribute}=(?:\"([^\"]*)\"|'([^']*)')`, "gi"))]
  .map(match => normalize(match[1] ?? match[2] ?? ""))
  .filter(Boolean);
const unique = values => [...new Set(values)];

const knownLabels = [
  "Quay lại", "Xác nhận", "Bắt đầu làm bài", "Bắt đầu", "Tiếp tục", "Đóng",
  "Nộp bài", "Nộp bài thi", "Làm bài tiếp", "Chuyển phần", "Kết thúc",
  "Câu hỏi", "Câu", "Phần thi", "Thời gian còn lại", "Thời gian làm bài",
  "Thông tin thí sinh", "Họ và tên", "Ngày sinh", "Mã dự thi", "Số báo danh",
  "Đúng", "Sai", "Đáp án", "Chọn đáp án", "Nhập câu trả lời", "Điền đáp án",
  "Kéo", "Thả", "Sắp xếp", "Nối", "Ghép", "Lựa chọn", "Nhiều lựa chọn",
  "Gói đề", "Phòng Luyện Miễn Phí", "Tìm kiếm đề thi", "Đề Số 01", "Đang mở",
  "3 Phần", "Miễn phí", "Xem lịch sử", "Vào làm", "Trang chủ", "Luyện đề",
];

const classify = ({ text, html, buttons, headings, inputTypes }) => {
  const plain = stripAccents(text).toLowerCase();
  const classSource = stripAccents(html).toLowerCase();
  const states = [];
  if (plain.includes("goi de") && (plain.includes("vao lam") || plain.includes("xem lich su"))) states.push("list/search");
  if (plain.includes("xac nhan") || plain.includes("bat dau lam bai") || plain.includes("huong dan lam bai")) states.push("confirmation");
  if (plain.includes("ve trang luyen de") && plain.includes("lam ngay")) states.push("completion/recommendations");
  if (plain.includes("nop bai") && (plain.includes("lam bai tiep") || plain.includes("ban co chac"))) states.push("submit-modal");
  if (/draggable=["']true["']/.test(html) || /dnd|sortable/.test(classSource)) states.push("drag-drop/order");
  if (inputTypes.includes("text")) states.push("fill-blank");
  if (/w-8 h-8 rounded-full border-2 cursor-pointer/.test(html)) states.push("single-choice");
  if (/w-7 h-7 sm:w-8 sm:h-8 rounded-full/.test(html) && />\s*sai\s*</.test(classSource)) states.push("true-false-matrix");
  if (inputTypes.includes("radio")) states.push("single-choice");
  if (inputTypes.includes("checkbox") || /multiple-choice/.test(classSource)) states.push("multiple-choice");
  if (/bg-\[#1980ff\]/i.test(html) || /checked(?:=|\s|>)/i.test(html)) states.push("selected-answer");
  if (/bg-\[#e8e8e8\]/i.test(html)) states.push("unselected-answer");
  if (states.length === 0 && (buttons.length || headings.length)) states.push("interactive-page");
  return unique(states);
};

export const analyzeCapture = path => {
  const raw = readFileSync(path, "utf8");
  const withoutCode = raw
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ");
  const text = normalize(withoutCode.replace(/<[^>]+>/g, " "));
  const buttons = unique(tagText(withoutCode, "button"));
  const headings = unique([1, 2, 3, 4, 5, 6].flatMap(level => tagText(withoutCode, `h${level}`)));
  const labels = unique(tagText(withoutCode, "label"));
  const inputTypes = unique([...withoutCode.matchAll(/<input\b[^>]*\btype=(?:\"([^\"]+)\"|'([^']+)')/gi)].map(match => (match[1] ?? match[2]).toLowerCase()));
  const classes = unique(attributeValues(withoutCode, "class").flatMap(value => value.split(/\s+/))).sort();
  const roleCounts = Object.fromEntries(unique(attributeValues(withoutCode, "role")).sort().map(role => [role, attributeValues(withoutCode, "role").filter(value => value === role).length]));
  const tagCounts = Object.fromEntries([...withoutCode.matchAll(/<([a-z][\w-]*)\b/gi)].reduce((map, match) => map.set(match[1].toLowerCase(), (map.get(match[1].toLowerCase()) ?? 0) + 1), new Map()));
  const safeLabelHits = unique(knownLabels.filter(label => stripAccents(text).toLowerCase().includes(stripAccents(label).toLowerCase())));
  const safeControls = unique([...buttons, ...headings, ...labels])
    .filter(value => knownLabels.some(label => stripAccents(value).toLowerCase().includes(stripAccents(label).toLowerCase())))
    .map(value => value.replace(/[\w.+-]+@[\w.-]+\.[a-z]{2,}/gi, "[REDACTED_EMAIL]").replace(/(?:\+?84|0)\d{8,10}/g, "[REDACTED_PHONE]"))
    .slice(0, 80);
  const analysis = { text, html: withoutCode, buttons, headings, inputTypes };
  return {
    captureId: basename(dirname(path)),
    sourceSha256: sha256(raw),
    bytes: Buffer.byteLength(raw),
    duplicateOf: null,
    classification: classify(analysis),
    viewport: {
      classification: "unknown-from-serialized-dom",
      responsiveEvidence: classes.some(value => /^(?:sm|md|lg|xl|2xl):/.test(value))
        ? "Responsive utility classes are present; no viewport dimensions were embedded in the capture."
        : "No reliable viewport evidence was embedded in the capture.",
    },
    structure: {
      tagCounts,
      roleCounts,
      inputTypes,
      inputCount: tagCounts.input ?? 0,
      buttonCount: tagCounts.button ?? 0,
      imageCount: tagCounts.img ?? 0,
      tableCount: tagCounts.table ?? 0,
      classCount: classes.length,
      classes,
    },
    safeLabelHits,
    safeControls,
    extensionArtifactsRemoved: (raw.match(/chrome-extension:\/\//g) ?? []).length,
    scriptsRemoved: (raw.match(/<script\b/gi) ?? []).length,
  };
};

export const analyzeCaptures = capturePaths => {
  const captures = capturePaths.map(path => analyzeCapture(resolve(path)));
  for (let index = 0; index < captures.length; index += 1) {
    const duplicate = captures.find((candidate, candidateIndex) => candidateIndex < index && candidate.sourceSha256 === captures[index].sourceSha256);
    captures[index].captureId = `capture-${String(index + 1).padStart(2, "0")}`;
    if (duplicate) captures[index].duplicateOf = duplicate.captureId;
  }
  return captures;
};

if (resolve(process.argv[1] ?? "") === resolve(fileURLToPath(import.meta.url))) {
  const captures = analyzeCaptures(paths);
  const outputPath = resolve("audit/capture-analysis.json");
  mkdirSync(dirname(outputPath), { recursive: true });
  writeFileSync(outputPath, `${JSON.stringify({
    generatedFromUserSuppliedHtml: true,
    privacy: "Scripts, arbitrary text, account values, form values, UUIDs, tokens and response bodies are not emitted.",
    captures,
  }, null, 2)}\n`, "utf8");

  console.log(JSON.stringify(captures.map(({ captureId, bytes, duplicateOf, classification, viewport, safeLabelHits, safeControls, structure }) => ({
    captureId,
    bytes,
    duplicateOf,
    classification,
    viewport,
    safeLabelHits,
    safeControls,
    controls: { buttons: structure.buttonCount, inputs: structure.inputCount, inputTypes: structure.inputTypes, tables: structure.tableCount },
  })), null, 2));
}

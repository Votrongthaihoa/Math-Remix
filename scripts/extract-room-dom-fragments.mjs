import { readFileSync } from "node:fs";

const [path, needle, ancestorArg] = process.argv.slice(2);
if (!path || !needle) throw new Error("Usage: node extract-room-dom-fragments.mjs <html> <text-or-class>");

const decode = value => value
  .replace(/&#(\d+);/g, (_, number) => String.fromCodePoint(Number(number)))
  .replace(/&#x([\da-f]+);/gi, (_, number) => String.fromCodePoint(Number.parseInt(number, 16)))
  .replace(/&nbsp;/gi, " ").replace(/&amp;/gi, "&").replace(/&lt;/gi, "<").replace(/&gt;/gi, ">").replace(/&quot;/gi, '"').replace(/&#39;|&apos;/gi, "'");
const safeText = value => {
  const text = decode(value).replace(/\s+/g, " ").trim();
  if (!text) return "";
  const safe = /^(?:Quay lại|Xác nhận thông tin dự thi|Bắt đầu thi|Thời gian làm bài|Thông tin thí sinh|Danh sách câu hỏi|Câu (?:trước|tiếp)|Nộp bài(?: thi)?|Đúng|Sai|Phát biểu|Làm bài tiếp|Đang nộp…?|Kết thúc|Làm ngay|Về trang luyện đề)$/i;
  if (safe.test(text)) return text;
  if (/^(?:\d{1,3}|\d{2}:\d{2}(?::\d{2})?|[A-D])$/.test(text)) return "[INDEX]";
  return "[TEXT]";
};

const html = readFileSync(path, "utf8")
  .replace(/<script\b[\s\S]*?<\/script>/gi, "")
  .replace(/<style\b[\s\S]*?<\/style>/gi, "")
  .replace(/<!--([\s\S]*?)-->/g, "");
const root = { tag: "root", attrs: {}, children: [], parent: null };
const stack = [root];
const voidTags = new Set(["area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"]);
const tokenPattern = /<[^>]+>|[^<]+/g;
for (const match of html.matchAll(tokenPattern)) {
  const token = match[0];
  if (token.startsWith("</")) {
    const tag = token.match(/^<\/\s*([\w-]+)/)?.[1]?.toLowerCase();
    while (stack.length > 1) {
      const current = stack.pop();
      if (current.tag === tag) break;
    }
    continue;
  }
  if (token.startsWith("<!") || token.startsWith("<?")) continue;
  if (token.startsWith("<")) {
    const opening = token.match(/^<\s*([\w-]+)([\s\S]*?)\/?\s*>$/);
    if (!opening) continue;
    const tag = opening[1].toLowerCase();
    const attrs = {};
    for (const attr of opening[2].matchAll(/([:\w-]+)(?:=(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g)) {
      const name = attr[1].toLowerCase();
      if (["class", "type", "role", "aria-label", "aria-modal", "draggable", "disabled"].includes(name)) attrs[name] = decode(attr[2] ?? attr[3] ?? attr[4] ?? "");
    }
    const node = { tag, attrs, children: [], parent: stack.at(-1) };
    stack.at(-1).children.push(node);
    if (!voidTags.has(tag) && !token.endsWith("/>")) stack.push(node);
    continue;
  }
  const text = safeText(token);
  if (text) stack.at(-1).children.push({ text, parent: stack.at(-1) });
}

const all = [];
const visit = node => {
  if (node.tag) all.push(node);
  for (const child of node.children ?? []) if (child.tag) visit(child);
};
visit(root);
const nodeText = node => (node.children ?? []).map(child => child.text ?? nodeText(child)).join(" ").replace(/\s+/g, " ").trim();
const normalizedNeedle = needle.toLowerCase();
const found = all.toReversed().find(node => `${node.attrs.class ?? ""} ${nodeText(node)}`.toLowerCase().includes(normalizedNeedle));
if (!found) throw new Error(`No node matched: ${needle}`);
let fragmentRoot = found;
for (let index = 0; index < Number(ancestorArg ?? 4) && fragmentRoot.parent?.tag !== "root"; index += 1) fragmentRoot = fragmentRoot.parent;
const project = (node, depth = 0) => {
  if (depth > 8) return { truncated: true };
  if (node.text) return { text: node.text };
  return { tag: node.tag, attrs: node.attrs, children: (node.children ?? []).map(child => project(child, depth + 1)).slice(0, 80) };
};
console.log(JSON.stringify(project(fragmentRoot), null, 2));

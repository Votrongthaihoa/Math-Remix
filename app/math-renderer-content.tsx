"use client";

import katex from "katex";
import { useMemo } from "react";
import "katex/dist/katex.min.css";
import "./math-renderer-content.css";

function decodeHtmlEntities(value: string) {
  if (typeof document !== "undefined") {
    const textarea = document.createElement("textarea");
    textarea.innerHTML = value;
    return textarea.value;
  }
  return value.replace(/&#(\d+);/g, (_match, code: string) => String.fromCodePoint(Number(code)))
    .replace(/&(?:amp|lt|gt|quot|apos);/g, entity => ({ "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": '"', "&apos;": "'" }[entity] ?? entity));
}

function escapeHtml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

function fixLatex(value: string, display: boolean) {
  let source = value.trim();
  source = source.replace(/\\begin\{array\}\{\*\{\d+\}\{([lcr])\}\}/g, "\\begin{array}{$1}");
  if (display) {
    source = source.replace(/\\frac\s*/g, "\\dfrac ");
    source = source.replace(/\\(int|sum|prod|lim)(?!\\limits)/g, "\\$1\\limits");
    if (/\\(int|sum|prod|lim)/.test(source) && !/\\displaystyle/.test(source)) source = `\\displaystyle ${source}`;
  }
  return source;
}

function formulaHtml(source: string, display: boolean) {
  try {
    return `<span class="math-renderer-formula${display ? " is-display" : ""}">${katex.renderToString(fixLatex(source, display), { displayMode: display, throwOnError: false, trust: false, strict: "ignore" })}</span>`;
  } catch {
    return `<code class="math-renderer-formula-error">${escapeHtml(source)}</code>`;
  }
}

const mathPattern = /(\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]|(?<!\$)\$([^$\n]+?)\$(?!\$)|\\\(([\s\S]+?)\\\))/g;

function renderMathTokens(value: string) {
  let output = "";
  let cursor = 0;
  for (const match of value.matchAll(mathPattern)) {
    const index = match.index ?? 0;
    output += escapeHtml(value.slice(cursor, index));
    const display = Boolean(match[2] ?? match[3]);
    output += formulaHtml(match[2] ?? match[3] ?? match[4] ?? match[5] ?? "", display);
    cursor = index + match[0].length;
  }
  return output + escapeHtml(value.slice(cursor));
}

function normalizeImages(html: string) {
  return html.replace(/<img\b([^>]*?)\bsrc\s*=\s*(["'])(.*?)\2([^>]*)>/gi, (_match, before: string, quote: string, src: string, after: string) => {
    if (/^javascript:/i.test(src.trim())) return "";
    let resolved = src.trim();
    try { resolved = new URL(resolved, typeof window !== "undefined" ? window.location.origin : "http://localhost").toString(); } catch { /* preserve a relative path */ }
    return `<img${before}src=${quote}${escapeHtml(resolved)}${quote}${after} loading="lazy" decoding="async">`;
  });
}

function normalizeIframes(html: string) {
  return html.replace(/<iframe\b([^>]*)>/gi, (_match, attributes: string) => {
    const src = attributes.match(/\bsrc\s*=\s*(["'])(.*?)\1/i)?.[2] ?? "";
    if (/^\s*javascript:/i.test(src)) return "";
    const safeSrc = escapeHtml(src);
    return `<iframe src="${safeSrc}" loading="lazy" referrerpolicy="no-referrer" allow="fullscreen; autoplay; encrypted-media" allowfullscreen></iframe>`;
  });
}

function sanitizeRichHtml(value: string) {
  let html = value
    .replace(/<\/?(?:script|style|object|embed|form|textarea|select|button|meta|link)[^>]*>/gi, "")
    .replace(/\son[a-z-]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/(src|href)\s*=\s*(["'])\s*javascript:[^"']*\2/gi, "$1=$2#$2");
  html = html.replace(/<p\b[^>]*>/gi, "").replace(/<\/p>/gi, "<br>").replace(/(?:<br\s*\/?>\s*){3,}/gi, "<br><br>");
  html = html.replace(/\\\[([\s\S]+?)\\\]/g, (_match, source: string) => formulaHtml(source, true));
  html = html.replace(/(\$\$([\s\S]+?)\$\$|(?<!\$)\$([^$\n]+?)\$(?!\$)|\\\(([\s\S]+?)\\\))/g, (_match, _all: string, displaySource: string | undefined, inlineSource: string | undefined, parenthesized: string | undefined) => formulaHtml(displaySource ?? inlineSource ?? parenthesized ?? "", Boolean(displaySource)));
  return normalizeIframes(normalizeImages(html));
}

export function MathRendererContent({ content, className = "", trustedRichHtml = false }: {
  content: string | null | undefined;
  className?: string;
  /** Only author-controlled content may opt into the legacy rich HTML path. */
  trustedRichHtml?: boolean;
}) {
  const html = useMemo(() => {
    const decoded = decodeHtmlEntities(content ?? "");
    const hasTags = trustedRichHtml && /<([a-z][^>]*)>/i.test(decoded);
    return hasTags ? sanitizeRichHtml(decoded) : renderMathTokens(decoded);
  }, [content, trustedRichHtml]);
  return <span className={`math-renderer ${className}`.trim()} dangerouslySetInnerHTML={{ __html: html }} />;
}

export default MathRendererContent;

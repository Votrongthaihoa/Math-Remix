import DOMPurify from "dompurify";
import katex from "katex";
import { useMemo } from "react";
import "katex/dist/katex.min.css";
import "../../styles/math-renderer.css";

import { normalizeEditorHtml } from "./math-content.ts";

const DISPLAY_MATH = /\$\$([\s\S]+?)\$\$|\\\[([\s\S]+?)\\\]/g;

export type MathRendererProps = {
  content: string;
  className?: string;
};

function renderDisplayMath(content: string) {
  return content.replace(DISPLAY_MATH, (_match, dollarMath: string | undefined, bracketMath: string | undefined) => {
    const expression = (dollarMath ?? bracketMath ?? "").trim();
    if (!expression) return "";
    return katex.renderToString(expression, {
      displayMode: true,
      throwOnError: false,
      output: "htmlAndMathml",
      strict: "warn",
      trust: false,
    });
  });
}

export default function MathRenderer({ content, className = "" }: MathRendererProps) {
  const html = useMemo(() => {
    const sanitized = DOMPurify.sanitize(content, {
      USE_PROFILES: { html: true },
      FORBID_TAGS: ["style", "script", "iframe", "object", "embed"],
      FORBID_ATTR: ["style", "srcset"],
    });
    return renderDisplayMath(normalizeEditorHtml(String(sanitized)));
  }, [content]);

  return (
    <div
      className={`aeck-math-renderer ${className}`.trim()}
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
}

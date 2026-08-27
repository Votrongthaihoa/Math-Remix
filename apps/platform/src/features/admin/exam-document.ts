import type { ExamDocument } from "@aeck/contracts";

export type EditableExamDocument = Omit<ExamDocument, "contentHash" | "updatedAt"> & {
  baseContentHash?: string;
};

function bytesToHex(bytes: ArrayBuffer) {
  return Array.from(new Uint8Array(bytes), (byte) => byte.toString(16).padStart(2, "0")).join("");
}

export async function hashExamDocument(document: EditableExamDocument) {
  const canonical = JSON.stringify({
    examId: document.examId,
    title: document.title,
    authoritativeHtml: document.authoritativeHtml,
    normalizedSections: document.normalizedSections,
  });
  return bytesToHex(await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonical)));
}

export async function createExamSaveRequest(document: EditableExamDocument) {
  const contentHash = await hashExamDocument(document);
  const origin = typeof location === "undefined" ? "http://aeck.local" : location.origin;
  return new Request(new URL(`/api/platform/v1/exam-documents/${encodeURIComponent(document.examId)}`, origin), {
    method: "PUT",
    headers: {
      "content-type": "application/json",
      "if-match-revision": String(document.revision),
      "if-match-content-hash": document.baseContentHash ?? contentHash,
    },
    body: JSON.stringify({
      examId: document.examId,
      revision: document.revision,
      contentHash,
      title: document.title,
      authoritativeHtml: document.authoritativeHtml,
      normalizedSections: document.normalizedSections,
      lexicalJson: document.lexicalJson,
    }),
  });
}

export function isEditConflict(error: unknown) {
  if (!error || typeof error !== "object") return false;
  const value = error as { status?: unknown; code?: unknown };
  return value.status === 409 && value.code === "EDIT_CONFLICT";
}

export function legacyHtmlHasUnsupportedNodes(html: string) {
  if (!html.trim()) return false;
  const unsupported = /<(?:table|math|svg|iframe|object|embed|audio|video|canvas)\b|class=["'][^"']*(?:katex|math-field|ck-widget)[^"']*["']/i;
  return unsupported.test(html);
}

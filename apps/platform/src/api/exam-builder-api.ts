import { ExamDocumentSchema, type ExamDocument } from "@aeck/contracts";

import { parseApiResponse, requestApi } from "./api-client.ts";
import { createExamSaveRequest } from "../features/admin/exam-document.ts";
import { authStore } from "../store/auth-store.ts";

export function loadExamDocument(examId: string) {
  return requestApi(
    `/api/platform/v1/exam-documents/${encodeURIComponent(examId)}`,
    ExamDocumentSchema,
  );
}

export function createExamDocument(title: string, template: "blank" | "from-bank" | "random") {
  return requestApi(
    "/api/platform/v1/exam-documents",
    ExamDocumentSchema,
    { method: "POST", body: JSON.stringify({ title, template }) },
  );
}

export async function saveExamDocument(document: ExamDocument) {
  const saveRequest = await createExamSaveRequest({
    examId: document.examId,
    revision: document.revision,
    baseContentHash: document.contentHash,
    title: document.title,
    authoritativeHtml: document.authoritativeHtml,
    normalizedSections: document.normalizedSections,
    lexicalJson: document.lexicalJson,
  });
  const headers = new Headers(saveRequest.headers);
  const token = authStore.getState().accessToken;
  if (token) headers.set("authorization", `Bearer ${token}`);
  headers.set("version", "3.0");
  headers.set("x-crypto-version", "3");
  const response = await fetch(saveRequest, { credentials: "include", headers });
  return parseApiResponse(response, ExamDocumentSchema);
}

import { POST as postExam } from "../../route";
import { requestWithSectionId } from "../../../../../lib/exam-route-compat";

type RouteContext = { params: Promise<{ sectionId: string }> };

/** Compatibility endpoint for autosave clients that address drafts by section. */
export async function POST(request: Request, context: RouteContext) {
  const { sectionId } = await context.params;
  return postExam(await requestWithSectionId(request, sectionId, { action: "progress" }));
}

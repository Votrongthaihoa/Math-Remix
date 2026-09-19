import { POST as postExamContent } from "../../content/route";
import { requestWithSectionId } from "../../../../../lib/exam-route-compat";

type RouteContext = { params: Promise<{ sectionId: string }> };

/** Compatibility endpoint for clients that address encrypted content by section. */
export async function POST(request: Request, context: RouteContext) {
  const { sectionId } = await context.params;
  return postExamContent(await requestWithSectionId(request, sectionId));
}

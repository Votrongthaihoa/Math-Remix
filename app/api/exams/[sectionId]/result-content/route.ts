import { POST as postResultContent } from "../../result-content/route";
import { requestWithSectionId } from "../../../../../lib/exam-route-compat";

type RouteContext = { params: Promise<{ sectionId: string }> };

/** Compatibility endpoint for result clients that address content by section. */
export async function POST(request: Request, context: RouteContext) {
  const { sectionId } = await context.params;
  return postResultContent(await requestWithSectionId(request, sectionId));
}

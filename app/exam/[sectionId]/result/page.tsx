import SectionExamRouteBridge from "../../section-route-bridge";

type ExamResultPageProps = { params: Promise<{ sectionId: string }> };

/** Redirect the legacy section-first URL into the protected result engine. */
export default async function ExamResultPage({ params }: ExamResultPageProps) {
  const { sectionId } = await params;
  return <SectionExamRouteBridge sectionId={sectionId} target="result" />;
}

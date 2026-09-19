import SectionExamRouteBridge from "../../section-route-bridge";

type ExamTestPageProps = { params: Promise<{ sectionId: string }> };

/** Redirect the legacy section-first URL into the protected exam engine. */
export default async function ExamTestPage({ params }: ExamTestPageProps) {
  const { sectionId } = await params;
  return <SectionExamRouteBridge sectionId={sectionId} target="test" />;
}

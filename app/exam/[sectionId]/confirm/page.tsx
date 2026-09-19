import SectionExamRouteBridge from "../../section-route-bridge";

type ExamConfirmPageProps = { params: Promise<{ sectionId: string }> };

/** Redirect the legacy section-first URL into the protected confirmation step. */
export default async function ExamConfirmPage({ params }: ExamConfirmPageProps) {
  const { sectionId } = await params;
  return <SectionExamRouteBridge sectionId={sectionId} target="confirm" />;
}

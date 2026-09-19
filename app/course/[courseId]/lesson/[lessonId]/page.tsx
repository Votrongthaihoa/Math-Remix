import { redirect } from "next/navigation";

type CourseLessonPageProps = { params: Promise<{ courseId: string; lessonId: string }> };

/** Bridge the source route into the existing enrolled-course lesson viewer. */
export default async function CourseLessonPage({ params }: CourseLessonPageProps) {
  const { lessonId } = await params;
  redirect(`/lessons/${encodeURIComponent(lessonId)}`);
}

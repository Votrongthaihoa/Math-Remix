import { useQuery } from "@tanstack/react-query";
import {
  BookOpen,
  CheckCircle2,
  ChevronDown,
  CirclePlay,
  FileText,
  Library,
  Search,
} from "lucide-react";
import { useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { courseDetailQuery, platformCollectionQuery } from "../../api/platform-api.ts";
import { LoadingPanel } from "../../components/ui/loading-panel.tsx";
import { QueryError } from "../../components/ui/query-error.tsx";
import { normalizedSearchText } from "../collections/collection-utils.ts";
import { legacyUrl } from "../parity/legacy-url.ts";
import "../../styles/student-modules.css";

function numericMetadata(value: unknown, fallback = 0) {
  return typeof value === "number" && Number.isFinite(value) ? value : fallback;
}

export default function CourseCatalogPage() {
  const query = useQuery(platformCollectionQuery("courses"));
  const [search, setSearch] = useState("");
  if (query.isPending) return <LoadingPanel label="Đang tải khóa học…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;

  const normalized = normalizedSearchText(search);
  const courses = query.data.records.filter((course) =>
    normalizedSearchText(`${course.title} ${course.description} ${course.category}`).includes(normalized),
  );

  return (
    <div className="aeck-student-module aeck-course-catalog">
      <header className="aeck-student-page-heading">
        <div><h1>Khóa học</h1><p>Tiếp tục lộ trình đã được phân cho tài khoản của bạn.</p></div>
        <label className="aeck-student-search"><Search aria-hidden="true" /><span className="aeck-sr-only">Tìm khóa học</span><input type="search" value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Tìm kiếm giáo trình…" /></label>
      </header>
      <div className="aeck-course-grid">
        {courses.map((course, index) => {
          const color = typeof course.metadata.color === "string" ? course.metadata.color : "#cd1627";
          const progress = numericMetadata(course.metadata.progress);
          const lessonCount = course.metrics.find((metric) => metric.label === "Bài học")?.value ?? 0;
          return (
            <article key={course.id} className="aeck-course-card" style={{ "--course-accent": color } as React.CSSProperties}>
              <div className="aeck-course-cover">
                <span className="aeck-course-seal" aria-hidden="true">AECK</span>
                <img src="/aeck-mark.svg" alt="" />
                <div><small>Chương trình luyện thi</small><strong>{course.category || "AECK"}</strong></div>
                <i aria-hidden="true">{String(index + 1).padStart(2, "0")}</i>
              </div>
              <div className="aeck-course-card-content">
                <span>{course.category}</span><h2>{course.title}</h2><p>{course.description}</p>
                <div className="aeck-course-progress"><div><span style={{ width: `${progress}%` }} /></div><small>{progress}% hoàn thành</small></div>
              </div>
              <footer><span><CirclePlay aria-hidden="true" />{lessonCount} bài học</span><Link to={`/course/study/${course.id}`}>Vào học</Link></footer>
            </article>
          );
        })}
      </div>
      {!courses.length ? <div className="aeck-student-empty"><Search aria-hidden="true" /><h2>Không tìm thấy khóa học</h2><p>Hãy thử một từ khóa ngắn hơn.</p></div> : null}
    </div>
  );
}

export function CourseStudyPage() {
  const { id = "course-tsa-2026" } = useParams();
  const query = useQuery(courseDetailQuery(id));
  const [activeLessonId, setActiveLessonId] = useState<string | null>(null);
  const [openChapterOverride, setOpenChapterOverride] = useState<Set<string> | null>(null);
  const firstChapterId = query.data?.chapters[0]?.id;
  const resolvedActiveLessonId = activeLessonId ?? query.data?.chapters[0]?.lessons[0]?.id ?? "";
  const openChapters = openChapterOverride ?? new Set(firstChapterId ? [firstChapterId] : []);

  const activeLesson = useMemo(
    () => query.data?.chapters.flatMap((chapter) => chapter.lessons).find((lesson) => lesson.id === resolvedActiveLessonId),
    [query.data, resolvedActiveLessonId],
  );

  if (query.isPending) return <LoadingPanel label="Đang mở nội dung khóa học…" />;
  if (query.isError) return <QueryError message={query.error.message} retry={() => void query.refetch()} />;
  const course = query.data;

  const toggleChapter = (chapterId: string) => {
    setOpenChapterOverride((current) => {
      const next = new Set(current ?? (firstChapterId ? [firstChapterId] : []));
      if (next.has(chapterId)) next.delete(chapterId); else next.add(chapterId);
      return next;
    });
  };

  return (
    <div className="aeck-student-module aeck-course-study">
      <header className="aeck-study-heading" style={{ "--course-accent": course.color } as React.CSSProperties}>
        <Link to="/courses">Khóa học</Link><span>/</span><strong>{course.title}</strong>
        <div><h1>{course.title}</h1><p>{course.description}</p><span>{course.progress}% hoàn thành</span></div>
      </header>
      <div className="aeck-study-layout">
        <aside aria-label="Mục lục khóa học">
          <header><Library aria-hidden="true" /><div><strong>Nội dung khóa học</strong><span>{course.chapters.reduce((total, chapter) => total + chapter.lessons.length, 0)} bài học</span></div></header>
          <div>{course.chapters.map((chapter) => {
            const open = openChapters.has(chapter.id);
            return <section key={chapter.id}><button type="button" aria-expanded={open} onClick={() => toggleChapter(chapter.id)}><span>{chapter.title}</span><ChevronDown aria-hidden="true" /></button>{open ? <ol>{chapter.lessons.map((lesson) => <li key={lesson.id}><button type="button" aria-current={resolvedActiveLessonId === lesson.id ? "true" : undefined} onClick={() => setActiveLessonId(lesson.id)}>{lesson.completed ? <CheckCircle2 aria-hidden="true" /> : <CirclePlay aria-hidden="true" />}<span>{lesson.title}</span></button></li>)}</ol> : null}</section>;
          })}</div>
        </aside>
        <main className="aeck-lesson-viewer">
          {activeLesson ? <>
            <div className="aeck-lesson-stage"><span aria-hidden="true"><BookOpen /></span><h2>{activeLesson.title}</h2><p>{activeLesson.description}</p><a href={legacyUrl(`/lessons/${encodeURIComponent(activeLesson.id)}`)}>Mở trình phát bài học</a></div>
            <section className="aeck-lesson-resources" aria-labelledby="lesson-resources-title"><header><h3 id="lesson-resources-title">Tài nguyên bài học</h3><span>{activeLesson.resources.length} mục</span></header><div>{activeLesson.resources.map((resource) => <article key={resource.id}>{resource.type === "video" ? <CirclePlay aria-hidden="true" /> : <FileText aria-hidden="true" />}<div><strong>{resource.title}</strong><span>{resource.type === "video" ? "Video bài giảng" : resource.type === "quiz" ? "Bài luyện" : "Tài liệu"}{resource.durationMinutes ? ` · ${resource.durationMinutes} phút` : ""}</span></div><a href={legacyUrl(`/lessons/${encodeURIComponent(activeLesson.id)}`)}>Mở</a></article>)}</div></section>
          </> : <div className="aeck-student-empty"><BookOpen aria-hidden="true" /><h2>Chọn một bài học</h2></div>}
        </main>
      </div>
    </div>
  );
}

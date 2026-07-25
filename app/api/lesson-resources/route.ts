import { createClient } from "@supabase/supabase-js";
import { signContentToken } from "../../../lib/content-token";

type ChapterRelation = { course_id: string } | { course_id: string }[] | null;

export async function GET(request: Request) {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const tokenSecret = process.env.VIDEO_TOKEN_SECRET || serviceKey;
  if (!url || !serviceKey || !tokenSecret) return Response.json({ error: "Chưa cấu hình máy chủ nội dung." }, { status: 503 });

  const accessToken = request.headers.get("authorization")?.replace(/^Bearer\s+/i, "");
  if (!accessToken) return Response.json({ error: "Chưa đăng nhập." }, { status: 401 });
  const lessonId = new URL(request.url).searchParams.get("lessonId")?.trim();
  if (!lessonId) return Response.json({ error: "Thiếu mã bài học." }, { status: 400 });

  const admin = createClient(url, serviceKey, { auth: { persistSession: false } });
  const { data: auth } = await admin.auth.getUser(accessToken);
  if (!auth.user) return Response.json({ error: "Phiên đăng nhập không hợp lệ." }, { status: 401 });
  const { data: profile } = await admin.from("profiles").select("role,status").eq("id", auth.user.id).single();
  if (!profile || profile.status !== "active") return Response.json({ error: "Tài khoản không hoạt động." }, { status: 403 });

  const { data: lesson } = await admin.from("lessons").select("id,published,chapters(course_id)").eq("id", lessonId).single();
  if (!lesson) return Response.json({ error: "Không tìm thấy bài học." }, { status: 404 });
  const relation = lesson.chapters as ChapterRelation;
  const chapter = Array.isArray(relation) ? relation[0] : relation;
  if (!chapter?.course_id) return Response.json({ error: "Bài học không thuộc khóa học hợp lệ." }, { status: 404 });

  if (profile.role !== "admin") {
    if (!lesson.published) return Response.json({ error: "Bài học chưa được xuất bản." }, { status: 403 });
    const { data: enrollment } = await admin.from("course_enrollments").select("course_id").eq("student_id", auth.user.id).eq("course_id", chapter.course_id).maybeSingle();
    if (!enrollment) return Response.json({ error: "Bạn chưa được phân khóa học này." }, { status: 403 });
  }

  const { data: chapters, error: chaptersError } = await admin.from("chapters").select("id,title,sort_order").eq("course_id", chapter.course_id).order("sort_order");
  if (chaptersError) return Response.json({ error: chaptersError.message }, { status: 400 });
  const chapterIds = (chapters ?? []).map(item => item.id);
  const lessonsQuery = admin.from("lessons").select("id,chapter_id,title,description,published,sort_order").in("chapter_id", chapterIds).order("sort_order");
  const { data: lessons, error: lessonsError } = chapterIds.length
    ? await (profile.role === "admin" ? lessonsQuery : lessonsQuery.eq("published", true))
    : { data: [], error: null };
  if (lessonsError) return Response.json({ error: lessonsError.message }, { status: 400 });
  const lessonIds = (lessons ?? []).map(item => item.id);
  const { data: resources, error } = lessonIds.length
    ? await admin.from("lesson_resources").select("id,lesson_id,title,resource_type,allow_download,sort_order").in("lesson_id", lessonIds).order("sort_order")
    : { data: [], error: null };
  if (error) return Response.json({ error: error.message }, { status: 400 });
  const securedResources = await Promise.all((resources ?? []).map(async resource => ({
    id: resource.id,
    lesson_id: resource.lesson_id,
    title: resource.title,
    resource_type: resource.resource_type,
    allow_download: resource.allow_download,
    sort_order: resource.sort_order,
    videoToken: await signContentToken(resource.id, auth.user.id, tokenSecret, 3600),
  })));
  const items = securedResources.filter(resource => resource.lesson_id === lessonId);
  const curriculum = (chapters ?? []).map(section => ({
    ...section,
    lessons: (lessons ?? []).filter(item => item.chapter_id === section.id).map(item => ({
      ...item,
      resources: securedResources.filter(resource => resource.lesson_id === item.id),
    })),
  }));
  return Response.json({ resources: items, curriculum });
}

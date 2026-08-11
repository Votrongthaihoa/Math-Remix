"use client";

import { lazy, Suspense, useCallback, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { supabase } from "../lib/supabase";
import { activeSessionToken, authenticatedFetch } from "../lib/auth-client";
import VideoPlayer, { type SecureLessonResource } from "./video-player";
import LoadingIndicator from "./loading-indicator";
import AccountSecurityGuard from "./account-security-guard";
import TurnstileChallenge from "./turnstile-login";
import { normalizeExamType } from "../lib/exam-config";
import AdminSecurity from "./admin-security";
import { useAdminDialogFocus } from "./admin-dialog";
import "./study.css";
import "./admin-redesign.css";
import "./student-redesign.css";
import "./admin-macos.css";
import "./product-polish.css";
import "./text-overflow-polish.css";
import "./product-shell-ux.css";
import "./aeck-ui.css";
import AdminSessionList from "./admin-sessions";
import {
  LayoutDashboard, BookOpen, ClipboardCheck, History, Menu, LogOut, UserRound, ChevronRight, CalendarClock,
  Search, ShieldCheck, Users, Library, ListChecks, Plus, CirclePlay, Trash2, Save, FolderPlus, FilePlus, Link2, ImagePlus,
  ArrowLeft, LockKeyhole, Mail, BadgeCheck, Eye, EyeOff, X, ChevronDown
} from "lucide-react";

const ExamRoomModule = lazy(() => import("./exam-room"));
const AdminExamManager = lazy(() => import("./admin-exam-workspace"));
const AdminSessionWizard = lazy(() => import("./admin-session-wizard"));
const AdminSessionResults = lazy(() => import("./admin-session-results"));
const AdminQuestionBank = lazy(() => import("./admin-question-bank"));
const AdminUploadManager = lazy(() => import("./admin-upload"));
const GuestExamModule = lazy(() => import("./guest-exam"));

type View = "overview" | "exams" | "courses" | "history" | "profile" | "admin" | "course" | "lesson";
type AuthMode = "login" | "forgot" | "reset";
type ProfileData = { full_name: string; student_code: string; role: "student" | "admin"; status: "active" | "locked"; email: string };
type CourseData = { id: string | number; title: string; description: string; lessons: number; color: string; cover_url?: string | null; published?: boolean };
type CourseRow = { id: string; title: string; description: string | null; cover_url: string | null; cover_color: string | null; published: boolean };
type EnrollmentCourseRow = { courses: CourseRow | CourseRow[] | null };
type AttemptData = { id: string; exam_id?: string; exam_type?: string | null; title: string; score: number; correct_answers: number; total_questions: number; submitted_at: string; status: string };
type PracticeRoomData = { id: string; title: string; description?: string | null; exam_type?: string | null; examCount: number };
type ExamRoomsPayload = { rooms?: Array<{ id: string; title: string; description?: string | null; exam_type?: string | null }>; exams?: Array<{ id: string; room_id: string; published?: boolean; exam_type?: string | null }> };
type ChapterData = { id: string; course_id: string; title: string; sort_order: number };
type LessonData = { id: string; chapter_id: string; title: string; description: string; published: boolean; sort_order: number };
type ResourceData = { id: string; lesson_id: string; title: string; resource_type: "youtube" | "external_pdf" | "storage_pdf"; resource_url: string; allow_download: boolean; sort_order: number };
type LessonCurriculumSection = { id: string; title: string; sort_order: number; lessons: Array<LessonData & { resources: Array<SecureLessonResource & { lesson_id: string }> }> };
type AuthPageProps = {
  email: string;
  setEmail: React.Dispatch<React.SetStateAction<string>>;
  password: string;
  setPassword: React.Dispatch<React.SetStateAction<string>>;
  showPassword: boolean;
  setShowPassword: React.Dispatch<React.SetStateAction<boolean>>;
  authError: string;
  loading: boolean;
  setTurnstileToken: React.Dispatch<React.SetStateAction<string>>;
  turnstileResetNonce: number;
  login: (event: React.FormEvent) => Promise<void>;
  onForgot: () => void;
};
type IconComponent = React.ComponentType<{ className?: string }>;
type LessonWithChapterRow = {
  id: string;
  chapter_id: string;
  title: string;
  description: string | null;
  published: boolean;
  sort_order: number;
  chapters: {
    course_id: string;
    title: string;
    sort_order: number;
    courses: { title: string } | { title: string }[] | null;
  } | {
    course_id: string;
    title: string;
    sort_order: number;
    courses: { title: string } | { title: string }[] | null;
  }[] | null;
};

function courseColor(value: string | null | undefined) {
  return /^#[0-9a-f]{6}$/i.test(value ?? "") ? value! : "#cd1627";
}

function courseColorStyle(value: string | null | undefined) {
  return { "--course-color": courseColor(value) } as React.CSSProperties;
}

function cleanPartTitle(title: string) {
  return title.replace(/^\s*(?:phần|chương)\s+\d+\s*[:.\-–—]?\s*/i, "").trim() || title.trim();
}

function cleanLessonTitle(title: string) {
  return title.replace(/^\s*bài\s+\d+\s*[:.\-–—]?\s*/i, "").trim() || title.trim();
}

function formatPartTitle(title: string, index: number) {
  return `Phần ${index + 1}: ${cleanPartTitle(title)}`;
}

function formatLessonTitle(title: string, index: number) {
  return `Bài ${index + 1}: ${cleanLessonTitle(title)}`;
}

function resourceTypeLabel(type: ResourceData["resource_type"]) {
  return type === "youtube" ? "Video bài giảng" : type === "storage_pdf" ? "PDF trên R2 private" : "PDF / Google Drive";
}

const pathsByView: Record<View, string> = {
  overview: "/dashboard",
  exams: "/exam-room",
  courses: "/courses",
  history: "/exam-history",
  profile: "/profile",
  admin: "/admin",
  course: "/courses",
  lesson: "/courses",
};

function viewFromPath(pathname: string): View {
  if (pathname.startsWith("/lessons/")) return "lesson";
  if (pathname.startsWith("/courses/") && pathname !== "/courses/") return "course";
  if (pathname === "/courses") return "courses";
  if (pathname === "/exam-room" || pathname.startsWith("/exam-room/") || pathname.startsWith("/exam/")) return "exams";
  if (pathname === "/exam-history") return "history";
  if (pathname === "/profile") return "profile";
  if (pathname.startsWith("/admin")) return "admin";
  return "overview";
}

function isExamRunnerPath(pathname: string) {
  // /exam-room and /exam-room/:roomId are catalog surfaces. The result page
  // is a product/history surface too; only the active /exam/:id session and
  // its section routes keep the measured candidate runner shell.
  return /^\/exam\/(?!result(?:\/|$))/.test(pathname);
}

function isProtectedProductPath(pathname: string) {
  return isExamRunnerPath(pathname);
}

const nav = [
  { id: "overview" as View, label: "Tổng quan", icon: LayoutDashboard },
  { id: "exams" as View, label: "Phòng khảo thí", icon: ClipboardCheck },
  { id: "courses" as View, label: "Khóa học", icon: BookOpen },
  { id: "history" as View, label: "Lịch sử thi", icon: History },
];

const adminNav = [
  { id: "dashboard" as const, section: "Tổng quan", label: "Tổng quan", path: "/admin", icon: LayoutDashboard },
  { id: "content" as const, section: "Nội dung", label: "Tài nguyên", path: "/admin/content", icon: Library },
  { id: "question-bank" as const, section: "Nội dung", label: "Ngân hàng câu hỏi", path: "/admin/question-bank", icon: ListChecks },
  { id: "exams" as const, section: "Kỳ thi", label: "Đề thi", path: "/admin/exams", icon: ClipboardCheck },
  { id: "sessions" as const, section: "Kỳ thi", label: "Kíp thi", path: "/admin/sessions", icon: CalendarClock },
  { id: "students" as const, section: "Quản lý", label: "Học viên", path: "/admin/students", icon: Users },
  { id: "enrollments" as const, section: "Quản lý", label: "Phân quyền", path: "/admin/enrollments", icon: ShieldCheck },
  { id: "upload" as const, section: "Quản lý", label: "Kho ảnh", path: "/admin/upload", icon: ImagePlus },
  { id: "settings" as const, section: "Quản lý", label: "Cài đặt", path: "/admin/security", icon: LockKeyhole },
];
type AdminTab = typeof adminNav[number]["id"] | "students" | "upload" | "enrollments" | "security";

const adminNavGroups = ["Tổng quan", "Nội dung", "Kỳ thi", "Quản lý"].map(section => ({
  section,
  items: adminNav.filter(item => item.section === section),
}));


export default function PlatformApp({ initialAdminRoute = false, initialStandaloneAdminPreview = false, initialGuestToken }: { initialAdminRoute?: boolean; initialStandaloneAdminPreview?: boolean; initialGuestToken?: string }) {
  const [signedIn, setSignedIn] = useState(false);
  const [checkingSession, setCheckingSession] = useState(() => Boolean(supabase));
  const [, setAuthReady] = useState(() => !supabase);
  const [isAdmin, setIsAdmin] = useState(false);
  const [view, setView] = useState<View>("overview");
  const [sidebarOpen, setSidebarOpen] = useState(true);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [, setRouteVersion] = useState(0);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState("");
  const [loading, setLoading] = useState(false);
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);
  const [profileData, setProfileData] = useState<ProfileData | null>(null);
  const [assignedCourses, setAssignedCourses] = useState<CourseData[]>([]);
  const [practiceRooms, setPracticeRooms] = useState<PracticeRoomData[]>([]);
  const [attempts, setAttempts] = useState<AttemptData[]>([]);
  const [accountMenuOpen, setAccountMenuOpen] = useState(false);
  const [authMode, setAuthMode] = useState<AuthMode>("login");
  const [adminRouteRequested, setAdminRouteRequested] = useState(initialAdminRoute);
  const [standaloneAdminPreview, setStandaloneAdminPreview] = useState(initialStandaloneAdminPreview);
  const [loginContext, setLoginContext] = useState<"student" | "admin">(initialAdminRoute ? "admin" : "student");
  const authOperationRef = useRef(0);
  const accountTriggerRef = useRef<HTMLButtonElement | null>(null);
  const accountMenuRef = useRef<HTMLDivElement | null>(null);
  const mobileMenuRef = useRef<HTMLButtonElement | null>(null);
  const shellPath = typeof window === "undefined" ? "" : window.location.pathname;
  const runnerShellPath = isExamRunnerPath(shellPath);
  const closeMobileMenu = useCallback(() => {
    setMobileOpen(false);
    window.requestAnimationFrame(() => mobileMenuRef.current?.focus());
  }, []);
  const mobileSidebarRef = useAdminDialogFocus<HTMLElement>(mobileOpen && !runnerShellPath, closeMobileMenu);

  useEffect(() => {
    const currentParams = new URLSearchParams(window.location.search);
    if (currentParams.has("preview")) {
      currentParams.delete("preview");
      const remainingQuery = currentParams.toString();
      window.history.replaceState({}, "", `${window.location.pathname}${remainingQuery ? `?${remainingQuery}` : ""}${window.location.hash}`);
    }
    const syncRoute = () => {
      const adminPath = window.location.pathname.startsWith("/admin");
      setView(viewFromPath(window.location.pathname));
      setRouteVersion(value => value + 1);
      setAdminRouteRequested(adminPath);
      setStandaloneAdminPreview(adminPath && (/^\/admin\/exams\/[^/]+\/preview$/.test(window.location.pathname) || /^\/admin\/exams\/[^/]+\/sections\/[^/]+\/preview$/.test(window.location.pathname)));
      setLoginContext(adminPath ? "admin" : "student");
      setAuthMode(window.location.pathname === "/forgot-password" ? "forgot" : window.location.pathname === "/reset-password" ? "reset" : "login");
    };
    syncRoute();
    window.addEventListener("popstate", syncRoute);
    if (!supabase) return () => window.removeEventListener("popstate", syncRoute);
    let active = true;
    const operationId = authOperationRef.current;
    const isCurrentOperation = () => active && authOperationRef.current === operationId;
    supabase.auth.getSession().then(async ({ data }) => {
      if (!isCurrentOperation()) return;
      if (!data.session) { setSignedIn(false); setAuthReady(true); setCheckingSession(false); return; }
      // A session restored from browser storage can be stale even when it has
      // not been removed locally. Verify the access token with Supabase before
      // trusting its cached user/profile in the admin shell.
      const accessToken = await activeSessionToken().catch(() => null);
      if (!isCurrentOperation()) return;
      if (!accessToken) {
        await supabase!.auth.signOut({ scope: "local" }).catch(() => undefined);
        if (!isCurrentOperation()) return;
        setSignedIn(false);
        setProfileData(null);
        setIsAdmin(false);
        setAuthReady(true);
        setCheckingSession(false);
        return;
      }
      const { data: verifiedUser, error: verificationError } = await supabase!.auth.getUser(accessToken);
      if (!isCurrentOperation()) return;
      if (verificationError || !verifiedUser.user) {
        await supabase!.auth.signOut({ scope: "local" }).catch(() => undefined);
        if (!isCurrentOperation()) return;
        setSignedIn(false);
        setProfileData(null);
        setIsAdmin(false);
        setAuthReady(true);
        setCheckingSession(false);
        return;
      }
      const profile = await loadUserData(verifiedUser.user);
      if (!isCurrentOperation()) return;
      if (!profile || profile.status === "locked") {
        await supabase!.auth.signOut({ scope: "local" }).catch(() => undefined);
        if (!isCurrentOperation()) return;
        setSignedIn(false);
        setProfileData(null);
        setIsAdmin(false);
      } else setSignedIn(true);
      setAuthReady(true);
      setCheckingSession(false);
    }).catch(() => {
      if (!active) return;
      setSignedIn(false);
      setAuthReady(true);
      setCheckingSession(false);
    });
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setAuthMode("reset");
      if (event === "SIGNED_OUT" || !session) {
        setSignedIn(false);
        setProfileData(null);
        setIsAdmin(false);
        setAssignedCourses([]);
        setPracticeRooms([]);
        setAttempts([]);
        setAuthReady(true);
        setCheckingSession(false);
      }
    });
    return () => { active = false; data.subscription.unsubscribe(); window.removeEventListener("popstate", syncRoute); };
  }, []);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.body.style.overflow;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === "Escape") closeMobileMenu(); };
    const shouldIsolate = !runnerShellPath;
    const background = shouldIsolate
      ? Array.from(document.querySelectorAll<HTMLElement>(".ui-shell.product-shell > .topbar, .ui-shell.product-shell > .main-content"))
      : [];
    document.body.style.overflow = "hidden";
    background.forEach(element => { element.inert = true; });
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.body.style.overflow = previousOverflow;
      background.forEach(element => { element.inert = false; });
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [closeMobileMenu, mobileOpen, runnerShellPath]);

  useEffect(() => {
    if (!accountMenuOpen) return;
    const menu = accountMenuRef.current;
    const firstItem = menu?.querySelector<HTMLElement>("[data-account-menu-item]");
    firstItem?.focus();

    const closeOnPointerDown = (event: PointerEvent) => {
      const target = event.target as Node;
      if (!menu?.contains(target) && !accountTriggerRef.current?.contains(target)) setAccountMenuOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setAccountMenuOpen(false);
      accountTriggerRef.current?.focus();
    };
    document.addEventListener("pointerdown", closeOnPointerDown);
    window.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("pointerdown", closeOnPointerDown);
      window.removeEventListener("keydown", closeOnEscape);
    };
  }, [accountMenuOpen]);

  useEffect(() => {
    if (!signedIn || view !== "overview") return;
    let active = true;
    const refreshOverviewData = async () => {
      const [historyResponse, roomsResponse] = await Promise.all([
        authenticatedFetch("/api/exams?scope=history", { cache: "no-store" }).catch(() => null),
        authenticatedFetch("/api/exams?scope=rooms", { cache: "no-store" }).catch(() => null),
      ]);
      if (!active) return;
      if (historyResponse?.ok) {
        const payload = await historyResponse.json().catch(() => null) as { attempts?: AttemptData[] } | null;
        if (active && payload?.attempts) setAttempts(payload.attempts);
      }
      if (roomsResponse?.ok) {
        const payload = await roomsResponse.json().catch(() => null) as ExamRoomsPayload | null;
        if (!active || !payload) return;
        const examRows = payload.exams ?? [];
        setPracticeRooms((payload.rooms ?? []).map(room => ({
          id: room.id,
          title: room.title,
          description: room.description ?? null,
          exam_type: room.exam_type ?? null,
          examCount: examRows.filter(exam => exam.room_id === room.id && exam.published !== false).length,
        })));
      }
    };
    void refreshOverviewData();
    return () => { active = false; };
  }, [signedIn, view]);

  async function loadUserData(user: { id: string; email?: string | null }) {
    if (!supabase) return null;
    const [profileResult, attemptResult, examRoomsResponse] = await Promise.all([
      supabase.from("profiles").select("full_name,student_code,role,status").eq("id", user.id).single(),
      supabase.from("exam_attempts").select("id,exam_id,title,score,correct_answers,total_questions,submitted_at,status").eq("student_id", user.id).order("submitted_at", { ascending: false }),
      authenticatedFetch("/api/exams?scope=rooms", { cache: "no-store" }).catch(() => null),
    ]);
    const profile = profileResult.data as Omit<ProfileData, "email"> | null;
    const administrator = profile?.role === "admin" && profile.status === "active";
    setProfileData(profile ? { ...profile, email: user.email ?? "" } : null);
    setIsAdmin(administrator);
    if (!profile) {
      setAssignedCourses([]);
      setPracticeRooms([]);
      setAttempts([]);
      return null;
    }

    const examRoomsPayload = examRoomsResponse?.ok
      ? await examRoomsResponse.json().catch(() => null) as ExamRoomsPayload | null
      : null;
    const examRows = examRoomsPayload?.exams ?? [];
    const examTypeById = new Map(examRows.map(exam => [exam.id, exam.exam_type ?? null]));
    const accessibleRooms = (examRoomsPayload?.rooms ?? []).map(room => ({
      id: room.id,
      title: room.title,
      description: room.description ?? null,
      exam_type: room.exam_type ?? null,
      examCount: examRows.filter(exam => exam.room_id === room.id && exam.published !== false).length,
    }));

    const courseResult = administrator
      ? await supabase.from("courses").select("id,title,description,cover_url,cover_color,published").order("sort_order").order("created_at")
      : await supabase.from("course_enrollments").select("course_id,courses(id,title,description,cover_url,cover_color,published)").eq("student_id", user.id);
    const accessibleCourses = administrator
      ? ((courseResult.data ?? []) as CourseRow[]).map(course => ({ id: course.id, title: course.title, description: course.description ?? "", cover_url: course.cover_url ?? null, published: course.published, lessons: 0, color: courseColor(course.cover_color) }))
      : ((courseResult.data ?? []) as EnrollmentCourseRow[]).flatMap(row => {
          const course = Array.isArray(row.courses) ? row.courses[0] : row.courses;
          return course ? [{ id: course.id, title: course.title, description: course.description ?? "", cover_url: course.cover_url ?? null, published: course.published, lessons: 0, color: courseColor(course.cover_color) }] : [];
        });
    let coursesWithCounts = accessibleCourses as CourseData[];
    const accessibleCourseIds = accessibleCourses.map(course => String(course.id));
    if (accessibleCourseIds.length) {
      const { data: chapterRows } = await supabase.from("chapters").select("id,course_id").in("course_id", accessibleCourseIds);
      const chapterIds = (chapterRows ?? []).map(chapter => chapter.id);
      const lessonQuery = supabase.from("lessons").select("id,chapter_id,published").in("chapter_id", chapterIds);
      const { data: lessonRows } = chapterIds.length ? await (administrator ? lessonQuery : lessonQuery.eq("published", true)) : { data: [] };
      const chapterCourse = Object.fromEntries((chapterRows ?? []).map(chapter => [chapter.id, chapter.course_id]));
      const lessonCounts = (lessonRows ?? []).reduce<Record<string, number>>((counts, lesson) => {
        const courseId = chapterCourse[lesson.chapter_id];
        if (courseId) counts[courseId] = (counts[courseId] ?? 0) + 1;
        return counts;
      }, {});
      coursesWithCounts = accessibleCourses.map(course => ({ ...course, lessons: lessonCounts[String(course.id)] ?? 0 }));
    }
    setAssignedCourses(coursesWithCounts);
    setPracticeRooms(accessibleRooms);
    setAttempts((attemptResult.data ?? []).map(attempt => ({ ...attempt, exam_type: examTypeById.get(attempt.exam_id) ?? null })) as AttemptData[]);
    return profile;
  }

  async function login(e: React.FormEvent) {
    e.preventDefault();
    if (loading) return;
    setAuthError("");
    if (!turnstileToken) {
      setAuthError("Vui lòng hoàn tất xác minh chống spam trước khi đăng nhập.");
      return;
    }
    // Invalidate the one-time bootstrap check. It may still be validating a
    // stale session restored from storage while this fresh login is running.
    authOperationRef.current += 1;
    setLoading(true);
    if (!supabase) {
      setAuthError("Chưa cấu hình Supabase.");
      setLoading(false);
      setTurnstileToken("");
      setTurnstileResetNonce(value => value + 1);
      return;
    }

    // Do not sign out before attempting the new login. Supabase already
    // replaces a valid session after a successful password login, while a
    // pre-emptive sign-out can race with the new session notification.
    const { data: currentSession } = await supabase.auth.getSession().catch(() => ({ data: { session: null } }));

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
        options: { captchaToken: turnstileToken },
      });
      if (error) {
        if (currentSession.session) await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        setSignedIn(false);
        setProfileData(null);
        setIsAdmin(false);
        const status = Number(error.status ?? 0);
        const code = String(error.code ?? "").toLowerCase();
        const message = String(error.message ?? "").toLowerCase();
        const captchaFailed = code.includes("captcha") || message.includes("captcha");
        setAuthError(
          captchaFailed
            ? "Xác minh chống spam không thành công. Vui lòng thử lại."
            : status === 429 || code.includes("rate")
            ? "Bạn thử đăng nhập quá nhiều lần. Hãy chờ một lát rồi thử lại."
            : code === "email_not_confirmed" || message.includes("email not confirmed")
              ? "Email tài khoản chưa được xác minh."
              : status >= 500 || message.includes("fetch") || message.includes("network")
                ? "Không thể kết nối dịch vụ đăng nhập. Hãy kiểm tra máy chủ rồi thử lại."
                : "Email hoặc mật khẩu không chính xác."
        );
        return;
      }

      if (!data.user || !data.session) {
        setSignedIn(false);
        setProfileData(null);
        setIsAdmin(false);
        setAuthError("Không nhận được phiên đăng nhập từ Supabase. Hãy thử lại.");
        return;
      }

      const profile = await loadUserData(data.user);
      if (!profile) {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        setSignedIn(false);
        setProfileData(null);
        setIsAdmin(false);
        setAuthError("Tài khoản chưa có hồ sơ hợp lệ.");
        return;
      }
      if (profile.status === "locked") {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        setSignedIn(false);
        setProfileData(null);
        setIsAdmin(false);
        setAuthError("Tài khoản đã bị khóa.");
        return;
      }
      if (loginContext === "admin" && profile.role !== "admin") {
        await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
        setSignedIn(false);
        setProfileData(null);
        setIsAdmin(false);
        setAuthError("Tài khoản này không có quyền quản trị.");
        return;
      }

      setSignedIn(true);
      const adminPath = loginContext === "admin";
      setView(adminPath ? "admin" : "overview");
      const adminDestination = window.location.pathname.startsWith("/admin") ? window.location.pathname : "/admin";
      window.history.replaceState({}, "", adminPath ? adminDestination : "/dashboard");
    } catch (error) {
      await supabase.auth.signOut({ scope: "local" }).catch(() => undefined);
      setSignedIn(false);
      setProfileData(null);
      setIsAdmin(false);
      setAuthError(error instanceof Error && /fetch|network/i.test(error.message)
        ? "Không thể kết nối dịch vụ đăng nhập. Hãy kiểm tra máy chủ rồi thử lại."
        : "Không thể hoàn tất đăng nhập. Hãy thử lại.");
    } finally {
      setTurnstileToken("");
      setTurnstileResetNonce(value => value + 1);
      setLoading(false);
    }
  }

  const showLogin = () => {
    setAuthMode("login");
    window.history.replaceState({}, "", loginContext === "admin" ? "/admin" : "/");
  };
  if (checkingSession && !initialGuestToken) return <LoadingIndicator label="Đang xác thực tài khoản…" fullPage />;
  if (initialGuestToken && !adminRouteRequested) return <Suspense fallback={<LoadingIndicator label="Đang mở link thi…" fullPage />}><GuestExamModule token={initialGuestToken} /></Suspense>;
  if (authMode === "forgot") return <ForgotPasswordPage initialEmail={email} onBack={showLogin} />;
  if (authMode === "reset") return <ResetPasswordPage onComplete={showLogin} />;
  if (adminRouteRequested && (!signedIn || !isAdmin)) return <AdminLoginPage {...{ email, setEmail, password, setPassword, showPassword, setShowPassword, authError, loading, setTurnstileToken, turnstileResetNonce, login, onForgot: () => { setLoginContext("admin"); setAuthMode("forgot"); window.history.pushState({}, "", "/forgot-password"); } }} />;
  if (!signedIn) return <LoginPage {...{ email, setEmail, password, setPassword, showPassword, setShowPassword, authError, loading, setTurnstileToken, turnstileResetNonce, login, onForgot: () => { setLoginContext("student"); setAuthMode("forgot"); window.history.pushState({}, "", "/forgot-password"); } }} />;

  const go = (next: View, pathOverride?: string) => {
    if (next === "admin" && !isAdmin) {
      setView("overview");
      setMobileOpen(false);
      window.history.replaceState({}, "", "/dashboard");
      return;
    }
    setView(next);
    setMobileOpen(false);
    const target = pathOverride ?? pathsByView[next];
    if (`${window.location.pathname}${window.location.search}` !== target) {
      window.history.pushState({}, "", target);
      window.dispatchEvent(new PopStateEvent("popstate"));
    }
  };
  if (!profileData) return <LoginPage {...{ email, setEmail, password, setPassword, showPassword, setShowPassword, authError: "Không tìm thấy hồ sơ tài khoản hợp lệ.", loading: false, setTurnstileToken, turnstileResetNonce, login, onForgot: () => { setAuthMode("forgot"); window.history.pushState({}, "", "/forgot-password"); } }} />;
  if (standaloneAdminPreview) return <div className="ui-shell admin-app admin-exam-preview-host"><Suspense fallback={<LoadingIndicator label="Đang mở preview đề thi…" />}><AdminExamManager /></Suspense></div>;
  const activeProfile = profileData;
  const currentView: View = view;
  const currentAdminTab = adminRouteRequested ? adminTabFromPath(window.location.pathname) : "";
  const visibleCourses = assignedCourses;
  const routeCourseId = currentView === "course" || currentView === "lesson" ? decodeURIComponent(window.location.pathname.split("/")[2] ?? "") : "";
  const selectedCourse = visibleCourses.find(course => String(course.id) === routeCourseId) ?? null;
  const accountLabel = activeProfile.email.split("@")[0] || activeProfile.full_name;
  const accountInitials = activeProfile.full_name.split(" ").filter(Boolean).slice(-2).map(value => value[0]).join("").toUpperCase();
  const adminNavigation = adminRouteRequested ? adminNav.map(item => item) : [];
  const activeAdminNavigation = adminNavigation.find(item => item.id === currentAdminTab) ?? adminNav[0];
  const currentPath = typeof window === "undefined" ? "" : window.location.pathname;
  const examRunnerSurface = currentView === "exams" && isExamRunnerPath(currentPath);
  const protectedProductSurface = isProtectedProductPath(currentPath);
  const handleNavigationLink = (event: React.MouseEvent<HTMLAnchorElement>, next: View, path: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    go(next, path);
  };
  const handleAccountMenuKeyDown = (event: React.KeyboardEvent<HTMLDivElement>) => {
    const items = Array.from(accountMenuRef.current?.querySelectorAll<HTMLElement>("[data-account-menu-item]") ?? []);
    const currentIndex = items.indexOf(document.activeElement as HTMLElement);
    if (event.key === "Escape") {
      event.preventDefault();
      setAccountMenuOpen(false);
      accountTriggerRef.current?.focus();
      return;
    }
    if (!["ArrowDown", "ArrowUp", "Home", "End"].includes(event.key) || items.length === 0) return;
    event.preventDefault();
    const nextIndex = event.key === "Home"
      ? 0
      : event.key === "End"
        ? items.length - 1
        : (currentIndex + (event.key === "ArrowDown" ? 1 : -1) + items.length) % items.length;
    items[nextIndex]?.focus();
  };
  return (
    <div className={`app-shell ui-shell ${adminRouteRequested ? "admin-app" : "student-app"} ${examRunnerSurface ? "exam-shell" : "product-shell"} ${protectedProductSurface ? "protected-exam-surface" : ""} ${sidebarOpen ? "sidebar-expanded" : ""}`}>
      {!examRunnerSurface && <a className="skip-link" href="#main-content">Bỏ qua đến nội dung chính</a>}
      <button type="button" className={`mobile-shade ${mobileOpen ? "show" : ""}`} onClick={closeMobileMenu} aria-label="Đóng menu" tabIndex={mobileOpen ? 0 : -1} />
      {!examRunnerSurface && !protectedProductSurface && (
        <aside ref={mobileSidebarRef} id="main-sidebar" className={`sidebar ${adminRouteRequested ? "admin-sidebar" : ""} ${mobileOpen ? "mobile-open" : ""}`} aria-label={adminRouteRequested ? "Điều hướng quản trị" : "Điều hướng chính"} aria-modal={mobileOpen && !examRunnerSurface ? "true" : undefined} role={mobileOpen && !examRunnerSurface ? "dialog" : undefined}>
           <div className="mobile-sidebar-head"><Link className="mobile-sidebar-brand" href={adminRouteRequested ? "/admin" : "/dashboard"} onClick={event => handleNavigationLink(event, adminRouteRequested ? "admin" : "overview", adminRouteRequested ? "/admin" : "/dashboard")} aria-label={adminRouteRequested ? "Về tổng quan quản trị" : "Về tổng quan"}><img src="/logo_tsa.svg" alt="TSA"/></Link><button type="button" className="mobile-sidebar-close" onClick={closeMobileMenu} aria-label="Đóng menu"><X aria-hidden="true"/></button></div>
          <nav>
            {adminRouteRequested ? <>
              {adminNavGroups.map(group => <div className="admin-sidebar-group" key={group.section}>
                <div className="admin-sidebar-section-label">{group.section}</div>
                {group.items.map(item => <Link key={`admin-${item.id}`} href={item.path} className={`admin-sidebar-nav-item ${currentAdminTab === item.id ? "active" : ""}`} onClick={event => handleNavigationLink(event, "admin", item.path)} title={item.label} aria-label={item.label} aria-current={currentAdminTab === item.id ? "page" : undefined}><item.icon aria-hidden="true" /><span>{item.label}</span></Link>)}
              </div>)}
            </> : <>{nav.map(item => <Link key={item.id} href={pathsByView[item.id]} className={currentView === item.id ? "active" : ""} onClick={event => handleNavigationLink(event, item.id, pathsByView[item.id])} title={item.label} aria-label={item.label} aria-current={currentView === item.id ? "page" : undefined}><item.icon aria-hidden="true" /><span>{item.label}</span></Link>)}{isAdmin && <Link href="/admin" className={currentView === "admin" ? "active" : ""} onClick={event => handleNavigationLink(event, "admin", "/admin")} title="Quản trị" aria-label="Quản trị" aria-current={currentView === "admin" ? "page" : undefined}><ShieldCheck aria-hidden="true" /><span>Quản trị</span></Link>}</>}
          </nav>
          <Link className="mobile-sidebar-account" href={adminRouteRequested ? "/admin" : "/profile"} onClick={event => handleNavigationLink(event, adminRouteRequested ? "admin" : "profile", adminRouteRequested ? "/admin" : "/profile")}><span className="mini-avatar">{activeProfile.full_name.split(" ").slice(-2).map(value=>value[0]).join("").toUpperCase()}</span><span><b>{activeProfile.full_name}</b><small>{adminRouteRequested ? "Quản trị viên" : activeProfile.student_code}</small></span><ChevronRight aria-hidden="true"/></Link>
        </aside>
      )}
      {!examRunnerSurface && !protectedProductSurface && (
        <header className={`topbar ${adminRouteRequested ? "admin-topbar" : ""}`}>
          <Link className="header-brand" href={adminRouteRequested ? "/admin" : "/dashboard"} onClick={event => handleNavigationLink(event, adminRouteRequested ? "admin" : "overview", adminRouteRequested ? "/admin" : "/dashboard")} aria-label={adminRouteRequested ? "Về tổng quan quản trị" : "Về tổng quan"}><img className="header-brand-logo header-brand-logo-compact" src="/logo.svg" alt=""/><img className="header-brand-logo header-brand-logo-full" src="/logo_tsa.svg" alt=""/></Link>
          <button type="button" className="header-sidebar-toggle" onClick={() => setSidebarOpen(v => !v)} aria-label={sidebarOpen ? "Thu gọn menu" : "Mở rộng menu"} aria-controls="main-sidebar" aria-expanded={sidebarOpen}><ChevronRight /></button>
          <button ref={mobileMenuRef} type="button" className="mobile-menu" onClick={() => setMobileOpen(true)} aria-label="Mở menu" aria-controls="main-sidebar" aria-expanded={mobileOpen}><Menu /></button>
          {adminRouteRequested && <nav className="admin-topbar-context" aria-label="Vị trí hiện tại"><Link href="/admin" onClick={event => handleNavigationLink(event, "admin", "/admin")}>Quản trị</Link><ChevronRight aria-hidden="true"/><span aria-current="page">{activeAdminNavigation.label}</span></nav>}
          <div className="top-actions">
            <div className={`account-menu-wrap ${accountMenuOpen ? "open" : ""}`}>
              <button type="button" ref={accountTriggerRef} className="account-trigger" aria-label={`Mở menu tài khoản ${accountLabel}`} aria-haspopup="menu" aria-controls="account-menu" aria-expanded={accountMenuOpen} onClick={() => setAccountMenuOpen(value => !value)}><span className="account-avatar" aria-hidden="true">{accountInitials}</span><span className="account-name">{accountLabel}</span><ChevronDown aria-hidden="true" /></button>
              <div id="account-menu" ref={accountMenuRef} className="account-dropdown" role="menu" aria-label="Menu tài khoản" hidden={!accountMenuOpen} onKeyDown={handleAccountMenuKeyDown}>
                <Link href="/profile" role="menuitem" data-account-menu-item onClick={event => { handleNavigationLink(event, "profile", "/profile"); setAccountMenuOpen(false); }}><UserRound aria-hidden="true" /><span>Tài khoản</span></Link>
                <button type="button" role="menuitem" data-account-menu-item onClick={async () => { if (supabase) await supabase.auth.signOut(); setSignedIn(false); setView("overview"); setAccountMenuOpen(false); window.history.replaceState({}, "", "/"); }}><LogOut aria-hidden="true" /><span>Đăng xuất</span></button>
              </div>
            </div>
          </div>
        </header>
      )}
      <main id="main-content" className={`main-content ${currentView === "lesson" ? "lesson-main-content" : ""} ${examRunnerSurface ? "exam-view-content" : "product-view-content"}`}>
        {currentView === "overview" && <Overview onCourses={() => go("courses")} onExams={() => go("exams")} onOpenRoom={roomId => go("exams", `/exam-room/${encodeURIComponent(roomId)}`)} onOpenAttempt={attemptId => go("exams", `/exam/result/${encodeURIComponent(attemptId)}`)} profile={activeProfile} userCourses={visibleCourses} practiceRooms={practiceRooms} attempts={attempts} />}
        {currentView === "courses" && <Courses courses={visibleCourses} isAdmin={isAdmin} onOpen={courseId => go("course", `/courses/${encodeURIComponent(String(courseId))}`)} />}
        {currentView === "course" && <CourseDetail course={selectedCourse} showDrafts={isAdmin} onBack={() => go("courses")} onLesson={lessonId => go("lesson", `/lessons/${encodeURIComponent(lessonId)}`)} />}
        {currentView === "lesson" && <LessonViewer lessonId={routeCourseId} onBack={courseId => courseId ? go("course", `/courses/${encodeURIComponent(courseId)}`) : go("courses")} onLesson={(nextLessonId, resourceId) => go("lesson", `/lessons/${encodeURIComponent(nextLessonId)}${resourceId ? `?resource=${encodeURIComponent(resourceId)}` : ""}`)} />}
        {currentView === "exams" && <Suspense fallback={<LoadingIndicator label="Đang mở phòng khảo thí…" />}><ExamRoomModule /></Suspense>}
        {currentView === "history" && <ExamHistory attempts={attempts} onOpen={attemptId => go("exams", `/exam/result/${encodeURIComponent(attemptId)}`)} />}
        {currentView === "profile" && <Profile profile={activeProfile} attempts={attempts} onProfileUpdated={updatedProfile => setProfileData(updatedProfile)} />}
        {currentView === "admin" && isAdmin && <RealAdminDashboard />}
      </main>
    </div>
  );
}

function LoginPage(p: AuthPageProps) {
  return <main className="login-page">
    <div className="login-orb orb-one" /><div className="login-orb orb-two" />
    <section className="login-wrap">
      <div className="login-brand"><span>R</span><div><b>REMIX</b><small>EDUCATION</small></div></div>
      <form className="login-card" onSubmit={p.login}>
        <div className="login-heading"><span className="kicker">CHÀO MỪNG TRỞ LẠI</span><h1>Đăng nhập</h1><p>Tài khoản học tập được cấp bởi quản trị viên.</p></div>
        <label htmlFor="login-email">Email<div className="field"><Mail aria-hidden="true" /><input id="login-email" name="email" type="email" autoComplete="username" spellCheck={false} value={p.email} onChange={(e) => p.setEmail(e.target.value)} placeholder="hocvien@example.com" required /></div></label>
        <div className="login-field-group"><label htmlFor="login-password">Mật khẩu</label><div className="field"><LockKeyhole aria-hidden="true" /><input id="login-password" name="password" type={p.showPassword ? "text" : "password"} autoComplete="current-password" value={p.password} onChange={(event) => p.setPassword(event.target.value)} placeholder="Nhập mật khẩu" required /><button type="button" aria-label={p.showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={p.showPassword} onClick={() => p.setShowPassword(!p.showPassword)}>{p.showPassword ? <EyeOff aria-hidden="true" /> : <Eye aria-hidden="true" />}</button></div></div>
        <TurnstileChallenge action="login" onTokenChange={p.setTurnstileToken} resetSignal={p.turnstileResetNonce} />
        {p.authError && <p className="form-error" role="alert">{p.authError}</p>}
        <button className="primary-btn" disabled={p.loading}>{p.loading ? "Đang đăng nhập…" : "Đăng nhập"}</button>
        <button className="forgot" type="button" onClick={p.onForgot}>Quên mật khẩu?</button>
      </form>
      <p className="login-foot">© 2026 REMIX Education · Học để trưởng thành</p>
    </section>
  </main>;
}

function AdminLoginPage(p: AuthPageProps) {
  return <main className="login-page admin-login-page">
    <section className="login-wrap">
      <div className="login-brand admin-login-brand"><span><ShieldCheck/></span><div><b>REMIX</b><small>TEACHER WORKSPACE</small></div></div>
      <form className="login-card" onSubmit={p.login}>
        <div className="login-heading"><span className="kicker">KHÔNG GIAN GIÁO VIÊN</span><h1>Đăng nhập để quản lý</h1><p>Soạn đề, tổ chức đợt thi và xem kết quả ở một nơi.</p></div>
        <label htmlFor="admin-login-email">Email<div className="field"><Mail aria-hidden="true"/><input id="admin-login-email" name="email" type="email" autoComplete="username" spellCheck={false} value={p.email} onChange={(event: React.ChangeEvent<HTMLInputElement>) => p.setEmail(event.target.value)} placeholder="admin@example.com" required/></div></label>
        <div className="login-field-group"><label htmlFor="admin-login-password">Mật khẩu</label><div className="field"><LockKeyhole aria-hidden="true"/><input id="admin-login-password" name="password" type={p.showPassword ? "text" : "password"} autoComplete="current-password" value={p.password} onChange={(event: React.ChangeEvent<HTMLInputElement>) => p.setPassword(event.target.value)} placeholder="Nhập mật khẩu admin" required/><button type="button" aria-label={p.showPassword ? "Ẩn mật khẩu" : "Hiện mật khẩu"} aria-pressed={p.showPassword} onClick={() => p.setShowPassword(!p.showPassword)}>{p.showPassword ? <EyeOff aria-hidden="true"/> : <Eye aria-hidden="true"/>}</button></div></div>
        <TurnstileChallenge action="login" onTokenChange={p.setTurnstileToken} resetSignal={p.turnstileResetNonce} />
        {p.authError && <p className="form-error" role="alert">{p.authError}</p>}
        <button className="primary-btn" disabled={p.loading}>{p.loading ? "Đang xác thực…" : "Vào trang quản trị"}</button>
        <button className="forgot" type="button" onClick={p.onForgot}>Quên mật khẩu?</button>
      </form>
      <p className="login-foot">Không gian này chỉ dành cho giáo viên và quản trị viên.</p>
    </section>
  </main>;
}

function ForgotPasswordPage({ initialEmail, onBack }: { initialEmail: string; onBack: () => void }) {
  const [recoveryEmail, setRecoveryEmail] = useState(initialEmail);
  const [sending, setSending] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [turnstileToken, setTurnstileToken] = useState("");
  const [turnstileResetNonce, setTurnstileResetNonce] = useState(0);

  async function sendRecovery(event: React.FormEvent) {
    event.preventDefault();
    setMessage(""); setError("");
    if (!turnstileToken) {
      setError("Vui lòng hoàn tất xác minh chống spam trước khi gửi liên kết.");
      return;
    }
    setSending(true);
    try {
      if (!supabase) { setError("Chưa cấu hình Supabase."); return; }
      const redirectTo = `${window.location.origin}/reset-password`;
      const { error: recoveryError } = await supabase.auth.resetPasswordForEmail(recoveryEmail.trim(), {
        redirectTo,
        captchaToken: turnstileToken,
      });
      if (recoveryError) {
        setError(/captcha/i.test(recoveryError.message)
          ? "Xác minh chống spam không thành công. Vui lòng thử lại."
          : recoveryError.message);
        return;
      }
      setMessage("Đã gửi liên kết đặt lại mật khẩu. Hãy kiểm tra hộp thư và thư rác.");
    } finally {
      setTurnstileToken("");
      setTurnstileResetNonce(value => value + 1);
      setSending(false);
    }
  }

  return <main className="login-page auth-flow-page">
    <section className="login-wrap">
      <div className="login-brand"><span>R</span><div><b>REMIX</b><small>EDUCATION</small></div></div>
      <form className="login-card" onSubmit={sendRecovery}>
        <div className="login-heading"><span className="kicker">KHÔI PHỤC TÀI KHOẢN</span><h1>Quên mật khẩu</h1><p>Nhập email đã được cấp để nhận liên kết đặt lại mật khẩu.</p></div>
        <label htmlFor="recovery-email">Email<div className="field"><Mail aria-hidden="true" /><input id="recovery-email" name="email" type="email" autoComplete="username" spellCheck={false} value={recoveryEmail} onChange={(event) => setRecoveryEmail(event.target.value)} placeholder="hocvien@example.com" required /></div></label>
        <TurnstileChallenge action="password_reset" onTokenChange={setTurnstileToken} resetSignal={turnstileResetNonce} />
        {error && <p className="form-error" role="alert">{error}</p>}
        {message && <p className="form-success" role="status" aria-live="polite">{message}</p>}
        <button className="primary-btn" disabled={sending}>{sending ? "Đang gửi…" : "Gửi liên kết đặt lại"}</button>
        <button className="forgot" type="button" onClick={onBack}>Quay lại đăng nhập</button>
      </form>
    </section>
  </main>;
}

function ResetPasswordPage({ onComplete }: { onComplete: () => void }) {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function resetPassword(event: React.FormEvent) {
    event.preventDefault();
    setError("");
    if (newPassword.length < 8) { setError("Mật khẩu phải có ít nhất 8 ký tự."); return; }
    if (newPassword !== confirmPassword) { setError("Hai mật khẩu không trùng khớp."); return; }
    if (!supabase) { setError("Chưa cấu hình Supabase."); return; }
    const accessToken = await activeSessionToken().catch(() => null);
    if (!accessToken) { setError("Liên kết đã hết hạn hoặc không hợp lệ. Hãy yêu cầu một liên kết mới."); return; }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password: newPassword });
      if (updateError) throw updateError;
      await supabase.auth.signOut();
      onComplete();
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể đặt mật khẩu mới. Hãy thử lại.");
    } finally {
      setSaving(false);
    }
  }

  return <main className="login-page auth-flow-page">
    <section className="login-wrap">
      <div className="login-brand"><span>R</span><div><b>REMIX</b><small>EDUCATION</small></div></div>
      <form className="login-card" onSubmit={resetPassword}>
        <div className="login-heading"><span className="kicker">BẢO MẬT</span><h1>Đặt mật khẩu mới</h1><p>Mật khẩu mới cần có ít nhất 8 ký tự.</p></div>
        <label htmlFor="new-password">Mật khẩu mới<div className="field"><LockKeyhole aria-hidden="true" /><input id="new-password" name="newPassword" type="password" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} autoComplete="new-password" required /></div></label>
        <label htmlFor="confirm-password">Xác nhận mật khẩu<div className="field"><LockKeyhole aria-hidden="true" /><input id="confirm-password" name="confirmPassword" type="password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} autoComplete="new-password" required /></div></label>
        {error && <p className="form-error" role="alert">{error}</p>}
        <button className="primary-btn" disabled={saving}>{saving ? "Đang cập nhật…" : "Đặt mật khẩu mới"}</button>
        <button className="forgot" type="button" onClick={onComplete}>Quay lại đăng nhập</button>
      </form>
    </section>
  </main>;
}

function Overview({ onCourses, onExams, onOpenRoom, onOpenAttempt, profile, userCourses, practiceRooms, attempts }: { onCourses: () => void; onExams: () => void; onOpenRoom: (roomId: string) => void; onOpenAttempt: (attemptId: string) => void; profile: ProfileData; userCourses: CourseData[]; practiceRooms: PracticeRoomData[]; attempts: AttemptData[] }) {
  const followLink = (event: React.MouseEvent<HTMLAnchorElement>, action: () => void) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    action();
  };
  const year = new Date().getFullYear();
  const completedAttempts = attempts.filter(item => item.status !== "in_progress" && Boolean(item.submitted_at));
  const yearAttempts = completedAttempts.filter(item => new Date(item.submitted_at).getFullYear() === year);
  const activity = yearAttempts.reduce<Record<string, number>>((map, item) => {
    const date = new Date(item.submitted_at);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    map[key] = (map[key] ?? 0) + 1; return map;
  }, {});
  const firstDayOffset = new Date(year, 0, 1).getDay();
  const dayCount = Math.round((Date.UTC(year + 1, 0, 1) - Date.UTC(year, 0, 1)) / 86_400_000);
  const heatmapDayCount = Math.ceil((firstDayOffset + dayCount) / 7) * 7;
  const activityDays = Array.from({ length: heatmapDayCount }, (_, index) => {
    const date = new Date(year, 0, 1 - firstDayOffset + index);
    const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
    const inYear = date.getFullYear() === year;
    const count = inYear ? activity[key] ?? 0 : 0;
    return { date, count, inYear };
  });
  const activityDateFormat = new Intl.DateTimeFormat("vi-VN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  const recent = completedAttempts.slice(0, 5);
  const top = [...completedAttempts].sort((a, b) => Number(b.score ?? 0) - Number(a.score ?? 0)).slice(0, 5);
  return <div className="page-stack dashboard-page">
    <section className="overview-summary">
      <div className="overview-user"><span className="overview-avatar"><UserRound /></span><div><small>Xin chào,</small><h2>{profile.full_name}</h2><p>{profile.email}</p></div></div>
      <i className="summary-divider" />
      <div className="overview-number"><small>Tổng bài đã làm</small><b>{completedAttempts.length}</b><span>bài thi</span></div>
      <div className="overview-number"><small>Trong năm {year}</small><b>{yearAttempts.length}</b><span>bài thi</span></div>
      <div className="overview-role"><small>Vai trò</small><b>{profile.role === "admin" ? "QUẢN TRỊ VIÊN" : "HỌC SINH"}</b><span>{profile.student_code}</span></div>
    </section>
    <section className="overview-lists">
      <article className="overview-list-card"><div className="overview-card-head"><b>Khóa học</b><Link href="/courses" onClick={event => followLink(event, onCourses)}>Xem tất cả</Link></div>{userCourses.length ? <ul>{userCourses.map(c=><li key={c.id}><i className="dot blue"/><Link href="/courses" onClick={event => followLink(event, onCourses)}>{c.title}</Link></li>)}</ul> : <div className="overview-empty">Chưa được phân khóa học</div>}</article>
      <article className="overview-list-card"><div className="overview-card-head"><b>Phòng luyện</b><Link href="/exam-room" onClick={event => followLink(event, onExams)}>Xem tất cả</Link></div>{practiceRooms.length ? <ul>{practiceRooms.slice(0,5).map(room=><li key={room.id}><i className="dot blue"/><Link href={`/exam-room/${encodeURIComponent(room.id)}`} onClick={event => followLink(event, () => onOpenRoom(room.id))} title={`${room.title} · ${room.examCount} đề`}>{room.title}</Link></li>)}</ul> : <div className="overview-empty">Chưa có phòng luyện nào</div>}</article>
      <article className="overview-list-card"><div className="overview-card-head"><b>Bài thi IRT</b><span className="overview-card-status">Sắp ra mắt</span></div><div className="overview-empty">Chưa có bài thi IRT nào.</div></article>
    </section>
    <section className="two-col"><div className="section-card"><div className="section-head"><h2>Bài thi gần đây</h2></div>{recent.length ? <ul className="attempt-list">{recent.map(item=><li key={item.id}><button className="attempt-list-link" title={item.title} onClick={() => onOpenAttempt(item.id)}>{item.title}</button><small>{new Date(item.submitted_at).toLocaleDateString("vi-VN")}</small></li>)}</ul> : <MiniEmpty text="Chưa có bài thi nào được thực hiện." />}</div><div className="section-card"><div className="section-head"><h2>Top 5 điểm cao nhất</h2></div>{top.length ? <ul className="attempt-list">{top.map(item=><li key={item.id}><button className="attempt-list-link" title={item.title} onClick={() => onOpenAttempt(item.id)}>{item.title}</button><b>{item.score}</b></li>)}</ul> : <MiniEmpty text="Chưa có dữ liệu xếp hạng." />}</div></section>
    <section className="section-card activity-card">
      <div className="section-head"><h2>Thống kê làm bài ({year})</h2><small className="muted">{yearAttempts.length} bài thi trong năm {year}</small></div>
      <span className="activity-year" aria-label={`Năm ${year}`}>{year}</span>
      <div className="heatmap-months">{Array.from({ length: 12 }, (_, index) => <span key={index} aria-label={`Tháng ${index + 1}`}><span className="heatmap-month-full">Th.{index + 1}</span><span className="heatmap-month-short">T{index + 1}</span></span>)}</div>
      <div className="heatmap dashboard-heatmap">{activityDays.map(({ date, count, inYear }, index) => { const detail = `${activityDateFormat.format(date)}: ${count} bài thi`; return <i key={`${date.toISOString()}-${index}`} className={inYear ? `level-${Math.min(count,4)}` : "outside-year"} title={inYear ? detail : undefined} aria-label={inYear ? detail : undefined} aria-hidden={inYear ? undefined : true} />; })}</div>
      <div className="activity-footer"><span>{yearAttempts.length} bài thi trong năm</span><div className="heatmap-legend"><span>Ít</span><i/><i/><i/><i/><i/><span>Nhiều</span></div></div>
    </section>
  </div>;
}

function Stat({ icon: Icon, value, label, color }: { icon: IconComponent; value: string | number; label: string; color: string }) { return <article className="stat-card"><span className={`stat-icon ${color}`}><Icon /></span><div><b>{value}</b><small>{label}</small></div></article>; }

function Courses({ courses: courseItems, isAdmin, onOpen }: { courses: CourseData[]; isAdmin: boolean; onOpen: (courseId: string | number) => void }) {
  const [courseSearch, setCourseSearch] = useState("");
  const filteredCourses = useMemo(() => {
    const query = courseSearch.trim().toLocaleLowerCase("vi");
    if (!query) return courseItems;
    return courseItems.filter(course => `${course.title} ${course.description}`.toLocaleLowerCase("vi").includes(query));
  }, [courseItems, courseSearch]);
  return <div className="page-stack courses-page"><div className="courses-toolbar"><div><h1>Khóa học</h1><p>Danh sách khóa học</p></div><label className="course-search"><Search/><input value={courseSearch} onChange={event=>setCourseSearch(event.target.value)} placeholder="Tìm kiếm giáo trình..."/></label></div>{filteredCourses.length ? <div className="course-grid reference-course-grid">{filteredCourses.map(course => <CourseCard key={course.id} course={course} onOpen={onOpen} />)}</div> : <EmptyState icon={BookOpen} title={courseItems.length ? "Không tìm thấy khóa học" : "Chưa có khóa học"} text={courseItems.length ? "Hãy thử từ khóa khác." : isAdmin ? "Hãy tạo khóa học trong trang Quản trị." : "Khóa học sẽ xuất hiện sau khi quản trị viên phân cho tài khoản của bạn."} />}</div>;
}

function CourseCard({ course, onOpen }: { course: CourseData; onOpen: (courseId: string | number) => void }) { return <article className="course-card reference-course-card" style={courseColorStyle(course.color)}><button className="course-card-action" onClick={()=>onOpen(course.id)} aria-label={`Vào học ${course.title}`}><div className="course-cover">{course.cover_url?<img src={course.cover_url} alt={course.title} width={640} height={360} loading="lazy" decoding="async"/>:<div className="course-cover-fallback"><span>REMIX</span><BookOpen/><small>LEARNING SERIES</small></div>}{course.published===false&&<span className="course-draft-badge">Bản nháp</span>}</div><div className="course-body"><h3>{course.title}</h3><div className="course-meta"><span><CirclePlay/> {course.lessons} bài học</span><b>Vào học</b></div></div></button></article>; }

function CourseDetail({ course, showDrafts, onBack, onLesson }: { course: CourseData | null; showDrafts: boolean; onBack: () => void; onLesson: (lessonId: string) => void }) {
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [courseLessons, setCourseLessons] = useState<LessonData[]>([]);
  const [loadingContent, setLoadingContent] = useState(false);
  const [contentError, setContentError] = useState("");

  useEffect(() => {
    if (!course || !supabase) return;
    let cancelled = false;
    async function loadCourseContent() {
      setLoadingContent(true); setContentError("");
      const { data: chapterRows, error: chapterError } = await supabase!.from("chapters").select("id,course_id,title,sort_order").eq("course_id", course!.id).order("sort_order");
      const chapterIds = (chapterRows ?? []).map(chapter => chapter.id);
      const lessonQuery = supabase!.from("lessons").select("id,chapter_id,title,description,published,sort_order").in("chapter_id", chapterIds);
      const lessonResult = chapterIds.length ? await (showDrafts ? lessonQuery.order("sort_order") : lessonQuery.eq("published", true).order("sort_order")) : { data: [], error: null };
      if (cancelled) return;
      const error = chapterError ?? lessonResult.error;
      if (error) setContentError(error.message);
      setChapters((chapterRows ?? []) as ChapterData[]);
      setCourseLessons((lessonResult.data ?? []) as LessonData[]);
      setLoadingContent(false);
    }
    void loadCourseContent();
    return () => { cancelled = true; };
  }, [course, showDrafts]);

  if (!course) return <div className="page-stack"><button className="back-btn" onClick={onBack}><ArrowLeft /> Quay lại khóa học</button><EmptyState icon={BookOpen} title="Không tìm thấy khóa học" text="Khóa học không tồn tại hoặc chưa được phân cho tài khoản của bạn." /></div>;
  return <div className="page-stack course-study-page">
    <button className="back-btn" onClick={onBack}><ArrowLeft /> Quay lại khóa học</button>
    <section className="course-study-hero">
      {course.cover_url ? <img src={course.cover_url} alt={course.title} width={960} height={540} fetchPriority="high" decoding="async"/> : <div className="course-cover-fallback course-study-cover-fallback" style={courseColorStyle(course.color)}><span>REMIX</span><BookOpen/><small>LEARNING SERIES</small></div>}
      <div><span className="eyebrow">KHÓA HỌC</span><h1>{course.title}</h1><p>{course.description || "Nội dung khóa học đang được cập nhật."}</p></div>
    </section>
    <section className="course-curriculum-panel">
      <div className="course-curriculum-head"><h2>Nội dung giáo trình</h2><p>{chapters.length} phần • {courseLessons.length} bài học</p></div>
      {contentError && <p className="form-error">{contentError}</p>}
      {loadingContent ? <LoadingIndicator label="Đang tải nội dung…" /> : chapters.length ? <div className="course-curriculum-list">{chapters.map((chapter,partIndex)=>{const lessons=courseLessons.filter(lesson=>lesson.chapter_id===chapter.id);return <details className="course-part-card" key={chapter.id} open={partIndex===0}><summary><strong>{formatPartTitle(chapter.title,chapter.sort_order)}</strong><ChevronRight/></summary><div className="course-part-lessons">{lessons.length?lessons.map(lesson=><button className={lesson.published?"published":"draft"} key={lesson.id} onClick={()=>onLesson(lesson.id)}><b>{formatLessonTitle(lesson.title,lesson.sort_order)}</b></button>):<p>Phần này chưa có bài học {showDrafts?"nào":"được xuất bản"}.</p>}</div></details>})}</div> : <MiniEmpty text={showDrafts?"Khóa học chưa có phần hoặc bài học.":"Khóa học chưa có phần hoặc bài học được xuất bản."} />}
    </section>
  </div>;
}

function LessonViewer({ lessonId, onBack, onLesson }: { lessonId: string; onBack: (courseId: string) => void; onLesson: (lessonId: string, resourceId?: string) => void }) {
  const [lesson, setLesson] = useState<(LessonData & { course_id: string; course_title: string; chapter_title: string; chapter_sort_order: number }) | null>(null);
  const [resources, setResources] = useState<SecureLessonResource[]>([]);
  const [curriculum, setCurriculum] = useState<LessonCurriculumSection[]>([]);
  const [selectedResourceId, setSelectedResourceId] = useState("");
  const [lessonLoading, setLessonLoading] = useState(() => Boolean(supabase && lessonId));
  const [lessonError, setLessonError] = useState("");

  useEffect(() => {
    if (!supabase || !lessonId) return;
    let cancelled = false;
    async function loadLesson() {
      setLessonLoading(true); setLessonError("");
      const accessToken = await activeSessionToken().catch(() => null);
      if (!accessToken) { setLessonError("Phiên đăng nhập đã hết hạn hoặc không hợp lệ. Hãy đăng nhập lại."); setLessonLoading(false); return; }
      const [lessonResult, resourceResult] = await Promise.all([
        supabase!.from("lessons").select("id,chapter_id,title,description,published,sort_order,chapters(course_id,title,sort_order,courses(title))").eq("id", lessonId).single(),
        authenticatedFetch(`/api/lesson-resources?lessonId=${encodeURIComponent(lessonId)}`, { cache: "no-store" }),
      ]);
      if (cancelled) return;
      const resourcePayload = await resourceResult.json() as { resources?: SecureLessonResource[]; curriculum?: LessonCurriculumSection[]; error?: string };
      const errorMessage = lessonResult.error?.message || (!resourceResult.ok ? resourcePayload.error || "Không thể tải nội dung bài học." : "");
      if (errorMessage) { setLessonError(errorMessage); setLessonLoading(false); return; }
      const raw = lessonResult.data as LessonWithChapterRow;
      const chapter = Array.isArray(raw.chapters) ? raw.chapters[0] : raw.chapters;
      const relatedCourse = Array.isArray(chapter?.courses) ? chapter.courses[0] : chapter?.courses;
      setLesson({ id: raw.id, chapter_id: raw.chapter_id, title: raw.title, description: raw.description ?? "", published: raw.published, sort_order: raw.sort_order, course_id: chapter?.course_id ?? "", course_title: relatedCourse?.title ?? "", chapter_title: chapter?.title ?? "", chapter_sort_order: chapter?.sort_order ?? 0 });
      const nextResources = resourcePayload.resources ?? [];
      setResources(nextResources);
      setCurriculum(resourcePayload.curriculum ?? []);
      const requestedResource = new URLSearchParams(window.location.search).get("resource") ?? "";
      setSelectedResourceId(nextResources.some(resource => resource.id === requestedResource) ? requestedResource : nextResources[0]?.id ?? "");
      setLessonLoading(false);
    }
    void loadLesson();
    return () => { cancelled = true; };
  }, [lessonId]);

  const selectedResource = resources.find(resource=>resource.id===selectedResourceId) ?? resources[0];
  const lessonCount = curriculum.reduce((total, section) => total + section.lessons.length, 0);
  function selectResource(resourceId: string) {
    setSelectedResourceId(resourceId);
    const url = new URL(window.location.href);
    url.searchParams.set("resource", resourceId);
    window.history.replaceState({}, "", `${url.pathname}${url.search}`);
  }
  if (lessonLoading) return <div className="lesson-page"><LoadingIndicator label="Đang tải bài giảng…" /></div>;
  if (!lesson) return <div className="lesson-page"><button className="back-btn" onClick={()=>onBack("")}><ArrowLeft/> Quay lại khóa học</button><EmptyState icon={BookOpen} title="Không tìm thấy bài học" text={lessonError || "Bài học không tồn tại hoặc bạn chưa được cấp quyền."}/></div>;
  return <div className="lesson-page real-lesson-page">
    <AccountSecurityGuard activityType={selectedResource?.resource_type === "youtube" ? "video" : selectedResource ? "pdf" : "lesson"} resourceId={selectedResource?.id ?? lessonId} />
    <nav className="lesson-breadcrumb" aria-label="Điều hướng bài học">
      <button className="lesson-breadcrumb-back" onClick={()=>onBack(lesson.course_id)}><ArrowLeft/><span>Quay lại khóa học</span></button>
      <span className="breadcrumb-separator" aria-hidden="true">/</span>
      <strong className="breadcrumb-course" title={lesson.course_title}>{lesson.course_title || "Khóa học"}</strong>
      <span className="breadcrumb-current-separator" aria-hidden="true">/</span>
      <span className="breadcrumb-current" title={formatLessonTitle(lesson.title,lesson.sort_order)}>{formatLessonTitle(lesson.title,lesson.sort_order)}</span>
    </nav>
    <div className="lesson-layout">
      <section className="viewer-card">
        {!selectedResource ? <MiniEmpty text="Bài học chưa có bài giảng hoặc tài liệu."/> : <VideoPlayer resource={selectedResource}/>} 
      </section>
      <aside className="lesson-nav curriculum-panel">
        <div className="curriculum-panel-head"><h2>Nội dung giáo trình</h2><p>{curriculum.length} phần • {lessonCount} bài học</p></div>
        {curriculum.length ? <div className="lesson-curriculum-list">{curriculum.map((section, partIndex) => {
          const containsCurrentLesson = section.lessons.some(item => item.id === lessonId);
          return <details key={section.id} open={containsCurrentLesson || partIndex === 0}>
            <summary><ChevronRight/><strong>{formatPartTitle(section.title, section.sort_order)}</strong></summary>
            <div className="lesson-curriculum-lessons">{section.lessons.map(item => <div className={`curriculum-lesson ${item.id === lessonId ? "current" : ""}`} key={item.id}>
              <button className="curriculum-lesson-title" onClick={() => item.id !== lessonId && onLesson(item.id)}><b>{formatLessonTitle(item.title, item.sort_order)}</b></button>
              {item.resources.map(resource => <button key={resource.id} className={`curriculum-resource ${resource.id === selectedResource?.id ? "selected" : ""}`} onClick={() => item.id === lessonId ? selectResource(resource.id) : onLesson(item.id, resource.id)}><span>{resource.resource_type === "youtube" ? <CirclePlay/> : <BookOpen/>}</span><span><b>{resource.title}</b></span></button>)}
            </div>)}</div>
          </details>;
        })}</div> : <MiniEmpty text="Chưa có nội dung giáo trình."/>}
      </aside>
    </div>
  </div>;
}

function ExamHistory({ attempts, onOpen }: { attempts: AttemptData[]; onOpen: (attemptId: string) => void }) {
  const [searchTerm, setSearchTerm] = useState("");
  const [visibleAttempts, setVisibleAttempts] = useState(attempts);
  const [isLoading, setIsLoading] = useState(attempts.length === 0);
  const [loadError, setLoadError] = useState("");
  const [reloadVersion, setReloadVersion] = useState(0);

  useEffect(() => {
    const readQuery = () => setSearchTerm(new URLSearchParams(window.location.search).get("q") ?? "");
    readQuery();
    window.addEventListener("popstate", readQuery);
    return () => window.removeEventListener("popstate", readQuery);
  }, []);

  useEffect(() => {
    const url = new URL(window.location.href);
    const query = searchTerm.trim();
    if (query) url.searchParams.set("q", query); else url.searchParams.delete("q");
    window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
  }, [searchTerm]);

  useEffect(() => {
    let active = true;
    // The list is a client-side cache that must follow the parent snapshot.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setVisibleAttempts(attempts);
    setLoadError("");
    setIsLoading(attempts.length === 0);
    const refresh = async () => {
      try {
        const response = await authenticatedFetch("/api/exams?scope=history", { cache: "no-store" });
        const payload = await response.json().catch(() => null) as { attempts?: AttemptData[] } | null;
        if (!active) return;
        if (response.ok) setVisibleAttempts(payload?.attempts ?? []);
        else if (!attempts.length) setLoadError("Không thể tải lịch sử làm bài lúc này.");
        setIsLoading(false);
      } catch {
        if (!active) return;
        if (!attempts.length) setLoadError("Không thể tải lịch sử làm bài lúc này.");
        setIsLoading(false);
      }
    };
    void refresh();
    return () => { active = false; };
  }, [attempts, reloadVersion]);

  const completedAttempts = visibleAttempts.filter(attempt => attempt.status !== "in_progress" && Boolean(attempt.submitted_at));
  const filteredAttempts = completedAttempts.filter(attempt => (attempt.title || "Bài thi").toLocaleLowerCase("vi").includes(searchTerm.trim().toLocaleLowerCase("vi")));
  const thptqgHistory = completedAttempts.length > 0 && completedAttempts.every(attempt => normalizeExamType(attempt.exam_type) === "THPTQG");
  const statusLabel = (status: string) => status === "graded" ? "Đã chấm" : status === "completed" ? "Đã hoàn thành" : "Đã nộp";
  const formatSubmittedAt = (value: string | null) => value ? new Intl.DateTimeFormat("vi-VN", { dateStyle: "short", timeStyle: "short" }).format(new Date(value)) : "Chưa nộp";
  const openHistoryItem = (event: React.MouseEvent<HTMLAnchorElement>, attemptId: string) => {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    onOpen(attemptId);
  };
  const historyContent = isLoading && !visibleAttempts.length
    ? <HistoryLoading />
    : loadError && !visibleAttempts.length
      ? <section className="history-feedback"><span><History /></span><h2>Chưa tải được lịch sử</h2><p>{loadError}</p><button type="button" onClick={() => setReloadVersion(version => version + 1)}>Thử tải lại</button></section>
      : filteredAttempts.length
        ? <section className="history-list">{filteredAttempts.map(attempt => <article className={`history-row ${normalizeExamType(attempt.exam_type) === "THPTQG" ? "history-row-thptqg" : ""}`} key={attempt.id}>
            <div className="history-exam"><b>{attempt.title || "Bài thi"}</b><small>{Number(attempt.score ?? 0)} điểm</small></div>
            <time dateTime={attempt.submitted_at ?? undefined}>{formatSubmittedAt(attempt.submitted_at)}</time>
            <strong>{attempt.correct_answers}/{attempt.total_questions}</strong>
            <div className="history-status"><span>{statusLabel(attempt.status)}</span><Link href={`/exam/result/${encodeURIComponent(attempt.id)}`} onClick={event => openHistoryItem(event, attempt.id)}>Xem chi tiết<ChevronRight aria-hidden="true" /></Link></div>
          </article>)}</section>
        : <EmptyState icon={History} title={searchTerm ? "Không tìm thấy bài thi" : "Bạn chưa có lịch sử làm bài"} text={searchTerm ? "Thử tìm bằng tên đề thi khác." : "Kết quả sẽ xuất hiện tại đây sau khi bạn nộp bài thi."} />;

  return <div className={`page-stack ${thptqgHistory ? "thptqg-history" : ""}`}>
    <div className="page-intro"><div><span className="eyebrow">KẾT QUẢ HỌC TẬP</span><h2>Lịch sử làm bài</h2><p>Xem lại kết quả các bài thi đã thực hiện.</p></div><label className="search"><Search aria-hidden="true" /><input name="historySearch" type="search" autoComplete="off" value={searchTerm} onChange={event => setSearchTerm(event.target.value)} placeholder="Tìm kiếm bài thi…" aria-label="Tìm kiếm bài thi" /></label></div>
    <section className="history-frame">
      <div className="history-head"><span>KỲ THI / ĐỀ THI</span><span>THỜI GIAN NỘP</span><span>SỐ CÂU ĐÚNG</span><span>TRẠNG THÁI</span></div>
      {historyContent}
    </section>
  </div>;
}

function HistoryLoading() {
  return <section className="history-loading" aria-label="Đang tải lịch sử làm bài">
    <div className="history-skeleton-row"><i /><i /><i /><i /></div>
    <div className="history-skeleton-row"><i /><i /><i /><i /></div>
    <div className="history-skeleton-row"><i /><i /><i /><i /></div>
  </section>;
}

function Profile({ profile, attempts, onProfileUpdated }: { profile: ProfileData; attempts: AttemptData[]; onProfileUpdated: (profile: ProfileData) => void }) {
  const [editing, setEditing] = useState(false);
  const [draftName, setDraftName] = useState(profile.full_name);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileError, setProfileError] = useState("");
  const [profileMessage, setProfileMessage] = useState("");
  const [passwordModal, setPasswordModal] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [savingPassword, setSavingPassword] = useState(false);
  useAdminDialogFocus(passwordModal, closePasswordModal);

  // Keep the editable draft synchronized when the profile changes remotely.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setDraftName(profile.full_name); }, [profile.full_name]);

  async function saveProfile() {
    setProfileError(""); setProfileMessage("");
    const nextName = draftName.trim();
    if (!nextName) { setProfileError("Họ và tên không được để trống."); return; }
    if (!supabase) { setProfileError("Chưa cấu hình Supabase."); return; }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setProfileError("Phiên đăng nhập đã hết hạn."); return; }
    setSavingProfile(true);
    try {
      const { error } = await supabase.from("profiles").update({ full_name: nextName, updated_at: new Date().toISOString() }).eq("id", userData.user.id);
      if (error) throw error;
      onProfileUpdated({ ...profile, full_name: nextName });
      setProfileMessage("Đã cập nhật thông tin.");
      setEditing(false);
    } catch (value) {
      setProfileError(value instanceof Error ? value.message : "Không thể lưu hồ sơ. Hãy thử lại.");
    } finally {
      setSavingProfile(false);
    }
  }

  async function changePassword(event: React.FormEvent) {
    event.preventDefault();
    setPasswordError(""); setPasswordMessage("");
    if (newPassword.length < 8) { setPasswordError("Mật khẩu phải có ít nhất 8 ký tự."); return; }
    if (newPassword !== confirmPassword) { setPasswordError("Hai mật khẩu không trùng khớp."); return; }
    if (!supabase) { setPasswordError("Chưa cấu hình Supabase."); return; }
    setSavingPassword(true);
    try {
      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;
      setPasswordMessage("Đã đổi mật khẩu. Hãy dùng mật khẩu mới ở lần đăng nhập tiếp theo.");
      setNewPassword(""); setConfirmPassword("");
    } catch (value) {
      setPasswordError(value instanceof Error ? value.message : "Không thể đổi mật khẩu. Hãy thử lại.");
    } finally {
      setSavingPassword(false);
    }
  }

  function closePasswordModal() {
    setPasswordModal(false); setNewPassword(""); setConfirmPassword(""); setPasswordError(""); setPasswordMessage("");
  }

  const currentYear = new Date().getFullYear();
  const yearAttempts = attempts.filter(attempt => new Date(attempt.submitted_at).getFullYear() === currentYear);
  const completedAttempts = attempts.filter(attempt => attempt.status !== "in_progress");
  const averageScore = completedAttempts.length ? Math.round(completedAttempts.reduce((sum, attempt) => sum + Number(attempt.score || 0), 0) / completedAttempts.length) : 0;
  const profileHandle = `@${profile.email.split("@")[0] || profile.student_code.toLocaleLowerCase("vi")}`;

  return <div className="profile-grid">
    <section className="profile-card identity"><span className="profile-label">HỒ SƠ HỌC VIÊN</span><span className="big-avatar" aria-hidden="true"><UserRound/></span><h2 className="profile-verified-name"><span>{profileHandle}</span><BadgeCheck aria-label="Tài khoản đã xác minh"/></h2><p className="profile-real-name">{profile.full_name}</p><span className={`status ${profile.status === "locked" ? "locked" : ""}`}><i/> {profile.status === "active" ? "Tài khoản đang hoạt động" : "Tài khoản đã bị khóa"}</span></section>
    <section className="profile-card details"><div className="section-head"><div><span className="eyebrow">TÀI KHOẢN</span><h2>Thông tin chi tiết</h2></div><button className="outline-btn" onClick={()=>{setEditing(!editing);setDraftName(profile.full_name);setProfileError("");setProfileMessage("")}}>{editing?"Hủy":"Chỉnh sửa"}</button></div><div className="detail-list"><Detail icon={UserRound} label="Họ và tên" value={editing?<input value={draftName} onChange={event=>setDraftName(event.target.value)}/>:profile.full_name}/><Detail icon={Mail} label="Email" value={profile.email}/><Detail icon={BadgeCheck} label="Mã học viên" value={profile.student_code}/><Detail icon={ShieldCheck} label="Vai trò" value={profile.role === "admin" ? "Quản trị viên" : "Học sinh"}/></div>{profileError&&<p className="form-error">{profileError}</p>}{profileMessage&&<p className="form-success">{profileMessage}</p>}{editing&&<button className="primary-btn small" onClick={saveProfile} disabled={savingProfile}>{savingProfile?"Đang lưu…":"Lưu thay đổi"}</button>}<hr/><div className="password-row"><div><LockKeyhole/><span><b>Đổi mật khẩu</b><small>Nên sử dụng mật khẩu mạnh và riêng biệt.</small></span></div><button className="outline-btn" onClick={()=>setPasswordModal(true)}>Cập nhật</button></div></section>
    <section className="profile-card exam-profile"><div className="profile-stat-heading"><div><span className="eyebrow">THỐNG KÊ</span><h2>Hoạt động thi năm {currentYear}</h2></div><span className="profile-score"><small>Điểm trung bình</small><b>{averageScore}</b></span></div>{yearAttempts.length ? <ul className="attempt-list">{yearAttempts.slice(0,5).map(attempt=><li key={attempt.id}><span><b>{attempt.title}</b><small>{new Date(attempt.submitted_at).toLocaleDateString("vi-VN")}</small></span><strong>{attempt.score}</strong></li>)}</ul> : <MiniEmpty text="Chưa có dữ liệu bài thi." />}</section>
    {passwordModal && <div className="modal-shade"><form className="modal password-modal" role="dialog" aria-modal="true" aria-labelledby="profile-password-title" aria-busy={savingPassword} onSubmit={changePassword}><div className="section-head"><div><span className="eyebrow">BẢO MẬT</span><h2 id="profile-password-title">Đổi mật khẩu</h2></div><button type="button" className="icon-btn" onClick={closePasswordModal} aria-label="Đóng hộp thoại đổi mật khẩu" disabled={savingPassword}><X aria-hidden="true"/></button></div><label htmlFor="profile-new-password">Mật khẩu mới<input id="profile-new-password" name="newPassword" type="password" autoComplete="new-password" value={newPassword} onChange={event=>setNewPassword(event.target.value)} placeholder="Tối thiểu 8 ký tự" minLength={8} required/></label><label htmlFor="profile-confirm-password">Xác nhận mật khẩu<input id="profile-confirm-password" name="passwordConfirmation" type="password" autoComplete="new-password" value={confirmPassword} onChange={event=>setConfirmPassword(event.target.value)} placeholder="Nhập lại mật khẩu mới" minLength={8} required/></label>{passwordError&&<p className="form-error" role="alert">{passwordError}</p>}{passwordMessage&&<p className="form-success" role="status" aria-live="polite">{passwordMessage}</p>}<button className="primary-btn" disabled={savingPassword||Boolean(passwordMessage)}>{savingPassword?"Đang cập nhật…":passwordMessage?"Đã cập nhật":"Đổi mật khẩu"}</button></form></div>}
  </div>;
}

function Detail({ icon: Icon, label, value }: { icon: IconComponent; label: string; value: React.ReactNode }) { return <div className="detail-row"><span><Icon /></span><div><small>{label}</small><b>{value}</b></div></div>; }


type AdminProfileRow = { id: string; full_name: string; student_code: string; role: "student" | "admin"; status: "active" | "locked"; created_at: string; email: string };
type AdminCourseRow = { id: string; title: string; description: string; cover_url: string | null; cover_color: string; published: boolean; sort_order: number; created_at: string };
type AdminLessonRow = { id: string; title: string; published: boolean; chapters: { course_id: string } | { course_id: string }[] | null };
type AdminEnrollmentRow = { student_id: string; course_id: string };
type AdminExamRoomRow = { id: string; title: string; published: boolean; access_mode: "open" | "assigned" };
type AdminExamEnrollmentRow = { student_id: string; room_id: string };

function adminTabFromPath(pathname: string): AdminTab {
  if (pathname.startsWith("/admin/sessions")) return "sessions";
  if (pathname.startsWith("/admin/students")) return "students";
  if (pathname.startsWith("/admin/content")) return "content";
  if (pathname.startsWith("/admin/question-bank")) return "question-bank";
  if (pathname.startsWith("/admin/exams")) return "exams";
  if (pathname.startsWith("/admin/upload")) return "upload";
  if (pathname.startsWith("/admin/enrollments")) return "enrollments";
  if (pathname.startsWith("/admin/security")) return "settings";
  return "dashboard";
}

function RealAdminDashboard() {
  const [tab, setTab] = useState<AdminTab>(() => typeof window !== "undefined" ? adminTabFromPath(window.location.pathname) : "dashboard");
  const [modal, setModal] = useState(false);
  const [loadingAdmin, setLoadingAdmin] = useState(true);
  const [adminError, setAdminError] = useState("");
  const [adminNotice, setAdminNotice] = useState("");
  const [profiles, setProfiles] = useState<AdminProfileRow[]>([]);
  const [adminCourses, setAdminCourses] = useState<AdminCourseRow[]>([]);
  const [adminLessons, setAdminLessons] = useState<AdminLessonRow[]>([]);
  const [enrollments, setEnrollments] = useState<AdminEnrollmentRow[]>([]);
  const [adminExamRooms, setAdminExamRooms] = useState<AdminExamRoomRow[]>([]);
  const [examRoomEnrollments, setExamRoomEnrollments] = useState<AdminExamEnrollmentRow[]>([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [newFullName, setNewFullName] = useState("");
  const [newEmail, setNewEmail] = useState("");
  const [newStudentPassword, setNewStudentPassword] = useState("");
  const [creatingStudent, setCreatingStudent] = useState(false);
  const [createError, setCreateError] = useState("");
  const [passwordStudent, setPasswordStudent] = useState<AdminProfileRow | null>(null);
  const [adminStudentPassword, setAdminStudentPassword] = useState("");
  const [adminStudentPasswordConfirm, setAdminStudentPasswordConfirm] = useState("");
  const [studentPasswordError, setStudentPasswordError] = useState("");
  const [savingStudentPassword, setSavingStudentPassword] = useState(false);
  const [courseModal, setCourseModal] = useState(false);
  const [newCourseTitle, setNewCourseTitle] = useState("");
  const [newCourseDescription, setNewCourseDescription] = useState("");
  const [newCourseCoverUrl, setNewCourseCoverUrl] = useState("");
  const [newCourseColor, setNewCourseColor] = useState("#cd1627");
  const [newCoursePublished, setNewCoursePublished] = useState(false);
  const [creatingCourse, setCreatingCourse] = useState(false);
  const [courseError, setCourseError] = useState("");
  const [managedCourseId, setManagedCourseId] = useState(() => {
    if (typeof window === "undefined") return "";
    const match = window.location.pathname.match(/^\/admin\/content\/courses\/([^/]+)/);
    return match?.[1] ? decodeURIComponent(match[1]) : "";
  });
  const [assignStudentId, setAssignStudentId] = useState("");
  const [assignCourseId, setAssignCourseId] = useState("");
  const [assignError, setAssignError] = useState("");
  const [assigningCourse, setAssigningCourse] = useState(false);
  const [assignExamRoomId, setAssignExamRoomId] = useState("");
  const [assignExamStudentId, setAssignExamStudentId] = useState("");
  const [assigningExamRoom, setAssigningExamRoom] = useState(false);
  const adminDialogOpen = modal || Boolean(passwordStudent) || courseModal;
  const closeAdminDialog = useCallback(() => {
    if (passwordStudent) {
      if (savingStudentPassword) return;
      setPasswordStudent(null);
      setAdminStudentPassword("");
      setAdminStudentPasswordConfirm("");
      setStudentPasswordError("");
      return;
    }
    if (modal) {
      setModal(false);
      return;
    }
    if (courseModal) setCourseModal(false);
  }, [courseModal, modal, passwordStudent, savingStudentPassword]);
  useAdminDialogFocus(adminDialogOpen, closeAdminDialog);

  async function loadAdminData() {
    setLoadingAdmin(true); setAdminError("");
    try {
      if (!supabase) { setAdminError("Chưa cấu hình Supabase."); return; }
      const [profileResult, courseResult, lessonResult, enrollmentResult, examRoomResult, examEnrollmentResult] = await Promise.all([
      supabase.from("profiles").select("id,full_name,student_code,role,status,created_at").order("created_at", { ascending: false }),
      supabase.from("courses").select("id,title,description,cover_url,cover_color,published,sort_order,created_at").order("sort_order").order("created_at", { ascending: false }),
      supabase.from("lessons").select("id,title,published,chapters(course_id)"),
      supabase.from("course_enrollments").select("student_id,course_id"),
      supabase.from("exam_rooms").select("id,title,published,access_mode").order("sort_order"),
      supabase.from("exam_room_enrollments").select("student_id,room_id"),
      ]);
      const firstError = profileResult.error ?? courseResult.error ?? lessonResult.error ?? enrollmentResult.error ?? examRoomResult.error ?? examEnrollmentResult.error;
      if (firstError) setAdminError(firstError.message);
      let emailMap: Record<string, string> = {};
      try {
        const response = await authenticatedFetch("/api/admin/users", { cache: "no-store" });
        const payload = await response.json().catch(() => null) as { users?: Array<{ id: string; email: string }>; error?: string } | null;
        if (response.ok) emailMap = Object.fromEntries((payload?.users ?? []).map(user => [user.id, user.email]));
        else if (response.status !== 401 && !firstError) setAdminError(payload?.error ?? "Không thể tải email học viên.");
      } catch (value) {
        if (!firstError) setAdminError(value instanceof Error ? value.message : "Phiên đăng nhập đã hết hạn.");
      }
      setProfiles(((profileResult.data ?? []) as Omit<AdminProfileRow, "email">[]).map(profile => ({ ...profile, email: emailMap[profile.id] ?? "" })));
      setAdminCourses((courseResult.data ?? []) as AdminCourseRow[]);
      setAdminLessons((lessonResult.data ?? []) as AdminLessonRow[]);
      setEnrollments((enrollmentResult.data ?? []) as AdminEnrollmentRow[]);
      setAdminExamRooms((examRoomResult.data ?? []) as AdminExamRoomRow[]);
      setExamRoomEnrollments((examEnrollmentResult.data ?? []) as AdminExamEnrollmentRow[]);
    } catch (value) {
      setAdminError(value instanceof Error ? value.message : "Không thể tải dữ liệu quản trị. Hãy thử lại.");
    } finally {
      setLoadingAdmin(false);
    }
  }

  // Admin data is fetched after the authenticated dashboard mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadAdminData(); }, []);

  useEffect(() => {
    const syncAdminRoute = () => {
      setTab(adminTabFromPath(window.location.pathname));
      const match = window.location.pathname.match(/^\/admin\/content\/courses\/([^/]+)/);
      setManagedCourseId(match?.[1] ? decodeURIComponent(match[1]) : "");
    };
    window.addEventListener("popstate", syncAdminRoute);
    return () => window.removeEventListener("popstate", syncAdminRoute);
  }, []);

  const students = useMemo(() => profiles.filter(profile => profile.role === "student"), [profiles]);
  const filteredStudents = useMemo(() => {
    const query = searchTerm.trim().toLocaleLowerCase("vi");
    if (!query) return students;
    return students.filter(student => `${student.full_name} ${student.student_code} ${student.email}`.toLocaleLowerCase("vi").includes(query));
  }, [searchTerm, students]);
  const enrollmentCount = useMemo(() => enrollments.reduce<Record<string, number>>((counts, row) => {
    counts[row.student_id] = (counts[row.student_id] ?? 0) + 1;
    return counts;
  }, {}), [enrollments]);
  const lessonsPerCourse = useMemo(() => adminLessons.reduce<Record<string, number>>((counts, lesson) => {
    const chapter = Array.isArray(lesson.chapters) ? lesson.chapters[0] : lesson.chapters;
    if (chapter?.course_id) counts[chapter.course_id] = (counts[chapter.course_id] ?? 0) + 1;
    return counts;
  }, {}), [adminLessons]);
  const recentActivity = useMemo(() => [
    ...profiles.map(profile => ({ id: `profile-${profile.id}`, text: `Tài khoản ${profile.student_code} được tạo`, date: profile.created_at })),
    ...adminCourses.map(course => ({ id: `course-${course.id}`, text: `Khóa học "${course.title}" được tạo`, date: course.created_at })),
  ].sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()).slice(0, 5), [profiles, adminCourses]);

  async function createStudent(event: React.FormEvent) {
    event.preventDefault();
    setCreateError(""); setAdminNotice("");
    if (!supabase) { setCreateError("Chưa cấu hình Supabase."); return; }
    setCreatingStudent(true);
    try {
      const response = await authenticatedFetch("/api/admin/users", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ email: newEmail.trim(), password: newStudentPassword, fullName: newFullName.trim() }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Không thể tạo học viên.");
      setModal(false); setNewFullName(""); setNewEmail(""); setNewStudentPassword("");
      setAdminNotice("Đã tạo tài khoản học viên.");
      await loadAdminData();
    } catch (value) {
      setCreateError(value instanceof Error ? value.message : "Không thể tạo học viên. Hãy thử lại.");
    } finally {
      setCreatingStudent(false);
    }
  }

  function openStudentPassword(student: AdminProfileRow) {
    setPasswordStudent(student);
    setAdminStudentPassword("");
    setAdminStudentPasswordConfirm("");
    setStudentPasswordError("");
  }

  function closeStudentPassword() {
    if (savingStudentPassword) return;
    setPasswordStudent(null);
    setAdminStudentPassword("");
    setAdminStudentPasswordConfirm("");
    setStudentPasswordError("");
  }

  async function changeStudentPassword(event: React.FormEvent) {
    event.preventDefault();
    setStudentPasswordError("");
    setAdminNotice("");
    if (!passwordStudent || !supabase) { setStudentPasswordError("Không tìm thấy học viên hoặc Supabase chưa được cấu hình."); return; }
    if (adminStudentPassword.length < 8) { setStudentPasswordError("Mật khẩu phải có ít nhất 8 ký tự."); return; }
    if (adminStudentPassword !== adminStudentPasswordConfirm) { setStudentPasswordError("Mật khẩu xác nhận không khớp."); return; }
    setSavingStudentPassword(true);
    try {
      const response = await authenticatedFetch("/api/admin/users", {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ userId: passwordStudent.id, password: adminStudentPassword }),
      });
      const result = await response.json().catch(() => ({})) as { error?: string };
      if (!response.ok) throw new Error(result.error ?? "Không thể đổi mật khẩu học viên.");
      const studentLabel = `${passwordStudent.student_code} — ${passwordStudent.full_name}`;
      setPasswordStudent(null);
      setAdminStudentPassword("");
      setAdminStudentPasswordConfirm("");
      setAdminNotice(`Đã đổi mật khẩu cho ${studentLabel}.`);
    } catch (value) {
      setStudentPasswordError(value instanceof Error ? value.message : "Không thể đổi mật khẩu học viên. Hãy thử lại.");
    } finally {
      setSavingStudentPassword(false);
    }
  }

  async function createCourse(event: React.FormEvent) {
    event.preventDefault();
    setCourseError(""); setAdminNotice("");
    const title = newCourseTitle.trim();
    if (!title) { setCourseError("Tên khóa học không được để trống."); return; }
    if (!supabase) { setCourseError("Chưa cấu hình Supabase."); return; }
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) { setCourseError("Phiên đăng nhập đã hết hạn."); return; }
    setCreatingCourse(true);
    try {
      const { error } = await supabase.from("courses").insert({
        title,
        description: newCourseDescription.trim(),
        cover_url: newCourseCoverUrl.trim() || null,
        cover_color: courseColor(newCourseColor),
        published: newCoursePublished,
        sort_order: adminCourses.length,
      });
      if (error) throw error;
      setCourseModal(false); setNewCourseTitle(""); setNewCourseDescription(""); setNewCourseCoverUrl(""); setNewCourseColor("#1d4ed8"); setNewCoursePublished(false);
      setAdminNotice("Đã tạo khóa học.");
      await loadAdminData();
    } catch (value) {
      setCourseError(value instanceof Error ? value.message : "Không thể tạo khóa học. Hãy thử lại.");
    } finally {
      setCreatingCourse(false);
    }
  }

  async function assignCourse(event: React.FormEvent) {
    event.preventDefault(); setAssignError("");
    if (!supabase || !assignStudentId || !assignCourseId) { setAssignError("Hãy chọn học viên và khóa học."); return; }
    setAssigningCourse(true);
    try {
      const { error } = await supabase.from("course_enrollments").upsert({ student_id: assignStudentId, course_id: assignCourseId });
      if (error) throw error;
      setAdminNotice("Đã phân khóa học cho học viên.");
      await loadAdminData();
    } catch (value) {
      setAssignError(value instanceof Error ? value.message : "Không thể phân khóa học. Hãy thử lại.");
    } finally {
      setAssigningCourse(false);
    }
  }

  async function removeEnrollment(studentId: string, courseId: string) {
    if (!supabase || !window.confirm("Bỏ khóa học khỏi học viên này?")) return;
    const { error } = await supabase.from("course_enrollments").delete().eq("student_id", studentId).eq("course_id", courseId);
    if (error) setAssignError(error.message); else await loadAdminData();
  }

  async function assignExamRoom(event: React.FormEvent) {
    event.preventDefault(); setAssignError("");
    if (!supabase || !assignExamStudentId || !assignExamRoomId) { setAssignError("Hãy chọn học viên và phòng thi."); return; }
    setAssigningExamRoom(true);
    try {
      const { error } = await supabase.from("exam_room_enrollments").upsert({ student_id: assignExamStudentId, room_id: assignExamRoomId });
      if (error) throw error;
      setAdminNotice("Đã cấp quyền phòng thi cho học viên.");
      await loadAdminData();
    } catch (value) {
      setAssignError(value instanceof Error ? value.message : "Không thể cấp quyền phòng thi. Hãy thử lại.");
    } finally {
      setAssigningExamRoom(false);
    }
  }

  async function removeExamRoomEnrollment(studentId: string, roomId: string) {
    if (!supabase || !window.confirm("Bỏ quyền phòng thi của học viên này?")) return;
    const { error } = await supabase.from("exam_room_enrollments").delete().eq("student_id", studentId).eq("room_id", roomId);
    if (error) setAssignError(error.message); else await loadAdminData();
  }

  function navigateAdmin(path: string) {
    window.history.pushState({}, "", path);
    setTab(adminTabFromPath(path));
    setManagedCourseId("");
    window.dispatchEvent(new PopStateEvent("popstate"));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function navigateAdminLink(event: React.MouseEvent<HTMLAnchorElement>, path: string) {
    if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
    event.preventDefault();
    navigateAdmin(path);
  }

  const publishedCourseCount = adminCourses.filter(course => course.published).length;
  const draftCourseCount = adminCourses.length - publishedCourseCount;
  const publishedRoomCount = adminExamRooms.filter(room => room.published).length;
  const draftRoomCount = adminExamRooms.length - publishedRoomCount;
  const activeStudentCount = profiles.filter(p => p.role === "student" && p.status === "active").length;

  return <div className="admin-page">
      {adminError && <p className="form-error" role="alert">Không thể tải dữ liệu quản trị: {adminError}</p>}
      {adminNotice && <p className="form-success" role="status" aria-live="polite">{adminNotice}</p>}
    {tab === "dashboard" && <div className="admin-dashboard-v2">
      <header className="admin-dash-header">
        <div>
          <h1>Tổng quan</h1>
          <p>Những việc cần xử lý trước khi mở đợt thi.</p>
        </div>
        <div className="admin-dash-actions">
          <Link className="outline-btn" href="/admin/sessions" onClick={event => navigateAdminLink(event, "/admin/sessions")}>Kíp thi</Link>
          <Link className="primary-btn small" href="/admin/exams/rooms/new" onClick={event => navigateAdminLink(event, "/admin/exams/rooms/new")}><Plus aria-hidden="true"/> Tạo đề thi</Link>
        </div>
      </header>

      {/* KPI row */}
      <nav className="admin-kpi-row admin-dash-status-rail" aria-label="Đi tới dữ liệu tổng quan">
        <Link href="/admin/students" className="admin-kpi-card admin-dash-status-card" onClick={event => navigateAdminLink(event, "/admin/students")}>
          <span className="admin-kpi-label">Học viên hoạt động</span>
          <span className="admin-kpi-value">{loadingAdmin ? "—" : activeStudentCount}</span>
          <span className="admin-kpi-sub">{loadingAdmin ? "" : `${students.length} tổng`}</span>
        </Link>
        <Link href="/admin/exams" className="admin-kpi-card admin-dash-status-card" onClick={event => navigateAdminLink(event, "/admin/exams")}>
          <span className="admin-kpi-label">Đề thi</span>
          <span className="admin-kpi-value">{loadingAdmin ? "—" : adminExamRooms.length}</span>
          <span className="admin-kpi-sub">{loadingAdmin ? "" : `${publishedRoomCount} đã xuất bản`}</span>
        </Link>
        <Link href="/admin/exams" className="admin-kpi-card admin-dash-status-card" onClick={event => navigateAdminLink(event, "/admin/exams")}>
          <span className="admin-kpi-label">Cần hoàn thiện</span>
          <span className="admin-kpi-value">{loadingAdmin ? "—" : draftRoomCount + draftCourseCount}</span>
          <span className="admin-kpi-sub">đề và tài nguyên</span>
        </Link>
        <Link href="/admin/content" className="admin-kpi-card admin-dash-status-card" onClick={event => navigateAdminLink(event, "/admin/content")}>
          <span className="admin-kpi-label">Tài nguyên</span>
          <span className="admin-kpi-value">{loadingAdmin ? "—" : adminCourses.length}</span>
          <span className="admin-kpi-sub">{loadingAdmin ? "" : `${publishedCourseCount} đã xuất bản`}</span>
        </Link>
      </nav>

      <nav className="admin-workflow-strip admin-dash-workflow" aria-label="Quy trình giáo viên">
        <div className="admin-workflow-intro"><span>QUY TRÌNH GIÁO VIÊN</span><b>Từ nội dung đến kết quả</b></div>
        <Link href="/admin/exams" onClick={event => navigateAdminLink(event, "/admin/exams")}><i>01</i><span><b>Soạn đề</b><small>Nội dung và câu hỏi</small></span><ChevronRight aria-hidden="true" /></Link>
        <Link href="/admin/exams" onClick={event => navigateAdminLink(event, "/admin/exams")}><i>02</i><span><b>Kiểm tra và xuất bản</b><small>Xem trước và kiểm tra lỗi</small></span><ChevronRight aria-hidden="true" /></Link>
        <Link href="/admin/sessions" onClick={event => navigateAdminLink(event, "/admin/sessions")}><i>03</i><span><b>Tạo kíp thi</b><small>Thời gian và truy cập</small></span><ChevronRight aria-hidden="true" /></Link>
        <Link href="/admin/sessions" onClick={event => navigateAdminLink(event, "/admin/sessions")}><i>04</i><span><b>Theo dõi và kết quả</b><small>Tiến độ và công bố điểm</small></span><ChevronRight aria-hidden="true" /></Link>
      </nav>

      {/* Two-column: action panels */}
      <div className="admin-two-col admin-dash-attention-grid">
        {/* Cần xử lý */}
        <section className="admin-action-panel" aria-labelledby="admin-attention-title">
          <div className="admin-action-panel-head">
            <h2 id="admin-attention-title">Cần xử lý</h2>
            <span style={{ fontSize: 12, color: "var(--admin-muted)" }}>{loadingAdmin ? "" : `${draftRoomCount + draftCourseCount} mục`}</span>
          </div>
          {loadingAdmin ? <LoadingIndicator label="Đang tải…" /> : (draftRoomCount + draftCourseCount) === 0
            ? <div className="admin-empty-panel"><p>Không có gì cần xử lý.</p><button type="button" className="outline-btn" onClick={() => navigateAdmin("/admin/exams")}>Mở danh sách đề</button></div>
            : <div>
                {draftRoomCount > 0 && <button type="button" className="admin-action-item" onClick={() => navigateAdmin("/admin/exams")}>
                  <span className="admin-action-dot warn" aria-hidden="true" />
                  <span className="admin-action-text"><b>{draftRoomCount} đề thi chưa xuất bản</b><small>Kiểm tra nội dung và cấu hình trước khi mở.</small></span>
                  <span className="admin-action-arrow"><ChevronRight aria-hidden="true" /></span>
                </button>}
                {draftCourseCount > 0 && <button type="button" className="admin-action-item" onClick={() => navigateAdmin("/admin/content")}>
                  <span className="admin-action-dot neutral" aria-hidden="true" />
                  <span className="admin-action-text"><b>{draftCourseCount} khóa học bản nháp</b><small>Hoàn thiện nội dung hoặc xuất bản khi sẵn sàng.</small></span>
                  <span className="admin-action-arrow"><ChevronRight aria-hidden="true" /></span>
                </button>}
              </div>
          }
        </section>

        {/* Hoạt động gần đây */}
        <section className="admin-action-panel" aria-labelledby="admin-activity-title">
          <div className="admin-action-panel-head">
            <h2 id="admin-activity-title">Hoạt động gần đây</h2>
          </div>
          {loadingAdmin ? <LoadingIndicator label="Đang tải…" /> : recentActivity.length
            ? <div>{recentActivity.map(item => <div className="admin-log-item" key={item.id}>
                <span className="admin-log-dot" aria-hidden="true" />
                <span className="admin-log-text">{item.text}</span>
                <span className="admin-log-date">{new Date(item.date).toLocaleDateString("vi-VN")}</span>
              </div>)}
            </div>
            : <div className="admin-empty-panel">Chưa có hoạt động nào.</div>
          }
        </section>
      </div>
    </div>}
    {tab === "students" && <section className="section-card student-manager"><div className="section-head"><div><h2>Quản lý học viên</h2><p className="muted">Dữ liệu tài khoản, email và khóa học từ Supabase.</p></div><button className="primary-btn small" onClick={()=>{setCreateError("");setModal(true)}}><Plus/> Thêm học viên</button></div><label className="search wide student-search"><Search/><input type="search" value={searchTerm} onChange={event=>setSearchTerm(event.target.value)} placeholder="Tìm theo tên, mã học viên hoặc email…" aria-label="Tìm học viên theo tên, mã hoặc email"/>{searchTerm && <button type="button" onClick={()=>setSearchTerm("")} aria-label="Xóa từ khóa"><X/></button>}</label><div className="student-search-hint">Có thể nhập toàn bộ hoặc một phần địa chỉ email.</div><div className="admin-table student-table"><div className="table-row table-title"><span>Học viên / Email</span><span>Mã</span><span>Khóa học</span><span>Trạng thái</span><span>Thao tác</span></div>{loadingAdmin ? <LoadingIndicator label="Đang tải dữ liệu…" /> : filteredStudents.length ? filteredStudents.map(student=><div className="table-row" key={student.id}><span><i className="mini-avatar">{student.full_name.split(" ").slice(-2).map(value=>value[0]).join("").toUpperCase()}</i><span className="student-name-email"><b>{student.full_name}</b><small>{student.email || "Chưa có email"}</small></span></span><span>{student.student_code}</span><span>{enrollmentCount[student.id] ?? 0} khóa</span><span><i className={student.status === "active" ? "active-dot" : "locked-dot"}/> {student.status === "active" ? "Hoạt động" : "Đã khóa"}</span><span><button className="student-password-btn" onClick={()=>openStudentPassword(student)}><LockKeyhole/> Đổi mật khẩu</button></span></div>) : <div className="overview-empty">Không tìm thấy học viên phù hợp.</div>}</div></section>}
    {tab === "content" && (managedCourseId && adminCourses.some(course=>course.id===managedCourseId) ? <AdminCourseBuilder course={adminCourses.find(course=>course.id===managedCourseId)!} onBack={()=>{setManagedCourseId("");window.history.pushState({},"","/admin/content");}} onChanged={loadAdminData} onDeleted={async()=>{setManagedCourseId("");window.history.pushState({},"","/admin/content");await loadAdminData()}}/> : <section className="section-card"><div className="section-head"><div><h2>Quản lý nội dung</h2><p className="muted">Khóa học được chia theo Phần → Bài → Bài giảng / tài liệu và lưu tại Supabase.</p></div><button className="primary-btn small" onClick={()=>{setCourseError("");setCourseModal(true)}}><Plus/> Tạo khóa học</button></div><div className="content-admin-grid">{loadingAdmin ? <LoadingIndicator label="Đang tải dữ liệu…" /> : adminCourses.length ? adminCourses.map(course=><article key={course.id}><div className="tiny-cover" style={courseColorStyle(course.cover_color)}>{course.cover_url?<img src={course.cover_url} alt=""/>:<Library/>}</div><div><h3>{course.title}</h3><p>{lessonsPerCourse[course.id] ?? 0} bài học · {course.published ? "Đã xuất bản" : "Bản nháp"}</p></div><button className="outline-btn" onClick={()=>{setManagedCourseId(course.id);window.history.pushState({},"",`/admin/content/courses/${encodeURIComponent(course.id)}`)}}>Quản lý <ChevronRight/></button></article>) : <div className="overview-empty">Chưa có khóa học nào.</div>}</div></section>)}
    {tab === "exams" && <Suspense fallback={<LoadingIndicator label="Đang mở quản trị đề thi…" />}><AdminExamManager /></Suspense>}
    {tab === "question-bank" && <Suspense fallback={<LoadingIndicator label="Đang mở ngân hàng câu hỏi…" />}><AdminQuestionBank navigate={navigateAdmin} /></Suspense>}
    {tab === "sessions" && (typeof window !== "undefined" && window.location.pathname === "/admin/sessions/new"
      ? <Suspense fallback={<LoadingIndicator label="Đang mở trình tạo kíp thi…" />}><AdminSessionWizard navigate={navigateAdmin} /></Suspense>
      : typeof window !== "undefined" && /^\/admin\/sessions\/[^/]+\/results$/.test(window.location.pathname)
        ? <Suspense fallback={<LoadingIndicator label="Đang mở kết quả kíp thi…" />}><AdminSessionResults key={`${window.location.pathname}${window.location.search}`} navigate={navigateAdmin} /></Suspense>
      : <AdminSessionList navigate={navigateAdmin} />)}
    {tab === "upload" && <Suspense fallback={<LoadingIndicator label="Đang mở kho ảnh…" />}><AdminUploadManager /></Suspense>}
    {(tab === "enrollments" || tab === "settings") && tab === "enrollments" && <div className="assignment-page">
      <header className="assignment-page-head"><div><span className="eyebrow">PHÂN QUYỀN HỌC VIÊN</span><h2>Khóa học và phòng thi</h2><p>Quản lý toàn bộ nội dung được cấp cho từng học viên tại một nơi.</p></div></header>
      {assignError && <p className="form-error">{assignError}</p>}
      <section className="section-card enrollment-manager"><div className="section-head"><div><h2>Phân khóa học</h2><p className="muted">Học viên chỉ thấy khóa đã được phân và xuất bản.</p></div></div><form className="enrollment-form" onSubmit={assignCourse}><label>Học viên<select value={assignStudentId} onChange={event=>setAssignStudentId(event.target.value)} required><option value="">Chọn học viên</option>{students.map(student=><option key={student.id} value={student.id}>{student.student_code} — {student.full_name}{student.email ? ` — ${student.email}` : ""}</option>)}</select></label><label>Khóa học<select value={assignCourseId} onChange={event=>setAssignCourseId(event.target.value)} required><option value="">Chọn khóa học</option>{adminCourses.map(course=><option key={course.id} value={course.id}>{course.title}{course.published?"":" (bản nháp)"}</option>)}</select></label><button className="primary-btn small" disabled={assigningCourse}>{assigningCourse?"Đang phân…":"Phân khóa học"}</button></form><div className="enrollment-list">{enrollments.length?enrollments.map(row=>{const student=students.find(item=>item.id===row.student_id);const course=adminCourses.find(item=>item.id===row.course_id);return <article key={`${row.student_id}-${row.course_id}`}><div><b>{student?.full_name??"Học viên không tồn tại"}</b><small>{student?.student_code}{student?.email ? ` · ${student.email}` : ""}</small></div><ChevronRight/><div><b>{course?.title??"Khóa học không tồn tại"}</b><small>{course?.published?"Đã xuất bản":"Bản nháp"}</small></div><button className="outline-btn danger" onClick={()=>removeEnrollment(row.student_id,row.course_id)}><Trash2/> Bỏ phân</button></article>}):<MiniEmpty text="Chưa có học viên nào được phân khóa."/>}</div></section>
      <section className="section-card enrollment-manager"><div className="section-head"><div><h2>Phân phòng thi</h2><p className="muted">Áp dụng cho phòng có quyền truy cập “Chỉ học viên được phân”.</p></div></div><form className="enrollment-form" onSubmit={assignExamRoom}><label>Học viên<select value={assignExamStudentId} onChange={event=>setAssignExamStudentId(event.target.value)} required><option value="">Chọn học viên</option>{students.map(student=><option key={student.id} value={student.id}>{student.student_code} — {student.full_name}{student.email ? ` — ${student.email}` : ""}</option>)}</select></label><label>Phòng thi<select value={assignExamRoomId} onChange={event=>setAssignExamRoomId(event.target.value)} required><option value="">Chọn phòng thi</option>{adminExamRooms.map(room=><option key={room.id} value={room.id}>{room.title}{room.access_mode === "open" ? " (đang mở cho mọi học viên)" : ""}{room.published ? "" : " (bản nháp)"}</option>)}</select></label><button className="primary-btn small" disabled={assigningExamRoom}>{assigningExamRoom?"Đang phân…":"Cấp phòng thi"}</button></form><div className="enrollment-list">{examRoomEnrollments.length?examRoomEnrollments.map(row=>{const student=students.find(item=>item.id===row.student_id);const room=adminExamRooms.find(item=>item.id===row.room_id);return <article key={`${row.student_id}-${row.room_id}`}><div><b>{student?.full_name??"Học viên không tồn tại"}</b><small>{student?.student_code}{student?.email ? ` · ${student.email}` : ""}</small></div><ChevronRight/><div><b>{room?.title??"Phòng thi không tồn tại"}</b><small>{room?.published?"Đã xuất bản":"Bản nháp"}</small></div><button className="outline-btn danger" onClick={()=>removeExamRoomEnrollment(row.student_id,row.room_id)}><Trash2/> Bỏ quyền</button></article>}):<MiniEmpty text="Chưa có học viên nào được phân phòng thi."/>}</div></section>
    </div>}
    {tab === "settings" && <AdminSecurity />}
    {modal && <div className="modal-shade"><form className="modal" role="dialog" aria-modal="true" aria-labelledby="create-student-title" onSubmit={createStudent}><div className="section-head"><div><span className="eyebrow">TÀI KHOẢN MỚI</span><h2 id="create-student-title">Thêm học viên</h2></div><button type="button" className="icon-btn" aria-label="Đóng hộp thoại thêm học viên" onClick={()=>setModal(false)}><X aria-hidden="true"/></button></div><label htmlFor="new-student-name">Họ và tên<input id="new-student-name" name="fullName" autoComplete="name" value={newFullName} onChange={event=>setNewFullName(event.target.value)} placeholder="Nguyễn Văn A" required/></label><label htmlFor="new-student-email">Email<input id="new-student-email" name="email" type="email" autoComplete="email" spellCheck={false} value={newEmail} onChange={event=>setNewEmail(event.target.value)} placeholder="hocvien@example.com" required/></label><label htmlFor="new-student-password">Mật khẩu ban đầu<input id="new-student-password" name="password" type="password" autoComplete="new-password" value={newStudentPassword} onChange={event=>setNewStudentPassword(event.target.value)} placeholder="Tối thiểu 8 ký tự" minLength={8} required/></label>{createError && <p className="form-error" role="alert">{createError}</p>}<p className="info-note">Mã học viên tiếp theo được Supabase tạo tự động theo dạng REMIX000001.</p><button className="primary-btn" disabled={creatingStudent}>{creatingStudent ? "Đang tạo…" : "Tạo tài khoản"}</button></form></div>}
    {passwordStudent && <div className="modal-shade"><form className="modal password-modal" role="dialog" aria-modal="true" aria-labelledby="student-password-title" onSubmit={changeStudentPassword}><div className="section-head"><div><span className="eyebrow">BẢO MẬT HỌC VIÊN</span><h2 id="student-password-title">Đổi mật khẩu</h2></div><button type="button" className="icon-btn" aria-label="Đóng hộp thoại đổi mật khẩu" onClick={closeStudentPassword} disabled={savingStudentPassword}><X aria-hidden="true"/></button></div><div className="student-password-identity"><span className="mini-avatar">{passwordStudent.full_name.split(" ").slice(-2).map(value=>value[0]).join("").toUpperCase()}</span><div><b>{passwordStudent.full_name}</b><small>{passwordStudent.student_code}</small></div></div><label htmlFor="admin-student-password">Mật khẩu mới<input id="admin-student-password" name="password" type="password" autoComplete="new-password" value={adminStudentPassword} onChange={event=>setAdminStudentPassword(event.target.value)} placeholder="Tối thiểu 8 ký tự" minLength={8} required autoFocus/></label><label htmlFor="admin-student-password-confirm">Xác nhận mật khẩu<input id="admin-student-password-confirm" name="passwordConfirmation" type="password" autoComplete="new-password" value={adminStudentPasswordConfirm} onChange={event=>setAdminStudentPasswordConfirm(event.target.value)} placeholder="Nhập lại mật khẩu mới" minLength={8} required/></label>{studentPasswordError && <p className="form-error" role="alert">{studentPasswordError}</p>}<p className="info-note">Học viên có thể đăng nhập ngay bằng mật khẩu mới sau khi cập nhật.</p><button className="primary-btn" disabled={savingStudentPassword}>{savingStudentPassword ? "Đang cập nhật…" : "Cập nhật mật khẩu"}</button></form></div>}
    {courseModal && <div className="modal-shade"><form className="modal" onSubmit={createCourse}><div className="section-head"><div><span className="eyebrow">NỘI DUNG MỚI</span><h2>Tạo khóa học</h2></div><button type="button" className="icon-btn" aria-label="Đóng hộp thoại tạo khóa học" onClick={()=>setCourseModal(false)}><X aria-hidden="true"/></button></div><label>Tên khóa học<input value={newCourseTitle} onChange={event=>setNewCourseTitle(event.target.value)} placeholder="Nhập tên khóa học" required/></label><label>Mô tả<textarea value={newCourseDescription} onChange={event=>setNewCourseDescription(event.target.value)} placeholder="Mô tả ngắn về khóa học" rows={4}/></label><label>Ảnh bìa (URL)<input type="url" value={newCourseCoverUrl} onChange={event=>setNewCourseCoverUrl(event.target.value)} placeholder="https://..."/></label><label>Màu khóa học<div className="course-color-field"><input type="color" value={courseColor(newCourseColor)} onChange={event=>setNewCourseColor(event.target.value)}/><input value={newCourseColor} onChange={event=>setNewCourseColor(event.target.value)} pattern="#[0-9a-fA-F]{6}" aria-label="Mã màu khóa học"/></div></label><label className="checkbox-row"><input type="checkbox" checked={newCoursePublished} onChange={event=>setNewCoursePublished(event.target.checked)}/><span>Xuất bản ngay</span></label>{courseError && <p className="form-error" role="alert">{courseError}</p>}<p className="info-note">Màu chỉ áp dụng cho bìa của khóa học này khi chưa có ảnh. Học viên chỉ nhìn thấy sau khi được phân khóa học.</p><button className="primary-btn" disabled={creatingCourse}>{creatingCourse ? "Đang tạo…" : "Tạo khóa học"}</button></form></div>}
  </div>;
}

function AdminCourseBuilder({ course, onBack, onChanged, onDeleted }: { course: AdminCourseRow; onBack: () => void; onChanged: () => Promise<void>; onDeleted: () => Promise<void> }) {
  const [title, setTitle] = useState(course.title);
  const [description, setDescription] = useState(course.description);
  const [coverUrl, setCoverUrl] = useState(course.cover_url ?? "");
  const [coverColor, setCoverColor] = useState(courseColor(course.cover_color));
  const [published, setPublished] = useState(course.published);
  const [chapters, setChapters] = useState<ChapterData[]>([]);
  const [lessons, setLessons] = useState<LessonData[]>([]);
  const [resources, setResources] = useState<ResourceData[]>([]);
  const [builderLoading, setBuilderLoading] = useState(true);
  const [builderError, setBuilderError] = useState("");
  const [builderNotice, setBuilderNotice] = useState("");
  const [builderModal, setBuilderModal] = useState<"chapter" | "lesson" | "resource" | null>(null);
  const [targetChapterId, setTargetChapterId] = useState("");
  const [targetLessonId, setTargetLessonId] = useState("");
  const [newChapterTitle, setNewChapterTitle] = useState("");
  const [newLessonTitle, setNewLessonTitle] = useState("");
  const [newLessonDescription, setNewLessonDescription] = useState("");
  const [newLessonPublished, setNewLessonPublished] = useState(false);
  const [newResourceTitle, setNewResourceTitle] = useState("");
  const [newResourceType, setNewResourceType] = useState<ResourceData["resource_type"]>("youtube");
  const [newResourceUrl, setNewResourceUrl] = useState("");
  const [newResourceFile, setNewResourceFile] = useState<File | null>(null);
  const [newResourceAllowDownload, setNewResourceAllowDownload] = useState(false);
  const [renameTarget, setRenameTarget] = useState<{ table: "chapters" | "lessons"; id: string; title: string } | null>(null);
  const [renameTitle, setRenameTitle] = useState("");
  const [savingBuilder, setSavingBuilder] = useState(false);
  const closeBuilderDialog = useCallback(() => {
    setBuilderModal(null);
    setRenameTarget(null);
    setRenameTitle("");
  }, []);
  useAdminDialogFocus(Boolean(builderModal || renameTarget), closeBuilderDialog);

  // Reset the builder draft when the selected course changes.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { setTitle(course.title); setDescription(course.description); setCoverUrl(course.cover_url ?? ""); setCoverColor(courseColor(course.cover_color)); setPublished(course.published); }, [course]);

  const loadBuilderData = useCallback(async () => {
    if (!supabase) { setBuilderError("Chưa cấu hình Supabase."); setBuilderLoading(false); return; }
    setBuilderLoading(true); setBuilderError("");
    const chapterResult = await supabase.from("chapters").select("id,course_id,title,sort_order").eq("course_id", course.id).order("sort_order");
    const chapterIds = (chapterResult.data ?? []).map(chapter => chapter.id);
    const lessonResult = chapterIds.length ? await supabase.from("lessons").select("id,chapter_id,title,description,published,sort_order").in("chapter_id", chapterIds).order("sort_order") : { data: [], error: null };
    const lessonIds = (lessonResult.data ?? []).map(lesson => lesson.id);
    const resourceResult = lessonIds.length ? await supabase.from("lesson_resources").select("id,lesson_id,title,resource_type,resource_url,allow_download,sort_order").in("lesson_id", lessonIds).order("sort_order") : { data: [], error: null };
    const error = chapterResult.error ?? lessonResult.error ?? resourceResult.error;
    if (error) setBuilderError(error.message);
    setChapters((chapterResult.data ?? []) as ChapterData[]);
    setLessons((lessonResult.data ?? []) as LessonData[]);
    setResources((resourceResult.data ?? []) as ResourceData[]);
    setBuilderLoading(false);
  }, [course.id]);

  // Load the selected course hierarchy after the builder mounts.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void loadBuilderData(); }, [loadBuilderData]);

  async function saveCourse() {
    if (!supabase) return;
    setSavingBuilder(true); setBuilderError(""); setBuilderNotice("");
    const { error } = await supabase.from("courses").update({ title: title.trim(), description: description.trim(), cover_url: coverUrl.trim() || null, cover_color: courseColor(coverColor), published }).eq("id", course.id);
    setSavingBuilder(false);
    if (error) { setBuilderError(error.message); return; }
    setBuilderNotice("Đã lưu thông tin khóa học.");
    await onChanged();
  }

  async function deleteCourse() {
    if (!supabase || !window.confirm(`Xóa khóa học “${course.title}” cùng toàn bộ phần, bài học và nội dung?`)) return;
    const { error } = await supabase.from("courses").delete().eq("id", course.id);
    if (error) { setBuilderError(error.message); return; }
    await onDeleted();
  }

  async function createChapter(event: React.FormEvent) {
    event.preventDefault(); if (!supabase) return;
    const name = cleanPartTitle(newChapterTitle); if (!name) return;
    setSavingBuilder(true);
    const { error } = await supabase.from("chapters").insert({ course_id: course.id, title: name, sort_order: chapters.length });
    setSavingBuilder(false); if (error) { setBuilderError(error.message); return; }
    setBuilderModal(null); setNewChapterTitle(""); await loadBuilderData();
  }

  async function createLesson(event: React.FormEvent) {
    event.preventDefault(); if (!supabase || !targetChapterId) return;
    const name = cleanLessonTitle(newLessonTitle); if (!name) return;
    const order = lessons.filter(lesson=>lesson.chapter_id===targetChapterId).length;
    setSavingBuilder(true);
    const { error } = await supabase.from("lessons").insert({ chapter_id: targetChapterId, title: name, description: newLessonDescription.trim(), published: newLessonPublished, sort_order: order });
    setSavingBuilder(false); if (error) { setBuilderError(error.message); return; }
    setBuilderModal(null); setNewLessonTitle(""); setNewLessonDescription(""); setNewLessonPublished(false); await loadBuilderData(); await onChanged();
  }

  async function createResource(event: React.FormEvent) {
    event.preventDefault(); if (!supabase || !targetLessonId) return;
    const name = newResourceTitle.trim(); let url = newResourceUrl.trim(); let uploadedPath = ""; if (!name) return;
    if (newResourceType === "storage_pdf") {
      if (!newResourceFile) { setBuilderError("Hãy chọn file PDF để tải lên."); return; }
      if (newResourceFile.size > 50 * 1024 * 1024) { setBuilderError("File PDF không được vượt quá 50 MB."); return; }
      setSavingBuilder(true); setBuilderError("");
      const requestHeaders = { "content-type": "application/json" };
      const prepareResponse = await authenticatedFetch("/api/admin/lesson-files", { method: "POST", headers: requestHeaders, body: JSON.stringify({ action: "prepare", courseId: course.id, lessonId: targetLessonId, filename: newResourceFile.name, mimeType: newResourceFile.type, size: newResourceFile.size }) });
      const prepared = await prepareResponse.json() as { uploadUrl?: string; path?: string; error?: string };
      if (!prepareResponse.ok || !prepared.uploadUrl || !prepared.path) { setSavingBuilder(false); setBuilderError(prepared.error || "Không thể chuẩn bị upload PDF lên R2."); return; }
      uploadedPath = prepared.path;
      const directUpload = await fetch(prepared.uploadUrl, { method: "PUT", headers: { "content-type": "application/pdf" }, body: newResourceFile });
      if (!directUpload.ok) { setSavingBuilder(false); setBuilderError(`R2 từ chối upload PDF (${directUpload.status}). Hãy kiểm tra CORS và API token.`); return; }
      const confirmResponse = await authenticatedFetch("/api/admin/lesson-files", { method: "POST", headers: requestHeaders, body: JSON.stringify({ action: "confirm", courseId: course.id, lessonId: targetLessonId, path: prepared.path, size: newResourceFile.size }) });
      const confirmed = await confirmResponse.json() as { reference?: string; error?: string };
      if (!confirmResponse.ok || !confirmed.reference) { await deleteStoredLessonFile("", prepared.path); setSavingBuilder(false); setBuilderError(confirmed.error || "Không thể xác nhận PDF trên R2."); return; }
      url = confirmed.reference;
    }
    if (!url) { setBuilderError("Hãy nhập URL nội dung."); return; }
    const order = resources.filter(resource=>resource.lesson_id===targetLessonId).length;
    setSavingBuilder(true);
    const { error } = await supabase.from("lesson_resources").insert({ lesson_id: targetLessonId, title: name, resource_type: newResourceType, resource_url: url, allow_download: newResourceType === "youtube" ? false : newResourceAllowDownload, sort_order: order });
    setSavingBuilder(false); if (error) {
      if (uploadedPath) await deleteStoredLessonFile(url, uploadedPath);
      setBuilderError(error.message); return;
    }
    setBuilderModal(null); setNewResourceTitle(""); setNewResourceUrl(""); setNewResourceFile(null); setNewResourceType("youtube"); setNewResourceAllowDownload(false); await loadBuilderData();
  }

  async function deleteStoredLessonFile(reference: string, path = "") {
    if (!supabase || !reference && !path) return;
    await authenticatedFetch("/api/admin/lesson-files", { method: "DELETE", headers: { "content-type": "application/json" }, body: JSON.stringify({ reference, path }) });
  }

  function openRenameModal(table: "chapters" | "lessons", id: string, currentTitle: string) {
    setRenameTarget({ table, id, title: currentTitle });
    setRenameTitle(table === "chapters" ? cleanPartTitle(currentTitle) : cleanLessonTitle(currentTitle));
  }

  async function saveRename(event: React.FormEvent) {
    event.preventDefault(); if (!supabase || !renameTarget) return;
    const nextTitle = renameTarget.table === "chapters" ? cleanPartTitle(renameTitle) : cleanLessonTitle(renameTitle);
    if (!nextTitle) return;
    setSavingBuilder(true); setBuilderError("");
    const { error } = await supabase.from(renameTarget.table).update({ title: nextTitle }).eq("id", renameTarget.id);
    setSavingBuilder(false);
    if (error) { setBuilderError(error.message); return; }
    setRenameTarget(null); setRenameTitle(""); await loadBuilderData();
  }

  async function removeRecord(table: "chapters" | "lessons" | "lesson_resources", id: string, label: string) {
    if (!supabase || !window.confirm(`Xóa ${label}?`)) return;
    const storedResource = table === "lesson_resources" ? resources.find(resource=>resource.id===id && resource.resource_type==="storage_pdf") : undefined;
    const { error } = await supabase.from(table).delete().eq("id", id);
    if (error) { setBuilderError(error.message); return; }
    if (storedResource) {
      if (storedResource.resource_url.startsWith("r2://")) await deleteStoredLessonFile(storedResource.resource_url);
      else {
        const marker = "/lesson-files/";
        const markerIndex = storedResource.resource_url.indexOf(marker);
        if (markerIndex >= 0) await deleteStoredLessonFile("", decodeURIComponent(storedResource.resource_url.slice(markerIndex + marker.length)));
      }
    }
    await loadBuilderData(); await onChanged();
  }

  async function toggleLesson(lesson: LessonData) {
    if (!supabase) return; const { error } = await supabase.from("lessons").update({ published: !lesson.published }).eq("id", lesson.id); if (error) setBuilderError(error.message); else { await loadBuilderData(); await onChanged(); }
  }

  async function toggleResourceDownload(resource: ResourceData) {
    if (!supabase || resource.resource_type === "youtube") return;
    const { error } = await supabase.from("lesson_resources").update({ allow_download: !resource.allow_download }).eq("id", resource.id);
    if (error) setBuilderError(error.message); else await loadBuilderData();
  }

  return <section className="admin-course-builder">
    <button className="back-btn" onClick={onBack}><ArrowLeft/> Danh sách khóa học</button>
    <div className="builder-header"><div><span className="eyebrow">TRÌNH SOẠN NỘI DUNG</span><h2>{course.title}</h2><p>Khóa học → Phần → Bài → Bài giảng / tài liệu</p></div><div className="builder-actions"><button className="outline-btn danger" onClick={deleteCourse}><Trash2/> Xóa khóa</button><button className="primary-btn small" onClick={saveCourse} disabled={savingBuilder}><Save/> {savingBuilder?"Đang lưu…":"Lưu khóa học"}</button></div></div>
    {builderError&&<p className="form-error">{builderError}</p>}{builderNotice&&<p className="form-success">{builderNotice}</p>}
    <div className="builder-layout">
      <div className="section-card builder-settings"><h3>Thông tin khóa học</h3><label>Tên khóa học<input value={title} onChange={event=>setTitle(event.target.value)}/></label><label>Mô tả<textarea rows={5} value={description} onChange={event=>setDescription(event.target.value)}/></label><label>Ảnh bìa (URL)<input type="url" value={coverUrl} onChange={event=>setCoverUrl(event.target.value)}/></label><label>Màu khóa học<div className="course-color-field"><input type="color" value={courseColor(coverColor)} onChange={event=>setCoverColor(event.target.value)}/><input value={coverColor} onChange={event=>setCoverColor(event.target.value)} pattern="#[0-9a-fA-F]{6}" aria-label="Mã màu khóa học"/></div></label><label className="checkbox-row"><input type="checkbox" checked={published} onChange={event=>setPublished(event.target.checked)}/><span>Đã xuất bản</span></label></div>
      <div className="section-card builder-tree">
        <div className="section-head builder-tree-head"><div><span className="eyebrow">NỘI DUNG KHÓA HỌC</span><h3>Cấu trúc giáo trình</h3><p>{chapters.length} phần · {lessons.length} bài học · {resources.length} nội dung</p></div><button className="primary-btn small" onClick={()=>{setNewChapterTitle("");setBuilderModal("chapter")}}><FolderPlus/> Thêm phần</button></div>
        <div className="hierarchy-guide"><span><b>1</b> Phần</span><ChevronRight/><span><b>2</b> Bài</span><ChevronRight/><span><b>3</b> Bài giảng / tài liệu</span></div>
        {builderLoading?<LoadingIndicator label="Đang tải nội dung…" />:chapters.length?<div className="admin-chapter-list">{chapters.map((chapter,partIndex)=>{const chapterLessons=lessons.filter(lesson=>lesson.chapter_id===chapter.id);return <details className="admin-part-card" key={chapter.id} open={partIndex===0}>
          <summary><ChevronRight/><span className="hierarchy-index part-index">Phần {partIndex+1}</span><span className="part-copy"><strong>{cleanPartTitle(chapter.title)}</strong><small>{chapterLessons.length} bài học</small></span><span className="tree-actions chapter-actions"><button onClick={event=>{event.preventDefault();openRenameModal("chapters",chapter.id,chapter.title)}}>Đổi tên</button><button className="danger-text" onClick={event=>{event.preventDefault();void removeRecord("chapters",chapter.id,`phần “${cleanPartTitle(chapter.title)}”`)}}>Xóa</button></span></summary>
          <div className="admin-lesson-list"><button className="add-child" onClick={()=>{setTargetChapterId(chapter.id);setBuilderModal("lesson")}}><FilePlus/> Thêm bài vào phần này</button>{chapterLessons.map((lesson,lessonIndex)=>{const lessonResources=resources.filter(resource=>resource.lesson_id===lesson.id);return <article className="admin-lesson-card" key={lesson.id}>
            <div className="lesson-card-head"><span className="hierarchy-index lesson-index">Bài {lessonIndex+1}</span><div className="lesson-card-copy"><b>{cleanLessonTitle(lesson.title)}</b><small><i className={lesson.published?"published":"draft"}/>{lesson.published?"Đã xuất bản":"Bản nháp"} · {lessonResources.length} nội dung</small></div>
            <div className="tree-actions lesson-actions"><button onClick={()=>toggleLesson(lesson)}>{lesson.published?"Ẩn bài":"Xuất bản"}</button><button onClick={()=>openRenameModal("lessons",lesson.id,lesson.title)}>Đổi tên</button><button className="add-resource-action" onClick={()=>{setTargetLessonId(lesson.id);setBuilderModal("resource")}}><Plus/> Thêm nội dung</button><button className="danger-text" onClick={()=>removeRecord("lessons",lesson.id,`bài “${cleanLessonTitle(lesson.title)}”`)}>Xóa</button></div></div>
            {lessonResources.length?<div className="lesson-resource-list">{lessonResources.map(resource=><div className="resource-row" key={resource.id}><span className={`resource-kind ${resource.resource_type}`}><Link2/></span><span className="resource-copy"><b>{resource.title}</b><small>{resourceTypeLabel(resource.resource_type)}{resource.resource_type!=="youtube"?` · ${resource.allow_download?"Được phép tải":"Không được tải"}`:""}</small></span><span className="resource-actions">{resource.resource_type!=="youtube"&&<button onClick={()=>toggleResourceDownload(resource)}>{resource.allow_download?"Chặn tải":"Cho tải"}</button>}<button className="danger-text" onClick={()=>removeRecord("lesson_resources",resource.id,`nội dung “${resource.title}”`)}>Xóa</button></span></div>)}</div>:<div className="lesson-resource-empty">Chưa có bài giảng hoặc tài liệu.</div>}
          </article>})}</div>
        </details>})}</div>:<MiniEmpty text="Chưa có phần nào. Hãy tạo phần đầu tiên, sau đó thêm bài và nội dung bài."/>}
      </div>
    </div>
    {builderModal==="chapter"&&<div className="modal-shade"><form className="modal" onSubmit={createChapter}><div className="section-head"><h2>Thêm phần</h2><button type="button" className="icon-btn" onClick={()=>setBuilderModal(null)}><X/></button></div><p className="info-note">Số thứ tự “Phần {chapters.length+1}” được thêm tự động.</p><label>Tên phần<input value={newChapterTitle} onChange={event=>setNewChapterTitle(event.target.value)} placeholder="Ví dụ: Hàm số" required/></label><button className="primary-btn" disabled={savingBuilder}>Tạo phần</button></form></div>}
    {builderModal==="lesson"&&<div className="modal-shade"><form className="modal" onSubmit={createLesson}><div className="section-head"><h2>Thêm bài</h2><button type="button" className="icon-btn" onClick={()=>setBuilderModal(null)}><X/></button></div><p className="info-note">Bài được đặt đúng cấp bên trong phần đang chọn; số thứ tự được thêm tự động.</p><label>Tên bài<input value={newLessonTitle} onChange={event=>setNewLessonTitle(event.target.value)} placeholder="Ví dụ: Mệnh đề và tập hợp" required/></label><label>Mô tả<textarea rows={4} value={newLessonDescription} onChange={event=>setNewLessonDescription(event.target.value)}/></label><label className="checkbox-row"><input type="checkbox" checked={newLessonPublished} onChange={event=>setNewLessonPublished(event.target.checked)}/><span>Xuất bản ngay</span></label><button className="primary-btn" disabled={savingBuilder}>Tạo bài</button></form></div>}
    {builderModal==="resource"&&<div className="modal-shade"><form className="modal" onSubmit={createResource}><div className="section-head"><h2>Thêm nội dung bài</h2><button type="button" className="icon-btn" onClick={()=>setBuilderModal(null)}><X/></button></div><p className="info-note">PDF được tải trực tiếp vào Cloudflare R2 private bằng quyền ngắn hạn; học viên không nhận URL công khai.</p><label>Tên nội dung<input value={newResourceTitle} onChange={event=>setNewResourceTitle(event.target.value)} placeholder="Ví dụ: Bài giảng 1 hoặc File bài tập" required/></label><label>Loại<select value={newResourceType} onChange={event=>{const nextType=event.target.value as ResourceData["resource_type"];setNewResourceType(nextType);setNewResourceUrl("");setNewResourceFile(null);if(nextType==="youtube")setNewResourceAllowDownload(false)}}><option value="youtube">Video YouTube</option><option value="external_pdf">PDF / Google Drive</option><option value="storage_pdf">PDF Cloudflare R2</option></select></label>{newResourceType==="storage_pdf"?<label>File PDF (tối đa 50 MB)<input type="file" accept="application/pdf,.pdf" onChange={event=>setNewResourceFile(event.target.files?.[0]??null)} required/></label>:<label>URL<input type="url" value={newResourceUrl} onChange={event=>setNewResourceUrl(event.target.value)} placeholder={newResourceType==="youtube"?"https://youtube.com/watch?v=...":"https://drive.google.com/... hoặc https://.../file.pdf"} required/></label>}{newResourceType!=="youtube"&&<label className="checkbox-row"><input type="checkbox" checked={newResourceAllowDownload} onChange={event=>setNewResourceAllowDownload(event.target.checked)}/><span>Cho phép học viên tải PDF</span></label>}<button className="primary-btn" disabled={savingBuilder}>{savingBuilder?"Đang tải lên…":"Thêm nội dung"}</button></form></div>}
    {renameTarget&&<div className="modal-shade"><form className="modal" onSubmit={saveRename}><div className="section-head"><h2>Đổi tên {renameTarget.table==="chapters"?"phần":"bài"}</h2><button type="button" className="icon-btn" onClick={()=>{setRenameTarget(null);setRenameTitle("")}}><X/></button></div><p className="info-note">Không cần nhập “{renameTarget.table==="chapters"?"Phần":"Bài"}” và số thứ tự; hệ thống sẽ hiển thị tự động.</p><label>Tên mới<input value={renameTitle} onChange={event=>setRenameTitle(event.target.value)} required autoFocus/></label><button className="primary-btn" disabled={savingBuilder}>{savingBuilder?"Đang lưu…":"Lưu tên mới"}</button></form></div>}
  </section>;
}

function EmptyState({ icon: Icon, title, text }: { icon: IconComponent; title: string; text: string }) { return <section className="empty-state"><span><Icon /></span><h2>{title}</h2><p>{text}</p></section>; }
function MiniEmpty({text}:{text:string}){return <div className="mini-empty"><ClipboardCheck/><p>{text}</p></div>}

import { Navigate, createBrowserRouter } from "react-router-dom";
import type { ComponentType } from "react";

import { ProductShell } from "../components/layout/product-shell.tsx";
import { LoginPage } from "../features/auth/login-page.tsx";
import { LegacyRouteBridge } from "../features/parity/legacy-route-bridge.tsx";
import { useAuthStore } from "../store/auth-store.ts";
import { homePathForRole } from "./access-policy.ts";
import { RequireModule, RequireSession } from "./route-guards.tsx";
import RouteError from "./route-error.tsx";
import "../styles/pages.css";

function HomeRedirect() {
  const user = useAuthStore((state) => state.user);
  return <Navigate to={user ? homePathForRole(user.role) : "/login"} replace />;
}

function RouterFallback() {
  return <main className="aeck-app-loading" aria-busy="true" aria-live="polite"><img src="/aeck-mark.svg" alt="" width="48" height="52" /><p>Đang tải giao diện…</p></main>;
}

const lazyDefault = <T extends { default: ComponentType }>(loader: () => Promise<T>) =>
  async () => ({ Component: (await loader()).default });

const studentProtectedRoutes = [
  "/assessment/:assessmentId", "/assessment/group", "/exam/test/:id",
  "/exam/result/:assessmentId", "/exam/group-result/:sessionId",
  "/exam-answer/:id", "/exam/confirm-info/:id",
];

const adminReferenceAliases = [
  ["/assessment-management", "/admin/sessions"], ["/course-management", "/admin/courses"],
  ["/course-management/:id", "/admin/courses"], ["/evidence-registration-management", "/admin/verification"],
  ["/exam-management", "/admin/exams"], ["/exam-room-management", "/admin/sessions"],
  ["/exam-result-management", "/admin/results"], ["/group-user-management", "/admin/groups"],
  ["/ilearn-management", "/admin/ilearn"], ["/irt-exam-management", "/admin/irt"],
  ["/media-management", "/admin/media"], ["/question-bank", "/admin/question-bank"],
  ["/server-health", "/admin/monitoring"], ["/shipment-management", "/admin/delivery"],
  ["/subscription-package-management", "/admin/plans"], ["/tkb-management", "/admin/tkb"],
  ["/user-management", "/admin/users"], ["/watermark-trace", "/admin/watermark"],
] as const;

export const router = createBrowserRouter([
  { path: "/", element: <HomeRedirect />, errorElement: <RouteError /> },
  { path: "/login", element: <LoginPage />, errorElement: <RouteError /> },
  { path: "/signup", lazy: async () => ({ Component: (await import("../features/auth/signup-page.tsx")).SignupPage }), hydrateFallbackElement: <RouterFallback />, errorElement: <RouteError /> },
  { path: "/admin/login", element: <LoginPage />, errorElement: <RouteError /> },
  { path: "/enter", lazy: async () => ({ Component: (await import("../features/student/exam-catalog-pages.tsx")).EnterByCodePage }), hydrateFallbackElement: <RouterFallback />, errorElement: <RouteError /> },
  {
    element: <RequireSession area="student" />,
    hydrateFallbackElement: <RouterFallback />,
    errorElement: <RouteError />,
    children: [
      ...studentProtectedRoutes.map((path) => ({ path, element: <LegacyRouteBridge /> })),
      {
        element: <ProductShell area="student" />,
        errorElement: <RouteError />,
        children: [
          { path: "/dashboard", lazy: lazyDefault(() => import("../features/dashboard/student-dashboard.tsx")) },
          { path: "/courses", lazy: lazyDefault(() => import("../features/student/course-pages.tsx")) },
          { path: "/course/study/:id", lazy: async () => ({ Component: (await import("../features/student/course-pages.tsx")).CourseStudyPage }) },
          { path: "/history", lazy: async () => ({ Component: (await import("../features/student/exam-catalog-pages.tsx")).ExamHistoryPage }) },
          { path: "/exam-history", lazy: async () => ({ Component: (await import("../features/student/exam-catalog-pages.tsx")).ExamHistoryPage }) },
          { path: "/progress", lazy: async () => ({ Component: (await import("../features/student/exam-catalog-pages.tsx")).StudentProgressPage }) },
          { path: "/search", lazy: lazyDefault(() => import("../features/pages/search-page.tsx")) },
          { path: "/tkb", lazy: lazyDefault(() => import("../features/pages/timetable-page.tsx")) },
          { path: "/profile", lazy: lazyDefault(() => import("../features/pages/profile-page.tsx")) },
          { path: "/exam-room", element: <Navigate to="/exam-rooms/all" replace /> },
          { path: "/exam-rooms/:type", lazy: async () => ({ Component: (await import("../features/student/exam-catalog-pages.tsx")).ExamRoomCatalogPage }) },
          { path: "/assessment-list/:examRoomId", lazy: async () => ({ Component: (await import("../features/student/exam-catalog-pages.tsx")).AssessmentListPage }) },
          { path: "/irt-exams", lazy: async () => ({ Component: (await import("../features/student/irt-pages.tsx")).IrtExamCatalogPage }) },
          { path: "/irt-results", lazy: async () => ({ Component: (await import("../features/student/irt-pages.tsx")).IrtResultsPage }) },
          { path: "/irt-exam/:id/register", lazy: async () => ({ Component: (await import("../features/student/irt-pages.tsx")).IrtRegistrationPage }) },
          { path: "/recap", lazy: async () => ({ Component: (await import("../features/student/exam-catalog-pages.tsx")).RecapPage }) },
        ],
      },
    ],
  },
  {
    element: <RequireSession area="admin" />,
    hydrateFallbackElement: <RouterFallback />,
    errorElement: <RouteError />,
    children: [
      ...adminReferenceAliases.map(([path, target]) => ({ path, element: <Navigate to={target} replace /> })),
      { path: "/exam-management/*", element: <Navigate to="/admin/exams" replace /> },
      { path: "/exam-preview/:id", element: <LegacyRouteBridge /> },
      { path: "/exam-result-management/:id/stats", element: <Navigate to="/admin/results" replace /> },
      { path: "/irt-exam-management/:id", element: <Navigate to="/admin/irt" replace /> },
      { path: "/evidence-registration-management/:id", element: <Navigate to="/admin/verification" replace /> },
      { path: "/ilearn-management/:id", element: <Navigate to="/admin/ilearn" replace /> },
      { path: "/media-management/:folderId", element: <Navigate to="/admin/media" replace /> },
      { path: "/question-bank/dedup", element: <Navigate to="/admin/question-bank/dedup" replace /> },
      { path: "/item/*", element: <LegacyRouteBridge path="/admin/question-bank" /> },
      { path: "/admin-log", element: <Navigate to="/admin/audit" replace /> },
      { path: "/exam-detail", element: <LegacyRouteBridge path="/admin/exams" /> },
      { path: "/admin/exams/*", element: <LegacyRouteBridge /> },
      { path: "/admin/question-bank", element: <LegacyRouteBridge /> },
      { path: "/admin/sessions/*", element: <LegacyRouteBridge /> },
      { path: "/admin/security", element: <LegacyRouteBridge /> },
      {
        path: "/admin",
        element: <ProductShell area="admin" />,
        errorElement: <RouteError />,
        children: [
          { element: <RequireModule moduleName="admin-dashboard" />, children: [{ index: true, lazy: lazyDefault(() => import("../features/dashboard/admin-dashboard.tsx")) }] },
          { path: "profile", lazy: lazyDefault(() => import("../features/pages/profile-page.tsx")) },
          { element: <RequireModule moduleName="question-bank" />, children: [{ path: "question-bank/dedup", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminQuestionBankOverviewPage }) }] },
          { element: <RequireModule moduleName="exams" />, children: [
            { path: "exam-builder", lazy: async () => ({ Component: (await import("../features/admin/exam-builder-page.tsx")).ExamBuilderCatalogPage }) },
            { path: "exam-builder/new", lazy: async () => ({ Component: (await import("../features/admin/exam-builder-page.tsx")).ExamBuilderPage }) },
            { path: "exam-builder/new/from-bank", lazy: async () => ({ Component: (await import("../features/admin/exam-builder-page.tsx")).ExamBuilderPage }) },
            { path: "exam-builder/new/random", lazy: async () => ({ Component: (await import("../features/admin/exam-builder-page.tsx")).ExamBuilderPage }) },
            { path: "exam-builder/:examId", lazy: async () => ({ Component: (await import("../features/admin/exam-builder-page.tsx")).ExamBuilderPage }) },
          ] },
          { element: <RequireModule moduleName="users" />, children: [
            { path: "users", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminUsersPage }) },
            { path: "groups", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminGroupsPage }) },
          ] },
          { element: <RequireModule moduleName="courses" />, children: [
            { path: "courses", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminCoursesPage }) },
            { path: "courses/:id", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminCourseDetailPage }) },
            { path: "media", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminMediaPage }) },
            { path: "media/:folderId", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminMediaPage }) },
          ] },
          { element: <RequireModule moduleName="results" />, children: [
            { path: "results", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminResultsPage }) },
            { path: "results/:id/stats", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminResultsPage }) },
            { path: "irt", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminIrtPage }) },
            { path: "irt/:id", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminIrtPage }) },
          ] },
          { element: <RequireModule moduleName="verification" />, children: [
            { path: "verification", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminVerificationPage }) },
            { path: "verification/:id", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminVerificationPage }) },
          ] },
          { element: <RequireModule moduleName="plans" />, children: [{ path: "plans", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminPlansPage }) }] },
          { element: <RequireModule moduleName="delivery" />, children: [{ path: "delivery", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminDeliveryPage }) }] },
          { element: <RequireModule moduleName="timetable" />, children: [{ path: "tkb", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminTimetablePage }) }] },
          { element: <RequireModule moduleName="ilearn" />, children: [
            { path: "ilearn", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminILearnPage }) },
            { path: "ilearn/:id", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminILearnDetailPage }) },
          ] },
          { element: <RequireModule moduleName="security" />, children: [
            { path: "audit", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminAuditPage }) },
            { path: "watermark", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminWatermarkPage }) },
          ] },
          { element: <RequireModule moduleName="monitoring" />, children: [
            { path: "monitoring", lazy: async () => ({ Component: (await import("../features/admin/admin-resource-pages.tsx")).AdminMonitoringPage }) },
            { path: "integrations", lazy: async () => ({ Component: (await import("../features/admin/integration-hub-page.tsx")).AdminIntegrationsPage }) },
          ] },
        ],
      },
    ],
  },
  { path: "*", element: <RouteError /> },
]);

import { Navigate, createBrowserRouter } from "react-router-dom";
import type { ComponentType } from "react";

import { ProductShell } from "../components/layout/product-shell.tsx";
import { LoginPage } from "../features/auth/login-page.tsx";
import { AdminModulePage } from "../features/pages/admin-module-page.tsx";
import { LegacyModulePage } from "../features/parity/legacy-module-page.tsx";
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
  return (
    <main className="aeck-app-loading" aria-busy="true" aria-live="polite">
      <img src="/aeck-mark.svg" alt="" width="48" height="52" />
      <p>Đang tải giao diện…</p>
    </main>
  );
}

const lazyDefault = <T extends { default: ComponentType }>(loader: () => Promise<T>) =>
  async () => ({ Component: (await loader()).default });

export const router = createBrowserRouter([
  { path: "/", element: <HomeRedirect />, errorElement: <RouteError /> },
  { path: "/login", element: <LoginPage /> },
  { path: "/admin/login", element: <LoginPage /> },
  {
    element: <RequireSession area="student" />,
    hydrateFallbackElement: <RouterFallback />,
    children: [
      {
        element: <ProductShell area="student" />,
        children: [
          { path: "/dashboard", lazy: lazyDefault(() => import("../features/dashboard/student-dashboard.tsx")) },
          { path: "/search", lazy: lazyDefault(() => import("../features/pages/search-page.tsx")) },
          { path: "/tkb", lazy: lazyDefault(() => import("../features/pages/timetable-page.tsx")) },
          { path: "/profile", lazy: lazyDefault(() => import("../features/pages/profile-page.tsx")) },
          { path: "/courses", element: <LegacyModulePage title="Khóa học" description="Danh sách nội dung đã được phân cho tài khoản của bạn." legacyPath="/courses" /> },
          { path: "/exam-history", element: <LegacyModulePage title="Lịch sử thi" description="Kết quả và tiến trình làm bài của bạn." legacyPath="/exam-history" protectedVisual /> },
          { path: "/irt-exams", element: <LegacyModulePage title="Bài thi IRT" description="Các bài thi đánh giá theo mô hình IRT." legacyPath="/exam-room" protectedVisual /> },
          { path: "/exam-room/*", element: <LegacyModulePage title="Phòng khảo thí" description="Danh sách phòng thi và bài thi được cấp quyền." legacyPath="/exam-room" protectedVisual /> },
        ],
      },
    ],
  },
  {
    element: <RequireSession area="admin" />,
    hydrateFallbackElement: <RouterFallback />,
    children: [
      {
        path: "/admin",
        element: <ProductShell area="admin" />,
        children: [
          { element: <RequireModule moduleName="admin-dashboard" />, children: [{ index: true, lazy: lazyDefault(() => import("../features/dashboard/admin-dashboard.tsx")) }] },
          { path: "profile", lazy: lazyDefault(() => import("../features/pages/profile-page.tsx")) },
          { element: <RequireModule moduleName="question-bank" />, children: [{ path: "question-bank", element: <LegacyModulePage title="Kho câu hỏi" description="Quản lý câu hỏi đơn, câu hỏi chùm và quy trình duyệt trùng." legacyPath="/admin/question-bank" protectedVisual /> }] },
          { element: <RequireModule moduleName="exams" />, children: [{ path: "exams", element: <LegacyModulePage title="Quản lý đề thi" description="Tạo, cấu hình và xuất bản đề thi." legacyPath="/admin/exams" protectedVisual /> }] },
          { element: <RequireModule moduleName="exam-sessions" />, children: [{ path: "sessions", element: <LegacyModulePage title="Quản lý phòng thi" description="Tổ chức kíp thi, truy cập và theo dõi kết quả." legacyPath="/admin/sessions" protectedVisual /> }] },
          { element: <RequireModule moduleName="users" />, children: [{ path: "users", element: <AdminModulePage title="Quản lý người dùng" description="Hồ sơ, trạng thái và phân quyền tài khoản." /> }] },
          { element: <RequireModule moduleName="courses" />, children: [{ path: "courses", element: <AdminModulePage title="Khóa học và Media" description="Nội dung học tập, bài giảng và tài nguyên đa phương tiện." /> }] },
          { element: <RequireModule moduleName="results" />, children: [{ path: "results", element: <LegacyModulePage title="Kết quả và IRT" description="Thống kê kết quả và phân tích khảo thí." legacyPath="/admin/exams" protectedVisual /> }] },
          { element: <RequireModule moduleName="verification" />, children: [{ path: "verification", element: <AdminModulePage title="Đăng ký minh chứng" description="Theo dõi hồ sơ và trạng thái xác minh." /> }] },
          { element: <RequireModule moduleName="plans" />, children: [{ path: "plans", element: <AdminModulePage title="Gói học tập" description="Danh mục gói và quyền truy cập nội dung." /> }] },
          { element: <RequireModule moduleName="delivery" />, children: [{ path: "delivery", element: <AdminModulePage title="Giao hàng" description="Theo dõi yêu cầu và trạng thái giao nhận." /> }] },
          { element: <RequireModule moduleName="timetable" />, children: [{ path: "tkb", element: <AdminModulePage title="Quản lý TKB" description="Lịch học, ca học và điều phối lớp." /> }] },
          { element: <RequireModule moduleName="ilearn" />, children: [{ path: "ilearn", element: <AdminModulePage title="Quản lý iLearn" description="Tích hợp lớp học trực tuyến sẽ được triển khai ở giai đoạn sau." /> }] },
          { element: <RequireModule moduleName="security" />, children: [{ path: "security", element: <LegacyModulePage title="Quản trị hệ thống" description="Bảo mật tài khoản, phiên đăng nhập và nhật ký quản trị." legacyPath="/admin/security" /> }] },
          { element: <RequireModule moduleName="monitoring" />, children: [{ path: "monitoring", element: <AdminModulePage title="Giám sát Server" description="Tình trạng dịch vụ và chỉ số vận hành." /> }] },
        ],
      },
    ],
  },
  { path: "*", element: <RouteError /> },
]);

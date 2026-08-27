import type { PermissionAction } from "@aeck/contracts";
import {
  BarChart3,
  BookOpen,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  ClipboardCheck,
  FileCheck2,
  GraduationCap,
  LayoutDashboard,
  LibraryBig,
  ListChecks,
  MonitorCog,
  PackageCheck,
  Search,
  ShieldCheck,
  Truck,
  Users,
  Video,
  type LucideIcon,
} from "lucide-react";

export type NavigationItem = {
  label: string;
  path: string;
  icon: LucideIcon;
  module?: string;
  action?: PermissionAction;
};

export const studentNavigation: NavigationItem[] = [
  { label: "Tổng quan", path: "/dashboard", icon: LayoutDashboard },
  { label: "Phòng khảo thí", path: "/exam-room", icon: BookOpen },
  { label: "Khóa học", path: "/courses", icon: Video },
  { label: "Bài thi IRT", path: "/irt-exams", icon: BarChart3 },
  { label: "Lịch sử thi", path: "/exam-history", icon: ClipboardCheck },
  { label: "Tra cứu", path: "/search", icon: Search },
  { label: "Thời khóa biểu", path: "/tkb", icon: CalendarDays },
];

export const adminNavigation: NavigationItem[] = [
  { label: "Dashboard", path: "/admin", icon: LayoutDashboard, module: "admin-dashboard", action: "read" },
  {
    label: "Kho câu hỏi",
    path: "/admin/question-bank",
    icon: Boxes,
    module: "question-bank",
    action: "read",
  },
  {
    label: "Quản lý đề thi",
    path: "/admin/exams",
    icon: BookOpen,
    module: "exams",
    action: "read",
  },
  {
    label: "Quản lý phòng thi",
    path: "/admin/sessions",
    icon: ListChecks,
    module: "exam-sessions",
    action: "read",
  },
  {
    label: "Quản lý người dùng",
    path: "/admin/users",
    icon: Users,
    module: "users",
    action: "read",
  },
  {
    label: "Khóa học và Media",
    path: "/admin/courses",
    icon: GraduationCap,
    module: "courses",
    action: "read",
  },
  {
    label: "Kết quả và IRT",
    path: "/admin/results",
    icon: ChartNoAxesCombined,
    module: "results",
    action: "read",
  },
  {
    label: "Đăng ký minh chứng",
    path: "/admin/verification",
    icon: FileCheck2,
    module: "verification",
    action: "read",
  },
  {
    label: "Gói học tập",
    path: "/admin/plans",
    icon: PackageCheck,
    module: "plans",
    action: "read",
  },
  {
    label: "Giao hàng",
    path: "/admin/delivery",
    icon: Truck,
    module: "delivery",
    action: "read",
  },
  {
    label: "Quản lý TKB",
    path: "/admin/tkb",
    icon: CalendarDays,
    module: "timetable",
    action: "read",
  },
  {
    label: "Quản lý iLearn",
    path: "/admin/ilearn",
    icon: LibraryBig,
    module: "ilearn",
    action: "read",
  },
  {
    label: "Quản trị hệ thống",
    path: "/admin/security",
    icon: ShieldCheck,
    module: "security",
    action: "read",
  },
  {
    label: "Giám sát Server",
    path: "/admin/monitoring",
    icon: MonitorCog,
    module: "monitoring",
    action: "read",
  },
];

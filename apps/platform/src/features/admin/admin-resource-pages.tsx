import {
  Activity,
  BookOpen,
  Boxes,
  CalendarDays,
  ChartNoAxesCombined,
  FileCheck2,
  Fingerprint,
  GraduationCap,
  LibraryBig,
  MonitorCog,
  PackageCheck,
  Truck,
  Users,
  Video,
} from "lucide-react";

import { CollectionWorkbench } from "../collections/collection-workbench.tsx";
import { legacyUrl } from "../parity/legacy-url.ts";

export function AdminUsersPage() {
  return <CollectionWorkbench resource="users" title="Quản lý người dùng" description="Tìm kiếm tài khoản, theo dõi xác minh, khóa truy cập và phân quyền học tập." icon={Users} createLabel="Tạo tài khoản" actions={[{ label: "Quản lý nhóm", path: "/admin/groups" }, { label: "Mở vận hành hiện tại", path: legacyUrl("/admin/students"), external: true }]} />;
}

export function AdminGroupsPage() {
  return <CollectionWorkbench resource="groups" title="Nhóm người dùng" description="Gom học viên theo lớp, khóa học hoặc đợt tuyển sinh để phân quyền đồng loạt." icon={Boxes} createLabel="Tạo nhóm" actions={[{ label: "Người dùng", path: "/admin/users" }]} />;
}

export function AdminCoursesPage() {
  return <CollectionWorkbench resource="courses" title="Khóa học" description="Quản lý cấu trúc khóa học, chương, bài giảng và trạng thái xuất bản." icon={GraduationCap} createLabel="Tạo khóa học" actions={[{ label: "Thư viện media", path: "/admin/media" }, { label: "Mở trình biên soạn", path: legacyUrl("/admin/content"), external: true }]} onOpenRecord={(record) => `/admin/courses/${record.id}`} />;
}

export function AdminMediaPage() {
  return <CollectionWorkbench resource="media" title="Media và tài nguyên" description="Theo dõi video, tài liệu, hàng đợi xử lý HLS và dung lượng lưu trữ." icon={Video} createLabel="Tải tài nguyên" actions={[{ label: "HLS Vault", path: legacyUrl("/admin/hls-vault"), external: true }, { label: "Kho ảnh", path: legacyUrl("/admin/upload"), external: true }]} />;
}

export function AdminResultsPage() {
  return <CollectionWorkbench resource="results" title="Kết quả và phân tích" description="Tổng hợp lượt thi, tỷ lệ hoàn thành và các chỉ số phục vụ phân tích khảo thí." icon={ChartNoAxesCombined} allowCreate={false} allowDelete={false} actions={[{ label: "Kíp thi", path: legacyUrl("/admin/sessions"), external: true }]} onOpenRecord={(record) => legacyUrl(`/admin/session-results?examId=${encodeURIComponent(String(record.id))}`)} />;
}

export function AdminIrtPage() {
  return <CollectionWorkbench resource="irt-exams" title="Quản lý bài thi IRT" description="Theo dõi ngân hàng IRT, độ phủ câu hỏi và mức độ sử dụng của từng bài đánh giá." icon={Activity} createLabel="Tạo bài IRT" />;
}

export function AdminVerificationPage() {
  return <CollectionWorkbench resource="verification" title="Đăng ký minh chứng" description="Duyệt hồ sơ xác minh học sinh và ghi nhận lý do khi cần yêu cầu bổ sung." icon={FileCheck2} allowCreate={false} allowDelete={false} />;
}

export function AdminPlansPage() {
  return <CollectionWorkbench resource="plans" title="Gói học tập" description="Thiết lập quyền lợi, mức giá và trạng thái xuất bản của từng gói dịch vụ." icon={PackageCheck} createLabel="Tạo gói" />;
}

export function AdminDeliveryPage() {
  return <CollectionWorkbench resource="shipments" title="Giao hàng" description="Theo dõi vận đơn GHN và trạng thái thủ công từ GHTK, SPX, VNPost, ViettelPost." icon={Truck} createLabel="Tạo vận đơn" actions={[{ label: "Tra cứu VietQR", path: "/admin/integrations" }]} />;
}

export function AdminTimetablePage() {
  return <CollectionWorkbench resource="timetable" title="Quản lý thời khóa biểu" description="Điều phối ca học, lịch thi và người phụ trách theo từng lớp." icon={CalendarDays} createLabel="Thêm lịch" actions={[{ label: "Lịch vận hành đề thi", path: legacyUrl("/admin/timetable"), external: true }]} />;
}

export function AdminILearnPage() {
  return <CollectionWorkbench resource="ilearn" title="Quản lý iLearn" description="Tạo lớp trực tuyến, lên lịch buổi học và theo dõi bản ghi Zoom." icon={LibraryBig} createLabel="Tạo lớp" actions={[{ label: "Cấu hình Zoom", path: "/admin/integrations" }]} onOpenRecord={(record) => `/admin/ilearn/${record.id}`} />;
}

export function AdminAuditPage() {
  return <CollectionWorkbench resource="audit" title="Nhật ký quản trị" description="Tra cứu thao tác trên đề thi, kíp thi, tài khoản và tài nguyên hệ thống." icon={Activity} allowCreate={false} allowEdit={false} allowDelete={false} actions={[{ label: "Nhật ký hiện tại", path: legacyUrl("/admin/audit"), external: true }]} />;
}

export function AdminWatermarkPage() {
  return <CollectionWorkbench resource="watermark" title="Truy vết watermark" description="Đối chiếu mã watermark để xác định tài khoản và tài nguyên đã phát hành." icon={Fingerprint} createLabel="Quét mã" allowDelete={false} />;
}

export function AdminMonitoringPage() {
  return <CollectionWorkbench resource="server-health" title="Giám sát hệ thống" description="Theo dõi API, cơ sở dữ liệu, lưu trữ và các connector vận hành." icon={MonitorCog} allowCreate={false} allowDelete={false} actions={[{ label: "Cấu hình tích hợp", path: "/admin/integrations" }]} />;
}

export function AdminQuestionBankOverviewPage() {
  return <CollectionWorkbench resource="question-bank" title="Ngân hàng câu hỏi" description="Theo dõi độ phủ thư mục, tiến độ duyệt và các đợt rà soát trùng." icon={Boxes} allowCreate={false} allowEdit={false} allowDelete={false} actions={[{ label: "Mở kho câu hỏi cũ", path: legacyUrl("/admin/question-bank"), external: true, kind: "primary" }, { label: "Lọc trùng", path: "/admin/question-bank/dedup" }]} />;
}

export function AdminCourseDetailPage() {
  return <CollectionWorkbench resource="media" title="Nội dung khóa học" description="Tài nguyên và trạng thái xử lý của khóa học đã chọn." icon={BookOpen} createLabel="Thêm tài nguyên" defaultView="cards" actions={[{ label: "Quay lại khóa học", path: "/admin/courses" }]} />;
}

export function AdminILearnDetailPage() {
  return <CollectionWorkbench resource="timetable" title="Buổi học iLearn" description="Lịch học, người hướng dẫn và trạng thái phòng Zoom của lớp." icon={CalendarDays} createLabel="Lên lịch buổi học" actions={[{ label: "Quay lại iLearn", path: "/admin/ilearn" }]} />;
}

export function AdminIntegrationsPage() {
  return <CollectionWorkbench resource="server-health" title="Tích hợp vận hành" description="Trạng thái Zoom, Gemini OCR, VietQR, GHN và các kênh giao hàng theo dõi thủ công." icon={MonitorCog} allowCreate={false} allowDelete={false} allowEdit actions={[{ label: "Giám sát hệ thống", path: "/admin/monitoring" }]} />;
}

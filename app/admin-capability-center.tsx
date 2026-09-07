"use client";

import Link from "next/link";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ArrowUpRight,
  BadgeCheck,
  BookOpen,
  Boxes,
  CheckCircle2,
  CircleAlert,
  ClipboardCheck,
  Clock3,
  FileClock,
  FileSearch,
  Gauge,
  GraduationCap,
  Group,
  KeyRound,
  Link2,
  RefreshCw,
  Server,
  ShieldCheck,
  Truck,
  Users,
  Video,
  WalletCards,
  XCircle,
} from "lucide-react";
import { authenticatedFetch } from "../lib/auth-client";
import { formatUiDateTime } from "./ui-format";
import {
  AeckBadge,
  AeckButton,
  AeckCard,
  AeckEmptyState,
  AeckErrorState,
  AeckLoadingState,
  AeckPageHeader,
  AeckSectionHeader,
  AeckStatCard,
} from "./aeck-ui";
import type { AdminLegacyModule } from "./admin-route-map";
import "./admin-capability-center.css";

type CapabilityState = "ready" | "mapped" | "blocked";
type CapabilityIcon = typeof Users;

type Capability = {
  id: AdminLegacyModule;
  group: string;
  title: string;
  description: string;
  state: CapabilityState;
  icon: CapabilityIcon;
  path?: string;
  detail: string;
  contract?: string[];
};

type HealthCheck = {
  id: string;
  label: string;
  status: "healthy" | "degraded" | "not_configured";
  detail: string;
  durationMs?: number;
};

type HealthPayload = {
  status?: "healthy" | "degraded";
  checkedAt?: string;
  latencyMs?: number;
  checks?: HealthCheck[];
  integrations?: Array<{
    id: string;
    label: string;
    configured: boolean;
    detail: string;
  }>;
  error?: string;
};

const capabilities: readonly Capability[] = [
  {
    id: "users",
    group: "Người dùng",
    title: "Quản lý người dùng",
    description: "Tạo học viên, tìm kiếm tài khoản và cập nhật mật khẩu qua Supabase.",
    state: "ready",
    icon: Users,
    path: "/admin/students",
    detail: "Flow hiện tại đã có tạo tài khoản, hồ sơ, trạng thái và đổi mật khẩu; quyền admin được kiểm tra ở server.",
  },
  {
    id: "groups",
    group: "Người dùng",
    title: "Nhóm người dùng",
    description: "Cấp khóa học và phòng thi theo từng học viên trong mô hình enrollment hiện tại.",
    state: "mapped",
    icon: Group,
    path: "/admin/enrollments",
    detail: "Repo hiện chưa có bảng group-user của legacy backend. Phần tương đương đang chạy bằng course_enrollments và exam_room_enrollments; không tạo nhóm giả để che khoảng trống schema.",
    contract: ["course_enrollments", "exam_room_enrollments"],
  },
  {
    id: "courses",
    group: "Nội dung",
    title: "Quản lý khóa học",
    description: "Xây dựng khóa học theo Phần → Bài → tài nguyên, xuất bản và phân quyền.",
    state: "ready",
    icon: BookOpen,
    path: "/admin/content",
    detail: "Course builder hiện dùng trực tiếp các bảng courses, chapters, lessons và lesson_resources.",
  },
  {
    id: "media",
    group: "Nội dung",
    title: "Quản lý Media",
    description: "Kho ảnh, PDF private, video Microsoft và HLS Vault trong các flow hiện có.",
    state: "ready",
    icon: Video,
    path: "/admin/upload",
    detail: "Kho ảnh và HLS có API server-side; tài nguyên bài học được quản lý từ course builder. R2/Microsoft cần cấu hình runtime tương ứng.",
  },
  {
    id: "exams",
    group: "Khảo thí",
    title: "Quản lý đề thi",
    description: "Mở workspace đề thi và ngân hàng câu hỏi hiện tại.",
    state: "ready",
    icon: ClipboardCheck,
    path: "/admin/exams",
    detail: "Đây là flow khảo thí đang có trong repo. Protected question/answer/result UI được giữ nguyên theo guardrail.",
  },
  {
    id: "exam-rooms",
    group: "Khảo thí",
    title: "Quản lý phòng thi",
    description: "Quản lý phòng, kíp thi, quyền truy cập và vận hành.",
    state: "mapped",
    icon: GraduationCap,
    path: "/admin/sessions",
    detail: "Reference tách assessment và exam-room thành hai menu; repo hiện gom phần vận hành vào exam workspace và session catalog để tránh hai nguồn dữ liệu khác nhau.",
  },
  {
    id: "results",
    group: "Khảo thí",
    title: "Quản lý kết quả",
    description: "Theo dõi kết quả theo kíp thi và lịch sử vận hành.",
    state: "mapped",
    icon: Gauge,
    path: "/admin/sessions",
    detail: "Kết quả hiện được mở từ danh sách kíp thi; không thêm một màn hình kết quả thứ hai khi cùng dùng exam_attempts.",
  },
  {
    id: "irt",
    group: "Kết nối legacy",
    title: "Quản lý IRT",
    description: "Phân tích IRT và phân phối điểm theo reference.",
    state: "blocked",
    icon: Boxes,
    detail: "Chưa có schema IRT hoặc contract Supabase trong repo. Reference gọi legacy API và yêu cầu JWT riêng.",
    contract: ["GET /irt-exam", "GET /irt-exam/:id/score-distribution", "POST /irt-exam/:id/register"],
  },
  {
    id: "evidence",
    group: "Kết nối legacy",
    title: "Đăng ký minh chứng",
    description: "Tiếp nhận và xử lý hồ sơ minh chứng.",
    state: "blocked",
    icon: FileSearch,
    detail: "Chưa có bảng evidence, storage contract hay endpoint tương ứng trong Supabase hiện tại.",
    contract: ["Legacy route /evidence-registration-management"],
  },
  {
    id: "subscriptions",
    group: "Kết nối legacy",
    title: "Gói học tập",
    description: "Gói đăng ký, thời hạn và quyền sử dụng dịch vụ.",
    state: "blocked",
    icon: WalletCards,
    detail: "Chưa có schema subscription/package hoặc payment contract trong repo; không thể bật thao tác thu phí giả.",
    contract: ["Legacy route /subscription-package-management"],
  },
  {
    id: "shipments",
    group: "Kết nối legacy",
    title: "Giao hàng",
    description: "Đơn hàng, vận chuyển và mã tracking.",
    state: "blocked",
    icon: Truck,
    detail: "Chưa có schema shipment/order và tích hợp carrier trong backend hiện tại.",
    contract: ["Legacy route /shipment-management"],
  },
  {
    id: "tkb",
    group: "Vận hành",
    title: "Quản lý thời khóa biểu",
    description: "Xếp lịch khóa học, buổi live, bài học và phòng thi trong một khu vực.",
    state: "ready",
    icon: Clock3,
    path: "/admin/timetable",
    detail: "Lịch khóa học dùng course_schedule_events và course_schedule_rules; lịch phòng thi tiếp tục dùng exam_rooms.exam_start và exam_rooms.exam_end.",
    contract: ["course_schedule_events", "course_schedule_rules", "exam_rooms.exam_start", "exam_rooms.exam_end"],
  },
  {
    id: "ilearn",
    group: "Kết nối legacy",
    title: "Quản lý iLearn",
    description: "Lớp học, buổi học, điểm danh, tài liệu và recording.",
    state: "blocked",
    icon: Video,
    detail: "Reference iLearn nằm trên server.aeck.vn/api/v2 và yêu cầu legacy JWT. Repo hiện không có token exchange hoặc bảng class/session/attendance.",
    contract: ["/ilearn/admin/classes", "/ilearn/admin/sessions", "/ilearn/admin/sessions/:id/attendance"],
  },
  {
    id: "admin-log",
    group: "Hệ thống",
    title: "Nhật ký quản trị",
    description: "Tra cứu audit kỳ thi và sự kiện bảo mật hợp nhất.",
    state: "ready",
    icon: FileClock,
    path: "/admin/audit",
    detail: "API hiện hợp nhất exam_admin_audit_logs và admin_actions, có filter, phân trang và trạng thái retry.",
  },
  {
    id: "watermark",
    group: "Hệ thống",
    title: "Truy vết tài liệu",
    description: "Watermark PDF khi tải và bảo vệ tài nguyên bài học.",
    state: "mapped",
    icon: KeyRound,
    path: "/admin/capabilities?module=watermark",
    detail: "Watermark đang được áp dụng tại lesson-pdf-download và bảo vệ tài nguyên server-side. Repo chưa có bảng trace riêng để hiển thị lịch sử tài liệu như legacy.",
    contract: ["POST /api/lesson-pdf-download", "GET /api/resource-content"],
  },
  {
    id: "server-health",
    group: "Hệ thống",
    title: "Giám sát server",
    description: "Kiểm tra Supabase, bảng dữ liệu và các integration runtime.",
    state: "ready",
    icon: Server,
    path: "/admin/server-health",
    detail: "Health check chỉ trả metadata an toàn và kiểm tra quyền admin ở server; không lộ secret hay token.",
  },
  {
    id: "question-bank",
    group: "Khảo thí",
    title: "Ngân hàng câu hỏi",
    description: "Mở question authoring hiện tại.",
    state: "ready",
    icon: BadgeCheck,
    path: "/admin/question-bank",
    detail: "Đây là protected authoring surface và được giữ giao diện riêng theo guardrail.",
  },
];

const capabilityGroups = ["Người dùng", "Nội dung", "Khảo thí", "Vận hành", "Hệ thống", "Kết nối legacy"];
const capabilityById = new Map(capabilities.map(capability => [capability.id, capability]));

function statusText(state: CapabilityState) {
  return state === "ready" ? "Đang hoạt động" : state === "mapped" ? "Đã ánh xạ" : "Chưa kết nối";
}

function statusTone(state: CapabilityState) {
  return state === "ready" ? "success" : state === "mapped" ? "info" : "warning";
}

function healthStatusText(status: HealthCheck["status"]) {
  return status === "healthy" ? "Ổn định" : status === "degraded" ? "Cần kiểm tra" : "Chưa cấu hình";
}

function healthStatusTone(status: HealthCheck["status"]) {
  return status === "healthy" ? "success" : status === "degraded" ? "warning" : "neutral";
}

function validModule(value: string | null): value is AdminLegacyModule {
  return Boolean(value && capabilityById.has(value as AdminLegacyModule));
}

export default function AdminCapabilityCenter({ initialModule = null }: { initialModule?: AdminLegacyModule | null }) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const requestedModule = searchParams.get("module");
  const selectedId = validModule(requestedModule) ? requestedModule : initialModule;
  const selected = selectedId ? capabilityById.get(selectedId) ?? null : null;
  const [health, setHealth] = useState<HealthPayload | null>(null);
  const [healthLoading, setHealthLoading] = useState(false);
  const [healthError, setHealthError] = useState("");

  const selectModule = useCallback((id: AdminLegacyModule | null) => {
    const next = new URLSearchParams(searchParams.toString());
    if (id) next.set("module", id); else next.delete("module");
    const query = next.toString();
    router.replace(`${pathname}${query ? `?${query}` : ""}`, { scroll: false });
  }, [pathname, router, searchParams]);

  const loadHealth = useCallback(async () => {
    setHealthLoading(true);
    setHealthError("");
    try {
      const response = await authenticatedFetch("/api/admin/server-health", { cache: "no-store" });
      const payload = await response.json().catch(() => null) as HealthPayload | null;
      if (!response.ok) throw new Error(payload?.error ?? "Không thể kiểm tra sức khỏe server.");
      setHealth(payload);
    } catch (value) {
      setHealthError(value instanceof Error ? value.message : "Không thể kiểm tra sức khỏe server.");
    } finally {
      setHealthLoading(false);
    }
  }, []);

  useEffect(() => {
    if (selected?.id !== "server-health") return;
    const frame = window.requestAnimationFrame(() => void loadHealth());
    return () => window.cancelAnimationFrame(frame);
  }, [loadHealth, selected?.id]);

  const counts = useMemo(() => capabilities.reduce((result, capability) => {
    result[capability.state] += 1;
    return result;
  }, { ready: 0, mapped: 0, blocked: 0 }), []);

  return (
    <div className="admin-capability-center">
      <AeckPageHeader
        kicker="PHẠM VI HỆ THỐNG"
        title="Tất cả chức năng"
        description="Đối chiếu các nhóm chức năng trong reference với flow thật đang có trong AECK. Mỗi trạng thái đều chỉ rõ đường đi tiếp theo."
        actions={<Link className="aeck-button aeck-button-secondary aeck-button-sm" href="/admin">Về tổng quan <ArrowUpRight aria-hidden="true" /></Link>}
      />

      <div className="admin-capability-summary" aria-label="Tóm tắt phạm vi chức năng">
        <AeckStatCard label="Đang hoạt động" value={counts.ready} detail="Có API và flow trong repo" icon={<CheckCircle2 aria-hidden="true" />} tone="success" />
        <AeckStatCard label="Đã ánh xạ" value={counts.mapped} detail="Có flow tương đương, khác mô hình reference" icon={<Link2 aria-hidden="true" />} tone="info" />
        <AeckStatCard label="Chưa kết nối" value={counts.blocked} detail="Cần schema hoặc legacy auth" icon={<CircleAlert aria-hidden="true" />} tone="warning" />
        <AeckStatCard label="Tổng nhóm" value={capabilities.length} detail="Không tạo menu giả" icon={<Boxes aria-hidden="true" />} tone="neutral" />
      </div>

      <div className="admin-capability-layout">
        <nav className="admin-capability-index" aria-label="Danh mục chức năng">
          <button type="button" className={!selected ? "is-selected" : undefined} aria-current={!selected ? "page" : undefined} onClick={() => selectModule(null)}>
            <Gauge aria-hidden="true" /><span><b>Tổng quan</b><small>Ma trận parity</small></span>
          </button>
          {capabilityGroups.map(group => {
            const items = capabilities.filter(capability => capability.group === group);
            return <div className="admin-capability-index-group" key={group}>
              <h2>{group}</h2>
              {items.map(capability => <button type="button" key={capability.id} className={selected?.id === capability.id ? "is-selected" : undefined} aria-current={selected?.id === capability.id ? "page" : undefined} onClick={() => selectModule(capability.id)}>
                <capability.icon aria-hidden="true" /><span><b>{capability.title}</b><small>{statusText(capability.state)}</small></span>
              </button>)}
            </div>;
          })}
        </nav>

        {!selected ? <section className="admin-capability-overview" aria-labelledby="admin-capability-overview-title">
          <AeckSectionHeader id="admin-capability-overview-title" title="Ma trận chức năng" description="Chọn một nhóm để xem contract, flow tương đương và điểm còn thiếu." />
          <div className="admin-capability-grid">
            {capabilities.map(capability => <CapabilityCard key={capability.id} capability={capability} onSelect={() => selectModule(capability.id)} />)}
          </div>
          <AeckEmptyState icon={<ShieldCheck aria-hidden="true" />} title="Nguyên tắc tích hợp" description="Những module cần legacy JWT hoặc schema mới được giữ ở trạng thái chưa kết nối cho đến khi có contract/auth được xác nhận. Các flow hiện tại vẫn mở qua điều hướng chuẩn." />
        </section> : <CapabilityDetail capability={selected} health={health} healthLoading={healthLoading} healthError={healthError} onRetryHealth={() => void loadHealth()} onBack={() => selectModule(null)} />}
      </div>
    </div>
  );
}

function CapabilityCard({ capability, onSelect }: { capability: Capability; onSelect: () => void }) {
  const Icon = capability.icon;
  return <article className={`admin-capability-card state-${capability.state}`}>
    <button type="button" className="admin-capability-card-main" onClick={onSelect}>
      <span className="admin-capability-card-icon" aria-hidden="true"><Icon /></span>
      <span className="admin-capability-card-copy"><span className="admin-capability-card-group">{capability.group}</span><b>{capability.title}</b><small>{capability.description}</small></span>
      <AeckBadge tone={statusTone(capability.state)}>{statusText(capability.state)}</AeckBadge>
    </button>
    <div className="admin-capability-card-footer">
      <span>{capability.state === "blocked" ? "Cần backend/auth riêng" : capability.state === "mapped" ? "Dùng flow hiện tại" : "Có thể mở ngay"}</span>
      <span aria-hidden="true">→</span>
    </div>
  </article>;
}

function CapabilityDetail({ capability, health, healthLoading, healthError, onRetryHealth, onBack }: { capability: Capability; health: HealthPayload | null; healthLoading: boolean; healthError: string; onRetryHealth: () => void; onBack: () => void }) {
  const Icon = capability.icon;
  const isHealth = capability.id === "server-health";
  return <section className={`admin-capability-detail state-${capability.state}`} aria-labelledby="admin-capability-detail-title">
    <div className="admin-capability-detail-toolbar"><AeckButton onClick={onBack}>← Tất cả chức năng</AeckButton><AeckBadge tone={statusTone(capability.state)}>{statusText(capability.state)}</AeckBadge></div>
    <AeckCard className="admin-capability-detail-card">
      <div className="admin-capability-detail-heading"><span className="admin-capability-detail-icon" aria-hidden="true"><Icon /></span><div><span className="admin-capability-card-group">{capability.group}</span><h2 id="admin-capability-detail-title">{capability.title}</h2><p>{capability.description}</p></div></div>
      <p className="admin-capability-detail-copy">{capability.detail}</p>
      {capability.contract?.length ? <div className="admin-capability-contract"><h3>Contract cần xác nhận</h3><ul>{capability.contract.map(item => <li key={item}><code>{item}</code></li>)}</ul></div> : null}
      {capability.state === "blocked" ? <div className="admin-capability-blocked" role="status"><CircleAlert aria-hidden="true" /><div><b>Chức năng chưa được bật</b><p>Không có schema hoặc cơ chế xác thực đủ tin cậy trong repo hiện tại. Cần xác nhận backend/auth trước khi thêm mutation hoặc migration.</p></div></div> : null}
      {capability.path && capability.id !== "server-health" ? <Link className="aeck-button aeck-button-primary" href={capability.path}>Mở flow hiện tại <ArrowUpRight aria-hidden="true" /></Link> : null}
    </AeckCard>
    {isHealth ? <HealthPanel health={health} loading={healthLoading} error={healthError} onRetry={onRetryHealth} /> : null}
  </section>;
}

function HealthPanel({ health, loading, error, onRetry }: { health: HealthPayload | null; loading: boolean; error: string; onRetry: () => void }) {
  if (loading && !health) return <AeckLoadingState label="Đang kiểm tra Supabase và runtime integration…" />;
  if (error && !health) return <AeckErrorState description={error} onRetry={onRetry} />;
  const checks = health?.checks ?? [];
  const integrations = health?.integrations ?? [];
  return <AeckCard className="admin-health-panel" aria-live="polite">
    <AeckSectionHeader title="Tình trạng dịch vụ" description={health?.checkedAt ? `Kiểm tra lúc ${formatUiDateTime(health.checkedAt)} · ${health.latencyMs ?? 0} ms` : "Chưa có lần kiểm tra thành công"} actions={<AeckButton size="sm" onClick={onRetry} disabled={loading}><RefreshCw aria-hidden="true" />{loading ? "Đang kiểm tra…" : "Kiểm tra lại"}</AeckButton>} />
    {error ? <p className="admin-health-inline-error" role="alert"><CircleAlert aria-hidden="true" />{error}</p> : null}
    <div className="admin-health-check-list">{checks.map(check => <div className="admin-health-check" key={check.id}><span className={`admin-health-check-icon status-${check.status}`} aria-hidden="true">{check.status === "healthy" ? <CheckCircle2 /> : check.status === "degraded" ? <CircleAlert /> : <XCircle />}</span><span><b>{check.label}</b><small>{check.detail}</small></span><AeckBadge tone={healthStatusTone(check.status)}>{healthStatusText(check.status)}{typeof check.durationMs === "number" ? ` · ${check.durationMs} ms` : ""}</AeckBadge></div>)}</div>
    {integrations.length ? <div className="admin-health-integrations"><h3>Integration runtime</h3>{integrations.map(integration => <div className="admin-health-integration" key={integration.id}><span className={integration.configured ? "is-configured" : "is-missing"} aria-hidden="true" /> <span><b>{integration.label}</b><small>{integration.detail}</small></span><span>{integration.configured ? "Đã cấu hình" : "Chưa cấu hình"}</span></div>)}</div> : null}
  </AeckCard>;
}

"use client";

import { useCallback, useEffect, useState } from "react";
import { Activity, BookOpen, ClipboardCheck, Users } from "lucide-react";
import { authenticatedFetch } from "../../lib/auth-client";
import AuthGuard from "../auth-guard";
import Shell from "../shell";
import { AeckErrorState, AeckPageHeader, AeckSkeleton, AeckStatCard } from "../aeck-ui";

type Stats = { users: number; questions: number; examRooms: number; courses: number; server?: { status?: string } };

function AdminDashboardContent() {
  const [stats, setStats] = useState<Stats | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const load = useCallback(async () => {
    setLoading(true); setError("");
    try {
      const response = await authenticatedFetch("/api/dashboard/stats", { cache: "no-store" });
      const payload = await response.json() as Stats & { error?: string };
      if (!response.ok) throw new Error(payload.error || "Không thể tải số liệu quản trị.");
      setStats(payload);
    } catch (value) {
      setError(value instanceof Error ? value.message : "Không thể tải số liệu quản trị.");
    } finally { setLoading(false); }
  }, []);
  // The effect starts the initial network request; the request callback owns
  // the state updates after the external system responds.
  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { void load(); }, [load]);
  return <div className="aeck-admin-dashboard">
    <AeckPageHeader kicker="QUẢN TRỊ" title="Tổng quan hệ thống" description="Theo dõi nhanh người dùng, nội dung và tình trạng dịch vụ." />
    {loading ? <AeckSkeleton rows={4} label="Đang tải số liệu quản trị…" /> : error ? <AeckErrorState description={error} onRetry={() => void load()} /> : <div className="aeck-admin-dashboard-grid">
      <AeckStatCard label="Người dùng" value={stats?.users ?? 0} detail="Hồ sơ trong hệ thống" icon={<Users aria-hidden="true" />} tone="info" />
      <AeckStatCard label="Câu hỏi" value={stats?.questions ?? 0} detail="Kho câu hỏi khảo thí" icon={<ClipboardCheck aria-hidden="true" />} tone="danger" />
      <AeckStatCard label="Phòng thi" value={stats?.examRooms ?? 0} detail="Phòng đang quản lý" icon={<Activity aria-hidden="true" />} tone="warning" />
      <AeckStatCard label="Khóa học" value={stats?.courses ?? 0} detail="Nội dung học tập" icon={<BookOpen aria-hidden="true" />} tone="success" />
    </div>}
  </div>;
}

export default function AdminDashboardClient() {
  return <AuthGuard><Shell><AdminDashboardContent /></Shell></AuthGuard>;
}

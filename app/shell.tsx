"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { BarChart3, BookOpen, CalendarDays, ChevronLeft, ChevronRight, ClipboardCheck, LayoutDashboard, LogOut, Menu, UserRound, X } from "lucide-react";
import { supabase } from "../lib/supabase";
import { useOnlineStatus } from "../lib/use-online-status";
import { AeckNavItem } from "./aeck-ui";
import { SidebarProvider } from "./sidebar-provider";
import RealtimeSystemEvents from "./realtime-system-events";
import "./shell.css";

const navItems = [
  { href: "/dashboard", label: "Tổng quan", icon: LayoutDashboard },
  { href: "/exam-room", label: "Phòng khảo thí", icon: ClipboardCheck },
  { href: "/courses", label: "Khóa học", icon: BookOpen },
  { href: "/progress", label: "Tiến độ", icon: BarChart3 },
  { href: "/tkb", label: "Thời khóa biểu", icon: CalendarDays },
] as const;

type ShellProfile = { full_name?: string | null; role?: string | null; student_code?: string | null; email?: string | null };

function displayName(profile: ShellProfile) {
  return profile.full_name?.trim() || profile.email?.split("@")[0] || "Học viên AECK";
}

export function AvatarDropdown({ profile, onLogout }: { profile: ShellProfile; onLogout: () => void }) {
  const [open, setOpen] = useState(false);
  const name = displayName(profile);
  const initials = name.split(/\s+/).filter(Boolean).slice(-2).map(value => value[0]).join("").toUpperCase() || "AE";
  return <div className="aeck-avatar-menu">
    <button type="button" aria-haspopup="menu" aria-expanded={open} onClick={() => setOpen(value => !value)}><span aria-hidden="true">{initials}</span><b>{name}</b></button>
    {open && <div role="menu" className="aeck-avatar-menu-panel">
      <Link role="menuitem" href="/profile" onClick={() => setOpen(false)}><UserRound aria-hidden="true" /> Hồ sơ tài khoản</Link>
      <button type="button" role="menuitem" onClick={onLogout}><LogOut aria-hidden="true" /> Đăng xuất</button>
    </div>}
  </div>;
}

export function Sidebar({ collapsed, onToggle, mobileOpen, onClose }: { collapsed: boolean; onToggle: () => void; mobileOpen: boolean; onClose: () => void }) {
  const pathname = usePathname();
  return <>
    <button type="button" className={`aeck-shell-scrim ${mobileOpen ? "is-open" : ""}`} aria-label="Đóng menu" onClick={onClose} />
    <aside className={`aeck-shell-sidebar ${collapsed ? "is-collapsed" : ""} ${mobileOpen ? "is-mobile-open" : ""}`} aria-label="Điều hướng chính">
      <div className="aeck-shell-sidebar-head"><Link href="/dashboard" aria-label="Về tổng quan"><span aria-hidden="true">R</span>{!collapsed && <b>AECK</b>}</Link><button type="button" className="aeck-shell-close" onClick={onClose} aria-label="Đóng menu"><X aria-hidden="true" /></button></div>
      <nav>{navItems.map(item => { const Icon = item.icon; const active = pathname === item.href || pathname.startsWith(`${item.href}/`); return <AeckNavItem key={item.href} href={item.href} active={active} icon={<Icon aria-hidden="true" />} className="aeck-shell-nav-item">{item.label}</AeckNavItem>; })}</nav>
      <button type="button" className="aeck-shell-collapse" onClick={onToggle} aria-label={collapsed ? "Mở rộng menu" : "Thu gọn menu"}>{collapsed ? <ChevronRight aria-hidden="true" /> : <ChevronLeft aria-hidden="true" />}</button>
    </aside>
  </>;
}

export function TopNav({ profile, onLogout, onOpenMenu }: { profile: ShellProfile; onLogout: () => void; onOpenMenu: () => void }) {
  const pathname = usePathname();
  const title = useMemo(() => navItems.find(item => pathname === item.href || pathname.startsWith(`${item.href}/`))?.label ?? "AECK", [pathname]);
  return <header className="aeck-shell-topnav"><button type="button" className="aeck-shell-mobile-menu" onClick={onOpenMenu} aria-label="Mở menu"><Menu aria-hidden="true" /></button><div><span className="aeck-shell-kicker">AECK</span><h1>{title}</h1></div><AvatarDropdown profile={profile} onLogout={onLogout} /></header>;
}

export default function Shell({ children, profile = {} }: { children: ReactNode; profile?: ShellProfile }) {
  const router = useRouter();
  const online = useOnlineStatus();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [resolvedProfile, setResolvedProfile] = useState<ShellProfile>(profile);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let cancelled = false;
    void client.auth.getUser().then(async ({ data }) => {
      if (cancelled || !data.user) return;
      const fallback = { email: data.user.email ?? "" };
      const result = await client.from("profiles").select("full_name,role,student_code").eq("id", data.user.id).maybeSingle();
      if (!cancelled) setResolvedProfile({ ...fallback, ...(result.data ?? {}) });
    });
    return () => { cancelled = true; };
  }, []);
  const logout = async () => { await supabase?.auth.signOut({ scope: "local" }); router.replace("/login"); };
  return <SidebarProvider><div className={`aeck-shell ${collapsed ? "is-sidebar-collapsed" : ""}`}>
    {!online && <div className="aeck-offline-banner" role="status" aria-live="polite">Bạn đang mất kết nối — dữ liệu sẽ được lưu cục bộ khi có thể.</div>}
    <Sidebar collapsed={collapsed} onToggle={() => setCollapsed(value => !value)} mobileOpen={mobileOpen} onClose={() => setMobileOpen(false)} />
    <div className="aeck-shell-main"><TopNav profile={resolvedProfile} onLogout={logout} onOpenMenu={() => setMobileOpen(true)} /><main>{children}</main></div>
    <nav className="aeck-shell-bottom-nav" aria-label="Điều hướng nhanh">{navItems.slice(0, 4).map(item => <Link key={item.href} href={item.href}>{item.label}</Link>)}</nav>
    <RealtimeSystemEvents />
  </div></SidebarProvider>;
}

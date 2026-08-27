import { useEffect, useMemo, useRef, useState } from "react";
import {
  ChevronDown,
  ChevronLeft,
  LogOut,
  Menu,
  PanelLeftClose,
  PanelLeftOpen,
  UserRound,
  X,
} from "lucide-react";
import { Link, NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import type { AuthUser } from "@aeck/contracts";

import { signOutRemote } from "../../api/auth-api.ts";
import { hasPermission, useAuthStore } from "../../store/auth-store.ts";
import {
  adminNavigation,
  studentNavigation,
  type NavigationItem,
} from "./navigation.ts";
import "../../styles/shell.css";

type ProductShellProps = { area: "student" | "admin" };

function canShowItem(
  item: NavigationItem,
  user: AuthUser | null,
) {
  if (!item.module || !item.action) return true;
  return hasPermission(user, item.module, item.action);
}

export function ProductShell({ area }: ProductShellProps) {
  const user = useAuthStore((state) => state.user);
  const accessToken = useAuthStore((state) => state.accessToken);
  const logout = useAuthStore((state) => state.logout);
  const location = useLocation();
  const navigate = useNavigate();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [accountOpen, setAccountOpen] = useState(false);
  const accountRef = useRef<HTMLDivElement>(null);
  const mobileMenuRef = useRef<HTMLButtonElement>(null);
  const mobileSidebarRef = useRef<HTMLElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const isAdmin = area === "admin";
  const navigation = useMemo(() => {
    const items = isAdmin ? adminNavigation : studentNavigation;
    return items.filter((item) => canShowItem(item, user));
  }, [isAdmin, user]);

  useEffect(() => {
    const currentItem = navigation.find((item) =>
      item.path === "/admin" || item.path === "/dashboard"
        ? location.pathname === item.path
        : location.pathname.startsWith(item.path),
    );
    document.title = `${currentItem?.label ?? (isAdmin ? "Quản trị" : "AECK")} | AECK`;
  }, [isAdmin, location.pathname, navigation]);

  useEffect(() => {
    if (!mobileOpen) return;
    const previousOverflow = document.documentElement.style.overflow;
    document.documentElement.style.overflow = "hidden";
    mobileCloseRef.current?.focus();
    const keepFocusInside = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setMobileOpen(false);
        window.requestAnimationFrame(() => mobileMenuRef.current?.focus());
        return;
      }
      if (event.key !== "Tab" || !mobileSidebarRef.current) return;
      const focusable = Array.from(
        mobileSidebarRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable.at(-1);
      if (!first || !last) return;
      if (event.shiftKey && (document.activeElement === first || !mobileSidebarRef.current.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", keepFocusInside);
    return () => {
      document.documentElement.style.overflow = previousOverflow;
      window.removeEventListener("keydown", keepFocusInside);
    };
  }, [mobileOpen]);

  const closeMobileNavigation = () => {
    setMobileOpen(false);
    window.requestAnimationFrame(() => mobileMenuRef.current?.focus());
  };

  useEffect(() => {
    if (!accountOpen) return;
    const closeOutside = (event: PointerEvent) => {
      if (!accountRef.current?.contains(event.target as Node)) setAccountOpen(false);
    };
    window.addEventListener("pointerdown", closeOutside);
    return () => window.removeEventListener("pointerdown", closeOutside);
  }, [accountOpen]);

  const signOut = async () => {
    setAccountOpen(false);
    await signOutRemote(accessToken);
    logout();
    navigate("/login", { replace: true });
  };

  const wrapperClass = `ui-shell ${isAdmin ? "admin-app" : "student-app"} product-shell${collapsed ? " is-collapsed" : ""}`;

  return (
    <div id="aeck-platform-root" className={wrapperClass}>
      <a className="aeck-skip-link" href="#aeck-main-content">
        Bỏ qua điều hướng
      </a>
      <header className="aeck-topbar">
        <Link className="aeck-brand" to={isAdmin ? "/admin" : "/dashboard"}>
          {isAdmin ? (
            <>
              <img src="/aeck-mark.svg" alt="" width="34" height="38" />
              <span>AECK</span>
            </>
          ) : (
            <>
              <img className="aeck-brand-full" src="/aeck-wordmark.svg" alt="AECK" width="144" height="34" />
              <img className="aeck-brand-compact" src="/aeck-mark.svg" alt="AECK" width="34" height="38" />
            </>
          )}
        </Link>
        <button
          type="button"
          className="aeck-menu-button aeck-desktop-menu"
          aria-label={collapsed ? "Mở rộng thanh điều hướng" : "Thu gọn thanh điều hướng"}
          aria-pressed={collapsed}
          onClick={() => setCollapsed((value) => !value)}
        >
          <Menu aria-hidden="true" />
        </button>
        <button
          ref={mobileMenuRef}
          type="button"
          className="aeck-menu-button aeck-mobile-menu"
          aria-label="Mở điều hướng"
          aria-controls="aeck-sidebar"
          aria-expanded={mobileOpen}
          onClick={() => setMobileOpen(true)}
        >
          <Menu aria-hidden="true" />
        </button>
        <div className="aeck-account" ref={accountRef}>
          <button
            type="button"
            className="aeck-account-trigger"
            aria-haspopup="menu"
            aria-expanded={accountOpen}
            onClick={() => setAccountOpen((value) => !value)}
          >
            <span className="aeck-account-avatar" aria-hidden="true">
              <UserRound />
            </span>
            <span className="aeck-account-name">
              {isAdmin ? "Quản trị AECK" : user?.username}
            </span>
            <ChevronDown aria-hidden="true" />
          </button>
          {accountOpen ? (
            <div className="aeck-account-menu" role="menu">
              <Link to={isAdmin ? "/admin/profile" : "/profile"} role="menuitem" onClick={() => setAccountOpen(false)}>
                <UserRound aria-hidden="true" />
                Hồ sơ
              </Link>
              <button type="button" role="menuitem" onClick={signOut}>
                <LogOut aria-hidden="true" />
                Đăng xuất
              </button>
            </div>
          ) : null}
        </div>
      </header>

      {mobileOpen ? (
        <button
          type="button"
          className="aeck-sidebar-scrim"
          aria-label="Đóng điều hướng"
          onClick={closeMobileNavigation}
        />
      ) : null}

      <aside
        ref={mobileSidebarRef}
        id="aeck-sidebar"
        className={`aeck-sidebar${mobileOpen ? " is-mobile-open" : ""}`}
        aria-label={isAdmin ? "Điều hướng quản trị" : "Điều hướng học tập"}
      >
        <div className="aeck-sidebar-mobile-head">
          <span>Điều hướng</span>
          <button
            ref={mobileCloseRef}
            type="button"
            aria-label="Đóng điều hướng"
            onClick={closeMobileNavigation}
          >
            <X aria-hidden="true" />
          </button>
        </div>
        <nav className="aeck-navigation">
          {navigation.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.path}
                to={item.path}
                end={item.path === "/admin" || item.path === "/dashboard"}
                title={collapsed ? item.label : undefined}
                onClick={() => {
                  setMobileOpen(false);
                  setAccountOpen(false);
                }}
              >
                <Icon aria-hidden="true" />
                <span>{item.label}</span>
              </NavLink>
            );
          })}
        </nav>
        <button
          type="button"
          className="aeck-sidebar-collapse"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? <PanelLeftOpen aria-hidden="true" /> : <PanelLeftClose aria-hidden="true" />}
          <span>{collapsed ? "Mở rộng" : "Thu gọn menu"}</span>
          {!collapsed ? <ChevronLeft aria-hidden="true" /> : null}
        </button>
      </aside>

      <main id="aeck-main-content" className="aeck-main" tabIndex={-1}>
        <Outlet />
      </main>
    </div>
  );
}

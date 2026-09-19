"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { Session } from "@supabase/supabase-js";
import {
  adminPermissionUserFromMetadata,
  canAccessAdminPermission,
  permissionsForUser,
  type AdminPermissionKey,
} from "../lib/admin-permissions";
import { supabase } from "../lib/supabase";
import { authUserFromSupabaseUser, useAuthStore } from "../lib/auth-store";
import { isActiveProfileState } from "../lib/active-profile";
import { AeckErrorState, AeckLoadingState } from "./aeck-ui";

type AuthGuardProps = {
  children: ReactNode;
  requiredRole?: "admin";
  requiredPermission?: AdminPermissionKey;
};

export default function AuthGuard({ children, requiredRole, requiredPermission }: AuthGuardProps) {
  const router = useRouter();
  const pathname = usePathname();
  const requiresAdmin = requiredRole === "admin" || requiredPermission !== undefined;
  const validationScope = `${pathname}:${requiredRole ?? "session"}:${requiredPermission ?? "none"}`;
  const [ready, setReady] = useState(!supabase && !requiresAdmin);
  const [validatedScope, setValidatedScope] = useState<string | null>(() => !supabase && !requiresAdmin ? validationScope : null);
  const login = useAuthStore(state => state.login);
  const logout = useAuthStore(state => state.logout);
  useEffect(() => {
    const client = supabase;
    if (!client) return;
    let cancelled = false;
    let validationId = 0;

    const acceptSession = async (session: Session | null) => {
      const currentValidation = ++validationId;
      setReady(false);
      setValidatedScope(null);
      if (!session) {
        if (cancelled) return;
        const returnTo = `${pathname}${window.location.search}`;
        router.replace(`/login?returnTo=${encodeURIComponent(returnTo)}`);
        return;
      }

      let storeUser = authUserFromSupabaseUser(session.user);
      if (requiresAdmin) {
        const [claimsResult, profileResult] = await Promise.all([
          client.auth.getClaims(session.access_token).catch(() => ({ data: null, error: new Error("claims_unavailable") })),
          client.from("profiles").select("role,status,account_status,banned_until").eq("id", session.user.id).maybeSingle(),
        ]);
        if (cancelled || currentValidation !== validationId) return;
        const claims = claimsResult.data?.claims;
        const profile = profileResult.data as { role?: string | null; status?: string | null; account_status?: string | null; banned_until?: string | null } | null;
        const activeAdmin = !profileResult.error
          && claims?.sub === session.user.id
          && profile?.role === "admin"
          && isActiveProfileState(profile);
        if (!activeAdmin) {
          setReady(false);
          setValidatedScope(null);
          router.replace("/dashboard");
          return;
        }
        const permissionUser = adminPermissionUserFromMetadata(profile.role, claims?.app_metadata);
        if (requiredPermission && !canAccessAdminPermission(permissionUser, requiredPermission)) {
          setReady(false);
          setValidatedScope(null);
          router.replace(`/admin?permissionDenied=${encodeURIComponent(requiredPermission)}`);
          return;
        }
        storeUser = {
          ...storeUser,
          role: profile.role,
          isSuperAdmin: permissionUser.isSuperAdmin === true,
          adminPermissions: permissionUser.adminPermissions === undefined
            ? undefined
            : permissionsForUser(permissionUser),
        };
      }

      if (cancelled || currentValidation !== validationId) return;
      login({ token: session.access_token, refreshToken: session.refresh_token }, storeUser);
      setValidatedScope(validationScope);
      setReady(true);
    };

    void client.auth.getSession()
      .then(({ data }) => acceptSession(data.session))
      .catch(() => {
        if (!cancelled) {
          setReady(false);
          setValidatedScope(null);
          router.replace(`/login?returnTo=${encodeURIComponent(pathname)}`);
        }
    });
    const { data: listener } = client.auth.onAuthStateChange((_event, session) => {
      if (!session) void logout({ silent: true, skipAuthProvider: true });
      // Auth callbacks run under Supabase's internal session lock. Defer any
      // validation that calls Auth/PostgREST until the callback has returned.
      window.setTimeout(() => {
        if (!cancelled) void acceptSession(session);
      }, 0);
    });
    return () => { cancelled = true; listener.subscription.unsubscribe(); };
  }, [login, logout, pathname, requiredPermission, requiredRole, requiresAdmin, router, validationScope]);
  if (!supabase && requiresAdmin) {
    return <AeckErrorState title="Không thể xác minh quyền quản trị" description="Dịch vụ tài khoản chưa được cấu hình cho trang quản trị này." />;
  }
  if (!ready || validatedScope !== validationScope) return <AeckLoadingState label="Đang kiểm tra phiên đăng nhập…" />;
  return <>{children}</>;
}

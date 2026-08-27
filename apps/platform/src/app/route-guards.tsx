import type { PermissionAction } from "@aeck/contracts";
import type { ProductArea } from "./access-policy.ts";
import { Navigate, Outlet, useLocation } from "react-router-dom";

import { canAccessArea, canAccessModule, homePathForRole } from "./access-policy.ts";
import { useAuthStore } from "../store/auth-store.ts";

export function RequireSession({ area }: { area: ProductArea }) {
  const user = useAuthStore((state) => state.user);
  const isAuthenticated = useAuthStore((state) => state.isAuthenticated);
  const location = useLocation();

  if (!isAuthenticated || !user) {
    return (
      <Navigate
        to="/login"
        replace
        state={{ returnTo: `${location.pathname}${location.search}` }}
      />
    );
  }
  if (!canAccessArea(user.role, area)) {
    return <Navigate to={homePathForRole(user.role)} replace />;
  }
  return <Outlet />;
}

export function RequireModule({
  moduleName,
  action = "read",
}: {
  moduleName: string;
  action?: PermissionAction;
}) {
  const user = useAuthStore((state) => state.user);
  if (!user) return <Navigate to="/login" replace />;
  if (!canAccessModule(user, moduleName, action)) {
    return <Navigate to={user.role === "ctv" ? "/admin/profile" : homePathForRole(user.role)} replace />;
  }
  return <Outlet />;
}

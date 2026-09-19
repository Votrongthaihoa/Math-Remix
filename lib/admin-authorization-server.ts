import type { SupabaseClient } from "@supabase/supabase-js";

import {
  adminPermissionUserFromMetadata,
  canAccessAdminPermission,
  type AdminPermissionKey,
  type AdminPermissionUser,
} from "./admin-permissions.ts";
import { ensureActiveAccount } from "./security-server.ts";

const privateHeaders = {
  "cache-control": "private, no-store, max-age=0",
  "x-content-type-options": "nosniff",
};

/**
 * Converts only Auth-owned app_metadata into the shape understood by the
 * shared permission model. User-editable profile metadata must never reach
 * this authorization path.
 */
export function adminPermissionUserFromAppMetadata(
  appMetadata: unknown,
  role?: string | null,
): AdminPermissionUser {
  const permissionUser = adminPermissionUserFromMetadata(role, appMetadata);
  return {
    ...permissionUser,
    adminPermissions: permissionUser.adminPermissions ?? [],
  };
}

function forbiddenResponse(permission: AdminPermissionKey, missingAdminRole: boolean) {
  return Response.json(
    missingAdminRole
      ? { error: "Bạn không có quyền quản trị.", code: "ADMIN_ROLE_REQUIRED" }
      : {
          error: "Bạn chưa được cấp quyền quản trị chức năng này.",
          code: "ADMIN_PERMISSION_REQUIRED",
          requiredPermission: permission,
        },
    { status: 403, headers: privateHeaders },
  );
}

export async function ensureAdminPermission(
  request: Request,
  permission: AdminPermissionKey,
  admin?: SupabaseClient,
) {
  const security = await ensureActiveAccount(request, admin);
  if (!security.ok) return security;

  if (security.profile.role !== "admin") {
    return { ok: false as const, response: forbiddenResponse(permission, true) };
  }

  const permissionUser = adminPermissionUserFromAppMetadata(security.user.app_metadata, security.profile.role);
  if (!canAccessAdminPermission(permissionUser, permission)) {
    return { ok: false as const, response: forbiddenResponse(permission, false) };
  }

  return { ...security, permission };
}

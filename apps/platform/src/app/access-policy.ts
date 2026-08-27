import type {
  PermissionAction,
  PermissionGrant,
  Role,
} from "@aeck/contracts";

export type ProductArea = "student" | "admin";

export function homePathForRole(role: Role) {
  if (role === "admin") return "/admin";
  if (role === "ctv") return "/admin/question-bank";
  return "/dashboard";
}

export function canAccessArea(role: Role, area: ProductArea) {
  return area === "student" ? role === "student" : role !== "student";
}

export function canAccessModule(
  user: { role: Role; permissions: PermissionGrant[] },
  moduleName: string,
  action: PermissionAction,
) {
  if (user.role === "admin") return true;
  if (user.role === "student") return false;
  return user.permissions.some(
    (grant) =>
      grant.module === moduleName &&
      (grant.actions.includes(action) || grant.actions.includes("manage")),
  );
}

export const ADMIN_PERMISSION_KEYS = [
  "question-bank", "exams", "exam-rooms", "users", "ctv", "courses", "exam-results",
  "evidence-registration", "subscription-packages", "shipments", "tkb", "ilearn",
  "system-admin", "server-health", "finance",
] as const;

export type AdminPermissionKey = typeof ADMIN_PERMISSION_KEYS[number];
export type AdminPermissionUser = { role?: string | null; isSuperAdmin?: boolean; adminPermissions?: unknown };

const allowed = new Set<string>(ADMIN_PERMISSION_KEYS);
const aliases: Record<string, AdminPermissionKey> = { question_bank: "question-bank", exam_rooms: "exam-rooms", exam_results: "exam-results", system_admin: "system-admin", server_health: "server-health", evidence: "evidence-registration", subscriptions: "subscription-packages" };

export function normalizeAdminPermission(value: unknown): AdminPermissionKey | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim().toLocaleLowerCase("en-US");
  const candidate = aliases[normalized] ?? normalized;
  return allowed.has(candidate) ? candidate as AdminPermissionKey : null;
}

export function permissionsForUser(user: AdminPermissionUser | null | undefined) {
  if (!user || !Array.isArray(user.adminPermissions)) return [] as AdminPermissionKey[];
  return Array.from(new Set(user.adminPermissions.map(normalizeAdminPermission).filter((value): value is AdminPermissionKey => Boolean(value))));
}

export function canAccessAdminPermission(user: AdminPermissionUser | null | undefined, permission: AdminPermissionKey) {
  if (!user) return false;
  if (user.isSuperAdmin === true) return true;
  return permissionsForUser(user).includes(permission);
}

export function canAccessAllAdminPermissions(
  user: AdminPermissionUser | null | undefined,
  permissions: readonly AdminPermissionKey[],
) {
  return permissions.every(permission => canAccessAdminPermission(user, permission));
}

function metadataRecord(value: unknown): Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
}

/**
 * Reads authorization claims from Auth-owned app_metadata only. Callers must
 * pass the role established by the profiles gate; user_metadata is never an
 * authorization source.
 */
export function adminPermissionUserFromMetadata(
  role: string | null | undefined,
  appMetadata: unknown,
): AdminPermissionUser {
  const metadata = metadataRecord(appMetadata);
  const hasSnakeCasePermissions = Object.prototype.hasOwnProperty.call(metadata, "admin_permissions");
  const hasCamelCasePermissions = Object.prototype.hasOwnProperty.call(metadata, "adminPermissions");
  const hasSnakeCaseSuperAdmin = Object.prototype.hasOwnProperty.call(metadata, "is_super_admin");
  const snakeCasePermissions = Array.isArray(metadata.admin_permissions) ? metadata.admin_permissions : [];
  const camelCasePermissions = Array.isArray(metadata.adminPermissions) ? metadata.adminPermissions : [];

  const permissionUser: AdminPermissionUser = {
    // snake_case is the canonical claim shape. When it is present, an older
    // camelCase alias must not be able to undo a revocation.
    isSuperAdmin: hasSnakeCaseSuperAdmin
      ? metadata.is_super_admin === true
      : metadata.isSuperAdmin === true,
    adminPermissions: hasSnakeCasePermissions
      ? snakeCasePermissions
      : hasCamelCasePermissions
        ? camelCasePermissions
      : undefined,
  };
  if (role !== undefined) permissionUser.role = role;
  return permissionUser;
}

const routePermissions: Array<[string, AdminPermissionKey]> = [
  ["/admin/question-bank", "question-bank"], ["/admin/exams", "exams"],
  ["/admin/sessions", "exam-rooms"], ["/admin/timetable", "tkb"],
  ["/admin/students", "users"], ["/admin/enrollments", "users"],
  ["/admin/content", "courses"], ["/admin/hls-vault", "courses"], ["/admin/upload", "courses"],
  ["/admin/security", "system-admin"], ["/admin/audit", "system-admin"],
  ["/admin/capabilities", "system-admin"],
  ["/admin/server-health", "server-health"],
  ["/question-bank", "question-bank"], ["/item", "question-bank"], ["/exam-management", "exams"],
  ["/exam-room-management", "exam-rooms"], ["/assessment-management", "exam-rooms"],
  ["/exam-result-management", "exam-results"], ["/irt-exam-management", "exam-results"],
  ["/user-management", "users"], ["/group-user-management", "users"], ["/course-management", "courses"],
  ["/media-management", "courses"], ["/ilearn-management", "ilearn"], ["/tkb-management", "tkb"],
  ["/evidence-registration-management", "evidence-registration"], ["/shipment-management", "shipments"],
  ["/subscription-package-management", "subscription-packages"], ["/admin-log", "system-admin"],
  ["/watermark-trace", "system-admin"], ["/server-health", "server-health"],
];

export function permissionForRoute(pathname: string): AdminPermissionKey | null {
  const normalized = pathname.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  return routePermissions.find(([prefix]) => normalized === prefix || normalized.startsWith(`${prefix}/`))?.[1] ?? null;
}

/**
 * Some nested admin workflows call APIs owned by more than one permission
 * domain. Keep their route gate explicit so a menu-level permission does not
 * advertise a screen that will immediately fail its first required request.
 */
export function requiredPermissionsForAdminRoute(pathname: string): AdminPermissionKey[] {
  const normalized = pathname.split(/[?#]/, 1)[0].replace(/\/{2,}/g, "/").replace(/\/$/, "") || "/";
  if (normalized === "/admin/sessions/new") return ["exam-rooms", "exams"];
  if (/^\/admin\/sessions\/[^/]+\/results$/.test(normalized)) return ["exam-rooms", "exam-results", "exams"];
  const permission = permissionForRoute(normalized);
  return permission ? [permission] : [];
}

export function canAccessAdminRoute(
  user: AdminPermissionUser | null | undefined,
  pathname: string,
) {
  const permissions = requiredPermissionsForAdminRoute(pathname);
  return permissions.length > 0 && canAccessAllAdminPermissions(user, permissions);
}

import { z } from "zod";

export const RoleSchema = z.enum(["student", "admin", "ctv"]);
export type Role = z.infer<typeof RoleSchema>;

export const PermissionActionSchema = z.enum([
  "create",
  "read",
  "update",
  "delete",
  "review",
  "publish",
  "manage",
]);
export type PermissionAction = z.infer<typeof PermissionActionSchema>;

export const PermissionGrantSchema = z.object({
  module: z.string().trim().min(1),
  actions: z.array(PermissionActionSchema).min(1),
});
export type PermissionGrant = z.infer<typeof PermissionGrantSchema>;

export const AuthUserSchema = z.object({
  id: z.string().trim().min(1),
  username: z.string().trim().min(1),
  email: z.email(),
  role: RoleSchema,
  studentCode: z.string().trim().min(1).optional(),
  permissions: z.array(PermissionGrantSchema).default([]),
});
export type AuthUser = z.infer<typeof AuthUserSchema>;

export const SignupRequestSchema = z.object({
  email: z.string().trim().toLowerCase().pipe(z.email()),
  password: z.string().min(8).max(128),
  fullName: z.string().trim().min(1).max(120),
  turnstileToken: z.string().trim().min(1).max(2048),
});
export type SignupRequest = z.infer<typeof SignupRequestSchema>;

export const SignupResultSchema = z.object({
  email: z.email(),
  verificationRequired: z.literal(true),
});
export type SignupResult = z.infer<typeof SignupResultSchema>;

export const ApiErrorCodeSchema = z.enum([
  "AUTH_REQUIRED",
  "FORBIDDEN",
  "INVALID_REQUEST",
  "NOT_FOUND",
  "CONFLICT",
  "EDIT_CONFLICT",
  "RATE_LIMITED",
  "UPSTREAM_UNAVAILABLE",
  "INTERNAL_ERROR",
]);
export type ApiErrorCode = z.infer<typeof ApiErrorCodeSchema>;

export const ApiErrorSchema = z.object({
  code: ApiErrorCodeSchema,
  message: z.string().trim().min(1),
  recoverable: z.boolean(),
  details: z.record(z.string(), z.unknown()).optional(),
});
export type ApiError = z.infer<typeof ApiErrorSchema>;

export function createApiResultSchema<TSchema extends z.ZodType>(
  dataSchema: TSchema,
) {
  return z.discriminatedUnion("ok", [
    z.object({
      ok: z.literal(true),
      data: dataSchema,
    }),
    z.object({
      ok: z.literal(false),
      error: ApiErrorSchema,
    }),
  ]);
}

export type ApiResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: ApiError };

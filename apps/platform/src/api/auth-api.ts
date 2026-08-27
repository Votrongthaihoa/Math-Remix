import {
  AuthUserSchema,
  PermissionGrantSchema,
  RoleSchema,
  type AuthUser,
} from "@aeck/contracts";
import { z } from "zod";

import { isCompiledPreviewSessionEnabled } from "./preview-session.ts";

const SupabasePasswordResponseSchema = z.object({
  access_token: z.string().min(1),
  user: z.object({
    id: z.string().min(1),
    email: z.email().optional(),
    app_metadata: z.record(z.string(), z.unknown()).optional(),
    user_metadata: z.record(z.string(), z.unknown()).optional(),
  }),
});

function previewUser(role: "student" | "admin" | "ctv"): AuthUser {
  return AuthUserSchema.parse({
    id: `${role}-preview-user`,
    username: role === "admin" ? "Quản trị AECK" : "Nguyễn Minh Anh",
    email: role === "admin" ? "admin@aeck.vn" : "minhanh@example.vn",
    role,
    studentCode: role === "student" ? "HS-2026-001" : undefined,
    permissions:
      role === "ctv"
        ? [{ module: "question-bank", actions: ["read", "review"] }]
        : [],
  });
}

export function isPreviewSessionEnabled() {
  return isCompiledPreviewSessionEnabled(
    __AECK_PREVIEW_DATA__,
    import.meta.env.VITE_USE_MOCK_SESSION,
  );
}

export function getPreviewSession() {
  if (!isPreviewSessionEnabled()) return null;
  const role = RoleSchema.catch("student").parse(import.meta.env.VITE_PREVIEW_ROLE);
  return { token: `preview-${role}-token`, user: previewUser(role) };
}

export async function signInWithPassword(email: string, password: string) {
  const preview = getPreviewSession();
  if (preview) return preview;

  const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!supabaseUrl || !publishableKey) {
    throw new Error("Hệ thống đăng nhập chưa được cấu hình cho workspace mới.");
  }

  const response = await fetch(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      "content-type": "application/json",
    },
    body: JSON.stringify({ email, password }),
  });
  if (!response.ok) {
    throw new Error(
      response.status === 400
        ? "Email hoặc mật khẩu không chính xác."
        : "Không thể đăng nhập lúc này. Vui lòng thử lại.",
    );
  }

  const payload = SupabasePasswordResponseSchema.parse(await response.json());
  const appMetadata = payload.user.app_metadata ?? {};
  const userMetadata = payload.user.user_metadata ?? {};
  const role = RoleSchema.catch("student").parse(appMetadata.role ?? userMetadata.role);
  const permissionResult = z
    .array(PermissionGrantSchema)
    .safeParse(appMetadata.permissions);
  const resolvedEmail = payload.user.email ?? email;
  const user = AuthUserSchema.parse({
    id: payload.user.id,
    username:
      typeof userMetadata.full_name === "string" && userMetadata.full_name.trim()
        ? userMetadata.full_name
        : resolvedEmail.split("@")[0],
    email: resolvedEmail,
    role,
    studentCode:
      typeof userMetadata.student_code === "string"
        ? userMetadata.student_code
        : undefined,
    permissions: permissionResult.success ? permissionResult.data : [],
  });

  return { token: payload.access_token, user };
}

export async function signOutRemote(accessToken: string | null) {
  const supabaseUrl = import.meta.env.NEXT_PUBLIC_SUPABASE_URL?.replace(/\/$/, "");
  const publishableKey = import.meta.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!accessToken || !supabaseUrl || !publishableKey || isPreviewSessionEnabled()) return;
  await fetch(`${supabaseUrl}/auth/v1/logout`, {
    method: "POST",
    headers: {
      apikey: publishableKey,
      authorization: `Bearer ${accessToken}`,
    },
  }).catch(() => undefined);
}

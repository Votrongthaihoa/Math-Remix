// Single source of truth for "may this user touch this lesson resource".
//
// Deliberately dependency-free: no Supabase, no R2, no Request/Response. The
// caller gathers the facts, this decides. That is what makes it unit testable,
// and it is why the rule now lives in one place instead of being re-typed into
// every content route (which is how resource-content ended up missing the
// enrollment and allow_download checks entirely).

export type ResourceAccessMode = "view" | "download";

export type ResourceAccessContext = {
  isAdmin: boolean;
  accountActive: boolean;
  enrolled: boolean;
  lessonPublished: boolean;
  allowDownload: boolean;
  mode: ResourceAccessMode;
};

export type ResourceAccessDenial =
  | "ACCOUNT_INACTIVE"
  | "LESSON_UNPUBLISHED"
  | "NOT_ENROLLED"
  | "DOWNLOAD_NOT_ALLOWED";

export type ResourceAccessDecision =
  | { allowed: true }
  | { allowed: false; reason: ResourceAccessDenial; status: number; message: string };

// Kept identical to the wording the routes already returned, so tightening the
// checks does not change what a student reads on screen.
const denials: Record<ResourceAccessDenial, { status: number; message: string }> = {
  ACCOUNT_INACTIVE: { status: 423, message: "Tài khoản đang bị khoá." },
  LESSON_UNPUBLISHED: { status: 403, message: "Bài học chưa được xuất bản." },
  NOT_ENROLLED: { status: 403, message: "Bạn chưa được phân khóa học này." },
  DOWNLOAD_NOT_ALLOWED: { status: 403, message: "Tài liệu này không được phép tải xuống." },
};

function deny(reason: ResourceAccessDenial): ResourceAccessDecision {
  return { allowed: false, reason, ...denials[reason] };
}

export function checkResourceAccess(context: ResourceAccessContext): ResourceAccessDecision {
  // A banned account loses content access whatever its role, so this is checked
  // ahead of the admin bypass.
  if (!context.accountActive) return deny("ACCOUNT_INACTIVE");

  // Admins author the content: they read drafts they are not enrolled in and
  // download resources that are closed to students.
  if (context.isAdmin) return { allowed: true };

  if (!context.lessonPublished) return deny("LESSON_UNPUBLISHED");
  if (!context.enrolled) return deny("NOT_ENROLLED");

  // allow_download gates taking a copy away, never reading in the viewer.
  if (context.mode === "download" && !context.allowDownload) return deny("DOWNLOAD_NOT_ALLOWED");

  return { allowed: true };
}

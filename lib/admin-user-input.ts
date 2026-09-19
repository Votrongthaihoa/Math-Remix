const emailPattern = /^[^\s@]+@[^\s@]+$/u;
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const adminUserMaxEmailLength = 320;
export const adminUserMaxNameLength = 120;
export const adminUserMinPasswordLength = 8;
export const adminUserMaxPasswordBytes = 72;

type ValidationFailure = { ok: false; code: string; error: string };

export type AdminUserCreateInput = {
  email: string;
  password: string;
  fullName: string;
};

export type AdminUserPasswordInput = {
  userId: string;
  password: string;
};

export type ValidationResult<T> = { ok: true; value: T } | ValidationFailure;

function failure(code: string, error: string): ValidationFailure {
  return { ok: false, code, error };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function codePointLength(value: string) {
  return Array.from(value).length;
}

function normalizeEmail(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") return failure("INVALID_EMAIL", "Email học viên không hợp lệ.");
  const email = value.trim();
  if (!email || email.length > adminUserMaxEmailLength || !emailPattern.test(email)) {
    return failure("INVALID_EMAIL", "Email học viên không hợp lệ hoặc quá dài.");
  }
  return { ok: true, value: email };
}

function normalizeName(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") return failure("INVALID_FULL_NAME", "Họ và tên học viên không hợp lệ.");
  const fullName = value.trim().replace(/\s+/gu, " ");
  const length = codePointLength(fullName);
  if (length < 2 || length > adminUserMaxNameLength) {
    return failure("INVALID_FULL_NAME", "Họ và tên phải từ 2 đến 120 ký tự.");
  }
  return { ok: true, value: fullName };
}

function validatePassword(value: unknown): ValidationResult<string> {
  if (typeof value !== "string") return failure("INVALID_PASSWORD", "Mật khẩu phải là chuỗi ký tự.");
  const length = codePointLength(value);
  const bytes = new TextEncoder().encode(value).byteLength;
  if (length < adminUserMinPasswordLength) return failure("PASSWORD_TOO_SHORT", "Mật khẩu phải có ít nhất 8 ký tự.");
  if (bytes > adminUserMaxPasswordBytes) return failure("PASSWORD_TOO_LONG", "Mật khẩu không được vượt quá 72 byte.");
  return { ok: true, value };
}

export function isAdminUserUuid(value: unknown): value is string {
  return typeof value === "string" && uuidPattern.test(value);
}

export function parseAdminUserCreateInput(value: unknown): ValidationResult<AdminUserCreateInput> {
  if (!isRecord(value)) return failure("INVALID_BODY", "Dữ liệu tài khoản không hợp lệ.");
  const email = normalizeEmail(value.email);
  if (!email.ok) return email;
  const fullName = normalizeName(value.fullName);
  if (!fullName.ok) return fullName;
  const password = validatePassword(value.password);
  if (!password.ok) return password;
  return { ok: true, value: { email: email.value, fullName: fullName.value, password: password.value } };
}

export function parseAdminUserPasswordInput(value: unknown): ValidationResult<AdminUserPasswordInput> {
  if (!isRecord(value) || !isAdminUserUuid(value.userId)) return failure("INVALID_USER_ID", "Mã học viên không hợp lệ.");
  const password = validatePassword(value.password);
  if (!password.ok) return password;
  return { ok: true, value: { userId: value.userId, password: password.value } };
}

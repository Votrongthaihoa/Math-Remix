export function isCompiledPreviewSessionEnabled(
  previewBuild: boolean,
  previewFlag: string | undefined,
) {
  return previewBuild && previewFlag === "true";
}

export function shouldAutoStartPreviewSession(autoStartFlag: string | undefined) {
  return autoStartFlag === "true";
}

export function resolvePreviewRole<T extends "student" | "admin" | "ctv">(
  configuredRole: T,
  requestedRole: T | undefined,
) {
  return requestedRole ?? configuredRole;
}

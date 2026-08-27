export function isCompiledPreviewSessionEnabled(
  previewBuild: boolean,
  previewFlag: string | undefined,
) {
  return previewBuild && previewFlag === "true";
}

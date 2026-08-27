const DEFAULT_LEGACY_ORIGIN = "https://mathremix.pro.vn";

export function legacyUrl(path: string) {
  const configured = import.meta.env.VITE_LEGACY_APP_ORIGIN?.trim();
  const origin = configured || DEFAULT_LEGACY_ORIGIN;
  try {
    return new URL(path, origin).toString();
  } catch {
    return new URL(path, DEFAULT_LEGACY_ORIGIN).toString();
  }
}

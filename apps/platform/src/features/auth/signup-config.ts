type SignupConfigInput = {
  enabled?: string;
  previewCompiled: boolean;
  siteKey?: string;
};

export type SignupConfig =
  | { enabled: false; mode: "disabled"; siteKey: null }
  | { enabled: true; mode: "preview"; siteKey: null }
  | { enabled: true; mode: "turnstile"; siteKey: string }
  | { enabled: true; mode: "unavailable"; siteKey: null };

export function resolveSignupConfig(input: SignupConfigInput): SignupConfig {
  if (input.enabled !== "true") {
    return { enabled: false, mode: "disabled", siteKey: null };
  }
  if (input.previewCompiled) {
    return { enabled: true, mode: "preview", siteKey: null };
  }
  const siteKey = input.siteKey?.trim();
  if (siteKey) {
    return { enabled: true, mode: "turnstile", siteKey };
  }
  return { enabled: true, mode: "unavailable", siteKey: null };
}
